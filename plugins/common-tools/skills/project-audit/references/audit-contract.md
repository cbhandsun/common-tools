# Project Audit Contract

## Audit levels

- `quick`: prioritize changed or critical surfaces and high-risk gaps; browser scenarios and runtime gates are not required unless separately requested.
- `standard`: require reviewed `first-visit`, `core-flow`, `state-feedback`, `responsive`, and `keyboard` scenarios when the visual-interaction domain applies; require authorized runtime gates when engineering-delivery applies. This is the default.
- `deep`: require all eight reviewed experience scenarios when visual-interaction applies; require authorized runtime gates when engineering-delivery applies; expand the remaining selected domains according to product risk.

The level controls depth and evidence expectations. Requirements apply only to selected domains. It never grants permission to run project gates, automate a browser, access an external URL, upload source, or use remote execution. Missing authorization or evidence remains `not-verified`; never silently downgrade the selected level.

## Audit lenses

Review only applicable lenses, but name every omitted or unverified lens.

### Product journey

- Intended user, goal, entrypoint, and success condition
- Discoverability, navigation, information architecture, and task orientation
- Primary and secondary flow continuity
- Loading, empty, validation, success, failure, retry, cancellation, and destructive states
- Copy, calls to action, trust, reassurance, and error prevention

### Visual and interaction

- Hierarchy, layout, spacing, typography, color, iconography, density, and consistency
- Design-system and cross-screen consistency
- Control affordance, feedback, disabled states, focus, overlays, and motion
- Narrow and wide layouts, zoom and reflow, touch targets, and content overflow

### Accessibility

- Semantic structure and reading order
- Keyboard access, focus visibility, focus order, and focus restoration
- Labels, instructions, error association, and state announcements
- Contrast, non-color cues, motion and timing controls
- Screen-reader and assistive-technology robustness

Never claim WCAG compliance from static semantics or screenshots alone.

### Data, security, and reliability

- External-input parsing, coercion, validation, and sanitization
- API contracts, failure semantics, authorization at every boundary, and least privilege
- Data lifecycle, consistency, idempotency, retention, privacy, and sensitive operations
- Background work, retry limits, timeout, cancellation, dead-letter, and recovery behavior
- Secret handling, dependency and supply-chain evidence, logging safety, and abuse boundaries

### Engineering and delivery

- Direct dependencies, lockfiles, test coverage, and unified CI entrypoints
- Type, lint, unit, integration, end-to-end, build, and security gates
- Observability, health checks, deployment, migration, rollback, backup, and restore evidence
- Release governance, artifact integrity, operational ownership, and production verification

## Evidence rules

Use this evidence hierarchy:

1. Reproduced runtime behavior and inspected capture
2. Executed gate output
3. Focused automated test
4. Parsed implementation and contract
5. Static keyword or filename candidate

A lower level may identify where to inspect; it cannot prove a higher-level claim.

For each candidate:

- Open the referenced file and inspect the surrounding implementation.
- Confirm that the line belongs to production code, not a regex, string example, comment, fixture, generated artifact, or unrelated documentation.
- Confirm applicability to the scoped user journey or production boundary.
- Seek negative and boundary cases, not only presence.
- Require runtime evidence for visual, responsive, keyboard, focus, assistive-technology, network-recovery, and production behavior.

## Finding classification

- `confirmed-issue`: Evidence demonstrates incorrect, unsafe, inaccessible, incomplete, or misleading behavior.
- `healthy-with-evidence`: Suitable evidence demonstrates the scoped behavior and relevant boundary cases.
- `not-verified`: Evidence is absent, unsuitable, incomplete, or not inspected.
- `not-applicable`: The lens does not apply to the confirmed project profile and scope.

Do not use “pass” for candidate presence. Absence of a detected issue is not proof of health.

Use priorities consistently:

- `P0`: active security, data-loss, severe authorization, or production-outage risk
- `P1`: blocks a core journey or creates major accessibility, reliability, or release risk
- `P2`: meaningful friction, incomplete boundary handling, or maintainability risk
- `P3`: polish or low-impact consistency issue

## Required finding fields

Every actionable finding must contain:

- ID, audit lens, priority, classification, and confidence
- Journey step, route, component, or operational boundary
- Evidence path and exact line, screenshot, gate, console, or network artifact
- Observed behavior or implementation
- User, security, data, or production impact
- Recommended change
- Verification and regression-test method

Keep source and captured user content out of logs and reports. For possible secrets, report only relative path, line, and rule.

## Experience acceptance

List every requested journey step. Inspect each accepted screenshot before using it. A scenario can be healthy only when its evidence supports the specific claim.

- `first-visit`: stable initial state, clear purpose, discoverable primary action
- `core-flow`: critical actions work in order with clear feedback
- `result-followup`: result is understandable and next action is available
- `state-feedback`: loading, disabled, empty, success, and asynchronous changes are communicated
- `recovery`: validation, server, timeout, and retry paths recover without data loss
- `responsive`: required viewports, zoom, reflow, overflow, and touch targets are inspected
- `keyboard`: reachable controls, logical order, visible focus, overlays, and restoration are inspected
- `console-network`: relevant errors, failed requests, response classes, and offline or degraded behavior are inspected

## Final report

Return:

1. Overall verdict and confidence
2. Scope, user goal, project profile, and evidence boundary
3. Coverage matrix by applicable audit lens
4. Strengths supported by suitable evidence
5. Prioritized findings
6. Evidence gaps and claims that remain not verified
7. Ordered recommendations and acceptance checks
8. Gates run, their exact statuses, and artifact locations

Do not repeat the generated inventory as the final audit. Synthesize it into decisions and next actions.
