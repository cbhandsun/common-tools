# n10 整卡实际移动与背景近似审阅

日期：2026-10-23。此轮没有修改生产源码，没有启用共享 Worker，也没有授予新的残差擦除权。正式外框接入和严格门禁保持[上一轮结论](image-to-editable-approved-frame-pipeline-20261023.md)。

## 实际移动结果

在现有真实 PowerPoint 成品的副本中，将 n10 的两个原组和三张独立图标纳入一个诊断父组。14 个逻辑成员完整保留。原来包含嵌套文字组的 28 个命名节点，递归展开后实际是 **19 个叶绘制对象**；新父组另占一个命名节点。XML 派生的 19 项 ID、名称和顺序与 PowerPoint 的只读枚举完全一致。

旧 `preparation.json` 将叶绘制数写成 26，是诊断脚本中写死的计数错误。旧脚本、报告和两次成员检查失败均保留。`membership-correction-v3.json` 及 `preparation-v3.json` 从真实 XML 推导成员，没有删除或放宽成员检查，移动前后还逐项核验 Type。

诊断父组的静态渲染与原成品相比变化 **0 像素**。实际 PowerPoint 将整组上移 350pt，保存、关闭、重开后验证通过。该位移仅用于让旧位置完全暴露，会覆盖上方内容，不是排版方案。

保存前的控制副本与移动后副本比较表明：

- 19 个叶绘制子树、内部文字及样式完全保持；205 个外部绘制对象完全保持。
- 幻灯片唯一变化为父组 y 偏移减少 4,445,000 EMU。
- 所有其他 ZIP 部件相同，只有 Office 的 core metadata 按正常保存行为发生 revision +1 和 modified 时间推进 2 秒。
- 原成品、分组副本和源资产的摘要保持。

初版包比较错误地假定 Office 保存只会改变 slide XML；其失败和脚本保留。修正版明确核验上述两个 metadata 字段，要求其他内容完全相等。

**整卡无残影验收仍失败。** 移开后旧位置清晰保留绿色框线、徽章和淡字。仅建立父组不能解决这个问题。全页残差在拟议几何窗内有 12,698 个非透明单元；此前的 8,124 只属于更小的观察窗，两者都不是完整 paint 所有权证明。实际渲染存在采样和覆盖，不能把资产像素数称为可见残影像素数。

## 具体近似预览，尚待新增授权

预览只在独立诊断副本内，在 full-slide residual 后增加一个原生页面底色矩形，原资产及原绘制对象均不删除、不转移。其颜色为现有页面底色 `#FBFAF8`，并不证明截图中被卡片挡住的真实背景就是纯色。

拟议几何为源像素 x376、y1043、337×325。PowerPoint 抗锯齿还影响上方一行，因此**对用户提交审阅的实际影响范围**为 x376、y1042、337×326，即 n10 卡片及周边 3–4 像素。初版按几何范围检查时捕获了这 337 个额外像素；失败保留，没有把它们忽略。修正版使用明确展示的实际范围，范围外变化严格为 0。

预览已实际调用 PowerPoint 渲染静态和移动副本。原卡片实测 bounds 内，移动后的预览均为现有页面底色。静态预览相对原成品变化 6,571 像素，占整页约 0.418%；移动预览相对实际移动产物变化 19,760 像素，占约 1.257%。这只是预览的影响范围，不表示恢复了原始隐藏背景。

使用当前仓库像素比较器，固定现有默认 threshold=24、前景容差 2px / 43.2，单独复核静态整页外观：

| 指标 | 原成品控制副本 | 未批准静态预览 | 原门槛 |
| --- | ---: | ---: | ---: |
| PDR | 7.7251407% | 7.7421833% | ≤8% |
| 前景缺失 | 1.9769823% | 1.9769823% | ≤12% |
| MAD | 8.2270858 | 8.2343704 | ≤12 |

这三项仅为外观检查。严格区域仍是 9/12，关系 11 条，整页 semantic/native-component 仍失败。预览不是正常编译主链修复，也不替代语义、无残影或生产验收。

用户原授权仅覆盖 n4/n6/n8 三个外框。本轮已提交 n10 的具体范围、近似颜色、实际对比和损失说明，单独请求是否扩大近似授权。收到明确答复前保持预览状态，不能扩大残差擦除、源所有权或验收通过范围。Goal 保持 active。

## 证据

证据根目录：`.codex-temp/n10-whole-card-observation-20261023-v1/`。

- [XML 与只读 COM 成员更正](../.codex-temp/n10-whole-card-observation-20261023-v1/membership-correction-v3.json)
- [静态零像素差](../.codex-temp/n10-whole-card-observation-20261023-v1/static-equivalence.json)
- [Office 移动保存重开](../.codex-temp/n10-whole-card-observation-20261023-v1/move-v3/office-report.json)
- [完整包和绘制子树核验](../.codex-temp/n10-whole-card-observation-20261023-v1/move-v3/xml-move-verification-v4.json)
- [移动后的实际产物，诊断用途](../.codex-temp/n10-whole-card-observation-20261023-v1/move-v3/whole-card-moved.pptx)
- [对比图](../.codex-temp/n10-whole-card-observation-20261023-v1/bounded-review-v2/comparison.png)
- [新增近似范围与资产](../.codex-temp/n10-whole-card-observation-20261023-v1/bounded-review-v2/review-inputs.json)
- [静态和移动预览的真实 Office 渲染](../.codex-temp/n10-whole-card-observation-20261023-v1/bounded-review-v2/office-renders.json)
- [有界像素核验及抗锯齿范围](../.codex-temp/n10-whole-card-observation-20261023-v1/bounded-review-v2/bounded-pixel-comparison-v2.json)
- [当前比较器的原门槛外观结果](../.codex-temp/n10-whole-card-observation-20261023-v1/bounded-review-v2/visual-comparison.json)

本轮新增的是诊断脚本、预览副本和证据文档，没有生产修复；未为此重跑完整 CI。后续若批准 n10 的近似，需要通过正常主链接入，增加回归并运行相关工程门禁，再对同一正式产物进行移动、保存、重开和整页质量复核。
