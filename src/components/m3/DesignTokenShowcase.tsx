/**
 * Material 3 Design Tokens Showcase
 *
 * This component displays all M3 design tokens for visual verification.
 * Access via /tokens route or for development testing.
 */

import React, { useState } from "react";

export const DesignTokenShowcase: React.FC = () => {
	const [isDark, setIsDark] = useState(false);

	const toggleTheme = () => {
		setIsDark(!isDark);
		document.documentElement.classList.toggle("dark");
	};

	return (
		<div
			className="min-h-screen p-8 md:p-12"
			style={{
				backgroundColor: "var(--md-ref-color-surface)",
				color: "var(--md-ref-color-on-surface)",
			}}
		>
			{/* Theme Toggle */}
			<div className="fixed top-4 right-4 z-50">
				<button
					type="button"
					onClick={toggleTheme}
					className="px-4 py-2 rounded-full"
					style={{
						backgroundColor: "var(--md-ref-color-primary-container)",
						color: "var(--md-ref-color-on-primary-container)",
					}}
				>
					{isDark ? "Light" : "Dark"}
				</button>
			</div>

			<div className="max-w-6xl mx-auto space-y-12">
				{/* Header */}
				<header>
					<h1
						className="text-4xl font-bold mb-2"
						style={{ font: "var(--md-sys-typescale-display-small)" }}
					>
						Material 3 Design Tokens
					</h1>
					<p className="text-lg opacity-70" style={{ font: "var(--md-sys-typescale-body-large)" }}>
						Visual verification of M3 color system, typography, spacing, and shapes
					</p>
				</header>

				{/* Color System */}
				<section>
					<h2
						className="text-2xl font-semibold mb-6"
						style={{ font: "var(--md-sys-typescale-headline-medium)" }}
					>
						Color System
					</h2>

					{/* Primary */}
					<ColorRow
						title="Primary"
						colors={[
							{ name: "primary", ref: "--md-ref-color-primary" },
							{ name: "on-primary", ref: "--md-ref-color-on-primary" },
							{ name: "primary-container", ref: "--md-ref-color-primary-container" },
							{ name: "on-primary-container", ref: "--md-ref-color-on-primary-container" },
						]}
					/>

					{/* Secondary */}
					<ColorRow
						title="Secondary"
						colors={[
							{ name: "secondary", ref: "--md-ref-color-secondary" },
							{ name: "on-secondary", ref: "--md-ref-color-on-secondary" },
							{ name: "secondary-container", ref: "--md-ref-color-secondary-container" },
							{ name: "on-secondary-container", ref: "--md-ref-color-on-secondary-container" },
						]}
					/>

					{/* Tertiary */}
					<ColorRow
						title="Tertiary"
						colors={[
							{ name: "tertiary", ref: "--md-ref-color-tertiary" },
							{ name: "on-tertiary", ref: "--md-ref-color-on-tertiary" },
							{ name: "tertiary-container", ref: "--md-ref-color-tertiary-container" },
							{ name: "on-tertiary-container", ref: "--md-ref-color-on-tertiary-container" },
						]}
					/>

					{/* Error */}
					<ColorRow
						title="Error"
						colors={[
							{ name: "error", ref: "--md-ref-color-error" },
							{ name: "on-error", ref: "--md-ref-color-on-error" },
							{ name: "error-container", ref: "--md-ref-color-error-container" },
							{ name: "on-error-container", ref: "--md-ref-color-on-error-container" },
						]}
					/>

					{/* Surface */}
					<ColorRow
						title="Surface"
						colors={[
							{ name: "surface", ref: "--md-ref-color-surface" },
							{ name: "on-surface", ref: "--md-ref-color-on-surface" },
							{ name: "surface-variant", ref: "--md-ref-color-surface-variant" },
							{ name: "on-surface-variant", ref: "--md-ref-color-on-surface-variant" },
						]}
					/>

					{/* Surface Container */}
					<ColorRow
						title="Surface Container"
						colors={[
							{ name: "surface-container-lowest", ref: "--md-ref-color-surface-container-lowest" },
							{ name: "surface-container-low", ref: "--md-ref-color-surface-container-low" },
							{ name: "surface-container", ref: "--md-ref-color-surface-container" },
							{ name: "surface-container-high", ref: "--md-ref-color-surface-container-high" },
							{
								name: "surface-container-highest",
								ref: "--md-ref-color-surface-container-highest",
							},
						]}
					/>

					{/* Outline */}
					<ColorRow
						title="Outline"
						colors={[
							{ name: "outline", ref: "--md-ref-color-outline" },
							{ name: "outline-variant", ref: "--md-ref-color-outline-variant" },
						]}
					/>
				</section>

				{/* Typography */}
				<section>
					<h2
						className="text-2xl font-semibold mb-6"
						style={{ font: "var(--md-sys-typescale-headline-medium)" }}
					>
						Typography Scale
					</h2>

					<div className="space-y-6">
						<TypeSample name="Display Large" token="--md-sys-typescale-display-large" />
						<TypeSample name="Display Medium" token="--md-sys-typescale-display-medium" />
						<TypeSample name="Display Small" token="--md-sys-typescale-display-small" />
						<TypeSample name="Headline Large" token="--md-sys-typescale-headline-large" />
						<TypeSample name="Headline Medium" token="--md-sys-typescale-headline-medium" />
						<TypeSample name="Headline Small" token="--md-sys-typescale-headline-small" />
						<TypeSample name="Title Large" token="--md-sys-typescale-title-large" />
						<TypeSample name="Title Medium" token="--md-sys-typescale-title-medium" />
						<TypeSample name="Title Small" token="--md-sys-typescale-title-small" />
						<TypeSample name="Body Large" token="--md-sys-typescale-body-large" />
						<TypeSample name="Body Medium" token="--md-sys-typescale-body-medium" />
						<TypeSample name="Body Small" token="--md-sys-typescale-body-small" />
						<TypeSample name="Label Large" token="--md-sys-typescale-label-large" />
						<TypeSample name="Label Medium" token="--md-sys-typescale-label-medium" />
						<TypeSample name="Label Small" token="--md-sys-typescale-label-small" />
					</div>
				</section>

				{/* Spacing */}
				<section>
					<h2
						className="text-2xl font-semibold mb-6"
						style={{ font: "var(--md-sys-typescale-headline-medium)" }}
					>
						Spacing (4px grid)
					</h2>

					<div className="space-y-3">
						<SpacingShowcase name="xs" token="--md-sys-spacing-xs" />
						<SpacingShowcase name="sm" token="--md-sys-spacing-sm" />
						<SpacingShowcase name="md" token="--md-sys-spacing-md" />
						<SpacingShowcase name="lg" token="--md-sys-spacing-lg" />
						<SpacingShowcase name="xl" token="--md-sys-spacing-xl" />
						<SpacingShowcase name="2xl" token="--md-sys-spacing-2xl" />
						<SpacingShowcase name="3xl" token="--md-sys-spacing-3xl" />
						<SpacingShowcase name="4xl" token="--md-sys-spacing-4xl" />
						<SpacingShowcase name="5xl" token="--md-sys-spacing-5xl" />
						<SpacingShowcase name="6xl" token="--md-sys-spacing-6xl" />
					</div>
				</section>

				{/* Corner Radius */}
				<section>
					<h2
						className="text-2xl font-semibold mb-6"
						style={{ font: "var(--md-sys-typescale-headline-medium)" }}
					>
						Corner Radius
					</h2>

					<div className="flex flex-wrap gap-4">
						<CornerShowcase name="None" token="--md-sys-shape-corner-none" />
						<CornerShowcase name="XS" token="--md-sys-shape-corner-extra-small" />
						<CornerShowcase name="Small" token="--md-sys-shape-corner-small" />
						<CornerShowcase name="Medium" token="--md-sys-shape-corner-medium" />
						<CornerShowcase name="Large" token="--md-sys-shape-corner-large" />
						<CornerShowcase name="XL" token="--md-sys-shape-corner-extra-large" />
						<CornerShowcase name="Full" token="--md-sys-shape-corner-full" />
					</div>
				</section>

				{/* Elevation */}
				<section>
					<h2
						className="text-2xl font-semibold mb-6"
						style={{ font: "var(--md-sys-typescale-headline-medium)" }}
					>
						Elevation (Shadows)
					</h2>

					<div className="flex flex-wrap gap-6">
						<ElevationShowcase name="Level 0" token="--md-sys-elevation-level0" />
						<ElevationShowcase name="Level 1" token="--md-sys-elevation-level1" />
						<ElevationShowcase name="Level 2" token="--md-sys-elevation-level2" />
						<ElevationShowcase name="Level 3" token="--md-sys-elevation-level3" />
						<ElevationShowcase name="Level 4" token="--md-sys-elevation-level4" />
						<ElevationShowcase name="Level 5" token="--md-sys-elevation-level5" />
					</div>
				</section>
			</div>
		</div>
	);
};

// Helper components
interface Color {
	name: string;
	ref: string;
}

const ColorRow: React.FC<{ title: string; colors: Color[] }> = ({ title, colors }) => {
	return (
		<div className="mb-8">
			<h3
				className="text-lg font-medium mb-3"
				style={{ font: "var(--md-sys-typescale-title-medium)" }}
			>
				{title}
			</h3>
			<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
				{colors.map((color) => (
					<ColorSwatch key={color.name} name={color.name} ref={color.ref} />
				))}
			</div>
		</div>
	);
};

const ColorSwatch: React.FC<{ name: string; ref: string }> = ({ name, ref: refToken }) => {
	const [value, setValue] = React.useState("");

	React.useEffect(() => {
		const computed = getComputedStyle(document.documentElement).getPropertyValue(refToken).trim();
		setValue(computed || refToken);
	}, [refToken]);

	return (
		<div className="space-y-2">
			<div
				className="w-full aspect-square rounded-lg shadow-sm"
				style={{ backgroundColor: `var(${refToken})` }}
			/>
			<div className="text-xs space-y-1">
				<p className="font-medium">{name}</p>
				<p className="font-mono opacity-70">{value}</p>
				<p className="font-mono opacity-50">{refToken}</p>
			</div>
		</div>
	);
};

const TypeSample: React.FC<{ name: string; token: string }> = ({ name, token }) => {
	const [fontValue, setFontValue] = React.useState("");

	React.useEffect(() => {
		const computed = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
		setFontValue(computed || token);
	}, [token]);

	return (
		<div className="border-b pb-4" style={{ borderColor: "var(--md-ref-color-outline-variant)" }}>
			<p style={{ font: `var(${token})` }}>{name} — The quick brown fox jumps over the lazy dog.</p>
			<p className="text-xs mt-2 font-mono opacity-60">{fontValue}</p>
			<p className="text-xs font-mono opacity-40">{token}</p>
		</div>
	);
};

const SpacingShowcase: React.FC<{ name: string; token: string }> = ({ name, token }) => {
	return (
		<div className="flex items-center gap-4">
			<div
				className="rounded flex-shrink-0"
				style={{
					width: `var(${token})`,
					height: `var(${token})`,
					backgroundColor: "var(--md-ref-color-primary)",
				}}
			/>
			<div className="text-sm">
				<p className="font-medium">{name}</p>
				<p className="font-mono opacity-60">{token}</p>
			</div>
		</div>
	);
};

const CornerShowcase: React.FC<{ name: string; token: string }> = ({ name, token }) => {
	return (
		<div className="text-center">
			<div
				className="w-20 h-20 flex items-center justify-center text-sm"
				style={{
					borderRadius: `var(${token})`,
					backgroundColor: "var(--md-ref-color-primary-container)",
					color: "var(--md-ref-color-on-primary-container)",
				}}
			>
				{name}
			</div>
			<p className="text-xs mt-2 font-mono opacity-60">{token}</p>
		</div>
	);
};

const ElevationShowcase: React.FC<{ name: string; token: string }> = ({ name, token }) => {
	return (
		<div className="text-center">
			<div
				className="w-32 h-32 flex items-center justify-center rounded-lg"
				style={{
					boxShadow: `var(${token})`,
					backgroundColor: "var(--md-ref-color-surface-container-high)",
				}}
			>
				<span className="text-sm" style={{ color: "var(--md-ref-color-on-surface)" }}>
					{name}
				</span>
			</div>
			<p className="text-xs mt-2 font-mono opacity-60">{token}</p>
		</div>
	);
};
