# Remote component reconstruction

The image worker can run the local two-pass component workflow: analyze the current page, match verified offline component assets, then pass the real strategy and asset indexes into native reconstruction. Component matching does not guarantee that a page has a suitable template or that visual quality passes.

Enable the worker with `deploy/compose.team-component-assets.yaml` in addition to the existing deployment overlays. Set `COMMON_TOOLS_COMPONENT_ASSET_STORE` to the host directory containing `asset-registry.json` and `assets/sha256`. The overlay mounts only those paths, read-only, and sets `COMMON_TOOLS_IMAGE_COMPONENT_ASSET_ROOT=/app/component-assets`. Rebuild the image worker using the updated Dockerfile before enabling it.

The registry loader selects assets with promoted, passed self-fidelity evidence and verifies hashes and portable paths. The registry is limited to 4 MiB, 100 assets and 60 MiB of selected files. Invalid configured stores fail startup; an unconfigured worker preserves its existing single-pass behavior. The workflow performs no online component search or automatic download.

The internal inventory retains verified paths and matching features; only public evidence is path-free. Unmatched layers keep the existing native detectors. Offline raster-preservation and template-only recommendations cannot suppress those detectors; component asset indexes remain available to the existing native group admission logic. After reconstruction, output provenance retains compact asset references rather than embedding learning summaries or duplicate template geometry.

Each page is analyzed independently. Reports must refer to the current image or semantic shape layer, and selected files must belong to the verified inventory. Source hashes are checked before and after analysis. Per-page `source.componentAnalysis` records the source hash, analysis layer count and asset match count. Zero matches remain zero; they must not be presented as proof of native reconstruction parity. File byte counts stay internal to avoid introducing unrelated large numeric values into deck IR.

`test/team-component-analysis.test.js`, `test/team-component-catalog.test.js` and `test/team-component-wiring.test.js` are automatically discovered by the unit CI suite. They cover real offline search/matcher compatibility, index forwarding, report/source boundaries and the multi-megabyte source metadata regression. Existing visual fidelity and native component gates remain unchanged.
