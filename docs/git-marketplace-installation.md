# Git Marketplace installation

> This repository-root Marketplace uses a hybrid policy: heavy image conversion runs on the team Docker service at `https://plugins.iepose.cn`, while source-sensitive project audit runs locally by default.

The repository root is a Codex Git Marketplace. Its single `common-tools` plugin is marked `INSTALLED_BY_DEFAULT` and `ON_INSTALL`, so adding the Marketplace installs the complete Skill surface and starts authorization without requiring separate plugin selections or waiting for the first tool call.

## Codex desktop

Open **Plugins → Add → Add plugin marketplace** and enter:

- Source: `cbhandsun/common-tools`
- Git ref: `v0.1.22` (reviewed immutable release)
- Sparse paths, one per line:
  - `.agents/plugins`
  - `plugins/common-tools`

After adding the Marketplace, complete the OAuth prompt, fully close and reopen Codex, and start a new task so Codex loads the installed Skills and HTTPS MCP tools. When renewing an existing registration, the generated remote installer explicitly requests `offline_access` plus the selected capability scopes so a normal access-token expiry can be refreshed; its first registration uses the single OAuth flow started by `codex mcp add`. Marketplace-only users can use the CLI recovery command below when authorization must be renewed. Explicit logout, administrator revocation, password/session policy changes, or a long-expired refresh token can still require login again. The same `plugins/common-tools` sparse path includes the lightweight local project-audit Runtime; no npm command or separate Runtime installation is needed. It contains no OCR models or `pd-hifi-slideclone` engine. Image conversion uploads only explicitly approved PNG/JPEG images, one PDF, or one image-based PPTX in a constrained gzip/TAR transport package; fixed document normalization, OCR, reconstruction, rendering, and quality work execute in the server-side Docker workers.

The Marketplace commit and the hosted service release are one compatibility boundary, but they are deployed separately. Publishing the Git plugin updates Skills and MCP metadata; it does not rebuild or deploy the server-side Worker image. For `image-to-editable`, release the same reviewed revision as an immutable `image-worker` image and require the `residual-native-duplicates-removed`, `quality-rendered`, and `visual-fidelity` gates before describing an output as visually verified. CI packs and installs the npm Runtime and functionally probes image residual deduplication plus PPT asset provenance, image delivery, IR editing, document ingestion, safe templates, whole-deck variants, citations, and native notes so a release cannot silently omit those modules.

| Capability | Default execution | Reason | Remote exception |
| --- | --- | --- | --- |
| `image-to-editable` | Remote | PDF/PPTX normalization, OCR, reconstruction, rendering, fonts, and quality gates are heavy and centrally versioned | Accepts one source document or up to 20 ordered images; no local fallback in the Marketplace workflow |
| `project-audit` | Local | Source privacy, lower transfer cost, direct access to workspace evidence | Only explicit team/isolated execution plus separate upload approval |
| `ppt-create` | Local when a complete Runtime is already installed; otherwise explicit remote | Semantic input is lightweight, but the sparse Marketplace does not embed the OpenXML builder | Upload file-free specs as JSON; use `common-tools ppt archive` and `application/gzip` for hash-bound assets or one user-owned template |
| `ppt-quality` | Local | The deck remains private and structural inspection is lightweight | Not advertised by the current public service |
| `ppt-improve` | Local | Copy-on-write repair stays bound to the approved source and audit report | Not advertised by the current public service |

The embedded audit Runtime is synchronized from the audited core during development and verified byte-for-byte in CI. Its current source payload is about 138 KB; the optional standalone tarball remains capped at 1 MiB for non-Marketplace distribution, but Marketplace users do not build or install that tarball.

## CLI equivalent

```powershell
codex plugin marketplace add cbhandsun/common-tools --ref v0.1.22 --sparse .agents/plugins --sparse plugins/common-tools
```

The Marketplace policy installs `common-tools` by default. If an older Codex build only registers the Marketplace, install explicitly:

```powershell
codex plugin add common-tools@common-tools
```

If a new task cannot see any `siyuan_*` tools, reset only the Common Tools OAuth session and authorize it again:

```powershell
codex mcp get common-tools --json
codex mcp logout common-tools
codex mcp login common-tools --scopes offline_access,common-tools:capability:siyuan-note
```

If `get` reports that the MCP server is missing, register it first with `codex mcp add common-tools --url https://plugins.iepose.cn/mcp --oauth-client-id common-tools-mcp`. After browser authorization, fully close and reopen Codex and use a new task. Do not copy the server-side SiYuan token or Keycloak administrator credentials to the client computer.

## Runtime boundary

The repository plugin declares an HTTP MCP server at `https://plugins.iepose.cn/mcp` with OAuth client ID `common-tools-mcp`. `http://127.0.0.1:54000` is an internal server-side address and must never be configured on another computer. For image conversion, the client may use the operating system's standard TAR utility only to produce the upload envelope; it must not look for `common-tools` on `PATH`, `slideclone.js`, PaddleOCR, .NET, LibreOffice, or PowerPoint, and it must not fabricate a local fallback PPTX when the remote service is unavailable.

For project audit, the inverse default applies: run the local CLI against the approved workspace so source stays on the machine. Remote audit is allowed only when the execution policy permits it, the user explicitly requests team/isolated execution or centralized retention, and the user separately approves the bounded source upload. Local audit authorization alone never implies upload authorization.

Developers who intentionally need the local stdio path must use a complete repository clone and run `npm ci` plus `npm run common-tools -- mcp serve`. That development workflow is separate from the sparse Marketplace installation.

## Release checklist

Before publishing a Git ref or immutable release tag:

1. Run `npm run common-tools:verify-plugins` to verify capability/plugin versions, source-to-Marketplace byte identity, the unified Git plugin version, and the image residual quality contract.
2. Run `npm run common-tools:verify-runtime-package` to execute `npm pack`, install the produced archive, and probe `image-to-editable` residual deduplication from the installed package.
3. Build the `image-worker` image from the same revision, bind its immutable digest into release evidence, and pass production preflight.
4. Deploy the Worker/API revision before or together with the Marketplace ref. A Marketplace-only publication changes guidance but does not activate server implementation changes.

The repository's `immutable-release` workflow enforces the repository side of this boundary for a tag that exactly matches `package.json` (`v<version>`). It reruns release contract gates, builds the Remote MCP and image-to-editable Worker from the tagged checkout, pushes both images to GHCR under version and source-revision tags, signs and verifies their immutable digests with keyless Cosign, publishes GitHub/Sigstore attestations, creates a deployable release-evidence manifest containing both digests, signs that manifest, packs the private Runtime for controlled distribution, and refuses to overwrite an existing GitHub Release. Production deployment and Marketplace ref promotion remain separate operator actions and must consume the recorded digests; the workflow does not silently deploy or change the Marketplace source.

OAuth and user permission prompts remain interactive even when plugin installation is automatic.
