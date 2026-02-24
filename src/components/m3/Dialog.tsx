/**
 * Simple dialog overlay for dialogs
 */
import type { ReactNode } from "react";

interface DialogProps {
	open: boolean;
	onClose: () => void;
	title?: string;
	children: ReactNode;
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/50"
				onClick={onClose}
				onKeyDown={(e) => e.key === "Escape" && onClose()}
				role="button"
				tabIndex={0}
				aria-label="Close"
			/>

			{/* Dialog */}
			<div
				className="relative bg-[var(--md-sys-color-surface)] rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden"
				role="dialog"
				aria-modal="true"
				aria-labelledby={title ? "dialog-title" : undefined}
			>
				{/* Header */}
				{title && (
					<div className="px-6 py-4 flex items-center justify-between">
						<h2 className="text-lg font-medium text-[var(--md-sys-color-on-surface)]">{title}</h2>
						<button
							type="button"
							onClick={onClose}
							className="w-8 h-8 rounded-full hover:bg-[var(--md-sys-color-surface-container)] transition-colors flex items-center justify-center"
							aria-label="Close"
						>
							<span className="text-lg leading-none">×</span>
						</button>
					</div>
				)}

				{/* Content */}
				<div className="p-6 overflow-y-auto max-h-[70vh]">{children}</div>
			</div>
		</div>
	);
}

export default Dialog;
