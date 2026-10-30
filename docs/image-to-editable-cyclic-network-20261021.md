# 图片转可编辑 PPT：闭环网络与关系路径绑定

本轮继续修复共享连线的拓扑契约和默认消费链路。原始整页验收仍未通过；不能把闭环合成测试通过、拒绝码变化或安装包通过视为真实图片质量增长。既有迁移和未提交修改保留，未提交、推送、部署或重启共享服务。

## 实现与兼容边界

- 默认逻辑关系 stage 显式请求 `sourceNetwork: true`。物理网络保留闭环所有边，继续逐边测量宽度、颜色、箭头、外部背景和全部源墨迹覆盖。网络上限为四个独立闭环，原有四百万几何预算不变。
- `sourceSharedShaftTree` 和 `inspectSourceSharedShaftTree` 仍拒绝闭环。没有把旧 tree/null 契约改成任意图，也没有删除闭环的一段来凑出树。
- 关系绑定从单一 BFS 前驱表改成有预算的全部简单路径搜索。每条关系必须由自己的源位置范围或显式 `visiblePath` 唯一确定。两个候选均符合时返回 `shared-relation-ambiguous`，不按边、端点或关系枚举顺序选择。超出 15 条边、512 个源路径样本或工作预算时拒绝，不把尚未检查的候选当成不存在。
- 位置范围同时约束实际输出几何和原始源路径。树的正交化移动不能替一个没有原始像素交集的路径制造身份。显式路径在编译入口重新解析，代理、访问器、非法坐标和不支持的结构在执行用户代码之前拒绝。
- v5 inventory 的图增加显式 `topology: "source-network-v1"` 判别字段；没有该字段的图仍必须是树。网络保留可以不被某条简单逻辑路径经过的物理闭环边。所有节点和边都必须真实存活，缺失任一物理边即使它未被逻辑路径引用，也使整张网络的路径凭证失效。源擦除读取同样要求完整、未改动且仍带私有证明的输出，序列化副本不能取得擦除权限。
- 闭环暂时保留已测量折线和独立原生锚点，不调用可能合并相邻接点的树正交化求解器。三个 corner mode 都遵守这一边界；本轮不宣称完成闭环圆角优化。原有无环树的圆角和渐变输出继续保留。
- 真实 Worker factory 的安装包消费探针增加闭环输入：确定性 provider 观察、实际 rebuilder/scene compiler、最终 inventory、所有原生成员和旧箭头退休均进入断言。探针不调用真实模型、OCR、Office 或共享服务。

主要实现位于 `packages/slideclone-core/routing/source-shared-route-path-binding.js`、`source-shared-route-compiler.js` 和 `scene-plan/source-scene-shared-route-inventory.js`；生产装配位于 `scene-plan/source-scene-shared-route-stage.js`。本轮未修改 Worker 的默认编辑能力策略。

## 原始图片的结果与剩余阻塞

证据目录：`.codex-temp/cycle-network-20261021-v1/`。原始图片 SHA256 仍为 `a6f77ffb75653f04a4ca47d43e9f692b838b3ea43eb15a53b91304c98d81d1b3`。

| 输入与范围 | 结果 | 证据 |
| --- | --- | --- |
| 原始像素、冻结计划、空页编译 | 3/11 关系；下层完整分量仍拒绝 | `real-probe-v3.log`；详细输出在 `.codex-temp/routing-followup-20261021-v1/network-final-v3/` |
| 原始像素、68 行冻结 OCR、冻结计划、完整 raw rebuilder | 4/11 关系，29 个图像对象；原生组件、严格语义、原生路径语义门禁均失败 | `raw-replay-v4.log`；产物在 `.codex-temp/routing-followup-20261021-v1/raw-replay-network-v4/`，用时 60.89 秒 |
| 仅拓扑与计划身份诊断，不授予源证明 | n204、n205、n208 唯一；n206、n207 存在歧义，反转边顺序结果相同 | `real-identity-only.json`、`inspect-real-identity.cjs` |

下层物理网络有一个独立闭环、12 个接点和 12 条压缩边。旧代码在删环后留下未表示墨迹；当前完整网络不再删环，但窗口内 `(284,55) → (291,68)` 的短斜边仍不能通过自己的横截面宽度证明，返回 `shared-shaft-width`。其 15 个中心线样本及 14 个样本的分段尝试均保留于 `width-rejection-9.json` 和 `width-rejection-10.json`。不能借邻边宽度、放大接点覆盖、增加色差容差或把缺失背景当作空白来放行。

此外，n206/n207 的冻结 `shaftBox` 同时与两个闭环路径相交。因此即使解决物理笔画表示，这两条逻辑关系仍需要更明确的源路径观察。`real-identity-only.json` 只说明这一身份歧义，不证明颜色、宽度、箭头或整体可接受性。下一步需要：为相互接近的局部笔画建立独立可验证的表示／宽度证明，再通过已有显式路径观察契约解除歧义；不得根据第一次遍历结果补写路径。

本轮未重新计算整页 PDR，未进行新的 Office UI 编辑验收，未调用新的 OCR/VLM，未将配置激活到共享运行时。历史手工候选的 7.885% 不属于本轮结果。

## 验证

- `source-suite-v1.log`：182 个选定源场景／源路由／共享路由／Worker 策略文件，1428/1428 通过。此集合运行后新增的近邻闭环宽度反例进入最终聚焦集合。
- `focused-final-v4.log`：最终闭环网络、路径绑定、旧树、多接点及 inventory 回归 37/37 通过，包含源缓冲不变、枚举与方向置换、显式路径、重复／缺失身份、代理／访问器、预算和过长候选、未引用边缺失、源擦除私有证明与 CI 发现。
- `openxml-contract-final-v2.log`：最终 2/2 实际构建契约通过。新增契约在三种 corner mode 下检查所有闭环边、全部连接器的两端绑定及两个原生箭头。既有圆角／渐变契约继续通过。这是 OpenXML 构建证明，不是 Office UI 验收。
- `worker-consumer-network-v1.log`：4/4 消费探针及破坏性反例回归通过，覆盖实际 Worker factory 的闭环输入、混合方向、多接点与旧箭头退休。
- `typecheck-final-v3.log`：两组 TypeScript 检查通过。`lint-final-v2.log`：Lint、2191 文件的架构预算、1211 文件／20 包的工作区边界均通过，既有七项 decreasing-only 例外未增加。
- `runtime-package-final-v2.log`：实际打包、安装和消费验证通过，包括新增的 Worker 闭环消费探针。归档 3,762,861 字节、1796 文件、20 个包，生产依赖闭包通过。最终结果及文件指纹见 `delivery-manifest.json`。

早期 `network-v3/v4/v5.log` 保留失败：合成场景的窄 shaftBox 未覆盖完整接触点，或未满足共享组搜索条件。修正夹具为完整观察窗口及明确、经源样本核验的路径程序后通过，未扩大生产观察窗口或放宽源证明。`typecheck-v1.log` 的可选属性类型错误也保留，已修正为仅在字段存在时传递。

本轮没有运行全仓单次 `verify:ci`，也没有升级依赖、提高 baseline、关闭规则或跳过失败测试。所有新增回归由统一 CI 测试发现器纳入。
