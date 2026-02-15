#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
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

function resolveTargetIssue(config, configPath) {
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

function buildStartArgs(issueNumber, cfg) {
  const args = ["scripts/issue-start.mjs", String(issueNumber)];
  if (cfg.noCheckout) args.push("--no-checkout");
  if (cfg.assignMe) args.push("--assign-me");
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

const issueNumber = resolveTargetIssue(config, configPath);
steps.push(`issue:${issueNumber}`);

if (config.flow?.start !== false) {
  run("node", buildStartArgs(issueNumber, config.flow || {}), { dryRun });
  steps.push("start");
}

if (config.flow?.runChecks) {
  const commands = Array.isArray(config.flow.checkCommands) && config.flow.checkCommands.length > 0
    ? config.flow.checkCommands
    : [
        "pnpm run check",
        "cargo test -p pomodoroom-core",
        "cargo test -p pomodoroom-cli -- --test-threads=1",
      ];
  runChecks(commands, dryRun);
  steps.push("checks");
}

if (config.flow?.createPr) {
  run("node", buildPrArgs(issueNumber, config.flow || {}), { dryRun });
  steps.push("pr");
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
