/**
 * ProjectDialog - Create/Edit project dialog
 */
import { useState } from "react";
import { Dialog } from "@/components/m3/Dialog";
import { TextField } from "@/components/m3/TextField";
import { Button } from "@/components/m3/Button";

interface ProjectDialogProps {
	open: boolean;
	onClose: () => void;
	onSubmit: (name: string, description?: string) => void;
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

	const handleSubmit = async () => {
		if (!name.trim()) return;
		await onSubmit(name.trim(), description.trim() || undefined);
		setName("");
		setDescription("");
		onClose();
	};

	return (
		<Dialog open={open} onClose={onClose} title="プロジェクトを作成">
			<div className="flex flex-col gap-4 py-4">
				{/* Name field */}
				<div>
					<TextField
						label="プロジェクト名"
						value={name}
						onChange={setName}
						placeholder="例: ウェブサイト開発, マーケティング"
						variant="underlined"
						maxLength={50}
					/>
				</div>

				{/* Description field */}
				<div>
					<TextField
						label="説明（オプション）"
						value={description}
						onChange={setDescription}
						placeholder="プロジェクトの詳細"
						variant="underlined"
						maxLength={200}
					/>
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

export default ProjectDialog;
