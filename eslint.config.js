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
    files: ["packages/**/*.js", "scripts/**/*.js", "skills/pd-hifi-slideclone/scripts/lib/powerpoint-roundtrip-evidence.js", "skills/pd-hifi-slideclone/scripts/adapters/validate-powerpoint-editable-roundtrip.js", "skills/pd-hifi-slideclone/scripts/lib/powerpoint-open-evidence.js", "skills/pd-hifi-slideclone/scripts/lib/progress-reporter.js", "skills/pd-hifi-slideclone/scripts/adapters/validate-powerpoint-com.js"],
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
