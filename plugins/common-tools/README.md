# Common Tools Codex plugin

This is the Git Marketplace client for the Common Tools team service. Adding the repository Marketplace installs this plugin by default and connects it to `https://plugins.iepose.cn/mcp` with OAuth.

The plugin contains `image-to-editable`, `project-audit`, `ppt-quality`, and `ppt-improve`, with an explicit execution policy. Image conversion is remote-only in this Marketplace entry: the client packages the approved image with the operating system TAR utility and the server performs OCR, reconstruction, rendering, and quality work. Project audit is local-first and its 138 KB self-contained source Runtime is included under `runtime/project-audit`; no npm or separate Common Tools installation is required. Only an explicit team/isolated audit request plus upload approval may use remote Job tools. PPT structural audit and safe repair remain local-first and currently require the full local CLI. The client must not install or invoke `slideclone.js`, PaddleOCR, .NET, LibreOffice, or PowerPoint for image conversion.

Local development remains available from a complete repository clone with `npm ci` and `npm run common-tools -- mcp serve`; that path is intentionally separate from this sparse Marketplace client.
