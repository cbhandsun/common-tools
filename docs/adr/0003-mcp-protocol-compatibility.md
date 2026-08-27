# ADR 0003: MCP protocol compatibility and extension negotiation

## Decision

Support the stable baseline MCP protocol for all clients and expose Tasks, MCP Apps and the 2026-07 stateless HTTP additions only after each request explicitly negotiates the matching protocol version and feature. Unnegotiated clients receive the same bounded Job tools and structured responses; the server never advertises elicitation, notifications or an extension it cannot safely complete in the current transport.

## Consequences

Codex, Claude Code and other hosts can install capability plugins independently without requiring a synchronized client upgrade. New protocol features require a compatibility test and a documented downgrade path. The server keeps no HTTP session state and rejects malformed routing or feature headers instead of guessing client intent.
