# Project Audit：本地优先、远程可选

`project-audit` 默认在当前获批准的工作区本机执行。它读取项目文件并生成证据化报告，不上传源代码、不执行项目脚本、不安装依赖，也不会把静态线索写成“已验证通过”。

## 本机 Runtime 与执行策略

从统一插件安装包选择 `local-preferred`（推荐）或 `local-only` 并选择 `project-audit` 后，会安装版本化的 Local Runtime。它提供 `common-tools` 命令，不依赖开发仓库或 `npm link`。先检查实际策略：

```powershell
common-tools runtime status
common-tools runtime resolve --capability project-audit
```

如果 PowerShell 提示无法识别 `common-tools`，说明受管理的 Local Runtime 尚未安装，或安装后尚未打开新终端。开发仓库中可从仓库根目录直接调用同一 CLI：

```powershell
npm run common-tools -- runtime status
npm run common-tools -- plugin upgrade --capability project-audit
```

这种调用只操作当前开发工作区，不会安装全局命令。若需要在任意目录使用 `common-tools`，应重新运行统一插件安装包，选择 `project-audit` 和 `local-preferred` 或 `local-only`，然后打开新的 PowerShell。宿主侧 Codex/Claude 插件包的安装或更新与 `plugin upgrade` 不同；后者只在已安装 Runtime 中接受版本提升后的 capability manifest。

`local-preferred` 默认本机执行；`remote-only` 才将项目审计交给远程 MCP；`local-only` 禁止远程上传。即使 Local Runtime 缺失，也不能把普通“审计当前项目”的请求自动改为远程作业，必须提示安装或获得“远程/团队审计”的明确指令。完整设计见 [执行模式与本地 Runtime](./execution-modes.md)。

## 先选审计层级，再选审计范围

审计层级控制投入、覆盖策略和证据深度，但不授权执行浏览器自动化、项目脚本或远程上传：

| 编号 | 层级 | 默认用途 | 完成所需证据 |
| --- | --- | --- | --- |
| `1` | `quick` 快速审计 | 日常检查、变更评审 | 静态候选证据和核心风险缺口；不强制浏览器场景或运行时门禁 |
| `2` | `standard` 标准审计（默认、推荐） | 版本验收 | `first-visit`、`core-flow`、`state-feedback`、`responsive`、`keyboard` 五个代表性体验场景；工程交付域还需要显式授权的运行时门禁 |
| `3` | `deep` 深度审计 | 重大版本或高风险系统 | 全部八个体验场景；工程交付域还需要显式授权的运行时门禁 |

可分别查看两个选择菜单：

```powershell
common-tools audit levels
common-tools audit scopes
```

交互命令会先询问层级，再询问范围；已经通过 `--level` 或 `--scope` 提供的选择不会重复询问：

```powershell
common-tools audit interactive
common-tools audit interactive --level standard --scope 2,3
```

自动化调用可以显式传入两者：

```powershell
common-tools audit run --level standard --mode enhanced --scope product-journey,visual-interaction --out .common-tools/reports/project-audit
```

### 编号选择审计范围

插件在执行前会询问审计范围；用户可回复一个编号或逗号分隔的组合：

| 编号 | 审计域 | CLI scope |
| --- | --- | --- |
| `1` | 全部四域 | `all` |
| `2` | 产品闭环 | `product-journey` |
| `3` | 视觉、交互与无障碍 | `visual-interaction` |
| `4` | 数据、权限与可靠性 | `data-security` |
| `5` | 工程与交付 | `engineering-delivery` |

例如输入 `2,3` 只审计产品闭环和视觉交互。`1` 必须单独输入；空值、重复编号、未知编号和 `1,2` 会被拒绝。选择全部审计域不代表授权运行测试、浏览器自动化或远程上传。

层级与范围彼此独立：例如 `quick + engineering-delivery` 是快速工程检查，`deep + visual-interaction` 是深度体验专项，并不要求每次执行全部四域。

层级要求只对所选范围生效。没有选择视觉交互域时，体验场景不会进入该报告；没有选择工程交付域时，运行时门禁不会成为该报告的完成条件。标准或深度层级缺少相应授权或证据时，报告必须保留为 `not-verified`，不能降级为快速审计或宣称完成。

## 五种审查模式与自然语言指令

| 模式 | 自然语言示例 | 适用场景 | 数据边界 |
| --- | --- | --- |
| `enhanced`（默认） | “审计当前项目”“项目审视” | 四域静态审视：产品闭环、视觉交互、数据/权限/可靠性、工程交付 | 代码和报告留在工作区，不执行项目 |
| `code` | “只做代码审计”“不要运行任何内容” | 最小化静态工程审视 | 代码和报告留在工作区 |
| `gates` | “运行测试/门禁/构建” | 本机质量门禁 | 会执行已声明脚本，需明确授权 |
| `experience` | “审视用户闭环、视觉交互、响应式、键盘可访问性” | 真实浏览器体验审视 | 只接收获批准的本地证据文件引用 |
| `full` | “完整/全面/端到端审视” | 门禁与浏览器体验合并报告 | 同时需要门禁授权与体验证据 |

可先让 CLI 对自然语言生成可解释计划：

```powershell
common-tools audit plan --instruction "完整产品体验审视，并运行测试门禁"
```

该解析器只选择模式、列出所需条件；它不会自动执行脚本、启动浏览器或上传项目。显式 `--mode` 始终优先于自然语言推断。

默认的增强本地静态审计：

```powershell
common-tools plugin enable --capability project-audit
common-tools audit run --mode enhanced --scope all --out .common-tools/reports/project-audit
```

如果用户明确要求执行本机质量门禁，才添加 `--run-gates`：

```powershell
common-tools audit run --mode gates --out .common-tools/reports/project-audit --run-gates
```

该选项只尝试项目已经声明的 `check`、`lint`、`typecheck`、`test`、`build` 脚本；每项均有独立状态与最长两分钟超时。它可能执行项目代码，因此不能默认启用。未声明的脚本记为 `not-configured`，不可当作通过。

## 真实体验证据模式

体验模式不把源码线索或模型推断当成真实运行。获得用户许可后，使用浏览器或已有 E2E 环境覆盖八个场景：`first-visit`、`core-flow`、`result-followup`、`state-feedback`、`recovery`、`responsive`、`keyboard`、`console-network`。

在获批准的项目内保存截图、录屏、控制台或网络导出文件，再创建清单：

```powershell
common-tools audit evidence-template --out audit-evidence/experience.json
```

此命令只创建不覆盖的八项模板；不会启动浏览器或收集任何数据。

### 可选：受限的本机浏览器采集

如果用户明确批准浏览器自动化，并且应用已经由用户在本机启动，可以用已安装的 Chrome 或 Edge 生成截图、控制台计数和网络状态计数。先由用户的自然语言目标和项目结构整理为**有限的**场景计划；自然语言只用于选择审计模式和设计计划，不会隐式启动浏览器。

```json
{
  "schemaVersion": 1,
  "baseUrl": "http://127.0.0.1:3000/",
  "scenarios": [
    { "id": "first-visit", "actions": [{ "type": "navigate", "path": "/" }] }
  ]
}
```

保存为 `audit-evidence/plan.json` 后显式执行：

```powershell
common-tools audit experience-collect --plan audit-evidence/plan.json --out audit-evidence/capture --run-browser
```

采集器只接受项目内的 JSON 计划、八个固定场景 ID，以及受限的 `navigate`、`wait-for`、`click`、`press`、`fill` 操作。默认只允许 `127.0.0.1`、`localhost` 或 `::1` 的 HTTP(S) 服务，会用临时浏览器配置无头运行，不启动开发服务器、不安装依赖、不记录页面文本、输入值、控制台内容或请求 URL；同源之外的 HTTP(S) 请求也会被阻断。输出目录必须是新的项目内目录。`fill` 不接受疑似密码、令牌或密钥字段。访问外部地址必须另外显式传入 `--allow-external-url`，并应仅在用户明确批准后使用。

自动采集成功只证明动作和文件捕获完成，因此生成的 `capture/experience.json` 默认保留为 `not-verified`。审计者必须逐个检查截图和控制台/网络聚合文件，拒绝空白、加载中、错误页、错误状态或不完整证据，并另存审核后的 manifest。只有审核后的 manifest 才应用于体验或完整审计；截图本身不能证明键盘、焦点、读屏、对比度、重排或恢复行为健康。

```json
{
  "schemaVersion": 1,
  "scenarios": [
    {
      "id": "core-flow",
      "status": "passed",
      "evidence": [{ "kind": "screenshot", "file": "audit-evidence/core-flow.png" }]
    }
  ]
}
```

`status` 只能是 `passed`、`failed` 或 `not-verified`。已通过或失败的场景至少要关联一个已有的、项目内、非符号链接且不超过 20 MiB 的证据文件；报告仅保存相对路径和证据种类，不读取或回显其中内容。

```powershell
common-tools audit run --mode experience --experience-evidence audit-evidence/capture/experience.json --out .common-tools/reports/project-experience
common-tools audit run --mode full --run-gates --experience-evidence audit-evidence/capture/experience.json --out .common-tools/reports/project-full
```

只有所有八个体验场景均有 `passed` 证据时，体验审查质量检查才通过。缺失或 `not-verified` 会如实保留，不能被静态审查或测试绿灯覆盖。

## 审计报告的证据层次

报告按“产品闭环 → 视觉与交互 → 工程可靠性 → 真实运行与门禁”组织，但会严格标明证据来源：

- **增强静态候选证据**：产品入口和流程文档、加载/空/成功/错误状态、交互反馈、组件与浏览器测试线索、响应式/可访问性线索、API 契约、输入校验、认证/授权、错误恢复、持久化/后台任务、可观测性、测试与 CI、发布/回滚/健康检查线索、运维文件、依赖锁文件与疑似密钥赋值。候选证据必须打开核验，不代表设计或控制健康。
- **真实门禁**：仅在 `--run-gates` 后记录实际运行的脚本状态与耗时。
- **未验证**：浏览器主链路、视觉层级、键盘与读屏、窄屏/高缩放、网络错误恢复、SCA、部署和生产行为；这些必须用浏览器、控制台、网络、容器或 CI 证据补齐。

报告不会回显源码或疑似凭据值。疑似密钥只包含相对路径、行号和规则名。Worker 和本地遍历都会跳过 `.git`、`.claude`、`.codex`、`.common-tools`、依赖与常见构建目录。

## 远程团队审计

只有当用户明确要求“远程/团队审计”时，插件才应通过 `common-tools` MCP 创建上传目标、上传精确归档、创建 Job、轮询并下载报告。远程 Worker 仍只做静态只读审计；它不会因为文件已经上传就自动执行测试、构建或 SCA。
