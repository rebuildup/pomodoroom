/**
 * Unified Timeline Event Bus - Central event stream for UI consistency
 *
 * Provides a single event stream for all task/timer/schedule changes:
 * - Typed events from backend
 * - Ordered event delivery
 * - State reconstruction from event stream
 *
 * Design goals:
 * - Single source of truth for UI updates
 * - Deterministic event ordering
 * - Replace ad-hoc refresh events
 */

// Event types
export type TimelineEventType =
	// Task events
	| "task_created"
	| "task_updated"
	| "task_deleted"
	| "task_state_changed"
	// Timer events
	| "timer_started"
	| "timer_paused"
	| "timer_resumed"
	| "timer_completed"
	| "timer_tick"
	// Schedule events
	| "schedule_updated"
	| "segment_started"
	| "segment_completed"
	// Session events
	| "session_started"
	| "session_completed"
	| "session_abandoned";

// Base event structure
export interface TimelineEvent {
	id: string;
	type: TimelineEventType;
	timestamp: number;
	source: "backend" | "frontend" | "sync";
	version: number;
	payload: unknown;
	metadata?: EventMetadata;
}

// Event metadata for ordering and deduplication
export interface EventMetadata {
	deviceId: string;
	correlationId?: string;
	causationId?: string; // ID of event that caused this one
	sequenceNumber?: number;
}

// Event subscription handler
export type EventHandler = (event: TimelineEvent) => void;

// Subscription options
export interface SubscriptionOptions {
	eventTypes?: TimelineEventType[];
	includePast?: boolean;
	debounceMs?: number;
}

// Event bus configuration
export interface EventBusConfig {
	maxHistorySize: number;
	enablePersistence: boolean;
	persistenceKey?: string;
}

// Event statistics
export interface EventStats {
	totalEvents: number;
	eventsByType: Record<TimelineEventType, number>;
	lastEventAt: number | null;
	subscriberCount: number;
}

// Default configuration
const DEFAULT_CONFIG: EventBusConfig = {
	maxHistorySize: 1000,
	enablePersistence: false,
};

/**
 * Unified Timeline Event Bus
 */
export class UnifiedEventBus {
	private subscribers: Map<string, Set<EventHandler>> = new Map();
	private history: TimelineEvent[] = [];
	private config: EventBusConfig;
	private deviceId: string;
	private sequenceNumber: number = 0;

	constructor(config: Partial<EventBusConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.deviceId = this.generateDeviceId();

		if (this.config.enablePersistence) {
			this.loadHistory();
		}
	}

	/**
	 * Publish an event to the bus
	 */
	publish<T>(
		type: TimelineEventType,
		payload: T,
		options?: {
			source?: TimelineEvent["source"];
			correlationId?: string;
			causationId?: string;
		},
	): TimelineEvent {
		const event: TimelineEvent = {
			id: this.generateEventId(),
			type,
			timestamp: Date.now(),
			source: options?.source ?? "frontend",
			version: 1,
			payload,
			metadata: {
				deviceId: this.deviceId,
				correlationId: options?.correlationId,
				causationId: options?.causationId,
				sequenceNumber: this.sequenceNumber++,
			},
		};

		// Add to history
		this.addToHistory(event);

		// Notify subscribers
		this.notifySubscribers(event);

		// Persist if enabled
		if (this.config.enablePersistence) {
			this.saveHistory();
		}

		return event;
	}

	/**
	 * Subscribe to events
	 */
	subscribe(
		handler: EventHandler,
		options: SubscriptionOptions = {},
	): () => void {
		const subscriptionId = this.generateSubscriptionId();

		// Create wrapped handler with options
		const wrappedHandler = this.wrapHandler(handler, options);

		// Add to subscribers
		if (!this.subscribers.has(subscriptionId)) {
			this.subscribers.set(subscriptionId, new Set());
		}
		this.subscribers.get(subscriptionId)!.add(wrappedHandler);

		// Include past events if requested
		if (options.includePast && options.eventTypes) {
			const pastEvents = this.getHistory(options.eventTypes);
			for (const event of pastEvents) {
				wrappedHandler(event);
			}
		}

		// Return unsubscribe function
		return () => {
			this.subscribers.get(subscriptionId)?.delete(wrappedHandler);
			if (this.subscribers.get(subscriptionId)?.size === 0) {
				this.subscribers.delete(subscriptionId);
			}
		};
	}

	/**
	 * Subscribe to specific event types
	 */
	subscribeToTypes(
		types: TimelineEventType[],
		handler: EventHandler,
		options: Omit<SubscriptionOptions, "eventTypes"> = {},
	): () => void {
		return this.subscribe(handler, { ...options, eventTypes: types });
	}

	/**
	 * Get event history
	 */
	getHistory(types?: TimelineEventType[]): TimelineEvent[] {
		if (!types || types.length === 0) {
			return [...this.history];
		}

		const typeSet = new Set(types);
		return this.history.filter((e) => typeSet.has(e.type));
	}

	/**
	 * Get events since a specific timestamp
	 */
	getEventsSince(timestamp: number, types?: TimelineEventType[]): TimelineEvent[] {
		const events = this.getHistory(types);
		return events.filter((e) => e.timestamp > timestamp);
	}

	/**
	 * Replay events to reconstruct state
	 */
	replay<T>(
		handler: (state: T, event: TimelineEvent) => T,
		initialState: T,
		types?: TimelineEventType[],
	): T {
		const events = this.getHistory(types);
		return events.reduce(handler, initialState);
	}

	/**
	 * Get event statistics
	 */
	getStats(): EventStats {
		const eventsByType: Record<string, number> = {};

		for (const event of this.history) {
			eventsByType[event.type] = (eventsByType[event.type] ?? 0) + 1;
		}

		let subscriberCount = 0;
		for (const handlers of this.subscribers.values()) {
			subscriberCount += handlers.size;
		}

		return {
			totalEvents: this.history.length,
			eventsByType: eventsByType as EventStats["eventsByType"],
			lastEventAt: this.history.length > 0 ? this.history[this.history.length - 1].timestamp : null,
			subscriberCount,
		};
	}

	/**
	 * Clear event history
	 */
	clearHistory(): void {
		this.history = [];
		if (this.config.enablePersistence) {
			this.saveHistory();
		}
	}

	// Private methods

	private generateDeviceId(): string {
		return `device-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	}

	private generateEventId(): string {
		return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	}

	private generateSubscriptionId(): string {
		return `sub-${Math.random().toString(36).slice(2, 9)}`;
	}

	private addToHistory(event: TimelineEvent): void {
		this.history.push(event);

		// Trim history if needed
		if (this.history.length > this.config.maxHistorySize) {
			this.history = this.history.slice(-this.config.maxHistorySize);
		}
	}

	private wrapHandler(
		handler: EventHandler,
		options: SubscriptionOptions,
	): EventHandler {
		let lastCall = 0;

		return (event: TimelineEvent) => {
			// Filter by event types
			if (options.eventTypes && !options.eventTypes.includes(event.type)) {
				return;
			}

			// Apply debounce if specified
			if (options.debounceMs) {
				const now = Date.now();
				if (now - lastCall < options.debounceMs) {
					return;
				}
				lastCall = now;
			}

			handler(event);
		};
	}

	private notifySubscribers(event: TimelineEvent): void {
		for (const handlers of this.subscribers.values()) {
			for (const handler of handlers) {
				try {
					handler(event);
				} catch (error) {
					console.error("[EventBus] Handler error:", error);
				}
			}
		}
	}

	private loadHistory(): void {
		if (!this.config.persistenceKey) return;

		try {
			const stored = localStorage.getItem(this.config.persistenceKey);
			if (stored) {
				this.history = JSON.parse(stored);
			}
		} catch (error) {
			console.error("[EventBus] Failed to load history:", error);
		}
	}

	private saveHistory(): void {
		if (!this.config.persistenceKey) return;

		try {
			localStorage.setItem(this.config.persistenceKey, JSON.stringify(this.history));
		} catch (error) {
			console.error("[EventBus] Failed to save history:", error);
		}
	}
}

// Singleton instance
let globalEventBus: UnifiedEventBus | null = null;

/**
 * Get the global event bus instance
 */
export function getEventBus(config?: Partial<EventBusConfig>): UnifiedEventBus {
	if (!globalEventBus) {
		globalEventBus = new UnifiedEventBus(config);
	}
	return globalEventBus;
}

/**
 * Create a typed event factory
 */
export function createEventFactory<T>(type: TimelineEventType) {
	return (
		payload: T,
		options?: {
			source?: TimelineEvent["source"];
			correlationId?: string;
			causationId?: string;
		},
	): Omit<TimelineEvent, "id"> => ({
		type,
		timestamp: Date.now(),
		source: options?.source ?? "frontend",
		version: 1,
		payload,
		metadata: {
			deviceId: "factory",
			correlationId: options?.correlationId,
			causationId: options?.causationId,
		},
	});
}

/**
 * Group events by type
 */
export function groupEventsByType(events: TimelineEvent[]): Map<TimelineEventType, TimelineEvent[]> {
	const groups = new Map<TimelineEventType, TimelineEvent[]>();

	for (const event of events) {
		const group = groups.get(event.type) ?? [];
		group.push(event);
		groups.set(event.type, group);
	}

	return groups;
}

/**
 * Filter events by time range
 */
export function filterEventsByTimeRange(
	events: TimelineEvent[],
	start: number,
	end: number,
): TimelineEvent[] {
	return events.filter((e) => e.timestamp >= start && e.timestamp <= end);
}

/**
 * Get event type display name
 */
export function getEventTypeDisplayName(type: TimelineEventType): string {
	const names: Record<TimelineEventType, string> = {
		task_created: "タスク作成",
		task_updated: "タスク更新",
		task_deleted: "タスク削除",
		task_state_changed: "状態変更",
		timer_started: "タイマー開始",
		timer_paused: "タイマー一時停止",
		timer_resumed: "タイマー再開",
		timer_completed: "タイマー完了",
		timer_tick: "タイマーティック",
		schedule_updated: "スケジュール更新",
		segment_started: "セグメント開始",
		segment_completed: "セグメント完了",
		session_started: "セッション開始",
		session_completed: "セッション完了",
		session_abandoned: "セッション中断",
	};

	return names[type] ?? type;
}
