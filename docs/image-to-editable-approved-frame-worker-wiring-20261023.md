# Worker 外框服务转发修复

日期：2026-10-23。修复了 Worker 适配器忽略宿主 `applyApprovedFrames` 依赖的问题。获准的 n4/n6/n8 外框服务现在可以沿 Worker 的正式导出入口进入 Core，在最终封存和审计之前执行。默认仍不安装此服务；本轮没有部署、重启或激活共享 Worker，整页验收尚未完成。

## 问题与改动

Core 已接收并校验该可信依赖，但 `packages/remote-mcp-server/image-native-rebuilder.js` 的构造器没有接收或转发它。配置非法服务会被静默忽略，配置合法服务也不会调用。修复前真实代码上的两项回归均失败，且没有跳过；修复后原两项回归均通过。

本轮生产源码仅增加两处 `applyApprovedFrames` 引用：构造器接收它，然后原样交给 `createRawImageNativeRebuilder`。独立差异核验将这两处引用移除后，完整文件摘要与修改前完整 CI 的绑定摘要一致。没有增加业务分支、环境开关或 job metadata 配置入口。

宿主仍须先核验用户批准的具体 review 和资产，再调用 `createApprovedFrameAssetApplication(review)` 并通过构造器依赖安装服务。序列化的 approvalId、近似报告或 metadata 同名函数不能安装服务。服务的输入校验、事务凭证、提交/回退及严格证据保留逻辑沿用[正式 Core 接入](image-to-editable-approved-frame-pipeline-20261023.md)。用户批准范围仍是 n4/n6/n8 三个外框。

## 验证结果与时间边界

先续接已有的完整 CI，没有重启或增加超时覆盖。修改 Worker 接线前，原配置的 `npm run verify:ci` 完整通过：

- 826 个 unit、34 个 contract、94 个 integration 测试文件，共 954 个文件；所有分片完成。
- 完整 Lint、两套类型、插件/可观测性/ADR 检查、.NET 安全审计及锁定构建、Python 锁文件和真实打包安装消费检查通过。
- 3032 项绑定输入在整个运行期间无增加、删除或内容变化。

随后修改接线。最终源码执行的是风险匹配验证，**没有再次运行完整 `verify:ci`**：

- 新增 `test/approved-frame-worker.test.js` 的 11 项回归，覆盖默认关闭、非法服务、metadata 越权、调用/审计顺序、空事务、真实资产 factory、同步/异步异常、非法/伪造/跨上下文凭证和提交失败。
- 101 项外框回归及 240 项相关 Worker 回归全部通过，共 **341 项**；无失败、取消、跳过或 TODO。原先两项红色复现另行通过，不重复计入 341。
- 完整 Lint、主类型与严格边界类型、工作区边界和架构预算通过。原有 7 项 decreasing-only 架构例外没有新增或放宽。
- 新文件已由统一 unit CI 入口发现；当前清单为 unit 827、contract 34、integration 94，没有丢失旧文件。此发现结果不等于重新跑完当前 955 个文件。
- 最终真实执行 `npm pack`、独立安装及既有全部消费检查，并从安装包的 `common-tools-team-image-worker.js` 导出入口运行新增探针。6 项安装包源码摘要与本地一致；真实外框 factory、原资产保留、严格标记、非法服务、metadata 隔离、伪造凭证和异常传播均验证通过。
- 10 个验证阶段均正常退出；3033 项绑定输入在修复后验证期间无内容变化。

安装包探针使用合成输入和受控 builder，验证的是安装包内真实 Worker 入口的接线与资产应用合同。本轮没有新建真实源图的 writer/Office 整页产物，也没有运行共享 Worker 作业。

## 保留的失败与证据

首轮新增回归为 10/11：应用模块的最小夹具没有图片 box，正确触发 Worker 的 `native image local fidelity object is invalid` 校验。随后只给两张合成图片补齐有限、正数几何字段，没有关闭生产校验。首轮夹具和更正记录保留。

差异核验脚本首次使用了 POSIX 形式的预期文件名，Windows 发现入口返回反斜线，断言拒绝；改为 `path.join` 后通过，旧脚本保留。两个阶段名中的冒号使诊断报告写入 NTFS 数据流；终态后已逐字节导出为普通文件，原流保留，摘要相同，没有重跑或改写门禁结果。

证据根为 `.codex-temp/approved-frame-worker-facade-20261023-v1/`：

- [最终独立核验](../.codex-temp/approved-frame-worker-facade-20261023-v1/verified-result.json)
- [修复后各阶段结果](../.codex-temp/approved-frame-worker-facade-20261023-v1/validation-v1/result.json)
- [实际安装包 Worker 入口探针](../.codex-temp/approved-frame-worker-facade-20261023-v1/validation-v1/installed-worker-probe.json)
- [生产源码差异与 CI 文件发现核验](../.codex-temp/approved-frame-worker-facade-20261023-v1/change-verification.json)
- [原始失败复现](../.codex-temp/approved-frame-worker-facade-20261023-v1/pre-fix.log)
- [夹具更正记录](../.codex-temp/approved-frame-worker-facade-20261023-v1/fixture-correction.json)
- [修改前完整 CI 核验](../.codex-temp/approved-frame-full-ci-20261023-v1/run-v1/verified-result.json)

## 尚未完成

沿用已绑定真实回放的结论：严格区域 9/12，已接纳关系 11 条；semantic/native-component 仍失败。三个获准近似外框不会被记录为严格源证明通过。

[n10 整卡背景近似](image-to-editable-n10-whole-card-observation-20261023.md)仍待单独答复；跨区关系也仍缺完整 paint/接点/背景证据。此次接线修复没有扩大这些权限或改变严格结果。Goal 保持 active。
