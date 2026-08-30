# common-tools

本项目用于沉淀可复用的 Codex/工程化工具。

## Git Marketplace 安装

仓库根 Marketplace 是混合客户端入口：`image-to-editable` 通过 `https://plugins.iepose.cn/mcp`、OAuth 调用团队 Docker Runtime，其他电脑不安装 Node/Python OCR 依赖、PaddleOCR、.NET、LibreOffice、PowerPoint 或 `slideclone.js`；图片上传前只用系统 TAR 生成受限传输包，OCR、重建、渲染和质量检查都在服务器完成。`project-audit` 因涉及项目源码而默认本地运行，仅在用户明确要求团队/隔离执行并批准上传后才走远程。轻量审计 Runtime 已直接包含在 `plugins/common-tools` 稀疏路径中，Git Marketplace 用户无需执行 npm 安装。详见 [Git Marketplace 安装说明](docs/git-marketplace-installation.md)。

## 通用能力 Runtime（本地开发）

通用能力以独立插件分发，但共用同一个本地 Runtime。先安装仓库依赖，再按需启用能力；`plugin set --capabilities <id,...>` 会原子地将 Runtime 配置为该组能力并补齐依赖，PPT 改善会自动保留它依赖的 PPT 质量审查能力。`--only` 仅用于明确要最小化为单个能力的场景。

```powershell
npm ci
npm run common-tools -- plugin list
npm run common-tools -- plugin set --capabilities project-audit,ppt-quality
npm run common-tools -- doctor
npm run common-tools -- mcp serve
```

最后一条命令启动 newline-delimited stdio MCP 服务，必须由 Codex、Claude Code 或其他 MCP 客户端托管；不要在同一终端中再输出日志或交互文本。它接受与其他 CLI 命令相同的 `--workspace`、`--state`、`--owner` 参数，以保证能力可见性和 Job 所有者边界一致。可替换为 `image-to-editable`、`ppt-quality` 或 `ppt-improve`。组合使用多个能力时优先使用一次 `plugin set --capabilities <id,...>`；逐个 `plugin enable` 也会增量保留已启用能力。

Codex/Claude marketplace 的安装步骤、Docker 本机与团队部署方案见 [通用能力平台方案](docs/universal-capability-platform-design.md)。

Docker Desktop 重启后，如只需确认既有团队实例是否已恢复，可运行 `npm run common-tools -- team runtime --project deploy`；该命令不要求在当前终端设置团队数据库、Redis 或对象存储凭据。

运行 `npm run common-tools -- help` 可查看当前 CLI 的完整命令面。

用于内网或离线分发时，可在受控构建机执行 `npm pack`，再将生成的 tarball 安装为 `npm install -g .\common-tools-<version>.tgz`。发行白名单只包含运行脚本、schema 与 .NET 源码/锁文件，不包含示例、测试、临时目录或本机 `bin`/`obj` 构建输出；安装后按目标环境恢复 .NET 依赖。发布前运行 `npm run common-tools:verify-runtime-package`：它会在系统临时目录真实打包、隔离安装并执行 `common-tools help` 与 `plugin list`，然后清理临时文件；同一门禁已接入 `verify:ci`。根包维持 `private: true`，不会意外发布到公共 registry；若要发布到组织 registry，需要先确定正式 npm scope、registry 与签名/发布策略。

CLI 的 `run` 子命令适合当前终端内立即完成的本地任务，例如 `common-tools audit run --out .\runs\audit`、`common-tools ppt-quality run --input .\deck.pptx --out .\runs\quality`。`editable run` 与 `ppt-improve run` 遵循相同模式；它们仍创建可追踪的本地 Job，但会在本次调用中执行。若要执行“先审核、再改善、再复审”的 PPT 工作流，可使用 `common-tools ppt-improve pipeline --input .\deck.pptx --out .\runs\ppt-pipeline`；它会保留 `quality/` 中独立审查报告和 `improve/` 中的改善报告/新副本，且输出根必须是新目录。CLI 与 MCP 都会在创建或执行前校验当前已启用且项目 scope 允许的 capability。需要由模型轮询、取消或跨进程继续的场景，应使用 MCP 或先执行 `create`、再使用 `job run --id <id>`。

## 已包含能力

- `skills/pd-hifi-slideclone`：图片版 PPT、PDF 或逐页截图到可编辑 PPTX 的高保真还原流水线，包含生成后比对、打磨、压缩流程。

## 快速开始

```powershell
node skills/pd-hifi-slideclone/scripts/slideclone.js init --input ./input --out ./runs/demo
node skills/pd-hifi-slideclone/scripts/slideclone.js run --config ./runs/demo/slideclone.config.json
```

默认配置使用 placeholder adapter，用于验证流水线和中间 JSON。接入真实环境时可替换：

- OCR：默认使用本地官方 PaddleOCR（`scripts/adapters/ocr-paddleocr-local.js`）；Umi PaddleOCR JSON 与 Tesseract 作为兼容回退。
- 性能：批量 PaddleOCR 复用一个本地模型 worker并支持同页微批；多 deck OpenXML 构建按容器可见 CPU/内存有界并行；组件清单由父进程共享；候选查询、最终页、质量证据和最终 PPTX 均按内容寻址、校验哈希并执行容量治理。
- PPTX：`scripts/adapters/pptx-openxml-dotnet.js`
- 比对/打磨/压缩：替换 `compare`、`polish`、`compress` adapter

配置文件位于任务目录的 `slideclone.config.json`。

对单张 PNG/JPG 的本地文字可编辑基线，可先生成受限 profile，再创建或直接执行任务：

```powershell
common-tools editable init --workspace . --input .\source.png --out .\editable-output
common-tools editable run --workspace . --input .\source.png --out .\editable-output --config .\.common-tools-editable-source.config.json
```

该 profile 默认使用官方 PaddleOCR，并通过共享 Deck IR/OpenXML 引擎重建原生文本、形状、表格、图表、层级/网络图和连接线；只有无法可靠重建的复杂区域才保留去重后的保真残差。首次使用先运行 `npm run slideclone:bootstrap-paddleocr`。未启用渲染验证时，`delivery-summary` 会标记为未验证，不能作为质量门禁通过的依据。需要兼容旧环境时，可显式传入 `--ocr-provider umi-paddle` 或 `--ocr-provider tesseract`。

在 Windows 且已安装 Microsoft PowerPoint 时，可为 PNG 输入增加 `--verify-render`。该 profile 会用 PowerPoint 导出页面并执行像素、文字覆盖、布局与边界检查，只有 `delivery-summary.status=passed` 才代表质量门禁通过：

```powershell
common-tools editable init --workspace . --input .\source.png --out .\editable-output --verify-render
common-tools editable run --workspace . --input .\source.png --out .\editable-output --config .\.common-tools-editable-source.config.json
```

## PPTX 引擎

项目不依赖商业幻灯片程序集。Open XML 负责跨平台生成可编辑 PPTX；LibreOffice 负责服务器或批处理渲染；Windows 桌面环境使用 PowerPoint COM 做最终保真、兼容性和真实编辑回写验证。生产组件回写仍由同一套跨平台 OpenXML 实现完成，不要求 Windows 或 PowerPoint。OCR 默认使用本地 PaddleOCR。

## 本地 .NET SDK

Open XML 生成器使用项目本地 SDK：

```powershell
npm run slideclone:build-openxml
```

本地工具安装在 `.tools/dotnet`，已通过 `.gitignore` 排除。
