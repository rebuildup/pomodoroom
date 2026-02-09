/**
 * Dock -- A macOS-like dock component with magnification effect.
 *
 * This component was extracted from PomodoroTimer to allow independent use.
 * Can be used in any view that needs quick access to features.
 */
import { useState, useRef, useEffect } from "react";
import React from "react";

export interface DockButtonProps {
	icon: React.ComponentType<{ size: number; className?: string }>;
	label: string;
	onClick: () => void;
	active?: boolean;
	theme: "light" | "dark";
	badge?: string | number;
}

export function DockButton({
	icon: Icon,
	label,
	onClick,
	active,
	theme,
	badge,
}: DockButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={label}
			className={`relative p-2.5 rounded-xl transition-all duration-200 ${
				active
					? theme === "dark"
						? "bg-white/20 text-white"
						: "bg-black/15 text-gray-900"
					: theme === "dark"
						? "text-gray-400 hover:text-white hover:bg-white/10"
						: "text-gray-500 hover:text-gray-900 hover:bg-black/5"
			}`}
		>
			<Icon size={20} />
			{badge !== undefined && (
				<span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-blue-500 text-white text-[9px] font-bold px-1">
					{badge}
				</span>
			)}
		</button>
	);
}

function DockItem({
	children,
	mouseX,
}: {
	children: React.ReactNode;
	mouseX: number | null;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);

	useEffect(() => {
		if (mouseX === null || !ref.current) {
			setScale(1);
			return;
		}
		const rect = ref.current.getBoundingClientRect();
		const center = rect.left + rect.width / 2;
		const distance = Math.abs(mouseX - center);
		const maxDistance = 120;
		const newScale = 1 + Math.max(0, 1 - distance / maxDistance) * 0.35;
		setScale(newScale);
	}, [mouseX]);

	return (
		<div
			ref={ref}
			className="transition-transform duration-150 origin-bottom"
			style={{ transform: `scale(${scale})` }}
		>
			{children}
		</div>
	);
}

export interface DockProps {
	children: React.ReactNode;
	theme: "light" | "dark";
	className?: string;
}

export function Dock({
	children,
	theme,
	className = "",
}: DockProps) {
	const [mouseX, setMouseX] = useState<number | null>(null);
	const childArray = React.Children.toArray(children);

	return (
		<div
			className={`fixed bottom-3 left-1/2 -translate-x-1/2 z-50 flex items-end gap-1 px-3 py-2 rounded-2xl backdrop-blur-xl border transition-colors duration-300 ${
				theme === "dark"
					? "bg-gray-900/70 border-white/10"
					: "bg-white/70 border-black/10 shadow-lg"
			} ${className}`}
			onMouseMove={(e) => setMouseX(e.clientX)}
			onMouseLeave={() => setMouseX(null)}
		>
			{childArray.map((child, i) => (
				<DockItem key={i} mouseX={mouseX}>
					{child}
				</DockItem>
			))}
		</div>
	);
}

export default Dock;
