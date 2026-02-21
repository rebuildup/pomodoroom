import { Icon } from "@/components/m3/Icon";
import { useCallback, useEffect, useRef, useState } from "react";
import { playNotificationSound } from "@/utils/soundPlayer";

interface MiniTimerProps {
	id: number;
}

type TimerMode = "timer" | "stopwatch";

// localStorage persistence removed - database-only architecture

export default function MiniTimer({ id: _id }: MiniTimerProps) {
	const [mode, setMode] = useState<TimerMode>("timer");
	const [savedDuration, setSavedDuration] = useState(5 * 60 * 1000);
	const [savedTimeLeft, setSavedTimeLeft] = useState(5 * 60 * 1000);
	const [savedElapsed, setSavedElapsed] = useState(0);
	const [isActive, setIsActive] = useState(false);
	const [lastTick, setLastTick] = useState(Date.now());

	const [displayTime, setDisplayTime] = useState(
		mode === "timer" ? savedTimeLeft : savedElapsed,
	);

	const lastSaveRef = useRef<number>(Date.now());

	// Use refs to avoid stale closure issues in the animation loop
	const savedTimeLeftRef = useRef(savedTimeLeft);
	const savedElapsedRef = useRef(savedElapsed);
	const lastTickRef = useRef(lastTick);

	useEffect(() => {
		savedTimeLeftRef.current = savedTimeLeft;
	}, [savedTimeLeft]);

	useEffect(() => {
		savedElapsedRef.current = savedElapsed;
	}, [savedElapsed]);

	useEffect(() => {
		lastTickRef.current = lastTick;
	}, [lastTick]);

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
				const realDelta = now - lastTickRef.current;
				currentDisplayTime = Math.max(0, savedTimeLeftRef.current - realDelta);

				if (currentDisplayTime <= 0) {
					setIsActive(false);
					playNotificationSound(0.5);
					if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
					setSavedTimeLeft(0);
					setDisplayTime(0);
					return;
				}
			} else {
				const realDelta = now - lastTickRef.current;
				currentDisplayTime = savedElapsedRef.current + realDelta;
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
			const realDelta = now - lastTickRef.current;
			if (mode === "timer") {
				const finalTime = Math.max(0, savedTimeLeftRef.current - realDelta);
				setSavedTimeLeft(finalTime);
			} else {
				const finalTime = savedElapsedRef.current + realDelta;
				setSavedElapsed(finalTime);
			}
			setLastTick(now);
		};
	}, [
		isActive,
		mode,
		setSavedTimeLeft,
		setSavedElapsed,
		setLastTick,
		setIsActive,
	]);

	const toggleTimer = useCallback(() => {
		if (!isActive) {
			setLastTick(Date.now());
			lastSaveRef.current = Date.now();
		}
		setIsActive(!isActive);
	}, [isActive, setLastTick, setIsActive]);

	const resetTimer = useCallback(() => {
		setIsActive(false);
		if (mode === "timer") {
			setSavedTimeLeft(savedDuration);
			setDisplayTime(savedDuration);
		} else {
			setSavedElapsed(0);
			setDisplayTime(0);
		}
		setLastTick(Date.now());
	}, [isActive, mode, savedDuration, setSavedTimeLeft, setSavedElapsed, setLastTick, setIsActive]);

	// ─── Keyboard Shortcuts ─────────────────────────────────────────────────────
	const handleKeyDown = useCallback((e: KeyboardEvent) => {
		// Don't trigger shortcuts when typing in inputs
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		) {
			return;
		}

		if (e.key === " " || e.code === "Space") {
			e.preventDefault();
			toggleTimer();
		} else if (e.key === "r" && !e.ctrlKey && !e.metaKey && !e.altKey) {
			e.preventDefault();
			resetTimer();
		}
	}, [toggleTimer, resetTimer]);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);

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
						{mode === "timer" ? <Icon name="watch_later" size={14} /> : <Icon name="timer" size={14} />}
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
							<Icon name="pause" size={20} filled />
						) : (
							<Icon name="play_arrow" size={20} filled />
						)}
					</button>
					<button
						type="button"
						onClick={resetTimer}
						aria-label="Reset timer"
						className="p-3 rounded-full transition-all bg-black/5 hover:bg-black/10 text-black active:scale-95"
					>
						<Icon name="repeat" size={20} />
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
