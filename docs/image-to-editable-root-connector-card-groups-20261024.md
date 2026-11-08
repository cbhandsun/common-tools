# 整卡分组与顶层原生连接器

2026-10-24，承接[卡片端口诊断](image-to-editable-native-card-group-ports-20261024.md)和[路由默认值修复](image-to-editable-native-stage-defaults-20261024.md)。用户已处理 Windows 权限提示，继续通过 computer-use 的 `@oai/sky` 操作 PowerPoint；没有绕过安全界面。

## 实际 Office 行为

对实际生产 writer 生成的诊断副本 `child-motion-v1.pptx` 移动完整卡片组，保存、关闭并重开。独立读取 PPTX XML 确认：整组平移 36.9pt / 0.1pt，所有子元素的局部坐标不变，外部目标不变，连接起点与卡片底框经组变换后的端口完全重合。起点仍引用真实 `card-body` 子形状，没有改为组 ID。

随后在独立 `child-scale-v1.pptx` 副本中拖动整个组的缩放手柄，保存、关闭并重开。组宽高分别变为原来的 1.336218 / 1.395787，组内元素的局部坐标、外部目标和连接引用不变。起点误差为约 -0.003 / 1 EMU，外部端点误差为 0 / 0 EMU，符合整数坐标舍入。两个动作均由 PowerPoint 实际执行；XML 检查不承担 UI 自动化。

这些证据仅证明顶层原生连接器绑定卡片内真实子形状时的行为，不授权将连线本身留在另一个物理组中，也不等于真实整页已经通过编辑或残影验收。写后 XML 改为组 ID 的 `group-bound.pptx` 仍只作为诊断，未用作生产证据。

## 修复

原 `source-scene-connector-group-scope.js` 同时拒绝跨容器连线的物理组及其端点卡片组。即使连线后来已展开到顶层，卡片也已经失去分组，导致用户只移动到单层外观。

现在只拒绝不兼容的连接器所属组。保留循环继续复核，连线展开到顶层后允许其绑定已通过私有快照、成员完整性和图层顺序检查的卡片子形状。连线与全部端点都在同一个组中的情况继续保留。没有更改几何、描边、端点 ID、共享路径身份、源像素规则、工作预算或已批准近似范围。

`source-scene-connector-group-scope.test.js` 增加顶层连接器、两张卡片的子端点、迭代展开、变异成员、外来成员及复制凭据反例。修复前 10 项中 3 项失败，修复后 10/10。原有缺失/重复端点、预算上限和统一 unit/all CI 发现检查保持。

## 证据与边界

本轮诊断证据位于 `.codex-temp/native-card-group-ports-20261023-v1/`，同源真实回放位于 `.codex-temp/native-card-group-replay-20261024-v1/`。终态结果以这两个目录中的独立检查和最终绑定报告为准。

调用方范围回归终态为 76 文件、634/634、退出 0，无跳过；见[范围结果](../.codex-temp/native-card-group-ports-20261023-v1/regression-result.json)和[完整 TAP](../.codex-temp/native-card-group-ports-20261023-v1/regressions.tap)。两套 TypeScript、完整 Lint（1286 个 JS 文件）和架构预算（2342 文件）均退出 0，原 7 项递减例外保持。没有运行或宣称完整 `verify:ci` 通过。

冻结输入的真实 raw 回放零模型调用，恢复 `scene-unit-object-n112`、`scene-unit-object-n120` 两张卡片的物理分组。[独立比较](../.codex-temp/native-card-group-replay-20261024-v1/group-replay-verification.json)确认所有几何、文字、图片放置和资产字节保持，只增加两组及其 6 项相应组件角色。44 个共享原生连接器、88 个有效引用与下层闭环保持。首次比较未区分角色保留的失败记录仍在，未覆盖历史证据。

[实际 writer 输出](../.codex-temp/native-card-group-replay-20261024-v1/office-static/current-native.pptx)的 SHA256 为 `4a9f23afe6d1c9ce8226cb1578f4ec3f98db38220700ec2661ed191405d659ae`。[结构核查](../.codex-temp/native-card-group-replay-20261024-v1/office-static/writer-verification.json)通过，真实整页移动副本已准备但未打开。用户以 Esc 停止桌面操作后，没有重新输入桌面。

包含本修复的最终包打包成功，隔离安装按原 `600000ms` 超时，详见[包结果](../.codex-temp/native-card-group-ports-20261023-v1/runtime-package-retry-result.json)：`package-install / timeout / ETIMEDOUT / SIGTERM`。没有提高时限、把前序包通过套用于本次源码，或将打包成功记作安装通过。

整页仍需处理跨区关系 `relation-regional-0-0` 的两层固定绘制、36 个混合接触点、完整卡片图层与残影，以及共享 Worker 实际加载修复后的验收。本轮不提交、推送、部署或重启共享服务；目标保持 active。
