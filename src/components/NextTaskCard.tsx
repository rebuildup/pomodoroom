import { useState } from "react";
import { Icon } from "@/components/m3/Icon";
import type { TaskStreamItem } from "@/types/taskstream";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type EnergyLevel = "low" | "medium" | "high";

export interface SuggestedTask {
	task: TaskStreamItem;
	confidence: number; // 0-100
	reasons: string[];
	fitsTimeSlot: boolean;
	energyMatch: boolean;
}

interface NextTaskCardProps {
	/** Available tasks to suggest from */
	tasks: TaskStreamItem[];
	/** Current energy level (affects task type matching) */
	energyLevel?: EnergyLevel;
	/** Available time in minutes */
	timeAvailable?: number;
	/** Called when user accepts the suggestion */
	onStart: (task: TaskStreamItem) => void;
	/** Called when user skips to next suggestion */
	onSkip: () => void;
	className?: string;
}

// ─── Suggestion Algorithm ──────────────────────────────────────────────────────

/**
 * Energy level affects task type preference:
 * - Low: routine, simple, short tasks
 * - Medium: regular tasks, moderate complexity
 * - High: complex, creative, deep work tasks
 */
const ENERGY_PREFERENCES: Record<EnergyLevel, { maxMinutes: number; complexityBonus: number }> = {
	low: { maxMinutes: 30, complexityBonus: -20 },
	medium: { maxMinutes: 60, complexityBonus: 0 },
	high: { maxMinutes: 120, complexityBonus: 20 },
};

function calculateConfidence(
	task: TaskStreamItem,
	energyLevel: EnergyLevel,
	timeAvailable: number | undefined
): { confidence: number; reasons: string[]; fitsTimeSlot: boolean; energyMatch: boolean } {
	const preferences = ENERGY_PREFERENCES[energyLevel];
	let score = 50; // Base score
	const reasons: string[] = [];
	const fitsTimeSlot = timeAvailable === undefined || task.estimatedMinutes <= timeAvailable;
	const energyMatch = task.estimatedMinutes <= preferences.maxMinutes;

	// Time fit check
	if (fitsTimeSlot) {
		score += 20;
		reasons.push(`Fits available time (${task.estimatedMinutes}m)`);
	} else {
		score -= 30;
		reasons.push(`Exceeds available time by ${task.estimatedMinutes - (timeAvailable ?? 0)}m`);
	}

	// Energy level match
	if (energyMatch) {
		score += 15;
		reasons.push(`Matches current energy level`);
	} else {
		score -= 10;
	}

	// Priority boost (based on interrupt count and tags)
	if (task.interruptCount > 0) {
		score += 10 * task.interruptCount;
		reasons.push(`Interrupted ${task.interruptCount}x - needs completion`);
	}

	// Tag-based preferences
	if (task.tags.includes("urgent")) {
		score += 25;
		reasons.push("Marked as urgent");
	}
	if (task.tags.includes("quick") && energyLevel === "low") {
		score += 15;
		reasons.push("Quick win for low energy");
	}
	if (task.tags.includes("deep") && energyLevel === "high") {
		score += 20;
		reasons.push("Deep work matches high energy");
	}

	// Project diversity (simplified - would need context of recent tasks)
	if (task.tags.includes("focus")) {
		score += 10;
		reasons.push("Marked as focus task");
	}

	// Penalties
	if (task.tags.includes("waiting")) {
		score -= 30;
		reasons.push("Blocked/Waiting");
	}

	// Normalize to 0-100
	const confidence = Math.max(0, Math.min(100, score));

	return { confidence, reasons, fitsTimeSlot, energyMatch };
}

/**
 * Suggest the next best task based on current context
 */
export function suggestNextTask(
	tasks: TaskStreamItem[],
	energyLevel: EnergyLevel = "medium",
	timeAvailable?: number
): SuggestedTask | null {
	// Filter out tasks that are not in "plan" status
	const planTasks = tasks.filter((t) => t.status === "plan");

	if (planTasks.length === 0) return null;

	// Calculate confidence for each task
	const scored = planTasks.map((task) => {
		const result = calculateConfidence(task, energyLevel, timeAvailable);
		return {
			task,
			confidence: result.confidence,
			reasons: result.reasons,
			fitsTimeSlot: result.fitsTimeSlot,
			energyMatch: result.energyMatch,
		};
	});

	// Sort by confidence
	scored.sort((a, b) => b.confidence - a.confidence);

	// Return top suggestion if it has reasonable confidence
	const top = scored[0];
	if (!top || top.confidence < 30) return null;

	return top;
}

// ─── UI Components ─────────────────────────────────────────────────────────────

function ConfidenceMeter({ confidence }: { confidence: number }) {
	const getColor = () => {
		if (confidence >= 80) return "bg-green-500";
		if (confidence >= 60) return "bg-blue-500";
		if (confidence >= 40) return "bg-yellow-500";
		return "bg-gray-500";
	};

	const getLabel = () => {
		if (confidence >= 80) return "Great match";
		if (confidence >= 60) return "Good fit";
		if (confidence >= 40) return "Fair choice";
		return "Consider";
	};

	return (
		<div className="flex items-center gap-2">
			<div className="flex-1 h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
				<div
					className={`h-full transition-all duration-500 ${getColor()}`}
					style={{ width: `${confidence}%` }}
				/>
			</div>
			<span className="text-xs text-gray-400 whitespace-nowrap">{getLabel()}</span>
		</div>
	);
}

function EnergyPicker({
	value,
	onChange,
}: {
	value: EnergyLevel;
	onChange: (level: EnergyLevel) => void;
}) {
	const levels: { key: EnergyLevel; icon: typeof Zap; label: string; color: string }[] = [
		{ key: "low", icon: Zap, label: "Low", color: "text-yellow-500" },
		{ key: "medium", icon: Sparkles, label: "Medium", color: "text-blue-400" },
		{ key: "high", icon: Zap, label: "High", color: "text-purple-400" },
	];

	return (
		<div className="flex items-center gap-1">
			{levels.map(({ key, icon: Icon, label, color }) => (
				<button
					key={key}
					type="button"
					onClick={() => onChange(key)}
					className={`p-1.5 rounded transition-all ${
						value === key
							? `${color} bg-white/10`
							: "text-gray-500 hover:text-gray-400 hover:bg-white/5"
					}`}
					title={`Energy: ${label}`}
				>
					<Icon size={16} />
				</button>
			))}
		</div>
	);
}

function WhyTooltip({ reasons }: { reasons: string[] }) {
	const [show, setShow] = useState(false);

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setShow(!show)}
				className="p-1 text-gray-500 hover:text-gray-400 transition-colors"
				title="Why this task?"
			>
				<Icon name="info" size={14} />
			</button>
			{show && (
				<>
					<div
						className="fixed inset-0 z-10"
						onClick={() => setShow(false)}
					/>
					<div className="absolute right-0 top-full mt-2 w-56 bg-gray-800 border border-gray-700 rounded-lg p-3 z-20 shadow-xl">
						<h4 className="text-xs font-semibold text-gray-300 mb-2">Why this task?</h4>
						<ul className="space-y-1">
							{reasons.map((reason, i) => (
								<li key={i} className="text-xs text-gray-400 flex items-start gap-2">
									<span className="text-gray-500">•</span>
									<span>{reason}</span>
								</li>
							))}
						</ul>
					</div>
				</>
			)}
		</div>
	);
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export function NextTaskCard({
	tasks,
	energyLevel = "medium",
	timeAvailable,
	onStart,
	onSkip,
	className = "",
}: NextTaskCardProps) {
	const [currentEnergy, setCurrentEnergy] = useState<EnergyLevel>(energyLevel);

	// Get suggestion
	const suggestion = suggestNextTask(tasks, currentEnergy, timeAvailable);

	// Handle skip (cycle to next task)
	const handleSkip = () => {
		onSkip();
	};

	// Handle start
	const handleStart = () => {
		if (suggestion) {
			onStart(suggestion.task);
		}
	};

	if (!suggestion) {
		return (
			<div className={`bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 ${className}`}>
				<div className="flex items-center gap-3 text-gray-500">
					<Icon name="auto_awesome" size={16} />
					<span className="text-sm">No task suggestions available</span>
				</div>
			</div>
		);
	}

	const { task, confidence, reasons, fitsTimeSlot, energyMatch } = suggestion;

	return (
		<div
			className={`bg-gradient-to-br from-gray-800 to-gray-800/50 border ${
				fitsTimeSlot && energyMatch
					? "border-blue-500/30 shadow-lg shadow-blue-500/10"
					: "border-gray-700/50"
			} rounded-lg p-4 ${className}`}
		>
			{/* Header */}
			<div className="flex items-start justify-between gap-3 mb-3">
				<div className="flex items-center gap-2">
					<Sparkles
						size={16}
						className={confidence >= 70 ? "text-blue-400" : "text-gray-500"}
					/>
					<span className="text-sm font-semibold text-gray-300">What's next?</span>
				</div>
				<div className="flex items-center gap-2">
					<EnergyPicker value={currentEnergy} onChange={setCurrentEnergy} />
					<WhyTooltip reasons={reasons} />
				</div>
			</div>

			{/* Task Title */}
			<h3 className="text-base font-medium text-white mb-2">{task.title}</h3>

			{/* Confidence Meter */}
			<div className="mb-3">
				<ConfidenceMeter confidence={confidence} />
			</div>

			{/* Task Meta */}
			<div className="flex items-center gap-3 mb-4 text-xs text-gray-500">
				<span className="flex items-center gap-1">
					⏱ {task.estimatedMinutes}m
					{!fitsTimeSlot && (
						<span className="text-orange-400">(exceeds available)</span>
					)}
				</span>
				{task.projectId && <span>📁 {task.projectId}</span>}
				{task.tags.length > 0 && (
					<span className="flex items-center gap-1">
						{task.tags.slice(0, 2).map((tag) => (
							<span
								key={tag}
								className="px-1.5 py-0.5 bg-gray-700/50 rounded text-gray-400"
							>
								#{tag}
							</span>
						))}
					</span>
				)}
			</div>

			{/* Actions */}
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={handleStart}
					className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg transition-colors font-medium"
				>
					<Icon name="play_arrow" size={16} />
					Start Now
				</button>
				<button
					type="button"
					onClick={handleSkip}
					className="flex items-center gap-1 px-3 py-2 border border-gray-700 hover:bg-gray-700/50 text-gray-400 hover:text-gray-300 rounded-lg transition-colors"
					title="Show next suggestion"
				>
					<Icon name="skip_next" size={16} />
				</button>
			</div>
		</div>
	);
}

// ─── Compact Version ───────────────────────────────────────────────────────────

interface NextTaskCardCompactProps {
	suggestion: SuggestedTask;
	onStart: (task: TaskStreamItem) => void;
	onSkip: () => void;
}

export function NextTaskCardCompact({
	suggestion,
	onStart,
	onSkip,
}: NextTaskCardCompactProps) {
	const { task, confidence } = suggestion;

	return (
		<div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 hover:border-blue-500/30 transition-colors">
			<div className="flex items-center gap-3">
				<div className="flex-1 min-w-0">
					<h4 className="text-sm font-medium text-gray-200 truncate">{task.title}</h4>
					<div className="flex items-center gap-2 mt-1">
						<span className="text-xs text-gray-500">{task.estimatedMinutes}m</span>
						<span className="text-xs text-blue-400">{confidence}% match</span>
					</div>
				</div>
				<button
					type="button"
					onClick={() => onStart(task)}
					className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
				>
					<Icon name="play_arrow" size={14} />
					Start
				</button>
				<button
					type="button"
					onClick={onSkip}
					className="p-1.5 text-gray-500 hover:text-gray-400 hover:bg-gray-700/50 rounded-lg transition-colors"
					title="Skip"
				>
					<Icon name="skip_next" size={14} />
				</button>
			</div>
		</div>
	);
}
