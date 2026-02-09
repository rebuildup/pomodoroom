import { Pause, Play, RotateCcw, Timer, Watch } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { playNotificationSound } from "@/utils/soundPlayer";

interface MiniTimerProps {
	id: number;
}

type TimerMode = "timer" | "stopwatch";

export default function MiniTimer({ id }: MiniTimerProps) {
	const [mode, setMode] = useLocalStorage<TimerMode>(
		`mini-timer-mode-${id}`,
		"timer",
	);
	const [savedDuration, setSavedDuration] = useLocalStorage(
		`mini-timer-duration-ms-${id}`,
		5 * 60 * 1000,
	);
	const [savedTimeLeft, setSavedTimeLeft] = useLocalStorage(
		`mini-timer-left-ms-${id}`,
		5 * 60 * 1000,
	);
	const [savedElapsed, setSavedElapsed] = useLocalStorage(
		`mini-timer-elapsed-ms-${id}`,
		0,
	);
	const [isActive, setIsActive] = useLocalStorage(
		`mini-timer-active-${id}`,
		false,
	);
	const [lastTick, setLastTick] = useLocalStorage(
		`mini-timer-last-tick-${id}`,
		Date.now(),
	);

	const [displayTime, setDisplayTime] = useState(
		mode === "timer" ? savedTimeLeft : savedElapsed,
	);

	const lastSaveRef = useRef<number>(Date.now());

	useEffect(() => {
		if (isActive) {
			setLastTick(Date.now());
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const runningTimeRef = useRef(
		mode === "timer" ? savedTimeLeft : savedElapsed,
	);

	useEffect(() => {
		runningTimeRef.current = mode === "timer" ? savedTimeLeft : savedElapsed;
	}, [mode, savedTimeLeft, savedElapsed]);

	useEffect(() => {
		if (!isActive) {
			return undefined;
		}
		let animationFrameId: number;

		const loop = () => {
			const now = Date.now();
			let currentDisplayTime = runningTimeRef.current;

			if (mode === "timer") {
				const realDelta = now - lastTick;
				currentDisplayTime = Math.max(0, savedTimeLeft - realDelta);

				if (currentDisplayTime <= 0) {
					setIsActive(false);
					playNotificationSound(0.5);
					if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
					setSavedTimeLeft(0);
					setDisplayTime(0);
					return;
				}
			} else {
				const realDelta = now - lastTick;
				currentDisplayTime = savedElapsed + realDelta;
			}

			setDisplayTime(currentDisplayTime);

			if (now - lastSaveRef.current > 1000) {
				if (mode === "timer") {
					setSavedTimeLeft(currentDisplayTime);
				} else {
					setSavedElapsed(currentDisplayTime);
				}
				setLastTick(now);
				lastSaveRef.current = now;
			}

			animationFrameId = requestAnimationFrame(loop);
		};

		animationFrameId = requestAnimationFrame(loop);

		return () => {
			cancelAnimationFrame(animationFrameId);
			const now = Date.now();
			const realDelta = now - lastTick;
			if (mode === "timer") {
				const finalTime = Math.max(0, savedTimeLeft - realDelta);
				setSavedTimeLeft(finalTime);
			} else {
				const finalTime = savedElapsed + realDelta;
				setSavedElapsed(finalTime);
			}
			setLastTick(now);
		};
	}, [
		isActive,
		mode,
		savedTimeLeft,
		savedElapsed,
		lastTick,
		setSavedTimeLeft,
		setSavedElapsed,
		setLastTick,
		setIsActive,
	]);

	const toggleTimer = () => {
		if (!isActive) {
			setLastTick(Date.now());
			lastSaveRef.current = Date.now();
		}
		setIsActive(!isActive);
	};

	const resetTimer = () => {
		setIsActive(false);
		if (mode === "timer") {
			setSavedTimeLeft(savedDuration);
			setDisplayTime(savedDuration);
		} else {
			setSavedElapsed(0);
			setDisplayTime(0);
		}
		setLastTick(Date.now());
	};

	const handleDurationChange = (type: "min" | "sec", value: string) => {
		const numVal = Number.parseInt(value);
		if (Number.isNaN(numVal)) return;

		let currentMinutes = Math.floor(savedDuration / 60000);
		let currentSeconds = Math.floor((savedDuration % 60000) / 1000);

		if (type === "min") {
			currentMinutes = Math.max(0, numVal);
		} else {
			currentSeconds = Math.max(0, Math.min(59, numVal));
		}

		const newDuration = currentMinutes * 60 * 1000 + currentSeconds * 1000;
		setSavedDuration(newDuration);
		setSavedTimeLeft(newDuration);
		setDisplayTime(newDuration);
		setIsActive(false);
	};

	const formatTime = (ms: number) => {
		const totalSeconds = Math.floor(ms / 1000);
		const m = Math.floor(totalSeconds / 60);
		const s = totalSeconds % 60;
		const centiseconds = Math.floor((ms % 1000) / 10);
		return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${centiseconds.toString().padStart(2, "0")}`;
	};

	return (
		<div className="flex flex-col w-full h-full p-4 text-gray-900">
			<div className="flex items-center justify-between mb-2 no-drag relative">
				<div className="flex-1" />
				<span className="text-xs font-bold uppercase tracking-wider opacity-70">
					{mode === "timer" ? "TIMER" : "STOPWATCH"}
				</span>
				<div className="flex-1 flex justify-end">
					<button
						type="button"
						onClick={() => {
							setIsActive(false);
							setMode(mode === "timer" ? "stopwatch" : "timer");
						}}
						className="p-1.5 rounded hover:bg-black/5 transition-colors text-gray-500 hover:text-gray-900"
						title={mode === "timer" ? "Switch to Stopwatch" : "Switch to Timer"}
					>
						{mode === "timer" ? <Watch size={14} /> : <Timer size={14} />}
					</button>
				</div>
			</div>

			<div className="flex-1 flex flex-col items-center justify-center gap-3 no-drag">
				<div className="text-4xl font-mono font-bold tracking-wider tabular-nums">
					{formatTime(displayTime)}
				</div>

				<div className="flex items-center gap-4">
					<button
						type="button"
						onClick={toggleTimer}
						aria-label={isActive ? "Pause timer" : "Start timer"}
						className="p-3 rounded-full transition-all bg-black text-white hover:bg-gray-800 shadow-lg active:scale-95"
					>
						{isActive ? (
							<Pause size={20} fill="currentColor" />
						) : (
							<Play size={20} fill="currentColor" />
						)}
					</button>
					<button
						type="button"
						onClick={resetTimer}
						aria-label="Reset timer"
						className="p-3 rounded-full transition-all bg-black/5 hover:bg-black/10 text-black active:scale-95"
					>
						<RotateCcw size={20} />
					</button>
				</div>

				<div className="h-8 flex items-center justify-center w-full">
					{mode === "timer" && !isActive && (
						<div className="flex items-center justify-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
							<div className="flex items-center gap-1">
								<input
									type="number"
									min="0"
									max="999"
									value={Math.floor(savedDuration / 60000)}
									onChange={(e) => handleDurationChange("min", e.target.value)}
									className="w-14 px-1 py-1 text-center rounded border bg-white/50 outline-none border-black/20 focus:border-black/50 focus:bg-white transition-colors text-sm"
								/>
								<span className="text-xs opacity-70 font-medium">m</span>
							</div>
							<div className="flex items-center gap-1">
								<input
									type="number"
									min="0"
									max="59"
									value={Math.floor((savedDuration % 60000) / 1000)}
									onChange={(e) => handleDurationChange("sec", e.target.value)}
									className="w-14 px-1 py-1 text-center rounded border bg-white/50 outline-none border-black/20 focus:border-black/50 focus:bg-white transition-colors text-sm"
								/>
								<span className="text-xs opacity-70 font-medium">s</span>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
