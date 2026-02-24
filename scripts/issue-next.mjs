#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import os from "node:os";
import crypto from "node:crypto";

const _STATUS_LABELS = [
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
const claim = args.includes("--claim");

let requiredLabel = null;
let agentId = process.env.AUTOPILOT_AGENT_ID || `${os.hostname()}-${process.pid}`;
let claimTtlMin = 240;
for (let i = 0; i < args.length; i += 1) {
	if (args[i] === "--label") {
		requiredLabel = args[i + 1] ?? null;
		i += 1;
		continue;
	}
	if (args[i] === "--agent-id") {
		agentId = args[i + 1] ?? agentId;
		i += 1;
		continue;
	}
	if (args[i] === "--claim-ttl-min") {
		const parsed = Number(args[i + 1] ?? claimTtlMin);
		if (Number.isFinite(parsed) && parsed > 0) {
			claimTtlMin = parsed;
		}
		i += 1;
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

function runGh(commandArgs) {
	const result = spawnSync("gh", commandArgs, { encoding: "utf-8" });
	if (result.status !== 0) {
		process.stderr.write(result.stderr || "gh command failed\n");
		process.exit(result.status ?? 1);
	}
	return result.stdout;
}

function hasAnyLabel(labels, names) {
	return labels.some((l) => names.includes(l.name));
}

function parseClaim(body) {
	if (typeof body !== "string") return null;
	const m = body.match(/^AUTOPILOT_CLAIM\s+agent=([^\s]+)\s+token=([^\s]+)\s+at=([^\s]+)$/);
	if (!m) return null;
	return {
		agent: m[1],
		token: m[2],
		declaredAt: m[3],
	};
}

function claimIssue(issueNumber) {
	const claimAt = new Date().toISOString();
	const token = `${agentId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
	const body = `AUTOPILOT_CLAIM agent=${agentId} token=${token} at=${claimAt}`;
	runGh(["issue", "comment", String(issueNumber), "--body", body]);

	const issue = runGhJson(["issue", "view", String(issueNumber), "--json", "comments"]);
	const now = Date.now();
	const ttlMs = claimTtlMin * 60 * 1000;
	const claims = (issue.comments ?? [])
		.map((comment) => {
			const parsed = parseClaim(comment.body);
			if (!parsed) return null;
			return {
				...parsed,
				createdAt: comment.createdAt,
			};
		})
		.filter((c) => c !== null)
		.filter((c) => now - Date.parse(c.createdAt) <= ttlMs)
		.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

	const winner = claims[0] ?? null;
	return {
		token,
		claimed: winner !== null && winner.token === token,
		winner,
	};
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
		if (
			!includeInProgress &&
			hasAnyLabel(issue.labels, ["status-in-progress", "status-in-review"])
		) {
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

let top = null;
let claimInfo = null;

if (!claim) {
	top = candidates[0];
} else {
	for (const candidate of candidates) {
		const result = claimIssue(candidate.number);
		if (result.claimed) {
			top = candidate;
			claimInfo = result;
			break;
		}
	}
}

if (!top) {
	if (jsonOutput) {
		console.log(JSON.stringify({ found: false, reason: "claim-conflict" }));
	} else {
		console.log("No claimable candidate issue found.");
	}
	process.exit(0);
}

if (jsonOutput) {
	console.log(
		JSON.stringify({
			found: true,
			number: top.number,
			title: top.title,
			url: top.url,
			labels: top.labels,
			score: top.score,
			claimed: Boolean(claim),
			agentId: claim ? agentId : undefined,
			claimToken: claimInfo?.token,
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
	console.log(`Run: pnpm run issue:start -- ${top.number}${assignMe ? " --assign-me" : ""}`);
}
