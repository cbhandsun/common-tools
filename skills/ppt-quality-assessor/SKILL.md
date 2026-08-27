---
name: ppt-quality-assessor
description: Evaluate existing PowerPoint or PPTX decks against practical slide-quality standards for clarity, hierarchy, whitespace, consistency, readability, storytelling, chart legibility, and accessibility. Use when asked to review, score, critique, audit, or prioritize fixes for PPT/PPTX, screenshots, or exported slides, including asks such as "evaluate this PPT", "review this deck", or "give me a prioritized repair list".
---

# PPT Quality Assessor

Read `references/ppt-quality-standards.md` before reviewing a deck.

## Workflow

1. Identify the deck mode before judging details.
   Common modes:
   - Live presentation: projected talk, pitch, report-out, executive review.
   - Readable leave-behind: document-style deck meant to be read asynchronously.
   - Hybrid: must work both on screen and as a file.

2. Audit in this order:
   - Accessibility and readability hard gates.
   - Slide-level comprehension.
   - Deck-level narrative and consistency.
   - Data/chart/table quality when present.

3. Score each dimension using the rubric in `references/ppt-quality-standards.md`.
   Required dimensions:
   - Narrative and message focus
   - Glance-test clarity
   - Visual hierarchy and layout
   - Typography and readability
   - Consistency and unity
   - Data display quality
   - Accessibility and inclusive design

4. Produce findings in priority order.
   Use:
   - `P0`: unreadable, misleading, inaccessible, or structurally broken
   - `P1`: materially weakens comprehension or credibility
   - `P2`: polish and consistency improvements

## Output Contract

Return:
- A 3-6 line overall judgment of the deck
- A score summary by dimension
- Prioritized findings with slide references
- A "repair next" list with the smallest high-impact fixes first

When the user asks for a strict audit, do not redesign the deck in the same pass unless explicitly asked.

## Review Rules

- Judge the slide by audience comprehension, not by whether it looks "fancy."
- Prefer concrete evidence: title quality, font size, overlap, clutter, contrast, broken grouping, weak focal point, unreadable charts.
- Treat "can the audience get the point in about 3 seconds?" as a core test for presentation slides.
- Do not apply pitch-deck heuristics rigidly to training decks or document-style decks; note the mode and calibrate.
- If the user explicitly wants to preserve current wording or structure, flag issues without recommending semantic rewrites unless necessary.
