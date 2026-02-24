#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const rawArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const issueToken = rawArgs.find((arg) => /^\d+$/.test(arg));

if (!issueToken) {
	console.error("Usage: pnpm run issue:start -- <issue-number> [--no-checkout]");
	process.exit(1);
}

const noCheckout = rawArgs.some((arg) => arg === "--no-checkout" || arg === "-n");
const assignMe = rawArgs.some((arg) => arg === "--assign-me" || arg === "-a");
let branchSuffix = null;
for (let i = 0; i < rawArgs.length; i += 1) {
	if (rawArgs[i] === "--branch-suffix") {
		branchSuffix = rawArgs[i + 1] ?? null;
		break;
	}
}
const psArgs = [
	"-ExecutionPolicy",
	"Bypass",
	"-File",
	"scripts/issue-start.ps1",
	"-IssueNumber",
	issueToken,
];

if (noCheckout) {
	psArgs.push("-NoCheckout");
}
if (assignMe) {
	psArgs.push("-AssignMe");
}
if (branchSuffix) {
	psArgs.push("-BranchSuffix", branchSuffix);
}

const result = spawnSync("powershell", psArgs, { stdio: "inherit", shell: false });
process.exit(result.status ?? 1);
