# Git Marketplace installation

The repository root is a Codex Git Marketplace. Its single `common-tools` plugin is marked `INSTALLED_BY_DEFAULT`, so adding the Marketplace installs the complete Skill surface without requiring four separate plugin selections.

## Codex desktop

Open **Plugins → Add → Add plugin marketplace** and enter:

- Source: `cbhandsun/common-tools`
- Git ref: `main` while validating an unpublished change; use a reviewed immutable release tag after the first Marketplace release
- Sparse paths, one per line:
  - `.agents/plugins`
  - `plugins/common-tools`

After adding the Marketplace, start a new task so Codex loads the installed Skills and MCP declaration.

## CLI equivalent

```powershell
codex plugin marketplace add cbhandsun/common-tools --ref main --sparse .agents/plugins --sparse plugins/common-tools
```

The Marketplace policy installs `common-tools` by default. If an older Codex build only registers the Marketplace, install explicitly:

```powershell
codex plugin add common-tools@common-tools
```

## Runtime boundary

The repository plugin starts the local MCP server with `common-tools mcp serve`. The matching versioned Common Tools Runtime must already provide the `common-tools` executable on `PATH`. Missing Runtime is an explicit installation error; it must not silently switch to remote execution or upload project data.

For a managed remote service, publish the contents of the generated `codex` directory from `scripts/generate-remote-plugin-bundles.js` as the root of a separate Git repository or release branch. That generated Marketplace also marks its unified plugin `INSTALLED_BY_DEFAULT` and embeds the deployment-specific HTTPS MCP origin and OAuth client. Split capability packages remain `AVAILABLE` so adding their Marketplace never installs every split plugin unexpectedly.

OAuth and user permission prompts remain interactive even when plugin installation is automatic.
