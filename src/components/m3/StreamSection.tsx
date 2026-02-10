/**
 * Material 3 StreamSection Component
 *
 * Collapsible section for TaskStream with M3 styling.
 * Features:
 * - Smooth expand/collapse animation
 * - M3 list styling
 * - Section header with count and actions
 *
 * Reference: https://m3.material.io/components/lists/overview
 */

import React, { ReactNode, useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';

export interface StreamSectionProps {
	/**
	 * Section label/title
	 */
	label: string;

	/**
	 * Number of items in section
	 */
	count: number;

	/**
	 * Section content items
	 */
	children: ReactNode;

	/**
	 * Unique key for localStorage persistence
	 */
	storageKey: string;

	/**
	 * Default open state
	 */
	defaultOpen?: boolean;

	/**
	 * Extra content for header (right side)
	 */
	extra?: ReactNode;

	/**
	 * Additional CSS class
	 */
	className?: string;

	/**
	 * Compact variant with smaller padding
	 */
	compact?: boolean;
}

/**
 * Collapsible section component for TaskStream
 *
 * @example
 * ```tsx
 * <StreamSection
 *   label="Plan"
 *   count={5}
 *   storageKey="taskstream-plan"
 *   defaultOpen={true}
 *   extra={<span>~2h</span>}
 * >
 *   {items.map(item => <TaskStreamItem key={item.id} item={item} />)}
 * </StreamSection>
 * ```
 */
export const StreamSection: React.FC<StreamSectionProps> = ({
	label,
	count,
	children,
	storageKey,
	defaultOpen = false,
	extra,
	className = '',
	compact = false,
}) => {
	// Load open state from localStorage or use default
	const getStoredState = (): boolean => {
		try {
			const stored = localStorage.getItem(storageKey);
			return stored ? stored === 'true' : defaultOpen;
		} catch {
			return defaultOpen;
		}
	};

	const [isOpen, setIsOpen] = useState<boolean>(getStoredState);
	const contentRef = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState<number | 'auto'>(isOpen ? 'auto' : 0);

	// Persist open state to localStorage
	useEffect(() => {
		try {
			localStorage.setItem(storageKey, String(isOpen));
		} catch {
			// Ignore localStorage errors
		}
	}, [storageKey, isOpen]);

	// Animate height changes
	useEffect(() => {
		if (isOpen) {
			if (contentRef.current) {
				const scrollHeight = contentRef.current.scrollHeight;
				setHeight(scrollHeight);
				const timeout = setTimeout(() => setHeight('auto'), 200);
				return () => clearTimeout(timeout);
			}
			setHeight('auto');
		} else {
			if (contentRef.current) {
				const currentHeight = contentRef.current.scrollHeight;
				setHeight(currentHeight);
				const timeout = setTimeout(() => setHeight(0), 0);
				return () => clearTimeout(timeout);
			}
			setHeight(0);
		}
		return undefined;
	}, [isOpen]);

	// Recalculate on content changes
	useEffect(() => {
		if (isOpen && height !== 'auto' && contentRef.current) {
			setHeight(contentRef.current.scrollHeight);
		}
	}, [children, isOpen, height]);

	const handleToggle = () => {
		setIsOpen((prev) => !prev);
	};

	return (
		<div className={`border-b border-[var(--md-ref-color-outline-variant)] ${className}`.trim()}>
			{/* Header */}
			<button
				type="button"
				className={`
					flex items-center gap-2 w-full
					hover:bg-[var(--md-ref-color-surface-container-high)]
					transition-colors duration-150 ease-in-out
					text-left
					${compact ? 'px-3 py-2' : 'px-4 py-3'}
				`.trim()}
				onClick={handleToggle}
				aria-expanded={isOpen}
			>
				<Icon
					name="expand_more"
					size={20}
					className={`
						shrink-0
						text-[var(--md-ref-color-on-surface-variant)]
						transition-transform duration-200 ease-in-out
						${isOpen ? 'rotate-180' : ''}
					`.trim()}
				/>
				<span
					className={`
						font-medium tracking-wide
						text-[var(--md-ref-color-on-surface-variant)]
						${compact ? 'text-xs' : 'text-sm'}
					`.trim()}
					style={{ font: 'var(--md-sys-typescale-label-large)' }}
				>
					{label}
				</span>
				{count > 0 && (
					<span
						className={`
							font-medium text-[var(--md-ref-color-on-surface-variant)]
							${compact ? 'text-xs' : 'text-sm'}
						`.trim()}
					>
						{count}
					</span>
				)}
				{extra && <div className="ml-auto">{extra}</div>}
			</button>

			{/* Content with animation */}
			<div
				className="overflow-hidden transition-[height] duration-200 ease-in-out"
				style={{ height: typeof height === 'number' ? `${height}px` : height }}
			>
				<div ref={contentRef}>
					{/* M3 List styling */}
					<div
						className={`
							divide-y divide-[var(--md-ref-color-outline-variant)]
							${compact ? '' : ''}
						`.trim()}
					>
						{children}
					</div>
				</div>
			</div>
		</div>
	);
};

export default StreamSection;
