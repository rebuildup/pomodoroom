/**
 * Task Conflict Resolver - Resolve concurrent task edits safely
 *
 * Handles conflicts when multiple windows/sources edit the same task:
 * - Revision tokens for version tracking
 * - Field-level merge policies
 * - Deterministic conflict resolution
 *
 * Design goals:
 * - Prevent lost updates
 * - Deterministic merge outcomes
 * - Minimal user intervention
 */

// Revision token for version tracking
export interface RevisionToken {
	version: number;
	deviceId: string;
	timestamp: number;
	hash?: string;
}

// Version vector for multi-device sync
export interface VersionVector {
	[deviceId: string]: number;
}

// Field conflict resolution strategy
export type FieldMergePolicy =
	| "last_write_wins" // Use the most recent value
	| "first_write_wins" // Keep the original value
	| "merge" // Combine values (for arrays/objects)
	| "custom"; // Use custom resolver

// Field classification for merge policies
export type FieldClass =
	| "primitive" // Simple values (strings, numbers, booleans)
	| "timestamp" // Time-based fields
	| "array" // Lists and collections
	| "object" // Nested objects
	| "semantic"; // Domain-specific (e.g., task state)

// Conflict types
export type ConflictType =
	| "update_update" // Both sides modified
	| "update_delete" // One modified, one deleted
	| "delete_delete" // Both deleted
	| "version_mismatch"; // Version vector conflict

// Conflict severity
export type ConflictSeverity = "auto_resolved" | "needs_review" | "critical";

// Conflict record
export interface TaskConflict {
	id: string;
	type: ConflictType;
	severity: ConflictSeverity;
	fieldName: string;
	localValue: unknown;
	remoteValue: unknown;
	baseValue?: unknown; // Common ancestor
	resolvedValue?: unknown;
	resolution: "local" | "remote" | "merged" | "manual" | null;
	timestamp: number;
}

// Merge result
export interface MergeResult<T> {
	value: T;
	conflicts: TaskConflict[];
	wasAutoResolved: boolean;
	needsManualReview: boolean;
}

// Field policy configuration
export interface FieldPolicy {
	class: FieldClass;
	policy: FieldMergePolicy;
	customResolver?: (local: unknown, remote: unknown, base?: unknown) => unknown;
}

// Default field policies for Task type
const DEFAULT_FIELD_POLICIES: Record<string, FieldPolicy> = {
	// Primitive fields - last write wins
	title: { class: "primitive", policy: "last_write_wins" },
	description: { class: "primitive", policy: "last_write_wins" },
	priority: { class: "primitive", policy: "last_write_wins" },
	kind: { class: "primitive", policy: "last_write_wins" },

	// Timestamp fields - most recent wins
	createdAt: { class: "timestamp", policy: "first_write_wins" },
	updatedAt: { class: "timestamp", policy: "last_write_wins" },
	fixedStartAt: { class: "timestamp", policy: "last_write_wins" },
	fixedEndAt: { class: "timestamp", policy: "last_write_wins" },
	estimatedStartAt: { class: "timestamp", policy: "last_write_wins" },
	completedAt: { class: "timestamp", policy: "last_write_wins" },

	// Array fields - merge
	tags: { class: "array", policy: "merge" },

	// State fields - semantic resolution
	state: { class: "semantic", policy: "custom", customResolver: resolveStateConflict },

	// Duration fields - last write wins
	requiredMinutes: { class: "primitive", policy: "last_write_wins" },
	elapsedMinutes: { class: "primitive", policy: "last_write_wins" },
};

/**
 * Resolve state conflicts with semantic rules
 */
function resolveStateConflict(local: unknown, remote: unknown, _base?: unknown): unknown {
	const localState = local as string;
	const remoteState = remote as string;

	// State priority: DONE > RUNNING > PAUSED > READY
	const statePriority: Record<string, number> = {
		DONE: 4,
		RUNNING: 3,
		PAUSED: 2,
		READY: 1,
	};

	const localPriority = statePriority[localState] ?? 0;
	const remotePriority = statePriority[remoteState] ?? 0;

	// Higher priority state wins
	return localPriority >= remotePriority ? local : remote;
}

/**
 * Generate a revision token
 */
export function generateRevisionToken(deviceId: string, version: number): RevisionToken {
	return {
		version,
		deviceId,
		timestamp: Date.now(),
	};
}

/**
 * Increment version in version vector
 */
export function incrementVersion(vector: VersionVector, deviceId: string): VersionVector {
	return {
		...vector,
		[deviceId]: (vector[deviceId] ?? 0) + 1,
	};
}

/**
 * Compare version vectors
 * Returns: -1 if a < b, 1 if a > b, 0 if concurrent
 */
export function compareVersionVectors(a: VersionVector, b: VersionVector): number {
	let aGreater = false;
	let bGreater = false;

	const allDevices = new Set([...Object.keys(a), ...Object.keys(b)]);

	for (const device of allDevices) {
		const aVersion = a[device] ?? 0;
		const bVersion = b[device] ?? 0;

		if (aVersion > bVersion) aGreater = true;
		if (bVersion > aVersion) bGreater = true;
	}

	if (aGreater && !bGreater) return 1;
	if (bGreater && !aGreater) return -1;
	return 0; // Concurrent
}

/**
 * Merge two version vectors
 */
export function mergeVersionVectors(a: VersionVector, b: VersionVector): VersionVector {
	const result: VersionVector = {};
	const allDevices = new Set([...Object.keys(a), ...Object.keys(b)]);

	for (const device of allDevices) {
		result[device] = Math.max(a[device] ?? 0, b[device] ?? 0);
	}

	return result;
}

/**
 * Merge arrays (union with deduplication)
 */
function mergeArrays(local: unknown[], remote: unknown[], base?: unknown[]): unknown[] {
	const localSet = new Set(local);
	const remoteSet = new Set(remote);
	const baseSet = new Set(base ?? []);

	// Items removed locally should not appear
	const locallyRemoved = [...baseSet].filter((item) => !localSet.has(item));

	// Items removed remotely should not appear
	const remotelyRemoved = [...baseSet].filter((item) => !remoteSet.has(item));

	// Union of local and remote, minus items removed on either side
	const result = new Set([...local, ...remote]);

	for (const item of [...locallyRemoved, ...remotelyRemoved]) {
		result.delete(item);
	}

	return [...result];
}

/**
 * Resolve a single field conflict
 */
function resolveFieldConflict(
	fieldName: string,
	localValue: unknown,
	remoteValue: unknown,
	baseValue?: unknown,
	policies?: Record<string, FieldPolicy>,
): { value: unknown; conflict: TaskConflict | null } {
	const policy = policies?.[fieldName] ??
		DEFAULT_FIELD_POLICIES[fieldName] ?? {
			class: "primitive" as FieldClass,
			policy: "last_write_wins" as FieldMergePolicy,
		};

	// No conflict if values are equal
	if (localValue === remoteValue) {
		return { value: localValue, conflict: null };
	}

	// No conflict if one side didn't change from base
	if (baseValue !== undefined) {
		if (localValue === baseValue) {
			return { value: remoteValue, conflict: null };
		}
		if (remoteValue === baseValue) {
			return { value: localValue, conflict: null };
		}
	}

	let resolvedValue: unknown;
	let severity: ConflictSeverity = "auto_resolved";

	switch (policy.policy) {
		case "last_write_wins":
			// Use remote (assumed to be newer in sync context)
			resolvedValue = remoteValue;
			break;

		case "first_write_wins":
			// Use local (assumed to be older)
			resolvedValue = localValue;
			break;

		case "merge":
			if (policy.class === "array" && Array.isArray(localValue) && Array.isArray(remoteValue)) {
				resolvedValue = mergeArrays(
					localValue,
					remoteValue,
					Array.isArray(baseValue) ? baseValue : undefined,
				);
			} else {
				// Fallback to last write wins for non-arrays
				resolvedValue = remoteValue;
			}
			break;

		case "custom":
			if (policy.customResolver) {
				resolvedValue = policy.customResolver(localValue, remoteValue, baseValue);
				// Custom resolvers for semantic fields may need review
				if (policy.class === "semantic") {
					severity = "needs_review";
				}
			} else {
				resolvedValue = remoteValue;
			}
			break;

		default:
			resolvedValue = remoteValue;
	}

	const conflict: TaskConflict = {
		id: `conflict-${fieldName}-${Date.now()}`,
		type: "update_update",
		severity,
		fieldName,
		localValue,
		remoteValue,
		baseValue,
		resolvedValue,
		resolution: null,
		timestamp: Date.now(),
	};

	return { value: resolvedValue, conflict };
}

/**
 * Merge two task versions
 */
export function mergeTasks<T extends Record<string, unknown>>(
	local: T & { _revision?: RevisionToken; _versionVector?: VersionVector },
	remote: T & { _revision?: RevisionToken; _versionVector?: VersionVector },
	base?: T,
	policies?: Record<string, FieldPolicy>,
): MergeResult<T> {
	const conflicts: TaskConflict[] = [];
	const result: Record<string, unknown> = {};

	// Get all field names
	const allFields = new Set(
		[...Object.keys(local), ...Object.keys(remote), ...Object.keys(base ?? {})].filter(
			(key) => !key.startsWith("_"),
		),
	);

	for (const field of allFields) {
		const localValue = local[field];
		const remoteValue = remote[field];
		const baseValue = base?.[field as keyof T];

		const { value, conflict } = resolveFieldConflict(
			field,
			localValue,
			remoteValue,
			baseValue,
			policies,
		);

		result[field] = value;

		if (conflict) {
			conflicts.push(conflict);
		}
	}

	// Merge version vectors
	if (local._versionVector || remote._versionVector) {
		result._versionVector = mergeVersionVectors(
			local._versionVector ?? {},
			remote._versionVector ?? {},
		);
	}

	// Update revision token
	result._revision = {
		version: Math.max(local._revision?.version ?? 0, remote._revision?.version ?? 0) + 1,
		deviceId: "merged",
		timestamp: Date.now(),
	};

	const needsManualReview = conflicts.some(
		(c) => c.severity === "needs_review" || c.severity === "critical",
	);

	return {
		value: result as T,
		conflicts,
		wasAutoResolved: conflicts.length > 0 && !needsManualReview,
		needsManualReview,
	};
}

/**
 * Detect conflicts between versions
 */
export function detectConflicts<T extends Record<string, unknown>>(
	local: T,
	remote: T,
	base?: T,
	policies?: Record<string, FieldPolicy>,
): TaskConflict[] {
	const conflicts: TaskConflict[] = [];

	const allFields = new Set(
		[...Object.keys(local), ...Object.keys(remote), ...Object.keys(base ?? {})].filter(
			(key) => !key.startsWith("_"),
		),
	);

	for (const field of allFields) {
		const localValue = local[field as keyof T];
		const remoteValue = remote[field as keyof T];
		const baseValue = base?.[field as keyof T];

		// Skip if no actual conflict
		if (localValue === remoteValue) continue;
		if (baseValue !== undefined && localValue === baseValue) continue;
		if (baseValue !== undefined && remoteValue === baseValue) continue;

		const { conflict } = resolveFieldConflict(field, localValue, remoteValue, baseValue, policies);

		if (conflict) {
			conflicts.push(conflict);
		}
	}

	return conflicts;
}

/**
 * Apply manual conflict resolution
 */
export function applyResolution(
	conflict: TaskConflict,
	resolution: "local" | "remote" | "merged",
	mergedValue?: unknown,
): TaskConflict {
	let resolvedValue: unknown;

	switch (resolution) {
		case "local":
			resolvedValue = conflict.localValue;
			break;
		case "remote":
			resolvedValue = conflict.remoteValue;
			break;
		case "merged":
			resolvedValue = mergedValue ?? conflict.resolvedValue;
			break;
	}

	return {
		...conflict,
		resolvedValue,
		resolution,
		severity: "auto_resolved",
	};
}

/**
 * Get conflict summary for display
 */
export function getConflictSummary(conflicts: TaskConflict[]): {
	total: number;
	autoResolved: number;
	needsReview: number;
	critical: number;
} {
	return {
		total: conflicts.length,
		autoResolved: conflicts.filter((c) => c.severity === "auto_resolved").length,
		needsReview: conflicts.filter((c) => c.severity === "needs_review").length,
		critical: conflicts.filter((c) => c.severity === "critical").length,
	};
}

/**
 * Format conflict for display
 */
export function formatConflictDisplay(conflict: TaskConflict): string {
	const severityEmoji = {
		auto_resolved: "✅",
		needs_review: "⚠️",
		critical: "🚨",
	}[conflict.severity];

	return `${severityEmoji} ${conflict.fieldName}: ${JSON.stringify(conflict.localValue).slice(0, 20)} vs ${JSON.stringify(conflict.remoteValue).slice(0, 20)}`;
}
