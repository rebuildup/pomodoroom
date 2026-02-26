/** Common integration settings component with connection form and status display */
import { useState, useId } from "react";
import type { IntegrationService } from "@/types";
import {
	IntegrationConnectionStatus,
	StatusButton,
	StatusPill,
	type ConnectionStatus,
} from "./IntegrationConnectionStatus";
import { IntegrationPermissions, type Permission } from "./IntegrationPermissions";

export interface IntegrationSettingsProps {
	/** Integration service identifier */
	service: IntegrationService;

	/** Current connection status */
	status: ConnectionStatus;

	/** Error message if connection failed */
	error?: string;

	/** Last successful sync timestamp */
	lastSync?: string;

	/** Permissions for this integration */
	permissions?: Permission[];

	/** API key or token input */
	apiKey?: string;

	/** OAuth authorization URL */
	authUrl?: string;

	/** Webhook URL for incoming integrations */
	webhookUrl?: string;

	/** Additional settings fields */
	settings?: Record<string, string | boolean | number>;

	/** Callback when connection button is clicked */
	onConnect?: () => void | Promise<void>;

	/** Callback when disconnect button is clicked */
	onDisconnect?: () => void | Promise<void>;

	/** Callback when permission is toggled */
	onTogglePermission?: (scope: string) => void;

	/** Callback when settings are saved */
	onSaveSettings?: (settings: Record<string, string | boolean | number>) => void | Promise<void>;

	/** Whether to show compact view */
	compact?: boolean;

	/** Additional CSS class */
	className?: string;
}

const SERVICE_LABELS: Record<IntegrationService, string> = {
	google_calendar: "Google Calendar",
	google_tasks: "Google Tasks",
	notion: "Notion",
	linear: "Linear",
	github: "GitHub",
	discord: "Discord",
	slack: "Slack",
};

const SERVICE_DESCRIPTIONS: Record<IntegrationService, string> = {
	google_calendar:
		'Syncs events and tasks. A "Pomodoroom" calendar is automatically created in your Google Calendar on first sync.',
	google_tasks: "Sync with Google Tasks for task management",
	notion: "Manage tasks and pages in your Notion workspace",
	linear: "Sync issues and projects with Linear for project tracking",
	github: "Link GitHub issues and pull requests to your focus sessions",
	discord: "Post status updates and notifications to Discord channels",
	slack: "Send status updates and notifications to Slack channels",
};

function ApiKeyInput({
	value,
	onChange,
	onSave,
	service,
}: {
	value: string;
	onChange: (value: string) => void;
	onSave: () => void;
	service: IntegrationService;
}) {
	const apiKeyId = useId();
	const [isEditing, setIsEditing] = useState(false);
	const [tempValue, setTempValue] = useState(value);

	const handleSave = () => {
		onChange(tempValue);
		setIsEditing(false);
		onSave();
	};

	return (
		<div className="space-y-2">
			<label htmlFor={apiKeyId} className="text-sm font-medium text-on-surface">
				API Key
			</label>
			{isEditing ? (
				<div className="flex gap-2">
					<input
						id={apiKeyId}
						type="password"
						value={tempValue}
						onChange={(e) => setTempValue(e.target.value)}
						placeholder={`Enter ${SERVICE_LABELS[service]} API key`}
						className="flex-1 px-3 py-2 rounded-lg border border-outline bg-surface text-on-surface text-sm focus:border-primary focus:ring-1 focus:ring-primary"
					/>
					<button
						type="button"
						onClick={handleSave}
						className="px-3 py-2 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary-hover"
					>
						Save
					</button>
					<button
						type="button"
						onClick={() => {
							setTempValue(value);
							setIsEditing(false);
						}}
						className="px-3 py-2 rounded-full text-primary text-sm font-medium hover:bg-primary-container hover:bg-opacity-100"
					>
						Cancel
					</button>
				</div>
			) : (
				<div className="flex items-center gap-2">
					<input
						type="password"
						value={value}
						readOnly
						className="flex-1 px-3 py-2 rounded-lg border border-outline bg-surface-variant text-on-surface-variant text-sm"
						placeholder="Not configured"
					/>
					<button
						type="button"
						onClick={() => setIsEditing(true)}
						className="px-3 py-2 rounded-full text-primary text-sm font-medium hover:bg-primary-container hover:bg-opacity-100"
					>
						Change
					</button>
				</div>
			)}
		</div>
	);
}

function OAuthSection({
	authUrl,
	service,
	connected,
}: {
	authUrl?: string;
	service: IntegrationService;
	connected: boolean;
}) {
	if (!authUrl) return null;

	return (
		<div className="space-y-2">
			<p className="text-sm text-on-surface-variant">
				Connect your {SERVICE_LABELS[service]} account to authorize Pomodoroom
			</p>
			{connected ? (
				<div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
					<span>✓</span>
					<span>Authorized</span>
				</div>
			) : (
				<a
					href={authUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary-hover"
				>
					Authorize with {SERVICE_LABELS[service]}
				</a>
			)}
		</div>
	);
}

function SettingsForm({
	settings,
	onSave,
}: {
	settings?: Record<string, string | boolean | number>;
	onSave?: (settings: Record<string, string | boolean | number>) => void | Promise<void>;
}) {
	const [localSettings, setLocalSettings] = useState(settings || {});
	const [isDirty, setIsDirty] = useState(false);

	const handleChange = (key: string, value: string | boolean | number) => {
		setLocalSettings((prev) => ({ ...prev, [key]: value }));
		setIsDirty(true);
	};

	const handleSave = async () => {
		await onSave?.(localSettings);
		setIsDirty(false);
	};

	const hasSettings = settings && Object.keys(settings).length > 0;

	return (
		<>
			{hasSettings && (
				<div className="space-y-4">
					<h4 className="text-sm font-medium text-on-surface">Additional Settings</h4>
					{Object.entries(settings).map(([key, value]) => (
						<div key={key} className="space-y-1">
							{typeof value === "boolean" ? (
								<>
									<span className="text-sm text-on-surface-variant capitalize">
										{key.replace(/_/g, " ")}
									</span>
									<button
										type="button"
										onClick={() => handleChange(key, !value)}
										className={`
										relative inline-flex h-6 w-11 items-center rounded-full
										transition-colors duration-150 ease-out
										${value ? "bg-primary" : "bg-outline-variant"}
									`}
									>
										<span
											className={`
												inline-block h-5 w-5 rounded-full bg-white
												transform transition-transform duration-150 ease-out
												${value ? "translate-x-6" : "translate-x-0.5"}
											`}
										/>
									</button>
								</>
							) : (
								<>
									<label
										htmlFor={`setting-${key}`}
										className="text-sm text-on-surface-variant capitalize"
									>
										{key.replace(/_/g, " ")}
									</label>
									<input
										id={`setting-${key}`}
										type="text"
										value={String(value)}
										onChange={(e) => handleChange(key, e.target.value)}
										className="w-full px-3 py-2 rounded-lg border border-outline bg-surface text-on-surface text-sm focus:border-primary focus:ring-1 focus:ring-primary"
									/>
								</>
							)}
						</div>
					))}
					{isDirty && onSave && (
						<div className="flex justify-end pt-2">
							<button
								type="button"
								onClick={handleSave}
								className="px-4 py-2 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary-hover"
							>
								Save Settings
							</button>
						</div>
					)}
				</div>
			)}
		</>
	);
}

export function IntegrationSettings({
	service,
	status,
	error,
	lastSync,
	permissions,
	apiKey,
	authUrl,
	webhookUrl,
	settings,
	onConnect,
	onDisconnect,
	onTogglePermission,
	onSaveSettings,
	compact = false,
	className = "",
}: IntegrationSettingsProps) {
	const serviceName = SERVICE_LABELS[service];
	const description = SERVICE_DESCRIPTIONS[service];
	const isConnected = status === "connected";

	if (compact) {
		return (
			<div className={`flex items-center gap-3 p-3 rounded-lg border border-outline ${className}`}>
				<StatusPill status={status} />
				<div className="flex-1 min-w-0">
					<div className="font-medium text-sm text-on-surface truncate">{serviceName}</div>
					{!isConnected && description && (
						<div className="text-xs text-on-surface-variant truncate">{description}</div>
					)}
				</div>
				{onConnect && !isConnected && (
					<button
						type="button"
						onClick={() => onConnect()}
						className="px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-medium hover:bg-primary-hover"
					>
						Connect
					</button>
				)}
			</div>
		);
	}

	return (
		<div className={`space-y-6 ${className}`}>
			{/* Header with status */}
			<div className="flex items-start justify-between">
				<div>
					<h3 className="text-title-large font-medium text-on-surface">{serviceName}</h3>
					<p className="text-body-medium text-on-surface-variant mt-1">{description}</p>
				</div>
				<StatusButton
					status={status}
					serviceName={serviceName}
					onClick={isConnected ? onDisconnect : onConnect}
				/>
			</div>

			{/* Connection status */}
			<div className="p-4 rounded-lg bg-surface-variant">
				<IntegrationConnectionStatus
					status={status}
					serviceName={serviceName}
					error={error}
					lastSync={lastSync}
				/>
			</div>

			{/* Connection methods */}
			{!isConnected && (
				<div className="space-y-4">
					{apiKey !== undefined && (
						<ApiKeyInput
							value={apiKey}
							onChange={() => {
								/* TODO: Handle API key change */
							}}
							onSave={() => {
								/* TODO: Handle save */
							}}
							service={service}
						/>
					)}

					{authUrl && <OAuthSection authUrl={authUrl} service={service} connected={false} />}

					{webhookUrl && (
						<div className="space-y-2">
							<label htmlFor="webhook-url" className="text-sm font-medium text-on-surface">
								Webhook URL
							</label>
							<input
								id="webhook-url"
								type="text"
								value={webhookUrl}
								readOnly
								className="w-full px-3 py-2 rounded-lg border border-outline bg-surface-variant text-on-surface-variant text-sm"
								placeholder="Webhook will be generated upon connection"
							/>
						</div>
					)}

					{onConnect && (
						<button
							type="button"
							onClick={() => onConnect()}
							className="w-full px-4 py-2.5 rounded-full bg-primary text-on-primary text-body-large font-medium hover:bg-primary-hover"
						>
							Connect {serviceName}
						</button>
					)}
				</div>
			)}

			{/* Permissions */}
			{permissions && permissions.length > 0 && (
				<div>
					{isConnected ? (
						<IntegrationPermissions
							permissions={permissions}
							serviceName={serviceName}
							onTogglePermission={onTogglePermission}
							readOnly={false}
						/>
					) : (
						<div className="p-4 rounded-lg bg-surface-variant text-on-surface-variant text-sm">
							🔒 Permissions will be shown after connecting to {serviceName}
						</div>
					)}
				</div>
			)}

			{/* Additional settings */}
			{isConnected && settings && <SettingsForm settings={settings} onSave={onSaveSettings} />}

			{/* Disconnect confirmation */}
			{isConnected && onDisconnect && (
				<div className="pt-4 border-t border-outline">
					<button
						type="button"
						onClick={() => onDisconnect()}
						className="text-error text-sm font-medium hover:underline"
					>
						Disconnect from {serviceName}
					</button>
				</div>
			)}
		</div>
	);
}
