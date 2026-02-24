module.exports = {
	preset: "jest-expo",
	setupFilesAfterEnv: ["<rootDir>/src/test-setup.ts"],
	transformIgnorePatterns: [
		"node_modules/(?!((react-native|@react-native|expo|@expo|react-native-paper|react-native-vector-icons)/))",
	],
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
	collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts", "!src/test-setup.ts"],
};
