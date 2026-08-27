"use strict";

const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: [
      "**/node_modules/**",
      "**/bin/**",
      "**/obj/**",
      "artifacts/**",
      "runs/**",
      ".codex-*/**",
      ".common-tools*/**"
    ]
  },
  {
    files: ["packages/**/*.js", "scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node }
    },
    plugins: { js },
    rules: {
      ...js.configs.recommended.rules,
      "no-console": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }]
    }
  },
  {
    files: ["packages/**/bin/**/*.js", "scripts/**/*.js"],
    rules: { "no-console": "off" }
  }
];
