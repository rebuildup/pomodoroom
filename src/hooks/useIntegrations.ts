import { useCallback } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type {
	IntegrationConfig,
	IntegrationService,
	IntegrationsConfig,
} from "@/types";
import { INTEGRATION_SERVICES } from "@/types";

const DEFAULT_CONFIGS: IntegrationsConfig = {};

export function useIntegrations() {
	const [configs, setConfigs] = useLocalStorage<IntegrationsConfig>(
		"pomodoroom-integrations",
		DEFAULT_CONFIGS,
	);

	const getServiceConfig = useCallback(
		(service: IntegrationService): IntegrationConfig => {
			return (
				configs[service] || {
					service,
					connected: false,
				}
			);
		},
		[configs],
	);

	const connectService = useCallback(
		(service: IntegrationService, accountInfo: { id: string; name: string }) => {
			setConfigs((prev) => ({
				...prev,
				[service]: {
					service,
					connected: true,
					accountId: accountInfo.id,
					accountName: accountInfo.name,
					lastSyncAt: new Date().toISOString(),
				},
			}));
		},
		[setConfigs],
	);

	const disconnectService = useCallback(
		(service: IntegrationService) => {
			setConfigs((prev) => {
				const newConfigs = { ...prev };
				if (newConfigs[service]) {
					newConfigs[service] = {
						...newConfigs[service],
						connected: false,
						accountId: undefined,
						accountName: undefined,
						lastSyncAt: undefined,
					};
				}
				return newConfigs;
			});
		},
		[setConfigs],
	);

	const updateServiceConfig = useCallback(
		(service: IntegrationService, config: Record<string, unknown>) => {
			setConfigs((prev) => ({
				...prev,
				[service]: {
					...getServiceConfig(service),
					config,
				},
			}));
		},
		[setConfigs, getServiceConfig],
	);

	const syncService = useCallback(
		(service: IntegrationService) => {
			setConfigs((prev) => {
				const serviceConfig = prev[service];
				if (serviceConfig?.connected) {
					return {
						...prev,
						[service]: {
							...serviceConfig,
							lastSyncAt: new Date().toISOString(),
						},
					};
				}
				return prev;
			});
		},
		[setConfigs],
	);

	const connectedServices = INTEGRATION_SERVICES.filter(
		(s) => configs[s.id]?.connected,
	);

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
