/**
 * Notion Event Store - Secondary event store using Notion databases
 *
 * Provides append-only event logging to Notion databases for
 * session/segment data as review assets.
 *
 * Design goals:
 * - Append-only semantics (never mutate existing records)
 * - Batched writes for efficiency
 * - Retry logic for network failures
 * - Schema versioning for future compatibility
 */

// Event types that can be stored in Notion
export type NotionEventType =
	| "session_start"
	| "session_complete"
	| "session_abandon"
	| "segment_focus"
	| "segment_break"
	| "task_created"
	| "task_completed"
	| "task_deferred"
	| "note_attached";

// Base event structure
export interface NotionEvent {
	id: string;
	type: NotionEventType;
	timestamp: number;
	source: "pomodoroom";
	version: number;
}

// Session event payload
export interface SessionEvent extends NotionEvent {
	type: "session_start" | "session_complete" | "session_abandon";
	data: {
		sessionId: string;
		taskTitle: string | null;
		taskId: string | null;
		plannedMinutes: number;
		actualMinutes?: number;
		completedAt?: number;
	};
}

// Segment event payload
export interface SegmentEvent extends NotionEvent {
	type: "segment_focus" | "segment_break";
	data: {
		sessionId: string;
		segmentIndex: number;
		durationMinutes: number;
		startedAt: number;
		completedAt: number;
		wasInterrupted?: boolean;
	};
}

// Task event payload
export interface TaskEvent extends NotionEvent {
	type: "task_created" | "task_completed" | "task_deferred";
	data: {
		taskId: string;
		taskTitle: string;
		priority: "high" | "medium" | "low";
		estimatedMinutes?: number;
		tags: string[];
	};
}

// Note event payload
export interface NoteEvent extends NotionEvent {
	type: "note_attached";
	data: {
		sessionId: string;
		noteContent: string;
		noteType: "retrospective" | "context" | "blocker";
	};
}

// Union of all event types
export type AnyNotionEvent = SessionEvent | SegmentEvent | TaskEvent | NoteEvent;

// Notion database configuration
export interface NotionEventStoreConfig {
	databaseId: string;
	apiKey: string;
	batchSize: number;
	flushIntervalMs: number;
	maxRetries: number;
	retryDelayMs: number;
}

// Event queue item
interface QueuedEvent {
	event: AnyNotionEvent;
	createdAt: number;
	retryCount: number;
	lastError?: string;
}

// Event store state
export interface EventStoreState {
	isConnected: boolean;
	pendingEvents: number;
	failedEvents: number;
	lastFlushAt: number | null;
	lastError: string | null;
}

// Default configuration
const DEFAULT_CONFIG: Omit<NotionEventStoreConfig, "databaseId" | "apiKey"> = {
	batchSize: 10,
	flushIntervalMs: 30000, // 30 seconds
	maxRetries: 3,
	retryDelayMs: 1000,
};

/**
 * Notion Event Store class for managing event persistence
 */
export class NotionEventStore {
	private config: NotionEventStoreConfig;
	private queue: QueuedEvent[] = [];
	private flushTimer: ReturnType<typeof setInterval> | null = null;
	private state: EventStoreState = {
		isConnected: false,
		pendingEvents: 0,
		failedEvents: 0,
		lastFlushAt: null,
		lastError: null,
	};

	constructor(config: Partial<NotionEventStoreConfig> & { databaseId: string; apiKey: string }) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Initialize the event store and verify connection
	 */
	async connect(): Promise<boolean> {
		try {
			// Verify database access
			const response = await this.fetchNotionDatabase();
			this.state.isConnected = true;
			console.log(`[NotionEventStore] Connected to database: ${response.title?.[0]?.plain_text ?? this.config.databaseId}`);
			this.startFlushTimer();
			return true;
		} catch (error) {
			this.state.lastError = error instanceof Error ? error.message : "Connection failed";
			console.error("[NotionEventStore] Connection failed:", this.state.lastError);
			return false;
		}
	}

	/**
	 * Disconnect and flush remaining events
	 */
	async disconnect(): Promise<void> {
		this.stopFlushTimer();
		await this.flush();
		this.state.isConnected = false;
	}

	/**
	 * Append an event to the queue
	 */
	append(event: AnyNotionEvent): void {
		this.queue.push({
			event,
			createdAt: Date.now(),
			retryCount: 0,
		});
		this.state.pendingEvents = this.queue.length;

		// Flush immediately if batch is full
		if (this.queue.length >= this.config.batchSize) {
			this.flush().catch((err) => console.error("[NotionEventStore] Flush error:", err));
		}
	}

	/**
	 * Flush all pending events to Notion
	 */
	async flush(): Promise<void> {
		if (this.queue.length === 0) return;

		const batch = this.queue.splice(0, this.config.batchSize);
		const eventsToRetry: QueuedEvent[] = [];

		for (const item of batch) {
			try {
				await this.writeEventToNotion(item.event);
			} catch (error) {
				item.retryCount++;
				item.lastError = error instanceof Error ? error.message : "Write failed";

				if (item.retryCount < this.config.maxRetries) {
					eventsToRetry.push(item);
				} else {
					this.state.failedEvents++;
					console.error("[NotionEventStore] Event dropped after max retries:", item.event.id);
				}
			}
		}

		// Re-queue events for retry
		this.queue.unshift(...eventsToRetry);
		this.state.pendingEvents = this.queue.length;
		this.state.lastFlushAt = Date.now();
	}

	/**
	 * Get current store state
	 */
	getState(): EventStoreState {
		return { ...this.state };
	}

	/**
	 * Create a session event
	 */
	static createSessionEvent(
		type: SessionEvent["type"],
		data: SessionEvent["data"],
	): SessionEvent {
		return {
			id: `session-${data.sessionId}-${type}-${Date.now()}`,
			type,
			timestamp: Date.now(),
			source: "pomodoroom",
			version: 1,
			data,
		};
	}

	/**
	 * Create a segment event
	 */
	static createSegmentEvent(
		type: SegmentEvent["type"],
		data: SegmentEvent["data"],
	): SegmentEvent {
		return {
			id: `segment-${data.sessionId}-${data.segmentIndex}-${Date.now()}`,
			type,
			timestamp: Date.now(),
			source: "pomodoroom",
			version: 1,
			data,
		};
	}

	/**
	 * Create a task event
	 */
	static createTaskEvent(
		type: TaskEvent["type"],
		data: TaskEvent["data"],
	): TaskEvent {
		return {
			id: `task-${data.taskId}-${type}-${Date.now()}`,
			type,
			timestamp: Date.now(),
			source: "pomodoroom",
			version: 1,
			data,
		};
	}

	/**
	 * Create a note event
	 */
	static createNoteEvent(data: NoteEvent["data"]): NoteEvent {
		return {
			id: `note-${data.sessionId}-${Date.now()}`,
			type: "note_attached",
			timestamp: Date.now(),
			source: "pomodoroom",
			version: 1,
			data,
		};
	}

	// Private methods

	private startFlushTimer(): void {
		this.stopFlushTimer();
		this.flushTimer = setInterval(() => {
			this.flush().catch((err) => console.error("[NotionEventStore] Timer flush error:", err));
		}, this.config.flushIntervalMs);
	}

	private stopFlushTimer(): void {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = null;
		}
	}

	private async fetchNotionDatabase(): Promise<{ title?: Array<{ plain_text: string }> }> {
		// In a real implementation, this would call the Notion API
		// For now, we simulate the connection
		console.log(`[NotionEventStore] Fetching database: ${this.config.databaseId}`);
		return { title: [{ plain_text: "Pomodoroom Events" }] };
	}

	private async writeEventToNotion(event: AnyNotionEvent): Promise<void> {
		// In a real implementation, this would call the Notion API
		// For now, we simulate the write
		console.log(`[NotionEventStore] Writing event: ${event.type} (${event.id})`);

		// Simulate API call
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

/**
 * Format event for Notion database properties
 */
export function eventToNotionProperties(event: AnyNotionEvent): Record<string, unknown> {
	const base: Record<string, unknown> = {
		EventID: {
			title: [{ text: { content: event.id } }],
		},
		Type: {
			select: { name: event.type },
		},
		Timestamp: {
			date: { start: new Date(event.timestamp).toISOString() },
		},
		Source: {
			select: { name: event.source },
		},
		Version: {
			number: event.version,
		},
	};

	// Add type-specific properties
	if (event.type === "session_start" || event.type === "session_complete" || event.type === "session_abandon") {
		base.SessionID = { rich_text: [{ text: { content: event.data.sessionId } }] };
		base.TaskTitle = { rich_text: [{ text: { content: event.data.taskTitle ?? "" } }] };
		base.PlannedMinutes = { number: event.data.plannedMinutes };
		if (event.data.actualMinutes !== undefined) {
			base.ActualMinutes = { number: event.data.actualMinutes };
		}
	}

	if (event.type === "segment_focus" || event.type === "segment_break") {
		base.SessionID = { rich_text: [{ text: { content: event.data.sessionId } }] };
		base.SegmentIndex = { number: event.data.segmentIndex };
		base.DurationMinutes = { number: event.data.durationMinutes };
	}

	if (event.type === "task_created" || event.type === "task_completed" || event.type === "task_deferred") {
		base.TaskID = { rich_text: [{ text: { content: event.data.taskId } }] };
		base.TaskTitle = { rich_text: [{ text: { content: event.data.taskTitle } }] };
		base.Priority = { select: { name: event.data.priority } };
	}

	if (event.type === "note_attached") {
		base.SessionID = { rich_text: [{ text: { content: event.data.sessionId } }] };
		base.NoteType = { select: { name: event.data.noteType } };
		base.NoteContent = { rich_text: [{ text: { content: event.data.noteContent.slice(0, 2000) } }] };
	}

	return base;
}

/**
 * Get event type display name
 */
export function getEventTypeDisplayName(type: NotionEventType): string {
	switch (type) {
		case "session_start":
			return "セッション開始";
		case "session_complete":
			return "セッション完了";
		case "session_abandon":
			return "セッション中断";
		case "segment_focus":
			return "集中セグメント";
		case "segment_break":
			return "休憩セグメント";
		case "task_created":
			return "タスク作成";
		case "task_completed":
			return "タスク完了";
		case "task_deferred":
			return "タスク延期";
		case "note_attached":
			return "ノート添付";
	}
}
