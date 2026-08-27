# Common Tools Codex plugin

This is the Git Marketplace entry point for the complete Common Tools capability set. Adding the repository Marketplace installs this plugin by default.

The plugin contains the `image-to-editable`, `ppt-improve`, `ppt-quality`, and `project-audit` Skills. Its local MCP configuration starts `common-tools mcp serve`; install the matching versioned Common Tools Runtime before invoking MCP-backed work. A missing Runtime must fail visibly and must not cause a remote upload or capability substitution.

For a managed remote MCP deployment, publish the Codex directory produced by `scripts/generate-remote-plugin-bundles.js` instead. That package embeds the deployment's HTTPS MCP origin and OAuth client configuration.
