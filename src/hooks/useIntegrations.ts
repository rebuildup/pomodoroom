import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauriEnvironment } from "@/lib/tauriEnv";
import type { IntegrationConfig, IntegrationService, IntegrationsConfig } from "@/types";
import { INTEGRATION_SERVICES } from "@/types";

const DEFAULT_CONFIGS: IntegrationsConfig = {};

interface IntegrationStatusPayload {
	service: string;
	connected: boolean;
	last_sync?: string | null;
}

function normalizeServiceId(service: string): string {
	if (service === "google") return "google_calendar";
	return service;
}

function normalizeConfigs(configs: IntegrationsConfig): IntegrationsConfig {
	const next: IntegrationsConfig = { ...configs };
	const legacy = next.google as IntegrationConfig | undefined;
	if (legacy && !next.google_calendar) {
		next.google_calendar = {
			...legacy,
			service: "google_calendar",
		};
	}
	if (next.google) {
		delete next.google;
	}
	return next;
}

export function useIntegrations() {
	const useTauri = isTauriEnvironment();
	const [bridgeConfigs, setBridgeConfigs] = useState<IntegrationsConfig>(DEFAULT_CONFIGS);
	const configs = useMemo(() => normalizeConfigs(bridgeConfigs), [bridgeConfigs]);

	const applyStatusToBridgeConfig = useCallback((status: IntegrationStatusPayload) => {
		const key = normalizeServiceId(status.service) as IntegrationService;
		setBridgeConfigs((prev) =>
			normalizeConfigs({
				...prev,
				[key]: {
					...prev[key],
					service: key,
					connected: Boolean(status.connected),
					lastSyncAt: status.last_sync ?? undefined,
				},
			}),
		);
	}, []);

	const refreshFromBridge = useCallback(async () => {
		if (!useTauri) return;
		try {
			const list = await invoke<IntegrationStatusPayload[]>("cmd_integration_list");
			setBridgeConfigs((prev) => {
				const next = { ...prev };
				for (const status of list) {
					const key = normalizeServiceId(status.service) as IntegrationService;
					next[key] = {
						...next[key],
						service: key,
						connected: Boolean(status.connected),
						lastSyncAt: status.last_sync ?? undefined,
					};
				}
				return normalizeConfigs(next);
			});
		} catch (error) {
			console.error("[useIntegrations] Failed to load integration statuses:", error);
		}
	}, [useTauri]);

	const refreshServiceFromBridge = useCallback(
		async (service: IntegrationService) => {
			if (!useTauri) return;
			const key = normalizeServiceId(service) as IntegrationService;
			try {
				const status = await invoke<IntegrationStatusPayload>("cmd_integration_get_status", {
					serviceName: key,
				});
				applyStatusToBridgeConfig(status);
			} catch (error) {
				console.error(`[useIntegrations] Failed to refresh status for ${key}:`, error);
			}
		},
		[applyStatusToBridgeConfig, useTauri],
	);

	useEffect(() => {
		if (!useTauri) return;
		void refreshFromBridge();

		const handleRefresh = () => {
			void refreshFromBridge();
		};

		window.addEventListener("focus", handleRefresh);
		window.addEventListener("integrations:refresh", handleRefresh as EventListener);
		return () => {
			window.removeEventListener("focus", handleRefresh);
			window.removeEventListener("integrations:refresh", handleRefresh as EventListener);
		};
	}, [refreshFromBridge, useTauri]);

	const getServiceConfig = useCallback(
		(service: IntegrationService): IntegrationConfig => {
			const key = normalizeServiceId(service) as IntegrationService;
			return (
				configs[key] || {
					service: key,
					connected: false,
				}
			);
		},
		[configs],
	);

	const connectService = useCallback(
		(service: IntegrationService, accountInfo: { id: string; name: string }) => {
			const key = normalizeServiceId(service) as IntegrationService;
			if (useTauri) {
				const tokensJson = JSON.stringify({
					access_token: accountInfo.id,
					account_name: accountInfo.name,
					connected_at: new Date().toISOString(),
				});
				void invoke("cmd_store_oauth_tokens", {
					serviceName: key,
					tokensJson,
				})
					.then(() => {
						setBridgeConfigs((prev) => ({
							...prev,
							[key]: {
								...prev[key],
								service: key,
								connected: true,
								accountId: accountInfo.id,
								accountName: accountInfo.name,
								lastSyncAt: prev[key]?.lastSyncAt ?? new Date().toISOString(),
							},
						}));
						return refreshServiceFromBridge(key);
					})
					.catch((error) => {
						console.error(`[useIntegrations] Failed to connect ${key}:`, error);
					});
				return;
			}
			// Web dev mode removed - database-only architecture
		},
		[refreshServiceFromBridge, useTauri],
	);

	const disconnectService = useCallback(
		(service: IntegrationService) => {
			const key = normalizeServiceId(service) as IntegrationService;
			if (useTauri) {
				void invoke("cmd_integration_disconnect", { serviceName: key })
					.then(() => refreshServiceFromBridge(key))
					.catch((error) => {
						console.error(`[useIntegrations] Failed to disconnect ${key}:`, error);
					});
				return;
			}
			// Web dev mode removed - database-only architecture
		},
		[refreshServiceFromBridge, useTauri],
	);

	const updateServiceConfig = useCallback(
		(service: IntegrationService, config: Record<string, unknown>) => {
			const key = normalizeServiceId(service) as IntegrationService;
			if (useTauri) {
				setBridgeConfigs((prev) => ({
					...prev,
					[key]: {
						...getServiceConfig(key),
						config,
					},
				}));
				return;
			}
			// Web dev mode removed - database-only architecture
		},
		[getServiceConfig, useTauri],
	);

	const syncService = useCallback(
		(service: IntegrationService) => {
			const key = normalizeServiceId(service) as IntegrationService;
			if (useTauri) {
				void invoke<{ synced_at?: string }>("cmd_integration_sync", { serviceName: key })
					.then((result) => {
						setBridgeConfigs((prev) => ({
							...prev,
							[key]: {
								...getServiceConfig(key),
								lastSyncAt: result?.synced_at ?? new Date().toISOString(),
							},
						}));
					})
					.catch((error) => {
						console.error(`[useIntegrations] Failed to sync ${key}:`, error);
					});
				return;
			}
			// Web dev mode removed - database-only architecture
		},
		[getServiceConfig, useTauri],
	);

	const connectedServices = INTEGRATION_SERVICES.filter((s) => configs[s.id]?.connected);

	return {
		configs,
		services: INTEGRATION_SERVICES,
		connectedServices,
		getServiceConfig,
		connectService,
		disconnectService,
		updateServiceConfig,
		syncService,
	};
}
