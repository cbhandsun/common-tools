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

## Runner 本机 Node 缓存优先

工作流现在先检查 `RUNNER_TOOL_CACHE/ct/node-local-v1` 下的本机快照，未命中才恢复 GitHub Actions 缓存；两者都不可复用时才执行锁定安装。本机命中时跳过远端缓存下载和上传，但仍执行链接重建、锁定版本检查和离线 `npm ls`。健康检查失败会重新安装，只有安装后再次验证通过才重建本机快照。

本机目录按仓库和 Git ref 的哈希隔离，再按上文精确依赖标识区分。PR 不读取或覆盖 main 的本机快照；不同 checkout、Node/npm、锁文件或包清单仍会形成新标识。首次在某个分支运行可能需要远端恢复或安装，不承诺所有首次运行都免安装。

快照仅复制根及工作区的 `node_modules`，排除锁文件声明的 workspace 链接，不复制这些链接指向的仓库源码；恢复后由原准备逻辑重建链接。本机快照中不允许 symlink/junction、hardlink 或特殊文件，缓存根及 checkout 父目录也不得是链接。保存前检查全部来源，恢复前检查全部来源与目标；只写入干净的依赖目录，拒绝覆盖现有目录。路径、条目数、深度和总大小均有上限。此实现用于专用 Windows Runner，配合独占 checkout；不要让多个进程并发复用同一 checkout 或把此目录共享给不可信 Runner。

保存先写隔离 staging，再发布完整快照；复制失败会终止任务并清理本次 staging，不把半成品报告为可用。替换损坏快照只处理当前精确标识的已验证目录，不删除工具缓存根或其他 key。历史 key 不自动清理，维护时只清理已确认不再使用的单个条目。无法验证的目录边界、链接或 I/O 失败会停止任务，不通过忽略错误继续执行。

文件复制最多允许 8 个在途操作。出现失败后停止派发新文件，等待已开始的复制全部结束，再进行 staging 清理并报告失败，避免清理与尚未结束的写入互相竞争；目录和来源边界仍在开始复制前统一校验。并发上限、字节保留、停止派发和等待在途复制的行为均有回归测试。真实 Runner 测量见下文，不能仅凭使用并发就宣称提速。

准备日志增加固定分类 `cacheSource`（`runner-local`、`actions` 或 `install`）和 `localCacheSaved`，不输出缓存路径、仓库/ref、凭据或包内容。`installed=false` 仍由原依赖健康检查决定，而不是仅看快照存在。

本机缓存新增回归覆盖冷/热复用、工作区内依赖、真实离线 npm 检查、分支隔离、无效输入/快照、越界与链接、容量边界和复制失败，统一单元测试入口自动发现 `test/office-node-local-cache.test.js`。受控并发复制版本 `fe37afd` 的两组常规 CI 和 PR Office 工作流均已通过；冷启动、顺序热运行及并发热运行分开记录，不能把不同版本或不同范围的结果混为一项证明。

顺序复制版本 `38492ae` 的 [首次运行](https://github.com/cbhandsun/common-tools/actions/runs/33350964881/attempts/1) 和 [热运行](https://github.com/cbhandsun/common-tools/actions/runs/33350964881/attempts/2) 已全部通过：4/4 smoke、跨渲染器及独立新建 PPT（5 份、33 页、4 个主题、22 个布局）均通过。首次新标识未命中，执行安装并保存本机快照；热运行日志明确为 `reused=true`、`installed=false`、`cacheSource=runner-local`，远端恢复及保存均跳过。但热准备为本机恢复与标识 23 秒、校验 9 秒，合计 32 秒，并未优于旧版远端缓存约 29 秒，因此不能据此宣称已提速。

后续受控并发版本的本机真实依赖快照保存测量约 12.5 秒，保存后枚举校验共约 16.4 秒，10,380 个条目约 72.4 MB。额外的一次性完整性检查逐文件比较了 9,133 个依赖文件的 SHA-256，全部与来源一致；这项完整哈希检查不加入每轮准备路径。以上只证明本机保存路径，不包含 Runner 恢复、校验或整条 CI。

受控并发版本的专用 Runner [热运行 33353210305](https://github.com/cbhandsun/common-tools/actions/runs/33353210305/attempts/1) 已全部通过。官方日志为 `reused=true`、`installed=false`、`cacheSource=runner-local`、`localCacheSaved=false`，远端缓存恢复与保存均跳过：本机恢复与标识 15 秒、校验 9 秒，Node 准备共 24 秒；Python 准备 18 秒。相比顺序热运行的 32 秒少 8 秒，相比旧远端缓存记录的 29 秒少 5 秒。这是单轮准备时间，不是重复基准测试或整条 CI 的提速结论。

该轮 4/4 smoke、4/4 跨渲染器及独立新建 PPT（5 份、33 页、4 套主题、22 个布局）均通过；趋势比较全部 4 个目标，失败数为 0。它仍是 PR smoke，不替代 main 的 31 用例全量验收或真实用户模板远程 canary。PR #27 已以 `138a8e09656dc98ea422ddaef47735ab743cb0bd` 合入 main，与通过测试的 `fe37afd` 源码 tree 完全相同。脱敏测量、归档标识和报告 SHA-256 见 [本机缓存证据](./evidence/office-local-cache-2026-08-31.json)。

main [全量运行 33353923778](https://github.com/cbhandsun/common-tools/actions/runs/33353923778) 的常规 CI、依赖准备、31/31 语料和 4/4 跨渲染器检查通过，但独立新建 PPT 的 PowerPoint 编辑往返验证子进程失败，趋势门禁未执行，整轮不得记为通过。该次 main 新标识未命中，日志确认执行安装并保存本机快照；Node 标识 2 秒、远端恢复尝试 2 秒、安装/校验及本机保存 49 秒、首次远端上传 188 秒，总计 241 秒；Python 准备 17 秒。这是首次建立缓存的成本，不是热运行时间。失败时原验证器未归档内部报告，后续 Runner checkout 已清理本地副本，具体根因仍待诊断，不据此认定缓存导致失败或直接重跑掩盖问题。

## 验证与测量范围

后续诊断与页码索引修复 PR #28 的 [Office run 33360255823](https://github.com/cbhandsun/common-tools/actions/runs/33360255823) 已全部通过，官方日志再次确认 `reused=true`、`installed=false`、`cacheSource=runner-local`。本机恢复与标识 16 秒、校验 8 秒，合计仍为 24 秒；远端恢复和保存均跳过。4/4 smoke、4/4 跨渲染器、5 份独立 PPT（33 页、4 个主题、22 个布局）以及趋势检查均通过，两组编辑往返摘要分别为 5/5 和 2/2。PR 已受保护合入 main `3c9f75b`，与测试提交 `f568f75` 的源码 tree 一致；main [全量运行 33360911889](https://github.com/cbhandsun/common-tools/actions/runs/33360911889) 随后独立通过：31/31 语料、4/4 跨渲染器、5/5 独立 PPT 及 2/2 语义/图片 PPT 编辑往返全部通过，趋势比较 31 个目标且无失败。该次 main 新标识首次准备仍执行安装：标识 2 秒、远端恢复尝试 2 秒、安装/校验及本机保存 40 秒、首次远端上传 173 秒，Node 共 217 秒；Python 15 秒。它是首次缓存建立成本，不与 PR 热缓存 24 秒混算；Office 语料与趋势阶段为 29 分 45 秒，不属于安装。报告哈希和修复范围见 [编辑目标索引修复记录](./evidence/office-roundtrip-index-2026-08-31.json)。

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

第三轮 [full run 33341895591](https://github.com/cbhandsun/common-tools/actions/runs/33341895591) 已全部通过，官方日志确认 `reused=true`、`installed=false`、`reason=validated-cache-hit`：Node 标识 2 秒、缓存恢复 20 秒、校验 7 秒，合计 29 秒；Python 准备 16 秒，缓存保存跳过。该轮没有重复安装，但缓存传输仍有成本，相较此前直接安装约 29～30 秒并无显著速度优势。三轮同环境 full 均为 31/31，后两轮比较全部 31 个目标且无趋势失败；完整证据见上述 JSON。此结果不替代所有者授权的生产部署和远程 canary。

.NET 暂时保持每轮锁定 restore/audit 和 build。尚未实施编译产物缓存，也没有跳过漏洞检查或构建验证。
