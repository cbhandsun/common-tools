# 图片转可编辑 PPT：短斜边横截面方向修复

本轮修复真实图片共享闭环中的一个宽度误拒。完整冻结 OCR 回放仍只解析 4/11 条关系，整页尚未达标。没有修改源图片、放宽阈值、提高容量或工作预算，也没有提交、推送、部署或重启共享服务。既有未提交修改与历史失败证据保留。

## 根因与实现

原宽度测量以 `path[i+2] - path[i]` 估计切向。短斜线的数字台阶偶尔使这个局部弦变成竖直，随后水平横截面会撞上另一支真实笔画，无法在原 12px 扫描内找到两格连续背景。这与实际笔画宽度过大不同。

- [source-route-coverage-width.js](../packages/slideclone-core/routing/source-route-coverage-width.js) 增加可选内部 `linearDirection`，拒绝代理、访问器、非有限、零或越界向量。没有该字段时保留原行为。缓存身份包含实际截面方向。
- [source-shared-route-edges.js](../packages/slideclone-core/routing/source-shared-route-edges.js) 仅在既有逐直线段宽度回退中，使用独立源折线简化得到的直线段方向。样本仍位于原始源中心线上，没有移动、平滑或删除源墨迹。
- 保留 5px 宽度上限、12px 扫描上限、两侧各两格真实背景、透明度检查和四百万共享几何工作预算。颜色、全源覆盖、背景侧翼和关系身份仍须各自通过；该方向本身不授予擦除或源证明权限。

没有采用调整数字台阶邻域半径的尝试。该尝试未解决原图且改变了部分小闭环行为，已撤回。原有半径 5/6 的近邻闭环拒绝回归保持原断言并通过。

## 有效回归

[source-route-width-tangent.test.js](../test/source-route-width-tangent.test.js) 使用 8 邻接数字台阶，每个源点均在同一直线段的原 .75px 容差内，并保留独立邻线。

同一源夹具、同一方向下，修改前测量返回 `null`，当前返回 3px；当前原局部切向仍返回 `null`，因此不是通过隐藏邻线或放宽原门禁制造通过。测试覆盖源缓冲不变、源顺序反转、缓存方向隔离、空路径、极值方向、宽笔画、空白、透明、截断、缺少真实背景、预算耗尽，以及代理/访问器不执行。统一 CI 的 unit 发现器已发现新测试。

早期测试使用规则斜率，无法复现缺陷；另一个夹具没有满足简化容差。这些失败日志保留，最终夹具已补上源点邻接和独立简化断言。差分证据为 `.codex-temp/cycle-width-20261021-v1/synthetic-differential.json`。

## 真实图片与剩余门禁

源图 SHA256：`a6f77ffb75653f04a4ca47d43e9f692b838b3ea43eb15a53b91304c98d81d1b3`。输入仍是原图和冻结计划，没有新的模型调用。

| 范围 | 当前结果 | 证据 |
| --- | --- | --- |
| 下层短斜边的宽度回退 | 窗口源点 `(284,56) → (291,68)`，独立段方向 `(7,12)`，宽度约 2.7101px | `parts-diagnostic-v1/result.json` |
| 原图空页编译 | 3/11；下层拒绝码从 `shared-shaft-width` 变为 `shared-parts-budget` | `run-chord-real-v1.log`；详细结果在 `.codex-temp/routing-followup-20261021-v1/run-chord-width-v1/` |
| 原图、68 行冻结 OCR、完整 raw rebuilder | **4/11**，29 个图像对象；原生组件、严格语义、原生路径语义均失败；155.44 秒 | `raw-replay-tangent-v1.log`；详细结果在 `.codex-temp/routing-followup-20261021-v1/raw-replay-tangent-v1/` |

表中短文件名均相对于 `.codex-temp/cycle-width-20261021-v1/`。

下层拓扑当前有 12 条压缩边；接回三个箭头前为 96 个部件，接回后为 102 个，现有容量为 100。既有最少折线回退把其中一条 5 顶点边替换为 6 顶点，最终仍以容量失败。离线逐边最少折线诊断也未证明存在满足全部原路径样本且低于容量的表示。不能靠提高上限或删除闭环的一段放行。`parts-replay-v1.json` 保存诊断，不构造源证明。

**真实下层网络在容量门禁即退出，后续全墨迹覆盖和背景侧翼尚未验证。** 宽度通过、颜色测量通过、拒绝码变晚均不是该网络通过的证明。此前已独立确认 n206/n207 的冻结 `shaftBox` 各对应两条简单路径；即使后续解决表示容量，仍需更明确的源路径观察，不能按遍历顺序选路。

下一步应先在原容量内建立可验证的完整网络表示，并检查全源覆盖/背景侧翼，再将共享歧义安全接入现有有界双观察路径修订。上下文见 [闭环网络记录](image-to-editable-cyclic-network-20261021.md)。历史手工候选 PDR 7.885% 不属于本轮结果。

## 验证与交付边界

本轮日志、最终代码/输入指纹和测试清单保存在 `.codex-temp/cycle-width-20261021-v1/`。最终验证汇总由 `delivery-manifest.json` 记录，避免复用上一轮已经过时的文件指纹。

- `route-suite-final-v1.log`：统一 unit 发现器选出的 36 个路由、共享网络、复合路由和相关场景测试文件，184/184 通过，零跳过。
- `tangent-final-v2.log`：新增回归补上空路径和合法极值方向断言后 3/3 通过；`typecheck-final-v1.log`：两组 TypeScript 检查通过。
- `consumer-contract-final-v1.log`：OpenXML 实际构建 2/2、Worker 消费及破坏性反例 4/4，共 6/6 通过。
- `lint-final-v1.log`：Lint、2192 文件的架构预算、1211 文件/20 包的工作区边界通过，既有七项 decreasing-only 例外未增加。
- `runtime-package-final-v1.log`：实际打包、安装和消费验证通过，1797 文件/20 包/3,766,616 字节，Worker 消费及生产依赖闭包均通过。这是本地安装包验证，没有激活共享服务。

没有重新计算整页 PDR，没有新 Office UI 编辑验收，也未激活共享运行时。没有声称运行全仓单次 `verify:ci`。当前目标仍未完成。
