module.exports = {
	root: true,
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended",
		"plugin:react/recommended",
		"plugin:react-hooks/recommended",
	],
	parser: "@typescript-eslint/parser",
	plugins: ["@typescript-eslint", "react", "react-hooks"],
	parserOptions: {
		ecmaFeatures: {
			jsx: true,
		},
		ecmaVersion: "latest",
		sourceType: "module",
	},
	env: {
		"react-native/react-native": true,
	},
	rules: {
		"react/react-in-jsx-scope": "off",
		"@typescript-eslint/explicit-function-return-type": "off",
		"@typescript-eslint/explicit-module-boundary-types": "off",
	},
	settings: {
		react: {
			version: "detect",
		},
	},
};
