# PPT 自用远程服务路线图

本文档是图片转可编辑 PPT 与新建 PPT 自用远程服务的统一计划事实源。架构约束以 ADR 为准，可执行验收证据以工作流和脱敏报告为准。

状态统一使用：`已完成`、`进行中`、`受阻`、`计划中`。只有满足全部验收标准并具备可重复验证的证据，事项才能标记为 `已完成`。

## 目标与范围

本项目是私有的自用远程服务。`https://plugins.iepose.cn` 可以从互联网访问，以便所有者授权的客户端远程连接；它不是公众产品，不开放自行注册，也不是商业 Marketplace 服务。

目标结果如下：

- 只有管理员创建的身份能够登录；
- 每次 MCP 操作都必须验证有效的 OAuth token、audience、能力 scope 以及所有者或项目权限；
- 每次部署都能追溯到通过测试的 Git commit 和不可变镜像 digest，并且可以回滚；
- 所有者授权的设备能够端到端完成远程工作流；
- Secret、token、用户内容和对象 URL 不得进入日志或验收证据；
- 通过最小必要的备份、恢复、限流和故障告警保护自用服务。

本自用部署不要求 MFA。公众注册、公共 SLA、商业计费、公众客户支持和强制 GitHub Release 均不在范围内。现有 `v0.1.15` Release 保留为稳定基线；后续 Release 为可选项，只用于重要的分发或恢复里程碑。

## 实施计划

| 优先级 | 交付项 | 状态 | 验收标准 | 当前证据或剩余工作 | 负责人角色 | 目标 |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | 稳定的仓库门禁 | 已完成 | 保护 `main`；强制通过跨平台 CI、完整 verify 和稳定 Office 检查；要求解决审查会话；禁止强推和删除 | PR #10–#13 已验证 Branch Protection 和 Auto-merge | 仓库所有者 | 已完成 |
| P0 | 稳定发布基线 | 已完成 | 存在可用于回滚的已知绿色源码 revision、安装包、SBOM、签名证据和镜像 digest | `v0.1.15`，Release run `33300262845`；后续 Release 可选 | 仓库所有者 | 已完成 |
| P0 | 部署来源一致性 | 受阻 | 远程入口宣告的每项能力都存在于实际部署的 Git revision；记录部署 revision 和镜像 digest；未经 CI 的本地能力不得直接部署 | `siyuan-note` 源码和测试已通过 PR #14 合入 `main`；线上仍需从通过 CI 的 `main` revision 重建并记录 digest，见 `docs/evidence/remote-public-surface-2026-08-30.json` | 服务所有者 | 下次部署 |
| P0 | 封闭式身份创建 | 进行中 | 禁用自行注册、密码找回和外部身份提供商；只保留管理员创建的账号；删除账号后不能再获取新的访问权限 | realm 模板、同步命令和脱敏用户总数证据已实现并有回归测试；仍需对线上 realm 执行并保存证据 | 身份系统所有者 | 下次部署 |
| P0 | OAuth 与能力访问门禁 | 进行中 | 匿名、格式错误、过期、issuer 错误、audience 错误、缺少 scope 和能力未启用的请求均失败；强制 Authorization Code + PKCE S256；禁用密码和 implicit grant；回调地址限制在受控 loopback 范围 | 客户端同步已显式禁用密码、implicit、service account 和 authorization service，并强制写入及回读验证 `pkce.code.challenge.method=S256`，缺失、plain、非法值及写入失败均有回归测试；`npm run canary:remote-access-negative` 覆盖 token/能力访问路径及真实流式响应的 16 KiB 限额、读取超时、取消和安全失败，但不能证明授权流程强制 PKCE；待授权后完成线上同步、短期 token canary 及无 PKCE/plain 拒绝与 S256 成功验证 | 身份系统所有者 | 下次部署 |
| P0 | 不使用 MFA 的登录防滥用 | 进行中 | 启用有界的登录失败保护和入口限流；记录锁定与恢复方法；告警不得包含身份 Secret 或请求内容 | realm 模板已启用 5 次失败阈值、递增等待和 15 分钟上限；应用层主体限流已有测试，仍需验证线上 realm 和入口层未认证限流 | 身份系统所有者 | 下次部署 |
| P0 | 生产模式远程部署 | 受阻 | 使用通过测试的 commit 和 digest 固定镜像；`NODE_ENV=production`；使用生产 backend 和受管 Secret；不直接暴露 API 端口；`/healthz` 只返回 `{"status":"ok"}`；由 `/readyz` 控制流量接入 | production overlay 和 preflight 已存在；2026-08-30 脱敏探测确认 `/readyz` 为 200，但 `/healthz` 仍不是最小生产响应 | 服务所有者 | 下次部署 |
| P0 | 远程图片转换 canary | 受阻 | 从所有者授权设备完成 OAuth、上传、创建 Job、等待完成、下载、PPTX 验证和清理；脱敏报告不得包含 token、对象 URL 或用户内容 | 尚无远程端到端 canary 报告 | 发布验收 | 下次部署 |
| P1 | 远程 `ppt-create` 能力 | 受阻 | 远程 allowlist 启用 Worker；资源 metadata 宣告对应 scope；JSON Spec、素材归档和一个用户模板归档均可远程完成 | Worker 代码已存在，但远程资源 metadata 尚未宣告 `ppt-create`；三类远程 canary 待完成 | 服务所有者 | P0 canary 后 |
| P1 | 授权设备安装 canary | 计划中 | 在所有者控制的干净设备上，通过固定 Marketplace 引用或固定客户端安装包完成安装、OAuth 和有效 PPTX 下载；不依赖仓库 clone 或未声明的 Runtime | 安装说明已固定到 `v0.1.15`；设备验收报告待完成 | 发布验收 | P0 canary 后 |
| P1 | 独立的新建 PPT 语料 | 已完成 | 覆盖 4 套主题和全部 22 个布局；中文、英文和中英混排；表格、图表、模板、素材、备注、引用；空值、非法值、长内容和容量边界；具备 PowerPoint 与 LibreOffice 证据 | PR #19 已以 `37b4f5c` 合入 main；[Office run 33333201534](https://github.com/cbhandsun/common-tools/actions/runs/33333201534) 全部门禁通过，归档报告证明独立 corpus 的 5 份、33 页、4 套主题、22 个布局、三种语言形态、表格、图表、受控素材、备注、引用、8 类输入边界及 PowerPoint/LibreOffice 验证；受控模板归档另验证母版和主题保留。此项完成仅指独立语料验收，不能替代上方远程 `ppt-create` 项所需的所有者授权真实用户模板 canary | PPT 质量验收 | 已完成 |
| P1 | 三次兼容质量快照 | 已完成 | 相同环境 fingerprint 下连续 3 次通过，并且没有质量回退 | 三轮全量 [33337908795](https://github.com/cbhandsun/common-tools/actions/runs/33337908795)、[33341429314](https://github.com/cbhandsun/common-tools/actions/runs/33341429314)、[33341895591](https://github.com/cbhandsun/common-tools/actions/runs/33341895591) 均为 31/31，fingerprint 同为 `7151d11f…`，跨渲染器与独立新建 PPT 均通过；后两轮分别使用 1、2 个兼容历史快照比较全部 31 个目标，趋势失败数均为 0。第三轮源码 tree 与派发时已合入 main 的 `a2ceac2` 完全一致。已核对完整运行顺序：PR smoke、文档变更跳过检查、未启动任何作业的取消运行和旧环境快照均未计入全量通过。官方归档报告 SHA-256 与序列审计见 `docs/evidence/office-cache-and-quality-2026-08-30.json`；本项不替代生产部署或真实用户模板远程 canary | PPT 质量验收 | 已完成 |
| P2 | 经批准的内容与素材 Provider | 计划中 | 配置所有者批准的 Provider；具备有界失败、重试分类、素材来源与许可证证据以及安全测试 | 安全的内容 Provider 适配器已存在；Provider 选择、素材服务和验收证据仍待完成 | 服务所有者 | 可选 |
| P2 | 自用运维闭环 | 进行中 | 具备基础 Job 容量限制、安全重试与恢复、加密 Secret 处理、备份恢复演练、就绪与 Worker 告警，以及明确的回滚联系人和路径 | quota、lease 恢复、备份脚本、指标和告警模板已存在；[生产发布与回滚手册](./ppt-production-runbook.md) 已明确责任、停止条件、digest 回滚、隔离恢复和证据要求；实际联系人、受管告警接收器及生产演练证据仍待所有者确认和验收 | 服务所有者 | 生产部署后 |

## 访问控制基线

远程入口可以匿名提供健康检查、就绪检查、OAuth discovery、JWKS 和受保护资源 metadata。这些端点不得泄露凭据、用户内容、对象 key、项目成员关系或后端细节。所有 MCP 工具、上传、Job 和工件都必须经过 OAuth 授权。

本自用部署遵循以下要求：

1. Keycloak 用户只能由管理员创建，不提供公众注册或外部身份提供商。
2. `common-tools-mcp` 保持为 public OAuth client，因为桌面客户端不能安全保存 client secret；必须使用 Authorization Code + PKCE S256，并限制 loopback redirect URI。
3. capability scope 使用 optional scope，资源服务器必须独立验证 issuer、签名、过期时间、audience 和能力是否启用。
4. 生产部署必须执行所有者或项目隔离。新增其他用户后，该用户不得访问既有用户的 Job 或工件。
5. 明确不要求 MFA。补偿控制包括密码质量、登录失败次数限制、入口限流、账号删除和 token 有效期控制。
6. 在条件允许时，应通过网络策略限制 Keycloak 管理后台；普通客户端访问不经过管理后台。

## 部署策略

GitHub Release 为可选项。无论部署来自 Release 还是受保护的 `main`，每次部署都必须记录：

- 精确 Git commit；
- 每项部署服务的精确镜像 digest；
- 已启用的 capability allowlist；
- 部署时间和上一个可回滚 digest；
- production preflight 结果；
- 远程 readiness 以及授权和未授权 canary 结果。

`latest` 等可移动 tag 不能作为部署证据。由 CI 从受保护 commit 构建并以 digest 固定的镜像，已经足以支持自用部署。

## 实施顺序

1. 将线上 `siyuan-note` 与受保护源码对齐，并记录实际部署 revision 和镜像 digest。
2. 显式固化封闭式账号创建和登录失败保护，并增加不依赖 MFA 的 OAuth/能力负向 canary。
3. 使用 production overlay 和 digest 固定镜像部署选定能力。
4. 执行授权设备图片转换 canary，并验证回滚信息。
5. 仅在确实需要远程调用时启用并验证 `ppt-create`。
6. 扩展独立的新建 PPT corpus，并取得第三次兼容趋势快照。
7. 完成自用所需的最小备份、恢复、告警接收器和回滚手册。

## 可重复验收命令

Keycloak 单入口同步会先固化封闭 realm，再同步 public OAuth client；它只把受控策略字段写入备份，把用户总数和外部身份 Provider 数量写入脱敏证据，不写用户名、token、密码或完整 realm：

```powershell
.\scripts\team-keycloak-mcp-client-sync.ps1 -Project common-tools -KeycloakPort 58080 -PromptForAdmin
```

远程 OAuth 负向 canary 从当前进程环境读取 5 个短期 token，并且报告中只保留用例名、期望/实际状态码和布尔结果。token 必须分别对应有效、过期、错误 issuer、错误 audience 和缺少目标 capability scope；执行后应立即撤销测试会话。响应按流式实际字节限制为 16 KiB，不依赖 `Content-Length`；读取正文期间仍受 8 秒请求超时约束，超限或失败会取消读取，取消异常不会使失败变成成功，日志不回显响应内容：

```powershell
$env:COMMON_TOOLS_CANARY_URL = 'https://plugins.iepose.cn'
$env:COMMON_TOOLS_CANARY_CAPABILITY = 'image-to-editable'
$env:COMMON_TOOLS_CANARY_DISABLED_CAPABILITY = 'ppt-create'
$env:COMMON_TOOLS_CANARY_PROJECT_ID = 'canary-project'
$env:COMMON_TOOLS_CANARY_INPUT_OBJECT_KEY = 'owners/<valid-token-subject-sha256>/inputs/<existing-canary-object>'
npm run canary:remote-access-negative
```

生产部署仍必须先通过 `common-tools team production-preflight`，并由受保护 commit 和不可变 digest 驱动；上述同步与 canary 不能替代生产部署门禁。

## 门禁回归记录

main `41c75eb` 的 [常规 CI 33363744103](https://github.com/cbhandsun/common-tools/actions/runs/33363744103) 在 `common-tools:test` 阶段失败：浏览器调试端点不可用，另一个插件打包测试的 PowerShell 编译辅助进程未正常返回退出码 0。这不是 Office 安装失败；此前 `3c9f75b` 的全量 Office 证据仍有效，但不能代表最新 main 常规 CI 已通过。检查确认该测试入口绕过已有资源调度，而且浏览器与插件打包测试未被标记为外部进程；修复将全部 `common-tools-*.test.js` 接入同一调度器，外部进程波次独占执行，每个分片内部串行，普通分片仍可并行。新增回归核对完整文件集合、资源隔离、真实子进程串行执行和失败退出码传播，不增加超时、不跳过测试。本地原版隔离复测中插件打包通过，浏览器一次截图失败、再次单独执行通过，因此资源竞争仍只是原 CI 失败的待验证原因，不能将调度修复视为完整根因证明；正式修复验收尚在进行。

Office Runner 的本机依赖缓存优化已通过 PR #27 合入 main `138a8e0`。PR 专用 Runner 热运行确认 `installed=false`，Node 准备共 24 秒（本机恢复与标识 15 秒、校验 9 秒），远端下载和上传均跳过；全部 PR Office 门禁通过。这是单轮准备测量，不是整条 CI 的提速证明。main 全量运行 `33353923778` 的 31/31 语料和 4/4 跨渲染器检查通过，但独立新建 PPT 的 PowerPoint 编辑往返验证失败，趋势门禁未执行；该轮整体 Office 验收未通过，且原始具体根因无法确认；后续诊断、修复和新一轮全量验收见下文。冷/热运行范围、归档报告摘要与 SHA-256 见 [本机缓存证据](./evidence/office-local-cache-2026-08-31.json)，复用边界见 [Office Runner 缓存说明](./office-runner-cache.md)。此项不改变线上部署、身份同步和授权设备 canary 的待验收状态，也不将此前三轮历史全量通过冒充本次通过。

2026-08-30，main `a2ceac2` 的 [CI run 33341820370](https://github.com/cbhandsun/common-tools/actions/runs/33341820370) 在 metrics CLI 测试中出现 `2 !== 0`。该用例验证配置与脱敏，却隐含依赖宿主 Docker 可用；受控的 Docker 不可用场景已复现相同失败。回归测试继续启动真实 CLI，仅在测试子进程中隔离 Docker 探测，分别覆盖可用、daemon 不可用和命令不存在，以及每种状态下的 metrics 禁用、token 启用、文件配置和非法 token。生产 Docker 检查和退出码保持不变，不通过允许任意退出码、跳过测试或修改门禁消除失败。

PowerPoint 编辑往返验证的诊断补强已通过 PR #28 合入：每次调用绑定新的 invocation ID，拒绝旧报告；无论子进程成功、失败或被终止，都先写入有界脱敏摘要，记录用例数量、布尔结果、失败阶段及 HRESULT，不记录路径或错误原文。工作流只额外归档独立 corpus 的摘要，不上传包含路径和错误原文的内部报告。此改动补足失败可诊断性，不证明 run `33353923778` 的具体失败根因已修复，也不代替新的 Office 验收。

PR #28 的首次 Office 运行 `33356629089` 已成功归档失败摘要：4/4 smoke 和 4/4 跨渲染器通过，独立 corpus 第 1/5 份在 edit 阶段失败，HRESULT 为 `0x80048240`。与摘要 invocation ID 一致的本地内部报告确认编辑目标使用页码 0，导致 `Slides.Item(0)` 越界。修复改为显式一基集合索引，不再用 `SlideIndex` 构造目标，并在编辑前校验页码和形状 ID。可执行 PowerShell 回归先红后绿；使用原 5 份独立语料的本地真实 PowerPoint 复测全部完成编辑、保存、重开和验证。后续正式 PR/main Office 回归结果见下文；不能把此前 main 报告缺失的失败直接归为同因。脱敏证据见 [编辑目标索引修复记录](./evidence/office-roundtrip-index-2026-08-31.json)。

PR #28 后续修复提交 `f568f75` 已通过两组常规 CI 和 [Office run 33360255823](https://github.com/cbhandsun/common-tools/actions/runs/33360255823)：4/4 smoke、4/4 跨渲染器、5/5 独立 PPT 编辑往返及 2/2 语义/图片批量 PPT 编辑往返均通过，趋势比较 4 个目标且失败数为 0；Node 本机缓存热准备为 24 秒且未重新安装。该 PR 已受保护合入 main `3c9f75b`，源码 tree 与受测版本一致。main [全量运行 33360911889](https://github.com/cbhandsun/common-tools/actions/runs/33360911889) 与常规 CI 均已通过：31/31 语料、4/4 跨渲染器、5/5 独立 PPT 和 2/2 语义/图片 PPT 编辑往返通过；同环境趋势使用 3 个兼容历史快照比较全部 31 个目标，失败数为 0。两类脱敏往返摘要已归档，不再只有本地复测证据。此项确认修复后的仓库全量验收通过，线上部署、真实身份流程、授权设备/模板及运维演练仍未验收。

## 更新规则

- 事项状态、验收标准、证据、负责人或目标发生变化时，必须在同一个 PR 中更新本文档。
- 不得仅凭代码存在就把部署、身份、canary、备份或告警标记为完成；必须链接脱敏且可重复的执行结果。
- 路线图证据中不得包含 token、cookie、header、密码、用户内容、私有对象 URL、私有源码路径或含 Secret 的日志。
- 架构变化必须编写 ADR；本文档只链接结果，不能替代架构决策记录。
