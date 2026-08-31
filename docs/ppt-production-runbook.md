# PPT 自用服务生产发布与回滚手册

本手册对应 [PPT 路线图](./ppt-roadmap.md)，服务入口为 `https://plugins.iepose.cn`。它是操作流程，不是生产授权或演练成功证明。当前尚未取得本次生产部署授权、实际回滚联系人和真实用户模板验收记录；这些缺口未补齐前不得执行 Apply、线上身份同步或生产恢复。

命令以仓库根目录为工作目录。详细配置见 [团队部署文档](./team-docker-deployment.md)；发布器为 [`team-runtime-production-deploy.ps1`](../scripts/team-runtime-production-deploy.ps1)。不要把本机 fresh-reset、infra/IdP Compose 或本机卷演练直接用于生产。

## 1. 变更前必须确认

在受管变更记录中填写实际负责人、联系方式和访问方式。仓库及公开验收报告只保留角色和非敏感记录编号，不存储电话号码、内部管理地址、Webhook 或凭据。

| 角色 | 必须确认的责任 | 当前状态 |
| --- | --- | --- |
| 服务所有者 | 批准目标环境、变更窗口、启用能力、验收设备及用户模板 | 待所有者确认 |
| 发布与回滚执行人 | 能访问受管部署平台，能摘流并恢复上一组已验证镜像 | 待所有者指定 |
| 身份系统负责人 | 封闭 realm 策略、会话撤销、账号和密钥恢复 | 待所有者指定 |
| 数据恢复负责人 | PostgreSQL、对象存储及 IdP 的备份、兼容性与恢复点验证 | 待所有者指定 |
| 验收与告警接收人 | 执行授权设备 canary，确认告警送达并决定是否恢复流量 | 待所有者指定 |

自用服务允许同一所有者承担多个角色，但不能以“默认有人处理”代替确认。执行人不可联系、权限不足或目标项目不明确时停止变更。

每次变更还须具备以下材料；任何一项缺失都不能仅凭 CI 绿色发布：

- 候选精确 Git revision、对应已通过的 CI、SBOM、release evidence，以及实际启用服务的不可变镜像 digest；需要签名的发布链还须验证 evidence 和镜像签名。
- 当前部署与上一可回滚部署的同类材料、能力 allowlist、迁移版本和受管配置版本。`v0.1.15` 是源码发布基线，不自动证明与当前生产数据兼容。
- 已验证的数据库、对象存储与 IdP 备份恢复点，以及每类数据经所有者认可的 RPO/RTO。只存在 Docker volume 不算备份。
- 实际 Compose project、部署主机/平台、受管 HTTPS ingress、Secret 注入方式、告警接收器及其测试送达记录。
- 所有者授权的干净客户端设备、可用于验收的输入和真实 PPTX 模板；仓库模拟模板不能替代用户模板远程 canary。

## 2. 预检与发布

使用与候选 revision 对应的不可变发布包或独立 checkout，不覆盖现有工作区、不用未提交源码临时构建生产镜像。镜像必须已由受控 CI 构建，配置来源由受管平台注入；不要输出环境变量、Compose 的完整解析结果或容器环境。

1. 固定 `COMMON_TOOLS_REMOTE_IMAGE`；启用 `image-to-editable` 或 `ppt-create` 时还要固定 `COMMON_TOOLS_IMAGE_WORKER_IMAGE`。release evidence 的镜像集合必须与实际启用集合完全一致，不使用 `latest` 或可移动 tag。
2. 注入已批准的 `COMMON_TOOLS_TEAM_CAPABILITIES`、HTTPS/OIDC、受管后端及 Secret 配置。直接凭据与同名 `*_FILE` 不可并用；按发布策略提供签名配置，禁止为了通过预检关闭签名要求。
3. 在受保护位置准备同目录 SBOM、release evidence 及必要签名材料，先复验证据：

```powershell
npm run common-tools:verify-release-evidence -- --sbom C:\release\common-tools.spdx.json --manifest C:\release\common-tools.release.json
```

4. 将 `COMMON_TOOLS_RELEASE_EVIDENCE_FILE` 指向该受保护 evidence 文件，运行 Plan。下方 `common-tools` 是项目示例，必须与已确认的实际项目一致：

```powershell
$env:COMMON_TOOLS_RELEASE_EVIDENCE_FILE = 'C:\release\common-tools.release.json'
.\scripts\team-runtime-production-deploy.ps1 -Mode Plan -Project common-tools
```

Plan 会检查 Docker、release evidence、生产 Compose、OIDC discovery 和能力部署计划，不拉取镜像、不修改容器；它仍需要正确的受管配置和网络可达性。核对输出的 revision、镜像、能力与签名状态。预检失败就停止，不改用手写 Compose 绕过。

5. 经所有者批准后，在受管 ingress 停止新任务流入，按平台流程等待或受控取消在途任务并确认 Worker 收敛。不可清空队列或把仍有活跃 Job 的能力直接移出 allowlist。记录切换前任务数量，不记录 Job 内容或对象 key。
6. 仅在批准的变更窗口执行 Apply；本脚本的 Apply 不额外弹出授权确认，不能把命令可执行误当作获得批准：

```powershell
.\scripts\team-runtime-production-deploy.ps1 -Mode Apply -Project common-tools -WaitTimeoutSeconds 300
```

发布器保留迁移门禁并使用 `--no-build --wait`。不加 `--no-deps`，不重建生产 IdP，不以删除数据卷解决启动问题。退出非零或等待失败时停止后续开放流量操作；不得单纯反复 Apply 来掩盖迁移、凭据或就绪故障。

## 3. 发布后的放行条件

容器启动成功不是业务验收成功。保持对普通流量的隔离，仅通过批准的验收路径完成：

1. 核对实际部署 revision、每个服务的镜像 digest 和能力集合，必须与批准记录一致；API 不直接发布宿主端口。
2. 确认生产 `/healthz` 仅为 `{"status":"ok"}`，`/readyz` 为 200；ingress 使用 readiness 控制接流。
3. 按 [路线图中的身份同步与负向 canary](./ppt-roadmap.md#可重复验收命令) 核验封闭身份、audience、scope、禁用能力与失败保护。客户端同步必须将 `common-tools-mcp` 的 `pkce.code.challenge.method` 固定为 `S256` 并回读验证，缺失或其他值均视为配置漂移；写入失败或回读不匹配必须停止发布。仅 discovery 声明支持 S256 或预先签发 token 的 canary 通过，不能证明客户端强制 PKCE。线上同步本身属于受授权变更；保存脱敏同步结果，并在真实授权流程中验证无 PKCE/`plain` 被拒绝、S256 成功；短期测试 token 由受管配置注入，结束后撤销测试会话。
4. 从授权设备完成图片上传、Job、下载、PPTX 校验和精确清理；若批准启用 `ppt-create`，分别验证 JSON Spec、素材归档及所有者真实模板归档。另验证固定安装包/引用的干净设备安装，不依赖仓库 clone 或未声明 Runtime。
5. 确认每个启用能力的 Worker 心跳、maintenance、backlog 和错误指标正常，受管告警接收器能收到测试告警并有确认记录。
6. 所有检查通过且所有者确认后才逐步恢复流量，记录 UTC 时间和观察结果；任何一步失败都不写“发布成功”。

负向检查的命令为 `npm run canary:remote-access-negative`，所需配置及安全边界以路线图为准。此命令不能代替正向图片/PPT 创建、干净设备安装或完整业务交付验收。

## 4. 回滚决策与执行

持续 readiness 失败、发布后错误率异常、必需 Worker 缺失或正负 canary 不符合预期时，由已指定执行人与所有者按批准的观察窗口决定回滚。身份绕过、跨所有者访问或疑似凭据泄露应立即隔离受影响入口并升级给身份/服务负责人，不通过放宽认证、RBAC、scope 或日志限制恢复服务。

先区分恢复方式：

| 情况 | 允许的下一步 | 停止条件 |
| --- | --- | --- |
| 应用版本回退，现有 schema 与旧版本兼容 | 恢复上一组已验证 digest、配置及允许的能力集合 | 无兼容性证明、旧签名失效或旧版缺少必需安全修复 |
| 已发生不兼容迁移、数据损坏或需回退数据时间点 | 转入隔离恢复演练，由数据负责人批准切换 | 没有一致恢复点、RPO/RTO 未批准或真实恢复未验证 |
| Secret/身份可能被攻破 | 受管撤销与轮换、审计授权边界后再部署 | 单靠旧镜像不能消除泄露，禁止恢复已撤销 Secret 或宽松 realm 策略 |

应用回滚顺序：

1. 在受管 ingress 摘流并暂停新任务；核对在途任务、Worker lease 和能力队列，不删除或跨能力重投消息。
2. 选择受管记录中上一组完整、签名有效且与现有迁移版本兼容的发布材料。使用对应 revision 的发布包/独立 checkout，不能把旧 evidence 与新 lockfile 混用，也不能修改已应用迁移的摘要。
3. 将受管镜像与配置恢复为该组批准值，保留当前必须的身份和安全约束；重新执行第 2 节的 evidence 验证及 Plan。若失败，停止并升级，不绕过迁移或安全校验。
4. 所有者确认本次回滚后，用同一生产发布器 Apply；该操作只负责部署，不会自动倒退数据库迁移、还原对象存储或恢复 Keycloak 配置。
5. 完整重复第 3 节的放行条件，再恢复流量。回滚失败时继续隔离，保留原数据并进入批准的恢复流程，不连续尝试未经验证的历史版本。

## 5. 数据恢复与告警闭环

恢复必须使用隔离环境、独立数据目标及批准的备份集。先验证 PostgreSQL 与对象存储恢复的一致时间点、迁移摘要、任务数量和受控对象哈希；验证 IdP 的配置、密钥和封闭访问策略；再恢复或重建可重复投递的 Redis 通知，最后启动 API、Worker 和 maintenance。Redis 不是任务事实来源，不以恢复队列替代恢复数据库。

完整恢复还须验证 capability-scoped lease 恢复、重复投递幂等、所有者/项目隔离和一次真实 Job 交付。核对实际 RPO/RTO 后，经所有者批准才能把流量切换到恢复环境。禁止在当前生产库/卷/bucket 上执行演练性删除、`FLUSHDB` 或覆盖还原；确需生产数据切换必须另有明确目标和批准记录。

已有 [备份与恢复说明](./team-docker-deployment.md#运行与灾备演练) 及本机 PostgreSQL、对象存储、Keycloak 演练脚本可用于隔离验证，但不能直接作为生产恢复成功证据。生产备份仍须加密、独立于容器卷，并按实际平台验证还原能力。

告警规则见 [`common-tools-alerts.yaml`](../deploy/prometheus/common-tools-alerts.yaml)，配置门禁为 `npm run common-tools:verify-observability`。Webhook、邮箱、接收人和认证材料只在受管平台配置；至少验证 readiness、Worker 心跳、积压/lease、maintenance 与备份失败告警的送达和确认。规则文件通过静态校验不等于接收器已接通。

## 6. 证据与结束条件

受管变更记录保存实际联系人、部署目标和恢复材料引用；提交仓库的脱敏摘要只允许记录：变更编号、角色、UTC 时间、精确 revision、镜像 digest、能力集合、各检查通过/失败、数量、耗时、哈希及批准状态。不得附 token、cookie、headers、Secret 文件内容/私有路径、用户内容、对象 key/URL 或原始服务日志。

发布/回滚/恢复结果必须分别记录，不能用“回滚通过”覆盖一次失败发布。真实模板 canary、设备安装、备份恢复、告警送达和联系人确认全部具备可重复证据后，才更新路线图对应项为“已完成”。本手册的存在本身不完成“自用运维闭环”。
