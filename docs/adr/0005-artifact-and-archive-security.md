# ADR 0005: Artifact and archive security boundary

## Decision

Treat all inputs, generated reports and archives as untrusted. Jobs accept only capability-declared media types, bounded sizes and approved roots; ZIP/TAR readers reject path traversal, symbolic links, unsupported compression and malformed local/central records. Artifacts use opaque owner/job prefixes, SHA-256 integrity records and fixed report schemas. No capability overwrites its source input.

## Consequences

Handlers must parse, coerce, validate and sanitize at every external boundary, and return bounded error classes rather than raw provider or filesystem messages. New archive formats, report fields or repair profiles require explicit contract tests for normal, malformed, oversized and path-escape cases. Quality reports can guide a safe follow-up repair Job without becoming an authority to modify the original file.
