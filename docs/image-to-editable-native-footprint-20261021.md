# 图片转可编辑 PPT：保留校准宽度与完整源足迹

本轮修复了复合连线通过加粗整条描边覆盖少量浅色边缘像素的问题，以及编译器用几何正交化覆盖已选完整填充足迹的问题。真实冻结 raw 回放仍解析 **5/11** 条关系；PowerPoint 整页 PDR 从 **8.0506674603% 降至 8.0095871107%**，但仍未达到 8%。组件、严格语义及 native-path 语义门禁均失败，目标保持未完成。

## 根因与修改

跨区 `relation-regional-0-0` 的覆盖校准宽度为 **3.2775598123px**。旧完整折线证明为了覆盖六个偏外像素，将整条线扩大为 **4.8245553203px**，连同 Office 箭头一起放大。独立背景检查不能将这些像素认定为背景，因此不能删除它们。

- [source-compound-route-geometry.js](../packages/slideclone-core/routing/source-compound-route-geometry.js) 保留覆盖校准的宽度，逐一检查全部余轴像素是否处于该宽度及原 .75px 误差内；不能覆盖时拒绝薄线表示，继续已有完整彩色轮廓回退。原像素、掩码、容差及四百万共享几何预算均未放宽。
- [source-scene-route-compiler.js](../packages/slideclone-core/scene-plan/source-scene-route-compiler.js) 在几何正交化之前处理已测得的 `filledBody`。三种圆角模式均保留这一完整源足迹，避免重新猜测描边与箭头。
- [source-filled-fringe.cjs](../test/helpers/source-filled-fringe.cjs) 构造可正交化、带宽箭头及浅色连通边缘的源图；最终像素生成后重新测量两个私有端口。夹具不伪造或序列化源证明。
- [复合几何回归](../test/source-compound-route-geometry.test.js)、[实际测量编译回归](../test/source-filled-route-integration.test.js)及 [OpenXML 契约](../test/openxml-source-corner-mode-contract.test.js)覆盖宽度不膨胀、模式优先级、颜色/轮廓、真实连接锚点、克隆或错误端点拒绝、冻结几何和源缓冲保留。测试通过正式 unit/contract 发现器进入统一 CI。

没有新增依赖、改变关系身份、增加模型观察预算或修改质量门禁。

## 真实成品与代价

证据目录为 `.codex-temp/source-native-route-fidelity-20261021-v1/`。源图 SHA256 仍为 `a6f77ffb75653f04a4ca47d43e9f692b838b3ea43eb15a53b91304c98d81d1b3`，使用 `.codex-temp/source-contact-audit-20261021-v1/real-oKeW6y/final-plan.json`、68 行冻结 OCR 和零次模型调用。这是本地冻结回放，不是线上 Worker/OCR 验收。

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 真实 raw 关系 | 5/11；29 图像对象；新增关系由 1 个开放描边变为 2 个闭合填充轮廓及 2 条可见连接线 | `real-regional-measurement.json`、`real-delta.json` |
| 其余对象保留 | 其余原生形状严格相等；29 图像身份和位置不变，28 个图像资产字节相等；仅全页 residual 资产及其所有权指标随新原生足迹重新计算 | `real-delta.json` |
| 下层完整物理网络 | 12 边、1 闭环、3,418,699 检查；几何、源路径、接触点、宽度和工作量严格相等 | `physical-preservation.json` |
| 实际 OpenXML | 2 个闭合原生轮廓及 2 条可见连接线；不额外生成 Office 三角箭头；PPTX 846,749 字节 | `real-openxml.json` |
| PowerPoint 整页渲染 | PDR **8.0095871107%**；Missing **2.0344143319%**；MAD **8.3601627443** | `office-visual.json` |
| 编辑、保存、重开副本 | 两个轮廓节点数分别保持 53、44；各首节点 x 增加约 1pt，y 不变；212 个形状保留 | `office-edit.json` |

实际成品为 `.codex-temp/source-regional-branch-20261021-v1/raw-replay-footprint-v1/compiled/actual-raw-partial.pptx`，回放目录的 `scope.json` 和 `compiled/deck.json` 为最终状态依据。编辑副本位于本轮证据目录；它只证明两个轮廓可以编辑节点并保存，不证明拖动卡片后的整条关系自动重路由。

视觉改善没有解决语义边界：严格模式的 `fixedRelationshipPaintCount` 从 4 变为 5；native-path 模式从 0 变为 2，`nativePathRelationshipCount` 从 4 变为 3。两项新增失败对应这两个闭合填充轮廓。现有门禁只认可开放、无填充且真实附着的描边路径，没有为填充轮廓放行。整页还保留 `large-raster-lineage`。当前 PDR 也略差于加入该跨区线之前的 **8.0039910259%**，不能称为历史最佳成品。

裁图显示加粗和大箭头已消失，但源足迹的边缘阶梯、颜色近似和局部接触仍有误差。当前完整足迹回退是保守表示，不是最终可重路由方案。

## 验证与剩余工作

- 修改前后差分：旧宽度实现被浅色边缘回归检出；旧编译器也被新真实私有测量夹具检出。`fringe-before.tap` 和 `compiler-before-v2.tap` 保留失败结果；没有修改生产文件来临时跑旧实现。
- 50 个路由、共享网络、场景及消费测试文件 **300/300** 通过，零跳过；最终三文件针对性回归 **16/16** 通过。两组重叠，不能相加。见 `route-suite-final.tap`、`focused-v2.tap`。
- OpenXML、渐变、Worker 策略及安装消费契约 **17/17** 通过，零跳过。见 `contracts-final.tap`。初次新增颜色断言误用了小写十六进制，改为比较 OpenXML 标准大写值；原失败日志保留。
- 两组 TypeScript 通过；最终 Lint、2214 文件架构预算、1222 文件/20 包边界通过；七项既有 decreasing-only 例外未增加。见 `typecheck-first.log`、`lint-final.log`。未声称执行全仓单次 `verify:ci`。
- 离线干净安装包与最终交付指纹见 `package-final.log`、`delivery-manifest.json`。旧 manifest 中本轮明确修改的测试文件单独记录，其他旧文件和原证据重新核对；原 dirty 状态保留检查见该 manifest。

下层 n204..n208 仍缺唯一且有源依据的关系身份；n206/n207 双观察预算已经用完，不能自动追加模型观察或按遍历顺序选臂。n210 的实际 raw 拒绝仍为 `shaft-support`。还需解决可保持原校准宽度和源头部的关系表示、剩余原生对象、整页组件/语义/视觉门禁及实际 Worker 验收。前序记录见[完整余轴校准](image-to-editable-scanline-width-20261021.md)。未提交、推送、重启、部署或激活共享运行时。
