# ADR 0002: Local job storage

## Decision

Store local jobs as atomically written JSON files under a user-selected state root. Each job has an owner, idempotency key, expiry, lease metadata and an explicit state transition graph.

## Consequences

This is suitable for a single local user and is not a team scheduler. I5 will replace the persistence adapter with PostgreSQL while preserving the public Job contract.
