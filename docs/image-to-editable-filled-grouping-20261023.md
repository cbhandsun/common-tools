# 填充关系完整原生分组与 Office 验证

2026-10-23。正常生产回放已将 `relation-regional-0-0` 的两块原生填充主体和两条实际连接片段保留为一个四成员关系组。两个真实外部节点仍在组外。此项改善完整关系的整体操作，不增加源归属、擦除权限或自动重路由能力；本关系两块填充主体对应的 `fixedRelationshipPaint` 项继续保留。整页严格检查的该项计数为 auto 15、reroutable-elbow 2，不能把关系内两项写成两种模式的整页计数。

当前仍为 **11 条接纳关系、9/12 完整区域**。n4/n6/n8 三个外框、n107/n111/n119 整卡分组、原残差及白色擦除瑕疵未解决，严格 semantic、native-component 和整页产品验收仍未通过。共享 Worker 未激活。

[质量报告完整对照](../.codex-temp/filled-route-grouping-20261023-v1/quality-comparison.json)确认两种模式的严格 semantic 与 native-component 报告分别与各自原基线深度完全相同，新增分组没有消除或隐藏原失败项。

## 新附件对比

独立 Python/Pillow 完整解码本次 JPEG 与冻结 PNG：均为 1086×1448，全部 **1,572,528 个 RGB 像素一致，变化为 0**。附件没有增加细节，保留原冻结 PNG、源摘要及原计划，不重新签发源证明。[逐像素记录](../.codex-temp/filled-route-grouping-20261023-v1/independent-pixels.json)还独立核对两种模式的全部 Office 渲染像素。

## 实现与正常回放

`source-scene-route.js` 的私有测量记录保存原两端节点框及终态计量，新增只读分组上下文。上下文绑定真实 fit、原像素摘要及原缓冲区身份；复制 fit、替换相同像素的分配、改变源像素或端点 geometry 均不能授权分组。

独立 `source-route-output-groups.js` 使用编译器私有 WeakMap 捕获全部输出及有界快照；最终封存重新检查完整成员、唯一身份、顺序、源图、端点框和外部绘制冲突。原 4M 预算继续适用，终态计量传给后续共享网络封存，没有重新开始账本。凭证只控制分组存活。

filled compiler 从产生输出时即绑定最终 `sceneInventoryId`，避免正常 finalize 的同一身份赋值使快照失效。部分输出、元数据漂移、额外成员或冲突不保留分组。新模块进入严格边界类型检查及运行包文件清单，没有新依赖或 writer 修改。

两种模式均由正常 raw rebuilder 使用冻结 OCR/计划、零模型调用回放。除四个目标对象的组及角色元数据外，192/202 个 shapes 的绘制属性、69 个文字对象、30 个图像的实际资产字节与元数据、完整 `sourceSceneCompilation` 均与各自权威基线一致；原共享组仍为 4/36 和 4/46 成员。[回放对照](../.codex-temp/filled-route-grouping-20261023-v1/replay-comparison.json)。

## 实际 PPTX 与整页渲染

使用生产 .NET writer 输出两个 PPTX，未经写后 XML 修改；再用真实 PowerPoint 顺序导出。两张整页均为 1086×1448，与各自原基线逐 RGBA 像素比较均为 **0 变化**。

| 模式 | PDR | Missing | MAD | 原数值门槛 |
| --- | --- | --- | --- | --- |
| auto | 7.687685% | 1.975926% | 8.158329 | 通过 |
| reroutable-elbow | 7.768256% | 1.979491% | 8.213767 | 通过 |

这些数值继续使用原 PDR≤8%、Missing≤12%、MAD≤12 及原像素阈值，不代表整页外观或严格语义通过。独立 Python/Pillow 再次确认全部渲染像素一致。

独立解包检查确认新组恰有四成员，`scene-outline-object-n107`、`scene-container-object-n110` 两节点在组外；两个实际连接器共四个端点引用仍有效。对对象 ID、连接目标 ID 和实际媒体字节作规范化后，全部 **325/335 个实际绘制 XML、原有 75 个组完整内容**与原基线一致，原共享网络保持，新组变换为 identity。[真实包核对](../.codex-temp/filled-route-grouping-20261023-v1/package-check.json)。

## 实际 Office 整组编辑

两种模式均完成四成员整组向右 8pt、向下 5pt、保存关闭重开；独立核查只允许组 off 增加 101600/63500 EMU。全部组内绘制和外部 slide XML 精确保持，32/68 个实际连接引用有效。[auto 结果](../.codex-temp/filled-route-grouping-20261023-v1/auto-filled-group-edit-v2/result.json)、[reroutable 结果](../.codex-temp/filled-route-grouping-20261023-v1/reroutable-filled-group-edit-v2/result.json)。

此操作不是移动完整业务卡片，也不证明填充路径会随业务节点自动重排。原始 PPTX 保留，移动副本仅用于行为验证。

## 工程验证与保留失败

最终 15/15 定向回归、完整 Lint、两套 TypeScript、2277 文件的架构预算通过，原 7 项 decreasing-only 例外保持。新增五个回归覆盖完整四成员及最终身份赋值、成员/源/端点漂移、私有凭证、顺序/绘制冲突、空/恶意输入和预算失败；测试已进入统一 unit 自动发现。

本轮完整 `npm run verify:ci` 于 2026-10-23 11:04:17 UTC 退出 0，耗时 1,729,621ms（约 28 分 50 秒）。808 个 unit、34 个 contract、94 个 integration 测试文件，共 **936 文件、11 分片全部通过**。Lint、两套类型、插件/配置/可观测性检查、.NET 安全审计和锁定构建、Python lock、实际运行包安装消费及生产依赖闭包均通过；新包包含 20 个包、1881 个文件、6 类能力，归档 3,955,144 字节。[完整日志](../.codex-temp/filled-route-grouping-20261023-v1/final-verification-v1/ci.log)、[CI 终态](../.codex-temp/filled-route-grouping-20261023-v1/final-verification-v1/ci-result.json)、[独立最终核验](../.codex-temp/filled-route-grouping-20261023-v1/final-verification-v1/final-result.json)确认 16 项关键源码及输入绑定保持，两种模式的原始渲染、移动副本及既有源码绑定均复核。此结果只对应本轮本地代码与正常冻结回放，不代表共享 Worker 已激活或整页产品通过。

初始红色回归、正常回放中组未存活的 v1、严格类型报错、旧基线 PNG 路径错误和 Office 独立核查脚本的 `Name/name` 字段错误均保留。首轮 Office 操作本身通过，但独立脚本失败，因此不记作完整通过；修正诊断脚本后使用 v2 新目录重跑。没有放宽生产快照、质量门槛、原预算或类型规则。

[证据入口](../.codex-temp/filled-route-grouping-20261023-v1/README.md)。未部署、重启、提交或推送。
