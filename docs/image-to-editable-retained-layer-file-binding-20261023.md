# 保留图层读取的实际文件绑定修复

2026-10-23。承接[原生默认策略修复](image-to-editable-native-default-unification-20261023.md)。正式原生基线继续保留；本轮没有选择圆角自由路径替换它。

## 复现及修复

为后续保留图层合成观察核查 `readRegisteredSourceCrop` 时，发现实际文件绑定遗漏：它验证私有 token、源图、根目录、放置框以及调用方的已解码像素，却没有再次读取当前 PNG。文件被改写后，只要调用方仍传入旧像素，就可能返回过期的裁剪窗口。

新增两个回归在旧实现下均失败，保存于 [before.tap](../.codex-temp/source-crop-live-file-binding-20261023-v1/before.tap)：修改实际文件 RGB 后仍返回窗口；空或损坏文件也没有被读取并报告失败。

修复在已有私有凭证、放置和调用方像素校验后，额外有界读取实际 PNG，核对其尺寸和像素摘要。RGB、alpha 或尺寸变化返回 `null`；空、损坏和超过既有 12MiB 上限的 PNG 保留失败，不吞异常。原 262144 像素限制、路径与符号链接约束保持。没有新增擦除权限，也没有修改原图或已有资产。

该接口继续只证明裁剪几何与当前像素身份。原关系残留即使不透明也不能被当作外部背景；13 个已知外侧上下文、209 个关系反例及 36 个混合接触点仍需完整图层和完整组件观察。完整 source-bound 合成 reader 尚未实现，不能把本次校验修复描述为该机制已完成。

## 验证

- [定向测试](../.codex-temp/source-crop-live-file-binding-20261023-v1/focused.tap)：裁剪注册、单关系及共享关系裁剪擦除、原生闭环和编译策略，5 个文件共 27/27，通过，0 skip。新增测试由 unit/all 统一入口发现。
- 两套 TypeScript 检查、全量 Lint、修复源码与测试的定向 ESLint 均已取得退出 0。Lint 核对 1285 个 JavaScript 文件、2339 项架构预算及运行载荷和包边界；原 7 项递减预算例外保持。[本轮终态核对](../.codex-temp/source-crop-live-file-binding-20261023-v1/closeout.json)绑定最终输入与日志。
- [真实 raw 回放](../.codex-temp/native-default-raw-replay-20261023-v2/default-replay-verification.json)省略模式，消费冻结原图/OCR/计划及原批准范围。终态退出 0，3065 项输入在前后保持，新增模型调用为 0。
- 对比上一轮显式原生输出，全部 235 个形状、69 个文字对象、30 个图片对象及资产字节相等。随机图片路径只在根目录包含关系及字节摘要验证后规范化。44 个共享原生连接器、88 个 IR 端点绑定及完整闭环保持。
- [实际生产 writer](../.codex-temp/native-default-raw-replay-20261023-v2/office-static/writer-verification.json)退出 0，独立 XML 检查为 44 个共享 `<p:cxnSp>`、88 个有效端点绑定。新 PPT 是诊断产物，未替换正式基线，未继承旧文件的 Office 拖动验收。

## 未完成范围

实际 Office 窗口工具更新后仍不能恢复：`list_windows` 首次超时，重试返回 active request，重置 JavaScript 并初始化后再次超时。停止 UI 输入，没有重启 PowerPoint、关闭用户窗口或使用另一个 UI 自动化实现替代。本轮没有新的六端点、整卡、Office 像素验收。

严格结果仍为 11 条已接纳关系、9/12 区域，semantic/native-component 均未通过。两处固定关系绘制属于同一条 `relation-regional-0-0` 的两个填充轮廓；共享闭环不属于这两处固定绘制。完整组件编辑、混合接触点、大栅格谱系及共享 Worker 实际作业验收均保留为未完成。

没有完整 `verify:ci`、依赖安全审计或锁定 .NET 构建，没有依赖/C# 修改，没有提交、推送、部署或共享服务更新。目标保持 active。
