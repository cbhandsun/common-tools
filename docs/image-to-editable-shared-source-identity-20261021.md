# 共享线网的不可变源身份与替换保护

本轮修复共享线网私有证明的源身份漏洞。真实冻结回放仍为 **9/11**；形状、文本、图像内容和实际 OpenXML 输出保持。n206/n207、两个固定填充关系体、30 个图像对象及整页组件/语义门禁仍未完成。

## 根因与修复

[共享测量器](../packages/slideclone-core/routing/source-shared-route-measurement.js)原先只保存像素缓冲区引用和尺寸。通过同一缓冲区的别名修改内容后，`hasSharedSourceRoute` 和 `sharedSourcePaintCells` 仍接受旧证明；输出 registry 因而继续授予旧擦除范围，实际替换器会删除原有箭头。

新[回归](../test/source-shared-route-source-identity.test.js)先复现了这两个失败，日志保留在 `.codex-temp/source-regional-path-20261021-v1/identity-before.log`。修复在完整测量成功时捕获不可变 SHA256；编译、registry capture/read 和读取源 paint 均通过同一个私有校验，核对原缓冲区、尺寸和当前完整源字节。别名修改 RGB、alpha、节点、线身、箭头或窗口外像素都会使旧证明失效；恢复完全相同的原字节后可以继续使用。

哈希使用已有 `sourceRaster` 返回的规范视图，继承 16384 边长及 4000 万源像素上限，不执行缓冲区上的自定义 length/buffer 等访问器。源身份校验不提供几何、颜色支持或擦除权限，原四百万几何账本与全部证明门槛保持。没有新增包依赖。

## 真实回放与保持性

证据目录：`.codex-temp/source-regional-path-20261021-v1/`。冻结源、OCR 和计划沿用[上一轮](image-to-editable-detached-head-20261021.md)，未新增模型观察。

- `raw-replay-identity-v1/shared-source-identity.json`：在真实编译器中，上层 3 边树和下层 **12 边、1 闭环**均实测拒绝同一缓冲区修改后的旧证明；恢复源字节后正常接受。两组原 paint 分别为 1617、3665 个 cells。
- `output-preservation.json`：**192 个形状、69 个文本严格相同**；30 个图像资产逐字节相同，全部图像的位置、尺寸和其余元数据保持。只有两处随机临时裁片目录名称变化，不能称为整个 IR 文件字节相同。
- `real-openxml.json`、`openxml-all-entry-preservation.json`：重新调用实际 .NET builder 生成 `raw-replay-identity-v1/compiled/actual-raw-identity-v1.pptx`，841763 字节。与上轮 PPTX 的 **41 个解压条目全部逐字节相同**，包括 slide XML、relationships 和 30 个嵌入图像；下层仍为 21 条物理输出边、3 条已绑定逻辑路径，每个物理成员实际出现一次。
- 本轮没有重复 PowerPoint 渲染。前轮同一解压内容的实际视觉结果仍为 PDR **7.7438366757%**、Missing **2.0197592608%**、MAD **8.2042904800**；这些是前轮测量值，不能报告为本轮新增视觉提升。

## 工程验证

- 统一 unit 发现器选出的 **16 个共享线网文件，92/92 通过**，零跳过；其中新增源身份回归 **6/6**，覆盖树、完整闭环、别名修改、实际旧箭头替换、恢复原字节、跨源/尺寸/非法输入及访问器安全。新文件进入 unit/all 两个 CI 发现入口。
- engine-core-package 包消费与隔离闭包 **6/6**；两组 TypeScript、完整 Lint 和最终定向 Lint 通过。
- 架构检查 **2233 文件**、原 7 个 decreasing-only 例外保持；工作区边界 **1231 文件、20 包、0 外部运行时包导入**。没有修改规则、baseline、测试超时或依赖版本。
- 本轮未执行单次全仓 `verify:ci`，也未重新打包安装完整离线运行时。确切日志和文件指纹以本目录 `delivery-manifest.json` 为准。

首次快照发现原测量文件三个空白行的尾空格，已仅清理这些空白。后一次快照包含了当时仍在写入的输出日志，旧清单保留为 `delivery-manifest-before-log-fix.json`；最终快照不再向证据文件重定向输出，并在完成后独立复核全部指纹。只使用最终 `delivery-manifest.json` 作为交付清单。

## 剩余关系的证据边界

`remaining-diagnostics.json` 记录 n206/n207 各有两条完整简单物理路径。真实已接受边本身就含有蓝绿渐变，不能用单色或逐通道固定 18 的简单连续性过滤器选择其中一臂；目前尚无独立的交汇过渡证明。没有按最短路径、枚举顺序或期望关系选择，也没有自动追加已用完的模型观察。

区域关系 `relation-regional-0-0` 仍为两个填充体和两个短连接。实测线宽约 3.27756px、support 0.97826；其完整浅色边缘超出已校准细线可表达的范围，现有 fringe 回归要求保留这些源像素。本轮未把几何正则化当成丢弃边缘或绕过语义门禁的依据。

继续工作应从完整交汇的源 paint/几何证明，以及能独立解释全部浅色边缘的原生描边表达推进。整页严格语义仍有 15 个固定关系 paint；native-path 模式仍有 2 个，且两者均有 large-raster-lineage。没有共享服务变更、重启、部署、提交、推送或真实拖动/保存/重开验收。目标保持 active。
