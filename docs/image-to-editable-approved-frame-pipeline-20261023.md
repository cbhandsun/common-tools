# 获准外框的受控主链接入

日期：2026-10-23。三个获准近似外框 n4/n6/n8 现在可通过正式 `createRawImageNativeRebuilder` 构造器的可信依赖应用，在最终封存前完成资产替换和原生对象发布。此次接入使用已审查且逐摘要绑定的外框与背景资产，并非任意截图的自动拟合。默认任务不启用，共享 Worker 未激活，整页验收未完成。

## 改动

公开入口 `@common-tools/slideclone-core/scene-plan/approved-frame-reconstruction` 新增 `createApprovedFrameAssetApplication(review)`。它与已有四个算法接口并存。主入口只在 `compactTeamComponentEvidence` 之后，通过 residual stage facade 编排应用、最终封存、组件审计和指标计算。

四个新增模块分别负责：

- `approved-frame-application-input.js`：有界数据解析、无 getter/Proxy/序列化 hook 的快照及 review 指纹。
- `approved-frame-application-files.js`：路径与重定向边界、有界读取、摘要、独立 staging 目录及固定错误信息。
- `approved-frame-application-lifecycle.js`：绑定本次调用上下文、不可序列化且一次消费的事务凭证，以及同步 finalizer 的提交和回退。
- `approved-frame-application.js`：复核源文件、待退休对象、引用、资产摘要与尺寸、别名和严格证据；准备完成后发布对象与资产路径。

源图和图片尺寸从已经校验摘要的同一份 Buffer 解码，避免重新打开文件造成尺寸检查与已校验内容不一致。写入只创建新副本，原文件不覆盖。报告记录 `beforeAssetPath`、前后摘要及新路径，便于核验原资产仍在。已有 `style.assetPath` 同步更新，别名冲突明确拒绝。

取消、写盘失败、调用期间页面变化及最终封存失败均拒绝；已创建的 staging 清理，已发布的 shapes/images/meta 回到原引用。清理失败保持失败并保留原异常，不转成通过。错误信息不包含底层 OS 路径。未启用服务时沿原链封存。job metadata 中的同名函数、对象、开关或 approvalId 不能安装这个服务。

`approvalId` 是绑定字段，不认证用户授权。宿主必须先核验本次用户批准及实际 review 资产，再把 factory 结果作为构造器依赖。此补丁没有将 n4/n6/n8 的批准扩展到端帽、固定关系主体或节点软边界，也不授予严格源测量或擦除能力。

## 真实主链回放

证据目录为 `.codex-temp/approved-frame-integration-20261023-v1/`。`replay.cjs` 使用未修改加载行为的正式构造器和真实源图；沿用冻结 OCR、人工确认计划及 inventory revision 上下文，0 次新模型调用，没有 `Module._extensions` 注入。

最终输入对应 `raw-replay-auto-v3` 与 `raw-replay-reroutable-v3`。`verify-replays-v3.cjs` 校验：

- 两模式各30张引用图片，共60张，编码字节与旧 v6 候选相同。
- 仅将已经逐字节匹配的图片位置按 imageId 规范化，并移除新旧应用审计报告后，完整 Deck IR 深度相等；形状、文字、其他元数据和严格源证据均未改变。
- 每模式6份被替换原资产按当前实际旧路径复核摘要，共12份完整保留；复制后的成员 ID 集合及前后摘要与绑定 review 精确一致。
- 每模式3个拟合外框，已接纳关系11条，严格区域9/12；native-component、严格 semantic 和 native-path semantic 仍失败。
- 原 auto/reroutable 的582/578条严格拒绝文件摘要保持，未提高阈值或删除拒绝。

新 JPG 与旧 PNG 都是1086×1448，解码 RGB 完全相同。此次重新比对没有获得额外源像素证据。

## 验证与保留

最终90项外框回归、29项相关 CI/包/封存契约及228项 Worker 回归通过，共347项定向测试。12个外框测试文件均由统一 unit CI 入口发现；当前 unit 清单826文件。主类型、严格边界类型、最终修改源码 Lint、原配置完整 Lint、架构预算、工作区边界通过。架构仍是原有7项 decreasing-only 例外，无新增或放宽。发布必需清单纳入4个新模块；公开接口在只复制13项依赖闭包的隔离包中冷加载，逐项缺失均拒绝。

旧2747项绑定中2742项保持、无缺失；5项差异中，Core manifest、严格边界类型配置、发布清单包含上一轮既有迁移，另两项是本轮主入口与 facade 接线。旧候选、Office 原件、旧报告和失败记录均保留。初始类型/Lint问题、测试中的错误 profile 字面量及两次验证器路径/数量假设错误分别记录，没有改动业务门禁来消除失败。

本轮未重跑完整 `verify:ci`，未新建 writer/Office 产物，未做共享 Worker 上线。之前局部6/6 Office移动验收仍属于原 v6 输入；本轮通过完整渲染字段及资产字节等价连接到该证据，没有把它称为新的 Office 验收。

## 尚未完成

n10 整卡的残余唯一归属和旧位置背景仍缺完整证据；不能只改 groupId 声称整卡可移动。固定关系主体和大残差谱系也未因外框应用而解决。下一步应针对整卡绑定同一产物的归属、移动后背景与组件/语义结果，继续保留严格基线。Goal 保持 active。

证据入口：

- [最终双模式完整比较](../.codex-temp/approved-frame-integration-20261023-v1/current-replay-equivalence-v3.json)
- [最终工程验证](../.codex-temp/approved-frame-integration-20261023-v1/validation-v2/status.json)
- [完整 Lint](../.codex-temp/approved-frame-integration-20261023-v1/validation-v1/configured-lint.json)
- [Worker 回归](../.codex-temp/approved-frame-integration-20261023-v1/validation-v1/worker-regressions.json)
- [相关契约日志](../.codex-temp/approved-frame-integration-20261023-v1/validation-v1/ci-contracts.log)
- [旧绑定审计](../.codex-temp/approved-frame-integration-20261023-v1/prior-input-audit.json)
- [新旧截图比较](../.codex-temp/approved-frame-integration-20261023-v1/source-comparison.json)
- [验证器失败与修正说明](../.codex-temp/approved-frame-integration-20261023-v1/verification-corrections.json)
- [上一轮 Core 算法迁移](image-to-editable-approved-frame-core-20261023.md)
