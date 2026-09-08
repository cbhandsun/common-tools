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
    files: ["packages/**/*.js", "scripts/**/*.js", "skills/pd-hifi-slideclone/scripts/lib/graphic-crop-materializer.js", "skills/pd-hifi-slideclone/scripts/lib/final-page-cache.js", "skills/pd-hifi-slideclone/scripts/lib/render-cache-metadata.js", "packages/slideclone-native-engine/scripts/adapters/render-libreoffice.js", "packages/slideclone-native-engine/scripts/lib/png.js", "packages/slideclone-native-engine/scripts/lib/config-validation.js", "packages/slideclone-native-engine/scripts/lib/quality-gate-output.js", "packages/slideclone-native-engine/scripts/lib/quality-gate-policy.js", "packages/slideclone-native-engine/scripts/lib/quality-evidence-cache.js", "packages/slideclone-native-engine/scripts/lib/quality-trend.js", "packages/slideclone-native-engine/scripts/lib/arc-line-end-ooxml.js", "packages/slideclone-native-engine/scripts/lib/ooxml-package-fingerprint.js", "packages/slideclone-native-engine/scripts/adapters/compare-placeholder.js", "packages/slideclone-native-engine/scripts/adapters/diff-pixel-png.js", "packages/slideclone-native-engine/scripts/adapters/vision-flow-diagram-rules.js", "packages/slideclone-native-engine/scripts/adapters/vision-editable-overlay.js", "packages/slideclone-native-engine/scripts/lib/powerpoint-roundtrip-evidence.js", "packages/slideclone-native-engine/scripts/lib/powerpoint-open-evidence.js", "packages/slideclone-native-engine/scripts/lib/powerpoint-session-client.js", "packages/slideclone-native-engine/scripts/lib/powerpoint-session-broker.js", "packages/slideclone-native-engine/scripts/lib/powerpoint-corpus-session.js", "packages/slideclone-native-engine/scripts/adapters/validate-powerpoint-editable-roundtrip.js", "packages/slideclone-native-engine/scripts/lib/progress-reporter.js", "packages/slideclone-native-engine/scripts/adapters/validate-powerpoint-com.js"],
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
