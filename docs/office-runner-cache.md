# Office Runner 依赖复用

Office 和 Python 解释器由专用 Windows Runner 预装，不在每次工作流中重新安装。缓存只加速环境准备，不替代 PowerPoint、LibreOffice、OCR、质量趋势或安全门禁。

## Python 与 PaddleOCR

工作流通过 `RUNNER_TOOL_CACHE` 使用仓库 checkout 之外的持久目录。缓存按依赖锁文件、Python 身份、平台和架构区分；命中后执行导入或版本探测，失败则重新准备。不要删除整个 Runner 工具缓存来修复单个任务。

## Node 依赖

`scripts/office-node-dependencies.js` 提供两个工作流入口：

- `key`：把不含原始路径或配置内容的哈希标识写入 `GITHUB_OUTPUT`。
- `prepare`：根据 `OFFICE_NODE_CACHE_HIT` 和健康检查决定复用或锁定安装。

缓存标识包含 Node/npm 版本、系统、架构、真实 checkout 路径、安装参数、根 `package.json`、`package-lock.json`、根 `.npmrc`（存在时）和所有 `packages/*/package.json`。绑定 checkout 路径是为了防止 Windows 工作区 junction 指向其他 checkout。

GitHub Actions 仅恢复精确匹配的 `node_modules` 和 `packages/*/node_modules`，不配置旧版本前缀回退。即使命中，也必须同时满足：

1. 锁文件中的工作区链接确实指向当前 checkout，而不是复制的旧源码目录。
2. `npm ls --all --offline --include=dev --include=optional --json` 成功。

不满足时执行 `npm ci --ignore-scripts --include=dev --include=optional`，随后再次验证。安装或验证失败会终止任务；子进程输出不进入日志，工作流仅报告固定分类。缓存不是依赖文件逐字节完整性或供应链签名证明，正式 CI 和 Office 验收仍必须运行。

依赖缓存只在准备成功后保存。Actions 缓存不可原位覆盖；损坏的精确命中会在当次重新安装，但不会覆盖同名条目。若持续出现 `cache-validation-failed`，维护者应检查对应的单个缓存条目或升级缓存格式版本，不应删除整个 Runner 数据目录。

## 验证与测量范围

2026-08-30 本机真实准备验证：冷安装加检查约 35.3 秒，已安装目录的复用检查约 4.2 秒，后者报告 `reused=true`、`installed=false`。这不包含 Actions 缓存上传、下载、解压时间，不能据此声称完整 CI 已提速同等比例。

合入前需在专用 Runner 验证一次冷运行和一次同标识热运行，确认缓存恢复后的 workspace 链接、依赖检查和 Office 门禁均通过，并比较完整环境准备耗时。若缓存传输抵消收益，应依据实际数据调整策略。

统一单元测试入口自动包含 `test/office-node-dependencies.test.js`；相关工作流和变更范围测试分别在 `test/office-regression-workflow.test.js`、`test/office-regression-scope.test.js` 中。

.NET 暂时保持每轮锁定 restore/audit 和 build。尚未实施编译产物缓存，也没有跳过漏洞检查或构建验证。
