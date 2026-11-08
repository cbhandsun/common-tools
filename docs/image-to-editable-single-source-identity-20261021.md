# 单条连线的不可变源身份与区域描边诊断

本轮修复单条连线在源像素被修改后仍接受旧测量的问题。实际冻结回放仍为 **9/11**；重新生成的 PPTX 与前轮的 **41 个解压条目全部逐字节相同**。本轮没有新增像素还原提升，组件、语义和整页编辑验收仍未完成。

## 根因与修复

[单线路由测量器](../packages/slideclone-core/scene-plan/source-scene-route.js)原先只将私有 fit 绑定到端点 ID、方向和图片尺寸。同一源缓冲区可经别名改变内容，但原生路径编译器和填充路径编译器仍接受旧的几何、颜色与附件证明。

成功测量现在保存源图规范字节视图和不可变 SHA256；每次读取证明先验证 controls，再复核原始源字节。规范视图保留真实的缓冲区偏移和长度，不读取调用方自定义的 typed-array 访问器。源缓冲区被修改或分离时拒绝旧证明；恢复完全相同的原字节后继续接受。没有增加调用方开关、序列化权限、依赖或生产日志。

[新增回归](../test/source-scene-route-source-identity.test.js)覆盖实色、空间渐变、路径渐变、完整浅色边缘填充体，三个 corner mode，RGB/alpha、节点/线身/箭头/窗口外像素、别名、已分离缓冲区、非零偏移视图、复制 fit、非法 controls 及 getter/proxy。unit/all 统一发现入口均包含新文件。原始几何、颜色、预算与语义门槛保持。

## 区域描边的实际诊断

证据目录：`.codex-temp/source-regional-stroke-proof-20261021-v1/`。`raw-replay-observe-v2/regional-compound-1-bodies.json` 保存实际私有端点 body mask 的诊断快照；快照不具备私有证明权限。观察窗口为源坐标 `(290,442,179,181)`。

剩余 shaft 有 794 个 cells，校准宽度约 3.27756px，原始 220 点路径简化为 14 个顶点。只有 6 个 cells 超出原 `shaft/2 + .75` 距离：局部 `(160,68)`、`(163,89)`、`(41,102)`、`(40,102)`、`(20,111)`、`(19,114)`。

`background-diagnostic.json` 使用实际 body mask 调用现有整窗和逐节点背景证明；两者均未产生有效的局部背景证书，6 个 cells 都不属于该 body mask。第一个源像素 `(450,510)` 靠近节点边界，但当前没有独立证据允许将它归给节点或背景。其余像素靠近转角，距离偏差也不能单独授权删除。因而本轮保留两个填充体和两个短连接，没有扩线、放宽容差、删除浅色边缘或更改语义分类。

## 实际回放与验证

- `raw-replay-single-identity-v1/single-source-identity.json`：真实 `relation-n201` 原生路径及 `relation-regional-0-0` 填充路径均拒绝同一缓冲区被修改后的旧证明；恢复后产物与原先一致。没有新增 OCR/VLM 观察。
- `output-preservation.json`：192 个形状、69 个文本及 slideSize 严格相同；30 个图像资产逐字节相同，位置、尺寸和其他元数据相同。随机临时裁片路径不同，不能称整个 IR 字节相同。
- `real-openxml.json`：实际 .NET builder 生成 `raw-replay-single-identity-v1/compiled/actual-raw-single-identity-v1.pptx`，841763 字节；41 个解压条目全部相同，其中媒体 30 个。下层网络仍为 21 条物理输出边、3 条已绑定逻辑路径，每个成员实际出现一次。
- 原始下层线网仍保留 12 条源边和一个闭环；n206/n207 的路径歧义仍未解决。严格语义仍计 15 个固定关系 paint，native-path 仍计 2 个；两种语义门禁和组件门禁均失败，`large-raster-lineage` 仍存在。
- 本轮未重复 PowerPoint 渲染；前轮视觉值和其适用边界见[前轮记录](image-to-editable-shared-source-identity-20261021.md)。未更新共享运行时、重启服务、部署、提交或推送，未执行拖动/保存/重开验收。

## 工程门禁与证据边界

- 9 个相关测试文件 **53/53**，零跳过；其中新增单线源身份回归 **7/7**。包消费与隔离闭包 **6/6**。
- 两组 TypeScript、完整 Lint、最终定向 ESLint 通过。架构检查 2234 文件，原 7 个 decreasing-only 例外保持；边界检查 1231 文件、20 包、0 外部运行时包导入。
- 没有运行单次完整 `verify:ci`，没有重新安装完整离线运行时；不能将这些定向检查报告为全仓 CI 完成。
- 初版回归 fixture 漏传 controls.direction，修正后 `single-identity-before-v2.log` 才是有效的修复前复现（6 项中 5 失败）。初次类型检查的索引声明错误已修正，使用 `typecheck-v2.log`。初版输出核对脚本误将 ZIP 条目列表当作内容映射，实际 PPTX 已成功生成；后续 `verify-emitted.cjs` 逐项解压核对成功。失败脚本和日志均保留。

最终指纹和脏工作区条目保持检查以本目录 `delivery-manifest.json` 为准。下一步仍需独立证明完整交汇的唯一过渡，以及能覆盖全部源边缘的原生描边表达；目标保持 active。
