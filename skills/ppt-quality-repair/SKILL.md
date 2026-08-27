---
name: ppt-quality-repair
description: Repair and optimize existing PowerPoint or PPTX decks with minimal drift from the original message, structure, and figure-text relationships. Use when asked to improve slide readability, whitespace, hierarchy, consistency, chart legibility, or accessibility without "rewriting the story", including asks such as "repair this PPT", "improve this deck without changing the message", or "fix this deck based on the review findings".
---

# PPT Quality Repair

Read `references/ppt-quality-standards.md` and `references/ppt-repair-playbook.md` before editing a deck.

## Workflow

1. Confirm the repair mode.
   Default to:
   - minimal-invasive optimization
   - preserve story order
   - preserve the user's wording unless readability or correctness requires change

2. Fix in this order:
   - Hard accessibility/readability failures
   - Overlap, clipping, broken reading path
   - Weak hierarchy and crowded layout
   - Consistency drift across repeated slides
   - Charts/tables/legends that block comprehension

3. Prefer the smallest effective edit.
   Prefer:
   - removing noise over shrinking fonts
   - re-grouping over redrawing
   - widening whitespace over adding decoration
   - shortening visible copy over compressing it

4. Escalate only for structural changes.
   Ask before:
   - splitting a slide into multiple slides
   - reordering narrative flow
   - deleting meaningful content
   - changing metrics, claims, or business meaning

## Repair Output Contract

Return:
- A short summary of what changed
- The slides or areas changed most
- Any unresolved tradeoffs

If the deck still has structural issues that require content decisions, say so clearly instead of silently restyling around them.

## Repair Rules

- Do not "AI-ify" the deck with unrelated visual trends.
- Keep original diagrams when they are semantically correct; only clean spacing, emphasis, grouping, and labels.
- If the user asks to preserve the current text-image expression, treat text-image mapping and narrative intent as fixed unless obviously broken.
- For projected decks, bias toward bigger type and fewer simultaneous ideas.
- For leave-behind decks, allow moderate density if hierarchy, spacing, and scan order remain strong.
