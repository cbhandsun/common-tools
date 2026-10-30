# 图片转可编辑 PPT：完整源线网的身份选择复核

本轮接通“选择已测得源边”的双观察复核、默认编译和实际 Worker 消费。真实整页仍未通过：默认空页 **3/11**，冻结 OCR 的完整 raw 回放 **4/11**；两类语义门禁和组件门禁仍失败。三条关系获得双观察身份共识，不代表下层五条关系已被编译接纳。

## 原因与实现

此前的[有序路径校验](image-to-editable-ordered-source-path-20261021.md)确认：旧 n204 坐标提案的起点距离实际源样本 3.816px，源到提案最大偏差 1.883px，严格 1.5px 门禁应当拒绝它。本轮没有移动源接触点或扩大几何容差。

- [source-shared-route-choice.js](../packages/slideclone-core/routing/source-shared-route-choice.js) 从私有完整源证明生成全部物理边的稳定名称。名称使用原始有序源样本，反向和枚举顺序不改变边身份。完整网络指纹绑定源哈希、尺寸、窗口、关系集合、接触点、箭头与全部边；公开描述没有测量或擦除权限。
- [source-scene-edge-choice-review.js](../packages/slideclone-core/scene-plan/source-scene-edge-choice-review.js) 要求两幅独立观察选择相同的完整有序边序列。端点、方向、原 owner 和源快照保持一致；拒绝重复边、重复接触点、断路和错误方向。没有完整描述时仍保留旧坐标折线复核。
- [source-scene-edge-choice-contract.js](../packages/slideclone-core/scene-plan/source-scene-edge-choice-contract.js) 定义每个索引的 `sourceEdgePath` 变体，schema 使用该完整网络的边 ID 枚举。普通四字段、定位复核和旧折线复核契约保持独立。未知输入先检查安全容器和字段，再解析并验证。
- 默认共享编译器重新测量整个源网络，核对指纹、完整源样本、端点、箭头、原锚点和唯一物理路径。保留所有闭环分支；没有以 DFS 顺序、诊断候选、折线补点或两个观察的拼接来选择关系。
- `sourcePathChoice` 从计划解析到局部/延迟复核及最终编译贯通。失败约束保留在 unresolved 清单，普通直线、可见间隙、图标联合间隙、普通路由和字幕路径不能忽略该约束接收关系。
- 新模块列入安装包必需文件；实际 Worker factory 与 provider schema 消费探针覆盖源边复核，并加入外来 ID、始终接收/拒绝 matcher 等破坏性反例。

观察仍占用原关系索引和原局部 target 账本，每条选择最多 15 个完整源边步骤。旧坐标提案仍最多 16 顶点；源样本仍最多 512，几何工作仍记入原四百万账本。物理描述中的至多 18 个点来自既有测量顶点和端点，不是扩充后的模型折线观察预算。目录成员上限对齐原共享编译器的 48 条关系；单次局部复核仍最多 24 条关系。

## 真实实验与证据边界

证据目录：`.codex-temp/source-contact-audit-20261021-v1/`。源图 SHA256：`a6f77ffb75653f04a4ca47d43e9f692b838b3ea43eb15a53b91304c98d81d1b3`。原冻结计划为 `.codex-temp/owner-revision-20261020-v1/run-Odfi41/final-plan.json`。

这是新身份表达方法的一对观察实验，不能算作旧坐标实验预算内的第三次尝试。仅调用 `codex/gpt-6-astra` 两次，每次沿用 6000 输出 token 和 60 秒边界，无重试、新 OCR 或全局规划。没有使用诊断中已知路径代填模型回答。

| 范围 | 结果与证据 |
| --- | --- |
| 源接触点审计 | n110 私有接触点 (310,710)，首个实际源样本 (310,712)；`source-contact-audit.json` |
| 新默认预编译 | 窗口 (295,694,632,135)，完整 12 边/1 闭环；`default-gH4XqP/evidence.json` |
| 双观察实际消耗 | 2 次调用、1,604,594 像素；约 67.87 秒包含最终默认编译；`real-oKeW6y/contract.json`、`calls.json`、`summary.json` |
| 双观察共识 | n204、n205、n208 接受完整边身份；n206、n207 两幅观察都返回不确定，按原置信度门禁拒绝；`real-oKeW6y/deferred-relations/evidence.json` |
| 最终默认编译 | **3/11**。下层五条关系依旧整组在 `shared-relation-ambiguous` 拒绝；三条身份共识没有被报告为三条原生编译成功 |
| 冻结 OCR 完整 raw 回放 | **4/11**、68 行 OCR、29 个图像对象、约 69.22 秒；组件、严格语义和原生路径语义均失败；`raw-replay-edge-v1/scope.json` |

本轮没有新的整页 PDR、Office 移动/保存/重开验收或真实共享 Worker 作业。raw 回放是实际重建器消费冻结输入，不等同于新 OCR 或生产端到端验收。没有共享服务的变更、重启、部署、提交或推送。

## 工程验证

- `source-suite-v1.log`：统一 unit 发现器选择的 **195 个文件，1491/1491 通过，零跳过**。新增测试与实际 Worker 消费测试均进入统一发现器。
- `focused-v1.log`：源边、复核与 Worker 消费的最终定向 **15/15**；`edge-worker-negative-v1.log` 另复核破坏性 Worker 反例 **1/1**。未提高测试超时或跳过失败测试。
- `contracts-v1.log`：实际 OpenXML **4/4**，覆盖原生圆角与完整闭环所有物理臂。
- `typecheck-v6.log`：两组 TypeScript 通过。Lint、架构预算、工作区边界和最终安装包消费的确切结果及代码指纹以 `delivery-manifest.json` 为准。没有修改规则、baseline、七项既有架构例外或依赖版本。
- 首轮失败的类型推断和测试夹具日志全部保留。默认编译测试夹具现通过正式 parser 与原对象账本初始化，具有真实 observed inventory；没有用不完整夹具绕过门禁。

## 尚需解决

n206、n207 涉及 Worktree 上方闭环的不同源臂，两幅观察均未提供可接受身份。需要继续研究如何从完整源的颜色连续性、交汇几何或更清晰的独立观察证明关系身份；不能凭期望关系、邻近性、最短路径或枚举顺序选择一臂。该实验的一对观察已用完，不能自动追加重试。

随后仍需完成下层整组、其余未解析关系/原生对象、真实整页组件与语义/视觉门禁及 Office 编辑验收。目标保持 active，未完成，也不因为本次实验未全通过而标记 blocked。
