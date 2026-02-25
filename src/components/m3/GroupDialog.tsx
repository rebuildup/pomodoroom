/**
 * GroupDialog - Create/Edit group dialog
 *
 * Supports hierarchical group creation with nested structure.
 */
import { useState, useId } from "react";
import { Dialog } from "@/components/m3/Dialog";
import { TextField } from "@/components/m3/TextField";
import { useGroups } from "@/hooks/useGroups";

interface GroupDialogProps {
	open: boolean;
	onClose: () => void;
	onSubmit: (name: string, parentId?: string) => void;
	initialName?: string;
	initialParentId?: string;
	initialOrder?: number;
}

export function GroupDialog({
	open,
	onClose,
	onSubmit,
	initialName = "",
	initialParentId,
	initialOrder,
}: GroupDialogProps) {
	const { groups } = useGroups();
	void initialOrder; // Reserved for future use

	const parentGroupId = useId();
	const [name, setName] = useState(initialName);
	const [selectedParentId, setSelectedParentId] = useState<string | undefined>(initialParentId);

	const handleSubmit = async () => {
		if (!name.trim()) return;
		await onSubmit(name.trim(), selectedParentId);
		onClose();
	};

	// Get all groups that can be parents (exclude current group if editing)
	const availableParents = groups.filter((g) => !g.parentId);

	return (
		<Dialog open={open} onClose={onClose} title="グループを作成">
			<div className="space-y-4">
				{/* Name field */}
				<TextField
					label="グループ名"
					value={name}
					onChange={setName}
					placeholder="例: 仕事, 個人, 休憩"
					variant="underlined"
					maxLength={50}
				/>

				{/* Parent group selection */}
				<div>
					<label
						htmlFor={parentGroupId}
						className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1"
					>
						親グループ
					</label>
					<select
						id={parentGroupId}
						value={selectedParentId || ""}
						onChange={(e) => setSelectedParentId(e.target.value || undefined)}
						className="w-full h-10 px-0 bg-transparent border-b border-[var(--md-ref-color-outline-variant)] text-sm text-[var(--md-ref-color-on-surface)] focus:border-[var(--md-ref-color-primary)] outline-none transition-colors"
					>
						<option value="">なし（ルートグループ）</option>
						{availableParents.map((group) => (
							<option key={group.id} value={group.id}>
								{group.name}
							</option>
						))}
					</select>
				</div>

				{/* Actions */}
				<div className="flex justify-end gap-2 pt-4">
					<button
						type="button"
						onClick={onClose}
						className="h-9 px-4 text-sm font-medium text-[var(--md-ref-color-primary)] hover:bg-[var(--md-ref-color-surface-container)] rounded-lg transition-colors"
					>
						キャンセル
					</button>
					<button
						type="button"
						onClick={handleSubmit}
						disabled={!name.trim()}
						className="h-9 px-4 text-sm font-medium bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)] rounded-full disabled:opacity-50 transition-colors"
					>
						作成
					</button>
				</div>
			</div>
		</Dialog>
	);
}

export default GroupDialog;
