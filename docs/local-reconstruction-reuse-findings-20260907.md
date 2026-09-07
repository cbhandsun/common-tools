# 本地成功路径复用核对

用户要求减少大块保真图片，并明确优先复用已有本地实现。为此已撤回本轮未验证的 native-card 新识别器及 Worker 接线，运行服务保持上一轮已验证版本；没有部署新的卡片算法。

## 已找到的实际成功路径

- `runs/parity-knowledge-graph-20260904/run-parity.js` 是“转换为可编辑PPT”任务的真实 v15 构建脚本。它提供明确的文字与坐标，分别调用共享 raw rebuilder 和团队 worker，并以 PowerPoint 渲染比较本地和团队输出。其原生化来自已有 `knowledge-graph-native.js` 语义结构重建，以及 `knowledge-graph-icon-crops.js` 的最小图标精修。这些模块已经接入当前团队 worker，不能再归因为单纯漏拷贝图标精修器。
- `.codex-build/ai-agent-editable/build.mjs` 是“将图片转换为可编辑PPT”任务实际使用的本地构建脚本。它根据已理解的节点、关系和坐标构建原生对象，复用 `connector-component-library.js`；与仅传入 OCR 的自动重建输入并不等价。
- `component-strategy-rebuild.js` 已有组件预分析、策略及资产索引、结构修复队列和最终重建流程。团队路径已接入其组件搜索与索引构建函数，但并不代表执行了完整的结构修复队列。

## 对当前样本的直接核对

在源 PDF 第 2 页、同一批 17 个 OCR 文本框上，直接调用现有 `createLayerContainerShapes`、`createLayerColorBlockShapes` 和 `createMatrixColorBlockShapes`，三者均返回 0。进一步将 `inferLayerContainers` 的区域从现有裁片扩大为整页，仍返回 0。因此不能声称只需移除上一轮误判拦截、扩大裁片或打开已有开关就能恢复四个原生卡片；未经确认地解除拦截会再次产生虚构流程图。

当前自动区域为 `flow-card-chain`，而源图是四个摘要卡片组成的二维布局。后续应先对齐本地的结构理解和中间表示输入，再调用现有原生对象、连接线及 `refineStandaloneIconCrop` 等模块。只有结构重建和局部图标覆盖得到证据支持，才移除整页残差。不能直接删除大图片，也不另写一套像素识别器来掩盖结构输入的差异。

本次核对没有新增转换结果，不代表大图问题已解决；前次两页诊断版与质量门禁结论仍有效。

后续进展：现已补齐结构化 Deck IR 打包和源图质量验证，第 2 页经源图结构确认后通过真实 Worker 交付验收，最大图片占比降至 0.956%。详情见 [结构化原生输入验收](structured-native-input-validation-20260907.md)。这不代表全部页面的自动识别或远程部署已经完成。
