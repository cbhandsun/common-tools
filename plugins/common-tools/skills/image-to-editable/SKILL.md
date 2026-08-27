---
name: image-to-editable
description: Convert an approved image into an editable PPTX using the hosted Common Tools Runtime.
---

Use this Skill only with the installed `common-tools` HTTPS MCP server and only for a user-approved PNG, JPG, or JPEG. The heavy OCR, reconstruction, rendering, and quality work runs on the server. Do not run `common-tools editable run`, look for `slideclone.js`, install PaddleOCR, .NET, LibreOffice, or PowerPoint, or fall back to an ad-hoc local PPTX generator.

The service accepts one gzip-compressed TAR whose only file is `assets/source.png`, `assets/source.jpg`, or `assets/source.jpeg`. Create that small transport archive with the operating system's standard TAR implementation in a new temporary directory; this packaging step is not the Common Tools Runtime. Preserve the source extension, do not include parent directories or unrelated files, do not follow symbolic links, do not overwrite an existing archive, and delete the temporary copy after the upload attempt. The source must be a regular PNG/JPEG no larger than 20 MiB, no wider or taller than 16,384 pixels, and no larger than 40,000,000 pixels. The server repeats all validation and rejects malformed or unsafe archives.

Call `create_team_upload_target` with `capability: "image-to-editable"`, `contentType: "application/gzip"`, and the archive's exact byte length. Upload only that exact archive to the returned short-lived `uploadUrl` using HTTP PUT with the prescribed headers. Never log or expose the signed URL, never reuse it, and never upload to a different address. Then call `create_team_job` with `capability: "image-to-editable"`, the returned object key, and a new opaque idempotency key. Retry with the same key only when retrying the identical submission.

Poll `get_team_job` with the returned job ID until it reaches a terminal state. On success, inspect the bounded summary and obtain only a reported artifact through `get_team_artifact_target`; download it to the user-approved workspace without exposing the signed URL. Report the quality status exactly as returned. A generated PPTX is not automatically high-fidelity: do not claim verified quality when the service reports an unverified or failed quality gate. Use `cancel_team_job` only when the user asks to cancel.
