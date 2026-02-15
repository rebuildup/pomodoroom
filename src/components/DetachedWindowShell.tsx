import type { ReactNode } from "react";
import TitleBar from "@/components/TitleBar";
import { useWindowControls } from "@/hooks/useWindowControls";

interface DetachedWindowShellProps {
	title: string;
	children: ReactNode;
	className?: string;
	contentClassName?: string;
	showMinMax?: boolean;
	disableRounding?: boolean;
}

export default function DetachedWindowShell({
	title,
	children,
	className = "",
	contentClassName = "",
	showMinMax = true,
	disableRounding = false,
}: DetachedWindowShellProps) {
	const controls = useWindowControls();

	return (
		<div
			data-window-transparent={controls.transparentFrame ? "true" : "false"}
			className={[
				"window-surface w-screen h-screen relative overflow-hidden select-none text-[var(--md-ref-color-on-surface)]",
				controls.transparentFrame ? "bg-transparent" : "",
				className,
			].join(" ")}
		>
			<TitleBar
				theme={controls.theme}
				title={title}
				position="absolute"
				showMinMax={showMinMax}
				showPinToggle={true}
				showThemeToggle={true}
				showTransparencyToggle={true}
				showWindowLockToggle={true}
				alwaysOnTop={controls.alwaysOnTop}
				isTransparentFrame={controls.transparentFrame}
				isWindowLocked={controls.isLocked}
				onTogglePin={controls.togglePin}
				onToggleTheme={controls.toggleTheme}
				onToggleTransparency={controls.toggleTransparency}
				onToggleWindowLock={controls.toggleWindowLock}
				disableRounding={disableRounding}
			/>
			<div className={["absolute inset-0", contentClassName].join(" ").trim()}>{children}</div>
		</div>
	);
}
