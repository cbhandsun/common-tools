# 图片转可编辑 PPT 完整交接

交接日期：2026-10-20。工作区：`E:\DEV\WorkSpace\Efficiency\common-tools`。接收方：后续模型及维护者。

**完整可编辑性尚未解决。** 当前源编译完成关系 **2/12**、区域 **7/12**；完整生产重建重放的 PDR **10.237846%**，未达到 ≤8%；语义和原生组件门禁均失败。近期有效完整性增量只有区域 **6→7**。最新两次共享组件实验均失败，未给生产产物带来质量增量。

用户已要求停止当前长时间试错，改为完整交接。工程目标 `帮我全面落地` 当前为 **paused**；本交接不恢复目标、不启动模型或算法实验、不标记完成。本文件和下述指纹清单是新的接手入口；旧 v22 方案中的前向渲染实验已经执行，不能照抄为待办再次运行。

## 快速阅读顺序

1. 读本文件的指标、阻塞、关闭路线及接手要求。
2. 看[原图](E:/DEV/WorkSpace/Efficiency/common-tools/.codex-temp/claude-code-new-image-20261019/source.png)、[当前生产 PPTX](E:/DEV/WorkSpace/Efficiency/common-tools/.codex-temp/owner-revision-20261020-v1/run-Odfi41/production-rebuild/compiled/deck.pptx)和[当前 Office 渲染](E:/DEV/WorkSpace/Efficiency/common-tools/.codex-temp/owner-revision-20261020-v1/run-Odfi41/production-rebuild/office-before.png)。
3. 读[owner 修订终态](E:/DEV/WorkSpace/Efficiency/common-tools/.codex-temp/owner-revision-20261020-v1/closeout.json)、[整页验收记录](E:/DEV/WorkSpace/Efficiency/common-tools/.codex-temp/owner-revision-20261020-v1/run-Odfi41/production-rebuild/artifact-validation.json)，区分源组件和完整生产产物。
4. 读最新实验的[candidate 1](E:/DEV/WorkSpace/Efficiency/common-tools/.codex-temp/shared-forward-render-20261020-v1/candidate-1-result.json)、[candidate 2](E:/DEV/WorkSpace/Efficiency/common-tools/.codex-temp/shared-forward-render-20261020-v1/candidate-2-result.json)及[覆盖上界](E:/DEV/WorkSpace/Efficiency/common-tools/.codex-temp/shared-forward-render-20261020-v1/coverage-upper-bound.json)。
5. 按下面的代码入口检查主瓶颈。需要历史背景时，再读[旧方案](E:/DEV/WorkSpace/Efficiency/common-tools/docs/image-to-editable-action-plan-20261019.md)的 v22、v21、v19；不要先全文重读长历史。

## 需求和验收边界

目标是将原图转换为视觉保真、能够实际编辑的 PPTX，修复必须提高通用能力。图标和图示允许高精度透明抠图；文字、容器、结构线和箭头要求原生表达。关系必须在移动源节点、目标节点或控制点后保持正确连接，箭头正确跟随，并通过保存、关闭、重开。

最终验收必须绑定同一个源、计划、源码版本、IR、PPTX 和渲染：

- 完整关系 12/12，完整区域 12/12，冻结分母、ID、引用和失败义务不变。
- PDR≤8%、Missing≤12%、MAD≤12，原生组件、语义和来源门禁全部通过。
- 真正 Office 编辑、保存、关闭、重开、连接跟随通过；整页能够打开不等于整页可编辑。
- 完整 live Worker、OCR、控制图、原预算、统一 CI、实际安装消费通过。

禁止图片 hash、标题、颜色、坐标或 ID 特例；本文中的对象 ID 仅用于定位证据。禁止整图图片、残差图片或固定路线轮廓冒充可编辑性；禁止放宽阈值、提高 baseline、删失败义务或跳过测试造绿。

## 当前方案和架构

保留既有 OCR、场景模型、原生组件、透明图标抠图和 OOXML writer。模型负责提出区域、对象和关系，源像素及拓扑证明决定能否编译和擦除。完整区域、共享关系图及其成员按一致的清单提交，最终生产重建负责文字显现、语义处理、源编译、残差和最终化，再执行实际渲染与质量门禁。

| 层 | 代码入口和职责 |
|---|---|
| Worker | `packages/slideclone-worker-adapter/team-worker.js`：作业与质量编排，已有体积超限，不能继续堆业务 |
| 服务装配 | `packages/remote-mcp-server/image-native-rebuilder.js`、`source-scene-runtime.js`：注入重建与观察能力 |
| 生产重建 | `packages/slideclone-core/team-native-rebuild.js` 的 `createRawImageNativeRebuilder`：完整生产处理链 |
| 计划及恢复 | `source-scene-planner.js`、`source-scene-local-review.js`、`source-scene-deferred-regional-review.js` |
| owner 修订 | `source-scene-owner-revision.js`、`source-scene-owner-revision-review.js`：纯修订合同与观察编排 |
| 源编译及共享图 | `source-scene-compiler.js`、`source-scene-shared-route-stage.js`、`source-shared-route-measurement.js`、`source-shared-route-compiler.js` |
| 可编辑门禁 | `semantic-editability-quality.js`、`native-component-quality.js` |
| writer | `packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/`，真实 Office 兼容性需要实测 |

表中未写目录的模块均在 `E:\DEV\WorkSpace\Efficiency\common-tools\packages\slideclone-core\`。

## 当前可信指标

权威产物目录：`E:\DEV\WorkSpace\Efficiency\common-tools\.codex-temp\owner-revision-20261020-v1\run-Odfi41\production-rebuild\`。

这是冻结 **68 行 OCR 和当前计划**、通过真实 `createRawImageNativeRebuilder` 执行的完整生产重建重放，产出 70 个文本框；**不是新鲜 live Worker 或 OCR 验收**。

| 项目 | 当前结果 | 判定 |
|---|---:|---|
| 冻结／接纳／源编译完整关系 | 12／11／2 | 仍为 2/12，不能作为整页编辑合格数 |
| 完整区域 | 7/12，原为 6/12 | 增加 1 个完整区域 |
| PDR | 10.2378463213% | 失败，超过门槛 2.237846 个百分点 |
| Missing | 3.8182401504% | 通过 ≤12% |
| MAD | 10.8741969936 | 通过 ≤12 |
| semantic-editability | false | 唯一发现 `large-raster-lineage` |
| fixedRelationshipPaintCount | 0 | 危险的固定关系轮廓未重新放行 |
| native-component | false | unresolvedSceneComponents=25，原为 28；这是聚合计数，不是 25 个独立根因 |
| Office 整页打开 | 通过 | 新增图标移动、保存、关闭、重开和几何保持也通过 |
| 全页 12 条关系 Office 编辑 | 未验证 | 不能由整页打开或单关系组件通过推导 |
| 完整 Worker、控制图、统一 CI | 未通过完整验收 | 仍是最终缺项 |

修订区域单独的 PDR 为 11.4163%，仍未通过；区域结构完成不等于该区域视觉达标。完整生产重放耗时 47.31s、额外模型调用 0 次。

不要沿用旧产物 PDR 7.8839%。`native-work/ir/deck.json` 是 68 个文本框 hidden/opacity 0 的中间稿，其渲染不能支持整页视觉结论；只做文字显现的中间预览 PDR 14.13% 也不是最终数值。这些不同阶段不能拼接成质量提升曲线。

## 已完成的有效修改

| 修改 | 真实收益 | 证据和局限 |
|---|---|---|
| `source-compound-route-geometry.js` 优先选择已有原生折线证明 | 修复固定轮廓优先返回、遮蔽既有原生表示的接线问题；新增 A 关系可真正跟随编辑 | `native-connector-priority-20261020-v1/`：13 个连接器、12 控制点、1 终端箭头、0 固定轮廓。真实 Office 移动源／目标／控制点、保存重开通过；关系总数仍 2/12 |
| `semantic-editability-quality.js` 拒绝固定关系轮廓 | 补上“freeform 主体＋两端短线”被误判可编辑的验收漏洞 | 固定主体在节点移动时不跟随的真实反例；不能删除此门禁 |
| `source-scene-regional-inventory.js` 携带 `existingRelations` | 区域观察能够看到既有关系，帮助恢复新增 A 提案 | 不是缺失关系无安全 core 的完整恢复 |
| owner 原子修订及 local/deferred 接入 | 恢复错误 seed 对象 `object-n125`；`region-n9` 原 4 个成员全部物化，区域 6→7 | `owner-revision-20261020-v1/`；仅冻结图标清单完整、恰一成员在 owner 外、其他身份唯一、双观察一致时允许修订 |

owner 修订保留 ID、引用、历史失败、原预算和源门禁。真实观察仅 2 次，12.73/13.70s，279,940 pixels；观察加第一次源编译 37.56s。不要为了交接重新跑模型。

最近一次实际 pack/install：3,688,215 bytes、1,753 文件、20 包。同观察重放得到相同计划，源编译仍 2/12 和 7/12，shape 和 18 个图标资产一致。`installed-consumer.json` 的 `semanticPassed:true` **只针对源组件**；完整生产产物 semantic=false。最新比较器添加后尚未重新打包，因此该包不能证明最新比较器被安装消费。

## 最新两次实验及关闭结论

目录：`E:\DEV\WorkSpace\Efficiency\common-tools\.codex-temp\shared-forward-render-20261020-v1\`。

实验采用完整上方共享组件：3 条物理边、2 条逻辑路径、唯一公共主干、8 个原生连接器；实际 writer 写入 PPTX，再用 PowerPoint 真正导出。旧几何只作候选提议，不授予源证明。

| 候选 | 源墨迹支持率 | 输出墨迹支持率 | 结果 |
|---|---:|---:|---|
| 1，完整共享组件实际前向渲染 | 38.033395% | 42.177808% | 不接纳 |
| 2，按候选 1 渲染响应提名整组位移和颜色，再真正渲染 | 35.807050% | 39.371155% | 不接纳，关闭该方法 |

源墨迹均为 1,617 pixels；比较计数分别为 3,664,596 和 3,858,376，要求双向支持达到 90%。这是组件实验，**不是完整生产 Worker 或全页验收**；两次均未进入生产，当前业务指标仍 2/12、7/12。

候选 1 的实际覆盖范围即使允许逐像素任意颜色及背景 ±18，支持率上界也只有 **77.551020%**，另有 132 个源笔画像素完全没有输出覆盖。这证明该固定候选不能只靠调颜色修复，**不证明所有原生表示均不可能**。

新增 `packages/slideclone-core/source-native-render-comparison.js` 和 `test/source-native-pixel-comparison.test.js`，并纳入 `tsconfig.boundaries.json`。比较器对完整 sourceMask 与额外输出笔画双向比较，带预算和输入守卫。**它尚未接入生产接纳、源编译或擦除权限**；`hasSourceInk` 只表示非空，不能证明 mask 完整。不能宣称新恢复／证明合同已经落地。

候选 1 最初渲染已成功，随后分析误读 `page-001.png` 导致 ENOENT；实际为 `page-1.png`，后来仅分析已有渲染修正，没有增加候选次数。旧 `failure.json` 保留。`callerRetries:0`，Office 导出内部 attempts 未埋点，不能宣称全链路零重试。两脚本支持 `--analyze-existing`，但不要据此重新渲染或启动第三次调参。

## 主阻塞和剩余缺口

### 关系生成的主要阻塞

11 条已接纳关系中，2 条完成、9 条未生成：上方 2 条首拒绝 `shared-junction-paint`，下方 5 条 `shared-gap-background`，另 2 条虚线 `shaft-support`。另有 1 条未接纳关系，不能与这 9 条重复计数。

`source-scene-shared-route-stage.js:59` 在没有 fit 时直接 continue，第 62 行之后才调用 `compileSharedSourceRoute`。因此这 **7 条共享关系目前卡在源证明阶段，尚未进入 writer**；不能归因于 writer 消费丢失，也不能把继续修图标当成关系主指标的出口。

`source-shared-route-measurement.js:131–141` 对三臂接点首 4 个原始像素要求近同色。`direction-decision-20261020-v2/` 所核验的 `known-geometry-paint.json` 中，12 个已知几何辅助正例有 4 个误拒。它证明规则有辅助反例，不能直接作为当前图应当放行的依据。最新实际渲染同样失败，说明不能把问题归结为删掉一个检查即可解决。

### 缺失关系恢复仍未接通

原 `relation-n200` tuple 不合法、没有安全 core。`source-revision-required` 仍主要是状态与证据出口，缺少实际新修订执行出口。owner 修订解决的是一个图标定位问题，没有解决这条缺失依赖；不能将新增 A 改名消账。

重点入口：`source-scene-recovery-policy.js` → `source-scene-planner.js` → `source-scene-local-review.js` → `team-native-rebuild.js`。现有追加 deferred review 也不是独立的全新源修订事务。

### 剩余五个区域和整页门禁

| 区域 | 当前缺项 |
|---|---|
| n0 | `object-n136`，`icon-source-text` |
| n3 | 缺完整程序，依赖未完成关系 |
| n4、n6、n8 | `container-perimeter / outline-no-closed-component` |

n9 已产生完整性增量，不要重复处理。大型残差谱系、整页 PDR 和完整原生组件仍未通过；必须完成真实物化后再检查残差是否能自然退役，不能删除标记绕过语义门禁。

## 已关闭路线

以下方法已失败或被真实 Office 反例否定，不能改名、换参数后重新计两次：

- `joint-2d-probe`，三边最佳支持 42.22%／43.54%／41.72%。
- `joint-native-preset-probe`，三边最佳支持 37.80%／63.00%／36.67%。
- 固定骨架加采色／线宽微调；独立 Office 预设兼容原型、W1、body shadow 调参。
- 当前任意 custom `p:cxnSp` 实现，真实 Office 无法打开。
- freeform 主体加短连接器，主体／箭头不跟随，属于假可编辑。
- 本文最新两次完整预设共享图前向渲染及响应校准方法。

旧失败证据在 `E:\DEV\WorkSpace\Efficiency\common-tools\.codex-temp\direction-causal-review-20261020-v1\`。这些结论约束具体方法，不构成原生引擎整体无能力的证明。当前也没有证据保证换模型、换引擎、GPU 或 Back2Struct 可以解决；本机仅 4GB 显存，用户没有其他 GPU 环境。此前已暂缓手绘图。

## 工程验证和工作区状态

- owner 修订：受影响 15 文件 **153/153**，失败／跳过／取消 0；主类型、严格边界类型、定向 Lint 通过；实际安装消费完成。
- 最新比较器：**6/6** 回归通过，统一 unit CI 可发现；两份类型、定向 ESLint 通过。它只证明比较器合同，不代表源候选成功。
- 原架构仍 **4 文件、7 项超限**，没有新增超限或提高 baseline；完整 CI 未通过，新鲜安全门禁未完成。
- 既有超限：compiler imports 19>15；team-native-rebuild imports 31>15；team-worker 8459 行／506539 bytes／48 imports；Worker 测试 6781 行／387637 bytes。
- 本轮交接仅核对文档、JSON、指纹和工作区清单，不重新跑模型、Office、打包或完整 CI，不改生产代码。

统一验证入口可在恢复工程工作后按修改风险使用：`npm run typecheck`、`npm run lint`、`npm run test:unit`、`npm run test:contract`、`npm run test:integration`、`npm run verify:architecture-budgets`、`npm run verify:ci`。已有局部绿灯不能替代最终门禁。

仓库为 `main`，交接时 HEAD 为 `612533b1d1798f6f31e1f9f78f5cc84f4288e995`，大量既有 tracked dirty 和 untracked 文件尚未提交。完整清单见[dirty inventory](E:/DEV/WorkSpace/Efficiency/common-tools/.codex-temp/image-to-editable-handoff-20261020-v1/dirty-inventory.json)。清单包含其他既有工作，不能将所有文件归为本任务或批量提交。不要 reset、clean、`git add -A`，不要杀其他服务进程。

`.codex-temp` 通常被 Git 忽略，含不可替代的证据。换工作区或机器时必须保留本文列出的证据目录及当前未提交源码，不能只复制 Git HEAD。没有打包整个仓库或上传任何材料。

## 指纹和复核入口

输入为 1086×1448 的当前源图，SHA256：`a6f77ffb75653f04a4ca47d43e9f692b838b3ea43eb15a53b91304c98d81d1b3`。

| 权威对象 | SHA256 |
|---|---|
| `run-Odfi41/final-plan.json` | `d2dd32f3127900390041dd4cd5980e0ed1101e0db8626606343c483c3359d32c` |
| `production-rebuild/compiled/deck.json` | `242b9b36db8a2d7744530a8f2aac0d492a2196bfe9a0550955adc3a8cd111757` |
| `production-rebuild/compiled/deck.pptx` | `d15eda1eeec332b4d355e1e57e75ea15c0927d5aaabb039e2536a5fce8b96839` |
| `production-rebuild/office-before.png` | `60eabe238d8e6343003eb3badc146942215d1c3b9c9e3860ae6207be76979a55` |

这些相对路径位于 `E:\DEV\WorkSpace\Efficiency\common-tools\.codex-temp\owner-revision-20261020-v1\` 下；计划直接位于 `run-Odfi41/`，表内生产产物也在该 run 中。

[机器可读 manifest](E:/DEV/WorkSpace/Efficiency/common-tools/.codex-temp/image-to-editable-handoff-20261020-v1/manifest.json) 记录关键源码、测试、计划、IR、PPTX、渲染、指标证据和本文的当前 hash，并核对 owner closeout 的 6 份源码及 4 份产物绑定。它不包含密钥、headers、原始模型回复或源码正文。

只读证据核对及本地清单生成脚本为[snapshot.cjs](E:/DEV/WorkSpace/Efficiency/common-tools/.codex-temp/image-to-editable-handoff-20261020-v1/snapshot.cjs)。在仓库根目录执行：

```powershell
& 'E:\DEV\DEVENV\nodejs\node.exe' '.codex-temp/image-to-editable-handoff-20261020-v1/snapshot.cjs'
```

脚本只读取明确列出的证据、查询 Git、重写本交接目录中的两份清单，不触发模型、Office、生产服务或测试。PowerShell 写出的 JSON 可能带 UTF-8 BOM，接手读取时应移除开头 `\uFEFF`。

## 接手后的技术决策要求

首先保持当前暂停状态，完成阅读和判断；用户重新授权工程工作后，再选择下一项实现。不要直接执行旧 v22 的“唯一下一工作包”。

主关系问题需要重新裁决：完整源笔画所需曲线、宽度、背景、接点和当前原生输出究竟存在什么实际差异；下一候选必须对表示、完整源证明或生产消费合同带来实质变化，并说明如何覆盖这些差异。现有证据不支持继续采色微调，也不支持承诺替代引擎一次成功。

若优先修缺失关系恢复，应把无安全 core 的独立源修订做成可测试事务，保持 ID、引用、历史拒绝、双观察和原预算；不能把 owner 图标修订当作它已实现。任何新增比较／证明能力必须明确接入生产准入、编译及擦除权限的哪一层，不能停在孤立 helper。

每个候选先写明确业务验收，再实施；最多两次完整验证，无完整关系／区域及真实编辑增量就关闭。报告同一产物的关系、区域、三项视觉、语义／原生、Office 和 CI 情况。测试数量、代码量、拒绝码变晚和包安装成功都不能表示质量增长。

必须遵守用户提供的 Debug / Production Engineering 指令：入口仅装配、独立可测模块、外部输入 parse/coerce/validate/sanitize、未知输入用 unknown 和守卫、不新增显式 any、安全日志、bug 回归进入统一 CI、直接依赖声明、适当类型／Lint／测试／构建／安全门禁，保留无关修改。当前交接不创建子代理，不提交、部署或更改共享服务。

此前隔离验收授权为 `codex/gpt-6-astra`；global 90s，local 60s／6000 tokens，32 目标／批、16 批，作业 540s，不隐式重试。这些是既有隔离验收边界，**不代表当前交接可以启动调用**，也不授权更改共享服务、路由、认证或默认模型。

## 可直接交给下一模型的开场说明

> 请先读取 `E:\DEV\WorkSpace\Efficiency\common-tools\docs\image-to-editable-handoff-20261020.md` 和其 manifest，核对当前工作区指纹。当前完整可编辑性未解决：关系2/12、区域7/12、PDR10.237846%、Missing3.818240%、MAD10.874197，语义和原生组件失败。近期只有区域6→7；最新两次共享图真实前向渲染实验失败，该路线关闭，旧v22下一步已过时。工程目标paused，本次先接手分析，不启动实验。请明确区分源证明、writer表示、生产消费与完整验收；保留dirty和证据，遵守原门槛，避免局部细节循环。需要恢复实施时，请按用户的新指示行动。
