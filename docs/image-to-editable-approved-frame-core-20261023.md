# 获准近似外框的 Core 模块迁移

日期：2026-10-23。本轮将已经验收的 n4/n6/n8 外框算法拆为 Core 中的显式调用接口，补齐像素视图的执行边界，并把回归放入正式 test 目录。默认重建主链和共享 Worker 尚未接入该接口，整页验收仍未完成。

## 改动与用途

入口为 `packages/slideclone-core/scene-plan/approved-frame-reconstruction.js`，公开四个函数：`fitApproximateFrame`、`createApprovedApproxFrameDrawSession`、`buildApproximateBackgroundPlan`、`applyApproximateBackgroundPlan`。拟合、绘制凭证、窄带选择、原背景检查和获准近似背景处理各有独立模块。它们不读临时证据目录，不自行操作磁盘或启动 Office。

调用方仍负责真实用户授权、编码源文件摘要、图片登记关系、资产别名同步和原子提交。输入中的 approvalId 是绑定字段，不能认证授权。绘制凭证只绑定本次会话实际发出的三个对象；序列化、复制或修改对象不能换取严格源证明。此接口保留原 n4/n6/n8 范围，没有将该批准扩展至虚线端帽或其他关系。

## 修复的边界缺陷

旧临时模块接受 Uint8Array 后仍保留调用方对象，后续读取其 `subarray` 时可以执行自定义 getter。新增回归先真实复现了这一失败。新边界只通过原生内部槽读取 backing buffer、偏移和长度，再创建无调用方方法的标准字节视图。自定义方法、constructor、iterator、species 和元数据 getter 不参与处理；代理、共享、可伸缩、已分离存储和非法长度均拒绝。输出仍通过单独缓冲区写入，原图和原透明 RGBA 保持。

新模块同时进入已有严格边界类型配置，保留 `noUncheckedIndexedAccess` 和 `exactOptionalPropertyTypes`。内部数组缺项会明确失败，不补默认颜色或几何。主类型检查首次发现 dash phase 的 null 类型注解缺失；失败记录保留，修正不改变返回值。

## 真实数据等价性

两模式各检查30张登记图片，6张受影响图片重新逐 RGBA 生成后与已验收候选完全一致。完整 union/repair/fallback mask、替换颜色、原严格元数据、全部接点见证、拒绝记录和近似记录相同。auto / reroutable 的原严格拒绝分别为582/578条，未删除或提高阈值。重放无范围外变化、原透明 RGBA 变化或非源像素冲突改写。

三个源截图观察 fixture 进入正式回归，拟合结果与旧候选相同；实际严格 capability reader 仍拒绝拟合结果、其副本及伪造的序列化 sourcePixels。旧六项 Office 移动、保存、关闭重开及完整旧周长近似验收原件保留。本轮等价重放没有新增 writer 或 Office 调用。

## 验收边界和后续

严格区域仍9/12、接纳关系11条；三个外框局部近似6/6保持。完整卡片残余归属、旧位置背景、固定关系主体、大残差谱系及整页 semantic/native-component 失败均未由本补丁解决。Core 组件可显式调用，不等于默认主链接入或共享运行时已启用。

另一条双层描边研究已收束：保留全部29点和原0.75px限制后，右侧固定轴单圆弧不存在可行半径。独立距离检查与完整区间交集一致，没有继续试色、放宽阈值或运行该候选的 Office 渲染。此结论仅关闭这个具体圆弧模型，不排除其他完整联合模型。

证据入口：

- [最终核验及当前输入绑定](../.codex-temp/approved-frame-core-migration-20261023-v1/final-verification.json)
- [修正后的工程验证](../.codex-temp/approved-frame-core-migration-20261023-v1/validation-v2/validation.json)
- [真实计划和资产重放](../.codex-temp/approved-frame-core-migration-20261023-v1/real-replay-v1.json)
- [三个拟合与两模式完整绘制成员等价](../.codex-temp/approved-frame-core-migration-20261023-v1/draw-equivalence.json)
- [首次工程验证及原类型失败](../.codex-temp/approved-frame-core-migration-20261023-v1/validation.json)
- [圆弧完整区间和源绑定](../.codex-temp/regional-dual-stroke-joint-20261023-v1/run-v1/radius-feasibility.json)
- [圆弧独立核验](../.codex-temp/regional-dual-stroke-joint-20261023-v1/run-v1/radius-verification.json)

当前67项外框回归和54项其他包/CI契约通过；8个测试文件全部进入统一 unit 发现清单。主类型、严格边界类型、修改源码 Lint、原配置完整 Lint、架构预算和工作区边界通过。发布清单新增8项必需文件；隔离包仅复制这8个模块即可加载公开API，逐一缺失任一成员的8个负对照均拒绝。没有声称新的 npm 安装、.NET 构建或 Office 验收。

先前2747项绑定中2744项保持，只有 Core manifest、严格边界类型配置和运行包必需文件清单这3项按本轮设计改变。原候选、图片、Office验收及历史失败均未覆盖。原完整 CI 的通过记录仅认证其当时冻结输入；本轮执行上述定向工程验证，没有重跑完整 `verify:ci`。
