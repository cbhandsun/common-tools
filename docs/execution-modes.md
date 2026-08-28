# Common Tools 执行模式与本地 Runtime

## 目标

Common Tools 将“用户入口”和“实际执行”分离：一个统一插件提供能力说明、自然语言路由和中文导航；本机 Runtime 承担本地执行；远程 MCP 承担需要团队服务、共享存储或较重运行环境的任务。插件安装本身不应隐式下载、链接或执行本机代码。

这避免了开发仓库、`npm link`、`node_modules`、PATH 和远程 OAuth 被混在同一安装动作中，也让用户能清楚知道代码是否会离开电脑。

## 组件边界

| 组件 | 职责 | 持久化位置 | 是否上传项目内容 |
| --- | --- | --- | --- |
| `Common Tools` 插件 | 技能、中文说明、能力导航、自然语言约束 | Codex/Claude 插件缓存 | 否 |
| Local Runtime | `common-tools` CLI、本机审计与本机状态 | Windows: `%LOCALAPPDATA%\CommonTools\local-runtime\<version>` | 否 |
| Remote MCP | 远程任务、异机使用、团队 Worker 与产物下载 | 部署主机 | 仅在用户明确选择远程作业后 |

本机 Runtime 与远程 MCP 复用同一能力契约和核心模块，不维护两套不同的项目审计实现。

## 执行模式

安装器在选择能力后要求选择执行模式；自动化安装可用 `-ExecutionMode` 指定。

| 模式 | 行为 | 适用场景 |
| --- | --- | --- |
| `local-preferred`（推荐） | 为已选择、支持本机的能力安装 Local Runtime；`project-audit` 默认在本机运行；仅远程能力继续使用 MCP。 | 日常开发、源码不应默认离机。 |
| `remote-only` | 不安装 Local Runtime；所选能力全部走远程 MCP 和 OAuth。 | 另一台电脑、统一团队 Worker、无需本机处理。 |
| `local-only` | 安装 Local Runtime，但拒绝当前不能本机执行的能力，也不配置或授权远程执行。 | 高敏感项目、离线审计。 |

当前本机支持能力：

- `project-audit`：本机只读代码审计、显式门禁、显式浏览器体验证据。

当前远程优先能力：

- `image-to-editable`：图片转可编辑产物；依赖较重的转换、字体、渲染和 Worker 环境。
- `ppt-quality`、`ppt-improve`：完整 Runtime 已提供本机同步/Job 模式，也可使用远程 Worker；稀疏 Marketplace 本身不包含本机执行引擎，因此必须以 `runtime resolve` 的实际结果决定执行位置。

因此，`local-only` 不能与这些远程优先能力同时安装；安装器会停止并列出冲突能力，而不会静默降级或上传数据。

## 安装与升级

生成的安装包包含经 SHA-256 清单校验的 Local Runtime payload。用户选择 `local-preferred` 或 `local-only` 且选中了 `project-audit` 时，安装器会：

1. 检查 Node.js 18 或更高版本；
2. 校验 payload 内每个文件的哈希；
3. 复制到版本目录，不覆盖未知或不受管理的 Runtime；
4. 创建受管理的 `common-tools.cmd` 命令 shim；
5. 仅在缺少时把该 shim 目录加入用户级 PATH；
6. 在 `%LOCALAPPDATA%\CommonTools\runtime.json` 写入非敏感执行策略。

安装器不会：

- 使用 `npm link`；
- 修改机器级 PATH 或要求管理员权限；
- 读取、写入或显示密码、令牌、Keycloak 管理员凭据；
- 在普通本机审计请求中上传源码。

新终端可直接运行：

```powershell
common-tools runtime status
common-tools runtime resolve --capability project-audit
```

如果 Runtime 未安装，普通“审计当前项目”请求必须提示安装本机 Runtime；只有用户明确要求“远程审计”“团队审计”“集中留存”时才能使用远程上传流程。

## 自然语言路由规则

插件 Skill 先确定能力，再读取运行策略。

```text
“审计当前项目”
  -> project-audit
  -> common-tools runtime resolve --capability project-audit
  -> local-preferred/local-only: 本机 `enhanced` 四域只读审计
  -> remote-only: 提示并使用远程 MCP

“团队远程审计当前项目”
  -> project-audit
  -> 明确远程意图
  -> 策略允许时，创建一次性上传地址、创建 Job、轮询、下载产物

“将图片转为可编辑 PPT”
  -> image-to-editable
  -> 当前为远程 MCP 能力
```

自然语言不会自动授予以下高风险动作：运行项目门禁、启动浏览器、收集浏览器证据、上传归档、扩大 OAuth scope。`project-audit` 的 `gates`、`experience`、`full` 模式仍需要原有的显式授权。

## 诊断与兼容性

`common-tools runtime status` 输出当前策略和各能力的路由，不输出凭据。`common-tools runtime resolve --capability <id> [--execution local|remote]` 用于在执行前获得可解释决策。

远程 MCP 继续保留一个 `common-tools` 服务入口。OAuth 只在存在需要远程执行的所选能力时发起；本机项目审计不需要 OAuth。MCP 服务端仍以实际可见工具、OAuth scope 和已部署 Worker 作为远程能力的最终边界。

## 发布要求

1. Runtime payload 与插件版本一起生成，并校验清单；
2. 本机 Runtime 版本必须满足能力 manifest 的 `minimumRuntimeVersion`；
3. 新增本机能力前，必须具备等价输入边界、日志脱敏、失败语义、质量门禁和回归测试；
4. 新增远程能力前，必须定义 OAuth scope、上传介质类型、最大大小、Worker 画像、作业状态和 artifact 契约；
5. 安装器升级只能迁移已识别的 Common Tools 资源，遇到同名未知 MCP、市场或命令 shim 时必须停止，不得覆盖。
