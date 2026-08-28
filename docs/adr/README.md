# Architecture Decision Records

ADRs freeze decisions that affect contracts, security boundaries, compatibility, or deployment. A change that invalidates an accepted ADR requires a successor ADR and a migration plan. `npm run common-tools:verify-adrs` checks that this index and every required decision record remain complete.

| ADR | Status | Scope |
| --- | --- | --- |
| [0001](0001-local-runtime-baseline.md) | Accepted | Node/workspace baseline |
| [0002](0002-local-job-storage.md) | Superseded in team mode | Local Job storage |
| [0003](0003-mcp-protocol-compatibility.md) | Accepted | MCP protocol negotiation and extension boundaries |
| [0004](0004-team-job-persistence.md) | Accepted | PostgreSQL/Redis/object-storage team Runtime |
| [0005](0005-artifact-and-archive-security.md) | Accepted | Inputs, artifacts, ZIP/TAR and filesystem boundaries |
| [0006](0006-worker-isolation.md) | Accepted | Docker Worker isolation and capability partitioning |
| [0007](0007-version-distribution-and-release-provenance.md) | Accepted | Runtime/plugin compatibility and signed release provenance |
| [0008](0008-editable-pptx-generation-engine.md) | Accepted | Deck IR and editable PPTX writer boundary |
| [0009](0009-plugin-and-mcp-contract-boundary.md) | Accepted | Plugin product surface, host binding and MCP tool contracts |
| [0010](0010-ppt-create-shared-generation-architecture.md) | Accepted | Shared local/remote PPT creation and clean-room provenance |
