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
2. 每个已安装依赖的 `package.json` 版本与锁文件逐项一致；必需依赖缺失会拒绝复用。允许 npm 省略可选依赖（例如当前系统不支持的依赖），但已存在的可选依赖也必须版本一致。
3. `npm ls --all --offline --include=dev --include=optional --json` 成功。

Windows 自带的 bsdtar 会把 workspace junction 打包并还原为普通目录。精确命中后，准备程序先检查全部锁定 workspace 的来源和目标边界，再移除 `node_modules` 内这些确切的缓存副本并重建指向当前 checkout 的链接；不会执行缓存中的 workspace 源码，不会删除 `packages/*` 源目录。最多处理 256 个链接，拒绝链接形式的父目录；边界检查失败会终止任务，而不是继续安装到可疑路径。重建后仍执行上述三项检查。相关回归测试覆盖有作用域包、缺失链接、嵌套外部链接、越界输入和重建后的验证失败。

不满足时执行 `npm ci --ignore-scripts --include=dev --include=optional`，随后再次验证。安装或验证失败会终止任务；子进程输出不进入日志，工作流仅报告固定分类。缓存不是依赖文件逐字节完整性或供应链签名证明，正式 CI 和 Office 验收仍必须运行。

依赖缓存只在准备成功后保存。Actions 缓存不可原位覆盖；损坏的精确命中会在当次重新安装，但不会覆盖同名条目。若持续出现 `cache-validation-failed`，维护者应检查对应的单个缓存条目或升级缓存格式版本，不应删除整个 Runner 数据目录。

## 验证与测量范围

2026-08-30 本机真实准备验证：初版冷安装加检查约 35.3 秒，已安装目录的复用检查约 4.2 秒；补充逐项锁定版本检查后，热准备约 5.3 秒，仍报告 `reused=true`、`installed=false`。这不包含 Actions 缓存上传、下载、解压时间，不能据此声称完整 CI 已提速同等比例。

专用 Runner 的首次验证见 [Office run 33333667128，attempt 1](https://github.com/cbhandsun/common-tools/actions/runs/33333667128/attempts/1)，对应 PR #20 提交 `f928af86ad4d545be5442c056ab527e441774eb4`。完整工作流及稳定的 required check 均通过；日志明确报告 `reused=false`、`installed=true`、`reason=cache-miss`。各步骤实测如下（按 Actions 步骤时间取整）：

| 步骤 | 耗时 | 说明 |
| --- | --- | --- |
| 计算 Node 缓存标识 | 12 秒 | 包含运行时身份探测 |
| 尝试恢复 Node 缓存 | 6 秒 | 首次未命中 |
| Node 安装及验证 | 34 秒 | 实际执行锁定安装 |
| 首次保存 Node 缓存 | 170 秒 | 缓存大小 18,675,447 字节；不是每轮必需的安装耗时 |
| Python 缓存环境准备 | 27 秒 | 复用持久环境 |
| Office corpus 与趋势门禁 | 8 分 46 秒 | 验收执行，不属于安装；不得用依赖缓存跳过 |

该次独立新建 PPT corpus 的 5 份、33 页、22 个布局通过 PowerPoint 与 LibreOffice 验证，受控模板母版和主题保留检查也通过。这份报告证明首次安装后的功能正确性，不证明恢复后的依赖目录可以复用，也不替代真实用户模板的远程验收。

同一提交的 attempt 2 命中缓存，但记录 `reused=false`、`installed=true`、`reason=cache-validation-failed`：标识计算 12 秒、恢复 17 秒、回退安装及验证 50 秒，缓存保存跳过。因此初版方案没有实现热复用。使用相同 Windows tar 参数的隔离实验确认 junction 恢复为普通目录；补充链接重建后，该实验通过。修复后的专用 Runner 准备阶段测量见下文，不能沿用初版本机的 5.3 秒作为最终 CI 结论。

链接修复后的 run `33338360905`（提交 `38028cc`）全部门禁通过，官方归档日志记录 `reused=true`、`installed=false`、`reason=validated-cache-hit`，确认没有重新安装：标识计算 13 秒、恢复 18 秒、链接重建及验证 19 秒，保存缓存跳过。但合计 50 秒仍慢于此前 main/模板 PR 的直接安装步骤（约 29～30 秒），不能据此宣称整体提速。

## 避免重复加载个人 PowerShell 配置

实际 Runner 日志显示默认 shell 为 `pwsh -command`，会读取个人 PowerShell 配置。本机同一 `node --version` 探测默认启动耗时约 13.28 秒，使用 `-NoProfile -NonInteractive` 后约 0.98 秒；这是 shell 探测值，不是完整工作流耗时。

Office job 的全部脚本步骤统一继承 `pwsh -NoProfile -NonInteractive -Command ". '{0}'"`，不修改用户的 profile 文件。Node/.NET 由固定 setup action 提供，Python 使用显式配置；工作流不再依赖个人终端初始化。仍使用 Runner 的 PowerShell 错误处理，每条 bootstrap、OCR、audit 和 build 原生命令还显式检查退出码，避免前一条失败被后一条成功覆盖。配置及失败传播约束纳入统一工作流测试。最终收益需以这一版本的 Runner 准备总耗时和完整门禁为准。

专用 Runner 最终热运行 [33340660117](https://github.com/cbhandsun/common-tools/actions/runs/33340660117)（提交 `09b3732`）及两组常规 CI 均通过。官方日志确认 `reused=true`、`installed=false`；归档报告证明 4/4 smoke 用例、跨渲染器、独立新建 PPT 和趋势门禁均通过。各准备步骤与前一版比较如下：

| 准备步骤 | 链接修复版 `38028cc` | 无配置启动版 `09b3732` |
| --- | --- | --- |
| Node 缓存标识 | 13 秒 | 2 秒 |
| Node 缓存恢复 | 18 秒 | 18 秒 |
| Node 链接重建及验证 | 19 秒 | 7 秒 |
| Node 准备合计 | 50 秒 | 27 秒 |
| Python 环境准备 | 26 秒 | 16 秒 |

以上为单轮 Actions 步骤时间，包含 Node 缓存传输和恢复，但不是整条 CI 耗时。最终 Node 准备相较原先直接安装约 29～30 秒仅小幅提速；更明确的收益是健康缓存无需重装，以及多个脚本不再重复加载个人配置。Office 验收仍完整执行。

PR #20 已以 `c02047d0ab6efe56e15d970b11ba9db3ae055b40` 合入 main。新缓存作用域或依赖/运行时标识变化时仍可能首次安装并上传，不能承诺永不安装。合入后的 main 全量回归与连续三次质量验收仍独立跟踪。脱敏运行证据与归档报告 SHA-256 见 `docs/evidence/office-cache-and-quality-2026-08-30.json`。

合入后的 [main full run 33341429314](https://github.com/cbhandsun/common-tools/actions/runs/33341429314) 已全部通过：31/31 语料、跨渲染器、独立新建 PPT，以及覆盖全部 31 个目标的同环境趋势比较。该轮 main 首次缓存未命中，标识 2 秒、恢复尝试 2 秒、安装及验证 24 秒、首次保存 168 秒；约 18 MB 的 main 缓存已建立。这是首次准备成本，不是热缓存提速数据，也不能计作每轮都会安装。

统一单元测试入口自动包含 `test/office-node-dependencies.test.js`；相关工作流和变更范围测试分别在 `test/office-regression-workflow.test.js`、`test/office-regression-scope.test.js` 中。

.NET 暂时保持每轮锁定 restore/audit 和 build。尚未实施编译产物缓存，也没有跳过漏洞检查或构建验证。
