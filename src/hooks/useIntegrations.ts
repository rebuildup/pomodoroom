import { useCallback, useEffect, useMemo } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type {
	IntegrationConfig,
	IntegrationService,
	IntegrationsConfig,
} from "@/types";
import { INTEGRATION_SERVICES } from "@/types";

const DEFAULT_CONFIGS: IntegrationsConfig = {};

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
	const [rawConfigs, setConfigs] = useLocalStorage<IntegrationsConfig>(
		"pomodoroom-integrations",
		DEFAULT_CONFIGS,
	);
	const configs = useMemo(() => normalizeConfigs(rawConfigs), [rawConfigs]);

	useEffect(() => {
		if (JSON.stringify(configs) !== JSON.stringify(rawConfigs)) {
			setConfigs(configs);
		}
	}, [configs, rawConfigs, setConfigs]);

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
			setConfigs((prev) => ({
				...prev,
				[key]: {
					service: key,
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
			const key = normalizeServiceId(service) as IntegrationService;
			setConfigs((prev) => {
				const newConfigs = { ...prev };
				if (newConfigs[key]) {
					newConfigs[key] = {
						...newConfigs[key],
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
			const key = normalizeServiceId(service) as IntegrationService;
			setConfigs((prev) => ({
				...prev,
				[key]: {
					...getServiceConfig(key),
					config,
				},
			}));
		},
		[setConfigs, getServiceConfig],
	);

	const syncService = useCallback(
		(service: IntegrationService) => {
			const key = normalizeServiceId(service) as IntegrationService;
			setConfigs((prev) => {
				const serviceConfig = prev[key];
				if (serviceConfig?.connected) {
					return {
						...prev,
						[key]: {
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
