/**
 * MainView -- Main timer view with PomodoroTimer component.
 *
 * This is the primary view showing the Pomodoro timer with all controls.
 */
import PomodoroTimer from "@/components/PomodoroTimer";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useRightClickDrag } from "@/hooks/useRightClickDrag";
import type { PomodoroSettings } from "@/types";
import { DEFAULT_SETTINGS } from "@/constants/defaults";

export default function MainView() {
	// Use shared right-click drag hook
	const { handleRightDown } = useRightClickDrag();

	const [settings] = useLocalStorage<PomodoroSettings>(
		"pomodoroom-settings",
		DEFAULT_SETTINGS,
	);
	const theme = settings.theme ?? "dark";

	return (
		<div
			className={`w-screen h-screen flex flex-col select-none overflow-hidden ${
				theme === "dark"
					? "bg-gray-950 text-white"
					: "bg-white text-gray-900"
			}`}
			onMouseDown={handleRightDown}
			onContextMenu={(e) => e.preventDefault()}
		>
			<PomodoroTimer />
		</div>
	);
}
