/**
 * ProjectDialog - Create/Edit project dialog
 */
import { useEffect, useState } from "react";
import { Dialog } from "@/components/m3/Dialog";
import { TextField } from "@/components/m3/TextField";
import { Button } from "@/components/m3/Button";
import { Icon } from "@/components/m3/Icon";
import { DatePicker } from "@/components/m3/DateTimePicker";

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
		references?: ProjectReferenceDraft[],
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
	const createRefDraft = (partial?: Partial<ProjectReferenceDraft>): ProjectReferenceDraft => ({
		_key: crypto.randomUUID(),
		kind: partial?.kind ?? "link",
		value: partial?.value ?? "",
		label: partial?.label ?? "",
		id: partial?.id,
	});

	const [name, setName] = useState(initialName);
	const [description, setDescription] = useState(initialDescription);
	const [deadline, setDeadline] = useState("");
	const [references, setReferences] = useState<ProjectReferenceDraft[]>([
		createRefDraft(),
	]);

	useEffect(() => {
		if (!open) return;
		setName(initialName);
		setDescription(initialDescription);
		setDeadline("");
		setReferences([createRefDraft()]);
	}, [open, initialName, initialDescription]);

	const updateReference = (
		index: number,
		field: keyof ProjectReferenceDraft,
		value: string,
	) => {
		setReferences((prev) =>
			prev.map((ref, i) => (i === index ? { ...ref, [field]: value } : ref)),
		);
	};

	const handleSubmit = async () => {
		if (!name.trim()) return;
		const validRefs = references
			.map((ref) => ({
				...(ref.id ? { id: ref.id } : {}),
				kind: ref.kind.trim() || "link",
				value: ref.value.trim(),
				label: ref.label?.trim() || undefined,
			}))
			.filter((ref) => ref.value.length > 0);
		await onSubmit(
			name.trim(),
			description.trim() || undefined,
			deadline || undefined,
			validRefs,
		);
		setName("");
		setDescription("");
		setDeadline("");
		setReferences([createRefDraft()]);
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

				<div>
					<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
						期限（オプション）
					</label>
					<DatePicker value={deadline} onChange={setDeadline} variant="underlined" />
				</div>

				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)]">
							リファレンス
						</label>
						<button
							type="button"
							onClick={() =>
								setReferences((prev) => [...prev, createRefDraft()])
							}
							className="h-7 px-2 rounded-full border border-[var(--md-ref-color-outline)] text-xs text-[var(--md-ref-color-on-surface)] hover:bg-[var(--md-ref-color-surface-container-high)] transition-colors"
						>
							追加
						</button>
					</div>
					{references.map((ref, index) => (
						<div
							key={ref._key ?? `project-ref-${index}`}
							className="rounded-lg border border-[var(--md-ref-color-outline-variant)] p-2 space-y-2"
						>
							<div className="flex gap-2">
								<TextField
									label="種別"
									value={ref.kind}
									onChange={(value) => updateReference(index, "kind", value)}
									placeholder="link/file/note"
									variant="underlined"
								/>
								<TextField
									label="ラベル"
									value={ref.label ?? ""}
									onChange={(value) => updateReference(index, "label", value)}
									placeholder="任意"
									variant="underlined"
								/>
							</div>
							<div className="flex items-center gap-2">
								<div className="flex-1">
									<TextField
										label="URL / パス / メモ"
										value={ref.value}
										onChange={(value) => updateReference(index, "value", value)}
										placeholder="https://... / C:\\... / note"
										variant="underlined"
									/>
								</div>
								<button
									type="button"
									onClick={() =>
										setReferences((prev) =>
											prev.length <= 1 ? prev : prev.filter((_, i) => i !== index),
										)
									}
									className="h-8 w-8 rounded-full border border-[var(--md-ref-color-outline)] flex items-center justify-center text-[var(--md-ref-color-on-surface)] hover:bg-[var(--md-ref-color-surface-container-high)] transition-colors"
									aria-label="リファレンスを削除"
								>
									<Icon name="close" size={16} />
								</button>
							</div>
						</div>
					))}
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
