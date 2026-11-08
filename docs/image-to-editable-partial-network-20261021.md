# 图片转可编辑 PPT：完整物理网络与部分逻辑绑定

本轮真实冻结回放从 **4/11 提升到 7/11** 条关系。下层完整源网络保留 **12 条源边、1 个闭环**，编译成 21 个原生线段；n204、n205、n208 成功绑定，n206、n207 仍明确未解决。PowerPoint 整页 PDR 为 **8.0589979956%**，较上一版 8.0016381266% 略差，仍超过 8%；组件、严格语义和 native-path 语义门禁均失败。目标保持未完成，本轮没有提交、推送、部署或重启共享服务。

## 根因与实现

1. [共享网络编译器](../packages/slideclone-core/routing/source-shared-route-compiler.js)原先遇到一条逻辑路径歧义就丢弃整个物理网络。[独立绑定模块](../packages/slideclone-core/routing/source-shared-route-bindings.js)保留默认严格行为，允许内部逻辑网络阶段在完整源网络上保留至少两条已证明的路径。只有歧义和重复身份可以 pending；方向、锚点、路径程序、过期选择及任何搜索预算失败仍使整组失败。正反向相同路径的所有冲突成员一起拒绝，不采用先到先得。
2. [共享场景阶段](../packages/slideclone-core/scene-plan/source-scene-shared-route-stage.js)原子保留全部物理成员，分别返回 resolved 与 pending。[场景编译器](../packages/slideclone-core/scene-plan/source-scene-compiler.js)让 pending 留在 unresolved 库存，并在直线测量及全部普通 fallback 之前排除这些身份，防止完整网络被重复画线。最终库存仍要求每个物理成员存活，含未被逻辑路径引用的成员；本轮没有放松私有源 paint 凭证。
3. 第一次真实重放仍是 4/11，原因独立于部分绑定：旧计划网络指纹为 `eb4594d0…`，最终编译为 `17a40bcc…`。完整目录比较仅发现两个接触点 y 从 710 变为 710.463768115942 和 710.503355704698；所有源边身份、顶点、拓扑、端点与关系集合相同。旧选择不能仅改写哈希后继续使用。
4. [重新投影模块](../packages/slideclone-core/routing/source-shared-route-reprojection.js)要求同时提供前后两个通过完整指纹校验的目录，并逐项核对源哈希、尺寸、窗口、完整关系集合、接触点身份/端点/箭头及每条完整源边的几何与身份。仅端口投影坐标可变化，随后仍由当前私有源测量、锚点、方向和唯一性检查重新绑定。没有旧目录或物理信息发生变化时仍拒绝。原选择和计划不被修改，成功重投影单独记入证据。
5. [规划器](../packages/slideclone-core/scene-plan/source-scene-planner.js)携带原 preflight 完整目录，[raw 重建入口](../packages/slideclone-core/team-native-rebuild.js)将其交给最终场景编译器。目录只提供路径提名，不能授予测量或擦除权限。没有增加依赖、模型调用、预算、容差、超时或质量阈值。

## 真实产物与证据边界

证据目录：`.codex-temp/source-partial-network-20261021-v1/`。源图 SHA256 为 `a6f77ffb75653f04a4ca47d43e9f692b838b3ea43eb15a53b91304c98d81d1b3`。

- 冻结计划为 `.codex-temp/source-contact-audit-20261021-v1/real-oKeW6y/final-plan.json`，68 行冻结 OCR，模型调用为零。旧完整目录来自同目录的 `compile-evidence.json`；原文件和旧选择未改写。
- `raw-replay.log` 保留不提供旧目录时的 4/11 拒绝；`catalog-delta.json` 保留完整目录差异。`raw-replay.cjs` 只增加旧目录输入，`raw-reprojected.log` 保留 7/11 结果。这是本地冻结回放，不能当作共享 Worker、新 OCR/VLM 或线上验收。
- 实际产物为本证据目录下 `raw-replay-reprojected-v1/compiled/deck.json` 和 `actual-raw-partial.pptx`；上一级 `scope.json` 记录组件与语义失败。
- `real-delta.json` 核对原有 **155 个形状、69 个文本对象严格相等**；29 个图像对象身份和位置不变，28 个资产字节相同，仅 `full-slide-residual` 重算。新增 36 个形状包含 21 条线段和控制成员；21 条物理输出边中有 8 条未被已绑定的三条逻辑路径引用，仍完整保留。
- `real-openxml.json` 和 `office-after-v1/` 验证实际 .NET 构建及 PowerPoint 导出。PPTX 为 833,364 字节，21 个网络线段各输出一次。自由路径保留可编辑节点和源端点几何；它们不具有 Office 连接器的自动重路由能力，不能据此宣称拖动卡片验收通过。

| 门禁 | 本轮结果 |
| --- | --- |
| PDR | 8.0589979956%，失败 |
| Missing | 2.0427320749%，通过既有上限 |
| MAD | 8.4114011006，通过既有上限 |
| 原生组件 | 失败，仍有 29 个图像对象 |
| 严格语义 | 失败；fixedRelationshipPaintCount=15 |
| native-path 语义 | 失败；13 个路径被识别，但仍有 2 个固定填充关系及 large-raster-lineage |

## 回归与工程验证

- 修复前新增回归 1 通过、2 失败，见 `regression-before.tap`。新增 [部分网络回归](../test/source-shared-route-partial-network.test.js)覆盖默认严格、最少两条路径、完整物理网络/闭环、正反重复冲突、非法控制、旧选择、克隆证明、最终库存与所有 fallback 排除。
- [绑定回归](../test/source-shared-route-path-binding.test.js)覆盖完整候选枚举和共享预算耗尽；[重新投影回归](../test/source-shared-route-reprojection.test.js)覆盖完整目录、源/端点/关系/几何变化、缺失目录、过期指纹、空值、过量目录、重复目录、Proxy/accessor 和原输入保留。最后加强的重新投影断言 3/3 通过。
- 通过统一 unit 发现器选择 **211 文件，1760/1760 通过、零跳过**，见 `source-test-files-bounded.json`、`source-suite-bounded.tap`。它包含六组 Worker 回归与实际 Worker 消费验证；首次更宽批次执行中断的日志单独保留在 `source-suite-final.tap`，不作通过证据。
- [实际 Worker 消费](../test/runtime-shared-route-consumer.test.js)覆盖两条接触路径、混合方向、闭环、部分网络、旧箭头退役，以及完整目录跨阶段传递；故意丢弃该传递时必须失败。独立加强测试见 `worker-reprojection.tap`，与上述批次重叠，不相加。
- [OpenXML 共享节点契约](../test/openxml-shared-junction-contract.test.js)、圆角及渐变契约 **8/8** 通过、零跳过，见 `contracts-v2.tap`。自由路径检查实际端点坐标；只有真正的 Office connector 要求 `stCxn/endCxn`。初始错误要求自由路径也输出连接器绑定的失败日志保留。
- 两组 TypeScript、Lint、2219 文件架构预算、1224 文件/20 包边界通过，七个既有 decreasing-only 例外未增。未执行全仓单次 `verify:ci`。
- 干净安装第一次在原五分钟安装时限超时，见 `package-offline-after.log`。批量测试结束后，同一离线设置、五分钟时限和完整检查重试通过：安装耗时 137,755ms，包为 3,809,790 字节、1820 文件、20 包；Worker、program、shared-route 消费及生产依赖闭包检查全部执行。见 `package-retry.log`、`package-retry-steps.jsonl`；没有延长时限或跳过检查。

## 剩余边界

n206/n207 仍有多条物理路径，旧双观察预算已经用完，不能再次自动调用模型、手填已知路径或按最短路径/枚举顺序选择。n209/n210 的完整端头/颜色证明仍未成立，详见[上一轮 directed-dash 记录](image-to-editable-directed-dash-20261021.md)。整页视觉略有退化，完整组件与语义、剩余关系、共享运行时及实际拖动编辑验收仍需处理；本轮结果只能作为有失败边界的工程进展。
