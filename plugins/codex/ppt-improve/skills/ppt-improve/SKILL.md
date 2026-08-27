---
name: ppt-improve
description: Apply report-bound, copy-on-write PPTX improvements and inspect the re-audited result using common-tools.
---

Use this skill only for a user-approved workspace. Before using MCP, run `common-tools plugin enable --capability ppt-improve`; it is idempotent, retains its required `ppt-quality` dependency, and does not remove other installed capabilities. Prefer `create_ppt_improve_job` and then `get_ppt_improve_report`. For a local complete workflow, run `common-tools ppt-improve pipeline --input <deck.pptx> --out <new-directory>`; it preserves the initial audit under `quality/` and the repair/re-audit artifacts under `improve/`. If an approved JSON audit report already exists, `common-tools ppt-improve run --input <deck.pptx> --report <ppt-quality-report.json> --out <directory>` remains available. The source SHA-256 must match the report. This capability never overwrites the source; it creates `improved.pptx` only when a safe repair is available and re-audits it. Do not claim visual, layout, or copy improvements from this structural repair.
