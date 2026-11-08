# 原生连线门禁纠错与完整运行包验证

2026-10-24，承接[跨区线的限定原生近似](image-to-editable-approved-native-route-20261024.md)。本轮继续完成真实线网、语义门禁及工程交付验证，整体目标保持 active。

## 修复了什么

`native-component-quality.js` 曾把所有箭头连线的线帽强制限定为 `round`。实际源虚线编译器为保留已测量的 dash 区间使用 `flat`，生产 writer 的 `NativeLineCap` 也明确支持 `flat / round / square`。这导致真实 `scene-relation-n209`、`scene-relation-n210` 的合法平头绘制被误报为 `arrow-line-cap-not-round`。

组件检查现在验证与 writer 一致的三种显式合法值，缺失、空、未知、大小写变体及非字符串值仍失败，错误码为 `arrow-line-cap-invalid`。没有调整图形、线宽、dash、箭头、渐变、测量点、端口、源归属或视觉阈值。线帽合法不豁免线宽、箭头尺寸、弧线填充或独立箭头替代检查。

边界回归还揭示：带 getter 的样式可以被安全检查识别为非法，却在箭头审计中提前返回并得到通过。现在在读取箭头属性前拒绝非普通数据样式，固定报错 `native component quality shape style is invalid`，不执行 getter、Proxy 或强制转换钩子，也不回显输入内容。

## 已完成的验证

- 新增 4 项回归，修复前同文件 11 项中 3 项失败。修复后包含源虚线编译、实际 OpenXML writer、Worker 质量策略及限定近似的 7 文件共 **71/71**，无跳过，已进入统一 unit/all 或 contract/all 发现入口。见 [TAP](../.codex-temp/native-line-cap-quality-20261024-v1/after.tap)；修复前记录单独保留为 `before.tap`。
- 两套 TypeScript 检查、最终修改文件 ESLint、2347 文件架构预算通过，原 7 项递减例外保持。本轮未执行全仓单次 `verify:ci`，未更改 .NET 源码或依赖。
- [v3 正常 raw 回放](../.codex-temp/approved-native-route-20261024-v3/replay-result.json)再次使用冻结 OCR/计划、零模型调用，真实结果的 `native-connector-integrity` 已通过。组件 findings 从 4 项减为 2 项；严格区域仍为 9/12，严格 semantic 仍失败，没有以门禁纠错替代整页验收。
- [整条线网独立核查](../.codex-temp/approved-native-route-20261024-v3/complete-network-verification.json)读取实际 PPTX 的形状名称和 `stCxn / endCxn`，覆盖 **11 条逻辑路径、60 个原生连接器及 120 个端点引用**。7 条共享路径逐边验证既定顺序、方向及起终身份，4 条其余路径逐项验证，包括已批准近似。44 条共享物理边仍具有 1 个闭环，未通过重新搜索路径替换原选择。此项是结构核查，不冒充真实 Office 移动行为。
- [v3 writer 与渲染](../.codex-temp/approved-native-route-20261024-v3/render-verification.json)保持原 44 条共享连接器及 52 份资产，所有绘制字段按资产内容摘要归一化后不变。整页渲染与用户批准候选仍为零像素差异。只改变临时资产目录名的差异已在独立比较中按内容绑定，没有更改资产字节。

## 完整包安装已通过

[完整隔离运行包结果](../.codex-temp/native-line-cap-quality-20261024-v1/runtime-package-result.json)已通过实际打包、安装、CLI、20 个包及消费者、6 类能力、生产依赖闭包、默认 Worker 消费、共享路由、残差去重及 PPT 创建检查。包为 4,098,780 bytes、1949 文件。保留的 `checked-runtime.tgz` 中质量模块摘要与最终源码一致，不能用旧包结果替代本次源码。

本次使用位于本工作区证据目录中的独立临时安装目录，安装耗时 116815ms，沿用原 600000ms 上限。没有提高时限或跳过消费者。此前超时记录保持；本次成功不能证明历史超时的根因。两个无依赖本地归档诊断均成功，但它们不承担完整包验收。日志中的预期非法环境参数拒绝由实际消费者检查验证，不是被忽略的失败。

## 仍需完成

当前组件检查仍记录 `source-scene-unresolved` 和 `source-scene-inventory-invalid / evidence-invalid`；大栅格谱系的严格语义检查仍失败。原严格清单继续保留原成员与拒绝，已批准近似不会获得严格源证明，也不能直接换算为 12/12。

实际 PowerPoint 整页拖动、缩放、保存重开、36 个混合接触点及移动残影尚未完成。v3 的 `office-validation/motion-copy.pptx` 已准备；此前用户以 Esc 停止桌面输入，恢复确认仍待回复。没有用静态 XML 或后台渲染代替这些行为。

共享 Worker 未部署、重启或激活，本次隔离消费者成功不代表共享服务已加载修复。现有 [最终证据摘要](../.codex-temp/native-line-cap-quality-20261024-v1/final-evidence.json)明确保留这些未验证状态；整体目标尚未完成。
