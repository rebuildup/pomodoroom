import {
	animate,
	motion,
	useMotionValue,
	useMotionValueEvent,
	useTransform,
} from "motion/react";
import React, { useEffect, useRef, useState } from "react";

const MAX_OVERFLOW = 50;

const DEFAULT_LEFT_ICON = <>-</>;
const DEFAULT_RIGHT_ICON = <>+</>;

interface ElasticSliderProps {
	defaultValue?: number;
	startingValue?: number;
	maxValue?: number;
	className?: string;
	isStepped?: boolean;
	stepSize?: number;
	leftIcon?: React.ReactNode;
	rightIcon?: React.ReactNode;
	onChange?: (value: number) => void;
	showValue?: boolean;
	ariaLabel?: string;
}

const ElasticSlider: React.FC<ElasticSliderProps> = ({
	defaultValue = 50,
	startingValue = 0,
	maxValue = 100,
	className = "",
	isStepped = false,
	stepSize = 1,
	leftIcon = DEFAULT_LEFT_ICON,
	rightIcon = DEFAULT_RIGHT_ICON,
	onChange,
	showValue = false,
	ariaLabel,
}) => {
	return (
		<div
			className={`flex flex-col items-center justify-center gap-4 w-48 ${className}`}
		>
			<Slider
				defaultValue={defaultValue}
				startingValue={startingValue}
				maxValue={maxValue}
				isStepped={isStepped}
				stepSize={stepSize}
				leftIcon={leftIcon}
				rightIcon={rightIcon}
				onChange={onChange}
				showValue={showValue}
				ariaLabel={ariaLabel}
			/>
		</div>
	);
};

interface SliderProps {
	defaultValue: number;
	startingValue: number;
	maxValue: number;
	isStepped: boolean;
	stepSize: number;
	leftIcon: React.ReactNode;
	rightIcon: React.ReactNode;
	onChange?: (value: number) => void;
	showValue?: boolean;
	ariaLabel?: string;
}

const Slider: React.FC<SliderProps> = ({
	defaultValue,
	startingValue,
	maxValue,
	isStepped,
	stepSize,
	leftIcon,
	rightIcon,
	onChange,
	showValue = false,
	ariaLabel,
}) => {
	const [value, setValue] = useState<number>(defaultValue);
	const sliderRef = useRef<HTMLDivElement>(null);
	const [region, setRegion] = useState<"left" | "middle" | "right">("middle");
	const clientX = useMotionValue(0);
	const overflow = useMotionValue(0);
	const scale = useMotionValue(1);

	useEffect(() => {
		setValue(defaultValue);
	}, [defaultValue]);

	useMotionValueEvent(clientX, "change", (latest: number) => {
		if (sliderRef.current) {
			const { left, right } = sliderRef.current.getBoundingClientRect();
			let newValue: number;
			if (latest < left) {
				setRegion("left");
				newValue = left - latest;
			} else if (latest > right) {
				setRegion("right");
				newValue = latest - right;
			} else {
				setRegion("middle");
				newValue = 0;
			}
			overflow.jump(decay(newValue, MAX_OVERFLOW));
		}
	});

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (e.buttons > 0 && sliderRef.current) {
			const { left, width } = sliderRef.current.getBoundingClientRect();
			let newValue =
				startingValue +
				((e.clientX - left) / width) * (maxValue - startingValue);
			if (isStepped) {
				newValue = Math.round(newValue / stepSize) * stepSize;
			}
			newValue = Math.min(Math.max(newValue, startingValue), maxValue);
			setValue(newValue);
			onChange?.(newValue);
			clientX.jump(e.clientX);
		}
	};

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		handlePointerMove(e);
		e.currentTarget.setPointerCapture(e.pointerId);
	};

	const handlePointerUp = () => {
		animate(overflow, 0, { type: "spring", bounce: 0.5 });
	};

	const getRangePercentage = (): number => {
		const totalRange = maxValue - startingValue;
		if (totalRange === 0) return 0;
		return ((value - startingValue) / totalRange) * 100;
	};

	return (
		<>
			<motion.div
				onHoverStart={() => animate(scale, 1.06)}
				onHoverEnd={() => animate(scale, 1)}
				onTouchStart={() => animate(scale, 1.06)}
				onTouchEnd={() => animate(scale, 1)}
				style={{
					scale,
					opacity: useTransform(scale, [1, 1.06], [0.85, 1]),
				}}
				className="flex w-full touch-none select-none items-center justify-center gap-4"
			>
				<motion.div
					animate={{
						scale: region === "left" ? [1, 1.4, 1] : 1,
						transition: { duration: 0.25 },
					}}
					style={{
						x: useTransform(() =>
							region === "left" ? -overflow.get() / scale.get() : 0,
						),
					}}
				>
					{leftIcon}
				</motion.div>

				<div
					ref={sliderRef}
					role="slider"
					aria-label={ariaLabel || "Slider"}
					aria-valuemin={startingValue}
					aria-valuemax={maxValue}
					aria-valuenow={value}
					className="relative flex w-full max-w-xs flex-grow cursor-grab touch-none select-none items-center py-4"
					onPointerMove={handlePointerMove}
					onPointerDown={handlePointerDown}
					onPointerUp={handlePointerUp}
				>
					<motion.div
						style={{
							scaleX: useTransform(() => {
								if (sliderRef.current) {
									const { width } = sliderRef.current.getBoundingClientRect();
									return 1 + overflow.get() / width;
								}
								return 1;
							}),
							scaleY: useTransform(overflow, [0, MAX_OVERFLOW], [1, 0.8]),
							transformOrigin: useTransform(() => {
								if (sliderRef.current) {
									const { left, width } =
										sliderRef.current.getBoundingClientRect();
									return clientX.get() < left + width / 2 ? "right" : "left";
								}
								return "center";
							}),
							height: useTransform(scale, [1, 1.06], [6, 9]),
							marginTop: useTransform(scale, [1, 1.06], [0, -2]),
							marginBottom: useTransform(scale, [1, 1.06], [0, -2]),
						}}
						className="flex flex-grow"
					>
						<div className="relative h-full flex-grow overflow-hidden rounded-full bg-[var(--md-ref-color-surface-container-highest)]">
							<div
								className="absolute h-full bg-[var(--md-ref-color-primary)] rounded-full"
								style={{ width: `${getRangePercentage()}%` }}
							/>
						</div>
					</motion.div>
				</div>

				<motion.div
					animate={{
						scale: region === "right" ? [1, 1.4, 1] : 1,
						transition: { duration: 0.25 },
					}}
					style={{
						x: useTransform(() =>
							region === "right" ? overflow.get() / scale.get() : 0,
						),
					}}
				>
					{rightIcon}
				</motion.div>
			</motion.div>
			{showValue && (
				<p className="absolute text-[var(--md-ref-color-on-surface-variant)] transform -translate-y-4 text-xs font-medium tracking-wide">
					{Math.round(value)}
				</p>
			)}
		</>
	);
};

function decay(value: number, max: number): number {
	if (max === 0) return 0;
	const entry = value / max;
	const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);
	return sigmoid * max;
}

export default ElasticSlider;
