/**
 * Material 3 Reference Card Component
 *
 * Card for displaying project references (URLs, files, notes).
 * Styled identically to TaskCard compact mode.
 *
 * Reference: https://m3.material.io/components/cards/overview
 */

import { Icon } from "./Icon";
import { IconPillButton } from "./IconPillButton";
import type { MSIconName } from "./Icon";
import type { ProjectReference } from "@/types/schedule";

export interface ReferenceCardProps {
	/** Reference data (if in add mode, this is optional) */
	reference?: ProjectReference;
	/** Show as add card */
	addMode?: boolean;
	/** Callback when add card is clicked */
	onAddClick?: (e: React.MouseEvent) => void;
	/** Project ID for this reference (needed for note execution) */
	projectId?: string;
	/** Callback when card is clicked to execute */
	onExecute?: (reference: ProjectReference, projectId?: string) => void;
	/** Callback when reference is edited */
	onEdit?: (reference: ProjectReference) => void;
}

/**
 * Get reference kind icon name
 */
function getReferenceIcon(kind: string): MSIconName {
	const iconMap: Record<string, MSIconName> = {
		url: "link",
		link: "link",
		file: "description",
		folder: "folder",
		note: "note",
	};
	return iconMap[kind.toLowerCase()] || "bookmark";
}

/**
 * Truncate URL for display (keep filename visible)
 * Shows last part of path with filename, truncating from middle
 */
function truncateUrl(url: string, maxLength = 50): string {
	if (url.length <= maxLength) return url;

	// Find last path separator to preserve filename
	const lastSlash = Math.max(url.lastIndexOf("/"), url.lastIndexOf("\\"));

	if (lastSlash === -1) {
		// No path separator, just truncate from front
		return "..." + url.substring(url.length - maxLength + 3);
	}

	// Keep the filename and as much of the path as fits
	const filename = url.substring(lastSlash);
	const availableForPath = maxLength - filename.length - 4; // 4 for "..."

	if (availableForPath < 10) {
		// Not enough space, just show end of path
		return "..." + url.substring(url.length - maxLength + 3);
	}

	// Show start...end format: first part + ... + filename
	const startPart = url.substring(0, Math.min(availableForPath, url.lastIndexOf("/") !== -1 ? url.lastIndexOf("/") : url.lastIndexOf("\\")));
	return startPart + "..." + filename;
}

export function ReferenceCard({
	reference,
	addMode = false,
	onAddClick,
	projectId,
	onExecute,
	onEdit,
}: ReferenceCardProps) {
	// Add mode: match TaskCard add mode style exactly
	if (addMode) {
		return (
			<div
				onClick={(e) => {
					e.stopPropagation();
					onAddClick?.(e);
				}}
				role="button"
				tabIndex={0}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						e.stopPropagation();
						onAddClick?.(e as any);
					}
				}}
				className="group relative flex items-center justify-center p-2 rounded-md h-[52px]
					bg-[var(--md-ref-color-surface)]
					border border-[color:color-mix(in_srgb,var(--md-ref-color-outline-variant)_55%,transparent)]
					cursor-pointer
					hover:bg-[var(--md-ref-color-surface-container-low)]
					transition-colors duration-150 ease-out
				"
			>
				<Icon name="add" size={24} className="text-[var(--md-ref-color-primary)]" />
			</div>
		);
	}

	// Normal mode: match TaskCard compact mode style
	if (!reference) {
		return null;
	}

	const icon = getReferenceIcon(reference.kind);
	const displayLabel = reference.label || truncateUrl(reference.value);

	const handleClick = () => {
		onExecute?.(reference, projectId);
	};

	const handleEdit = () => {
		onEdit?.(reference);
	};

	return (
		<div
			className="group relative flex items-center gap-1.5 p-2 rounded-md h-[52px]
				bg-[var(--md-ref-color-surface)]
				border border-[color:color-mix(in_srgb,var(--md-ref-color-outline-variant)_55%,transparent)]
				cursor-pointer
				hover:bg-[var(--md-ref-color-surface-container-low)]
				transition-colors duration-150 ease-out
			"
			onClick={handleClick}
			role="button"
			tabIndex={0}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					handleClick();
				}
			}}
		>
			{/* Use IconPillButton to match TaskCard status icon style */}
			<div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
				<IconPillButton
					icon={icon}
					size="sm"
					className="text-[var(--md-ref-color-primary)] pointer-events-none"
				/>
			</div>
			<div className={`flex-1 min-w-0 flex items-center justify-between gap-2 ${onEdit ? "pr-8" : ""}`}>
				<h3 className="text-[13px] font-medium leading-5 text-[var(--md-ref-color-on-surface)] truncate flex-1 min-w-0">
					{displayLabel}
				</h3>
			</div>
			{onEdit && (
				<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
					<IconPillButton icon="edit" size="sm" onClick={handleEdit} />
				</div>
			)}
		</div>
	);
}
