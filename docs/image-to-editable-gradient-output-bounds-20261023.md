# 连线渐变按实际输出范围编译：修复与真实 Office 核验

日期：2026-10-23。本轮修复本地生产源码中的渐变编译错误，未部署或激活共享 Worker。整页产品验收仍未完成。

## 修复内容

连线经过吸附、端口投影、圆角化或原生 elbow 拆分后，绘制范围可能与原始测量范围不同。此前色标仍按原测量范围归一化，使正确的源空间 paint 被绑定到错误的输出范围。

真实现有夹具可复现：测量 y=50–114，输出 y=50–113，旧编译沿用 y=114 的 `#1E54B4`；实际输出端点应为 `#1E56B4`。

- `nativeSourceRouteGradient` 保留原始观测用于拟合，新增可选 `drawingPoints`，按实际输出边界生成最终色标；不传第三参保持旧合同。
- 单关系、共享树及共享 polyline 使用实际绘制范围。共享组件先减去 `fit.window`，保持 paint 所在的局部源坐标。
- native chain 使用实际 preset 顶点及显式 `sourceOrigin`。相邻短 span 的 spatial paint 也保留源空间字段。
- 新输入拒绝非法、稀疏、Proxy、accessor、非有限及超大值，复制为纯数据；原共享 4M 工作预算保持。
- 不改变节点、端口、几何、拓扑、关系身份、源归属或擦除权限。

源码修改限定为 5 个生产文件、1 个新增测试及 1 个既有测试。完整修改前副本保存在证据目录。

## 回归与工程门禁

新增 `test/source-route-gradient-output-bounds.test.js`，包含 8 项测试及 x/y、反向、线性/多色标、吸附为常量轴、真实单关系三模式、共享树、平移 chain、恶意输入和统一 CI 发现检查。修复前 7 失败/1 通过，修复后全通过。

既有 plateau 测试原先把 spatial paint 当作路径索引端点色。现改为按实际 preset 顶点减去 `fit.window` 独立计算源空间颜色，检查每个 span 两端；原非 spatial 断言、闭环路径数、重复核心位置和相邻 span 检查全部保留，未提高容差。

最终验证：

| 范围 | 结果 |
| --- | --- |
| 完整相关路由回归 | 330/330 |
| 4 个原生 OpenXML 契约文件 | 9/9 |
| 完整配置 Lint、主及边界 typecheck | 通过 |
| workspace boundaries、architecture budgets | 通过 |
| 正常独立安装包验证及所有既有消费者 | 通过 |
| 从独立安装包消费新增行为 | 8/8 |

3034 项已绑定工程输入在验证、安装与回放期间逐字节保持。未重跑完整 `verify:ci`。既有扩大源码 Lint 的历史问题不因本轮配置 Lint 通过而消失。

首次路由运行 329/330 的旧断言失败完整保留。v2 所有实际门禁退出 0，但汇总脚本错误地从 v2 目录读取已复用的 v1 native-contracts 日志，因 `ENOENT` 退出 1；独立 finalizer 严格检查原日志、退出状态及输入一致性后重建汇总，明确记录 `aggregationRecovered:true` 和原退出 1，没有重新运行或掩盖原任务。静态门禁的复用仅发生在确认唯一后续改动为 plateau 测试之后。

## 同一真实截图的前后对比

两种模式均通过正式 Core 冻结输入回放，0 次新 OCR/VLM；属于源码/冻结计划验证，不是实时共享 Worker 或新 OCR 端到端验收。

逐 IR 对比：自动模式仅 3 个对象、可重排模式仅 13 个对象的 `strokeGradient` 改变。30 项图像资产逐字节相同。其余 IR、几何、端口、路径和源证据保持。仅可重排模式的明确预算计数路径 `pages[0].source.sourceScene.replacedConnectors.checks` 从 3427906 增至 3431250，均为合法整数且低于原 4M 上限；该路径逐值保留并核验，未泛化删除其他计数。

正式 native writer 生成 4 份独立 PPTX，再使用默认 PowerPoint COM adapter 顺序渲染；无 XML 后改、无超时覆盖。

| 模式 | PDR 修复前→后 | Missing | MAD 修复前→后 | 变化像素 |
| --- | --- | --- | --- | --- |
| auto | 7.725140665%→7.725331441% | 1.976982296% | 8.227085782→8.227110264 | 442 |
| reroutable | 7.847300652%→7.847745795% | 1.994409949% | 8.311615596→8.311690316 | 765 |

保留 threshold=24、foreground tolerance=2px/43.2、PDR≤8%、Missing≤12%、MAD≤12。两种模式均继续通过全页像素门槛，但指标有微小退化，不能声称整页视觉改善。变化像素全部位于对应渐变对象的局部范围。通道容差 18 内的新增/丢失变化像素分别为 auto 5/0、reroutable 11/6。

全部 220 个原截面、每截面 49 个偏移及 10780 个样本保留；其中线身 9212 个样本前后均为 8291 个通过。该结果没有让此前失败的双 cubic/双描边候选转为通过。

独立 Pillow/NumPy 复核全部四张图的 PDR、Missing、MAD、每个变化像素及两模式全部截面。独立 XML 复核确认 3/13 个叶绘制对象仅描边渐变不同；所有其余 slide XML、锚点与几何保持，30 项媒体 bytes 保持。最初按顶层 group 计数的诊断脚本错误已保留，改为逐叶对象检查后通过，没有重新生成成品。新 JPG 与原 PNG 解码 RGB 完全一致，仍没有新增源细节。

## 剩余边界

严格完整区域仍 **9/12**，接纳关系 **11 条**。三个获准近似外框的局部验收与严格结果分开保留；不将其计为严格 12/12。整页 native-component、strict semantic、native-path semantic 仍失败。

36 个 mixed contacts、头部/背景/源归属、整卡残影和整页编辑验收仍需解决。n10 背景近似沿用独立待答状态，未重复询问或扩大三个外框的近似授权。共享 Worker 未重启、未部署、未激活。当前没有 PowerPoint 进程残留；不终止用户进程。

## 证据

- [实验入口与保留失败](../.codex-temp/native-gradient-output-bounds-20261023-v1/README.md)
- [工程验证最终汇总](../.codex-temp/native-gradient-output-bounds-20261023-v1/validation-v2/result.json)
- [真实 IR 对比](../.codex-temp/native-gradient-output-bounds-20261023-v1/replay-comparison.json)
- [实际 Office 分析](../.codex-temp/native-gradient-output-bounds-20261023-v1/office-v1/analysis.json)
- [独立图像/XML 复核](../.codex-temp/native-gradient-output-bounds-20261023-v1/office-v1/independent-office-verification.json)
- [安装包新增行为消费](../.codex-temp/native-gradient-output-bounds-20261023-v1/installed-gradient-v1/result.json)
- [实际局部对比图](../.codex-temp/native-gradient-output-bounds-20261023-v1/office-v1/office-comparison.png)
- [上一轮拒绝的具体候选](image-to-editable-office-gradient-coverage-20261023.md)
