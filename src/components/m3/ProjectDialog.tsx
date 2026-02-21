/**
 * ProjectDialog - Create/Edit project dialog
 */
import { useEffect, useState } from "react";
import { Dialog } from "@/components/m3/Dialog";
import { TextField } from "@/components/m3/TextField";
import { DatePicker } from "@/components/m3/DateTimePicker";

// Keep for backward compatibility with other modules
export interface ProjectReferenceDraft {
	_key?: string;
	id?: string;
	kind: string;
	value: string;
	label?: string;
}

interface ProjectDialogProps {
	open: boolean;
	onClose: () => void;
	onSubmit: (
		name: string,
		description?: string,
		deadline?: string,
	) => void | Promise<void>;
	initialName?: string;
	initialDescription?: string;
}

export function ProjectDialog({
	open,
	onClose,
	onSubmit,
	initialName = "",
	initialDescription = "",
}: ProjectDialogProps) {
	const [name, setName] = useState(initialName);
	const [description, setDescription] = useState(initialDescription);
	const [deadline, setDeadline] = useState("");

	useEffect(() => {
		if (!open) return;
		setName(initialName);
		setDescription(initialDescription);
		setDeadline("");
	}, [open, initialName, initialDescription]);

	const handleSubmit = async () => {
		if (!name.trim()) return;
		await onSubmit(
			name.trim(),
			description.trim() || undefined,
			deadline || undefined,
		);
		setName("");
		setDescription("");
		setDeadline("");
		onClose();
	};

	return (
		<Dialog open={open} onClose={onClose} title="プロジェクトを作成">
			<div className="space-y-4">
				{/* Name field */}
				<TextField
					label="プロジェクト名"
					value={name}
					onChange={setName}
					placeholder="例: ウェブサイト開発, マーケティング"
					variant="underlined"
					maxLength={50}
				/>

				{/* Description field */}
				<TextField
					label="説明（オプション）"
					value={description}
					onChange={setDescription}
					placeholder="プロジェクトの詳細"
					variant="underlined"
					maxLength={200}
				/>

				{/* Deadline */}
				<div>
					<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
						期限（オプション）
					</label>
					<DatePicker value={deadline} onChange={setDeadline} variant="underlined" />
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

export default ProjectDialog;
