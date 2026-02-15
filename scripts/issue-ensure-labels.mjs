#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const LABELS = [
  { name: "status-backlog", color: "d4c5f9", description: "Queued but not started" },
  { name: "status-ready", color: "bfdadc", description: "Ready to be picked" },
  { name: "status-in-progress", color: "fbca04", description: "Implementation in progress" },
  { name: "status-in-review", color: "0e8a16", description: "PR open and under review" },
  { name: "status-done", color: "5319e7", description: "Merged or completed" },
  { name: "size-xs", color: "c2e0c6", description: "Up to 1 hour" },
  { name: "size-s", color: "7fdbb6", description: "Up to 1 day" },
  { name: "size-m", color: "1d76db", description: "2-3 days" },
  { name: "size-l", color: "0052cc", description: "4+ days" }
];

function run(args, silent = false) {
  const result = spawnSync("gh", args, {
    encoding: "utf-8",
    stdio: silent ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.status !== 0) {
    if (silent) {
      process.stderr.write(result.stderr || "gh command failed\n");
    }
    throw new Error(`gh ${args.join(" ")} failed`);
  }
  return result.stdout;
}

const existing = JSON.parse(run(["label", "list", "--limit", "500", "--json", "name"], true));
const names = new Set(existing.map((item) => item.name));

for (const label of LABELS) {
  if (names.has(label.name)) {
    continue;
  }
  run([
    "label",
    "create",
    label.name,
    "--color",
    label.color,
    "--description",
    label.description,
  ]);
}

console.log("Label sync complete.");