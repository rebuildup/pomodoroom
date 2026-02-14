/**
 * GroupDialog - Create/Edit group dialog
 *
 * Supports hierarchical group creation with nested structure.
 */
import { useState } from "react";
import { Dialog } from "@/components/m3/Dialog";
import { TextField } from "@/components/m3/TextField";
import { useGroups } from "@/hooks/useGroups";
import { Button } from "@/components/m3/Button";
import { Icon } from "@/components/m3/Icon";

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

	const [name, setName] = useState(initialName);
	const [parentSelectOpen, setParentSelectOpen] = useState(false);
	const [selectedParentId, setSelectedParentId] = useState<string | undefined>(initialParentId);

	const handleSubmit = async () => {
		if (!name.trim()) return;
		await onSubmit(name.trim(), selectedParentId);
		onClose();
	};

	const rootGroups = groups.filter(g => !g.parentId);

	return (
		<Dialog open={open} onClose={onClose} title="グループを作成">
			<div className="flex flex-col gap-4 py-4">
				{/* Name field */}
				<div>
					<TextField
						label="グループ名"
						value={name}
						onChange={setName}
						placeholder="例: 仕事, 個人, 休憩"
						variant="underlined"
						maxLength={50}
					/>
				</div>

				{/* Parent group selection */}
				<div>
					<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
						親グループ
					</label>
					<button
						type="button"
						onClick={() => setParentSelectOpen(!parentSelectOpen)}
						className="no-pill !bg-transparent hover:!bg-[var(--md-ref-color-surface-container-high)] w-full h-12 px-4 rounded-lg border border-[var(--md-ref-color-outline)] transition-colors text-left flex items-center justify-between"
					>
						{selectedParentId ? (
							<span className="text-sm text-[var(--md-ref-color-on-surface)]">
								親グループ: {groups.find(g => g.id === selectedParentId)?.name}
							</span>
						) : (
							<span className="text-sm text-[var(--md-ref-color-on-surface-variant)]">
								親グループを選択（なしの場合はルート）
							</span>
						)}
						<Icon name={parentSelectOpen ? "expand_less" : "expand_more"} size={20} />
					</button>

					{parentSelectOpen && (
						<div className="mt-2 p-2 rounded-lg border border-[var(--md-ref-color-outline)] bg-[var(--md-ref-color-surface)] max-h-60 overflow-y-auto">
							{rootGroups.length === 0 ? (
								<div className="px-4 py-2 text-sm text-[var(--md-ref-color-on-surface-variant)]">
									親グループがありません
								</div>
							) : (
								rootGroups.map((group) => (
									<button
										key={group.id}
										type="button"
										onClick={() => {
											setSelectedParentId(group.id);
											setParentSelectOpen(false);
										}}
										className="no-pill !bg-transparent hover:!bg-[var(--md-ref-color-surface-container-high)] w-full h-10 px-4 rounded-lg transition-colors flex items-center gap-2"
									>
										<Icon name="folder" size={16} />
										<span className="text-sm text-[var(--md-ref-color-on-surface)]">{group.name}</span>
									</button>
								))
							)}
							<button
								type="button"
								onClick={() => {
									setSelectedParentId(undefined);
									setParentSelectOpen(false);
								}}
								className="w-full h-10 px-4 rounded-lg hover:bg-[var(--md-ref-color-surface-container-high)] transition-colors flex items-center gap-2 mt-1"
							>
								<Icon name="close" size={16} />
								<span className="text-sm text-[var(--md-ref-color-on-surface)]">親グループなし</span>
							</button>
						</div>
					)}
				</div>

				{/* Actions */}
				<div className="flex justify-end gap-2 mt-4">
					<Button
						type="button"
						onClick={onClose}
						variant="text"
					>
						キャンセル
					</Button>
					<Button
						type="button"
						onClick={handleSubmit}
						disabled={!name.trim()}
					>
						作成
					</Button>
				</div>
			</div>
		</Dialog>
	);
}

export default GroupDialog;
