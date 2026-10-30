# 弯折连线残差误擦修复

2026-10-23。本轮修复已定位的白色斜楔：旧整页残差将开放自由路径和原生折线统一按外接框对角线擦除，误删非白背景，实际 PowerPoint 显示页底色 `#FBFAF8`。

当前仍为 **11 条接纳关系、9/12 完整区域**。本轮仅撤销偏离实际路径的旧擦除，不扩展源擦除权限，不解决全部原曲线重复绘制、直线周围白缝、n4/n6/n8 外框或 n107/n111/n119 整卡分组。严格 semantic、native-component 和整页产品验收仍未通过；共享 Worker 未激活。

## 修复边界

新增独立 `residual-connector-path.js` 读取实际 `freeformPath/freeformSegments` 或支持的原生 elbow preset、adjustments、connectorFrame，按 writer 的局部翻转、中心旋转、非均匀像素缩放及 21600/EMU/角度量化顺序投影。不能用公开 `source.nativeRoutePoints` 代替绘制几何。未知 preset、无可解析 frame 的带锚点投影、闭合或多子路径、空或歧义路径显式失败，不回退到对角线。

`residual-connector-mask.js` 将 **旧擦除走廊与实际绘制走廊求交**，输出非重叠水平像素 runs。旧 14px 宽度保持，不能把它当作约 3.35–5px 的原生线宽或完整源归属。本轮不会将整条新路径的宽走廊清空，因此原来未擦除的源曲线仍保留；完整去重及背景恢复需要独立源依据。

每次完整构建独享一份 40M 投影扫描上限，跨全部对象累计；保留原残差审计 40M、总 30000 masks 及源路由 4M 账本。路径上限 120 commands、4096 投影点和 16 层细分，没有提高任何既有门槛或 baseline。外部输入先校验普通数据描述符、稠密数组、数值及边界，拒绝 getter/proxy/Symbol 补位，维度在工厂内拍数值快照，错误不含输入内容。

生产入口只协调私有投影器；新模块进入严格边界类型和运行包清单。`maskBounds` 的类型参数收窄到它实际读取的宽高，不改变运行行为。

## 正常回放与独立验证

两模式均由最终代码的正常 raw rebuilder 使用冻结原图、OCR、人工确认的原计划及真实 private visible-gap 凭证回放，零模型调用。全图比较是最终发布残差，并非只比较单对象 mask，因而覆盖文本背景与其他对象相互作用。

| 模式 | 恢复的原图 RGBA 像素 | 新增擦除像素 | 其他残差变化 |
| --- | ---: | ---: | ---: |
| auto | 4869 | 0 | 0 |
| reroutable-elbow | 4715 | 0 | 0 |

所有恢复点原 alpha 为 0，当前字节与源图一致。两模式 192/202 个 shapes、69 个文字对象、30 个图片对象中全部非目标图片资产及完整编译结果保持。两种 semantic 与 native-component 完整报告分别与原基线深度相同，原失败项未隐藏。[正常回放对照](../.codex-temp/residual-connector-geometry-20261023-v1/replay-comparison-v2.json)、[质量报告对照](../.codex-temp/residual-connector-geometry-20261023-v1/quality-comparison.json)。

独立 Python/Pillow、ZIP 和 XML 核验两模式每张图全部 1,572,528 像素；真实新旧 PPTX 唯一不同条目均为 `ppt/media/image.png`，其完整 RGBA 与相应实际残差一致。全部绘制 XML、原生路径、组、梯度、箭头、连接引用及其他包条目完全相同。本轮没有新增 Office 编辑行为结论；前轮编辑证据保持其原范围。[独立核验](../.codex-temp/residual-connector-geometry-20261023-v1/independent-verification.json)。

用户本次 JPEG 再次独立完整解码，与冻结 PNG 的全部 RGB 像素一致，没有新增分辨率或源细节。

## 实际 Office 整页

两份 PPTX 由生产 writer 直接生成，无写后 XML 修改，再由 PowerPoint 顺序导出：

| 模式 | PDR | Missing | MAD | 原数值门槛 |
| --- | ---: | ---: | ---: | --- |
| auto | 7.686731% | 1.974606% | 8.140204 | 通过 |
| reroutable-elbow | 7.766857% | 1.977246% | 8.197466 | 通过 |

仍使用原 PDR≤8%、Missing≤12%、MAD≤12 及原平均 RGBA 差阈值 24。完整影响域没有新增该阈值失败点，分别恢复 15/22 个失败点。但并非每个像素都改善：平均 RGBA 误差分别有 435/288 个点增加；最大通道差 18 的独立诊断另有 5/6 个新超差，均保留，不能与原生产阈值混写。全影响域及采样见独立报告。

白楔确认点 `(518,565)`、`(714,567)`、`(761,595)` 及 auto 的 `(528,584)` 均恢复背景；嵌入残差与原图逐字节相同，Office 重采样后的确认点每通道差为 0–2，明显优于原页底色。这个结果不代表所有白缝或整页视觉问题消失。[整页结果](../.codex-temp/residual-connector-geometry-20261023-v1/whole-page-v1/result.json)、[auto 预览](../.codex-temp/residual-connector-geometry-20261023-v1/whole-page-v1/auto/render/iteration-0/page-1.png)。

## 工程门禁与保留记录

最终定向回归 43/43（新增 16 项）及两套完整类型检查通过。新回归覆盖真实两模式白楔、逆向直线、L 型及曲线、变换与量化、紧密文字/面板/连线重叠后的 alpha 单调性、源输入不变、正常残差发布、非法/空/极端/恶意输入及预算失败，已由统一 unit 入口自动发现。

完整 `npm run verify:ci` 已于 2026-10-23 12:20:08 UTC 退出 0，绑定输入保持。Lint、两套类型、配置检查、.NET 审计与锁定构建、全部测试、Python lock 及实际运行包安装消费通过。[终态](../.codex-temp/residual-connector-geometry-20261023-v1/final-verification-v1/ci-result.json)、[本轮日志](../.codex-temp/residual-connector-geometry-20261023-v1/final-verification-v1/ci.log)。此结果绑定本轮白楔补丁，不转用于后续隔离候选或新修改。

初始四项红色回归、后续输入边界审查与量化测试失败、初次误把 Office 重采样结果要求为源字节完全一致的独立诊断失败均保留；诊断脚本改为分别严格验证实际残差源字节与实际合成误差，未更改生产质量规则。WindowsApps 的 Python alias 未执行核验，最终使用已配置的 bundled Python 并检查其真实退出码及输出文件。正常回放 v1 保留；最终 v2 绑定全部本轮源码和测试。

[证据入口](../.codex-temp/residual-connector-geometry-20261023-v1/README.md)。未提交、推送、部署或重启共享服务。
