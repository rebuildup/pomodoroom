import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
	buildInitialSplitPreview,
	validateSplitPreview,
	type SplitPreviewItem,
} from "@/utils/split-preview";

export interface SplitPreviewEditorProps {
	isOpen: boolean;
	title: string;
	totalMinutes: number;
	onAccept: (items: SplitPreviewItem[]) => void;
	onCancel: () => void;
}

function reorderItems(items: SplitPreviewItem[], fromId: string, toId: string): SplitPreviewItem[] {
	const fromIndex = items.findIndex((item) => item.id === fromId);
	const toIndex = items.findIndex((item) => item.id === toId);
	if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
		return items;
	}

	const next = [...items];
	const [moved] = next.splice(fromIndex, 1);
	next.splice(toIndex, 0, moved);
	return next;
}

export const SplitPreviewEditor: React.FC<SplitPreviewEditorProps> = ({
	isOpen,
	title,
	totalMinutes,
	onAccept,
	onCancel,
}) => {
	const [items, setItems] = useState<SplitPreviewItem[]>([]);
	const [draggingId, setDraggingId] = useState<string | null>(null);

	useEffect(() => {
		if (!isOpen) {
			return;
		}
		setItems(
			buildInitialSplitPreview({
				title,
				totalMinutes,
			}),
		);
	}, [isOpen, title, totalMinutes]);

	const validation = useMemo(
		() => validateSplitPreview(items, totalMinutes),
		[items, totalMinutes],
	);

	if (!isOpen) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-[140] bg-black/60 flex items-center justify-center p-4">
			<div className="w-full max-w-2xl rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
				<div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
					<div>
						<h3 className="text-lg font-semibold text-white">Split Preview</h3>
						<p className="text-xs text-gray-400 mt-0.5">分割プランを編集してから適用できます</p>
					</div>
					<button
						type="button"
						onClick={onCancel}
						className="px-3 py-1.5 text-sm rounded bg-gray-800 text-gray-300 hover:bg-gray-700"
					>
						閉じる
					</button>
				</div>

				<div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
					<div className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm">
						<div className="flex items-center justify-between">
							<span className="text-gray-300">合計時間</span>
							<span
								className={validation.isValid ? "text-green-400" : "text-red-400"}
								data-testid="split-total"
							>
								{validation.totalMinutes} / {validation.expectedTotalMinutes} 分
							</span>
						</div>
					</div>

					{validation.issues.length > 0 && (
						<div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2">
							<p className="text-sm font-medium text-red-300">検証エラー</p>
							<ul className="mt-1 text-xs text-red-200 space-y-1">
								{validation.issues.map((issue, idx) => (
									<li key={`${issue.id}-${idx}`}>{issue.message}</li>
								))}
							</ul>
						</div>
					)}

					<ul className="space-y-2">
						{items.map((item, index) => (
							<li
								key={item.id}
								draggable
								onDragStart={() => setDraggingId(item.id)}
								onDragOver={(event) => event.preventDefault()}
								onDrop={() => {
									if (!draggingId) {
										return;
									}
									setItems((prev) => reorderItems(prev, draggingId, item.id));
									setDraggingId(null);
								}}
								className="rounded-lg border border-gray-700 bg-gray-800 p-3"
								data-testid={`split-row-${item.id}`}
							>
								<div className="flex items-center gap-2">
									<span
										className={`px-2 py-0.5 text-xs rounded ${
											item.kind === "break"
												? "bg-amber-900/40 text-amber-300"
												: "bg-blue-900/40 text-blue-300"
										}`}
									>
										{item.kind === "break" ? "BREAK" : "FOCUS"}
									</span>
									<input
										type="text"
										value={item.title}
										onChange={(event) => {
											const value = event.target.value;
											setItems((prev) =>
												prev.map((entry) =>
													entry.id === item.id ? { ...entry, title: value } : entry,
												),
											);
										}}
										className="flex-1 rounded border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100"
										data-testid={`split-title-${item.id}`}
									/>
									<input
										type="number"
										min={1}
										step={1}
										value={item.durationMinutes}
										onChange={(event) => {
											const nextValue = Number(event.target.value);
											setItems((prev) =>
												prev.map((entry) =>
													entry.id === item.id
														? {
																...entry,
																durationMinutes: Number.isFinite(nextValue) ? nextValue : 0,
															}
														: entry,
												),
											);
										}}
										className="w-24 rounded border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100"
										data-testid={`split-duration-${item.id}`}
									/>
									<span className="text-xs text-gray-400">min</span>
								</div>
								<div className="mt-2 flex gap-2">
									<button
										type="button"
										onClick={() => {
											if (index === 0) {
												return;
											}
											setItems((prev) => reorderItems(prev, item.id, prev[index - 1].id));
										}}
										className="px-2 py-1 text-xs rounded bg-gray-700 text-gray-200 disabled:opacity-40"
										disabled={index === 0}
										aria-label={`Move up ${item.id}`}
									>
										↑
									</button>
									<button
										type="button"
										onClick={() => {
											if (index === items.length - 1) {
												return;
											}
											setItems((prev) => reorderItems(prev, item.id, prev[index + 1].id));
										}}
										className="px-2 py-1 text-xs rounded bg-gray-700 text-gray-200 disabled:opacity-40"
										disabled={index === items.length - 1}
										aria-label={`Move down ${item.id}`}
									>
										↓
									</button>
								</div>
							</li>
						))}
					</ul>
				</div>

				<div className="px-4 py-3 border-t border-gray-700 flex justify-end gap-2">
					<button
						type="button"
						onClick={onCancel}
						className="px-4 py-2 rounded text-sm bg-gray-800 text-gray-300 hover:bg-gray-700"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={() => onAccept(items)}
						disabled={!validation.isValid}
						className="px-4 py-2 rounded text-sm bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
					>
						Apply
					</button>
				</div>
			</div>
		</div>
	);
};
