# 图片转可编辑 PPT：闭环的完整原生路径表示与侧翼方向

本轮把真实原图下层网络从容量和背景侧翼误拒推进到完整源证明。默认编译仍在关系歧义处拒绝整组，完整冻结 OCR 回放保持 **4/11**，整页尚未验收。没有放宽阈值、提高容量、删掉闭环边、按枚举顺序选路，或改写源图。

## 实现

- [source-route-polyline.js](../packages/slideclone-core/routing/source-route-polyline.js) 将一条物理边的全部测量顶点装入同一条开放原生自由路径。逐点保留几何，支持非等比缩放，拒绝代理、访问器、空、超长、非有限和越界输入。不产生源证明或自动重路由能力。
- [source-shared-route-edges.js](../packages/slideclone-core/routing/source-shared-route-edges.js) 只为显式闭环网络规划完整路径；每条渐变边必须先通过既有空间轴拟合。不合适的颜色模型保留分段渐变。部件容量按实际规划的路径和控制对象计数，原上限保持不变。
- [source-shared-route-compiler.js](../packages/slideclone-core/routing/source-shared-route-compiler.js) 消费经私有测量证明冻结的规划标记。每条完整路径保留真实端点、原生箭头和全部中间顶点；关系锚点匹配同时检查完整输出折线和原始源样本。`nativePathGeometry: "source-polyline-v1"` 区分这一精确折线表示；没有将其标记为自动重路由连接器。
- [source-shared-shaft-tree.js](../packages/slideclone-core/routing/source-shared-shaft-tree.js) 的网络拓扑预检采用物理边与接点的最小部件数，后续测量和实际编译分别执行确切部件数门禁。严格 tree API 仍拒绝闭环；原有边数、节点数、四个闭环、512 源样本和四百万几何预算未增加。
- [source-route-linear-sections.js](../packages/slideclone-core/routing/source-route-linear-sections.js) 将独立简化的直线段映射到原始源索引，并再次逐点验证原 .75px 有限线段误差。背景侧翼仅在原 `i-2..i+2` 对称采样模板完全位于同一直线段内部时使用该方向；接点、拐点和短倒角保留原对称局部方向。

侧翼仍在 `width/2+4px` 取样，要求不透明、逐通道误差不超过 18、每条边至少 90% 的样本为真实背景。没有搜索更远背景、把其他边当背景或扩大接点豁免。所有新计算使用原共享预算。

这次网络路径保留测量折线；不宣称完成网络的三次贝塞尔拟合。原有无环树和单线的圆角贝塞尔、空间渐变与模式选择继续接受回归验证。

## 编辑能力和消费链路

`auto` 和 `rounded-freeform` 可消费完整测量路径；`reroutable-elbow` 继续展开为带端点绑定的 Office 连接器。后者如果超过原路径或部件预算会明确失败，不会暗中切换编辑能力。

严格自动重路由语义审计继续拒绝自由路径；显式 `native-path` 策略仅在实际几何、开放路径、描边和两端锚点通过审计时接受。Worker 的每作业策略不变。安装包消费探针现在要求真实 Worker factory 的闭环产物包含 `source-polyline-v1`，并实际检查其路径编辑能力和端点几何。

## 真实原图证据

源图 SHA256：`a6f77ffb75653f04a4ca47d43e9f692b838b3ea43eb15a53b91304c98d81d1b3`。证据目录：`.codex-temp/cycle-polyline-20261021-v1/`。

| 范围 | 当前证据 |
| --- | --- |
| 完整下层源分量 | 窗口 `{x:295,y:694,w:632,h:135}`，12 条压缩物理边、一个闭环；宽度、颜色、箭头、全墨迹覆盖和背景侧翼全部通过；源证明消耗 3,330,865/4,000,000 检查 |
| 部件规划 | 原分段需要 102 个部件，当前完整路径与保留的分段渐变合计 52 个，原容量仍为 100；源证明通过后才进入逻辑绑定 |
| 同一实测 fit 的逐关系独立绑定诊断 | n204：141 源样本/5 条输出边，唯一；n205：223/6，唯一；n208：232/9，唯一；n206/n207：`shared-relation-ambiguous` |
| 默认空页编译 | 3/11；下层整组因歧义拒绝，未采纳这些独立诊断为最终关系凭证 |
| 原图、68 行冻结 OCR、完整 raw rebuilder | **4/11**，29 个图像对象；原生组件、严格语义和原生路径语义均失败；41.28 秒，无新模型调用 |

真实下层网络的 52 个对象尚未作为最终关系图被接收或授予源擦除权限。独立诊断的工作账本只用于定位每条关系的身份问题，不拼接成默认运行的成功凭证。

- `real-bindings-v1.json` 保存当前真实测量 fit 与绑定结果；这一轮的物理源证明已真实通过，不再只是此前的拓扑身份诊断。
- `real-v3.log` 保存默认空页结果，详细输出位于 `.codex-temp/routing-followup-20261021-v1/network-polyline-v3/`。
- `raw-v1.log` 保存完整回放摘要，详细产物位于 `.codex-temp/routing-followup-20261021-v1/raw-replay-polyline-v1/`。
- `flanks-v1.json` 保存修复前的独立侧翼诊断：失败短边原方向为 11/14 个背景样本，独立直线方向为 13/14。最终实现仍保持原 90% 门槛。

## 回归与工程验证

- 新增曲线闭环夹具经过真实源测量：旧分段含 47 个对象，超过原两关系容量 40；当前输出 9 个对象，全部物理边、原始像素和唯一关系路径保留。显式重路由展开仍触发原 `shared-path-budget` 拒绝。
- 新增几何模块测试覆盖反向、非等比缩放、逐顶点恢复、合法极值、空与非法输入、安全拒绝、预算、重复源点、偏离原容差、短倒角和缺失端点。
- 回归检查严格重路由语义仍失败、显式原生路径语义通过；测试没有用 detector 或模式标签冒充编辑能力。
- `route-suite-final-v2.log`：统一 unit CI 发现器选出的路由集合；最终计数和状态见 `delivery-manifest.json`。
- `contracts-v1.log`：OpenXML 实际构建 2/2、Worker 消费及破坏性反例 4/4，共 6/6 通过。自由路径检查真实 `<p:sp>/<a:custGeom>`；只有 `<p:cxnSp>` 才要求实际 Office 连接关系。
- `typecheck-v4.log`：两组 TypeScript 通过。`lint-v1.log`：Lint、2196 文件的架构预算及 1213 文件/20 包的边界通过，七项既有 decreasing-only 例外未增加。
- 安装包验证的最终结果与所有文件/输入指纹见本轮 `delivery-manifest.json`。

初版将直线方向应用到拐点模板，导致旧方环侧翼回归失败；最终限制为整个原模板严格位于段内后，既有闭环和默认场景通过。`linear-tests-v1/v2.log` 与三次类型失败日志保留，未跳过失败测试或修改原小闭环宽度拒绝断言。

## 剩余工作

默认输出没有增长到 7/11，不能把三个独立成功绑定直接当成编译结果。n206/n207 需要更明确、经一致性复核的源路径观察；现有局部 topology observation/schema 尚不支持路径修订，编译反馈也没有消费共享歧义。下一步应在原双观察/32 目标预算内接通这一闭环，保留所有候选的源约束，再修复其余未解析关系和原生对象。

没有重新计算整页 PDR、进行新的 Office UI 编辑验收、运行新 OCR/VLM 或激活共享运行时。没有运行全仓单次 `verify:ci`，也没有提交、推送、部署或重启服务。完整目标仍未完成。此前记录见 [宽度修复](image-to-editable-width-tangent-20261021.md) 与 [闭环契约](image-to-editable-cyclic-network-20261021.md)。
