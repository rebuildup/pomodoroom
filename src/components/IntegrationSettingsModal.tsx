/**
 * IntegrationSettingsModal — Generic settings modal for non-Google services.
 *
 * Modal dialog for configuring integration settings for services like
 * Notion, Linear, GitHub, Discord, and Slack.
 */

import { useState, useEffect } from "react";
import { Icon } from "./m3/Icon";
import { useIntegrations } from "@/hooks/useIntegrations";
import type { IntegrationService } from "@/types";

interface IntegrationSettingsModalProps {
	serviceId: IntegrationService;
	isOpen: boolean;
	onClose: () => void;
	onSave: () => void;
}

interface ServiceConfigField {
	key: string;
	label: string;
	type: "text" | "url" | "number" | "textarea" | "select";
	placeholder?: string;
	defaultValue?: string;
	options?: { label: string; value: string }[];
	secret?: boolean; // Hide value like passwords
}

// Configuration fields for each service
const SERVICE_CONFIG_FIELDS: Record<
	Exclude<IntegrationService, "google_calendar" | "google_tasks">,
	ServiceConfigField[]
> = {
	notion: [
		{
			key: "database_id",
			label: "Database ID",
			type: "text",
			placeholder: "e.g., 1a2b3c4d-5e6f-7g8h-9i0j-1k2l3m4n5o6p",
			defaultValue: "",
		},
		{
			key: "workspace_name",
			label: "Workspace Name",
			type: "text",
			placeholder: "My Workspace",
			defaultValue: "",
		},
	],
	linear: [
		{
			key: "team_key",
			label: "Team Key",
			type: "text",
			placeholder: "e.g., ENG",
			defaultValue: "",
		},
		{
			key: "project_filter",
			label: "Project Filter",
			type: "text",
			placeholder: "Optional: filter by project name",
			defaultValue: "",
		},
		{
			key: "sync_issues",
			label: "Sync Issues",
			type: "select",
			options: [
				{ label: "All Issues", value: "all" },
				{ label: "Assigned Only", value: "assigned" },
				{ label: "Active Only", value: "active" },
			],
			defaultValue: "assigned",
		},
	],
	github: [
		{
			key: "repo_owner",
			label: "Repository Owner",
			type: "text",
			placeholder: "e.g., rebuildup",
			defaultValue: "",
		},
		{
			key: "repo_name",
			label: "Repository Name",
			type: "text",
			placeholder: "e.g., pomodoroom",
			defaultValue: "",
		},
		{
			key: "label_filter",
			label: "Label Filter",
			type: "text",
			placeholder: "Optional: filter by label (e.g., enhancement,bug)",
			defaultValue: "",
		},
		{
			key: "sync_pull_requests",
			label: "Sync Pull Requests",
			type: "select",
			options: [
				{ label: "Yes", value: "yes" },
				{ label: "No", value: "no" },
			],
			defaultValue: "no",
		},
	],
	discord: [
		{
			key: "webhook_url",
			label: "Webhook URL",
			type: "url",
			placeholder: "https://discord.com/api/webhooks/...",
			defaultValue: "",
			secret: true,
		},
		{
			key: "channel_id",
			label: "Channel ID",
			type: "text",
			placeholder: "Optional: override default channel",
			defaultValue: "",
		},
		{
			key: "message_template",
			label: "Message Template",
			type: "textarea",
			placeholder: "Default: 🍅 Completed: {task} ({duration}min)",
			defaultValue: "🍅 Completed: {task} ({duration}min)",
		},
	],
	slack: [
		{
			key: "webhook_url",
			label: "Webhook URL",
			type: "url",
			placeholder: "https://hooks.slack.com/services/...",
			defaultValue: "",
			secret: true,
		},
		{
			key: "channel",
			label: "Channel",
			type: "text",
			placeholder: "e.g., #pomodoroom-updates",
			defaultValue: "",
		},
		{
			key: "message_template",
			label: "Message Template",
			type: "textarea",
			placeholder: "Default: 🍅 Completed: {task} ({duration}min)",
			defaultValue: "🍅 Completed: {task} ({duration}min)",
		},
	],
};

function getServiceName(serviceId: IntegrationService): string {
	const names: Record<IntegrationService, string> = {
		google_calendar: "Google Calendar",
		google_tasks: "Google Tasks",
		notion: "Notion",
		linear: "Linear",
		github: "GitHub",
		discord: "Discord",
		slack: "Slack",
	};
	return names[serviceId] || serviceId;
}

export function IntegrationSettingsModal({
	serviceId,
	isOpen,
	onClose,
	onSave,
}: IntegrationSettingsModalProps) {
	const { getServiceConfig, updateServiceConfig } = useIntegrations();
	const [localConfig, setLocalConfig] = useState<Record<string, string>>({});
	const [hasChanges, setHasChanges] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Skip Google services (they have their own modals)
	const isGoogleService = serviceId === "google_calendar" || serviceId === "google_tasks";
	const fields = isGoogleService
		? undefined
		: SERVICE_CONFIG_FIELDS[
				serviceId as Exclude<IntegrationService, "google_calendar" | "google_tasks">
			];
	const serviceName = getServiceName(serviceId);
	const hasValidFields = !!fields;

	// Initialize local config from service config when modal opens
	useEffect(() => {
		if (isOpen && !isGoogleService && hasValidFields) {
			const config = getServiceConfig(serviceId);
			const existingConfig = (config.config || {}) as Record<string, string>;
			const initialValues: Record<string, string> = {};

			for (const field of fields) {
				initialValues[field.key] = existingConfig[field.key] || field.defaultValue || "";
			}

			setLocalConfig(initialValues);
			setHasChanges(false);
			setError(null);
		}
	}, [isOpen, serviceId, getServiceConfig, fields, isGoogleService, hasValidFields]);

	const handleFieldChange = (key: string, value: string) => {
		setLocalConfig((prev) => ({
			...prev,
			[key]: value,
		}));
		setHasChanges(true);
		setError(null);
	};

	const handleSave = () => {
		if (!fields) return;
		// Validate required fields
		for (const field of fields) {
			if (field.type === "url" && localConfig[field.key]) {
				try {
					new URL(localConfig[field.key]);
				} catch {
					setError(`${field.label} must be a valid URL`);
					return;
				}
			}
		}

		// Update service config
		updateServiceConfig(serviceId, localConfig);
		setHasChanges(false);
		onSave();
		onClose();
	};

	const handleReset = () => {
		if (!fields) return;
		const config = getServiceConfig(serviceId);
		const existingConfig = (config.config || {}) as Record<string, string>;
		const initialValues: Record<string, string> = {};

		for (const field of fields) {
			initialValues[field.key] = existingConfig[field.key] || field.defaultValue || "";
		}

		setLocalConfig(initialValues);
		setHasChanges(false);
		setError(null);
	};

	if (!isOpen || isGoogleService || !hasValidFields) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/50"
				onClick={onClose}
				onKeyDown={(e) => e.key === "Escape" && onClose()}
				role="button"
				tabIndex={0}
				aria-label="Close"
			/>

			{/* Modal */}
			<div className="relative w-full max-w-md max-h-[80vh] overflow-hidden rounded-xl shadow-2xl bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)]">
				{/* Header */}
				<div className="px-6 py-4 border-b border-[var(--md-ref-color-outline-variant)]">
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-semibold">{serviceName} Settings</h2>
						<button
							type="button"
							onClick={onClose}
							className="p-1 rounded transition-colors hover:bg-[var(--md-ref-color-surface-container-high)] text-[var(--md-ref-color-on-surface-variant)] hover:text-[var(--md-ref-color-on-surface)]"
						>
							<Icon name="close" size={20} />
						</button>
					</div>
					<p className="text-sm mt-1 text-[var(--md-ref-color-on-surface-variant)]">
						Configure {serviceName} integration settings
					</p>
				</div>

				{/* Content */}
				<div className="px-6 py-4 overflow-y-auto max-h-[50vh]">
					{error && (
						<div className="mb-4 p-3 rounded-lg bg-[var(--md-ref-color-error-container)] text-[var(--md-ref-color-on-error-container)]">
							<p className="text-sm">{error}</p>
						</div>
					)}

					<div className="space-y-4">
						{fields.map((field: ServiceConfigField) => {
							const value = localConfig[field.key] || "";

							if (field.type === "textarea") {
								return (
									<div key={field.key}>
										<label
											htmlFor={`field-${field.key}`}
											className="block text-sm font-medium mb-1.5 text-[var(--md-ref-color-on-surface)]"
										>
											{field.label}
										</label>
										<textarea
											id={`field-${field.key}`}
											value={value}
											onChange={(e) => handleFieldChange(field.key, e.target.value)}
											placeholder={field.placeholder}
											rows={3}
											className="w-full px-3 py-2 rounded-lg border bg-[var(--md-ref-color-surface-container-highest)] border-[var(--md-ref-color-outline)] text-[var(--md-ref-color-on-surface)] placeholder:text-[var(--md-ref-color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--md-ref-color-primary)]"
										/>
									</div>
								);
							}

							if (field.type === "select") {
								return (
									<div key={field.key}>
										<label
											htmlFor={`field-${field.key}`}
											className="block text-sm font-medium mb-1.5 text-[var(--md-ref-color-on-surface)]"
										>
											{field.label}
										</label>
										<select
											id={`field-${field.key}`}
											value={value}
											onChange={(e) => handleFieldChange(field.key, e.target.value)}
											className="w-full px-3 py-2 rounded-lg border bg-[var(--md-ref-color-surface-container-highest)] border-[var(--md-ref-color-outline)] text-[var(--md-ref-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--md-ref-color-primary)]"
										>
											{field.options?.map((option: { label: string; value: string }) => (
												<option key={option.value} value={option.value}>
													{option.label}
												</option>
											))}
										</select>
									</div>
								);
							}

							return (
								<div key={field.key}>
									<label
										htmlFor={`field-${field.key}`}
										className="block text-sm font-medium mb-1.5 text-[var(--md-ref-color-on-surface)]"
									>
										{field.label}
									</label>
									<input
										id={`field-${field.key}`}
										type={field.secret ? "password" : field.type}
										value={value}
										onChange={(e) => handleFieldChange(field.key, e.target.value)}
										placeholder={field.placeholder}
										className="w-full px-3 py-2 rounded-lg border bg-[var(--md-ref-color-surface-container-highest)] border-[var(--md-ref-color-outline)] text-[var(--md-ref-color-on-surface)] placeholder:text-[var(--md-ref-color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--md-ref-color-primary)]"
									/>
								</div>
							);
						})}
					</div>
				</div>

				{/* Footer */}
				<div className="px-6 py-4 border-t flex justify-between gap-2 border-[var(--md-ref-color-outline-variant)]">
					<button
						type="button"
						onClick={handleReset}
						disabled={!hasChanges}
						className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-[var(--md-ref-color-surface-container-highest)] hover:bg-[var(--md-ref-color-surface-container)] text-[var(--md-ref-color-on-surface)] disabled:opacity-50 disabled:cursor-not-allowed"
					>
						Reset
					</button>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={onClose}
							className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-[var(--md-ref-color-surface-container-highest)] hover:bg-[var(--md-ref-color-surface-container)] text-[var(--md-ref-color-on-surface)]"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleSave}
							disabled={!hasChanges}
							className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-[var(--md-ref-color-primary-container)] hover:bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary-container)] disabled:bg-[var(--md-ref-color-surface-container-highest)] disabled:text-[var(--md-ref-color-on-surface-variant)] disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Save
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

export default IntegrationSettingsModal;
