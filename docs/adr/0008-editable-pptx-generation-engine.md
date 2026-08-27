# ADR 0008: Editable PPTX generation engine

## Decision

Use the validated Deck IR as the only presentation-generation contract and keep the .NET OpenXML builder as the primary editable PPTX writer. Detection, reconstruction policy, native-shape generation and residual-fidelity handling remain JavaScript domain services; the composition entry point wires those services to the OpenXML adapter but does not implement domain algorithms.

Do not add PptxGenJS to the production dependency graph while the OpenXML writer already supports the required native charts, grouped components, connectors, custom geometry, rich text, picture crops, semantic metadata, template preservation and batch generation. A second writer may be evaluated only as an isolated IR adapter after a reproducible benchmark demonstrates a material capability, correctness or throughput gap that cannot be addressed safely in the existing writer. It must not introduce a second domain model or bypass package validation, source-media exclusion, editability checks, rendering comparison or PowerPoint-open gates.

## Consequences

All reconstruction families share one coordinate system, metadata model and set of quality gates. PowerPoint compatibility fixes remain centralized instead of being duplicated across JavaScript and .NET writers. The project accepts the maintenance cost of explicit OpenXML features where required, in exchange for deterministic package control and advanced DrawingML support.

PptxGenJS remains suitable for separate prototypes or benchmark fixtures, but adding it to a production package requires a successor ADR, a direct dependency declaration, an IR conformance adapter, representative visual/editability benchmarks and a migration or rollback plan. Engine-specific objects must never leak into detectors, policies or native-component plugins.
