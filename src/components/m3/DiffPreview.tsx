/** Diff preview component for integration sync results */
import React from "react";
import type { SyncDiffResult, SyncDiffItem, DiffType } from "@/types";

const DIFF_COLORS: Record<DiffType, string> = {
	added: "text-green-600 dark:text-green-400",
	updated: "text-blue-600 dark:text-blue-400",
	deleted: "text-red-600 dark:text-red-400",
	skipped: "text-gray-500 dark:text-gray-400",
};

const DIFF_ICONS: Record<DiffType, string> = {
	added: "✓",
	updated: "↻",
	deleted: "✕",
	skipped: "○",
};

function DiffTypeBadge({ type }: { type: DiffType }) {
	return (
		<span
			className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${DIFF_COLORS[type]} bg-opacity-10`}
		>
			<span>{DIFF_ICONS[type]}</span>
			<span className="capitalize">{type}</span>
		</span>
	);
}

function DiffItem({ item }: { item: SyncDiffItem }) {
	const [showDetails, setShowDetails] = React.useState(false);
	const [resolvingConflict, setResolvingConflict] = React.useState(false);

	const hasConflicts = item.conflicts && item.conflicts.length > 0;

	return (
		<li className="border-b border-outline-variant last:border-0">
			<button
				type="button"
				className="w-full text-left px-4 py-3 hover:bg-surface-variant hover:bg-opacity-50 transition-colors"
				onClick={() => setShowDetails(!showDetails)}
			>
				<div className="flex items-center gap-3">
					<DiffTypeBadge type={item.type} />
					<span className="flex-1 font-medium text-on-surface">{item.title}</span>
					<span className="text-sm text-on-surface-variant capitalize">
						{item.entityType}
					</span>
					{hasConflicts && (
						<span className="text-xs px-2 py-0.5 rounded-full bg-error-container text-error">
							{item.conflicts!.length} conflict(s)
						</span>
					)}
					<span className="text-lg text-on-surface-variant">
						{showDetails ? "▼" : "▶"}
					</span>
				</div>
				{item.description && (
					<p className="mt-1 text-sm text-on-surface-variant pl-9">
						{item.description}
					</p>
				)}
			</button>

			{showDetails && (
				<div className="px-4 pb-3 pl-12">
					{/* Before/After comparison */}
					{(item.before || item.after) && (
						<div className="grid grid-cols-2 gap-4 mt-2 text-sm">
							{item.before && (
								<div className="p-2 rounded bg-error-container text-error-container-on">
									<div className="font-medium mb-1">Before</div>
									<pre className="text-xs overflow-auto">
										{JSON.stringify(item.before, null, 2)}
									</pre>
								</div>
							)}
							{item.after && (
								<div className="p-2 rounded bg-success-container text-success-container-on">
									<div className="font-medium mb-1">After</div>
									<pre className="text-xs overflow-auto">
										{JSON.stringify(item.after, null, 2)}
									</pre>
								</div>
							)}
						</div>
					)}

					{/* Conflicts resolution */}
					{hasConflicts && (
						<div className="mt-3 space-y-2">
							<div className="text-sm font-medium text-error">
								Conflicts detected:
							</div>
							{item.conflicts!.map((conflict, idx) => (
								<div key={idx} className="p-2 rounded bg-surface-variant">
									<div className="font-medium text-sm mb-1">
										{conflict.field}
									</div>
									<div className="grid grid-cols-2 gap-2 text-xs">
										<div>
											<span className="text-on-surface-variant">Local:</span>{" "}
											<span className="text-primary">
												{JSON.stringify(conflict.local)}
											</span>
										</div>
										<div>
											<span className="text-on-surface-variant">Remote:</span>{" "}
											<span className="text-secondary">
												{JSON.stringify(conflict.remote)}
											</span>
										</div>
									</div>
									{resolvingConflict && (
										<div className="mt-2 flex gap-2">
											<button
												type="button"
												className="px-3 py-1 rounded-full bg-primary text-on-primary text-xs font-medium hover:bg-primary-hover"
												onClick={() => {
													// TODO: Handle conflict resolution
												}}
											>
												Keep Local
											</button>
											<button
												type="button"
												className="px-3 py-1 rounded-full bg-secondary text-on-secondary text-xs font-medium hover:bg-secondary-hover"
												onClick={() => {
													// TODO: Handle conflict resolution
												}}
											>
												Keep Remote
											</button>
										</div>
									)}
								</div>
							))}
							<button
								type="button"
								className="mt-2 text-sm text-primary hover:underline"
								onClick={() => setResolvingConflict(!resolvingConflict)}
							>
								{resolvingConflict ? "Cancel" : "Resolve conflicts"}
							</button>
						</div>
					)}
				</div>
			)}
		</li>
	);
}

export function DiffPreview({
	diffResult,
	onConfirm,
	onCancel,
}: {
	diffResult: SyncDiffResult;
	onConfirm?: () => void;
	onCancel?: () => void;
}) {
	const counts = diffResult.diffs.reduce(
		(acc, item) => {
			acc[item.type]++;
			return acc;
		},
		{ added: 0, updated: 0, deleted: 0, skipped: 0 }
	);

	const hasChanges = diffResult.totalChanges > 0;

	return (
		<div className="p-6 max-w-2xl mx-auto">
			{/* Header */}
			<div className="mb-6">
				<h2 className="text-headline-small font-medium text-on-surface mb-2">
					Sync Preview: {diffResult.service}
				</h2>
				<p className="text-body-medium text-on-surface-variant">
					Review the changes before applying them
				</p>
			</div>

			{/* Summary */}
			<div className="flex gap-4 mb-6 p-4 rounded-lg bg-surface-variant">
				<div className="flex-1 text-center">
					<div className="text-2xl font-semibold text-green-600 dark:text-green-400">
						{counts.added}
					</div>
					<div className="text-xs text-on-surface-variant">Added</div>
				</div>
				<div className="flex-1 text-center">
					<div className="text-2xl font-semibold text-blue-600 dark:text-blue-400">
						{counts.updated}
					</div>
					<div className="text-xs text-on-surface-variant">Updated</div>
				</div>
				<div className="flex-1 text-center">
					<div className="text-2xl font-semibold text-red-600 dark:text-red-400">
						{counts.deleted}
					</div>
					<div className="text-xs text-on-surface-variant">Deleted</div>
				</div>
				<div className="flex-1 text-center">
					<div className="text-2xl font-semibold text-gray-500 dark:text-gray-400">
						{counts.skipped}
					</div>
					<div className="text-xs text-on-surface-variant">Skipped</div>
				</div>
			</div>

			{/* Diff list */}
			{hasChanges ? (
				<ul className="border rounded-lg bg-surface overflow-hidden">
					{diffResult.diffs.map((item) => (
						<DiffItem key={item.id} item={item} />
					))}
				</ul>
			) : (
				<div className="p-8 text-center rounded-lg bg-surface-variant">
					<p className="text-body-medium text-on-surface-variant">
						No changes detected
					</p>
				</div>
			)}

			{/* Errors */}
			{diffResult.errors && diffResult.errors.length > 0 && (
				<div className="mt-4 p-4 rounded-lg bg-error-container text-error">
					<div className="font-medium mb-2">Errors encountered:</div>
					<ul className="text-sm space-y-1">
						{diffResult.errors.map((err, idx) => (
							<li key={idx}>
								<strong>{err.item}:</strong> {err.message}
							</li>
						))}
					</ul>
				</div>
			)}

			{/* Actions */}
			{hasChanges && (
				<div className="mt-6 flex justify-end gap-3">
					{onCancel && (
						<button
							type="button"
							className="px-4 py-2 rounded-full text-body-large font-medium text-primary hover:bg-primary-container hover:bg-opacity-100"
							onClick={onCancel}
						>
							Cancel
						</button>
					)}
					{onConfirm && (
						<button
							type="button"
							className="px-6 py-2 rounded-full bg-primary text-on-primary text-body-large font-medium hover:bg-primary-hover"
							onClick={onConfirm}
						>
							Apply Changes
						</button>
					)}
				</div>
			)}

			{/* Timestamp */}
			<div className="mt-4 text-center text-xs text-on-surface-variant">
				Synced at {new Date(diffResult.syncedAt).toLocaleString()}
			</div>
		</div>
	);
}

export function DiffPreviewDialog({
	diffResult,
	open,
	onConfirm,
	onCancel,
}: {
	diffResult: SyncDiffResult;
	open: boolean;
	onConfirm?: () => void;
	onCancel?: () => void;
}) {
	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim">
			<div className="bg-surface rounded-2xl shadow-lg max-w-2xl w-full max-h-[80vh] overflow-auto">
				<DiffPreview diffResult={diffResult} onConfirm={onConfirm} onCancel={onCancel} />
			</div>
		</div>
	);
}
