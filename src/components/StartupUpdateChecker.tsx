import { useEffect, useRef, useState } from "react";
import { sendNotification, isPermissionGranted } from "@tauri-apps/plugin-notification";
import { useUpdater } from "@/hooks/useUpdater";
import { isTauriEnvironment } from "@/lib/tauriEnv";
import { Icon } from "@/components/m3/Icon";

export default function StartupUpdateChecker() {
	const { status, updateInfo, applyUpdateAndRestart, error } = useUpdater();
	const notifiedRef = useRef<string | null>(null);
	const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
	const [isApplying, setIsApplying] = useState(false);

	useEffect(() => {
		if (!isTauriEnvironment()) {
			return;
		}

		if (status !== "available" || !updateInfo?.version) {
			return;
		}

		if (notifiedRef.current === updateInfo.version) {
			return;
		}
		const sessionKey = `pomodoroom-update-notified-${updateInfo.version}`;
		if (sessionStorage.getItem(sessionKey) === "1") {
			return;
		}

		notifiedRef.current = updateInfo.version;
		sessionStorage.setItem(sessionKey, "1");

		void (async () => {
			try {
				const allowed = await isPermissionGranted();
				if (!allowed) {
					console.info("[StartupUpdateChecker] Notification permission is not granted; showing in-app banner only.");
					return;
				}

				sendNotification({
					title: "Pomodoroom Update Available",
					body: `v${updateInfo.version} is available. Open Settings > Updates to install.`,
					icon: "icons/32x32.png",
				});
			} catch (error) {
				console.error("[StartupUpdateChecker] Failed to show update notification:", error);
			}
		})();
	}, [status, updateInfo]);

	if (status !== "available" || !updateInfo?.version) {
		return null;
	}

	if (dismissedVersion === updateInfo.version) {
		return null;
	}

	return (
		<div
			className="fixed top-3 right-3 z-[1060] w-[360px] max-w-[calc(100vw-1.5rem)] rounded-xl border px-3 py-2 shadow-lg backdrop-blur"
			style={{
				backgroundColor: "var(--md-ref-color-surface-container-highest)",
				borderColor: "var(--md-ref-color-outline-variant)",
				color: "var(--md-ref-color-on-surface)",
			}}
		>
			<div
				className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
				style={{ backgroundColor: "var(--md-ref-color-primary)" }}
			/>
			<div className="flex items-start gap-2 pl-1">
				<Icon
					name="update"
					size={16}
					className="mt-0.5"
					color="var(--md-ref-color-primary)"
				/>
				<div className="flex-1">
					<div className="text-sm font-semibold leading-5">Update Available</div>
					<div
						className="text-xs leading-4 mt-0.5"
						style={{ color: "var(--md-ref-color-on-surface-variant)" }}
					>
						v{updateInfo.version} is ready.
					</div>
					{error && (
						<div className="text-[11px] mt-1 text-red-400">
							{error}
						</div>
					)}
				</div>
			</div>
			<div className="mt-2 ml-6 flex gap-2">
				<button
					type="button"
					className="px-2.5 py-1.5 rounded-md text-xs font-medium"
					style={{
						backgroundColor: "var(--md-ref-color-surface)",
						color: "var(--md-ref-color-on-surface-variant)",
						border: "1px solid var(--md-ref-color-outline-variant)",
					}}
					onClick={() => setDismissedVersion(updateInfo.version)}
				>
					Ignore
				</button>
				<button
					type="button"
					disabled={isApplying}
					className="px-2.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5"
					style={{
						backgroundColor: "var(--md-ref-color-primary)",
						color: "var(--md-ref-color-on-primary)",
						opacity: isApplying ? 0.65 : 1,
					}}
					onClick={async () => {
						setIsApplying(true);
						try {
							await applyUpdateAndRestart();
						} catch (e) {
							console.error("[StartupUpdateChecker] Update failed:", e);
						}
						setIsApplying(false);
					}}
				>
					<Icon name="refresh" size={13} color="var(--md-ref-color-on-primary)" />
					{isApplying ? "Updating..." : "Restart to Update"}
				</button>
			</div>
		</div>
	);
}
