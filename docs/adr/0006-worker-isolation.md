# ADR 0006: Capability-partitioned Worker isolation

## Decision

Run each remote capability in a dedicated Docker Worker profile with a fixed capability allowlist, non-root user, read-only root filesystem, dropped Linux capabilities, bounded resources and no host Docker socket or arbitrary bind mount. The image-to-editable engine is a separate image; audit and PPT-quality Workers reuse the remote Runtime image only for their constrained handlers.

## Consequences

Enabling a capability requires one central deployment-plan entry, a matching Compose service/profile/image and an OAuth scope. Workers cannot claim another capability's queue. Local interactive Office/COM remains outside containerized team execution. Docker Compose smoke tests and capability contracts must verify the profile/image mapping before a new Worker is published.
