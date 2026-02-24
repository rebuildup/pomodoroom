#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const priorities = ["priority-high", "priority-medium", "priority-low"];

function runGh(args, { json = false } = {}) {
	const result = spawnSync("gh", args, { encoding: "utf-8" });
	if (result.status !== 0) {
		process.stderr.write(result.stderr || "gh command failed\n");
		process.exit(result.status ?? 1);
	}
	return json ? JSON.parse(result.stdout) : result.stdout;
}

const issues = runGh(
	["issue", "list", "--state", "open", "--limit", "300", "--json", "number,labels"],
	{ json: true },
);

let changed = 0;

for (const issue of issues) {
	const existing = issue.labels.map((l) => l.name).filter((name) => priorities.includes(name));
	if (existing.length <= 1) {
		continue;
	}

	const keep = priorities.find((name) => existing.includes(name));
	const remove = existing.filter((name) => name !== keep);
	if (!keep || remove.length === 0) {
		continue;
	}

	runGh([
		"issue",
		"edit",
		String(issue.number),
		"--add-label",
		keep,
		...remove.flatMap((name) => ["--remove-label", name]),
	]);
	changed += 1;
}

console.log(`Priority normalization complete. Updated ${changed} issue(s).`);
