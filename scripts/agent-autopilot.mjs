#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function run(command, args, options = {}) {
  if (options.dryRun) {
    console.log(`[dry-run] ${command} ${args.join(" ")}`);
    return { status: 0, stdout: "", stderr: "" };
  }
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    stdio: options.capture ? "pipe" : "inherit",
    cwd: process.cwd(),
  });

  if ((result.status ?? 1) !== 0) {
    if (options.capture) {
      process.stderr.write(result.stdout || "");
      process.stderr.write(result.stderr || "");
    }
    fail(`Command failed: ${command} ${args.join(" ")}`);
  }

  return result;
}

function readConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    fail(`Config file not found: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(`Invalid JSON: ${configPath}\n${String(err)}`);
  }
}

function parseIssueFromPath(filePath) {
  const base = path.basename(filePath);
  const m = base.match(/^(\d+)-/);
  return m ? Number(m[1]) : null;
}

function sanitizeBranchSuffix(value) {
  const cleaned = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned) return null;
  return cleaned.slice(0, 24);
}

function resolveTargetIssue(config, configPath, runtime = {}) {
  if (Number.isInteger(config.issueNumber) && config.issueNumber > 0) {
    return config.issueNumber;
  }

  if (config.issueSelector?.type === "next") {
    const args = ["scripts/issue-next.mjs", "--json"];
    if (config.issueSelector.label) {
      args.push("--label", config.issueSelector.label);
    }
    if (config.issueSelector.includeInProgress) {
      args.push("--include-in-progress");
    }
    if (runtime.claimIssue !== false) {
      args.push("--claim");
      if (runtime.agentId) {
        args.push("--agent-id", runtime.agentId);
      }
      if (Number.isFinite(runtime.claimTtlMin) && runtime.claimTtlMin > 0) {
        args.push("--claim-ttl-min", String(runtime.claimTtlMin));
      }
    }
    const result = run("node", args, { capture: true });
    const json = JSON.parse(result.stdout || "{}");
    if (!json.found || !json.number) {
      fail("No issue candidate found by selector.");
    }
    return Number(json.number);
  }

  if (config.issueSelector?.type === "from-path") {
    const sourcePath = config.issuePath
      ? path.resolve(process.cwd(), config.issuePath)
      : configPath;
    const parsed = parseIssueFromPath(sourcePath);
    if (parsed) return parsed;
  }

  fail("No issue target resolved. Set issueNumber or issueSelector.type.");
}

function buildStartArgs(issueNumber, cfg, branchSuffix) {
  const args = ["scripts/issue-start.mjs", String(issueNumber)];
  if (cfg.noCheckout) args.push("--no-checkout");
  if (cfg.assignMe) args.push("--assign-me");
  if (branchSuffix) args.push("--branch-suffix", branchSuffix);
  return args;
}

function buildPrArgs(issueNumber, cfg) {
  const args = ["scripts/issue-pr.mjs", String(issueNumber)];
  if (cfg.base) args.push("--base", cfg.base);
  if (cfg.draft !== false) args.push("--draft");
  return args;
}

function runChecks(commands, dryRun) {
  for (const cmd of commands) {
    run("powershell", ["-ExecutionPolicy", "Bypass", "-Command", cmd], { dryRun });
  }
}

function currentBranch(dryRun) {
  if (dryRun) return "issue-dry-run";
  const result = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { capture: true });
  return (result.stdout || "").trim();
}

function findPr(head, base, dryRun) {
  if (dryRun) {
    return { number: 0, url: "https://example.invalid/pr/0" };
  }
  const result = run(
    "gh",
    [
      "pr",
      "list",
      "--head",
      head,
      "--base",
      base,
      "--state",
      "open",
      "--limit",
      "1",
      "--json",
      "number,url,isDraft",
    ],
    { capture: true },
  );
  const list = JSON.parse(result.stdout || "[]");
  if (!Array.isArray(list) || list.length === 0) {
    fail(`No open PR found for head '${head}' against base '${base}'.`);
  }
  return list[0];
}

function waitForChecks(prNumber, intervalSec, dryRun) {
  run("gh", ["pr", "checks", String(prNumber), "--watch", "--interval", String(intervalSec)], { dryRun });
}

function ensureChecksClean(prNumber, dryRun) {
  if (dryRun) return;
  const result = run("gh", ["pr", "view", String(prNumber), "--json", "statusCheckRollup"], { capture: true });
  const pr = JSON.parse(result.stdout || "{}");
  const checks = Array.isArray(pr.statusCheckRollup) ? pr.statusCheckRollup : [];

  for (const check of checks) {
    if (check.__typename === "CheckRun") {
      const status = check.status;
      const conclusion = check.conclusion;
      const allowed = conclusion === "SUCCESS" || conclusion === "SKIPPED" || conclusion === "NEUTRAL";
      if (status !== "COMPLETED" || !allowed) {
        fail(`Check not clean: ${check.name} (status=${status}, conclusion=${conclusion})`);
      }
      continue;
    }
    if (check.__typename === "StatusContext") {
      if (check.state !== "SUCCESS") {
        fail(`Status context not clean: ${check.context} (state=${check.state})`);
      }
    }
  }
}

function ensureMergeable(prNumber, dryRun) {
  if (dryRun) return;
  const result = run(
    "gh",
    ["pr", "view", String(prNumber), "--json", "state,isDraft,mergeable,mergeStateStatus"],
    { capture: true },
  );
  const pr = JSON.parse(result.stdout || "{}");
  if (pr.state !== "OPEN") {
    fail(`PR #${prNumber} is not open (state=${pr.state}).`);
  }
  if (pr.isDraft) {
    run("gh", ["pr", "ready", String(prNumber)]);
  }
  if (pr.mergeable === "CONFLICTING") {
    fail(`PR #${prNumber} has merge conflicts.`);
  }
  if (pr.mergeStateStatus && pr.mergeStateStatus !== "CLEAN" && pr.mergeStateStatus !== "HAS_HOOKS") {
    fail(`PR #${prNumber} merge state is not clean (${pr.mergeStateStatus}).`);
  }
}

function mergePr(prNumber, cfg, dryRun) {
  const method = cfg.mergeMethod || "squash";
  const methodFlag = method === "merge" || method === "rebase" ? `--${method}` : "--squash";
  const args = ["pr", "merge", String(prNumber), methodFlag];
  if (cfg.deleteBranch !== false) {
    args.push("--delete-branch");
  }
  run("gh", args, { dryRun });
}

function writeLog(logPath, content) {
  const dir = path.dirname(logPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(logPath, content, "utf-8");
}

const cliArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const argPath = cliArgs[0];
if (!argPath) {
  fail("Usage: pnpm run autopilot -- <config-path>");
}

const configPath = path.resolve(process.cwd(), argPath);
const config = readConfig(configPath);
const dryRun = Boolean(config.dryRun);
const flowCfg = config.flow || {};
const agentId = config.agentId || process.env.AUTOPILOT_AGENT_ID || `${os.hostname()}-${process.pid}`;
const branchSuffix = flowCfg.branchSuffixFromAgent === false ? null : sanitizeBranchSuffix(agentId);
const claimIssue = flowCfg.claimIssue !== false;
const claimTtlMin = Number.isFinite(flowCfg.claimTtlMin) ? Number(flowCfg.claimTtlMin) : 240;

const startedAt = new Date().toISOString();
const steps = [];

if (config.bootstrap?.ensureLabels) {
  run("node", ["scripts/issue-ensure-labels.mjs"], { dryRun });
  steps.push("ensure-labels");
}

if (config.bootstrap?.normalizePriority) {
  run("node", ["scripts/issue-normalize-priority.mjs"], { dryRun });
  steps.push("normalize-priority");
}

const issueNumber = resolveTargetIssue(config, configPath, {
  claimIssue,
  agentId,
  claimTtlMin,
});
steps.push(`issue:${issueNumber}`);

if (flowCfg.start !== false) {
  run("node", buildStartArgs(issueNumber, flowCfg, branchSuffix), { dryRun });
  steps.push("start");
}

if (flowCfg.runChecks) {
  const commands = Array.isArray(flowCfg.checkCommands) && flowCfg.checkCommands.length > 0
    ? flowCfg.checkCommands
    : [
        "pnpm run check",
        "cargo test -p pomodoroom-core",
        "cargo test -p pomodoroom-cli -- --test-threads=1",
      ];
  runChecks(commands, dryRun);
  steps.push("checks");
}

if (flowCfg.createPr) {
  run("node", buildPrArgs(issueNumber, flowCfg), { dryRun });
  steps.push("pr");
}

if (flowCfg.mergePr) {
  const base = flowCfg.base || "main";
  const head = currentBranch(dryRun);
  const pr = findPr(head, base, dryRun);

  if (flowCfg.waitForChecks !== false) {
    const interval = Number.isInteger(flowCfg.checkPollIntervalSec) ? flowCfg.checkPollIntervalSec : 15;
    waitForChecks(pr.number, interval, dryRun);
  }

  if (flowCfg.requireCleanChecks !== false) {
    ensureChecksClean(pr.number, dryRun);
  }

  ensureMergeable(pr.number, dryRun);
  mergePr(pr.number, flowCfg, dryRun);
  steps.push(`merge-pr:${pr.number}`);
}

const finishedAt = new Date().toISOString();

if (config.output?.logFile) {
  const log = [
    `# Autopilot Run`,
    ``,
    `- Config: ${argPath}`,
    `- Issue: #${issueNumber}`,
    `- Started: ${startedAt}`,
    `- Finished: ${finishedAt}`,
    `- Steps: ${steps.join(", ")}`,
    ``,
    `Status: success`,
  ].join("\n");
  writeLog(path.resolve(process.cwd(), config.output.logFile), log);
}

console.log(`Autopilot complete for issue #${issueNumber}.`);
