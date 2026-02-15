#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const STATUS_LABELS = [
  "status-backlog",
  "status-ready",
  "status-in-progress",
  "status-in-review",
  "status-done",
];

const PRIORITY_SCORE = {
  "priority-high": 300,
  "priority-medium": 200,
  "priority-low": 100,
};

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const start = args.includes("--start") || args.includes("-s");
const assignMe = args.includes("--assign-me") || args.includes("-a");
const includeInProgress = args.includes("--include-in-progress");
const jsonOutput = args.includes("--json");

let requiredLabel = null;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--label") {
    requiredLabel = args[i + 1] ?? null;
    break;
  }
}

function runGhJson(commandArgs) {
  const result = spawnSync("gh", commandArgs, { encoding: "utf-8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "gh command failed\n");
    process.exit(result.status ?? 1);
  }
  return JSON.parse(result.stdout);
}

function hasAnyLabel(labels, names) {
  return labels.some((l) => names.includes(l.name));
}

const issues = runGhJson([
  "issue",
  "list",
  "--state",
  "open",
  "--limit",
  "300",
  "--json",
  "number,title,labels,updatedAt,url,assignees",
]);

const candidates = issues
  .filter((issue) => {
    if (requiredLabel && !issue.labels.some((l) => l.name === requiredLabel)) {
      return false;
    }
    if (issue.labels.some((l) => l.name === "status-done")) {
      return false;
    }
    if (!includeInProgress && hasAnyLabel(issue.labels, ["status-in-progress", "status-in-review"])) {
      return false;
    }
    return true;
  })
  .map((issue) => {
    const labels = issue.labels.map((l) => l.name);
    const priority = labels.find((name) => PRIORITY_SCORE[name]) ?? "priority-low";
    const score = PRIORITY_SCORE[priority] ?? 0;
    return {
      ...issue,
      labels,
      score,
    };
  })
  .sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  });

if (candidates.length === 0) {
  if (jsonOutput) {
    console.log(JSON.stringify({ found: false }));
  } else {
    console.log("No candidate issue found.");
  }
  process.exit(0);
}

const top = candidates[0];
if (jsonOutput) {
  console.log(
    JSON.stringify({
      found: true,
      number: top.number,
      title: top.title,
      url: top.url,
      labels: top.labels,
      score: top.score,
    }),
  );
} else {
  console.log(`#${top.number} ${top.title}`);
  console.log(top.url);
  console.log(`labels: ${top.labels.join(", ")}`);
}

if (start) {
  const startArgs = ["scripts/issue-start.mjs", String(top.number)];
  if (assignMe) {
    startArgs.push("--assign-me");
  }
  const startResult = spawnSync("node", startArgs, { stdio: "inherit" });
  process.exit(startResult.status ?? 1);
}

if (!jsonOutput) {
  console.log("Run: pnpm run issue:start -- " + top.number + (assignMe ? " --assign-me" : ""));
}
