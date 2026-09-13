# Team 图像归档 Semantic Fallback 接入样例

本目录提供团队图像归档（Team Image Archive）携带语义兜底元数据（`--semantic-fallback`）的最小接入样例与真实测试夹具。

## 样例文件结构

- `source.png`：标准 16:9 演示文稿源图片（960x540）。
- `semantic-fallback.json`：单页语义 fallback sidecar 样例。
- `batch-semantic-fallback.json`：多页批次语义 fallback sidecar 样例（使用 `sources[].pageIndex` 映射）。

## 快速开始（CLI 打包）

在包含上述文件的目录或工作区根目录下执行：

### 1. 推荐入口：`editable-source-archive`

```powershell
common-tools team editable-source-archive --workspace . --input ./source.png --semantic-fallback ./semantic-fallback.json --out ./upload-source.tar.gz
```

### 2. 兼容入口：`raw-image-archive`

```powershell
common-tools team raw-image-archive --workspace . --input ./source.png --semantic-fallback ./semantic-fallback.json --out ./upload-source.tar.gz
```

### 3. 多页批次打包

```powershell
common-tools team editable-source-archive --workspace . --inputs ./source-001.png,./source-002.png --semantic-fallback ./batch-semantic-fallback.json --out ./upload-batch.tar.gz
```

## 协议契约与校验规则

1. **只允许语义结构**：
   - 支持 `archetype`（例如 `"process_flow"`、`"metrics"`）。
   - 支持 `items` 列表（每个元素可包含 `title`、`body`、`badge`、`subtitle`、`metric` 等语义描述）。
   - 支持 `slotValues` 键值对。
2. **严格禁止几何坐标**：
   - 任何绝对几何字段（`box`、`bounds`、`x`、`y`、`w`、`h`、`position`）都会在归档前被拒绝。
   - 几何排版统一由 Worker 本地声明式布局引擎结合幻灯片网格计算，避免外部坐标绕过 Worker 的两阶段质量门禁。
3. **大小限制**：
   - 规范化后的 sidecar 写入归档为 `assets/semantic-fallback.json`，上限为 64 KiB。
4. **输入范围限制**：
   - `--semantic-fallback` 仅适用于 PNG/JPEG 原始图片归档；PDF、PPTX 和 Deck IR 归档会主动拒绝该参数，避免误用。

## Worker 准入与原生重建链路

1. **归档准入（Archive Admission）**：Worker 调用 `validatePackage` 解包并校验，将语义结构安全挂载到 `packageInfo.sources[index].semanticFallback`。
2. **原生重建（Native Rebuild）**：原生重建流水线识别 `metadata.semanticFallback`，通过声明式流水线插件（如 `builtin-step-chain`）生成原生矢量形状、可编辑文本框，并记录质检证据于 `page.source.declarativeRebuild`。
