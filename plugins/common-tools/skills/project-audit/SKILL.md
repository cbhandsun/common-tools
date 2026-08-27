---
name: project-audit
description: Audit an approved software project across product journeys, UX and visual interaction, accessibility, data and authorization boundaries, reliability, tests, CI, operations, and release readiness. Use for project audits, code-only reviews, browser-experience reviews, design audits, quality-gate checks, deployment-readiness reviews, and complete end-to-end audits.
---

# Project Audit

Treat the runtime report as a candidate-evidence inventory. Complete the audit only after inspecting the relevant evidence and writing actionable findings. Never equate a keyword match, file count, captured screenshot, or `not-verified` item with healthy design or production readiness.

Read [references/audit-contract.md](references/audit-contract.md) before an `enhanced`, `experience`, or `full` audit, and whenever reporting findings.

## Execution policy

Source-code privacy is the default boundary. Resolve `<plugin-root>` to the absolute directory containing this Skill's `.codex-plugin/plugin.json`; do not use the task working directory and do not run the placeholder literally. Call `load_workspace_dependencies` and resolve `<node>` to its returned absolute Node.js executable; use `node` from `PATH` only after verifying it when that app capability is unavailable. In the commands below, `<audit-cli>` means `<node> "<plugin-root>/runtime/project-audit/packages/project-audit-runtime/bin/common-tools-audit.js"`. Run `<audit-cli> doctor --workspace <workspace>` before execution. The lightweight local Runtime is included by the Git Marketplace sparse checkout and contains no SlideClone, OCR, .NET, Docker, or PPT processing components; do not install Node, npm packages, or another Runtime. If it is unavailable, report that the plugin installation is incomplete and stop rather than silently uploading the project. An explicit team/isolated execution request still does not authorize upload by itself: state that the bounded project archive will be sent to `plugins.iepose.cn` and obtain separate explicit user approval before creating the archive or upload target.

## Ask for level and scope

Unless the request already specifies them, present the missing level and scope choices together in one message so the user can answer once. Ask only for the missing choice when the other is already explicit:

```text
请选择审计层级：
1. 快速审计：日常检查和变更评审
2. 标准审计：代表性核心流程与关键状态（推荐）
3. 深度审计：重大版本或高风险系统
```

Map the choice to `quick`, `standard`, or `deep` and pass it with `--level`. Default non-interactive execution to `standard`. The level controls coverage strategy and evidence expectations; it never authorizes gates, browser automation, external URLs, source upload, or remote execution.

Before executing an audit, ask the user to select a scope unless the request already contains one or more exact domain choices:

```text
请选择项目审计范围（可输入单个编号或用逗号组合）：
1. 全部四域（推荐）
2. 产品闭环
3. 视觉、交互与无障碍
4. 数据、权限与可靠性
5. 工程与交付
```

Accept scope choice `1` only by itself, or a unique comma-separated combination such as `2,3`. Map the answer to `all`, `product-journey`, `visual-interaction`, `data-security`, or `engineering-delivery`, then pass it with `--scope`. Reject invalid, empty, duplicate, or mixed `1,other` input and ask again. Choice `1` means all audit domains; it does not authorize gates, browser automation, source upload, or `full` execution mode.

Treat level and scope as orthogonal. A quick engineering audit and a deep visual-interaction audit are both valid. If either choice is already explicit, do not ask for it again.

Accept a compact combined reply such as `2；2,3`, meaning standard level plus product-journey and visual-interaction scope. Echo the resolved level, domains, execution mode, and authorization boundary before execution.

Do not silently reduce the selected level when required browser evidence or gate authorization is missing. Continue with safe candidate collection where useful, mark the unmet level requirements `not-verified`, and explain exactly what authorization or evidence is still needed.

## Select one mode

| Intent | Mode | Boundary |
| --- | --- | --- |
| Ordinary “audit this project” request | `enhanced` | Read-only four-domain candidate scan plus evidence review. |
| Explicit code-only or static-only request | `code` | Minimal read-only source inventory. |
| Explicit tests, lint, check, typecheck, or build request | `gates` | Run only declared local gates after authorization. |
| Journey, UX, visual, responsive, keyboard, accessibility, or browser review | `experience` | Capture and inspect approved experience evidence. |
| Complete, comprehensive, or end-to-end review | `full` | Combine enhanced static review, authorized gates, and reviewed experience evidence. |

For ambiguity, run `<audit-cli> plan --instruction "<user request>"`. State the selected mode and evidence boundary. Do not silently downgrade `experience` or `full`.

## Workflow

1. Inspect project instructions, repository structure, package manifests, existing user-facing entrypoints, and current worktree state. Preserve unrelated changes.
2. Record the selected audit domains, detected project profile, intended user goal, primary journey, applicable viewports, and requested operational boundary. Mark assumptions.
3. Collect candidate evidence with the lightweight local Runtime:
   `<audit-cli> run --mode enhanced --scope <selected-scope-ids> --out .common-tools/reports/project-audit`
   Use `--mode code` only for an explicit static-only request.
4. Open both JSON and Markdown artifacts. Inspect every warning, missing item, and evidence gap. Open representative candidate files at the reported lines. Reject self-matches, generated artifacts, fixtures, docs-only matches, and unrelated keyword hits.
5. Classify conclusions only as `confirmed-issue`, `healthy-with-evidence`, `not-verified`, or `not-applicable`. Candidate static evidence is never sufficient for `healthy-with-evidence` when runtime or visual behavior matters.
6. Report prioritized findings with evidence, user or production impact, recommendation, and verification method. State explicitly when no confirmed issue was found and retain all evidence gaps.

## Gates

Run `<audit-cli> run --mode gates --run-gates --out <output>` only after explicit authorization. Report each declared `check`, `lint`, `typecheck`, `test`, and `build` result separately. An unconfigured, unavailable, timed-out, or unrun gate is not a pass.

## Experience evidence

Obtain explicit approval before starting the product or using browser automation. Create the bounded manifest and plan, then collect only after the user has started the local application:

`<audit-cli> evidence-template --out audit-evidence/experience.json`

`<audit-cli> experience-collect --plan audit-evidence/plan.json --out audit-evidence/capture --run-browser`

Use only fixed safe actions and non-sensitive synthetic values. Do not use `--allow-external-url` without explicit approval. Collection proves that actions and captures completed; scenarios remain `not-verified` until their screenshots and console/network artifacts are inspected. Reject blank, loading, blocked, cropped, wrong-state, or error-page screenshots. Do not infer keyboard, focus, contrast, reflow, screen-reader, or recovery health from a screenshot alone.

Create a separately reviewed manifest after inspection, then run `<audit-cli> run --mode experience --experience-evidence <reviewed-manifest.json> --out <output>`. Use `--mode full --run-gates --experience-evidence <reviewed-manifest.json>` for a full audit.

## Remote boundary

Use the remote Common Tools workflow only when the resolved policy permits it, the user explicitly requests a team/remote audit, centralized retention, or isolated execution, and the separate upload approval above has been obtained. Upload only the approved archive through the short-lived `create_team_upload_target`, `create_team_job`, `get_team_job`, and `get_team_artifact_target` flow. Exclude credentials, `.env` files, dependency directories, VCS metadata, caches, generated artifacts, and unrelated data. Never reproduce source, credentials, signed URLs, or sensitive captured content in the report.

## Completion gate

Do not call the audit complete unless the final response contains scope, user goal, coverage by audit dimension, prioritized findings, evidence links, strengths, evidence gaps, recommendations, and the gates actually run. If a required experience, accessibility, security, or deployment claim lacks suitable evidence, mark it `not-verified`.
