import { useMemo, useState } from "react";
import { Icon } from "@/components/m3/Icon";
import { IntegrationIcon } from "@/components/IntegrationIcon";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { useGoogleTasks } from "@/hooks/useGoogleTasks";
import { useIntegrations } from "@/hooks/useIntegrations";
import { GoogleCalendarSettingsModal } from "@/components/GoogleCalendarSettingsModal";
import { GoogleTasksSettingsModal } from "@/components/GoogleTasksSettingsModal";
import { IntegrationSettingsModal } from "@/components/IntegrationSettingsModal";
import type { IntegrationService } from "@/types";

interface IntegrationsPanelProps {
	theme: "light" | "dark";
}

export function IntegrationsPanel({ theme }: IntegrationsPanelProps) {
	const googleCalendar = useGoogleCalendar();
	const googleTasks = useGoogleTasks();
	const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
	const [isTasksModalOpen, setIsTasksModalOpen] = useState(false);
	const [integrationModalService, setIntegrationModalService] = useState<IntegrationService | null>(
		null,
	);

	const { services, getServiceConfig, connectService, disconnectService, syncService } =
		useIntegrations();
	const totalConnectedServices = useMemo(
		() =>
			services.filter((service) => {
				if (service.id === "google_calendar") return googleCalendar.state.isConnected;
				if (service.id === "google_tasks") return googleTasks.state.isConnected;
				return getServiceConfig(service.id).connected;
			}).length,
		[services, googleCalendar.state.isConnected, googleTasks.state.isConnected, getServiceConfig],
	);

	const handleConnect = async (serviceId: IntegrationService) => {
		if (serviceId === "google_calendar") {
			try {
				await googleCalendar.connectInteractive();
			} catch (error) {
				console.error("[IntegrationsPanel] Google OAuth connect failed:", error);
			}
			return;
		}
		if (serviceId === "google_tasks") {
			try {
				await googleTasks.connectInteractive();
			} catch (error) {
				console.error("[IntegrationsPanel] Google Tasks OAuth connect failed:", error);
			}
			return;
		}

		const service = services.find((item) => item.id === serviceId);
		if (!service) return;

		const tokenInput = window.prompt(`${service.name} のアクセストークンを入力してください`);
		const token = tokenInput?.trim();
		if (!token) return;

		const accountInput = window.prompt(
			`${service.name} のアカウント名（任意）`,
			`${service.name} Account`,
		);
		connectService(serviceId, {
			id: token,
			name: accountInput?.trim() || `${service.name} Account`,
		});
	};

	const handleDisconnect = async (serviceId: IntegrationService) => {
		if (serviceId === "google_calendar") {
			await googleCalendar.disconnect();
			return;
		}
		if (serviceId === "google_tasks") {
			await googleTasks.disconnect();
			return;
		}
		disconnectService(serviceId);
	};

	const handleConfigure = (serviceId: IntegrationService) => {
		if (serviceId === "google_calendar") {
			setIsCalendarModalOpen(true);
			return;
		}
		if (serviceId === "google_tasks") {
			setIsTasksModalOpen(true);
			return;
		}
		// Open configuration modal for other services
		setIntegrationModalService(serviceId);
	};

	const handleSync = async (serviceId: IntegrationService) => {
		if (serviceId === "google_calendar") {
			await googleCalendar.fetchEvents();
			return;
		}
		if (serviceId === "google_tasks") {
			await googleTasks.fetchTasks();
			return;
		}
		syncService(serviceId);
	};

	return (
		<section>
			<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
				Integrations
			</h3>

			{totalConnectedServices > 0 && (
				<div className="mb-4 p-3 rounded-lg bg-[var(--md-ref-color-surface-container)]">
					<p className="text-xs text-[var(--md-ref-color-on-surface-variant)]">
						{totalConnectedServices} service
						{totalConnectedServices > 1 ? "s" : ""} connected
					</p>
				</div>
			)}

			<div className="space-y-2">
				{services.map((service) => {
					const config = getServiceConfig(service.id);
					const isGoogle = service.id === "google_calendar";
					const isGoogleTasks = service.id === "google_tasks";
					const isConnected = isGoogle
						? googleCalendar.state.isConnected
						: isGoogleTasks
							? googleTasks.state.isConnected
							: config.connected;
					const isConnecting =
						(isGoogle && googleCalendar.state.isConnecting) ||
						(isGoogleTasks && googleTasks.state.isConnecting);
					const lastSync = isGoogle
						? googleCalendar.state.lastSync
						: isGoogleTasks
							? googleTasks.state.lastSync
							: config.lastSyncAt;

					return (
						<div
							key={service.id}
							className="p-3 rounded-lg border transition-colors bg-[var(--md-ref-color-surface-container-low)] border-[var(--md-ref-color-outline)] hover:bg-[var(--md-ref-color-surface-container)]"
						>
							<div className="flex items-start justify-between">
								<div className="flex items-center gap-3">
									<IntegrationIcon service={service.id} size={24} />
									<div>
										<div className="flex items-center gap-2">
											<span className="text-sm font-medium">{service.name}</span>
											{isConnected && (
												<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-[var(--md-ref-color-primary-container)] text-[var(--md-ref-color-on-primary-container)]">
													<Icon name="check" size={10} />
													Connected
												</span>
											)}
										</div>
										<p className="text-xs mt-0.5 text-[var(--md-ref-color-on-surface-variant)]">
											{service.description}
										</p>
										{isConnected && config.accountName && (
											<p className="text-xs mt-1 text-[var(--md-ref-color-on-surface-variant)]">
												{config.accountName}
											</p>
										)}
									</div>
								</div>

								<div className="flex items-center gap-1">
									{isConnected ? (
										<>
											<button
												type="button"
												onClick={() => handleConfigure(service.id)}
												className="p-1.5 rounded transition-colors hover:bg-[var(--md-ref-color-surface-container-high)] text-[var(--md-ref-color-on-surface-variant)] hover:text-[var(--md-ref-color-on-surface)]"
												title="Configure"
											>
												<Icon name="settings" size={14} />
											</button>
											<button
												type="button"
												onClick={() => void handleSync(service.id)}
												className="p-1.5 rounded transition-colors hover:bg-[var(--md-ref-color-surface-container-high)] text-[var(--md-ref-color-on-surface-variant)] hover:text-[var(--md-ref-color-on-surface)]"
												title="Sync now"
											>
												<Icon name="link" size={14} />
											</button>
											<button
												type="button"
												onClick={() => void handleDisconnect(service.id)}
												className="p-1.5 rounded transition-colors hover:bg-[var(--md-ref-color-error-container)] text-[var(--md-ref-color-error)] hover:text-[var(--md-ref-color-on-error-container)]"
												title="Disconnect"
											>
												<Icon name="link_off" size={14} />
											</button>
										</>
									) : (
										<button
											type="button"
											onClick={() => void handleConnect(service.id)}
											disabled={isConnecting}
											className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-[var(--md-ref-color-primary-container)] hover:bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary-container)] ${isConnecting ? "opacity-70 cursor-not-allowed" : ""}`}
										>
											{isConnecting ? "Connecting..." : "Connect"}
										</button>
									)}
								</div>
							</div>

							{isGoogle && googleCalendar.state.error && (
								<p className="mt-2 text-xs text-[var(--md-ref-color-error)]">
									{googleCalendar.state.error}
								</p>
							)}
							{isGoogleTasks && googleTasks.state.error && (
								<p className="mt-2 text-xs text-[var(--md-ref-color-error)]">
									{googleTasks.state.error}
								</p>
							)}

							{lastSync && (
								<div className="mt-2 pt-2 border-t border-[var(--md-ref-color-outline-variant)]">
									<p className="text-xs text-[var(--md-ref-color-on-surface-variant)]">
										Last sync: {new Date(lastSync).toLocaleString()}
									</p>
								</div>
							)}
						</div>
					);
				})}
			</div>

			{/* Calendar Settings Modal */}
			<GoogleCalendarSettingsModal
				theme={theme}
				isOpen={isCalendarModalOpen}
				onClose={() => setIsCalendarModalOpen(false)}
				onSave={() => {
					// Trigger a refresh after saving
					googleCalendar.fetchEvents();
				}}
			/>

			{/* Tasks Settings Modal */}
			<GoogleTasksSettingsModal
				isOpen={isTasksModalOpen}
				onClose={() => setIsTasksModalOpen(false)}
				onSave={() => {
					// Trigger a refresh after saving
					googleTasks.fetchTasks();
				}}
			/>

			{/* Generic Integration Settings Modal */}
			{integrationModalService && (
				<IntegrationSettingsModal
					serviceId={integrationModalService}
					isOpen={integrationModalService !== null}
					onClose={() => setIntegrationModalService(null)}
					onSave={() => {
						// Trigger a refresh after saving
						if (integrationModalService) {
							void syncService(integrationModalService);
						}
					}}
				/>
			)}
		</section>
	);
}
