# 跨区关系的原生近似已接入本地正常重建链

2026-10-24，承接[原生候选比较](image-to-editable-regional-native-review-20261024.md)。用户已确认仅采用 `relation-regional-0-0` 的描边、箭头和轻微折角近似，保留原有测量点和端口，不扩大背景处理范围，严格检查继续单独报告。

## 已落地的结果

`createApprovedFrameAssetApplication(review, {nativeRoute, cardBackdrop})` 接收进程内显式安装的限定策略。在正常 raw 重建入口完成源像素处理后、最终 seal/audit 前，替换该关系原来的两层固定填充轮廓及两条短连接器。14 个原测量点变为 13 段真实 `p:cxnSp / prstGeom line`，通过 12 个透明控制点连接，两端仍绑定原形状及原端口，并保留一个原生箭头。

该能力不会从作业 JSON、`approvalId` 标志或请求连线模式自动启用。输入绑定源图摘要、尺寸、原成员和两端形状的完整指纹；拒绝过期成员、共享分组、外部引用、点位错配、重复 ID、非法数值及主动执行的输入对象。失败时将页面集合、元数据和新资产一起回滚。

本轮同时修复了共享组检查中的 `unknown` 类型收窄，以及隔离包冷启动测试遗漏新增连线模块的依赖闭包。新增外框、n10 卡片与连线同时应用和最终 seal 失败整体回滚两项回归，相关测试由统一 unit/all CI 入口发现。

## 实际证据

最终证据目录为 `.codex-temp/approved-native-route-20261024-v2/`。v1 是类型修复之前的正常回放，保留历史记录；v2 重新通过当前源码运行正常 raw 重建入口，未覆写此前候选或基线。

- [本地 PPT](../.codex-temp/approved-native-route-20261024-v2/approved-native.pptx)由生产 OpenXML writer 生成，SHA256 为 `66e1484be3650b8baacb3b9631856bac0112898b0ba4a4c77d445e968970712d`，没有写后 XML 修改。
- [真实回放](../.codex-temp/approved-native-route-20261024-v2/replay-result.json)使用已冻结 OCR/计划和既有人工确认，零模型调用，完成源处理、限定应用及最终 seal/audit。它不代表新的实时 OCR 或共享 Worker 作业。
- [独立结构比较](../.codex-temp/approved-native-route-20261024-v2/build-verification.json)检查 26 个新端点引用、14 个测量点及连续连接。44 条共享原生连接器的绘制和绑定 XML 在名称还原后逐项相等，n112/n120 和 n10 卡片分组保留。52 份资产摘要逐项相等。除本关系替换和新增的只读回退诊断外，其余页面 IR 相等。
- [整页实际渲染](../.codex-temp/approved-native-route-20261024-v2/render-verification.json)使用 LibreOffice headless。与用户批准的原测量点候选比较，1086×1448 整页零像素差异。相对先前固定表达，变化 1268 像素，完整变化边界为 x=302..456、y=508..609。原阈值 18 下新增 253 个超差点，57 个原失败点转为通过；阈值未调整，差异未从严格结果中排除。
- [最终范围回归与类型检查](../.codex-temp/approved-native-route-20261024-v2/final-checks.json)及相邻日志记录最终源码的测试、两套类型检查和相关文件 ESLint。完整 Lint 已通过 1289 个 JS 文件检查、workspace 边界和既有架构门禁；架构检查为 2347 文件、原 7 项递减例外，无新增例外。本轮未运行完整 `verify:ci`。

## 验收边界

严格源检查仍记录该关系原先的 `mixed-fixed-and-connectors` 表达及原失败原因；限定近似的实际输出另行核对为 13 个有绑定的原生连接器。严格区域仍为 9/12，接纳关系为 11，strict semantic/native-component 仍失败，不能将近似授权换算成严格通过。

连线替换本身未打开、修改或擦除任何背景资产。已有 n4/n6/n8 外框和 n10 卡片限定策略保持，未扩大其范围。当前输出与已批准候选的静态表现一致，但未声称 PowerPoint 整页拖动、保存重开、36 个混合接触点和旧位置残影已验收。

共享 Worker 未更新或重启，最终包全量隔离安装本轮未重试；此前安装超时记录继续保留。隔离 API 冷启动测试通过不等于完整包安装或线上作业通过。此前停止桌面交互后的暂停仍保持。本地结果已可查看，整体目标保持 active。
