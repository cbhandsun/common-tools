---
name: ppt-quality
description: Run a local, read-only PPTX structural quality audit and inspect its separately generated report using common-tools.
---

Use this skill only for a user-approved workspace. Before using MCP, run `common-tools plugin enable --capability ppt-quality`; it is idempotent and enables this independently installed plugin without removing other installed capabilities. Prefer `create_ppt_quality_job` and then `get_ppt_quality_report`; otherwise run `common-tools ppt-quality run --input <deck.pptx> --out <directory>` and inspect the JSON and Markdown artifacts in the returned terminal Job. This capability must not modify or overwrite the input PPTX. Treat the report as evidence for a separate improvement capability, which must create a new PPTX and be audited again.
