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

### COM 集合生命周期修复（本地回归通过，实机提速未证实）

`0d49290` 的 [全量 Office 33397104571](https://github.com/cbhandsun/common-tools/actions/runs/33397104571) 已正式结束且失败，作业耗时 71 分 44 秒。31/31 语料、4/4 跨渲染器、5 份独立 PPT（33 页、4 套主题、22 个布局）、5/5 独立编辑往返和 2/2 批量编辑往返全部通过；仅四个目标的 elapsedMs 趋势失败：closed-loop-cycle、friction-network、radial-capability-network、stage-timeline，较历史中位数增加约 63–99 秒，超过原有 60 秒预算。失败快照未写入通过历史。三角拓扑本轮在预算内，不代表历史超时根因已消除。官方八份报告摘要与 SHA-256 见 [COM 集合生命周期证据](./evidence/office-com-collection-lifetime-2026-08-31.json)。该提交的两轮常规 CI（33396433821、33396429703）通过；PR smoke 33396433803 正在执行，不包含下述后续修复。

阶段记录显示不同目标的 COM 创建、终结器和渲染均可能变慢，不能统一归因于 OCR 或锁等待；单次 CPU 100% 采样也不能证明历史失败由宿主负载造成。检查并复现了独立的资源释放缺陷：生成脚本链式访问 Presentations 和 Slides 集合，直到调用应用 Quit 时仍没有显式释放这些引用。受控的保存后重开回归在旧实现上记录到各两个未释放集合，并先红后绿。

修复对每次取得的集合引用在 finally 中释放一次，释放后清空局部引用；集合释放异常直接使当前用例失败，不进入打开/页数重试循环，未交还给调用方的 presentation 仍会关闭和释放。没有循环强制释放共享 RCW，没有复用应用会话，也未删除 GC/终结器等待或改变互斥锁、保存重开、质量阈值、时限和重试预算。16 项相关测试通过，包含正常、重试、空集合、打开/读取失败、两类释放失败和锁失败九种生成 PowerShell 执行场景，并确认进入统一 CI 外部进程波次。最终 Lint、类型、扩展测试 Lint、插件与实际 Runtime 安装包门禁通过；新候选 CI/Office 和实际提速仍待验证，不能以替身引用计数证明历史性能根因。PR #32 保持草稿且不自动合并。生产部署、真实身份、授权设备/模板及运维验收边界不变。

### 编辑往返预期位置一致性（本地修复，实机待验收）

`21a631e` 的 [Office smoke 33391403662](https://github.com/cbhandsun/common-tools/actions/runs/33391403662) 已结束且失败：4/4 语料、4/4 跨渲染器和 5/5 独立 PPT 编辑往返通过；语义/图片批量往返第 2/2 个用例在保存、重开后的 verify 阶段失败，模式为 auto，HRESULT 为 `0x80131501`。趋势阶段未执行，不能记作完整通过。官方归档不包含本次 auto 实际选中的编辑类型或原始原因；不能将其直接归因于几何位置漂移。失败摘要的 opened 字段取自当时的活动对象引用，关闭后引用已清空，因此此处 false 不代表初次打开失败。工件标识、6 份报告摘要及验证边界见 [编辑位置一致性证据](./evidence/office-roundtrip-geometry-2026-08-31.json)。

检查发现可独立复现的缺陷：选择几何目标时记录 ExpectedLeft，执行修改时却再次读取当前位置计算偏移；两次读取之间位置变化会使执行意图与验证预期不一致。修复改为写入已记录的 ExpectedLeft。真实执行生成 PowerShell 函数的替身回归覆盖选择时位置 10、执行前位置 20、预期位置 11：旧实现断言失败，修复后通过；把位置恢复为 10 仍必须验证失败。原有保存重开要求、0.05 容差、时限、重试和质量门禁不变。

本地 19 项相关测试通过，包含生成脚本的 33 项检查，并确认回归进入统一 unit 外部进程测试波次；Lint、类型、插件和实际 Runtime 安装包校验通过。这不是实际 Office 验收。此前诊断提交 `ce14e14` 的两轮常规 CI（`33394831384`、`33394828340`）通过，其 Office smoke `33394831764` 已开始执行但不包含本次位置修复。旧 `21a631e` full `33392114866` 在尚未启动时已取消，未提供验收结果。PR #32 仍为草稿且关闭自动合并；最终候选的常规 CI、Office smoke/full、性能根因及生产验收仍待完成。

### PowerPoint 打开校验耗时回退（诊断补强待实机验证）

PR #32 的 `a995b7a` [全量运行 33387917655](https://github.com/cbhandsun/common-tools/actions/runs/33387917655) 已结束且失败。31/31 语料、4/4 跨渲染器、5/5 独立 PPT（33 页、4 套主题、22 个布局）、5/5 独立编辑往返和 2/2 语义/图片编辑往返全部通过；趋势比较 31 个目标、使用 4 个兼容快照，仅 `triangle-topology.elapsedMs` 失败：本次 157565 毫秒，历史中位数 86624 毫秒，增加 70941 毫秒，超过原有 60000 毫秒预算。画质和可编辑性指标未退化，失败快照未写入历史，不得将本轮记作完整通过。

与最近通过的 main full `33360911889` 对比，三角拓扑重建从 29164 增至 90159 毫秒，质量检查从 55683 增至 67053 毫秒。官方日志将主要增时定位到 PowerPoint 打开校验（约 24.4 → 85.0 秒）；页面重建和 PPTX 写入仍分别约 3 秒、1 秒。该证据不能区分 COM 启动、互斥锁等待或内部重试，不将宿主负载或 OCR 当作已证实根因。该次 broker 只有 1 次请求，未发生跨用例 OCR 复用。8 份官方报告摘要、工件标识及阶段时间见 [打开校验性能证据](./evidence/office-open-gate-performance-2026-08-31.json)。

后续补充独立的有界阶段记录模块：每次启动使用新 invocation ID，记录锁、COM 创建、预热、打开、读取页数/保存状态、保存副本、关闭、退出、终结器及清理耗时，以及重试次数和等待毫秒数；失败后读取最后检查点并通过现有进度通道输出白名单数值。不会输出路径、原始异常或用户内容；32 KiB 以上、缺失、截断、旧 invocation 或非法字段均不能冒充有效证据。进程成功但证据不完整时仍失败。生成脚本的检查点不是原子写入，写入中断可能只能得到明确的 invalid 状态，不能保证每次强制终止都保留当前阶段。原有等待、重试次数、质量门禁及趋势预算保持不变。

58 项相关测试通过，包括真实执行生成 PowerShell 的替身 COM 成功、重试和锁失败场景、Node 边界失败传播、无效/过大/旧记录、安全字段、真实进度转发及安装包缺失依赖检查。新模块、调用方和进度模块均接入统一 Lint；启用已有规则后，将旧 ASCII 检查改为等价的码点检查，没有关闭规则。安装包门禁显式要求完整的三个模块。最终 Lint、类型检查、插件校验和实际 Runtime 打包安装校验均通过，新测试的扩展 Lint 也没有诊断。测试不启动 Office，不代表性能回退已修复；正式 CI、实机回归和最终合并仍待完成。`21a631e` 的两轮完整 CI 已通过，其 Office full `33392114866`、smoke `33391403662` 是本次诊断补强之前的候选验收，不能代表后续代码通过。

### 后续改动：串行语料复用 OCR（待正式验收）

实际覆盖范围校正：解析当前完整 corpus 与 golden manifest 后确认，31 个语料中只有 `triangle-topology` 显式启用这条 OCR 质量检查路径。因此目前的 corpus 没有多个 OCR 用例可供跨用例复用；“两个客户端复用一个 worker”的替身测试只证明机制，不能据此预期当前整套语料明显提速。现将 broker 启动条件收紧为至少两个适用用例，新增 `eligibleCases` 脱敏计数，并以实际 manifest 回归确认完整语料为 `enabled=false, eligibleCases=1`，不改变 OCR 本身、语料范围或质量阈值。`a995b7a` 的 full run `33387917655` 保留为该候选的实际验收，不包含后续本地修正；跨用例复用不记作已完成的提速效果。

针对不同语料子进程重复启动 OCR 的开销，Office corpus 已接入单次运行内的共享 PaddleOCR broker；仅允许串行执行，只有受控的 complex-graphic OCR 用例及其质量子进程获得短期 loopback 凭据，重建、Office 和其他用例不继承凭据。报告仅新增请求数、完成/失败数和排队/服务耗时。语料集合、逐例时限、fresh 重建和质量阈值保持不变，不复用历史质量结果。

凭据隔离的后续校正：复核发现质量 CLI 原先在完成渲染后才消费 broker 环境变量，上述“不传给 Office”的边界在此路径并未满足。现将消费移动到输入读取和渲染之前，配置仍只在当前质量进程内传给 OCR。真实 CLI 入口回归用预加载探针在输入读取边界检查环境，覆盖缺省、仅 URL、仅 token 和完整配置，不启动渲染；修复前可复现残留环境变量。此入口边界检查不是完整 Office 验收，也不宣称已消除历史超时。

上述启用条件与凭据隔离修正的 79 项定向测试已通过（corpus session、质量 CLI 和 manifest），两个相关测试文件均由统一入口发现并归入外部进程隔离执行。为遵守入口行数约束，将原有心跳参数校验原样移入配置策略模块，入口行数基线从 2123 收紧到 2116；既有边界测试保持通过。最终 Lint、类型、插件及 Runtime 安装包校验通过；对 7 个改动 JS 文件扩展执行推荐规则及 no-console/no-unused-vars，没有新增诊断，保留 3 条历史诊断。正式 CI/Office 仍须针对最终提交验证。前一候选 `a995b7a` 的两轮常规 CI `33387678821`、`33387673300` 均已完整通过，不能代替后续修正的验收。

另补充有界的 worker 退出等待：关闭所有已启动的清理任务后才报告完成，任何失败仍令任务失败；新增模块同时纳入 Docker 依赖闭包。受控的两个独立客户端测试证明 worker 启动由 2 次降至 1 次且 OCR 内容一致，不能将该替身测试换算为真实 Office 提速。相关 115 项测试、类型检查、常规 Lint、插件和 Runtime 安装包验证已通过；最终错误链调整后新增模块 12 项测试再次通过。对 14 个改动 JavaScript 文件扩展执行推荐规则及 no-console/no-unused-vars，与 HEAD 对比没有新增诊断，4 条历史诊断仍存在；没有关闭规则或抬高门禁基线。

本批尚待正式 CI 和候选提交的 full Office 回归；在取得完整报告之前，不认定下述 triangle-topology 超时已修复，也不批准生产部署。OCR 复用边界见 [Runner 缓存说明](./office-runner-cache.md)。

提交前再次执行同组 115 项测试时为 114/115，耗时约 115 秒：既有 `official PaddleOCR adapter returns sorted editable boxes, polygons, and pinned metadata` 在等待替身 worker ready 的 5 秒时限处失败，不能沿用前轮通过作为最新结果。两次宿主 CPU 采样均为 100%，同期专用 Runner 正执行其他 PR；这些仅说明存在负载，不证明超时根因。失败另暴露可确定的诊断缺陷：初始化计时器先使用默认错误关闭 worker，导致真正的初始化超时信息被覆盖。新增不发送 ready 的 worker 回归先失败、改为把超时错误传给关闭路径后通过；未增加任何时限或重试。此改动只修复错误原因丢失，不宣称已消除启动变慢，后续 CI/full Office 仍须独立验证；未启用自动合并。

PR #32 候选 `f8ce9b7` 的 [push CI 33386601549](https://github.com/cbhandsun/common-tools/actions/runs/33386601549) 已完整通过，包括单元、合约、集成、插件、Runtime 安装、构建及依赖门禁；但 [PR CI 33386650987](https://github.com/cbhandsun/common-tools/actions/runs/33386650987) 在真实 Chrome 合约测试失败，不能以单轮通过替代整个候选验收。脱敏诊断为 `reason=deadline`、`endpointError=ECONNREFUSED`、186 次探测、20002 毫秒，未观察到进程退出；其后的单元/合约/集成等阶段未执行。同一真实浏览器用例本地隔离执行通过，不证明原 CI 失败根因。

后续补充启动输出诊断：只记录 spawn 事件、各输出流最多 65536 字节的计数、截断标记，以及是否出现 DevTools 就绪标记；使用逐字节状态匹配，不保留原始输出、URL、路径或用户内容，不改变启动时限或添加重试。新增分块、超量和敏感内容回归先红后绿；33 项相关测试（含真实 Chrome、安装包及内嵌 Runtime 一致性）通过。两份内嵌源码同步更新，文件集合及摘要验证继续保留。此改动补强诊断，不宣称浏览器启动超时已消除；PR 保持草稿且自动合并关闭，候选 full Office `33386716453` 仍独立跟踪。

### 已合入基线的验收状态（PR #31）

PR #31 已受保护合入 main `0f186070a0b02feedf3eef185a140561654a7c17`，与最终受测提交 `874ff4d` 的源码 tree 完全一致。最终提交的两轮常规 CI（`33377989657`、`33377984989`）和 [PR Office 33377989658](https://github.com/cbhandsun/common-tools/actions/runs/33377989658) 均已通过：4/4 smoke、4/4 跨渲染器、5/5 独立 PPT 与 2/2 批量 PPT 编辑往返通过，趋势门禁通过。main [常规 CI 33380432749](https://github.com/cbhandsun/common-tools/actions/runs/33380432749) 也已通过；[全量 Office 33380432876](https://github.com/cbhandsun/common-tools/actions/runs/33380432876) 已结束且失败：31 个语料中 30 个通过，`triangle-topology` 在 180 秒用例时限处被终止（实测 180167 毫秒），后续跨渲染器、新建 PPT、编辑往返及趋势检查未执行。官方报告显示重建约 77 秒、渲染约 30 秒、像素差异约 1 秒，最后进入内容比较；PowerPoint 打开检查通过，但最终质量报告未生成。超时事实已确认，各阶段变慢的根因仍待诊断，不以增加超时、降低阈值或重跑成功代替修复。

修复范围、官方 PR 归档标识和报告 SHA-256 见 [协议与门禁修复证据](./evidence/paddle-protocol-output-2026-08-31.json)。已合并的修复分支本地与远端均已删除，没有移除用户文件或其他工作树。本次仍未执行生产部署、线上身份同步、授权设备/真实用户模板 canary 或运维演练。

以下记录保留各次失败及当时的验证边界；其中“待验证”“自动合并已暂停”等描述属于历史阶段，当前结果以上述状态为准。

`26a08e7` 的两轮常规 CI 在插件一致性检查失败：浏览器启动源码已更新，但 Git Marketplace 的内嵌 Runtime 未同步。这是本批遗漏，不是浏览器启动问题复发。补齐对应模块及调用方副本，保留完整文件集合和内容摘要校验；预期文件数由 22 调整为包含新模块的 23。新增回归验证打包归档包含 `browser-startup.js`，并直接调用内嵌模块确认已退出进程不再触发端点轮询；同步前两项回归失败，同步后完整插件校验及 6 项打包/安装/CLI 测试通过。新提交仍须通过正式 CI 和 Office 门禁。

PR #30 的资源调度修复已合入 `d7c9122`：PR 常规 CI、Office smoke 及合入后的常规 CI 均通过，详见 `docs/evidence/ci-resource-isolation-2026-08-31.json`。随后 main 全量 [Office run 33369610023](https://github.com/cbhandsun/common-tools/actions/runs/33369610023) 在 PaddleOCR 预检报 `PaddleOCR worker returned invalid output`，尚未进入 PPT corpus，不能记作最新 main 全量通过。原日志没有保留非法行，因此不能将其确定归因于某个第三方库。

当前修复将 JSON-lines 协议输出移到非继承的独立描述符，普通 Python、CRT、Win32、子进程和退出阶段输出不再进入协议或日志；Node 端仍严格拒绝非法 JSON，不过滤后继续。受控回归覆盖 Unicode、空结果、批量边界、非法输入、初始化/推理失败和隔离设置失败。协议辅助模块同时纳入 OCR 缓存指纹、Docker 打包与生产 SHA-256 校验；部署探测必须提取六个文件摘要及两个固定版本，缺失或不匹配即失败。使用 Runner 已有 Python/PaddleOCR 缓存的本地真实 OCR 已通过（2 行，PaddleOCR 3.7.0 / PaddlePaddle 3.3.1），没有重新安装依赖；这不替代待执行的受保护 PR 和 main 全量 Office 验收。

部署升级必须同时更新镜像及 `COMMON_TOOLS_IMAGE_PADDLEOCR_PROTOCOL_SHA256`。本地部署脚本会从选定镜像提取该摘要；手动使用 PaddleOCR overlay 时也必须提供，不能用旧镜像或占位摘要绕过校验。本次未修改线上服务、身份配置或授权设备。

同轮定向复测发现失败 worker 的延迟清理仍会重置新 worker 的共享状态，造成重复启动及残留进程。受控子进程回归在修复前观察到 3 次启动（预期 2 次），修复后保持 2 次并自行退出。修复使关闭操作幂等，已关闭的 worker 不再安排清理，且只能清除其拥有的活动状态。此前需要手动清理残留进程的运行不作为完整通过证据；正式 CI 必须重新验证此修复。

PR #31 的 `2240657` 已通过两轮完整常规 CI（`33372987796`、`33372984290`），但 [Office run 33372987836](https://github.com/cbhandsun/common-tools/actions/runs/33372987836) 仍未通过：真实 PaddleOCR 预检成功，随后在 `pdftoppm` 版本预检失败，未生成 corpus 报告。该轮 Node 依赖准备为 76 秒、远程缓存保存为 391 秒、Python 缓存准备为 25 秒、OCR/.NET 预检为 60 秒；这些是单次观察，不是受控性能基准。本机完整环境预检随后成功，`pdftoppm` 用时 282 毫秒，但这不能证明原 CI 失败原因。版本预检现补充有界、脱敏的失败类别、错误码、退出码、信号、耗时及输出字节数，既不输出原始 stdout/stderr 或异常消息，也不增加超时、不重试为成功；后续正式运行仍须通过原门禁。

后续 `8cd3ff3` 的 Office 运行已生成相同 `7151d11f…` 环境指纹的预检报告，并命中本地 Node 缓存（识别 16 秒、准备 9 秒，远程恢复/保存均未执行；Python 准备 17 秒），但这些中间结果不算完整 Office 通过。同提交 PR CI `33374863272` 在测试替身准备处失败：`createFakeLibreOffice` 使用 30 秒时限的 PowerShell/Add-Type 编译，返回空退出状态，尚未执行打包产物断言；原日志没有错误码，不能确定宿主层原因。测试替身现直接调用已安装 .NET Framework 的 C# 编译器，保留 30 秒时限、单次执行、原有三页 PDF 替身和真实可执行程序调用，不改变生产路径或正式 Office 质量测试。新增编译器发现和失败边界回归，原有打包/CLI 创建/三页结构/可编辑形状断言均保留；本地该文件 16 项测试通过，正式门禁仍待验证。自动合并已暂停，避免在已知失败未处理时推进 main。

`cbc5457` 的 PR CI `33376363970` 已完整通过，但同提交 push CI `33376359130` 再次在真实 Chrome 测试报调试端点不可用，故不能以单个绿色运行代替完整验收。原代码丢弃端点错误码，也未观察浏览器退出状态；受控回归证明，即使浏览器已经退出，仍会等满启动时限并丢失退出码。现将启动观察拆为独立模块，捕获异步启动错误和进程退出，终止无意义的后续端点轮询，并只报告白名单错误码、退出码、信号、探测次数和耗时；不记录原始异常、URL、浏览器输出或用户内容。原启动时限和真实 Chrome 测试保留，不增加重试。此项修复已复现的失败诊断与等待缺陷，不证明历史 CI 失败一定由浏览器退出引起；最终正式门禁仍需验证。

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
