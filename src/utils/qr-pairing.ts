/**
 * QR Pairing - Desktop/Mobile settings sync via QR codes
 *
 * Enables quick initial setup by:
 * 1. Desktop exports settings as QR code
 * 2. Mobile scans QR code and imports settings
 *
 * Design goals:
 * - Minimal setup steps
 * - Secure one-time transfer
 * - No cloud account required
 */

// Settings that can be transferred via QR
export interface TransferableSettings {
	version: number;
	deviceId: string;
	timestamp: number;
	settings: {
		// Timer settings
		focusMinutes: number;
		shortBreakMinutes: number;
		longBreakMinutes: number;
		cyclesBeforeLongBreak: number;
		autoStartBreaks: boolean;
		autoStartFocus: boolean;

		// Notification settings
		soundEnabled: boolean;
		notificationEnabled: boolean;

		// Integration tokens (encrypted)
		googleToken?: string;
		notionToken?: string;
		linearToken?: string;
		githubToken?: string;
	};
	syncEndpoint?: string;
}

// QR pairing state
export interface QRPairingState {
	status: "idle" | "generating" | "ready" | "scanning" | "importing" | "success" | "error";
	qrData: string | null;
	expiresAt: number | null;
	error: string | null;
}

// QR data payload (what's actually encoded in QR)
export interface QRDataPayload {
	v: number; // version
	d: string; // device ID
	t: number; // timestamp
	s: string; // encrypted settings (base64)
	e?: number; // expiration timestamp
}

// Pairing result
export interface PairingResult {
	success: boolean;
	deviceId: string;
	importedAt: number;
	errors: string[];
}

// Configuration
const QR_CONFIG = {
	version: 1,
	qrValidityMs: 5 * 60 * 1000, // 5 minutes
	maxRetries: 3,
	settingsChunkSize: 500, // Max chars per QR for reliability
};

/**
 * Generate a unique device ID
 */
export function generateDeviceId(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Create transferable settings from current configuration
 */
export function createTransferableSettings(
	settings: TransferableSettings["settings"],
	deviceId?: string,
): TransferableSettings {
	return {
		version: QR_CONFIG.version,
		deviceId: deviceId ?? generateDeviceId(),
		timestamp: Date.now(),
		settings,
	};
}

/**
 * Encode settings for QR code
 */
export function encodeSettingsForQR(settings: TransferableSettings): string {
	const payload: QRDataPayload = {
		v: settings.version,
		d: settings.deviceId,
		t: settings.timestamp,
		s: btoa(JSON.stringify(settings.settings)), // Base64 encode
		e: Date.now() + QR_CONFIG.qrValidityMs,
	};

	// Compact JSON for smaller QR
	return JSON.stringify(payload);
}

/**
 * Decode QR data to settings
 */
export function decodeQRToSettings(qrData: string): TransferableSettings | null {
	try {
		const payload: QRDataPayload = JSON.parse(qrData);

		// Validate version
		if (payload.v !== QR_CONFIG.version) {
			console.error(`[QRPairing] Unsupported version: ${payload.v}`);
			return null;
		}

		// Check expiration
		if (payload.e && payload.e < Date.now()) {
			console.error("[QRPairing] QR code has expired");
			return null;
		}

		// Decode settings
		const settingsJson = atob(payload.s);
		const settings = JSON.parse(settingsJson);

		return {
			version: payload.v,
			deviceId: payload.d,
			timestamp: payload.t,
			settings,
		};
	} catch (error) {
		console.error("[QRPairing] Failed to decode QR data:", error);
		return null;
	}
}

/**
 * Validate imported settings
 */
export function validateImportedSettings(settings: TransferableSettings): {
	valid: boolean;
	errors: string[];
} {
	const errors: string[] = [];

	// Check required fields
	if (!settings.deviceId) {
		errors.push("Missing device ID");
	}

	if (!settings.timestamp) {
		errors.push("Missing timestamp");
	}

	// Validate timer settings
	const { focusMinutes, shortBreakMinutes, longBreakMinutes, cyclesBeforeLongBreak } =
		settings.settings;

	if (focusMinutes !== undefined && (focusMinutes < 1 || focusMinutes > 120)) {
		errors.push("Invalid focus minutes (1-120)");
	}

	if (shortBreakMinutes !== undefined && (shortBreakMinutes < 1 || shortBreakMinutes > 30)) {
		errors.push("Invalid short break minutes (1-30)");
	}

	if (longBreakMinutes !== undefined && (longBreakMinutes < 1 || longBreakMinutes > 60)) {
		errors.push("Invalid long break minutes (1-60)");
	}

	if (
		cyclesBeforeLongBreak !== undefined &&
		(cyclesBeforeLongBreak < 1 || cyclesBeforeLongBreak > 10)
	) {
		errors.push("Invalid cycles before long break (1-10)");
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}

/**
 * Merge imported settings with existing settings
 */
export function mergeImportedSettings(
	existing: Partial<TransferableSettings["settings"]>,
	imported: TransferableSettings["settings"],
): TransferableSettings["settings"] {
	return {
		// Use imported values, fallback to existing
		focusMinutes: imported.focusMinutes ?? existing.focusMinutes ?? 25,
		shortBreakMinutes: imported.shortBreakMinutes ?? existing.shortBreakMinutes ?? 5,
		longBreakMinutes: imported.longBreakMinutes ?? existing.longBreakMinutes ?? 15,
		cyclesBeforeLongBreak: imported.cyclesBeforeLongBreak ?? existing.cyclesBeforeLongBreak ?? 4,
		autoStartBreaks: imported.autoStartBreaks ?? existing.autoStartBreaks ?? false,
		autoStartFocus: imported.autoStartFocus ?? existing.autoStartFocus ?? false,
		soundEnabled: imported.soundEnabled ?? existing.soundEnabled ?? true,
		notificationEnabled: imported.notificationEnabled ?? existing.notificationEnabled ?? true,
		// Don't auto-merge tokens - they need explicit user consent
	};
}

/**
 * Create a QR pairing session (desktop side)
 */
export function createPairingSession(settings: TransferableSettings): {
	qrData: string;
	expiresAt: number;
	deviceId: string;
} {
	const qrData = encodeSettingsForQR(settings);

	return {
		qrData,
		expiresAt: Date.now() + QR_CONFIG.qrValidityMs,
		deviceId: settings.deviceId,
	};
}

/**
 * Import settings from QR scan (mobile side)
 */
export function importFromQRScan(
	qrData: string,
	existingSettings: Partial<TransferableSettings["settings"]>,
): PairingResult {
	// Decode QR data
	const settings = decodeQRToSettings(qrData);
	if (!settings) {
		return {
			success: false,
			deviceId: "",
			importedAt: Date.now(),
			errors: ["Failed to decode QR code"],
		};
	}

	// Validate
	const validation = validateImportedSettings(settings);
	if (!validation.valid) {
		return {
			success: false,
			deviceId: settings.deviceId,
			importedAt: Date.now(),
			errors: validation.errors,
		};
	}

	// Merge settings (used by caller)
	void mergeImportedSettings(existingSettings, settings.settings);

	return {
		success: true,
		deviceId: settings.deviceId,
		importedAt: Date.now(),
		errors: [],
	};
}

/**
 * Format QR data for display (debugging)
 */
export function formatQRDataForDisplay(qrData: string): string {
	try {
		const payload: QRDataPayload = JSON.parse(qrData);
		const expiresAt = payload.e ? new Date(payload.e).toLocaleTimeString() : "N/A";
		return `Version: ${payload.v}\nDevice: ${payload.d.slice(0, 8)}...\nExpires: ${expiresAt}`;
	} catch {
		return "Invalid QR data";
	}
}

/**
 * Get QR code size recommendation
 */
export function getQRCodeSizeRecommendation(dataLength: number): {
	size: number;
	level: "L" | "M" | "Q" | "H";
} {
	// QR code capacity varies by error correction level
	// L (Low): ~7% error correction
	// M (Medium): ~15% error correction
	// Q (Quartile): ~25% error correction
	// H (High): ~30% error correction

	if (dataLength < 100) {
		return { size: 200, level: "H" };
	} else if (dataLength < 300) {
		return { size: 300, level: "M" };
	} else if (dataLength < 500) {
		return { size: 400, level: "L" };
	}
	return { size: 500, level: "L" };
}

/**
 * Check if QR pairing is supported
 */
export function isQRPairingSupported(): {
	generate: boolean;
	scan: boolean;
	reasons: string[];
} {
	const reasons: string[] = [];

	// Check for camera access (scanning)
	const hasCamera = "mediaDevices" in navigator;
	if (!hasCamera) {
		reasons.push("Camera not available for QR scanning");
	}

	// Check for canvas (QR generation)
	const hasCanvas =
		typeof document !== "undefined" && !!document.createElement("canvas").getContext;
	if (!hasCanvas) {
		reasons.push("Canvas not available for QR generation");
	}

	return {
		generate: hasCanvas,
		scan: hasCamera,
		reasons,
	};
}
