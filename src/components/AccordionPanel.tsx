/**
 * AccordionPanel — Collapsible panel with smooth animation.
 *
 * Features:
 * - Expand/collapse animation using CSS grid
 * - Chevron icon rotation
 * - Toggle callback for parent coordination
 * localStorage persistence removed - database-only architecture
 */
import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/m3/Icon";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AccordionPanelProps {
	/** Panel title/label */
	title: string;
	/** Panel content */
	children: React.ReactNode;
	/** Default open state on first render */
	defaultOpen?: boolean;
	/** Callback when panel toggles */
	onToggle?: (open: boolean) => void;
	/** Optional header extra content (right side) */
	extra?: React.ReactNode;
	/** Compact variant with smaller padding */
	compact?: boolean;
	/** Override open state (controlled mode) */
	open?: boolean;
	/** Override onToggle (controlled mode) */
	onOpenChange?: (open: boolean) => void;
	className?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AccordionPanel({
	title,
	children,
	defaultOpen = false,
	onToggle,
	extra,
	compact = false,
	open: controlledOpen,
	onOpenChange,
	className = "",
}: AccordionPanelProps) {
	// Use controlled mode if provided, otherwise use internal state
	// localStorage persistence removed - use default value
	const [internalOpen, setInternalOpen] = useState(defaultOpen);

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
	}, [isOpen, height]);

	const handleToggle = () => {
		const newState = !isOpen;
		setIsOpen(newState);
		onToggle?.(newState);
	};

	return (
		<div className={`border-b border-(--color-border) ${className}`}>
			{/* Header */}
			<button
				type="button"
				className={`flex items-center gap-2 w-full hover:bg-(--color-surface) transition-colors text-left ${
					compact ? "px-3 py-1.5" : "px-4 py-2"
				}`}
				onClick={handleToggle}
				aria-expanded={isOpen}
			>
				<Icon
					name="expand_more"
					size={14}
					className={`transition-transform duration-200 shrink-0 text-(--color-text-muted) ${
						isOpen ? "rotate-180" : ""
					}`}
				/>
				<span
					className={`font-bold tracking-widest uppercase text-(--color-text-muted) ${
						compact ? "text-[10px]" : "text-xs"
					}`}
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
				<div ref={contentRef}>{children}</div>
			</div>
		</div>
	);
}

// ─── Export utility hook for coordinated panels ───────────────────────────────

/**
 * Hook to manage accordion state where only one panel can be open at a time.
 * Returns an object with open panel ID and toggle function.
 */
export function useAccordionState(defaultOpenId: string | null = null) {
	const [openId, setOpenId] = useState<string | null>(defaultOpenId);

	const toggle = (id: string) => {
		setOpenId((prev) => (prev === id ? null : id));
	};

	const isOpen = (id: string) => openId === id;

	return { openId, toggle, isOpen };
}
