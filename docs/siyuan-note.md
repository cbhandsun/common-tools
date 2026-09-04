# 思源笔记能力

`siyuan-note` 是现有 Common Tools Streamable HTTP MCP 端点上的直连能力，不会增加新的公网端口或域名。获得授权的客户端与其他托管能力共用同一个 `/mcp` 地址和 OAuth 客户端。

## 服务端配置

在 `COMMON_TOOLS_TEAM_CAPABILITIES` 中启用 `siyuan-note`，然后只在服务宿主机配置以下项目：

- `COMMON_TOOLS_SIYUAN_URL`：HTTPS 源站地址，或获准使用的内部 HTTP 地址：`127.0.0.1`、`localhost`、`host.docker.internal`、`siyuan`。
- `COMMON_TOOLS_SIYUAN_TOKEN` 或 `COMMON_TOOLS_SIYUAN_TOKEN_FILE`：思源 API Token。禁止把它写入插件或客户端配置。
- `COMMON_TOOLS_SIYUAN_INBOX_PATH`：Agent 创建笔记时使用的可选根路径，默认为 `/Agent Inbox`。
- `COMMON_TOOLS_SIYUAN_TIMEOUT_MS`：可选请求超时时间，范围为 1000～30000 毫秒。

使用 Docker Desktop 时，基础 Compose 文件会为 API 容器映射 `host.docker.internal`。在 Linux 或托管生产主机上，应配置一个明确可达的思源 HTTPS 源站，或获准使用的私有服务名。

使用密钥文件部署时，在常规生产密钥覆盖文件之后追加 `deploy/compose.team-siyuan-secret.yaml`，并把 `COMMON_TOOLS_SIYUAN_TOKEN_FILE` 设置为宿主机上的密钥文件路径。该覆盖文件刻意保持独立，因此未启用思源的部署不需要提供此密钥。

## 安全边界

该能力只开放以下操作：列出笔记本、在收件箱路径下创建笔记、追加内容、受限搜索和受限 Markdown 读取。它不开放删除、任意 SQL、任意思源 API、文件系统访问或凭据访问。写入操作必须提供由 Redis 保存、按所有者隔离的幂等键。搜索和读取结果都会被标记为不可信数据。

## 客户端授权与恢复

安装后的新任务应至少能看到 `siyuan_list_notebooks`。如果一个 `siyuan_*` 工具都没有，这是当前 Codex 任务没有加载 Common Tools MCP 授权工具，不能据此判断思源服务端未启动。安装客户端应申请 `offline_access` 和 `common-tools:capability:siyuan-note`，使正常过期的访问令牌可以刷新。

旧刷新凭据已失效、管理员撤销会话或登录策略改变时，在安装插件的电脑上执行：

```powershell
codex mcp get common-tools --json
codex mcp logout common-tools
codex mcp login common-tools --scopes offline_access,common-tools:capability:siyuan-note
```

如果 `get` 显示配置不存在，先执行：

```powershell
codex mcp add common-tools --url https://plugins.iepose.cn/mcp --oauth-client-id common-tools-mcp
```

完成浏览器授权后，必须完全关闭并重新打开 Codex，再新建任务确认 `siyuan_list_notebooks` 已出现。客户端不需要也不应获得思源 API Token、Keycloak 管理员账号或 Docker 内部地址。
