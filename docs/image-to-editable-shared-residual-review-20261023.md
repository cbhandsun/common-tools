# 共享线网残差候选核对

2026-10-23。共享线网 exact-source 擦除候选本轮不合入生产。有效对照只有 full-slide-residual 资产改变，实际 Office 出现局部退步；所有隔离源码、失败、回归和渲染保留。当前仍为 11 条接纳关系、9/12 完整区域，整页验收未完成。

## 附件核对

用户本次附件 `codex-clipboard-79d6dc53-da18-4a15-834a-387653fe9ac6.jpg` 与冻结 PNG 都为 1086×1448，全部 1,572,528 个解码 RGB 像素一致。2026-10-23 再次核对两份文件 SHA256 与完整解码报告一致，不换源、不重复 OCR。B/C 沿本侧曲线及页脚三柱独立图标仍使用用户已有确认。

[完整解码报告](../.codex-temp/source-attachment-comparison-20261023-v1/comparison.json)。收尾时再次使用独立 Python/Pillow 完整解码，两图全部 RGB 像素差异仍为 0：[本轮重新核对](../.codex-temp/shared-output-array-boundary-20261023-v1/source-comparison.json)。

## 有效对照与结果

隔离实现验证原测量 buffer 与新解码 RGBA，保留普通 paint reader 的 buffer identity 合同；完整实际成员及其快照、唯一端点 ID/box 通过后，抑制共享成员的旧宽走廊，仅由一个实际绘制成员装载完整已测组件 horizontal runs。端点 fill/stroke 没有新增完整快照合同。

最初 v1/v2 加载失败，v3 混用私有注册表导致多项资产改变，均不作为收益证据；对应 whole-page-v1 也不采用。修正隔离解析后，关闭新功能的 auto v4 控制组与原生产全部 shapes、text 及 30/30 图像资产字节一致。

有效 v5 两模式保留全部 shapes、text、30 项图像清单，唯一改变资产是 full-slide-residual；实际激活 40/50 个成员。正常关系和区域数量不变。

| 模式 | 原 PDR | 候选 PDR | 候选 Missing | 候选 MAD | 新增均差>24点 | 恢复点 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| auto | 7.686731% | 7.696906% | 1.960743% | 8.121764 | 248 | 88 |
| reroutable-elbow | 7.766857% | 7.806729% | 1.979359% | 8.201893 | 716 | 89 |

两模式仍通过原数值门槛，但均有 PDR 回退，且新增失败点多于恢复点；可重路由模式三项整页指标均回退。本轮没有更改任何验收规则或 baseline，也不以“仍低于 8%”作为采纳依据。此判断针对该候选，不能推出所有 source-based 擦除方案都无效。

[正常回放对照](../.codex-temp/shared-route-residual-20261023-v1/replay-comparison-v2.json)、[实际 writer/Office 结果](../.codex-temp/shared-route-residual-20261023-v1/whole-page-v2/result.json)。

## 未证明的部分

源组件使用相对背景通道差>=42的入墨阈值，不包括所有浅色 AA/JPEG 边缘。其他节点 mask 仍可能擦除组件外背景；其他 underlay 也保留原线，不能把 exact runs 称为全页完整去重。单线 n201 没有完整 source bitmap 擦除证明，分组上下文不能补造权限。

最新隔离源码收敛了 digest 去重、代表成员选择和预算测试，17/17 回归通过，但未用最新字节重放或运行完整工程 CI。v5 Office 结果只绑定其当时源码，不用于证明最新隔离字节。该实现全部留在 sandbox，未改生产 residual、writer、Worker 或运行包清单。

已独立复现的稀疏数组校验漏洞另从共用边界修复，并补根回归；其验证单独记录，不能把安全修复算作区域或视觉进度。

[隔离证据目录](../.codex-temp/shared-route-residual-20261023-v1/)、[接触层证据](../.codex-temp/head-flank-actual-layers-20261023-v1/README.md)。未提交、推送、部署或重启共享服务。
