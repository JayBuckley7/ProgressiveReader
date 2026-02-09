import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "public",
      "src/data",
      "src/types/api.ts",
      "eslint.config.js",
      "postcss.config.js",
      "tailwind.config.js",
      "vite.config.ts",
    ],
  },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "unused-imports": unusedImports,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // Prefer type-safe code in app code; relax in tests/workers via overrides below.

      // Only warn on unused variables, and ignore variables starting with `_`
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],
      
      // Auto-remove unused imports
      "unused-imports/no-unused-imports": "error",

      // Allow `@ts-expect-error` when it has a short explanation.
      "@typescript-eslint/ban-ts-comment": [
        "warn",
        {
          "ts-expect-error": "allow-with-description",
          "minimumDescriptionLength": 10,
        },
      ],

      // Discourage explicit `any` in app code (allowed in targeted overrides).
      "@typescript-eslint/no-explicit-any": "warn",

      // The no-unsafe-* rules require type-aware linting, which is currently too heavy for this repo.
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",

      // Allow async functions without await
      // for consistency in some integration-style code.
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: [
      "src/test/**/*.{ts,tsx}",
      "src/workers/**/*.{ts,tsx}",
      "src/types/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
