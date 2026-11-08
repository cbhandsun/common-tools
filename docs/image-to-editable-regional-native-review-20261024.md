# 跨区关系原生候选与剩余验收

2026-10-24，承接[整卡分组终态](image-to-editable-root-connector-card-groups-20261024.md)。正式结果仍为 11 条接纳关系、严格区域 9/12，严格 semantic/native-component 失败。以下候选没有替换正式基线或激活共享 Worker，也没有新增源像素归属、擦除权限或近似授权。

## 固定表达的实际原因

`source-scene-route-compiler.js` 遇到 `fit.filledBody` 时直接调用 `compileFilledSourceRoute`。这条完整关系 `relation-regional-0-0` 因 calibrated stroke 无法覆盖全部源绘制，保留为两层 filled freeforms 和两条短的原生连接器；该分支不会因请求 `reroutable-elbow` 自动转为可重路由描边。因此它不能作为“整条线已原生跟随”的证明，也不是 44 条共享原生线或下层闭环回退。

没有解除 `NativeConnectorGeometry.cs` 对 custom connector path 的保护。历史实际 PowerPoint 打开失败已记于 [junction transition](image-to-editable-junction-transition-20261021.md)，不得重复将 `a:custGeom` 包装进 `p:cxnSp` 后称兼容性通过。

## 已生成的两个独立候选

证据目录：`.codex-temp/native-regional-review-20261024-v1/`。

第一份使用 5 段原生预设连接器，其中两段 `curvedConnector2`。实际 writer 的 10 个引用有效，但 LibreOffice 后台渲染显示拐点有可见偏差。完整页面实际改变 1381 像素，原阈值 18 下新增 390 个超差，55 个原失败点转为通过。没有采用该候选，记录保留于 `build-result.json` 和 `render-result.json`。

第二份直接保留原来的 14 个测量点，写为 13 段真实 `p:cxnSp / prstGeom line`、12 个透明连接控制点和一个原生箭头，总计 25 parts，低于原 32 parts 上限。两端仍引用原始真实形状与相同端口。它近似原有描边、箭头及抗锯齿边缘，不声称完整源填充覆盖。未修改线宽、颜色、端点、源证明阈值或任何背景像素。

[第二份实际产物](../.codex-temp/native-regional-review-20261024-v1/candidate-measured-native.pptx)由当前生产 writer 生成，未作写后 XML 修改。[结构检查](../.codex-temp/native-regional-review-20261024-v1/build-measured-result.json)核对全部 26 个新引用，44 条共享原生连接器在按形状名称还原引用后，完整绘制和绑定 XML 不变；n112/n120 卡片组保留。除被替换的这条关系外，IR 全部相等，52 份资产逐字节摘要相同。

[实际后台渲染比较](../.codex-temp/native-regional-review-20261024-v1/render-measured-result.json)扫描整个 1086×1448 页面。实际改变 1268 像素，完整变化边界为 x=302..456、y=508..609。原阈值 18 下新增 253 个超差、57 个原失败点转为通过。没有挑选容易样本、调整阈值或将这些差异排除出严格结果。因此 `strictAccepted: false`，不能据此将完整区域计数提高。

局部图为原图 `source-detail.png`、当前固定轮廓 `baseline-detail.png`、预设曲线 `candidate-detail.png`、原测量点分段线 `measured-detail.png`。所有渲染均为 LibreOffice headless，未声称实际 PowerPoint 打开、拖动、保存或重开通过。用户以 Esc 停止桌面操作后的暂停仍保持。

## 采用所需的限定范围

此前近似授权仅覆盖 n4/n6/n8 三个外框及 n10 卡片与其周边 3–4px。不能自动扩展到此跨区关系。目前已向用户展示原图和 13 段原生候选，并请求仅允许这一条线的描边、箭头及轻微折角近似；不重绘卡片、不擦除背景、不改变其他区域，严格检查继续单独报告。没有收到该项答复前，不采用候选。

整页的严格验收、跨区关系软边缘、36 个混合接触点、真实整页移动残影、最终包隔离安装及共享 Worker 实际作业仍未通过。634 项调用方回归和类型/Lint/架构检查属于前述已完成生产修复；本次候选生成和比较不能将其扩大为全 CI 或整页验收。
