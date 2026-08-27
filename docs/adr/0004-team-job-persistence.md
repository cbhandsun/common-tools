# ADR 0004: Team Job persistence and delivery

## Decision

Use PostgreSQL as the authoritative Team Job and audit-event store, Redis as a capability-partitioned pending/processing delivery queue, and S3-compatible object storage for owner/job-scoped inputs and artifacts. A Worker acknowledges Redis only after the lease-constrained PostgreSQL transition and artifact validation succeed. The local JSON JobStore remains a separate single-user adapter.

## Consequences

Multiple stateless API replicas and isolated Workers can recover after restarts without treating a queue acknowledgement as task completion. Database migrations gate API and Worker startup. Provider credentials, object keys and raw reports are not written to MCP responses, metrics or audit summaries. Operating the team adapter requires managed backup, restore and retention procedures; it does not turn local JSON state into a shared service.
