# 团队 Docker 基础设施（I5.2）

此 profile 为团队运行时提供 PostgreSQL、Redis、MinIO、Keycloak、远程 MCP API、`team-retention` 维护服务，以及 `project-audit`、`image-to-editable`、`ppt-quality`、`ppt-improve` 四种隔离 Worker 的**本机验证环境**。所有公开端口都只绑定 `127.0.0.1`，不适合直接作为公网服务。API 已接入 PostgreSQL、Redis、MinIO 和 OIDC；Worker 只接受各自受限的输入格式，不能执行上传包中的配置、脚本或二进制文件。

> 客户端的执行策略与本机 Runtime 安装方式见 [执行模式与本机 Runtime](./execution-modes.md)。`project-audit` 在默认 `local-preferred` 模式下不会自动把项目归档上传到本服务；只有显式选择远程执行或 `remote-only` 模式才会调用本 Docker 运行时。

## 项目容量配额

`COMMON_TOOLS_PROJECT_ACTIVE_JOB_LIMIT` 默认是 `100`（范围 `1–10000`），限制同一项目中 `queued`、`running`、`input_required` 和 `cancel_requested` Job 的总数。生产环境强制项目 RBAC，因此该上限会在创建 Job 时生效；同一 owner/project/capability/idempotency key 的活跃重试会返回原 Job，既不额外占用配额，也不重复投递 Redis。取消和终态 Job 会释放名额。

计数与创建在 PostgreSQL 单条语句中通过项目级事务 advisory lock 完成，多个 API 副本不能同时越过上限；达到上限时 API 返回受控的 quota 错误，不泄露项目成员或现有 Job 详情。该限制是并发/容量保护，而不是按字节或按模型 token 的账单系统；如需业务侧成本分摊，应在受管平台计量链路中以 project ID 聚合，而不是把用量明细放入 MCP 响应。

```powershell
$env:COMMON_TOOLS_PROJECT_ACTIVE_JOB_LIMIT = '25'
common-tools team doctor
```

## 发布证据与镜像回滚

PPT 自用远程服务的变更责任、停止条件、应用回滚与隔离数据恢复流程集中在 [生产发布与回滚手册](./ppt-production-runbook.md)。手册不代替生产授权、实际联系人确认或演练证据。

CI 会在 `artifacts/` 中生成 SPDX SBOM 和 `common-tools.release.json`。后者绑定锁文件、源码 revision、SBOM 摘要及可选的不可变镜像 digest；启用原始图片 OCR 时，还会绑定 OCR profile 的 Worker image、二进制 SHA-256、语言包和许可。它不含 Secret，也不应被误认为签名。生产候选必须在构建、推送镜像后用实际 `@sha256:` 引用生成或补全 evidence，并在 `team production-preflight` 前复验：

```powershell
npm run common-tools:release-evidence -- --sbom artifacts/common-tools.spdx.json --output artifacts/common-tools.release.json --revision <git-digest> --image registry.example/common-tools/remote-mcp@sha256:<digest>
npm run common-tools:verify-release-evidence -- --sbom artifacts/common-tools.spdx.json --manifest artifacts/common-tools.release.json
```

无镜像的 evidence 是 CI 源码证明，不可用于发布。执行生产部署前，必须把其路径提供给部署进程（而非容器）并保持与两个 Compose 镜像完全一致：

```powershell
$env:COMMON_TOOLS_RELEASE_EVIDENCE_FILE = 'C:\release\common-tools.release.json'
.\scripts\team-runtime-production-deploy.ps1 -Mode Plan
```

`common-tools team production-preflight` 会先复验该文件、同目录 SBOM、仓库 lockfile 及两个镜像 digest，再解析生产 Compose；缺文件、source-only evidence、额外/缺失镜像或摘要不一致均会失败，且不会调用 Compose。若受管发布链路要求签名，部署进程设置 `COMMON_TOOLS_REQUIRE_RELEASE_SIGNATURE=true`、`COMMON_TOOLS_RELEASE_SIGNATURE_FILE` 与 `COMMON_TOOLS_COSIGN_PUBLIC_KEY_FILE` 后，预检还会用 `cosign verify-blob` 验证 evidence，并用 `cosign verify` 验证其中每一个实际部署的 digest；不会回显 cosign 输出、签名或公钥路径。缺少任一项、验证失败或镜像集合不一致都会在 Compose 前失败。未启用时不得意外传入签名路径，避免把半配置状态误认为已验证。私钥、OIDC 交换令牌和签名材料不得进入仓库、插件、镜像或 evidence JSON。回滚只选取先前已复验且仍有有效签名的 evidence 记录中的 digest，绝不能改用 `latest` 或任意 tag。

```powershell
$env:COMMON_TOOLS_REQUIRE_RELEASE_SIGNATURE = 'true'
$env:COMMON_TOOLS_RELEASE_SIGNATURE_FILE = 'C:\release\common-tools.release.sig'
$env:COMMON_TOOLS_COSIGN_PUBLIC_KEY_FILE = 'C:\release\common-tools.pub'
.\scripts\team-runtime-production-deploy.ps1 -Mode Plan
```

## 启动基础设施

在 PowerShell 中将以下值从团队 Secret Manager 注入当前会话，切勿提交 `.env`：

```powershell
$env:COMMON_TOOLS_POSTGRES_PASSWORD = '<strong unique value>'
$env:COMMON_TOOLS_REDIS_PASSWORD = '<strong unique value>'
$env:COMMON_TOOLS_MINIO_PASSWORD = '<at least 8 characters>'
docker compose -f deploy/compose.team-infra.yaml --profile team-infra up -d
docker compose -f deploy/compose.team-infra.yaml --profile team-infra ps
```

默认仅绑定本机端口：PostgreSQL `54329`、Redis `16379`、MinIO API `59000`、MinIO Console `59001`。如本机已占用，可在当前会话设置对应的 `COMMON_TOOLS_*_PORT` 后再启动。

在启动前先验证配置（输出会脱敏）：

```powershell
common-tools team doctor
```

成功输出中的 `enabledCapabilities` 必须与本次计划启动的 Worker profiles 一致；`metrics.enabled` 会明确 `/metrics` 是否已由有效 Secret 启用。该命令只显示主机名、bucket、能力集合、lease 配置和布尔状态，不显示连接串、token 或其他凭据。

服务启动或 Docker Desktop 重启后，可追加 `--runtime` 读取 Docker Compose label 和容器状态，检查 PostgreSQL、Redis、MinIO、一次性 `team-migrate`、API 与已启用 capability 的 Worker 是否实际可用。它不读取容器环境变量、日志、token 或对象 key；默认 Compose project 为 `deploy`，使用自定义 project 时传 `--project <name>`：

```powershell
common-tools team doctor --runtime
```

`runtime.ok: true` 仅表示容器层已经恢复；仍应以 `/readyz` 和应用监控确认 provider、Worker 心跳与业务路径。若 `team-migrate` 不是 `completed`，不要通过手工启动 API/Worker 绕过迁移门禁。

若只是排查 Docker Desktop 重启后的“引擎是否可用/既有容器是否恢复”，使用不读取团队连接配置的 `common-tools team runtime --project deploy`；它只检查 Docker daemon、Compose label 与容器状态，并以 `runtime.ok` 和退出码表示部署运行态。报告中的 `requiredServices` 是当前 capability 集合所需的服务，`missingServices` 明确列出根本未创建的服务，`inactiveServices` 列出已创建但未运行、已 unhealthy 或迁移未成功完成的服务；这三个字段都不读取容器环境变量或日志。能力集合不是默认值时显式传入 `--capabilities <csv>`，以便将所需 Worker 纳入检查。本机网关部署或验收时追加 `--require-gateway`，它要求 `remote-mcp-gateway` 存在且通过 Docker healthcheck；本机部署脚本已自动执行该门禁。受管生产部署若不使用本项目网关，不应传入此开关。`common-tools team doctor --runtime` 仍会同时校验团队连接配置；当前 shell 没有该配置时，它会以退出码 `2` 和 `valid: false` 标记配置未通过，适合诊断而不是运行态成功门禁。

若仅需恢复**本机 Docker 默认部署**的非敏感 URL/OIDC 值，可运行 `common-tools team local-config --project deploy`。它只读取 Compose 容器的公开 loopback 端口映射，输出 `REMOTE_PUBLIC_URL`、允许 Origin、Keycloak issuer/JWKS URL 和 audience；不会读取容器环境变量、日志、密码或 token。密码仍必须从 Secret Manager 或原部署记录恢复，且该命令不适用于受管 HTTPS 生产环境。

### 可选 MCP Apps 质量报告

本机 stdio MCP 和团队远程 API 均提供静态 `ui://common-tools/quality-report.html` 资源。只有客户端在当前请求的 `_meta["io.modelcontextprotocol/clientCapabilities"].extensions["io.modelcontextprotocol/ui"].mimeTypes` 中声明 `text/html;profile=mcp-app`，`get_job`、`get_project_audit_report` 或 `get_team_job` 才会携带 `_meta.ui.resourceUri`。不支持 Apps 的 Host 完全不受影响，仍取得相同的文本与 `structuredContent`。

该资源没有外部连接、静态资源、嵌套 iframe 或权限请求；它只显示已经由 MCP Host 推送的质量 checks/metrics，不能读取文件、下载工件或发起工具调用。消息桥只接受父宿主窗口发送的事件，并只用 `textContent` 渲染数据，不能由旁路 frame 注入 UI 内容。本地完成的项目审视可在工件哈希验证后追加固定 finding ID、severity 与相对证据路径/行号，并由界面在浏览器内筛选；团队 API 不把对象存储报告内容带入 UI，仍只暴露授权后的质量概要与短期下载目标。对于 `2026-07-28` 的远程请求，`resources/read` 仍须附上 `Mcp-Method: resources/read` 与等于 URI 的 `Mcp-Name`，与工具/Tasks 的路由约束一致。

### 隔离 Compose smoke 演练

`scripts/team-runtime-compose-smoke.ps1` 会为一次真实 Docker 演练创建唯一的 `ctsmoke-...` Compose project、随机选择一组连续六个可用 loopback 端口和临时随机凭据，启动 infra、Keycloak、gateway、API、maintenance 与四类 Worker，经迁移门禁等待后请求 `/readyz`。默认成功或失败后都会只清理这一随机 project 的容器、网络和卷，并恢复当前 PowerShell 进程原有环境变量；它不会读取、复用或回显真实部署凭据。若需复现某组端口，可显式传 `-BasePort <1024..65530>`，这时任何占用都会安全失败：

```powershell
.\scripts\team-runtime-compose-smoke.ps1
```

如默认 `60100–60105` 端口范围已被占用，传入另一个连续的六端口范围，例如 `-BasePort 61100`。仅在排障时使用 `-KeepArtifacts`；输出会给出唯一 project 名，清理时只针对该名称执行 Compose down。

### 本机团队版更新

`scripts/team-runtime-local-deploy.ps1` 将日常更新固定为“Secret 已注入 → Compose 配置预检 → 构建 → migration gate → API/Worker/maintenance 就绪等待”。它只接受本机验证的三份 Compose 文件（infra、API、gateway），不会重导入或覆盖已有 Keycloak realm；凭据只读取当前进程环境变量，永不写入输出。先运行无副作用预检：

```powershell
.\scripts\team-runtime-local-deploy.ps1 -Mode Plan
```

若已有本机 Docker Compose 部署、但当前 PowerShell 缺少五项非敏感 URL/OIDC 值，可显式加上 `-DiscoverLocalConfiguration`。它仅从同一 Compose 项目的 loopback 端口映射推导并填入**缺失**的 `REMOTE_PUBLIC_URL`、Origin、issuer、JWKS URL 和 audience；不会覆盖现有环境变量，不读取容器环境、日志或 Secret，也不能代替三项数据库、Redis、MinIO 密码：

```powershell
.\scripts\team-runtime-local-deploy.ps1 -Mode Plan -DiscoverLocalConfiguration
```

某些 Windows / Docker Desktop 组合会保留默认 MinIO 的 `59000–59001` 端口。若当前会话没有显式设置 `COMMON_TOOLS_MINIO_PORT` 或 `COMMON_TOOLS_MINIO_CONSOLE_PORT`，可加 `-DiscoverLocalPorts`：默认端口无法监听时，它会仅在当前进程中选一对可用 loopback 端口，并在 Plan 输出的 `localMinioPorts` 中显示；已显式设置的端口绝不改写。端口选择是启动前检查，无法替代操作系统最终绑定时的竞争保护：

```powershell
.\scripts\team-runtime-local-deploy.ps1 -Mode Plan -DiscoverLocalConfiguration -DiscoverLocalPorts
```

预检成功后，才运行完整更新。它**不会**使用 `--no-deps`，因此 API 和 Worker 必须等待 `team-migrate` 成功；默认保留两个 API 副本，可按本机容量调整：

```powershell
.\scripts\team-runtime-local-deploy.ps1 -Mode Apply -ApiReplicas 2
common-tools team doctor --runtime
Invoke-WebRequest http://127.0.0.1:54000/readyz | Select-Object -Expand Content
```

脚本要求当前会话已有 PostgreSQL、Redis、MinIO、OIDC 和公开 URL 的部署配置；缺少任一项会在构建或容器变更前失败关闭，并一次列出所有缺失的**变量名**（绝不输出值）。生产受管环境仍使用生产 overlay 与平台部署系统，不能将此本机脚本当作生产发布器。

`COMMON_TOOLS_MINIO_PASSWORD` 至少须有 8 个字符；更重要的是，对已初始化的 `common-tools-minio` volume，必须继续使用初始化它时的同一个 MinIO root password。部署脚本不会从容器或卷读取或恢复这个密码，也不会把新值写入持久数据；若它与既有对象存储身份状态不一致，MinIO 会失败关闭。需要轮换时，应先按受控 MinIO 管理流程完成备份和轮换，不能把密码改动混入普通 API/Worker 升级。

Apply 现在会先只启动并等待 `minio`；只有对象存储健康后才构建或重建 API、迁移器和 Worker。因此密码不匹配会在第一阶段失败，不再留下整套服务的半重建状态。

如果 MinIO root password 已遗失，先创建一个不覆盖源卷的备份计划：

```powershell
.\scripts\team-minio-volume-backup.ps1 -Mode Plan -Project deploy
```

确认计划产生的唯一目标卷名后，才执行复制：

```powershell
.\scripts\team-minio-volume-backup.ps1 -Mode Apply -Project deploy -Confirm
```

该工具在复制前会停止运行或重启循环中的 MinIO，以保证卷一致性；它会与部署、重置、其他备份/恢复操作取得同一项目的进程级互斥锁，遇到并发操作立即失败。复制帮助容器没有网络，只挂载只读源卷和新建目标卷，且不输出对象名或内容。它不删除原卷、不覆盖已有备份卷；若原容器在备份前为健康运行状态，完成或失败时都会尝试恢复启动；原本已在重启循环的容器会保持停止，避免继续写入不确定状态。它只提供本机恢复点，不能替代异地或不可变备份。

PostgreSQL 的最小恢复演练验证逻辑还原；如需在本机保留完整数据库卷恢复点，可先查看计划，再显式创建只写一次的备份卷：

```powershell
.\scripts\team-postgres-volume-backup.ps1 -Mode Plan -Project deploy
.\scripts\team-postgres-volume-backup.ps1 -Mode Apply -Project deploy -Confirm
```

该脚本只会复制当前项目中唯一的 PostgreSQL 卷，并在复制前停止运行或重启循环中的数据库以避免不一致页；帮助容器无网络、源卷只读，原卷永不删除或覆盖。若数据库在备份前运行，完成或失败都会尝试恢复启动；这只提供本机恢复点，生产环境仍应使用受管的加密、异地和可验证备份。

Keycloak 的持久化卷同样不是备份。需要在本机保存 IdP 恢复点时，先查看只读计划，再显式复制到一个新卷：

```powershell
.\scripts\team-keycloak-volume-backup.ps1 -Mode Plan -Project deploy
.\scripts\team-keycloak-volume-backup.ps1 -Mode Apply -Project deploy -Confirm
```

该脚本会按项目标签定位唯一 Keycloak 容器；只有它原本处于运行状态时才在复制后尝试恢复运行。复制过程停止 Keycloak 以保证其嵌入式状态一致，帮助容器无网络、只读挂载源卷，也不输出 realm、用户、token 或密码。它不覆盖或删除现有卷；这是本机恢复点，生产 IdP 仍应使用平台提供的加密、异地备份与恢复演练。

可从某个明确的 Keycloak 备份卷执行隔离恢复演练。Plan 不创建资源；Apply 会复制到随机临时卷、在无网络且无端口映射的容器中验证 `/health/ready`，随后无条件删除这两个临时资源，绝不挂载或修改 live volume：

```powershell
.\scripts\team-keycloak-volume-restore-drill.ps1 -Mode Plan -Project deploy -SourceVolume deploy_common-tools-keycloak-backup-<timestamp>
.\scripts\team-keycloak-volume-restore-drill.ps1 -Mode Apply -Project deploy -SourceVolume deploy_common-tools-keycloak-backup-<timestamp> -Confirm
```

演练只接受当前项目命名空间中的 `common-tools-keycloak-backup-*` 卷，拒绝 live volume 与覆盖目标；它同样使用项目级互斥锁。该验证证明备份可复制并可由当前 Keycloak 镜像启动，但不替代生产 IdP 的跨区域、不可变或灾备切换演练。

若确认整个本机环境都没有需要保留的数据，可用 `scripts/team-runtime-local-fresh-reset.ps1` 重新初始化 PostgreSQL、Redis、MinIO 与 Keycloak。它要求四项密码变量使用同一个至少 8 位的本机密码（MinIO 的最低约束），Plan 只验证配置；Apply 必须带 `-Confirm`，并且只执行此 Compose 项目的 `down --volumes`，不会使用 `--remove-orphans`。随后脚本启动 Keycloak/基础设施，再调用受控本机部署器创建四项能力。此流程会删除上述四个状态卷，绝不能用于有数据或生产环境。

初始化时 PostgreSQL 会执行 `packages/team-runtime/schema/001_jobs.sql`。该 schema 是任务、幂等键、lease 和审计事件的唯一事实来源；Redis 只用于可重复投递的队列通知，MinIO 只保存 owner 前缀下的输入和工件。

`team-migrate` 是受限的一次性 Compose 服务。每次通过团队 API、maintenance 或任一 Worker profile 启动时，它都会先取得 advisory lock、以事务和 SHA-256 校验执行迁移；API/Worker/maintenance 只有在它成功退出后才启动。首次对既有 schema 执行时会安全记录 `001_jobs.sql` 的当前摘要，之后任何已应用迁移内容被改写都会失败。迁移器不会回显连接串或凭据，因此升级、恢复和 Docker 重启不再依赖手工抢时序：

本机部署、全量重置和生产发布脚本还会按 Compose 项目取得一个进程级互斥锁。同一项目已有部署或重置在执行时，第二个操作会立即失败，不会并发调用 Compose；异常退出后的锁由操作系统回收，下一次受控操作可继续按当前 Compose 状态执行。

网关的 Docker healthcheck 请求其本地 `/readyz`，而不是只检查 Nginx 监听端口；该请求经网关到达 API，并验证 PostgreSQL、Redis、对象存储以及每项启用能力的 Worker 心跳。因此网关或其上游链路失效会显示为 `unhealthy`，可由 `common-tools team runtime --project <project>` 或 `docker compose ps` 直接定位。

若迁移器无法完成，它只输出固定类别：`database_authentication_failed`、`database_not_found`、`database_unavailable`、`migration_checksum_mismatch` 或 `migration_failed`；不会回显连接串、密码、SQL 或数据库错误文本。前两类配置问题应在当前进程修正 Secret 后重试；checksum 不匹配必须通过新增迁移处理，禁止改写已应用文件。

```powershell
docker compose -f deploy/compose.team-infra.yaml -f deploy/compose.team-api.yaml --profile team-infra --profile team-api up -d
```

如需只诊断或手工重跑迁移器，可仍使用 `docker compose run --rm --no-deps remote-mcp node packages/remote-mcp-server/bin/common-tools-team-migrate.js`；正常部署不应绕过 `team-migrate`，也不要以 `--no-deps` 重建 API/Worker。

`002_project_rbac.sql` 为新 Job 增加可为空的 `project_id`；`003_project_idempotency.sql` 将活跃 idempotency key 分区到该 project。旧 Job 保持 `NULL`，只能由原 owner 走兼容接口读取；迁移不会猜测或回填项目归属，因此绝不会把历史 owner-only Job 暴露给项目成员。

PostgreSQL 与 Redis 官方镜像在入口阶段必须从 root 切换到各自的非 root 服务用户，因此这两个有状态容器不设置 `no-new-privileges` 或 `cap_drop: ALL`；否则它们无法初始化数据卷。PostgreSQL、Redis、MinIO 和本机 Keycloak 都只监听内部 Docker 网络及 loopback 映射，并以 `restart: unless-stopped` 在 Docker Engine 重启后自动恢复；其中前三者分别使用 `common-tools-postgres`、`common-tools-redis`、`common-tools-minio` named volume，Keycloak 使用 `common-tools-keycloak` 挂载到 `/opt/keycloak/data`。后续 API/Worker/maintenance 容器仍必须以非 root、只读根文件系统、`no-new-privileges` 和 capability drop 启动。

## 已实现的运行时契约

本机 `team-runtime-local-deploy.ps1`、生产 `team-runtime-production-deploy.ps1` 和隔离 smoke 脚本都会先以只读 `docker version` 探测 Docker Engine，默认最多等待 20 秒，可用 `-DockerEngineTimeoutSeconds 5..60` 调整。为兼容 Docker Desktop 冷启动，探测会在总时限内执行多个至多 5 秒的独立 CLI 尝试；任一次成功即继续。每次超时只终止本次探测的 Docker CLI 子进程，不会停止、删除或重建任何容器、镜像、卷；总时限后请先等待 Docker Desktop 显示 Engine 已运行，再重新执行部署命令。

`@common-tools/team-runtime` 提供：

- 不包含原始 subject 的稳定 owner object prefix；
- 仅允许 `owners/<hash>/inputs/` 下的输入对象；
- PostgreSQL 参数化查询、活跃任务幂等约束和 lease 条件更新；
- 上传/下载短期 URL、任务创建、取消与队列投递的 provider 接口。

这不是完整团队服务。`TeamWorkerRunner` 只在数据库状态迁移完成后确认 Redis delivery，数据库或队列异常时会保留 delivery 供恢复。每个运行中的 Worker 会在 lease 的约三分之一周期续租；拒绝或失败的续租会使该 delivery 保持未确认，防止过期 Worker 写入终态。Redis 按 capability 使用独立的 ready/processing 队列，审计 Worker 不会领取图片转换任务，反之亦然；过期 lease 通过固定 Lua 脚本原子地从同一 capability 的 processing delivery 移回 ready 队列，找不到遗留 delivery 时才走幂等重投。每个 Worker 还会以 TTL 45 秒的固定键 `common-tools:workers:<capability>:<worker-id>` 报告存活；API `/readyz` 对 allowlist 中的每个 capability 仅通过受限 `SCAN MATCH` 查询是否存在至少一个该键。Docker 向 Worker 发出 `SIGTERM` 时，Worker 会停止下一轮领取、完成当前轮的清理、主动删除心跳并关闭 provider；Compose 为此保留 60 秒 stop grace。超出窗口或进程崩溃时仍由 TTL 和 lease 过期恢复兜底。生产 Redis ACL 必须只允许相应能力的队列键、固定 recovery/rate-limit Lua、心跳键上的固定 `SET EX`/`DEL` 和 API 对固定 `common-tools:workers:<capability>:*` 模式的 `SCAN`；不得让模型或调用方提供 Lua、Redis 命令、键名或 scan pattern。旧版单队列遗留消息应在升级窗口由受控运维流程清点、重投或过期，不能直接混入新队列。API/Worker 连接器必须分别以受限数据库帐号、Redis ACL 和 MinIO bucket policy 工作；没有受限执行镜像、归档校验和恢复演练时，禁止把 `remote-mcp-server` 设为 production backend。

远程 API 在 JWT 验证后、读取请求 body 前执行按主体 SHA-256 的固定窗口限流，默认每主体 60 请求/60 秒；超限只返回 429。`COMMON_TOOLS_RATE_LIMIT_WINDOW_SECONDS` 可设为 1–3600，`COMMON_TOOLS_RATE_LIMIT_MAX_REQUESTS` 可设为 1–10000。它不以 IP、token 原文、owner ID 或请求内容作为 Redis key。OIDC 发现与 JWKS 拉取默认最多等待 10 秒；可通过 `COMMON_TOOLS_OIDC_REQUEST_TIMEOUT_MS` 在 1000–60000 毫秒间调整，超时会拒绝该预检或认证请求，避免失联 IdP 无限占用部署或 API 请求。生产 Redis ACL 除队列所需 list 命令外，还必须只允许 `common-tools:ratelimit:*` 上的固定 `INCR`/`EXPIRE` Lua 操作；入口层仍应提供独立的 DDoS/WAF 与未认证请求限制。

已在本机真实 PostgreSQL/Redis 中演练：将一个专用测试任务置为过期 `running` lease 并保留在 processing 队列后，恢复逻辑只移动同 capability 的 delivery，任务回到 `queued` 并可被再次领取。演练使用随机隔离 Redis 前缀，完成后删除 Job 与测试队列，不会清空或重排默认队列。

升级旧单队列实现时，先停止旧 Worker 和 API 写入，导出 `common-tools:jobs` 与 `common-tools:jobs:processing` 的长度及消息清单，与 PostgreSQL 中仍为 `queued`/`running` 的 Job ID 比对；只对可归属且未终态的消息按 capability 重投。无法归属的消息保留到其 Job 过期或由运维人工裁决。**不要**通过 `FLUSHDB`、模糊 `DEL` 或跨 capability 的 `RPOPLPUSH` 清理遗留消息。

## 上线前门禁

1. 用真实 OIDC issuer、audience、JWKS 和精确 Origin 配置启动反向代理；不接受共享静态 token。
2. API 只能创建 presigned upload/download URL，不能以自身权限下载用户原始文件。
3. Worker 使用独立身份，只能读取所领 Job 的输入前缀、写入其输出前缀。
4. 执行迁移、备份恢复、Worker 崩溃/lease 过期、重复队列消息和对象生命周期演练。
5. 只有以上项通过后，才把端口从 loopback 移到受控 ingress。

生产连接器必须通过以下环境变量取得地址（认证凭据由独立 Secret 注入，不得嵌入 URL）：`COMMON_TOOLS_DATABASE_URL`、`COMMON_TOOLS_REDIS_URL`、`COMMON_TOOLS_OBJECT_STORE_ENDPOINT`、`COMMON_TOOLS_OBJECT_STORE_BUCKET` 和 `COMMON_TOOLS_WORKER_LEASE_SECONDS`。运行时拒绝非 HTTPS 对象存储、URL 内的账号密码和不安全的 lease 时长。

## 项目 RBAC（生产默认开启）

生产模式下 `COMMON_TOOLS_REQUIRE_PROJECT_RBAC` 默认为 `true`。OIDC access token 必须包含经 IdP 签发的自定义 claim `common_tools_projects`；它是数组，每项只有 `id` 与 `role`：

```json
[
  { "id": "product-core", "role": "viewer" },
  { "id": "design-platform", "role": "editor" }
]
```

项目 ID 只能是 3–64 位小写字母、数字和连字符，角色只能是 `viewer`、`editor`、`admin`。`viewer` 可读取项目 Job 和完成工件，`editor` 可创建上传/Job、取消 Job 并包含读取权限，`admin` 同样具备全部当前项目操作权限。开启后五个团队 MCP 工具都必须传 `projectId`；API 同时检查 token 角色和数据库中 Job 的 `project_id`，不会接受调用方提供的 owner ID。缺失、重复或格式错误的项目 claim 会使 token 被拒绝。

本机 Keycloak realm 已包含内置 user-attribute mapper：管理员可为本机测试用户设置单个 `common_tools_projects` 属性，其值必须是上述 JSON 数组，mapper 才会把它以 JSON claim 写入 access token；realm 不预置用户、密码或成员关系。开发模式默认不强制该 claim，继续支持 owner-only 隔离以方便演示。不要把这个兼容开关带到公网：生产若确有受控迁移窗口，才可显式设置 `COMMON_TOOLS_REQUIRE_PROJECT_RBAC=false`，并记录审批和截止时间。受管 IdP 应从不可由终端用户自行编辑的组/目录成员关系映射等价 claim，而不是接受客户端 scope、请求参数或本地配置生成的项目角色。

Keycloak 的 realm 导入使用 `IGNORE_EXISTING`：修改 `deploy/keycloak/realm-common-tools.json` 只会在全新 realm（例如新的本机数据卷）生效，单纯重启已有 Keycloak 容器不会覆盖其现有配置。升级已有本机实例时，应先导出并备份完整 realm，再用受控命令检查 mapper；不要为了重导入而直接删除数据卷。

早期本机实例若在此持久卷加入前已启动，先运行只读迁移计划：

```powershell
.\scripts\team-keycloak-persistence-migrate.ps1 -Mode Plan -Project deploy
```

计划只检查 Compose 标签和 `/opt/keycloak/data` 的挂载类型，不读取容器环境或密码。确认无误后，在当前 PowerShell 通过 Secret Manager 注入 `COMMON_TOOLS_KEYCLOAK_ADMIN` 与 `COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD`，再显式执行：

```powershell
.\scripts\team-keycloak-persistence-migrate.ps1 -Mode Apply -Project deploy -Confirm
```

它会停止当前 Keycloak、在新的 `deploy_common-tools-keycloak` named volume 中复制已停止容器的整个数据目录、重建并等待健康探针；如果替换前的步骤失败，会尝试重启仍存在的原容器。它不会覆盖已存在的目标卷，也不会自动处理非 named-volume 挂载。此操作会短暂中断本机登录，不能用于生产 IdP。

命令默认是只读检查，只会返回 `current`、`missing` 或 `drift`，不会修改 Keycloak。管理员凭据只能通过当前会话环境变量提供，不能作为命令行参数；输出不会包含密码或 access token。默认 base URL 是 loopback 的 `http://127.0.0.1:58080`，也只允许 HTTPS 或 loopback HTTP：

```powershell
$env:COMMON_TOOLS_KEYCLOAK_ADMIN = '<local admin username>'
$env:COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD = '<local admin password>'
common-tools team keycloak-project-mapper
```

只有检查结果为 `missing` 或 `drift` 且已完成完整 realm 备份时，才执行下列升级。`--backup-file` 必须是一个不存在的 `.json` 文件；命令会先创建仅含该 mapper 的安全快照，再创建或更新固定的 `common-tools-project-membership` mapper，并从 Keycloak 重新读取后逐字段验证。它不会创建用户、修改角色、scope、client redirect URI 或其他 mapper：

```powershell
$mapperBackup = Join-Path $PWD ("keycloak-project-mapper-before-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
common-tools team keycloak-project-mapper --apply --backup-file $mapperBackup
```

若命令报告 mapper 重复、远程响应异常或验证失败，会失败关闭，不会尝试猜测、删除或合并配置。`$mapperBackup` 是这一次 mapper 变更的审计快照，不替代前述完整 realm 备份。

OIDC 验证器缓存 JWKS 最多五分钟；若收到未知 `kid`，会在拒绝 token 前立即强制刷新一次，支持受管 IdP 的正常签名 key 轮换。生产 IdP 仍应保留旧签名 key 至少覆盖 access token 最大有效期，并对 JWKS/issuer 可用性设置监控。

接入生产 IdP 前，先注入生产 `COMMON_TOOLS_REMOTE_PUBLIC_URL`、issuer、JWKS、audience、backend 与 Origin 配置，执行发现预检。它不请求 token、不输出 endpoint 内容或 Secret；生产会拒绝 HTTP、issuer/JWKS 不一致、缺少 S256 PKCE 或缺少授权码/token 端点的发现文档。`team-runtime-production-deploy.ps1` 在 `Plan` 和 `Apply` 模式都会自动执行该只读 HTTPS 门禁；若要在流水线更早阶段单独检查，也可运行：

```powershell
npm run common-tools:oidc-preflight
```

远程 API 镜像定义在 `deploy/docker/Dockerfile.remote-mcp`，Compose 服务定义在 `deploy/compose.team-api.yaml`。启动它必须同时提供 OIDC issuer/JWKS/audience、精确 Origin 和上述基础设施 Secret；缺任一项即拒绝启动。API 默认只绑定 localhost 的 `54000`（Windows/Docker Desktop 通常会保留 `53000`），并通过容器内 `/readyz` 参与 Compose `--wait`。`Dockerfile.remote-mcp.dockerignore` 与 `Dockerfile.image-to-editable.dockerignore` 是 Dockerfile 专用白名单：前者只传 API Node 源码，后者只传 Node package 源码及 OpenXmlDeckBuilder；不要改回把完整 skill、样例、渲染结果或本地工件送入团队镜像上下文。

图片 Worker 的专用 ignore 文件还会显式排除 `OpenXmlDeckBuilder/bin` 与 `obj`。本机 .NET 输出可能包含 GB 级、跨平台且不可复现的 OCR/ONNX 二进制；SDK stage 会从锁定依赖重新 `dotnet publish`，因此这些目录既不应进入 context，也不能作为镜像发布输入。若 Docker 构建长期停在 “transferring context”，优先检查这一白名单是否被错误放宽，而不是重启 Docker Desktop 或清理业务卷。

团队 Compose 为无状态服务设置默认故障重启与强制资源边界：API 为 `1 CPU / 768 MiB / 256 PID`，retention maintenance 为 `0.25 CPU / 256 MiB / 128 PID`，审计 Worker 为 `1 CPU / 1 GiB / 256 PID`，PPT 质量 Worker 为 `1 CPU / 512 MiB / 128 PID`，PPT 改善 Worker 为 `1 CPU / 768 MiB / 128 PID`，图片 Worker 为 `2 CPU / 3 GiB / 256 PID`，gateway 为 `0.5 CPU / 128 MiB / 64 PID`。它们是本机安全基线，不等同于容量规划；生产集群应基于真实峰值、并发数和 Worker lease 超时调整，并在变更前进行压测。资源耗尽会让 Job 依 lease 恢复，不能通过解除资源限制来掩盖 OOM 或无限任务。

### 按能力部署 Worker

`COMMON_TOOLS_TEAM_CAPABILITIES` 是 API、已启用 Worker 和指标面共享的 capability allowlist，默认值为 `image-to-editable,project-audit`。当仅部署审计 Worker 时，启动全部相关 profile 前在同一 shell/Secret Manager 中设为 `project-audit`；API 只会在 `tools/list` 中给出审计 capability，拒绝图片上传/Job，OAuth protected-resource metadata 与 Prometheus 指标也不会再宣称图片能力。反之若设为 `image-to-editable`，审计创建同样被拒绝。不要只停掉某个 Worker 而保持默认 allowlist——那会留下永远无人消费的队列；同时启动一个未被 allowlist 包含的专用 Worker 会在启动时失败关闭。需要同时验证本机入口时，`common-tools team runtime --project deploy --capabilities ... --require-gateway` 除了检查 Compose 服务外，还会由 Runtime 自带 Node 仅探测 gateway 的 loopback `/readyz`；不会读取容器环境、日志或凭据，也不适用于生产的外部 HTTPS ingress。

可在不读取凭据、不连接 Docker 的情况下查看某个能力集合会启用哪些 Worker profile 与 service；这份映射直接来自各 capability manifest 的可选 `team.deployment`，本地和生产部署脚本不再各自维护 profile 列表。新增远程能力时，漏改 manifest、Compose Worker/profile/命令、镜像类型或 `team-migrate` 门禁中的任一项都会失败：

```powershell
npm run common-tools -- team deployment-plan --capabilities ppt-quality
```

`npm run common-tools:verify-capabilities` 会进一步验证这份映射在 `compose.team-api.yaml` 中确有匹配的 Worker service、profile、启动命令、专属 capability 设置、迁移门禁和正确的镜像类型；缺失任一项都会阻断插件/能力发布校验。

`ppt-quality` 与 `ppt-improve` 均提供可选的团队 Docker Worker，且只接受 `application/vnd.openxmlformats-officedocument.presentationml.presentation` 的单一 PPTX 输入。质量 Worker 输出 owner/job-scoped JSON/Markdown 审计报告；改善 Worker 会在受限临时目录内先生成同一份独立质量报告，再按 Job 的受限 `options.repairProfile` 执行 `safe-package`、`layout-safe`、`typography-safe`、`editability-safe` 或 `audit-only`。前三个元数据类修复分别处理重复 drawing ID、缺失文本语言标记和缺失对象名称，不改变可见版式；发生修改时输出新的 `improved.pptx`、改善报告和独立复审报告。它不接受调用方提供的报告、修复脚本、模板或路径，因此单输入对象协议不会绕过“审视后再改善”的 SHA-256 绑定。两者均沿用队列、lease、对象存储和心跳门禁，且不在默认 allowlist 中；部署时必须同时设置 capability 并启用对应 profile。

`ppt-create` 的自然语言路径默认仍使用本地确定性整理器，只重组输入中已有事实。若部署方有经审批的研究/内容服务，可额外叠加 `deploy/compose.team-ppt-create-provider.yaml`：该 overlay 仅向 `ppt-create-worker` 注入固定 HTTPS endpoint、provider ID、model 与文件型 token。调用方只能在 `kind: "prompt"` 的 JSON 中选择已经注册的 `providerId`，不能提供 URL、模型、凭据或任意请求头；HTTP 调用禁止重定向，响应限制为 512 KiB，并必须返回通过 `PresentationBrief 1.0`、来源及逐 section 引用校验的数据。未配置、未知或失败的 Provider 会失败关闭，不会静默退回本地生成。启用时需在原 Compose 文件后追加该 overlay，并设置 `COMMON_TOOLS_PPT_CREATE_CONTENT_PROVIDER_*`；token 只通过 `COMMON_TOOLS_PPT_CREATE_CONTENT_PROVIDER_TOKEN_FILE` 挂载。

需要注册多个内容 Provider 时，改用 `COMMON_TOOLS_PPT_CREATE_CONTENT_PROVIDERS_FILE` 指向只读 JSON 配置，并且不得同时设置旧的单 Provider 环境变量。配置格式为 `{ "version": "1.0", "providers": [{ "id": "research-a", "endpoint": "https://provider.example/generate", "model": "approved-model", "tokenFile": "/run/secrets/research-a-token", "timeoutMs": 30000 }] }`；最多八项，`tokenFile` 必须指向普通非符号链接文件，配置中不得内联 token。Local Runtime 的 `ppt draft` / `ppt compose` 也可通过成对的 `--provider-config <workspace-json> --provider-id <id>` 使用同一合同，配置和 token 文件必须位于已批准工作区内。

运行时会解析配置与 token 的真实路径，拒绝借助父目录符号链接或 junction 逃逸批准根目录。Provider 请求和解压后的流式 JSON 响应均有独立字节上限；重定向、非 HTTPS、URL 凭据/查询参数、超时、超限及非 JSON 响应都会失败关闭。对外错误仅使用 `CONTENT_PROVIDER_UNAVAILABLE`、`CONTENT_PROVIDER_REQUEST_INVALID`、`CONTENT_PROVIDER_REQUEST_FAILED`、`CONTENT_PROVIDER_TIMEOUT`、`CONTENT_PROVIDER_REJECTED` 或 `CONTENT_PROVIDER_RESPONSE_INVALID`，并提供 `retryable` 判断；日志和 Job 失败信息不得序列化原始上游异常、token、请求正文或响应正文。

```powershell
$env:COMMON_TOOLS_TEAM_CAPABILITIES = 'project-audit'
docker compose -f deploy/compose.team-infra.yaml -f deploy/compose.team-api.yaml --profile team-infra --profile team-api --profile team-worker-audit up -d --build --wait
```

```powershell
$env:COMMON_TOOLS_TEAM_CAPABILITIES = 'ppt-quality'
docker compose -f deploy/compose.team-infra.yaml -f deploy/compose.team-api.yaml --profile team-infra --profile team-api --profile team-worker-ppt-quality up -d --build --wait
```

```powershell
$env:COMMON_TOOLS_TEAM_CAPABILITIES = 'ppt-improve'
docker compose -f deploy/compose.team-infra.yaml -f deploy/compose.team-api.yaml --profile team-infra --profile team-api --profile team-worker-ppt-improve up -d --build --wait
```

切换 capability 集合前，先停止 API 和相应 Worker，检查并处理即将禁用能力的 `queued` / `running` Job；不要把它们留在 Redis processing 队列中。可读取、取消和下载已存在工件仍受原 owner 或项目 RBAC 约束，allowlist 仅阻止新的上传和 Job 创建。

`GET /healthz` 是不访问后端的存活探针；`GET /readyz` 是团队 backend 的就绪探针，依次验证 PostgreSQL 查询、Redis `PING`、MinIO bucket 可达性，以及 allowlist 中每个 capability 至少有一个 TTL 未过期的 Worker 心跳。它只返回 `{"status":"ok"}` 或 HTTP 503 的 `{"status":"not_ready"}`，不会向未认证调用方暴露地址、凭据、Worker ID 或后端错误。Compose 的 API healthcheck 使用 `/readyz`；受控 ingress 应以它作为摘流依据，以 `/healthz` 区分进程崩溃。`Dockerfile.remote-mcp.dockerignore` 只向 API 镜像传输 package metadata 和 `packages/`，图片转换的数 GB 资源不会阻塞 API 发布。

远程 MCP 仅从严格的 W3C `traceparent`（`00-<trace-id>-<parent-span-id>-<flags>`）提取关联信息并随 Job 持久化：`2026-07-28` 从请求 `params._meta.traceparent` 读取，旧协议兼容 transport header。它是 Worker 可读取的内部字段，不进入 MCP 响应、审计 event detail、对象 key、日志或 Prometheus 标签。格式错误、全零或重复值会被忽略，不会导致业务请求失败。为避免把调用方自由文本或潜在敏感 metadata 写入数据库，`tracestate` 与 `baggage` 目前不持久化；接入 OpenTelemetry exporter 时，只能通过明确 allowlist 的受控 resource attributes 补充，而不能直接透传 baggage。

所有 `/mcp` 的 `POST` 都必须显式使用解析后为 `application/json` 的 `Content-Type`（例如 `application/json; charset=utf-8` 可以，`text/plain; value=application/json` 不可以）；缺失或不匹配时 API 会在认证、读取 body 和执行任何 MCP 操作前返回 415。客户端还必须保留 `Accept: application/json, text/event-stream`。这符合 `2026-07-28` Streamable HTTP 的 media-type 边界，避免代理或手写客户端用子串伪造 JSON 请求。

API 和三个专用 Worker 可选通过 OTLP/HTTP 输出最小 span。只有设置 `COMMON_TOOLS_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` 时才启用；生产只接受无用户名、密码或 fragment 的 HTTPS endpoint。每个成功的 MCP 请求只发送固定 `service.name`、`rpc.system=mcp`、受限 method label 与 HTTP 状态码，以及已验证的 trace ID/parent span ID；Worker 处理会以同一 Job parent span 输出固定 `worker/project-audit`、`worker/ppt-quality` 或 `worker/image-to-editable` 成功/失败 span。它们都不发送 principal、项目、token、请求 body、对象 key、工件、`baggage` 或 collector 凭据。`COMMON_TOOLS_OTEL_SERVICE_NAME` 默认为 `common-tools-remote-mcp`，`COMMON_TOOLS_OTEL_EXPORTER_TIMEOUT_MS` 默认 2000、范围 100–10000。导出异步且失败会被吞掉，collector 故障不能影响 MCP 响应或 Worker 的状态迁移。认证应由受管 collector sidecar/egress 处理，禁止把认证 header 或 token 放入此服务环境变量：

```powershell
$env:COMMON_TOOLS_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'https://otel-collector.example.internal/v1/traces'
$env:COMMON_TOOLS_OTEL_SERVICE_NAME = 'common-tools-remote-mcp'
$env:COMMON_TOOLS_OTEL_EXPORTER_TIMEOUT_MS = '2000'
```

### MCP Tasks 与无状态 HTTP（2026-06-30 / 2026-07-28）

团队后端现在实现了 MCP Tasks 扩展的最小安全投影。`2026-06-30` 客户端可在 `initialize` 的 `params.protocolVersion`（或每次请求的 `MCP-Protocol-Version` header）协商 Tasks；最终版 `2026-07-28` 已移除初始化握手，应先调用 `server/discover`，其响应会列出 `supportedVersions` 与 `capabilities.extensions.io.modelcontextprotocol/tasks`。该最新版的每个成功结果还带 `resultType` 和结果 `_meta["io.modelcontextprotocol/serverInfo"]`，不再把 server identity 放进 discover result body。旧协议版本以及未协商这两个版本的客户端继续使用原有的基础 MCP Job 工具，行为不变。

若客户端在 `tools/call` 的 `_meta["io.modelcontextprotocol/clientCapabilities"].extensions["io.modelcontextprotocol/tasks"]` 明确声明支持，`create_team_job` 会返回 Tasks 结果（带不可猜测的 UUID、TTL 与建议的 5 秒轮询间隔）；否则仍返回原来的 `structuredContent` Job 结果。`tasks/get`、`tasks/cancel`、`tasks/update` 只允许创建者读取或操作自己的任务，并且按 Tasks Streamable HTTP 约定同时校验 `Mcp-Method` 与 `Mcp-Name == taskId`，防止路由错绑。当前没有 `tasks/list` 或 server notifications；`tasks/update` 只验证并确认受限 input response，业务 Job 不进入交互式 input 状态。需要共享项目成员读取/取消时，继续使用受项目 RBAC 约束的 `get_team_job` / `cancel_team_job`，不能借 Tasks 绕过项目角色。

客户端接入顺序为：旧客户端先 `initialize` 协商 `2026-06-30`；无状态客户端在每次请求发送 `MCP-Protocol-Version: 2026-07-28`。新版的每个 POST 必须提供与 JSON-RPC `method` 一致的 `Mcp-Method`；`tools/call` 还必须给出等于工具名的 `Mcp-Name`，Tasks 请求的 `Mcp-Name` 必须等于任务 ID。缺失或不匹配会得到 HTTP 400 / JSON-RPC `-32001`，不能由网关猜测。新版 `tools/list` 和 `server/discover` 响应含 `ttlMs: 30000`、`cacheScope: "private"`，共享缓存不得跨 principal 使用。当团队服务已启用 Tasks 时，`create_team_job` 会在工具声明中提供 `execution.taskSupport: "optional"`；创建时仍须声明客户端 Tasks extension，轮询/取消时使用相同协议版本与路由头。所有 Job 必须在创建时提交完整非 Secret 输入，因此当前 `tasks/update` 会返回 JSON-RPC `-32602` 而不会伪造完成结果。未启用该扩展或任一协商/header 不满足时，应降级为基础 Job API，而不是重试创建任务。

官方规范站点中出现的 `DRAFT-2026-v1` 属于草案，当前服务会以不回显草案值的 HTTP 400 明确拒绝，且不会在 `supportedVersions` 中声明。草案中的 Tasks 通知、订阅和 `input_required` 交互输入均未实现：现有团队 Job 必须在创建时提交完整、非 Secret 输入，并继续使用轮询与项目 RBAC。待草案定稿、客户端兼容性和无状态安全边界都复核后，才会作为独立版本增量接入。

本机开发可使用 `deploy/compose.team-idp.yaml` 启动 Keycloak，端口为 `58080`。它仅提供本地 IdP；创建 `common-tools` realm 与 `common-tools-mcp` audience/client 后，issuer 为 `http://127.0.0.1:58080/realms/common-tools`，JWKS 为该 issuer 下的 `protocol/openid-connect/certs`。生产环境必须使用 HTTPS IdP。

### 生产 Docker 覆盖层

`deploy/compose.team-production.yaml` 是面向受管 PostgreSQL、Redis、HTTPS S3 兼容对象存储及 HTTPS OIDC IdP 的覆盖层。它不包含 Keycloak、不发布 API 容器端口，并强制 `NODE_ENV=production`、`COMMON_TOOLS_TEAM_MODE=production` 和项目 RBAC；Runtime 会进一步拒绝未带 `sslmode=verify-full` 的 PostgreSQL URL、非 `rediss://` Redis URL 和非 HTTPS 对象存储端点。覆盖层会显式移除开发 Compose 的五个 `build` 块，因此即使误省略 `--no-build` 也不能以本机工作区替换生产镜像。外部 TLS ingress、受管服务网络策略、镜像签名与 Secret Manager 仍由平台负责。生产发布必须使用仓库 digest（`registry.example/common-tools/api@sha256:<64-hex>`），不能使用可移动的 tag（包括 `latest`）。

在执行 `up` 前先运行只读预检：

```powershell
npm run common-tools -- team production-preflight
```

预检不拉取镜像、不启动或停止容器、不读取或回显凭据内容。它验证所有实际启用镜像是否以 digest 固定、HTTPS/OIDC/受管数据库与缓存配置是否可被 Runtime 接受、能力集合是否有效、六项凭据是否完整且只采用一种来源（直接注入或 `*_FILE`），并解析最终 Compose JSON：API、迁移器、maintenance 和每个已启用 Worker 必须精确使用预先固定的镜像、不得保留 `build`、每个服务均为 production team mode、迁移器无本地依赖，API 必须使用团队后端与强制 RBAC、绑定受管网络接口且不得发布端口，API/Worker/maintenance 只能依赖一次性迁移门禁。通过后只输出来源类型、能力列表、已验证的 Compose 文件名以及不含路径/密钥的签名 required/verified 状态。

日常发布建议使用受控脚本。`Plan` 是默认值，只完成预检和计划输出；只有显式 `Apply` 才会启动 Compose。它会固定启用 API 与 `team-maintenance`，并根据 `COMMON_TOOLS_TEAM_CAPABILITIES` 启用匹配的 Worker profile、保留迁移门禁、强制 `--no-build --wait`，并在文件凭据模式下自动叠加 Secret overlay。生产 `Plan` 会安全返回解析后的 `enabledCapabilities`、`releaseSignatureRequired`、`releaseSignatureVerified` 与 Compose 校验结果；若要求签名但预检没有明确验证，脚本会在启动 Compose 前失败，便于在变更窗口前审阅实际启动集合：

```powershell
.\scripts\team-runtime-production-deploy.ps1 -Mode Plan
.\scripts\team-runtime-production-deploy.ps1 -Mode Apply -Project common-tools -WaitTimeoutSeconds 300
```

在 Secret Manager 注入所有变量后，以基础 API 定义和此覆盖层启动（不要合并本机 IdP 或 infra 文件）：

```powershell
docker compose -f deploy/compose.team-api.yaml -f deploy/compose.team-production.yaml --profile team-api --profile team-worker-audit --profile team-worker-image up -d --no-build
```

若只部署 PPT 质量审计或改善流水线，显式只启用该能力和对应 profile；这时只需提供 Remote MCP 镜像，不需要图片 Worker 镜像，发布证据也只应绑定实际启用的镜像：

```powershell
$env:COMMON_TOOLS_TEAM_CAPABILITIES = 'ppt-quality'
docker compose -f deploy/compose.team-api.yaml -f deploy/compose.team-production.yaml --profile team-api --profile team-worker-ppt-quality up -d --no-build
```

```powershell
$env:COMMON_TOOLS_TEAM_CAPABILITIES = 'ppt-improve'
docker compose -f deploy/compose.team-api.yaml -f deploy/compose.team-production.yaml --profile team-api --profile team-worker-ppt-improve up -d --no-build
```

如团队部署平台将 Secret 以文件挂载而非环境变量提供，叠加 `deploy/compose.team-production-secrets.yaml`。在**宿主部署进程**中，六个 `*_FILE` 变量分别指向数据库用户名/密码、Redis 用户名/密码、对象存储 access key ID/secret 的受保护文件；Compose 会将它们以只读文件挂载到容器内固定 `/run/secrets/` 路径。容器 Runtime 只接受这个目录下不超过 16 KiB、无 NUL 的内容，去除末尾换行后读取；同一凭据的直接环境变量与 `*_FILE` 同时出现会失败关闭，绝不猜测优先级：

```powershell
$env:COMMON_TOOLS_DATABASE_USER_FILE = 'C:\secure\common-tools\db-user'
$env:COMMON_TOOLS_DATABASE_PASSWORD_FILE = 'C:\secure\common-tools\db-password'
$env:COMMON_TOOLS_REDIS_USERNAME_FILE = 'C:\secure\common-tools\redis-user'
$env:COMMON_TOOLS_REDIS_PASSWORD_FILE = 'C:\secure\common-tools\redis-password'
$env:COMMON_TOOLS_OBJECT_STORE_ACCESS_KEY_ID_FILE = 'C:\secure\common-tools\object-key-id'
$env:COMMON_TOOLS_OBJECT_STORE_SECRET_ACCESS_KEY_FILE = 'C:\secure\common-tools\object-secret'
docker compose -f deploy/compose.team-api.yaml -f deploy/compose.team-production.yaml -f deploy/compose.team-production-secrets.yaml --profile team-api --profile team-worker-audit --profile team-worker-image up -d --no-build
```

使用该 overlay 时不要在同一 Compose 进程设置对应的六个直接凭据变量。生产覆盖层允许 Compose 在文件模式下解析为空的直接值，但迁移器和所有运行时连接器仍会拒绝缺失凭据；这使错误停在受限 `team-migrate` 门禁，而不是由 API 静默降级。Metrics token 也支持受管平台直接提供 `COMMON_TOOLS_METRICS_TOKEN_FILE=/run/secrets/...`，但需由平台在 API service 单独挂载，不能将 token 写入此仓库。

该命令不会建立公网入口；将 `remote-mcp:3000` 只暴露给受控 HTTPS ingress。部署脚本会在变更前执行 OIDC 发现预检，受管 Redis ACL、对象存储 bucket policy、备份和告警接收器仍是上线门槛。

## 本地远程 MCP API

先启动基础设施和本地 IdP。Keycloak 的健康探针使用未映射到宿主机的管理端口 `9000`；它不是对外接口。导入的 realm 已包含 `common-tools-mcp` public client、S256 PKCE、subject/audience mapper、三个可部署能力 scope 和 `common_tools_projects` user-attribute mapper。不要在 realm JSON 中写入用户或密码；本机测试用户应通过 Keycloak 管理界面或团队的临时身份流程创建。为测试项目 RBAC，由管理员设置用户的单个 `common_tools_projects` 属性，例如 `[ { "id": "product-core", "role": "editor" } ]`；客户端不能通过 scope 或 MCP 参数自行为自己添加该 claim。

```powershell
$env:COMMON_TOOLS_KEYCLOAK_ADMIN = '<local admin username>'
$env:COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD = '<local admin password>'
docker compose -f deploy/compose.team-infra.yaml -f deploy/compose.team-idp.yaml --profile team-infra --profile team-idp up -d --wait
```

然后向当前会话提供远程 API 配置。`ISSUER` 必须保持浏览器/CLI 实际看到的 loopback 地址；`JWKS_URL` 则使用 Docker 网络中的 Keycloak 地址，避免容器回环地址错误。`ALLOWED_ORIGINS` 填写真实 MCP Host 的精确 Origin；没有浏览器 Origin 的原生 MCP 客户端不受此项影响。

本机部署脚本只读取**当前 PowerShell 进程**的以下密码与 API 配置；重启终端或 Docker Desktop 后需重新注入。不要使用 `setx`、仓库 `.env` 或命令历史持久化密码。缺少任一项时 `-Mode Plan` 会在修改容器前失败并只列出变量名：

```powershell
$env:COMMON_TOOLS_POSTGRES_PASSWORD = '<local PostgreSQL password>'
$env:COMMON_TOOLS_REDIS_PASSWORD = '<local Redis password>'
$env:COMMON_TOOLS_MINIO_PASSWORD = '<local MinIO password>'
$env:COMMON_TOOLS_REMOTE_PUBLIC_URL = 'http://127.0.0.1:54000'
$env:COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS = 'http://127.0.0.1:54000'
$env:COMMON_TOOLS_OIDC_ISSUER = 'http://127.0.0.1:58080/realms/common-tools'
$env:COMMON_TOOLS_OIDC_JWKS_URL = 'http://keycloak:8080/realms/common-tools/protocol/openid-connect/certs'
$env:COMMON_TOOLS_OIDC_AUDIENCE = 'common-tools-mcp'
docker compose -f deploy/compose.team-infra.yaml -f deploy/compose.team-idp.yaml -f deploy/compose.team-api.yaml --profile team-infra --profile team-api --profile team-worker-audit --profile team-worker-image up -d --build --wait
Invoke-WebRequest http://127.0.0.1:54000/healthz | Select-Object -Expand Content
```

如通过 `COMMON_TOOLS_REMOTE_PORT` 改了默认端口，必须同步修改 `deploy/keycloak/realm-common-tools.json` 中的 `redirectUris` 与 `webOrigins`，再重建本地 Keycloak；不要为了方便放宽为 `*`。

## 多 API 副本与受控入口

`deploy/compose.team-gateway.yaml` 通过 Nginx 把唯一 loopback 端口交给 gateway，并使用 Docker DNS 将请求转发给没有宿主端口的 `remote-mcp` 副本。该 override 使用 Compose 的 `!reset` 清空 API 的直接端口映射；因此必须与 API Compose 文件一起使用，不能混用“直接 API 端口”和 gateway profile。

```powershell
docker compose -f deploy/compose.team-infra.yaml -f deploy/compose.team-idp.yaml -f deploy/compose.team-api.yaml -f deploy/compose.team-gateway.yaml --profile team-infra --profile team-api --profile team-gateway up -d --scale remote-mcp=2
```

本机演练中，20 个 `/healthz` 请求已均匀落到两个副本。开发模式响应会提供临时容器 instance 标识以验证分发；生产模式只返回 `{ "status": "ok" }`。公网部署必须把 Nginx 替换或置于受管 TLS ingress/LB 后，TLS 终止、精确 Origin、速率限制和日志策略由 ingress 承担，不能直接公开此 loopback gateway。

`remote-mcp` 只签发对象存储上传/下载 URL、创建/查询/取消作业并投递队列；它不下载或执行用户文件。要调用任一能力，授权码 + S256 PKCE 请求必须显式携带对应的 optional scope：`common-tools:capability:project-audit`、`common-tools:capability:image-to-editable`、`common-tools:capability:ppt-create`、`common-tools:capability:ppt-quality` 或 `common-tools:capability:ppt-improve`；access token 必须包含稳定 `sub`、`common-tools-mcp` audience 和该 `scope`。部署前应以授权码 + PKCE 获取 token，不能使用共享静态 token。

## 项目审视归档协议

`team-worker-audit` 只接受 `project-audit` 的 gzip-compressed TAR 输入；创建上传目标时使用 `contentType: application/gzip`，并将返回的 `objectKey` 传给 `create_team_job`。归档最大 100 MiB，解压后最多 64 MiB、10,000 个普通文件。只允许目录和普通文件；绝对/回退路径、反斜杠路径、符号链接、硬链接、PAX/其他 TAR 条目、重复文件和截断归档都会被拒绝。报告中的根目录固定为 `uploaded-project`，不泄露 Worker 临时路径。

该 Worker 运行在无 root、只读根文件系统、`/tmp` noexec tmpfs、无 Docker socket 的容器中。它只读取 Job 所属输入对象、仅写入该 Job 的输出 prefix，并在写入终态数据库记录之后才确认 Redis delivery。Worker 会周期性恢复过期 lease：剩余重试次数的 Job 重新排队，达到上限的 Job 以 `WORKER_LEASE_EXPIRED` 终止并写入审计事件。`image-to-editable` 不会被这个 profile 领取。

`project-audit-worker` 没有宿主端口，可按需横向扩展。例如下面命令已在本机验证同一 Job 只产生一次 claim 和一次成功工件；演练后应回到正常副本数。远程 MCP API 同样是无 session 的，但生产多副本必须置于受控 HTTPS ingress/LB 后，不能直接将多个 Docker 端口暴露给客户端。

```powershell
docker compose -f deploy/compose.team-infra.yaml -f deploy/compose.team-api.yaml --profile team-infra --profile team-worker-audit up -d --scale project-audit-worker=2
# 演练完成后
docker compose -f deploy/compose.team-infra.yaml -f deploy/compose.team-api.yaml --profile team-infra --profile team-worker-audit up -d --scale project-audit-worker=1
```

## 创建 PPT 归档协议

不含本地文件引用的 `PresentationSpec 1.0` 可继续使用 `application/json`，大小上限 1 MiB。声明 PNG/JPEG 素材或一个用户自有 PPTX 模板时，必须在本地运行 `common-tools ppt archive --input <presentation.json> --out <new.tar.gz>`，并以 `application/gzip`（或 `application/x-gzip`）上传；压缩包上限 100 MiB，安全解压总量上限 64 MiB。

归档固定包含 `ppt-create-archive.json`、`presentation.json`、PresentationSpec 明确声明的素材，以及至多一个明确声明的模板。归档清单记录每个文件的角色、字节数和 SHA-256；Worker 解包后还会使用本地创建链路相同的图片、模板和 PresentationSpec 验证器再次验收。未声明或缺失文件、重复路径、绝对/回退/反斜杠路径、链接、截断、超限、哈希漂移、清单与 spec 不一致，以及包含宏、嵌入对象、签名、外链或未授权来源的模板都会在生成前失败。归档命令只写入新的本地文件，不上传内容、不读取凭据，也不创建团队 Job。

## 图片转可编辑归档协议

本地 CLI / stdio MCP 与团队 Worker 使用不同的受信任输入边界。前者只接收 workspace 内的 PNG、JPG 或 JPEG（单文件不超过 100 MiB，宽高均不超过 16,384 像素，总像素不超过 40,000,000），并且必须显式提供 slideclone 配置；配置中的 `inputDir` 必须等于输入图片目录、`outputDir` 必须等于请求的输出目录。它不会默认选择 OCR、视觉、渲染或质量 Provider。后者**不接收原始图片或该配置文件**，而是使用下述受限归档协议；客户端不能把本地 Provider、脚本或二进制文件带入团队 Worker。

`team-worker-image` 是独立的 OpenXML 引擎镜像，不执行本机 slideclone 的自由 OCR/视觉配置、外部适配器、Office COM 或用户脚本。上传目标与项目审视相同，必须使用 `contentType: application/gzip`（或 `application/x-gzip`），最大压缩包 100 MiB；Worker 仍限制解压后总量 64 MiB、10,000 个普通文件，拒绝链接、PAX、重复文件、回退路径和截断归档。

原始图片 OCR profile 启用后，不要手工制作 TAR。使用下列 CLI 在工作区内将单张图片封装为 Worker 所需的唯一 `assets/source.png|jpg|jpeg` 归档；它会校验 PNG/JPEG 完整性、20 MiB 文件上限、16,384 像素边长和 4,000 万像素上限，拒绝符号链接与覆盖既有输出，并输出上传时需要的 `contentType`、`contentLength` 和 SHA-256：

```powershell
common-tools team raw-image-archive --workspace . --input .\source.png --out .\upload-source.tar.gz
```

For an explicitly ordered multi-page conversion, provide 2–20 workspace-contained PNG/JPEG paths as a comma-separated list. The archive writer assigns contiguous page names and enforces per-page and aggregate byte/pixel limits:

```powershell
common-tools team raw-image-archive --workspace . --inputs .\page-01.png,.\page-02.png --out .\upload-pages.tar.gz
```

PDF 或图片版 PPTX 使用统一来源归档命令；服务端只接受一个受限文档，并以固定 LibreOffice/Poppler 参数规范化为最多 20 页后进入同一 OCR、native-hybrid 重建、残留去重和视觉门禁：

```powershell
common-tools team editable-source-archive --workspace . --input .\source.pdf --out .\upload-source.tar.gz
common-tools team editable-source-archive --workspace . --input .\image-only.pptx --out .\upload-source.tar.gz
```

`raw-image-archive` 保留为兼容命令且继续只接受 PNG/JPEG；新接入应使用 `editable-source-archive`。文档不得与图片批次混合，PDF/PPTX 不得超过 60 MiB，PPTX 在归档前执行受限 OOXML admission，Worker 会渲染第 21 页用于可靠拒绝超页输入。

The Worker processes pages in that declared order, requires a native graphical reconstruction on every page, isolates generated assets per page, and compares every rendered page with its normalized source. `raw-image-batch-validated`, `quality-rendered`, and `visual-fidelity` must pass before describing a batch as visually verified; fidelity metrics are the worst values across the batch. Source images in one batch must resolve to a consistent slide aspect ratio.

将该 JSON 中的 `contentType` / `contentLength` 传给 `create_team_upload_target`，上传生成的 `.tar.gz` 到返回的受限 URL，再将返回的 `inputObjectKey` 与新的幂等键传给 `create_team_job`。本地归档命令不会上传文件、读取 token 或创建团队 Job。

默认的团队图片 Worker 只接受下列 Deck IR 归档：

```text
deck.json                 # version: "1.0" 的受限 Deck IR，最多 50 页、1 MiB
assets/                   # 可选；仅 .bmp/.gif/.jpg/.jpeg/.png/.tiff，单文件最多 20 MiB
```

`deck.json` 中的 `assetPath` 和 `source.pageImage` 必须是包内 `assets/...` 相对路径。模板 PPTX、绝对路径、反斜杠、符号链接、任意文件路径及超大/过深 IR 会被拒绝。Worker 固定调用镜像中的 `/opt/openxml/OpenXmlDeckBuilder`，最长执行 8 分钟，使用 10 分钟 lease；输出唯一为 owner/job scoped `deck.pptx`。

### 可选原始图片 OCR profile（默认关闭）

原始 PNG/JPEG 不是上述默认协议的一部分。只有在图片 Worker 镜像本身包含已审批 Tesseract 和语言包，并且部署系统显式配置了 `tesseract-tsv-v1` 时，归档才可仅包含一个 `assets/source.png`、`assets/source.jpg` 或 `assets/source.jpeg`。压缩包、文件、图像尺寸和像素数仍使用同一组边界；客户端不能传入 OCR 命令、模型路径、语言、脚本或渲染参数。

启用 profile 前，发布流程必须同时满足以下条件：

1. `COMMON_TOOLS_IMAGE_WORKER_IMAGE` 使用含 OCR 二进制和语言包的镜像 **digest**；既有生产预检、release evidence 与可选 Cosign 签名会把该 image digest 纳入证据。
2. 镜像构建阶段对固定二进制执行 `sha256sum /usr/bin/tesseract`，将结果写入已签名的构建/发布记录；部署时只将这个固定值注入 `COMMON_TOOLS_IMAGE_RAW_OCR_SHA256`。Worker 启动时重新计算并比较，任何差异都会失败退出。
3. 显式提供以下非敏感、版本化配置；没有 profile，或只提供其中一部分，Worker 均失败关闭：

```text
COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE=tesseract-tsv-v1
COMMON_TOOLS_IMAGE_RAW_OCR_EXECUTABLE=/usr/bin/tesseract
COMMON_TOOLS_IMAGE_RAW_OCR_SHA256=<64-character lowercase SHA-256 from the signed image build>
COMMON_TOOLS_IMAGE_RAW_OCR_LANGUAGES=eng,chi_sim
```

将这些非敏感字段保存为 release-input JSON（不保存镜像内的模型文件或任何用户图片），然后让 evidence 生成器绑定它；`image` 必须与 `COMMON_TOOLS_IMAGE_WORKER_IMAGE` 的同一 digest 一致：

```json
{
  "name": "tesseract-tsv-v1",
  "image": "registry.example/common-tools/image-worker@sha256:<digest>",
  "executable": "/usr/bin/tesseract",
  "executableSha256": "<64-character lowercase SHA-256>",
  "languages": ["eng", "chi_sim"],
  "license": "Apache-2.0"
}
```

可使用仓库脚本从已构建的本地 OCR 镜像读取实际二进制 hash 与语言包，避免手工抄录。先将镜像推送到组织 registry 并取得最终 digest，再把该 digest 传给 `--image`；脚本不推送镜像、不读取凭据：

```powershell
node .\scripts\generate-image-ocr-release-input.js --runtime-image common-tools-image-to-editable-ocr:local --image registry.example/common-tools/image-worker@sha256:<digest> --output .\release-input\tesseract-tsv-v1.json
```

```powershell
npm run common-tools:release-evidence -- --sbom artifacts/common-tools.spdx.json --output artifacts/common-tools.release.json --revision <git-digest> --image registry.example/common-tools/remote-mcp@sha256:<digest> --image registry.example/common-tools/image-worker@sha256:<digest> --raw-image-ocr-profile .\release-input\tesseract-tsv-v1.json
```

仓库提供可选的 Bookworm OCR Dockerfile，固定 Tesseract `5.3.0-2` 和 `eng`/`chi_sim` 语言包 `1:4.1.0-2`；它**不**是默认 Compose 文件的一部分。先构建并在隔离容器中取得实际二进制 hash，再将最终推送镜像的 digest 与该 hash 写入上面的 release-input：

```powershell
docker build --file deploy/docker/Dockerfile.image-to-editable-ocr --tag common-tools-image-to-editable-ocr:local .
docker run --rm --network none --read-only --user 10001:10001 --entrypoint /bin/sh common-tools-image-to-editable-ocr:local -c 'sha256sum /usr/bin/tesseract; tesseract --list-langs'
```

验证输出中存在 `eng`、`chi_sim` 后，发布该镜像并使用 registry 返回的 `@sha256:` digest。仅在已设置上述四个 OCR 变量、并已生成匹配 release evidence 时，才将 `deploy/compose.team-image-ocr.yaml` 追加到已有 Compose 命令；这个 overlay 不发布宿主端口，也不会改变 API、数据库或对象存储配置。

本机团队版可使用既有部署脚本的 OCR 开关。默认 provider 已切为 PaddleOCR `3.7.0` + PaddlePaddle `3.3.1`，固定使用 PP-OCRv6 中文检测/识别模型、CPU dynamic inference，并在镜像构建时预取模型。Worker 启动时会校验 Python、Node adapter、Python worker、健康检查图片的 SHA-256，并做一次真实 OCR 推理预热；校验或推理失败时 Worker 失败关闭，不会静默退回 Tesseract。

脚本在 `Plan` 模式下只检查本地镜像、版本、文件 hash 与 Compose；`Apply` 才构建 OCR 镜像并滚动当前项目管理的服务。与普通本机部署相同，密码与 OIDC 配置只从当前 PowerShell 进程读取：

```powershell
.\scripts\team-runtime-local-deploy.ps1 -Mode Plan -Project deploy -EnableRawImageOcr
# 确认 Plan 输出后，再执行（会重建相关本机镜像并更新 deploy 项目）
.\scripts\team-runtime-local-deploy.ps1 -Mode Apply -Project deploy -EnableRawImageOcr
```

只有在兼容性排障或明确回退时才选 Tesseract：

```powershell
.\scripts\team-runtime-local-deploy.ps1 -Mode Apply -Project deploy -EnableRawImageOcr -RawImageOcrProvider Tesseract
```

如已有经审核的本地镜像，可在 Apply 时加 `-SkipRawImageOcrBuild -RawImageOcrImage <local-tag>`；脚本仍会按所选 provider 核验镜像。生产环境不能使用这个本机构建路径，必须使用 registry digest、release evidence 和生产预检。

语言只允许 `eng`、`chi_sim`、`chi_tra`、`jpn`、`kor` 的无重复逗号列表。Worker 启动时执行固定的 `tesseract --list-langs` 自检；任何缺失语言包都会停止 Worker。生产预检还会将部署环境的 profile、二进制 hash 和语言列表与已验证 release evidence 中、同一 Worker image 的 profile 精确比对。每个 Job 只会以固定参数调用 `tesseract <image> stdout --psm 3 -l <locked-languages> tsv`，输出最多 1 MiB、运行最多 90 秒，并在取消、超时、非零退出、非法 TSV 或越界文字框时失败。OCR 结果进入固定 native-hybrid 重建器，置信度不足的视觉内容保留为 object-erased residual。

团队 Worker 已接入固定 LibreOffice 最终渲染与像素/前景比较，并同时检查原生图形数量、残留层去重和多格式交付。报告只有在全部门禁通过时才允许 `passed=true`；未知复杂视觉仍会明确保留 residual，因此通过不代表任意像素都已矢量化。

启动图片 Worker（也可与审计 Worker 同时启动）：

```powershell
docker compose -f deploy/compose.team-infra.yaml -f deploy/compose.team-api.yaml --profile team-infra --profile team-worker-image up -d --build
```

它没有宿主端口，可通过 `--scale image-to-editable-worker=2` 横向扩展；由于每个 capability 有自己的 Redis 队列，扩容不会消耗其他能力的消息。

## 运行与灾备演练

当前本机环境已验证 API 多副本、默认两个 capability Worker 的 lease 过期恢复和 Worker 重新启动；隔离 Compose smoke 会启动四类 capability Worker 及 `team-retention` 维护服务，并验证全体服务就绪。它不是备份策略的替代品。上线前必须为 PostgreSQL、对象存储和 IdP 配置独立于容器卷的加密备份，并明确每一类数据的 RPO/RTO。Redis 只保存可恢复 delivery，不应被当作唯一任务事实来源；恢复顺序始终是 PostgreSQL、对象存储、Redis，再启动 API/Worker。

### 任务到期与工件保留

`expiresAt` 到期后，未被 Worker 领取的 `queued` / `input_required` Job 会被标记为 `expired`；已领取的 Job 继续由 lease 和取消状态机收敛，避免维护任务与 Worker 争夺终态。`COMMON_TOOLS_ARTIFACT_RETENTION_DAYS` 默认为 30（范围 1–3650）。到达保留期的终态 Job，维护任务会先验证输入对象属于该 owner 的哈希前缀、验证工件位于同一 Job 的输出前缀，再按精确 object key 删除输入和工件，最后清空 Job 的 artifact 清单并写入 `retention-cleaned` 审计事件。验证或删除任一步失败时不会写入清理标记，下一次执行会安全重试；它绝不枚举 bucket、删除 prefix 或删除仍在运行的 Job。

日常本机和生产 Compose 发布会自动启用独立的 `team-retention` 服务（`team-maintenance` profile）。它先执行一次维护，再每 24 小时顺序执行一次；`SIGTERM` 只中断空闲等待，运行中的一次清理不会被强行并行。任何维护失败都会以非零退出，使 Compose 的 `unless-stopped` 重启策略重试；因此不能把失败吞成“已清理”。`COMMON_TOOLS_RETENTION_INTERVAL_SECONDS` 可在 300–604800 秒范围内调整，默认 86400。`team doctor --runtime` 也会把该服务纳入运行态检查。

仍可在变更窗口或外部平台调度器中手工执行一次性维护。它适用于补跑与诊断，不应替代常驻 profile：

```powershell
$env:COMMON_TOOLS_ARTIFACT_RETENTION_DAYS = "30"
docker compose -f deploy/compose.team-infra.yaml -f deploy/compose.team-api.yaml --profile team-infra --profile team-api run --rm --no-deps remote-mcp node packages/remote-mcp-server/bin/common-tools-team-retention.js
```

可选 `COMMON_TOOLS_RETENTION_BATCH_SIZE` 的范围为 1–1000，默认 100；`COMMON_TOOLS_RETENTION_ACTOR_ID` 只接受 3–128 位安全标识。维护命令和 scheduler 只输出过期/清理数量，不能输出 subject、对象 key、下载 URL 或凭据。

恢复演练只能在隔离 Compose project、独立命名 volume 和隔离 bucket 中进行，严禁在运行中的 `deploy` project 上执行 `DROP`、`FLUSHDB`、volume 删除或 bucket 清空。每次演练至少验证：

1. 从一次 PostgreSQL 备份还原 `capability_jobs` 与 `capability_job_events`，并核对迁移版本和 Job 数量；
2. 还原一个输入对象与成功工件，核对其 SHA-256 和 owner/job prefix；
3. 对还原后过期的 `running` Job 执行 capability-scoped lease 恢复，确认不会移动另一 capability 的 delivery；
4. 在 `/readyz` 为 200 后再接入 API 流量，创建一次受控 Job，记录恢复耗时与数据时间点；
5. 将备份时间、还原耗时、失败 Job 数和 `/readyz` 非 200 事件接入集中告警。原始输入、token、对象 URL、数据库 URL 和 Secret 不得进入日志、指标标签或告警正文。

仓库提供了只验证 PostgreSQL 任务元数据的最小恢复演练，可在正在运行的本机 Docker profile 上执行；它只接受指定 Compose 项目中带 `postgres` service label 的运行容器，把源库导出为临时 custom dump，启动随机命名、无网络、自动删除且不映射端口的 PostgreSQL 容器，还原并核对 Job 数量和迁移摘要，最后删除临时容器、环境文件和 dump。它不修改源数据库、Redis、MinIO、现有 compose volume 或业务 Job：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/team-runtime-postgres-restore-drill.ps1 -Project deploy
```

此脚本只证明 PostgreSQL 元数据可还原；生产演练仍必须独立验证对象存储备份、IdP 配置/密钥恢复、实际 RPO/RTO 和完整 Job 交付。

对象存储连接、跨 bucket copy、源对象删除、从备份还原和 SHA-256 校验可通过下列隔离演练验证。它只创建两个随机 `ct-dr-*` bucket 和 1 KiB 随机内容，不会枚举、读取或修改 `common-tools-artifacts` 中的真实对象；无论成功或失败都会按精确 bucket/key 清理：

```powershell
.\scripts\team-runtime-object-store-restore-drill.ps1 -Mode Plan -Project deploy
.\scripts\team-runtime-object-store-restore-drill.ps1 -Mode Apply -Project deploy -Confirm
```

这同样是传输与完整性演练，不替代跨账户/跨区域的不可变生产备份。

生产告警至少覆盖：连续 `/readyz` 失败、API 5xx/认证失败异常升高、每 capability 的 queued/processing backlog、最老 queued Job 年龄、lease 过期次数、Worker 心跳缺失、对象存储读写失败和备份任务失败。当前 Docker profile 提供就绪探针、可审计的 Job/lease 事件和可选的 Prometheus 指标面；指标采集器、告警路由、OpenTelemetry、受管备份仍属于 I5.3 的部署责任，未由本机 profile 替代。

如需要最小 Prometheus 抓取面，向 API 注入一个 16–512 字符的 URL-safe `COMMON_TOOLS_METRICS_TOKEN`。未设置或空值时 `/metrics` 返回 404；设置后它要求精确的 `Authorization: Bearer <token>`，并输出 `common_tools_jobs`（能力 × 状态）、`common_tools_queue_messages`（ready/processing）、`common_tools_oldest_queued_job_seconds`（每 capability 最老 queued Job 年龄）、`common_tools_lease_recovery_events`（固定 900 秒窗口内的 lease 过期恢复事件）、`common_tools_worker_heartbeat_active`（每 capability 至少一个 Worker 心跳是否存在），以及不含标签的 `common_tools_retention_maintenance_healthy` / `common_tools_retention_last_success_age_seconds`。后两项仅说明维护服务是否在其受限 TTL 内成功完成过一次及其年龄，不携带 subject、项目或对象信息。HTTP 指标只有固定的 `mcp`、`healthz`、`readyz`、`metrics`、`other` route 与 HTTP status 标签；其余指标也只以已注册 capability 和固定窗口为标签，不携带 subject、项目、token、IP、对象 key 或请求内容。HTTP 计数会随 API 副本重启归零，采集系统应在副本级别 scrape 后聚合。Metrics token 必须经 Secret Manager 注入，只允许内部 scraper 访问，不能写入 MCP 客户端、浏览器或日志：

```powershell
$env:COMMON_TOOLS_METRICS_TOKEN = '<random URL-safe secret, at least 16 characters>'
```

`deploy/prometheus/common-tools-alerts.yaml` 提供不包含 Secret 的规则模板，覆盖 API 不可用、MCP 5xx、队列深度、最老 queued Job 超过 15 分钟、processing backlog、15 分钟内 lease 恢复、连续 2 分钟无有效 Worker 心跳，以及 retention maintenance 连续 5 分钟无近期成功记录。指标 `common_tools_worker_heartbeat_active{capability}` 只使用固定 capability 标签，值为 `1` 表示至少一个活跃 Worker、`0` 表示缺失；maintenance 只使用无标签的固定单值。将 scraper 的 `job` 命名为 `common-tools-api`、把 metrics token 放入 Prometheus 的受保护认证配置，并按容量与值班 SLO 调整 `100` queued / `20` processing / `900` 秒阈值后再加载。模板不包含 Alertmanager receiver、Webhook、邮箱或 PagerDuty 配置，避免把组织通知地址和密钥提交到仓库。

`npm run common-tools:verify-observability` 会作为 CI 静态门禁验证这组约束：Prometheus 只能通过 Docker 内网抓取 `remote-mcp:3000` 的 bearer-protected `/metrics`，八类告警必须完整存在，阈值与持续时间必须有界，并拒绝把 token、密码、Webhook、PagerDuty 或邮箱配置混进规则文件。调整阈值后应先运行该命令；组织自己的 Alertmanager receiver 应在受管平台配置，而非改写仓库模板。

仓库还提供可选的 `deploy/compose.team-observability.yaml`：它在同一 Docker 网络中以 `remote-mcp:3000` 抓取 API，不给 API 新增宿主端口；Prometheus UI 只绑定 `127.0.0.1:59090`。Docker 新建 named volume 默认归 root，故 profile 会先运行一次无网络的 `prometheus-volume-init`：它只挂载 `common-tools-prometheus-data`，以 root 的 `CHOWN`/`FOWNER` 两个 capability 将该目录交给 Prometheus UID `65534`，随后退出；Prometheus 本身仍以非 root、只读根文件系统和 `cap_drop: ALL` 启动。将**同一 metrics token** 保存为受保护文件，宿主进程只提供其文件路径，Compose 会同时向 API 和 Prometheus 挂载为 `/run/secrets/common_tools_metrics_token`。不要同时设置非空的 `COMMON_TOOLS_METRICS_TOKEN`；这会被 Runtime 拒绝，防止 scraper 与 API 使用不同凭据：

```powershell
$env:COMMON_TOOLS_METRICS_TOKEN_FILE = 'C:\secure\common-tools\prometheus-metrics-token'
docker compose -f deploy/compose.team-infra.yaml -f deploy/compose.team-api.yaml -f deploy/compose.team-gateway.yaml -f deploy/compose.team-observability.yaml --profile team-infra --profile team-api --profile team-gateway --profile team-observability up -d --build
```

启动后访问 `http://127.0.0.1:59090/targets`，应只看到名称为 `common-tools-api` 的内部 target；Prometheus 数据保存在命名 volume `common-tools-prometheus-data`。这个 profile 是本机/Compose 验证面，不包含 Alertmanager receiver，也不能替代生产平台的受管 scraper、加密持久化、告警路由、SLO 值班与访问控制。

## 只读运行诊断

本机启动后可运行以下命令。它不会读取容器日志、环境变量或密钥，也不会重启、创建或删除任何容器；它只读取 Compose 服务状态，检查基础设施与 API 健康状态，并请求网关的 `/readyz`。默认 `all` scope 适用于本仓库的完整团队能力组合：

```powershell
npm run common-tools:team-doctor
```

如果团队只部署了部分可选 Worker（例如仅 PPT 质量），使用 `core` scope 检查必需基础服务和 MCP API；远程 gateway 则必须显式使用 HTTPS 与 `--allow-remote`：

```powershell
npm run common-tools:team-doctor -- --scope core
npm run common-tools:team-doctor -- --scope core --gateway-url https://mcp.example.com --allow-remote
```

命令输出是不含容器 ID、标签、挂载路径、日志或密钥的 JSON 摘要。任一必需服务未运行/不健康，或 gateway 未返回 `200` 时会以非零状态退出，适合接入部署后门禁。

## 单一穿透地址：跨电脑安装插件

如果服务只由你自己的另一台电脑使用，推荐只让内网穿透工具转发 **一个 HTTPS 地址** 到本机网关 `127.0.0.1:54000`。不要将 PostgreSQL、Redis、MinIO、Keycloak 或任意 Worker 端口加入穿透规则。启用单入口 overlay 后，MinIO 的宿主机 API/Console 端口也会被移除，因此不会与 Windows 保留端口冲突。

```text
另一台电脑的 Codex / Claude
            │ HTTPS: https://mcp.example.test
            ▼
内网穿透（唯一公开入口） → 本机 127.0.0.1:54000 → Docker 网关
                                                     ├─ /mcp、/.well-known/... → Remote MCP
                                                     ├─ /id/...                → Keycloak OAuth
                                                     └─ /common-tools-artifacts/... → 已签名的 MinIO 文件传输
                                                                          └─ PostgreSQL、Redis、Workers（仅 Docker 内网）
```

这里的 `/common-tools-artifacts/...` 不是开放的 MinIO API：网关仅转发已签名 URL 所需的 `GET`、`PUT`、`HEAD`，不提供 MinIO Console，也不会暴露其他 bucket。API 与 Worker 在 Docker 内仍使用 `minio:9000`；只有 API 为外部客户端签发下载/上传 URL 时使用穿透地址。因此另一台电脑只需要一个地址，且不会尝试访问 Docker 服务名或本机端口。

### 首次启用

先在你的穿透工具中创建一条 HTTPS 映射：`https://mcp.example.test` → `http://127.0.0.1:54000`。该示例地址必须替换成真实地址；不要在这里填写 `/mcp`、`/id` 等路径。默认只启用 `image-to-editable,project-audit`；如需 PPT 能力，应在 Plan 和 Apply 中传入完全相同的 `-Capabilities` 集合。再在本机 PowerShell 执行 `Plan`，它只校验 Compose，不会修改正在运行的容器：

```powershell
.\scripts\team-runtime-local-deploy.ps1 -Mode Plan -Project deploy -EnableSingleIngress -SingleIngressPublicUrl https://mcp.example.test
```

例如，以下命令预检全部四项当前能力及其对应 Worker：

```powershell
.\scripts\team-runtime-local-deploy.ps1 -Mode Plan -Project deploy -EnableSingleIngress -SingleIngressPublicUrl https://mcp.example.test -Capabilities image-to-editable,ppt-improve,ppt-quality,project-audit
```

确认 Plan 成功后，才执行 Apply。该步骤会按单入口配置重建 `deploy` 项目管理的 API、网关和 IdP 服务，执行前应保留现有的数据库/对象存储卷：

```powershell
.\scripts\team-runtime-local-deploy.ps1 -Mode Apply -Project deploy -EnableSingleIngress -SingleIngressPublicUrl https://mcp.example.test
```

如果是在新的 PowerShell 窗口运行、没有保留之前的本机密码环境变量，追加 `-PromptForSecrets`。它会在本机隐藏输入 PostgreSQL、Redis、MinIO 与 Keycloak 管理员凭据，仅在当前 PowerShell 进程用于本次部署，脚本结束后清除；不要把这些值写入命令行、`.env` 或聊天记录：

```powershell
.\scripts\team-runtime-local-deploy.ps1 -Mode Apply -Project deploy -EnableSingleIngress -SingleIngressPublicUrl https://mcp.example.test -PromptForSecrets
```

若 Plan 使用了 `-Capabilities`，Apply 必须重复该参数。例如启用全部能力且需要本机输入凭据：

```powershell
.\scripts\team-runtime-local-deploy.ps1 -Mode Apply -Project deploy -EnableSingleIngress -SingleIngressPublicUrl https://mcp.example.test -Capabilities image-to-editable,ppt-improve,ppt-quality,project-audit -PromptForSecrets
```

单入口 Apply 在服务健康后会同步 Keycloak 的 `common-tools-mcp` 公共客户端：它只允许原生 OAuth 的 `127.0.0.1` loopback 回调，保留 Keycloak 的随机端口规则，并用末尾 wildcard 仅覆盖该 IP 上 Codex 生成的动态本机回调路径（仍强制 PKCE S256）；它不允许任何非 loopback host。同时会强制 Keycloak 在授权回调中保留 `iss` 参数，这是 Codex 用来验证 IdP 的必需项。同步前会在 `artifacts/keycloak-mcp-client-backups/` 写入不含密钥的旧回调白名单与 issuer 设置快照。同步后，脚本会对这个公开 HTTPS 地址执行 `team-runtime-doctor`：验证 `/readyz`、目标能力 metadata、未认证 MCP 的 Bearer challenge 和原生回调，而不是仅凭本机网关端口成功就交付安装包。该步骤解决另一台 Codex/Claude 电脑的浏览器登录回跳；它不修改用户、项目、数据库、对象存储或 Keycloak 管理员密码。已有单入口部署在更新本项目文件后重新执行一次同样的 Apply 即可完成同步与公网验收。

脚本从这个**一个** URL 派生 MCP public URL、Keycloak issuer (`/id/realms/common-tools`)、内部 JWKS URL 和对象存储公开签名 origin。它拒绝 HTTP、含路径、查询串、片段或内嵌凭据的地址，避免把错误的穿透地址写入运行配置。Keycloak 在单入口模式使用 `/id` 相对路径、严格 hostname 和 `X-Forwarded-*` 代理头；这符合其反向代理与相对路径配置要求。[Keycloak 反向代理说明](https://www.keycloak.org/server/reverseproxy)

单入口网关会在启动时从该 URL 提取并固定公网 authority，用于转发 `common-tools-artifacts` 的预签名 `PUT`/`GET`。这是 S3 SigV4 的必要条件：不少内网穿透工具把抵达本机的 `Host` 改写为 `127.0.0.1:<port>`，若把该值继续转给 MinIO，签名会返回 `403 SignatureDoesNotMatch`。因此穿透工具无需额外暴露 MinIO；只需将 HTTPS 流量转到 MCP 网关。变更穿透域名后必须重新执行单入口 Apply，使网关重新渲染该 authority。

当前 Codex CLI `0.143` 至 `0.146` 存在 RFC 9207 回调回归：它会丢弃 Keycloak 正确回传的 `iss`，但又因 discovery 宣告该参数而拒绝登录。单入口 Nginx 仅对公开的 Keycloak discovery 文档把 `authorization_response_iss_parameter_supported` 改写为 `false`；Keycloak 实际授权回调仍保留 `iss`，OAuth 授权码 + S256 PKCE 和 token 的 issuer 校验都不变。该兼容层应在 Codex 修复回调处理后移除，不能用于隐藏 IdP issuer 配置错误。

部署后先做只读检查；成功时再从另一台电脑安装插件：

```powershell
npm run common-tools:team-doctor -- --scope core --gateway-url https://mcp.example.test --allow-remote --expected-capabilities image-to-editable,project-audit
node .\scripts\generate-remote-plugin-bundles.js --origin https://mcp.example.test --output .\artifacts\common-tools-remote-plugin --capabilities image-to-editable,project-audit
```

`--expected-capabilities` 令 doctor 读取 OAuth protected-resource metadata 并确认每一项准备打包的能力都已由公网 MCP 宣告；缺少、格式异常或网关未响应都会使验收失败。它检查的是“目标能力可用”，因此公网服务额外启用了其他能力时不会阻止生成一个最小化插件包。对 HTTPS 远程入口，doctor 还会向 `/mcp` 发送无凭据探测，并要求返回 `401 Bearer` 及与当前 origin 一致的 `resource_metadata`；随后以同源 Keycloak issuer 校验 `common-tools-mcp` 是否接受 Codex 实际使用的随机端口和 `/callback/...` 路径的 `127.0.0.1` 原生 loopback 回调。这验证了客户端能进入 OAuth 发现和回跳流程，且不会输出响应正文、令牌或凭据。

若 `nativeLoopbackRedirect.verified` 为 `false`，说明当前运行中的 Keycloak realm 仍保留旧的客户端 redirect URI；这通常发生在 realm 已被首次导入后才更新本项目文件。优先使用只同步 Keycloak 客户端的轻量脚本：

```powershell
.\scripts\team-keycloak-mcp-client-sync.ps1 -Project deploy -PromptForAdmin
```

它只提示 Keycloak 管理员用户名和密码，获取项目操作锁后备份旧的回调白名单、issuer 设置与 scope 绑定，并仅把 `common-tools-mcp` 公共客户端收敛为原生 loopback 回调、保留授权回调的 `iss`、关联 `offline_access` 和各 capability 的 optional client scope；不会重建容器，也不会删除数据库、MinIO 对象、Keycloak 用户或管理员密码。这样可兼容 Codex 根据 OIDC discovery 自动请求的 scopes。若 Keycloak 映射端口不是默认的 `58080`，追加 `-KeycloakPort <端口>`。完成后重新执行 doctor，只有 `nativeLoopbackRedirect.verified: true` 时才将安装包交给另一台电脑。全量单入口 Apply 仍会自动执行相同同步，适用于需要同时升级运行时的场景。

若同步脚本返回 `Keycloak request failed`，并且 Keycloak 日志显示 master realm 的 `user_not_found`，说明最初创建持久卷时没有管理员账户；已有 master realm 时，启动环境变量不会再补建管理员。使用以下恢复脚本：

```powershell
.\scripts\team-keycloak-recovery-admin.ps1 -Project deploy -PromptForPassword
```

它会要求确认，短暂停止**唯一的 Keycloak 容器**，只挂载其 `/opt/keycloak/data` 命名卷创建临时 `recovery-admin`，重启原容器并自动执行 MCP 回调同步；它不删除或重新导入 realm、用户、数据库或 MinIO 数据。临时管理员会保留，以避免再次锁死管理入口；登录 Keycloak 管理控制台创建一个常规管理员后，再按 Keycloak 管理流程移除该临时恢复账户。可用 `-RecoveryAdminUsername <name>` 修改临时账户名，且密码只在当前进程中使用并在脚本结束时清除。 [Keycloak 官方恢复说明](https://www.keycloak.org/server/bootstrap-admin-recovery)

生成目录包含两个独立的**本地 Marketplace 根目录**：`codex` 与 `claude`。它们各自包含 marketplace 描述及 `plugins/common-tools-remote` 安装包；复制整个对应目录到另一台电脑，而不是只复制内部插件文件夹。默认 `bundle` 布局把所选能力放进一个统一插件，并提供一个 `common-tools` 能力路由 Skill 和每项能力各自的可见 Skill；它们均以当前会话中实际可见的 MCP 工具为准，未被选择、授权或部署的能力会明确停止，不会显示为独立插件或擅自扩大权限。`install.ps1` 会以稳定数字编码列出能力：`1` 图片转可编辑、`2` PPT 改善、`3` PPT 质量审计、`4` 项目审计，`0` 表示包内全部；用户可输入如 `1,4`。能力名称仍兼容，便于自动化。Codex 会按选择申请相应 OAuth scope，统一插件只登记一个全局 `common-tools` MCP 地址。也可用 `-Capabilities 1,4` 或 `-Capabilities project-audit,image-to-editable` 静默选择，或用 `-AllCapabilities` 安装包内的全部能力。远程 Skill 不依赖另一台电脑安装本机 CLI：它会要求 Host 使用 `create_team_upload_target` 取得短期 PUT 地址、上传精确且已获批准的文件、用 `create_team_job` 创建作业、用 `get_team_job` 轮询，完成后再通过 `get_team_artifact_target` 获取短期下载地址。`--capabilities` 是生成器的必填参数，防止意外打包所有 Skill。插件能力集必须和实际部署一致：默认部署使用 `image-to-editable,project-audit`；若刚刚部署了四项能力，生成包时也传 `--capabilities image-to-editable,ppt-improve,ppt-quality,project-audit`。Claude 包在插件内声明固定为 `https://mcp.example.test/mcp` 的 HTTP MCP 配置；Codex 包改由安装脚本用 Codex CLI 注册唯一的全局 `common-tools` MCP 服务，并显式绑定公开 OAuth client，避免不同 Codex Desktop 版本未自动加载插件 MCP 配置。安装后客户端会按 MCP OAuth metadata 打开 Keycloak 登录，不需要在插件中保存数据库密码、MinIO 密码或静态访问令牌。地址变化时，重新生成一个新目录；生成器拒绝覆盖已有目录，避免无意修改已安装的包。

### 推荐交付：一个插件，多个能力

团队默认应使用 `bundle`，而不是 `split`。无论安装了多少能力，Codex Desktop 的预期结果都应是 **一个** `Common Tools Remote` 插件，以及 **一个**名为 `common-tools` 的全局 MCP 服务；图片转可编辑、项目审计等是该插件内部可选能力，不是额外的插件条目。为便于在插件页审阅，统一插件会显示一个总览/路由 Skill、一个 `common-tools-help` 中文帮助与导航 Skill，以及每项能力各自的 Skill，例如 `common-tools`、`image-to-editable`、`project-audit`；它们仍共享同一个 MCP。插件同时携带 `docs/zh-CN/README.md` 中文说明索引和各能力中文页；用户可直接询问“怎么用”“项目审计说明”等，由帮助 Skill 导航到对应说明，不会触发上传或执行任务。能力选择只决定 OAuth scope 和路由可见性：例如 `-Capabilities 1,4` 会在同一个插件中启用图片转可编辑和项目审计；请求未选择的能力时，路由 Skill 会明确提示“未选择、未授权或未部署”，不会擅自扩大权限或改用其他能力。

如需改变已安装统一插件的能力集合，重新运行同一包的 `install.ps1 -Capabilities <编码>` 即可；不必新装一个插件，也不应手动登记第二个 MCP 服务。安装完成后可用下面的只读检查确认“一个插件 + 一个 MCP”：

```powershell
codex plugin list --json
codex mcp get common-tools --json
```

前者中 `common-tools-remote` 应只出现一次，后者应显示 `https://<公开域名>/mcp`。看到 `Common Tools: image-to-editable` 与 `Common Tools: project-audit` 等多个条目，表示仍保留了早期 `split` 包，而不是当前统一包的正常结果。

若希望用户只安装一种能力，追加 `--layout split`。它会在同一个 Marketplace 中分别生成 `common-tools-remote-image-to-editable`、`common-tools-remote-project-audit` 等插件；每个插件只携带自己的 Skill。Claude 的插件各自声明独立命名的 MCP 配置；Codex 的安装器只注册一次共享的全局 `common-tools` 服务，所有已安装的能力 Skill 都通过它调用。例：

```powershell
node .\scripts\generate-remote-plugin-bundles.js --origin https://mcp.example.test --output .\artifacts\common-tools-remote-plugin-split --capabilities image-to-editable,project-audit --layout split
```

在另一台 Codex 电脑中，先从复制后的 `codex` 根目录添加 Marketplace，再仅安装审计插件：

```powershell
codex plugin marketplace add .
codex plugin add common-tools-remote-project-audit@common-tools-remote
```

Claude Code 的对应命令是 `claude plugin marketplace add .` 与 `claude plugin install common-tools-remote-project-audit@common-tools-remote`。多个 split 插件仍调用同一个公网 MCP 服务，不会复制服务端 Worker 或数据；Claude 客户端会维护多个 MCP 配置，Codex 则复用一个全局 MCP 配置，因此通常只安装确有需要的能力插件。目录根部的 `INSTALL.md` 会列出该包中可选的所有插件。

每个生成的 `codex` 与 `claude` 根目录还包含 `install.ps1`，方便 Windows 上直接安装。拆分包只装审计能力的示例：

```powershell
.\install.ps1 -Capabilities 4
```

省略 `-Capabilities` 时，无论一体化还是拆分包都会交互式要求选择能力；传入 `-AllCapabilities` 才会选择包内全部能力。两个安装器都会先调用根目录的 `verify-connection.ps1`：它以 8 秒超时、16 KiB 响应上限检查固定 HTTPS origin 的 `/readyz` 与 OAuth protected-resource metadata，确认所选 capability scope 已被服务端宣告；它不读取登录凭据、令牌、Docker 配置或业务数据。可在服务升级后单独重跑 `.\verify-connection.ps1 -Capabilities project-audit`，先分辨“服务或能力未就绪”和“客户端 OAuth 未登录”。Claude 安装器随后只调用 Marketplace/插件安装命令。Codex 安装器还会安全地检查或注册名为 `common-tools` 的本机 MCP 配置（只接受包内的固定 HTTPS URL），显式使用 `common-tools-mcp` public OAuth client。无论首次注册还是复用正确配置，安装器都会先注销可能失效的 Common Tools OAuth 会话，再显式执行一次登录，并申请 `offline_access` 与所选 capability scope；这样既避免保留失效的刷新凭据，也允许正常访问令牌过期后刷新。安装器还会读取同名 Marketplace 的本地 manifest：只有确认其为旧版 Common Tools 本地 Marketplace 时才替换来源，并自动移除该 Marketplace 下已安装的旧拆分能力插件后安装统一插件；同名但无法验证的第三方来源会停止而不覆盖。受保护资源地址由 MCP metadata 自动发现，安装器不会重复写入静态 `resource` 参数。若检测到同一 HTTPS origin 的早期根路径或 `/mcp` 配置、或早期静态 resource 配置，安装器只移除并重建这个同名 MCP 配置，再重新授权；不同 origin 或非预期路径仍会停止而不覆盖。授权成功后必须完全关闭并重新打开 Codex，并新建任务加载新的工具清单。

在另一台电脑安装时，先复制匹配宿主的目录。Codex 请优先运行目录根部的 `install.ps1`，因为只执行 `codex plugin marketplace add` / `codex plugin add` 不会保证 Desktop 已注册远程 MCP；脚本会启动一次 OAuth 登录。Claude Code 可使用 `claude plugin marketplace add <复制后的 claude 目录>`，再执行 `claude plugin install common-tools-remote@common-tools-remote`。完成后新开一个会话；可用 `codex mcp get common-tools --json` 确认 Codex 服务已注册。不要把本机数据库、MinIO 或 Keycloak 管理员密码复制到另一台电脑。

统一安装器会在确认同名 Marketplace 的本地 manifest 是 Common Tools 后，自动替换旧来源，并只移除该 Marketplace 下已安装的旧统一/拆分 Common Tools 插件，然后安装唯一的统一插件；不会删除远程作业、服务器数据、其他 Marketplace 或其他插件。若遇到同名但无法验证的 Marketplace，安装器会停止，要求人工确认，而不会覆盖可能属于其他项目的来源。不要为了更新插件移除 `common-tools` MCP：安装器会复用同一 HTTPS URL 的现有配置，并仅在需要时更新 OAuth 登录。

单入口模式固定对象存储 bucket 为 `common-tools-artifacts`，这是网关可精确收敛公开路由的安全边界。若未来需要多个 bucket、第三方 S3 或公开团队服务，应改为受管网关/对象存储方案，而不是扩大此本机穿透规则。
# Common Tools 团队 Docker 部署

> 本机/远程路由与 Local Runtime 安装边界见 [执行模式与本地 Runtime](./execution-modes.md)。团队 Docker 服务只承担远程 MCP 与 Worker；本机 `project-audit` 不需要默认上传到本服务。
