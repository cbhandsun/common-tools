# 两条短虚线的实际节点跟随验收

日期：2026-10-23。状态：**绑定节点形状的移动跟随通过，整徽标、整卡及整页未通过**。

本次复用已冻结的 v6 auto/reroutable 两份 PPTX，仅在各自副本中将 `scene-container-object-n109` 右移 8pt、下移 5pt。顶部 `scene-outline-object-n106`、底部 `scene-outline-object-n117` 保持原位。全过程使用现有生产 Office 适配器生成的脚本，另注入本地诊断操作；没有修改生产代码、共享 Worker 或严格门禁。

## 实际结果

两份副本均在真实 PowerPoint 中完成打开、移动、保存、关闭、重开及验证，进程退出 0，共 37161ms。完整记录见 [result.json](../.codex-temp/source-dash-node-follow-20261023-v1/run-v1/result.json)、[原始 Office 报告](../.codex-temp/source-dash-node-follow-20261023-v1/run-v1/report.json) 和 [独立包检查](../.codex-temp/source-dash-node-follow-20261023-v1/run-v1/package-check.json)。通用摘要器将自定义诊断 mode 显示为 `unknown`；具体 auto/reroutable 身份以原始报告、manifest、目标 ID 和成品 hash 一起核对，未把诊断扩展宣称为默认适配器的新模式。

| 项目 | auto | reroutable |
| --- | --- | --- |
| n209 固定起点 / 跟随终点 | 通过 | 通过 |
| n210 跟随起点 / 固定终点 | 通过 | 通过 |
| 保存后真实连线端点与所属连接口距离 | 0pt | 0pt |
| 线宽、虚线节奏、渐变、平端帽、箭头和绑定 | 全部保留 | 全部保留 |
| 变更几何 | 中间形状及两条线，共 3 项 | 同左 |
| 其他已枚举形状几何 | 208 项不变 | 208 项不变 |

中间形状的保存位置精确变化为 `101600/63500 EMU`，即 8pt/5pt。两条线跟随端的 y 变化为 63499 EMU，与该连接口计算完全相符；相对目标位移有 1 EMU 的量化差，约 0.000079pt。该差异明确保留。

主线程已检查 auto 整页及两个模式的完整左侧连接区域。两模式局部导出像素相同，可见连线倾斜响应节点移动。数字“2”和徽标的其他组成部分没有纳入这次移动，出现相对错位；没有据此授予整徽标或无残影验收，更不代表整个业务区域能一起移动。原始导出及诊断裁剪均保留在同一运行目录。

## 端帽对照的结论保持

先前真实 Office flat/round 对照的 [comparison.json](../.codex-temp/source-dash-cap-review-20261023-v1/run-v2/comparison.json) 和 [独立恢复记录](../.codex-temp/source-dash-cap-review-20261023-v1/run-v2/completed-render-manifest.json) 保留。两份 PPTX 只改两个 cap 属性；round 改变 307 个像素，其中 136 改善、170 变差，1 个误差不变，仍不足以唯一证明原始端帽。

该对照原 runner 因第二次独占写 `progress.json` 发生 EEXIST，退出 1。两次 writer/Office 渲染确实完成，后续独立检查只恢复现有产物，没有重跑 Office；本次封存继续保留原失败，不把该 runner 改称成功。

用户对三个近似外框的批准不扩展至端帽。端帽局部近似尚待答复，原严格端帽告警和整页失败继续保留。本次节点跟随通过也不改变其身份依据。

## 新提供的图与剩余缺口

用户后来提供的 JPG 与当前原 PNG 都是 1086×1448；本次重新解码逐像素比较，RGB 完全相同。两个文件的容器 hash 不同，解码 RGB hash 相同，见 [source-image-comparison.json](../.codex-temp/source-dash-node-follow-20261023-v1/run-v1/source-image-comparison.json)。因此这份新附件没有增加本任务可用的图像信息。

三个外框原有局部近似 6/6 验收保持；严格区域仍为 9/12，关系仍为 11 条，semantic/native-component 和整页仍未通过。n10 的 14 个对象整卡操作仍需补齐残余 paint 的唯一归属与旧位置背景，不能凭盒内、颜色或 body 几何擦除原像素。

完整工程 CI 的先前通过记录保持。本轮只新增隔离诊断、文档与证据，终检另复核 2492 个工程输入和三套测试文件清单未变；未再次运行全量 CI，也不声称临时诊断已进入统一 CI。所有输入、输出和失败证据的本轮封存入口为 [seal.json](../.codex-temp/source-dash-node-follow-20261023-v1/seal.json)。
