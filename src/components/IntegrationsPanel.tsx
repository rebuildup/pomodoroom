import { Icon } from "@/components/m3/Icon";
import { useIntegrations } from "@/hooks/useIntegrations";
import type { IntegrationService } from "@/types";

interface IntegrationsPanelProps {
	theme: "light" | "dark";
}

export function IntegrationsPanel({ theme }: IntegrationsPanelProps) {
	const {
		services,
		connectedServices,
		getServiceConfig,
		connectService, // Will be used in OAuth flow implementation (#174)
		disconnectService,
		syncService,
	} = useIntegrations();

	const handleConnect = (serviceId: IntegrationService) => {
		// TODO: Implement OAuth flow (#174)
		console.warn(`[IntegrationsPanel] OAuth flow not yet implemented for ${serviceId}`);
		// Note: connectService() should trigger the OAuth flow when implemented
		// connectService(serviceId, oauthResult);
	};

	const handleDisconnect = (serviceId: IntegrationService) => {
		disconnectService(serviceId);
	};

	const handleConfigure = (serviceId: IntegrationService) => {
		console.log(`Configure ${serviceId}`);
		// TODO: Open configuration modal
	};

	const handleSync = (serviceId: IntegrationService) => {
		syncService(serviceId);
	};

	return (
		<section>
			<h3
				className={`text-xs font-bold uppercase tracking-widest mb-4 ${
					theme === "dark" ? "text-gray-500" : "text-gray-400"
				}`}
			>
				Integrations
			</h3>

			{connectedServices.length > 0 && (
				<div
					className={`mb-4 p-3 rounded-lg ${
						theme === "dark" ? "bg-white/5" : "bg-black/5"
					}`}
				>
					<p
						className={`text-xs ${
							theme === "dark" ? "text-gray-400" : "text-gray-600"
						}`}
					>
						{connectedServices.length} service
						{connectedServices.length > 1 ? "s" : ""} connected
					</p>
				</div>
			)}

			<div className="space-y-2">
				{services.map((service) => {
					const config = getServiceConfig(service.id);
					const isConnected = config.connected;

					return (
						<div
							key={service.id}
							className={`p-3 rounded-lg border transition-colors ${
								theme === "dark"
									? "bg-white/5 border-white/10 hover:bg-white/10"
									: "bg-black/5 border-black/10 hover:bg-black/10"
							}`}
						>
							<div className="flex items-start justify-between">
								<div className="flex items-center gap-3">
									<span className="text-2xl">{service.icon}</span>
									<div>
										<div className="flex items-center gap-2">
											<span className="text-sm font-medium">
												{service.name}
											</span>
											{isConnected && (
												<span
													className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${
														theme === "dark"
															? "bg-green-500/20 text-green-400"
															: "bg-green-100 text-green-700"
													}`}
												>
													<Icon name="check" size={10} />
													Connected
												</span>
											)}
										</div>
										<p
											className={`text-xs mt-0.5 ${
												theme === "dark"
													? "text-gray-500"
													: "text-gray-500"
											}`}
										>
											{service.description}
										</p>
										{isConnected && config.accountName && (
											<p
												className={`text-xs mt-1 ${
													theme === "dark"
														? "text-gray-400"
														: "text-gray-600"
												}`}
											>
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
												className={`p-1.5 rounded transition-colors ${
													theme === "dark"
														? "hover:bg-white/10 text-gray-400 hover:text-gray-300"
														: "hover:bg-black/10 text-gray-600 hover:text-gray-900"
												}`}
												title="Configure"
											>
												<Icon name="settings" size={14} />
											</button>
											<button
												type="button"
												onClick={() => handleSync(service.id)}
												className={`p-1.5 rounded transition-colors ${
													theme === "dark"
														? "hover:bg-white/10 text-gray-400 hover:text-gray-300"
														: "hover:bg-black/10 text-gray-600 hover:text-gray-900"
												}`}
												title="Sync now"
											>
												<Icon name="link" size={14} />
											</button>
											<button
												type="button"
												onClick={() => handleDisconnect(service.id)}
												className={`p-1.5 rounded transition-colors ${
													theme === "dark"
														? "hover:bg-red-500/20 text-gray-400 hover:text-red-400"
														: "hover:bg-red-100 text-gray-600 hover:text-red-600"
												}`}
												title="Disconnect"
											>
												<Icon name="link_off" size={14} />
											</button>
										</>
									) : (
										<button
											type="button"
											onClick={() => handleConnect(service.id)}
											className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
												theme === "dark"
													? "bg-blue-500/20 hover:bg-blue-500/30 text-blue-400"
													: "bg-blue-50 hover:bg-blue-100 text-blue-600"
											}`}
										>
											Connect
										</button>
									)}
								</div>
							</div>

							{config.lastSyncAt && (
								<div className="mt-2 pt-2 border-t border-white/10">
									<p
										className={`text-xs ${
											theme === "dark"
												? "text-gray-500"
												: "text-gray-500"
										}`}
									>
										Last sync:{" "}
										{new Date(config.lastSyncAt).toLocaleString()}
									</p>
								</div>
							)}
						</div>
					);
				})}
			</div>
		</section>
	);
}
