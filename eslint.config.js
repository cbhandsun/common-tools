"use strict";

const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: [
      "**/node_modules/**",
      "skills/**/dotnet/**/bin/**",
      "**/obj/**",
      "artifacts/**",
      "runs/**",
      ".codex-*/**",
      ".common-tools*/**"
    ]
  },
  {
    files: ["packages/**/*.js", "scripts/**/*.js", "skills/pd-hifi-slideclone/scripts/lib/graphic-crop-materializer.js", "skills/pd-hifi-slideclone/scripts/lib/final-page-cache.js", "skills/pd-hifi-slideclone/scripts/lib/render-cache-metadata.js", "skills/pd-hifi-slideclone/scripts/adapters/render-libreoffice.js", "skills/pd-hifi-slideclone/scripts/lib/powerpoint-roundtrip-evidence.js", "skills/pd-hifi-slideclone/scripts/lib/powerpoint-open-evidence.js", "skills/pd-hifi-slideclone/scripts/lib/powerpoint-session-client.js", "skills/pd-hifi-slideclone/scripts/lib/powerpoint-session-broker.js", "skills/pd-hifi-slideclone/scripts/lib/powerpoint-corpus-session.js", "skills/pd-hifi-slideclone/scripts/adapters/validate-powerpoint-editable-roundtrip.js", "skills/pd-hifi-slideclone/scripts/lib/progress-reporter.js", "skills/pd-hifi-slideclone/scripts/adapters/validate-powerpoint-com.js"],
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
    files: ["packages/cli/bin/**/*.js", "scripts/**/*.js"],
    rules: { "no-console": "off" }
  }
];
