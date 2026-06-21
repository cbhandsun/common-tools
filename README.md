# common-tools

本项目用于沉淀可复用的 Codex/工程化工具。

## 已包含能力

- `skills/pd-hifi-slideclone`：图片版 PPT、PDF 或逐页截图到可编辑 PPTX 的高保真还原流水线，包含生成后比对、打磨、压缩流程。

## 快速开始

```powershell
node skills/pd-hifi-slideclone/scripts/slideclone.js init --input ./input --out ./runs/demo
node skills/pd-hifi-slideclone/scripts/slideclone.js run --config ./runs/demo/slideclone.config.json
```

默认配置使用 placeholder adapter，用于验证流水线和中间 JSON。接入真实环境时可替换：

- OCR：`scripts/adapters/ocr-tesseract-cli.js`
- PPTX：`scripts/adapters/pptx-openxml-dotnet.js`
- 比对/打磨/压缩：替换 `compare`、`polish`、`compress` adapter

配置文件位于任务目录的 `slideclone.config.json`。

## 本地 .NET SDK

Open XML 生成器使用项目本地 SDK：

```powershell
npm run slideclone:build-openxml
```

本地工具安装在 `.tools/dotnet`，已通过 `.gitignore` 排除。
