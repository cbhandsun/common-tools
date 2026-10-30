# 图片卡片合组与静态预览重路由修复

2026-10-24。继续正常 raw 重建入口的通用修复；没有新增截图坐标特例，也没有扩大外框、n10 或跨区关系的既有近似授权。

## 已查明的原因

`source-crop` 图片图标拥有明确的计划父级和源隔离证据，但此前完整卡片组装只接受原生图标成员。现允许其以图片身份加入已实测的卡片，不将图片声明为可编辑路径，也不授予端口或背景擦除权限。私有凭据绑定真实对象、源像素数组、资产路径和绘制快照；复制、替换、成员丢失、跨源、外来分组和绘制顺序冲突仍拒绝。

首次真实回放的图片合组在 LibreOffice 预览中产生 86 个变化像素，齿轮顶部出现额外横线。此前归因于晚加入的全页残留底图不成立：实际 PPTX 中底图位于卡片组下方；移除底图后横线仍在，移除连接器后横线消失。仅移除组内形状的端点绑定也没有解决问题。

最终对照保留全部连接器绘制 XML，只在临时预览副本中移除 120 个端点绑定，横线消失，合组前后整页零像素差异。原因是 LibreOffice 加载原生连接器时重新计算路径，而原有兼容处理只覆盖组内文字端口，不能覆盖顶层连接点等路径。静态预览现按文件已经写入的几何绘制；交付 PPTX 的绑定保留。

曾为排查新增的 `groupPictorialCrops` 延迟选项及计数已经移除。没有以禁用图片合组来维持原先结果。

## 通用实现

- `scene-plan/source-scene-native-icon.js` 生成图片成员的私有分组凭据；`source-scene-group-snapshot.js` 将 `assetPath` 纳入渲染快照。
- `source-scene-native-icon-groups.js`、`source-scene-complete-groups.js` 和 finalize 链传播图片集合，继续验证源父级、唯一完整成员、绘制顺序、32 部件上限及原工作预算。
- `source-native-finalization.js` 只保留凭据认可的图片分组字段，清除未经认可的旧 hybrid 分组。
- `libreoffice-grouped-text-connections.js` 在一次性预览副本中冻结有明确 DrawingML transform 的连接器几何。旧的组内文字帮助函数保留原合同；新增静态预览处理及独立计数。原包不会被重写。

## 当前产物与证据

新的本地候选为 [crop-card-replay v3](../.codex-temp/crop-card-replay-20261024-v3/approved-native.pptx)。它由正常 raw 入口和真实 OpenXML writer 生成，没有写后改动交付文件 XML。

- [真实回放](../.codex-temp/crop-card-replay-20261024-v3/replay-result.json)：冻结 OCR/计划，零模型调用，约 60.7 秒。11 条接纳关系、严格区域 9/12 保持。
- [结构核查](../.codex-temp/crop-card-replay-20261024-v3/complete-network-verification.json)：11 条逻辑路径、60 个原生连接器、120 个实际端点引用；44 条共享物理边和 1 个闭环保留。
- [合成与渲染核查](../.codex-temp/crop-card-replay-20261024-v3/build-render-verification.json)：52 份资产字节相等，所有连接器绘制及绑定按真实名称归一后相等；C 图标进入 `scene-unit-object-n112`，仍为非原生图片。与同一静态渲染方式下的 v5 整页零像素差异。
- [根因对照](../.codex-temp/native-static-render-20261024-v1/corrected-render-verification.json)：相同原 PPTX 的摘要在预览过程中保持。旧预览与修正预览的变化保留在报告中；阈值 18 的超差像素减少不等于默认视觉门禁或 Office 行为通过。
- [分组及输入回归](../.codex-temp/native-static-render-20261024-v1/composition-after.tap)：45/45；包括两个不同卡片位置、有无后续残留层的实际 raw 合成。
- [预览及统一 CI 回归](../.codex-temp/crop-card-replay-20261024-v2/static-render-tests.tap)：24/24；包括两个实际 writer 布局、源包字节不变、渲染副本仅移除绑定、嵌套分组、异常 XML、重复身份与预算边界。新增测试由统一 CI 入口发现。
- 两套类型检查与完整 Lint 已通过；Lint 同时验证包边界、运行时载荷及架构预算，2351 个文件，原 7 个递减例外。
- 原源码输入记录了 2942 个文件摘要，完整 `npm run verify:ci` 日志为 [final-verify-ci.log](../.codex-temp/native-static-render-20261024-v1/final-verify-ci.log)。此前一轮 CI 的 unit 和 contract 通过，integration 因进程取消确认失败而退出；本轮已补充该失败的确定性回归并修复。修复发生在上述完整 CI 启动之后，该运行不能作为当前源码的最终完整门禁。

早期 v1 的旧渲染失败、v2 的延迟合组实验和所有对照均保留，没有覆盖或删除。

## 尚未完成

v5 的 Office 副本已实测 C 卡片组移动、缩放、保存重开，两条连接器绑定持久化；当时图片尚未入组，整卡未通过。此结果不能替代 v3 的实际 Office 验收。桌面输入被用户 Esc 停止后没有恢复。

主会话卡片仍因与已有 underlay 的绘制顺序冲突拒绝合组；没有按位置收编外来图形。旧位置残影、36 个 mixed contacts、严格 inventory/native-component 和 `large-raster-lineage` 仍未通过。共享 Worker 未更新或重启。整体目标保持 active。

## 通用性边界及取消确认修复

当前成果是公共代码修复加单张复杂图的回放验收。两个不同布局的 raw 合成与真实 writer 回归证明了相应局部机制可复用；它们不是多张独立真实图片的 OCR、规划、合成和实际编辑全流程验收。外框、n10 背景和单条跨区关系的近似仍仅适用于此前明确授权的范围，不能推导为通用近似权限。

`renderer-process.js` 的取消、输出上限及超时共用停止逻辑。Windows 的同步 `taskkill` 可能耗尽提前启动的退出确认计时，导致已排队的 `close` 尚未处理便误报终止未确认。现在在同步终止返回后开始等待退出事件，原 5 秒确认期限保持；进程树终止失败和缺失退出事件仍报错。

- [修复前回归](../.codex-temp/native-static-render-20261024-v1/shutdown-regression-before.tap)稳定复现两项失败；覆盖慢同步终止、正常取消、取消检查异常、超时、输出超限、真实终止失败与确认事件缺失。
- [修复后进程回归](../.codex-temp/native-static-render-20261024-v1/shutdown-regression-after.tap) 13/13，通过真实子进程树取消及取消后再次运行验证；新增回归位于既有统一 integration 文件。
- [受影响适配器与合成回归](../.codex-temp/renderer-shutdown-20261024-v1/affected-adapters.tap) 18/18。
- [类型检查](../.codex-temp/native-static-render-20261024-v1/shutdown-typecheck.log)和[完整 Lint](../.codex-temp/native-static-render-20261024-v1/shutdown-lint.log)通过；Lint 同时校验架构预算、包边界及运行时载荷。当前 2943 个输入文件的[校验](../.codex-temp/renderer-shutdown-20261024-v1/final-ci-inputs-verification.json)确认定向验证期间未变更。完整 CI 尚未按该输入快照重新完成。

该取消修复改善所有使用公共进程适配器的渲染任务可靠性，不计为图片还原或整页编辑效果提升，也不改变上面的未完成事项。
