# 图片转可编辑 PPT：共享路径的双观察复核

本轮接通共享路径歧义的编译反馈、严格传输、源坐标映射、双观察一致性和实际 Worker 消费。真实原图的下层整组尚未通过最终源证明，整页尚未验收。没有扩大路径、目标、像素、调用或超时预算。

## 修复

- [source-scene-compile-feedback.js](../packages/slideclone-core/scene-plan/source-scene-compile-feedback.js) 读取 `sharedRoutes.rejected` 的固定歧义、重复和路径程序失败码。只提名仍未解析的当前关系；未知消息、外部 ID、代理、访问器、稀疏数组和超容量输入不能进入提示词。
- [source-scene-topology-review.js](../packages/slideclone-core/scene-plan/source-scene-topology-review.js) 为既有关系预留路径复核目标，保留源哈希、尺寸、所有者、端点、方向、源锚点和原关系快照。普通端点修订、位置补全、完整路径复核是不同的每索引传输形状。仍共享 32 个局部目标及原 24 个关系目标上限。
- [source-scene-local-response.js](../packages/slideclone-core/scene-plan/source-scene-local-response.js) 的 `relationPathIndices` 明确绑定需要 `visiblePath_2d` 的索引。普通索引保持原四字段；位置补全与路径复核不能重叠。schema、解码器、提示词、主局部复核和延迟复核使用相同约束。
- [source-scene-path-review.js](../packages/slideclone-core/scene-plan/source-scene-path-review.js) 将每个观察分别从其第一幅原始 atlas 映射回源坐标，限制在自己的原始 tile 与所有者内。完整路径继续最多 16 个顶点，支持类型、坐标、非有限值、空段、安全容器、锚点和过期快照检查。缺失或不一致时保留原关系，不合成折中路径。
- [source-scene-path-consensus.js](../packages/slideclone-core/scene-plan/source-scene-path-consensus.js) 在原 **1.5px** 容差内检查有序连续折线的一致性：使用凸自由空间的可达区间，同时约束整段几何、两端和单调遍历。不同共线分段不会被误当作不同拐点；倒序或同一轨迹上的不同回环次序仍失败。最多 225 个单元，没有搜索、平均、额外源扫描或调用。
- 路径修订可保留同一实体对的不同完整路径提案；相同提案仍触发重复回滚。[source-shared-route-compiler.js](../packages/slideclone-core/routing/source-shared-route-compiler.js) 另外拒绝正向或反向重复的**实际测量边序列**，不能用同一物理路径填两个关系槽。
- [source-scene-local-review.js](../packages/slideclone-core/scene-plan/source-scene-local-review.js) 先按原快照接收同批区域成员程序，再应用仅限制路径的修订，最后通过正常程序重绑定。普通端点修订的顺序保留。没有改写任务指纹、接受过期任务或增加观察波次。
- [runtime-shared-route-consumer.js](../scripts/lib/runtime-shared-route-consumer.js) 增加真实 Worker factory 场景：全局计划没有路径，两次局部请求必须实际携带新 schema；局部路径随后进入默认编译器、完整闭环 inventory、原生编辑能力及旧箭头替换检查。模型、OCR 和合成器适配器为确定性测试替身，不调用共享服务。

通过观察一致性仅接收提案。物理网络完整性、唯一关系绑定、宽度、颜色、箭头、背景侧翼、私有源凭证、容量、源擦除和最终语义门禁继续由原编译链独立验证。

## 真实原图

输入 SHA256：`a6f77ffb75653f04a4ca47d43e9f692b838b3ea43eb15a53b91304c98d81d1b3`。输入仍为已有原图和冻结 OCR/计划；没有新建全局计划或改写源图。

证据目录：`.codex-temp/path-review-20261021-v1/`。

| 验证范围 | 结果与证据 |
| --- | --- |
| 从真实编译失败提名 | 7 个复核目标中，5 个为下层路径目标；`real-targets.json`。诊断没有生成路径或凭证 |
| 实际限定观察 | `real-n84xAO/`，沿用已配置 `codex/gpt-6-astra`，两次局部调用均成功；各 60 秒/6000 输出 token，零重试，5 个既有关系，合计 1,604,594/4,000,000 像素 |
| 原始顶点逐项比较 | 误拒全部 5 条；原日志与观察保留在 `real-review-v1.log` 和该运行的 `deferred-relations/evidence.json`，未覆盖失败结果 |
| 有序连续共识回放 | 复用同两次观察，新增调用 0；n204、n205、n207 接收为提案，n206、n208 仍为 `path-consensus`；`real-consensus-replay-v1.log`、`replayed-review-evidence.json` |
| 默认空页编译 | **3/11**；下层整组在 `shared-path-program` 拒绝，未产生整组源擦除权限；`real-n84xAO/replayed-compile-evidence.json` |
| 源路径差异诊断 | 首个失败 n204：141 个实际源样本、10 个观察顶点；源到提案最大距离 1.88px、提案顶点到源样本最大距离 3.82px，超过原 1.5px；`source-path-fit-diagnostics.json`。这是不参与接收的独立只读诊断，没有改写原门禁或预算 |
| 完整 raw 回放 | 结果见 `raw-reviewed-v1.log` 与 `raw-replay-reviewed-v1/scope.json`；使用冻结 68 行 OCR 及本轮复核后的计划，回放不再调用模型 |

提案之间相符，不代表提案已逐点吻合实际源中心线。当前三个已接收提案仍未让整个下层网络通过严格源路径证明。没有按候选枚举次序选择闭环分支，也没有放宽 1.5px 路径约束。

## 验证与边界

- 新增回归覆盖正常、空、非法、极端、安全、失败、过期源绑定、不同 atlas、16 顶点上限、连续路径、反向和重复物理路径、双观察分歧，以及延迟复核的原像素账本。
- 实际 Worker 回归覆盖同批路径修订与区域程序的合并顺序；保留原有缺失主干、错误端点、重复 ID、旧箭头未退休等破坏性反例。
- 所有新增测试进入统一 CI unit 发现器。最终源场景集合、TypeScript、Lint/架构/包边界、安装包和文件指纹写入本轮 `delivery-manifest.json`；阶段失败日志另存，不把它们当作通过。
- 早期广泛回归 `source-suite-v1.log` 为 1435/1436，唯一失败是修复合并顺序前的 Worker 消费。未跳过该测试；最终集合完整重跑。
- 最终广泛集合 `source-suite-final-v2.log` 为 **1438/1439**，零跳过；唯一失败是 Worker 破坏性反例的子进程超过原 60 秒（退出状态为 null）。该完整模块按原超时单独重跑 **4/4 通过**，见 `worker-isolated-final-v4.log`；不把这条广泛执行记录改写为全通过。
- `typecheck-final-v6.log`：两组 TypeScript 通过。`lint-final-v3.log`：Lint、2200 文件架构预算、1215 文件/20 包边界均通过；七项既有例外未增加。`contracts-final-v1.log`：实际 OpenXML 构建 2/2。`consensus-final-v2.log`：最终路径复核与连续共识 12/12。
- 上一轮安装超时已按原预算重试通过，见 [完整路径表示记录](image-to-editable-network-polyline-20261021.md)。本轮第一次安装消费检查 `runtime-package-v1.log` 在 `program consumer` 失败；`runtime-package-final-v2.log` 再次在原五分钟安装阶段超时。保留两者，在最终代码上用本机 npm 缓存进行同样的真实干净安装及消费验证，日志为 `runtime-package-final-v3.log`。离线模式只作用于该命令环境，不改变仓库或共享服务配置。
- `runtime-package-final-v3.log` 最终通过：归档 3,780,126 字节、1804 文件、20 个包，实际 Worker、程序、共享闭环、路径观察和生产依赖闭包消费通过。没有提高原超时或跳过安装。

尚未完成：真实下层完整路径证明和唯一绑定、其余关系和原生对象、整页视觉/组件/语义门禁、Office UI 编辑验收，以及共享运行时激活。本轮没有部署、重启共享服务、升级依赖、提交、推送或运行全仓单次 `verify:ci`。最终目标继续保持 active。

后续修复将最终源路径匹配与双观察共识统一为连续有序校验，并修复 512 样本提取边界；见 [源路径身份校验记录](image-to-editable-ordered-source-path-20261021.md)。真实整页关系计数尚未增加。
