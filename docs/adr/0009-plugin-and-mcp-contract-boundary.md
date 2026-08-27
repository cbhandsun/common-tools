# ADR 0009: Plugin packaging and MCP tool contract boundary

## Decision

Publish one unified Common Tools remote plugin by default, while retaining the split per-capability layout as an explicit least-privilege distribution option. Capability manifests remain the source of truth for capability identity, tool membership, OAuth scope, deployment mapping and runtime compatibility. Generated Codex and Claude packages must carry their MCP connection in `.mcp.json`; a Codex manifest must reference that file through `mcpServers` so installation does not depend on a separately maintained connection definition.

Define each MCP tool once in a contract module. A tool contract includes its capability owner, description, closed input schema, output schema and all four safety annotations. Local and team execution paths validate external arguments before dispatch and validate structured output before returning it. The portable schema validator supports only the bounded JSON Schema subset used by these contracts and remains dependency-free so generated Local Runtime payloads are self-contained.

Keep protocol transport, OAuth, persistence, workers, plugin skills and domain implementations outside the contract modules. Composition roots may filter contracts by authorization and negotiated extensions, but must not duplicate schemas or business logic.

## Consequences

Plugin installation, marketplace metadata and MCP connectivity are generated from one release path, reducing host drift. Tools become inspectable and testable without starting a transport, while implementation/schema mismatches fail closed. The unified default gives users one product surface; split packages remain available where separate installation and authorization are required.

Adding a schema feature beyond objects, arrays, strings, safe integers, required properties, enums, bounds and patterns requires tests for valid, empty, malformed, extreme and undeclared inputs before extending the portable validator. A new tool must update its capability manifest and contract together and pass the contract, plugin, runtime-package and protocol gates.
