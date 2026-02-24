/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_GOOGLE_CLIENT_ID: string;
	readonly VITE_GOOGLE_CLIENT_SECRET: string;
	readonly DEV: boolean;
	readonly PROD: boolean;
	readonly MODE: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
