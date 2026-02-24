/**
 * Weekly Retro Generator
 *
 * Automatically generates weekly retrospective documents based on
 * session data, analyzing achievements, failures, and improvements.
 */

import type { SessionData, StatsData } from "@/hooks/useStats";
import {
	analyzeBreakEffectivenessCycles,
	loadBreakResponseProfiles,
	saveBreakResponseProfiles,
} from "@/utils/break-effectiveness";

export interface WeeklyRetroData {
	weekStart: string;
	weekEnd: string;
	sessions: SessionData[];
	stats: StatsData;
}

export interface RetroSection {
	title: string;
	items: string[];
}

export interface WeeklyRetro {
	title: string;
	period: string;
	summary: string;
	achievements: RetroSection;
	challenges: RetroSection;
	improvements: RetroSection;
	nextWeekGoals: RetroSection;
	rawMarkdown: string;
}

/**
 * Calculate project distribution from sessions
 */
function getProjectDistribution(
	sessions: SessionData[],
): Array<{ project: string; minutes: number; percentage: number }> {
	const projectMinutes: Record<string, number> = {};
	let totalMinutes = 0;

	for (const session of sessions) {
		if (session.step_type === "focus") {
			const project = session.project_name || "Uncategorized";
			projectMinutes[project] = (projectMinutes[project] || 0) + session.duration_min;
			totalMinutes += session.duration_min;
		}
	}

	return Object.entries(projectMinutes)
		.map(([project, minutes]) => ({
			project,
			minutes,
			percentage: totalMinutes > 0 ? Math.round((minutes / totalMinutes) * 100) : 0,
		}))
		.sort((a, b) => b.minutes - a.minutes);
}

/**
 * Analyze daily patterns
 */
function getDailyPatterns(sessions: SessionData[]): Record<string, number> {
	const dayMinutes: Record<string, number> = {
		Mon: 0,
		Tue: 0,
		Wed: 0,
		Thu: 0,
		Fri: 0,
		Sat: 0,
		Sun: 0,
	};

	for (const session of sessions) {
		if (session.step_type === "focus") {
			const date = new Date(session.completed_at);
			const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
			dayMinutes[dayName] += session.duration_min;
		}
	}

	return dayMinutes;
}

/**
 * Identify peak productivity day
 */
function getPeakDay(dayMinutes: Record<string, number>): string {
	let peakDay = "Mon";
	let peakMinutes = 0;

	for (const [day, minutes] of Object.entries(dayMinutes)) {
		if (minutes > peakMinutes) {
			peakMinutes = minutes;
			peakDay = day;
		}
	}

	return peakDay;
}

/**
 * Calculate session completion rate
 */
function getSessionStats(sessions: SessionData[]): {
	total: number;
	focus: number;
	break: number;
	avgFocusDuration: number;
} {
	const focus = sessions.filter((s) => s.step_type === "focus").length;
	const breakCount = sessions.filter((s) => s.step_type === "break").length;
	const focusSessions = sessions.filter((s) => s.step_type === "focus");
	const totalFocusMinutes = focusSessions.reduce((sum, s) => sum + s.duration_min, 0);

	return {
		total: sessions.length,
		focus,
		break: breakCount,
		avgFocusDuration: focus > 0 ? Math.round(totalFocusMinutes / focus) : 0,
	};
}

/**
 * Format minutes to human-readable string
 */
function formatDuration(minutes: number): string {
	if (minutes < 60) {
		return `${minutes}分`;
	}
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return mins > 0 ? `${hours}時間${mins}分` : `${hours}時間`;
}

/**
 * Generate weekly retrospective
 */
export function generateWeeklyRetro(data: WeeklyRetroData): WeeklyRetro {
	const { weekStart, weekEnd, sessions, stats } = data;

	const projectDistribution = getProjectDistribution(sessions);
	const dailyPatterns = getDailyPatterns(sessions);
	const peakDay = getPeakDay(dailyPatterns);
	const sessionStats = getSessionStats(sessions);
	const breakAnalysis = analyzeBreakEffectivenessCycles(sessions);
	const mergedProfiles = {
		...loadBreakResponseProfiles(),
		...breakAnalysis.profiles,
	};
	saveBreakResponseProfiles(mergedProfiles);

	// Format date range
	const formatDate = (dateStr: string) => {
		const d = new Date(dateStr);
		return `${d.getMonth() + 1}/${d.getDate()}`;
	};
	const periodStr = `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;

	// Generate achievements
	const achievements: string[] = [
		`📊 合計フォーカス時間: ${formatDuration(stats.totalFocusMinutes)}`,
		`✅ 完了セッション数: ${sessionStats.focus}回`,
		`🏆 ピークパフォーマンス: ${peakDay}曜日`,
	];

	// Add top projects
	if (projectDistribution.length > 0) {
		const topProject = projectDistribution[0];
		achievements.push(
			`🎯 最も取り組んだプロジェクト: ${topProject.project} (${formatDuration(topProject.minutes)})`,
		);
	}

	// Generate challenges
	const challenges: string[] = [];

	// Check for low activity days
	const lowActivityDays = Object.entries(dailyPatterns)
		.filter(([, minutes]) => minutes === 0)
		.map(([day]) => day);

	if (lowActivityDays.length > 0) {
		challenges.push(`📉 活動なし: ${lowActivityDays.join(", ")}曜日`);
	}

	// Check break ratio
	if (sessionStats.focus > 0) {
		const breakRatio = sessionStats.break / sessionStats.focus;
		if (breakRatio < 0.2) {
			challenges.push("⚠️ 休憩が少ない傾向 - 定期的な休憩を推奨");
		}
	}

	// Check for short sessions
	if (sessionStats.avgFocusDuration < 20 && sessionStats.focus > 0) {
		challenges.push("⏱️ 平均セッション時間が短め - 集中時間の延長を検討");
	}

	if (challenges.length === 0) {
		challenges.push("✨ 特筆すべき課題はありません - 順調な週でした");
	}

	// Generate improvements
	const improvements: string[] = [];

	if (projectDistribution.length > 3) {
		improvements.push("📌 プロジェクト数が多め - 優先度の高いものに集中することを検討");
	}

	if (dailyPatterns.Sat > 0 || dailyPatterns.Sun > 0) {
		improvements.push("💪 週末も活動的 - ワークライフバランスを意識");
	}

	if (stats.totalFocusMinutes > 1200) {
		// 20+ hours
		improvements.push("🔥 非常に高い生産性 - 継続的な休息も大切に");
	}

	improvements.push("📈 次週も継続して記録を活用し、改善を続けましょう");
	if (breakAnalysis.topPatterns.length > 0) {
		const top = breakAnalysis.topPatterns[0];
		if (top) {
			improvements.push(
				`🧪 休憩効果: ${top.label} が最も有効 (平均スコア ${top.score.toFixed(2)})`,
			);
		}
	}

	// Generate next week goals based on data
	const nextWeekGoals: string[] = [
		`目標フォーカス時間: ${formatDuration(Math.max(stats.totalFocusMinutes, 600))}`,
		"毎日のセッション記録を継続",
		"定期的な休憩の実施",
	];

	if (projectDistribution.length > 0) {
		nextWeekGoals.push(`優先プロジェクト: ${projectDistribution[0].project}の推進`);
	}

	// Generate summary
	const summary = `今週は${sessionStats.focus}回のフォーカスセッションで合計${formatDuration(stats.totalFocusMinutes)}活動しました。${peakDay}曜日が最も生産的でした。`;

	// Generate raw markdown
	const rawMarkdown = `# 週次振り返り

**期間**: ${periodStr}

## サマリー

${summary}

## 成果 🎉

${achievements.map((a) => `- ${a}`).join("\n")}

## 課題 🔍

${challenges.map((c) => `- ${c}`).join("\n")}

## 改善点 💡

${improvements.map((i) => `- ${i}`).join("\n")}

## 来週の目標 🎯

${nextWeekGoals.map((g) => `- ${g}`).join("\n")}

---

### プロジェクト別時間

${projectDistribution
	.slice(0, 5)
	.map((p) => `- **${p.project}**: ${formatDuration(p.minutes)} (${p.percentage}%)`)
	.join("\n")}

### 曜日別活動

| 曜日 | フォーカス時間 |
|------|---------------|
${Object.entries(dailyPatterns)
	.map(([day, mins]) => `| ${day} | ${formatDuration(mins)} |`)
	.join("\n")}

### 休憩効果パターン

${
	breakAnalysis.topPatterns.length > 0
		? breakAnalysis.topPatterns
				.map(
					(pattern) =>
						`- ${pattern.label}: 平均スコア ${pattern.score.toFixed(2)} (${pattern.occurrences}回)`,
				)
				.join("\n")
		: "- データ不足（focus→break→focus の完了サイクルが必要）"
}

---
*Generated by Pomodoroom on ${new Date().toLocaleDateString("ja-JP")}*
`;

	return {
		title: `週次振り返り (${periodStr})`,
		period: periodStr,
		summary,
		achievements: { title: "成果", items: achievements },
		challenges: { title: "課題", items: challenges },
		improvements: { title: "改善点", items: improvements },
		nextWeekGoals: { title: "来週の目標", items: nextWeekGoals },
		rawMarkdown,
	};
}

/**
 * Get week range for a given date
 */
export function getWeekRange(date: Date): { start: string; end: string } {
	const d = new Date(date);
	const day = d.getDay();
	const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
	d.setDate(diff);
	const start = new Date(d);
	d.setDate(d.getDate() + 6);
	const end = new Date(d);

	const formatDate = (dt: Date) => dt.toISOString().slice(0, 10);
	return { start: formatDate(start), end: formatDate(end) };
}

/**
 * Copy retro to clipboard
 */
export async function copyRetroToClipboard(retro: WeeklyRetro): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(retro.rawMarkdown);
		return true;
	} catch {
		return false;
	}
}
