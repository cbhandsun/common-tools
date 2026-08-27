# ADR 0001: Local runtime baseline

## Decision

Use npm workspaces and CommonJS on Node 22 for the initial local runtime. The capability core uses Node standard-library primitives until a direct dependency is required by an implemented integration. Every added package must be declared directly and committed with `package-lock.json`.

## Consequences

The local CLI and stdio MCP bridge can run without a package install beyond the repository lockfile. A future MCP SDK adoption requires a separate ADR covering the SDK version and negotiated protocol support.
