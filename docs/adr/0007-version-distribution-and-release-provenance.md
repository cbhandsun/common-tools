# ADR 0007: Version, distribution and release provenance

## Decision

Distribute each capability as self-contained Codex and Claude plugin packages mirrored into their marketplaces. Capability manifests carry a content SHA-256, bounded Runtime compatibility range and lifecycle metadata; enabled local plugins persist the reviewed manifest identity and require explicit version-increasing upgrades. Team production deploys only immutable image digests bound to reproducible SBOM/release evidence, with optional enforced Cosign verification of the evidence and every deployed digest.

## Consequences

Plugin packages cannot silently reference external Skills or acquire unreviewed capabilities. Runtime incompatibility, marketplace drift, manifest hash drift, mutable images and incomplete release evidence fail before deployment. An organization may require Cosign in its production release path without imposing it on local Docker development. Signature keys, tokens and organization-specific notification endpoints remain outside the repository.
