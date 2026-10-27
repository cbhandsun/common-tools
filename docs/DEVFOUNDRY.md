# DevFoundry 本地 CI 接入

维护日期：2026-10-27（America/Los_Angeles）。

## 接入范围

当前开发分支为 `codex/native-connectors-alignment`，本次从已提交的 `cec521538ee0f6cb5f8ac23f98b68353df16ddbf` 接入；Windows 工作树未提交改动不属于此提交或远端 CI 验证范围。

私有 Gitea：`ssh://git@192.168.1.102:2222/juhon/common-tools.git`。GitHub origin 保持原地址，GitHub 工作流保持原样；本次不推送 GitHub、标签或发布产物。

本仓库新增三系统原生工作流和 `.devfleet/` 执行配置；push / PR 运行检查，也可以手动运行。汇总依赖三系统任务；任何检查失败均阻止成功。没有 Gitea CD 或 SDK / 镜像发布任务。

## 检查覆盖

三系统均执行现有 portable、lint、typecheck、插件 / Runtime / 观测 / ADR 检查、锁定 NuGet 审计与 .NET 构建、common-tools、unit / contract / integration、Python 锁校验及 SBOM / release evidence 校验。
Linux 另执行现有进程恢复、独立临时容器 / PostgreSQL / S3 恢复测试和固定镜像 actionlint。其他系统对应 Linux 专属步骤明确标为不适用，不代表在该系统执行过这些测试。

Node 固定 22.23.4，npm 遵循 packageManager 固定 10.9.2，Python 使用独立 3.13.18；.NET 8 使用各节点已核对的 SDK。安装使用 npm ci --ignore-scripts，复用既有安装边界。
原有 test:unit / contract / integration 通过追加 --shards 1 降低共享机器并发，不改变发现的测试集合。重型任务复用既有同 OS 资源锁。

恢复测试只操作本轮创建的随机容器和临时数据，不能改动现有 common-tools-public 业务服务；Office 和真实生产账号验收不在此基础 CI 中，原有专门流程继续保留。

## 日常使用

- 日常提交推送到 Gitea；GitHub 仅在明确要求同步时使用 origin。
- Git 设置采用仓库本地 remote.pushDefault=gitea、push.default=current，并核对当前分支 pushRemote=gitea。保留分支的 origin 拉取跟踪；默认推送与默认拉取是不同设置。
- AI 执行时显式指定 remote 和分支；不依赖隐式 push，不镜像或强推。
- 源码发生变化后核对对应 SHA 的 CI，不引用旧版本通过结果。

本页描述配置与验收标准，不预先声明三系统或完整发布门禁通过。实际运行证据由 DevFoundry 的 common-tools 接入记录维护。

## 撤回

通过正常 revert 撤回此次新增 CI 文件，不强推。Git 设置的旧值、独立 runner 的服务名和停用范围在 DevFoundry 接入记录中保存。只停用本项目 runner，不重启业务容器；没有业务 CD 或数据库迁移需要回退。
