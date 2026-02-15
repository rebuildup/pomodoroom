/** Connection status component for integration settings */

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface ConnectionStatusProps {
	status: ConnectionStatus;
	serviceName?: string;
	error?: string;
	lastSync?: string;
	className?: string;
}

const STATUS_CONFIG: Record<
	ConnectionStatus,
	{ icon: string; label: string; color: string; bgColor: string }
> = {
	disconnected: {
		icon: "○",
		label: "Not connected",
		color: "text-gray-500 dark:text-gray-400",
		bgColor: "bg-gray-100 dark:bg-gray-800",
	},
	connecting: {
		icon: "⟳",
		label: "Connecting...",
		color: "text-blue-600 dark:text-blue-400",
		bgColor: "bg-blue-100 dark:bg-blue-900",
	},
	connected: {
		icon: "✓",
		label: "Connected",
		color: "text-green-600 dark:text-green-400",
		bgColor: "bg-green-100 dark:bg-green-900",
	},
	error: {
		icon: "!",
		label: "Connection error",
		color: "text-red-600 dark:text-red-400",
		bgColor: "bg-red-100 dark:bg-red-900",
	},
};

export function IntegrationConnectionStatus({
	status,
	serviceName,
	error,
	lastSync,
	className = "",
}: ConnectionStatusProps) {
	const config = STATUS_CONFIG[status];

	return (
		<div className={`flex items-center gap-2 ${className}`}>
			<span
				className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${config.bgColor} ${config.color} text-sm`}
			>
				{config.icon}
			</span>
			<div className="flex flex-col">
				<span className={`text-sm font-medium ${config.color}`}>
					{serviceName ? `${serviceName}: ` : ""}
					{config.label}
				</span>
				{status === "error" && error && (
					<span className="text-xs text-red-600 dark:text-red-400">
						{error}
					</span>
				)}
				{status === "connected" && lastSync && (
					<span className="text-xs text-on-surface-variant">
						Last sync: {new Date(lastSync).toLocaleString()}
					</span>
				)}
			</div>
		</div>
	);
}

/** Compact pill-style status indicator */
export function StatusPill({
	status,
	className = "",
}: {
	status: ConnectionStatus;
	className?: string;
}) {
	const config = STATUS_CONFIG[status];

	return (
		<span
			className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color} ${config.bgColor} ${className}`}
		>
			<span>{config.icon}</span>
			<span>{config.label}</span>
		</span>
	);
}

/** Status button with interactive states */
export function StatusButton({
	status,
	serviceName,
	onClick,
	disabled = false,
}: {
	status: ConnectionStatus;
	serviceName: string;
	onClick?: () => void;
	disabled?: boolean;
}) {
	const config = STATUS_CONFIG[status];
	const isClickable = onClick !== undefined && !disabled;

	const button = (
		<button
			type="button"
			disabled={disabled || status === "connecting"}
			onClick={() => onClick?.()}
			className={`
				inline-flex items-center gap-2 px-4 py-2 rounded-full
				transition-all duration-150 ease-out
				${config.bgColor} ${config.color}
				${isClickable
					? "hover:opacity-80 active:scale-95 cursor-pointer"
					: "cursor-default opacity-70"
				}
				${disabled ? "opacity-50 cursor-not-allowed" : ""}
			`}
		>
			<span className="text-sm">{config.icon}</span>
			<span className="text-sm font-medium">
				{serviceName}: {config.label}
			</span>
			{status === "connecting" && (
				<span className="animate-pulse">...</span>
			)}
		</button>
	);

	return button;
}
