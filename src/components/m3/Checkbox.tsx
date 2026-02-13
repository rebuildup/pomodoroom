/**
 * Checkbox component
 */
import { ReactNode } from "react";
import { Icon } from "./Icon";

interface CheckboxProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
	children?: ReactNode;
}

export function Checkbox({ checked, onChange, disabled = false, children }: CheckboxProps) {
	return (
		<label
			className="inline-flex items-center gap-2 cursor-pointer"
			style={{ opacity: disabled ? 0.5 : 1 }}
		>
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				disabled={disabled}
				className="w-5 h-5 rounded border-2 border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface)] checked:bg-[var(--md-sys-color-primary)] checked:border-[var(--md-sys-color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)] focus:ring-offset-2 transition-all cursor-pointer"
				style={{
					accentColor: checked ? "var(--md-sys-color-primary)" : undefined,
				}}
			/>
			<span className="text-sm text-[var(--md-sys-color-on-surface)]">
				{children}
			</span>
		</label>
	);
}

export default Checkbox;
