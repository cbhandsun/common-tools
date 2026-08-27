# SlideClone Development

## Test layers

Run the smallest relevant layer while iterating, then run the full gate before delivery.

```powershell
npm run test:unit
npm run test:contract
npm run test:integration
npm run verify
```

`unit` covers deterministic algorithms and IR transforms. `contract` protects CLI and package-script contracts. `integration` covers rendering, OCR, OpenXML, and real-PPTX quality gates. `verify` runs every layer through the sharded runner.

## Retained artifacts

The only retained generated directories are `runs/current-all-graphics-ir-v2`, `runs/plugin-component-inventory`, `ppt文档/可编辑版本`, and `ppt文档/最终可编辑版本_已验证_20260724`. All other output directories are disposable run history.

Use `scripts/cleanup-historical-ppt-artifacts.ps1` to preview or remove disposable history. It validates every deletion target against this allowlist before it acts.
