// Test setup file
import "react-native-gesture-handler/jestSetup";

// Mock expo-sqlite
jest.mock("expo-sqlite", () => ({
	openDatabaseAsync: jest.fn(),
}));

// Mock react-native-paper
jest.mock("react-native-paper", () => ({
	...jest.requireActual("react-native-paper"),
	useTheme: () => ({
		colors: {
			primary: "#6750A4",
			secondary: "#625B71",
			secondaryContainer: "#E8DEF8",
		},
	}),
}));

// Mock react-native-safe-area-context
jest.mock("react-native-safe-area-context", () => ({
	SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
