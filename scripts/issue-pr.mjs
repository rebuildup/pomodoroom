#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const rawArgs = process.argv.slice(2).filter((arg) => arg !== "--");

let issueNumber = null;
let base = "main";
let draft = false;

for (let i = 0; i < rawArgs.length; i += 1) {
  const arg = rawArgs[i];
  if (/^\d+$/.test(arg) && issueNumber === null) {
    issueNumber = arg;
    continue;
  }
  if (arg === "--draft") {
    draft = true;
    continue;
  }
  if (arg === "--base") {
    base = rawArgs[i + 1] ?? "main";
    i += 1;
    continue;
  }
}

const psArgs = [
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  "scripts/issue-pr.ps1",
  "-Base",
  base,
];

if (issueNumber !== null) {
  psArgs.push("-IssueNumber", issueNumber);
}
if (draft) {
  psArgs.push("-Draft");
}

const result = spawnSync("powershell", psArgs, { stdio: "inherit", shell: false });
process.exit(result.status ?? 1);