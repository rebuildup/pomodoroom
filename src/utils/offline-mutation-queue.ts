/**
 * Offline Mutation Queue - Queue calendar mutations for offline-first sync
 *
 * Enables offline operations with safe synchronization:
 * - Queue mutations when offline
 * - Retry with exponential backoff
 * - Handle conflicts with resolution dialog
 *
 * Design goals:
 * - Seamless offline/online transitions
 * - Safe conflict resolution
 * - Minimal data loss
 */

// Mutation operation types
export type MutationOperation = "create" | "update" | "delete";

// Mutation status
export type MutationStatus =
	| "pending"
	| "retrying"
	| "syncing"
	| "completed"
	| "failed"
	| "conflict";

// Base mutation
export interface QueuedMutation {
	id: string;
	operation: MutationOperation;
	resourceType: "event" | "task" | "session";
	resourceId: string;
	payload: unknown;
	createdAt: number;
	updatedAt: number;
	status: MutationStatus;
	retryCount: number;
	lastError?: string;
	conflictData?: ConflictData;
}

// Conflict data for resolution
export interface ConflictData {
	localVersion: unknown;
	remoteVersion: unknown;
	conflictType: "update_conflict" | "delete_conflict" | "version_mismatch";
	detectedAt: number;
}

// Queue configuration
export interface MutationQueueConfig {
	maxRetries: number;
	initialRetryDelayMs: number;
	maxRetryDelayMs: number;
	maxQueueSize: number;
	syncIntervalMs: number;
}

// Queue statistics
export interface QueueStats {
	totalMutations: number;
	pendingMutations: number;
	completedMutations: number;
	failedMutations: number;
	conflictMutations: number;
	oldestPendingAge: number | null;
}

// Conflict resolution strategy
export type ConflictResolution = "local" | "remote" | "merge" | "skip";

// Default configuration
const DEFAULT_CONFIG: MutationQueueConfig = {
	maxRetries: 5,
	initialRetryDelayMs: 1000, // 1 second
	maxRetryDelayMs: 60000, // 1 minute
	maxQueueSize: 1000,
	syncIntervalMs: 30000, // 30 seconds
};

/**
 * Offline Mutation Queue
 */
export class OfflineMutationQueue {
	private queue: QueuedMutation[] = [];
	private config: MutationQueueConfig;
	private syncTimer: ReturnType<typeof setInterval> | null = null;
	private isOnline: boolean = true;
	private isProcessing: boolean = false;

	constructor(config: Partial<MutationQueueConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Initialize the queue and start sync timer
	 */
	initialize(): void {
		this.loadQueue();
		this.startSyncTimer();

		// Listen for online/offline events
		if (typeof window !== "undefined") {
			window.addEventListener("online", () => this.handleOnline());
			window.addEventListener("offline", () => this.handleOffline());
			this.isOnline = navigator.onLine;
		}
	}

	/**
	 * Shutdown the queue
	 */
	shutdown(): void {
		this.stopSyncTimer();
		if (typeof window !== "undefined") {
			window.removeEventListener("online", () => this.handleOnline());
			window.removeEventListener("offline", () => this.handleOffline());
		}
	}

	/**
	 * Add a mutation to the queue
	 */
	enqueue(
		operation: MutationOperation,
		resourceType: QueuedMutation["resourceType"],
		resourceId: string,
		payload: unknown,
	): QueuedMutation {
		// Check queue size limit
		if (this.queue.length >= this.config.maxQueueSize) {
			// Remove oldest completed mutations
			this.removeCompleted();
		}

		const mutation: QueuedMutation = {
			id: this.generateMutationId(),
			operation,
			resourceType,
			resourceId,
			payload,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			status: "pending",
			retryCount: 0,
		};

		this.queue.push(mutation);
		this.saveQueue();

		// Try to sync immediately if online
		if (this.isOnline && !this.isProcessing) {
			this.processQueue();
		}

		return mutation;
	}

	/**
	 * Get queue statistics
	 */
	getStats(): QueueStats {
		const pending = this.queue.filter((m) => m.status === "pending" || m.status === "retrying");
		const completed = this.queue.filter((m) => m.status === "completed");
		const failed = this.queue.filter((m) => m.status === "failed");
		const conflicts = this.queue.filter((m) => m.status === "conflict");

		const oldestPending = pending.reduce<number | null>((oldest, m) => {
			if (oldest === null) return m.createdAt;
			return Math.min(oldest, m.createdAt);
		}, null);

		return {
			totalMutations: this.queue.length,
			pendingMutations: pending.length,
			completedMutations: completed.length,
			failedMutations: failed.length,
			conflictMutations: conflicts.length,
			oldestPendingAge: oldestPending ? Date.now() - oldestPending : null,
		};
	}

	/**
	 * Get all pending mutations
	 */
	getPendingMutations(): QueuedMutation[] {
		return this.queue.filter(
			(m) => m.status === "pending" || m.status === "retrying" || m.status === "conflict",
		);
	}

	/**
	 * Get all conflicts
	 */
	getConflicts(): QueuedMutation[] {
		return this.queue.filter((m) => m.status === "conflict");
	}

	/**
	 * Resolve a conflict
	 */
	resolveConflict(mutationId: string, resolution: ConflictResolution, mergedPayload?: unknown): void {
		const mutation = this.queue.find((m) => m.id === mutationId);
		if (!mutation || mutation.status !== "conflict") return;

		switch (resolution) {
			case "local":
				// Use local version, retry sync
				mutation.status = "pending";
				mutation.retryCount = 0;
				mutation.conflictData = undefined;
				break;
			case "remote":
				// Accept remote version, mark complete
				mutation.status = "completed";
				break;
			case "merge":
				// Use merged payload, retry sync
				mutation.payload = mergedPayload ?? mutation.payload;
				mutation.status = "pending";
				mutation.retryCount = 0;
				mutation.conflictData = undefined;
				break;
			case "skip":
				// Give up on this mutation
				mutation.status = "failed";
				mutation.lastError = "User skipped conflict resolution";
				break;
		}

		mutation.updatedAt = Date.now();
		this.saveQueue();

		// Try to process queue
		if (this.isOnline) {
			this.processQueue();
		}
	}

	/**
	 * Clear completed mutations
	 */
	clearCompleted(): void {
		this.queue = this.queue.filter((m) => m.status !== "completed");
		this.saveQueue();
	}

	/**
	 * Force sync now
	 */
	async syncNow(): Promise<void> {
		if (!this.isOnline) {
			console.log("[MutationQueue] Offline - skipping sync");
			return;
		}
		await this.processQueue();
	}

	// Private methods

	private generateMutationId(): string {
		return `mutation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	}

	private startSyncTimer(): void {
		this.stopSyncTimer();
		this.syncTimer = setInterval(() => {
			if (this.isOnline && !this.isProcessing) {
				this.processQueue();
			}
		}, this.config.syncIntervalMs);
	}

	private stopSyncTimer(): void {
		if (this.syncTimer) {
			clearInterval(this.syncTimer);
			this.syncTimer = null;
		}
	}

	private handleOnline(): void {
		console.log("[MutationQueue] Online - processing queue");
		this.isOnline = true;
		this.processQueue();
	}

	private handleOffline(): void {
		console.log("[MutationQueue] Offline - pausing sync");
		this.isOnline = false;
	}

	private async processQueue(): Promise<void> {
		if (this.isProcessing) return;
		this.isProcessing = true;

		try {
			const pending = this.queue.filter(
				(m) => m.status === "pending" || m.status === "retrying",
			);

			for (const mutation of pending) {
				await this.processMutation(mutation);
			}
		} finally {
			this.isProcessing = false;
		}
	}

	private async processMutation(mutation: QueuedMutation): Promise<void> {
		mutation.status = "syncing";
		mutation.updatedAt = Date.now();

		try {
			// Simulate API call - in real implementation, this would call the calendar API
			const success = await this.executeMutation(mutation);

			if (success) {
				mutation.status = "completed";
				console.log(`[MutationQueue] Completed: ${mutation.id}`);
			} else {
				throw new Error("Mutation failed");
			}
		} catch (error) {
			await this.handleMutationError(mutation, error);
		}

		this.saveQueue();
	}

	private async executeMutation(mutation: QueuedMutation): Promise<boolean> {
		// In a real implementation, this would:
		// 1. Check for conflicts by fetching remote version
		// 2. If conflict detected, set mutation.conflictData and return false
		// 3. Otherwise, execute the mutation via API

		console.log(
			`[MutationQueue] Executing: ${mutation.operation} ${mutation.resourceType}:${mutation.resourceId}`,
		);

		// Simulate network latency
		await new Promise((resolve) => setTimeout(resolve, 100));

		return true;
	}

	private async handleMutationError(mutation: QueuedMutation, error: unknown): Promise<void> {
		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		mutation.lastError = errorMessage;
		mutation.retryCount++;

		if (mutation.retryCount >= this.config.maxRetries) {
			mutation.status = "failed";
			console.error(`[MutationQueue] Failed after ${mutation.retryCount} retries: ${mutation.id}`);
		} else {
			mutation.status = "retrying";

			// Exponential backoff
			const delay = Math.min(
				this.config.initialRetryDelayMs * Math.pow(2, mutation.retryCount - 1),
				this.config.maxRetryDelayMs,
			);

			console.log(`[MutationQueue] Retry ${mutation.retryCount} in ${delay}ms: ${mutation.id}`);

			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	private removeCompleted(): void {
		const completedCount = this.queue.filter((m) => m.status === "completed").length;
		if (completedCount > 0) {
			this.queue = this.queue.filter((m) => m.status !== "completed");
			console.log(`[MutationQueue] Removed ${completedCount} completed mutations`);
		}
	}

	private loadQueue(): void {
		// In a real implementation, this would load from IndexedDB or localStorage
		console.log("[MutationQueue] Loading queue from storage");
	}

	private saveQueue(): void {
		// In a real implementation, this would save to IndexedDB or localStorage
		console.log(`[MutationQueue] Saved queue (${this.queue.length} mutations)`);
	}
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoff(
	retryCount: number,
	initialDelayMs: number,
	maxDelayMs: number,
): number {
	const delay = initialDelayMs * Math.pow(2, retryCount);
	return Math.min(delay, maxDelayMs);
}

/**
 * Format mutation for display
 */
export function formatMutationDisplay(mutation: QueuedMutation): string {
	const statusEmoji = {
		pending: "⏳",
		retrying: "🔄",
		syncing: "📤",
		completed: "✅",
		failed: "❌",
		conflict: "⚠️",
	}[mutation.status];

	const age = Date.now() - mutation.createdAt;
	const ageStr = age < 60000 ? `${Math.round(age / 1000)}s` : `${Math.round(age / 60000)}m`;

	return `${statusEmoji} ${mutation.operation} ${mutation.resourceType} (${ageStr})`;
}

/**
 * Get conflict resolution options for UI
 */
export function getConflictResolutionOptions(_conflict: ConflictData): Array<{
	value: ConflictResolution;
	label: string;
	description: string;
}> {
	return [
		{
			value: "local",
			label: "ローカル優先",
			description: "自分の変更を優先します",
		},
		{
			value: "remote",
			label: "リモート優先",
			description: "サーバーの変更を優先します",
		},
		{
			value: "merge",
			label: "マージ",
			description: "両方の変更を統合します",
		},
		{
			value: "skip",
			label: "スキップ",
			description: "この変更を破棄します",
		},
	];
}
