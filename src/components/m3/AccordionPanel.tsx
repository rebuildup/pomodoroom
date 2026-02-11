/**
 * Material 3 Accordion Panel Component
 *
 * Collapsible panel with smooth animation using M3 tokens.
 *
 * Features:
 * - Expand/collapse animation using CSS grid
 * - Chevron icon rotation
 * - localStorage state persistence
 * - Toggle callback for parent coordination
 * - M3 color tokens
 *
 * Reference: https://m3.material.io/components/navigation-drawer/overview
 */

import { useState, useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { useLocalStorage } from "@/hooks/useLocalStorage";

export interface AccordionPanelProps {
	/** Panel title/label */
	title: string;
	/** Panel content */
	children: React.ReactNode;
	/** Default open state on first render */
	defaultOpen?: boolean;
	/** Callback when panel toggles */
	onToggle?: (open: boolean) => void;
	/** Unique key for localStorage persistence */
	storageKey?: string;
	/** Optional header extra content (right side) */
	extra?: React.ReactNode;
	/** Compact variant with smaller padding */
	compact?: boolean;
	/** Override open state (controlled mode) */
	open?: boolean;
	/** Override onToggle (controlled mode) */
	onOpenChange?: (open: boolean) => void;
	/** Additional CSS class */
	className?: string;
}

/**
 * Get storage key for panel state persistence.
 */
function getStorageKey(title: string): string {
	return `m3-accordion-panel-${title.toLowerCase().replace(/\s+/g, "-")}`;
}

/**
 * Material 3 Accordion Panel.
 *
 * Collapsible panel section with smooth height animation.
 *
 * @example
 * ```tsx
 * <AccordionPanel
 *   title="Plan"
 *   storageKey="taskstream-plan"
 *   defaultOpen={true}
 *   extra={<span>{count}</span>}
 * >
 *   {items.map(item => <TaskStreamItem key={item.id} item={item} />)}
 * </AccordionPanel>
 * ```
 */
export const AccordionPanel: React.FC<AccordionPanelProps> = ({
	title,
	children,
	defaultOpen = false,
	onToggle,
	storageKey,
	extra,
	compact = false,
	open: controlledOpen,
	onOpenChange,
	className = "",
}) => {
	// Use controlled mode if provided, otherwise use internal state
	const key = storageKey ?? getStorageKey(title);
	const [internalOpen, setInternalOpen] = useLocalStorage(key, defaultOpen);

	const isOpen = controlledOpen ?? internalOpen;
	const setIsOpen = onOpenChange ?? setInternalOpen;

	const contentRef = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState<number | "auto">(isOpen ? "auto" : 0);

	// Update height when open state changes
	useEffect(() => {
		if (isOpen) {
			// Measure and set height for animation
			if (contentRef.current) {
				const scrollHeight = contentRef.current.scrollHeight;
				setHeight(scrollHeight);
				// After animation, set to auto for dynamic content
				const timeout = setTimeout(() => setHeight("auto"), 200);
				return () => clearTimeout(timeout);
			}
			setHeight("auto");
		} else {
			// Measure current height before collapsing
			if (contentRef.current) {
				const currentHeight = contentRef.current.scrollHeight;
				setHeight(currentHeight);
				// Then collapse to 0
				const timeout = setTimeout(() => setHeight(0), 0);
				return () => clearTimeout(timeout);
			}
			setHeight(0);
		}
		return undefined;
	}, [isOpen]);

	// Recalculate height on content changes
	useEffect(() => {
		if (isOpen && height !== "auto") {
			if (contentRef.current) {
				setHeight(contentRef.current.scrollHeight);
			}
		}
	}, [children, isOpen, height]);

	const handleToggle = () => {
		const newState = !isOpen;
		setIsOpen(newState);
		onToggle?.(newState);
	};

	return (
		<div className={`border-b border-(--md-ref-color-outline-variant) ${className}`.trim()}>
			{/* Header */}
			<button
				type="button"
				className={`
					flex items-center gap-2 w-full
					hover:bg-(--md-ref-color-surface-container-high)
					transition-colors duration-150 ease-in-out text-left
					${compact ? "px-3 py-2" : "px-4 py-3"}
				`.trim()}
				onClick={handleToggle}
				aria-expanded={isOpen}
			>
				<Icon
					name="expand_more"
					size={18}
					className={`
						transition-transform duration-200 ease-in-out shrink-0
						text-(--md-ref-color-on-surface-variant)
						${isOpen ? "rotate-180" : ""}
					`.trim()}
				/>
				<span
					className={`
						font-bold tracking-widest uppercase
						text-(--md-ref-color-on-surface-variant)
						${compact ? "text-[10px]" : "text-xs"}
					`.trim()}
				>
					{title}
				</span>
				{extra && <div className="ml-auto">{extra}</div>}
			</button>

			{/* Content with animation */}
			<div
				className="overflow-hidden transition-[height] duration-200 ease-in-out"
				style={{ height: typeof height === "number" ? `${height}px` : height }}
			>
				<div ref={contentRef}>
					{children}
				</div>
			</div>
		</div>
	);
};

/**
 * Hook to manage accordion state where only one panel can be open at a time.
 *
 * @example
 * ```tsx
 * const { openId, toggle, isOpen } = useAccordionState("plan");
 *
 * <AccordionPanel
 *   title="Plan"
 *   open={isOpen("plan")}
 *   onOpenChange={(open) => open && toggle("plan")}
 * >
 *   ...
 * </AccordionPanel>
 * ```
 */
export function useAccordionState(defaultOpenId: string | null = null) {
	const [openId, setOpenId] = useState<string | null>(defaultOpenId);

	const toggle = (id: string) => {
		setOpenId((prev) => (prev === id ? null : id));
	};

	const isOpen = (id: string) => openId === id;

	return { openId, toggle, isOpen };
}

export default AccordionPanel;
