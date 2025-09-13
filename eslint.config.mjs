import js from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import typescriptEslintParser from "@typescript-eslint/parser";
import prettier from "eslint-plugin-prettier";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";

export default [
  // Ignore patterns
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/out/**",
      "**/build/**",
      "**/dist/**",
      "**/debug-auth.js",
      "**/temp/**",
      "**/next-env.d.ts", // Generated Next.js types file
    ],
  },
  
  // Base ESLint recommended config
  js.configs.recommended,
  
  // Main configuration for TypeScript files
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    plugins: {
      "@typescript-eslint": typescriptEslint,
      prettier,
      "unused-imports": unusedImports,
    },
    languageOptions: {
      parser: typescriptEslintParser,
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      // TypeScript ESLint recommended rules
      ...typescriptEslint.configs.recommended.rules,
      
      // Custom rules
      "prettier/prettier": "error",
      "no-console": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  
  // Override for test files
  {
    files: ["tests/**/*.test.ts", "tests/**/*.test.js"],
    rules: {
      "no-console": "off",
    },
  },
  
  // Override for script files - allow console.log and relax some rules
  {
    files: ["scripts/**/*.js", "scripts/**/*.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  
  // Override for JavaScript files - allow require and relax some rules
  {
    files: ["**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  
  // Override for React files - add React to globals
  {
    files: ["**/*.tsx", "**/*.jsx"],
    languageOptions: {
      globals: {
        React: "readonly",
      },
    },
  },
  
  // Override for Node.js files - add NodeJS global
  {
    files: ["**/*.ts", "**/*.js"],
    languageOptions: {
      globals: {
        NodeJS: "readonly",
      },
    },
  },
  
  // Override for demo and setup scripts - relax some rules
  {
    files: ["scripts/generate-demo-data.ts", "scripts/setup-keycloak.ts", "scripts/setup-better-auth-test-users.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-vars": "off",
      "no-case-declarations": "off",
    },
  },
];