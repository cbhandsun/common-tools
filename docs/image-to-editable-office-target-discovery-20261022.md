# 复杂图 Office 文字目标发现修复

日期：2026-10-22。状态：局部修复及真实基础编辑验证通过；整页可编辑目标仍 active。证据目录：[powerpoint-target-identity-20261022-v1](../.codex-temp/powerpoint-target-identity-20261022-v1/)。本轮未改变产品档位、门槛、预算、源像素所有权、连线表示或共享 Worker。

## 失败与修复

此前复杂图的改字验证在 `find-target` 失败，单对象几何编辑通过；没有进入文字修改阶段，不能解释为产物没有文字编辑能力。

保留的真实复现记录显示，Office 的 249 个顶层对象中，分别在第 113 和第 39 个对象返回空 ID；对象和集合均为 COM 包装对象。PPTX XML 的 399 个形状属性 ID 为 1–399，未发现非法 ID。这证明目标扫描遇到暂未提供 ID 的对象；没有证据认定源文件形状身份损坏。诊断未读取或输出文字内容。

`scripts/lib/powerpoint-shape-targets.js` 的发现分支原先遇到任意空/非法 ID 就中止，现与精确身份查找一致，继续寻找身份有效的目标。父组 ID 未就绪时，仍可在原有深度和工作量边界内查找具有真实 ID 的子对象。不会将缺失 ID 强制转换或推算成可编辑目标；找不到有效目标仍由调用者在原重试次数内失败。

编辑和重开验证仍对同一真实 ID 操作；未删除结果核对，未增加 Office 超时、重试次数或遍历预算。

## 回归与实际结果

先补回归再修复，`before-regression.log` 保存旧代码在新增用例下的身份不可用失败。修复后的 `focused-v1.log` 为 19/19 测试通过，无跳过；其中生成 PowerShell 的行为夹具执行 122 项断言。新增覆盖空、零、负数、字符串、浮点、非 Int32 ID，未就绪父组、无关组阻塞以及永久无目标。无效身份不会获得编辑，真实目标修改后仍按原身份验证。原深度、循环、数量和工作量边界测试继续通过。

既有 `powerpoint-roundtrip-targets.test.js` 已由统一 integration/all 入口发现，并按 external-process 运行；没有新增孤立测试入口。定向 ESLint 与两套 TypeScript 均通过；类型检查的第一轮没有终态报告，保留为中断，第二轮 `typecheck-v2` 退出 0。

对当前权威复杂图的副本运行未插入诊断逻辑的生产 Office 验证器，`after-real-result-v2.json` 与 `after-real-v2/powerpoint-editable-roundtrip-summary.json` 确认：

- `shape-text`：打开、改字、保存、关闭重开、验证全部通过。
- `geometry`：打开、移动一个自动选取对象、保存、关闭重开、验证全部通过。
- 进程状态 succeeded，报告 valid，2 个预期案例均完成；真实工作流约 90.8 秒，保持原 240000ms 时限。
- 原始 PPTX SHA256 保持 `7d34dddd4ccd44ee5abe799ae252cfa04a508e3fba7bbb3a3f91d964165ae6ad`；验证器 helper SHA256 为 `a9eff58e63d00c312cc179806108464f29aee6b262391a70edb77c877cab00f7`。

第一次修复后实际尝试的工具句柄失效；核查没有对应存活进程和终态报告，按中断保留。其 staging 中有 edited 文件也未被认定为验收成功。第二轮使用独立证据路径，保留第一次失败、中断和第二次成功，不覆盖旧文件。

## 工程与目标边界

前序 integration 的进程树截止测试曾实测 9027.739ms，未达到小于 9000ms。原规则不变的独立复跑 `budget-recheck-v1.log` 为 7/7 通过，该用例约 6493ms；未据此改写前序 integration 失败或判定具体性能根因。

后续完整 integration 的 93 个测试文件全部通过；Python lock 与运行包安装消费也均退出 0，`phase-status.json` 已为 terminal，五项检查均成功。运行包为 3,870,455 bytes、1,845 个文件，安装后 image-to-editable 引擎、scene Worker consumer 与生产依赖闭包均验证通过。首次完整 CI 的缓存 EPERM 与首次 integration 失败仍保留，不能合并各轮成功为“一次完整 CI 全绿”。

进程观察器第一版因 PowerShell 自动反序列化 ISO 时间戳，再按显示字符串解析而误报创建时间不匹配；旧观察记录保留，第二版按 DateTime/DateTimeOffset 原始 ticks 核对 PID 和创建时间，确认当时工程进程及其子进程实际存活。工程终态由实际退出码和完整日志证明，不以该观察器的任何布尔值替代。

本轮只证明一个文字目标和一个几何目标。自动几何选择可能命中背景，不能代表业务节点、完整区域、全部文字或关系组件。后续[业务对象与绘制冲突定位](image-to-editable-component-paint-conflicts-20261022.md)确认三张关键卡片的底色、边框尚未共同分组，并用真实主链回放定位到旧边缘线/背景的绘制冲突。两个填充关系绘制项、大栅格谱系、14 个未完成场景组件、节点移动后的连线跟随及实际 Worker 验收仍未完成。
