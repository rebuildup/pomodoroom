import type { IntegrationService } from "@/types";

interface IntegrationIconProps {
	service: IntegrationService;
	size?: number;
	className?: string;
}

/**
 * IntegrationIcon - 連携サービスのアイコンを表示するコンポーネント
 * 
 * すべてのアイコンは白背景に黒オブジェクトのデザイン。
 * テーマに関わらず一貫した見た目を提供する。
 */
const ICON_MAPPING: Record<IntegrationService, string> = {
	google: "google-calendar",
	google_tasks: "google-tasks",
	notion: "notion",
	linear: "linear",
	github: "github",
	discord: "discord",
	slack: "slack",
};

export function IntegrationIcon({ service, size = 24, className = "" }: IntegrationIconProps) {
	const iconPath = `/icons/${ICON_MAPPING[service]}.svg`;

	return (
		<span
			className={`inline-flex items-center justify-center bg-white rounded ${className}`}
			style={{ width: size, height: size }}
		>
			<img
				src={iconPath}
				alt={`${service} icon`}
				width={size}
				height={size}
				className="object-contain"
			/>
		</span>
	);
}
