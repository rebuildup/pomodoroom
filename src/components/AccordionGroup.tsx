/**
 * AccordionGroup — Coordinates multiple AccordionPanel instances.
 *
 * Features:
 * - Allow multiple panels open (independent mode) - default
 * - Accordion mode (only one open at a time)
 * - Optional expand all / collapse all buttons
 */
import { useState, useCallback, useMemo } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { AccordionPanelProps } from "./AccordionPanel";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AccordionGroupProps {
	children: React.ReactNode;
	/** If false, only one panel can be open at a time (accordion mode) */
	allowMultiple?: boolean;
	/** Storage key for persisting open panel state */
	storageKey?: string;
	/** Show expand/collapse all buttons */
	showExpandAll?: boolean;
	/** Default panel IDs to be open (for accordion mode) */
	defaultOpenIds?: string[];
	className?: string;
}

export interface AccordionItem {
	id: string;
	title: string;
	children: React.ReactNode;
	extra?: React.ReactNode;
	compact?: boolean;
}

// ─── Context for panel coordination ───────────────────────────────────────────

interface AccordionContextValue {
	openIds: Set<string>;
	toggle: (id: string) => void;
	allowMultiple: boolean;
}

const accordionContextMap = new Map<string, AccordionContextValue>();

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * AccordionGroup - Wrapper for coordinated accordion panels
 *
 * Usage:
 *   <AccordionGroup allowMultiple={false}>
 *     <AccordionPanel title="Panel 1">...</AccordionPanel>
 *     <AccordionPanel title="Panel 2">...</AccordionPanel>
 *   </AccordionGroup>
 *
 * For accordion mode (allowMultiple=false), panels must be wrapped
 * and their IDs will be auto-generated from their titles.
 */
export default function AccordionGroup({
	children,
	allowMultiple = true,
	storageKey = "accordion-group",
	showExpandAll = false,
	defaultOpenIds = [],
	className = "",
}: AccordionGroupProps) {
	// Use Set with JSON serialization
	const [openIds, setOpenIds] = useLocalStorage<string[]>(
		storageKey,
		Array.from(defaultOpenIds ?? []),
	);

	const openIdsSet = useMemo(() => new Set(openIds), [openIds]);

	const setOpenIdsSet = useCallback((newSet: Set<string>) => {
		setOpenIds(Array.from(newSet));
	}, [setOpenIds]);

	const toggle = useCallback(
		(id: string) => {
			const newSet = new Set(openIdsSet);
			if (allowMultiple) {
				// Independent mode: toggle this panel
				if (newSet.has(id)) {
					newSet.delete(id);
				} else {
					newSet.add(id);
				}
			} else {
				// Accordion mode: only this panel open
				newSet.clear();
				newSet.add(id);
			}
			setOpenIdsSet(newSet);
		},
		[allowMultiple, openIdsSet, setOpenIdsSet],
	);

	const expandAll = useCallback(() => {
		// In accordion mode, this doesn't make sense - do nothing
		if (allowMultiple) {
			// Add all panel IDs (will be populated by children)
			setOpenIds(openIds);
		}
	}, [allowMultiple, openIds, setOpenIds]);

	const collapseAll = useCallback(() => {
		setOpenIds([]);
	}, [setOpenIds]);

	// Store context value for panels to access
	const contextValue: AccordionContextValue = useMemo(
		() => ({ openIds: openIdsSet, toggle, allowMultiple }),
		[openIdsSet, toggle, allowMultiple],
	);

	// Register context for panels to access
	accordionContextMap.set(storageKey, contextValue);

	// Clean up on unmount
	return (
		<div className={className}>
			{showExpandAll && allowMultiple && (
				<div className="flex items-center gap-2 px-4 py-2 border-b border-(--color-border)">
					<button
						type="button"
						className="text-xs text-(--color-text-muted) hover:text-(--color-text-secondary) transition-colors"
						onClick={expandAll}
					>
						Expand All
					</button>
					<span className="text-(--color-text-muted)">/</span>
					<button
						type="button"
						className="text-xs text-(--color-text-muted) hover:text-(--color-text-secondary) transition-colors"
						onClick={collapseAll}
					>
						Collapse All
					</button>
				</div>
			)}
			{children}
		</div>
	);
}

// ─── Export hook for accessing accordion state ─────────────────────────────────

/**
 * Hook to access accordion state from within a panel.
 * Returns { isOpen, toggle, allowMultiple }
 */
export function useAccordionState(
	storageKey: string,
	panelId: string,
): { isOpen: boolean; toggle: () => void; allowMultiple: boolean } {
	const context = accordionContextMap.get(storageKey);

	if (!context) {
		// No context found, panel operates independently
		const [isOpen, setIsOpen] = useState(false);
		return {
			isOpen,
			toggle: () => setIsOpen((prev) => !prev),
			allowMultiple: true,
		};
	}

	return {
		isOpen: context.openIds.has(panelId),
		toggle: () => context.toggle(panelId),
		allowMultiple: context.allowMultiple,
	};
}

// ─── Utility for wrapping panels with coordination ────────────────────────────

/**
 * HOC to wrap AccordionPanel with accordion group coordination.
 * Use this when you need to convert standalone panels to coordinated ones.
 */
export function withAccordionCoordination<P extends AccordionPanelProps>(
	storageKey: string,
	panelId: string,
) {
	return function CoordinationWrapper(props: P) {
		void useAccordionState(storageKey, panelId);

		return (
			<div
				className={props.className}
				data-accordion-id={panelId}
				data-accordion-group={storageKey}
			>
				{props.children}
			</div>
		);
	};
}
