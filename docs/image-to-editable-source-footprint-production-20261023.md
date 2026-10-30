# 真实线网覆盖与 Office 分组连接修复

2026-10-23。本轮从真实源图验证发现：旧可重路由拟合器虽然通过源骨架及宽度检查，实际合并的 Office 预设仍会把部分线臂移开 4–5px；完整线干中有 259 个像素超出原覆盖范围。现在在同一原四百万账本中，以私有源像素筛选合并候选，并在签发输出凭证前验证完整实际绘制路径。目标保持 active，整页产品验收仍未完成。

## 源像素与实际输出

- 新 `sharedSourceRouteFittingInk` 只接受 live private fit 和原始源缓冲区身份及内容摘要，提供可修改的独立诊断数据，不能产生源或擦除凭证。原接点/头部和 halo 仍由最后的完整线干检查保留验证。
- 求解器对合并候选检查其实际 Office 预设的源墨迹覆盖，不再只信任宽度相关的中心线拟合。相邻原测量顶点之间的原始腿段保留，最终整体检查不能省略。
- 新输出检查读取真正的 `freeformPath` 或 `connectorFrame/connectorType/connectorAdjustments`，不使用公开 `nativeRoutePoints` 或模式标签证明覆盖。它在两个私有输出注册表之前执行。
- 原 `.75px` body、2px halo、2% halo 比例、接点/头部规则均保持。曲线细分误差加到距离，不增加覆盖半径或再次叠加源路径位移。
- 真实默认模式保留 12 条源边、1 个闭环和 5 条逻辑路径，输出 41 个连接器、35 个控制点，共 76 部件。最长逻辑路径 10 条边，仍低于原 15 条限制。
- 下层测量 3116425 checks，含输出绑定和快照共 **3883552**，原上限 4000000，剩余 **116448**。未提高预算或容量。

独立还原旧源码后，SHA256 与修改前清单完全一致。真实线臂回归在旧算法中有 86 个候选墨迹超出原半径，最大墨迹距离 8px；当前合并候选为 0。中途仅按中心线限制的方案造成过度拆段，已弃用，其失败源码和结果保留。

第一份真实 writer/PPTX 的独立 OOXML 几何核查覆盖全部 3081 个原始线干像素：**未覆盖 0，halo 9**，41 个真实 `<p:cxnSp>`、82 个端点引用。该结果不等于全部 3665 个原组件像素逐色匹配，也不代表移动行为通过。

## 分组与实际跟随

第一份候选的 XML 虽有全部引用，实际 Office COM 将外部业务端点报告为 `BeginId=0`，6 个端点均未证明保持连接。连接器几何变化及脚本完成不能代替端点跟随。

独立核对确认：旧 26 连接器成品没有物理线网组；第一份 41 连接器产物把线网封组，且两个业务轮廓在其他卡片组内。新增分组兼容性检查在私有快照校验后排除会跨 Office 绘制容器的可重路由组，保留逻辑图和全部实际绘制对象。固定路径的原分组合同不因此获得随节点移动的能力。

分组修复后的主链已恢复完整回放，仍是 11 条接纳关系及严格区域 9/12。正式 writer/Office 整页 PDR **7.749115%**、Missing **1.989393%**、MAD **8.252457**，均通过原数值门槛。分组修复前后整页 **1572528 像素逐 RGBA 相同**。这只证明原画面保持，不是整页产品验收。

对这同一份新产物实际移动六个业务端点轮廓各 8pt，保存、关闭、重开后 **6/6 保持绑定并带动连接器**。独立保存包核查确认 41 个连接器的全部 82 项具名端点引用及 site 索引保持，六个轮廓各增加 101600 EMU，5 条逻辑路径和源闭环不变。没有移动完整业务卡片，不能据此宣称整卡移动或无残影通过。

## 已批准外框与 n10 范围

默认模式的底层残差发生变化，旧 n4/n6/n8 after-assets 的摘要绑定安全拒绝。直接转移旧像素差也捕获了冲突并被拒绝。最终在当前资产上重放同一已批准的原始 mask、witness 和 replacement bytes，逐像素确认范围外、透明单元及非源像素均保持，再通过正常 host application 签发事务凭证。没有改门槛、扩大授权或覆盖旧证据。

用户最新批准 n10 卡片及周边 3–4px 的页面底色近似：原生几何 x376/y1043/337×325，已展示的实际影响 x376/y1042/337×326，颜色 `#FBFAF8`。此授权已独立记录，但当前回放**尚未应用 n10 修复**。原始证据和严格结果必须保持；不能将这项许可扩展到其他区域。

## 验证边界

- 新输出覆盖、独立有界平滑内核、源墨迹和分组测试进入统一 unit/all 发现器。最新定向路由与分组范围 **363/363**，无跳过。
- 主/严格边界类型检查通过；最终 Lint 通过，1277 个配置目标、1268 个包边界文件和 2325 个架构预算文件均通过，原 7 项 decreasing-only 例外未增加。实际运行包、独立安装及消费者通过：4052336 bytes、1925 文件、20 包、6 类能力，生产依赖闭包通过。新边界文件加入严格类型与实际运行包必需文件清单；本文在验证后补充。
- 独立 JavaScript 平滑内核与先前 Python 605 个源样本、3 个端口桥段及 64 个目标逐点比对通过，实测 357200 checks。它仍未驱动生产曲线输出；完整源截面读取、连续曲线拟合、拓扑及输出凭证的统一接入仍有剩余工作。
- 没有执行本轮全仓单次 `verify:ci`，没有提交、推送、部署、重启或激活共享 Worker。
- 整页 strict/native-path semantic、native-component 仍失败；36 个 mixed contacts、n10 整卡无残影及真实共享 Worker 验收仍各自需要完成。

## 证据

- [当前回放、实际 Office 与工程证据](../.codex-temp/shared-source-footprint-production-20261023-v1/)
- [原源码回归红绿证明](../.codex-temp/shared-source-footprint-production-20261023-v1/prefilter-red-green.json)
- [第一份实际 XML 完整线干验证](../.codex-temp/shared-source-footprint-production-20261023-v1/office-native/actual-footprint.json)
- [第一份候选移动失败](../.codex-temp/shared-source-footprint-production-20261023-v1/run-v1/result.json)
- [跨分组实际引用调查](../.codex-temp/shared-source-footprint-production-20261023-v1/binding-inspection.json)
- [分组修复后的真实 XML 覆盖](../.codex-temp/shared-source-footprint-production-20261023-v1/office-native-scope/actual-footprint.json)
- [同一产物 Office 移动、保存和重开](../.codex-temp/shared-source-footprint-production-20261023-v1/scope-run-v1/result.json)
- [独立保存包核查](../.codex-temp/shared-source-footprint-production-20261023-v1/scope-run-v1/package-verification.json)
- [已批准外框原计划重放](../.codex-temp/shared-source-footprint-production-20261023-v1/approved-assets-scope.json)
- [n10 最新授权](../.codex-temp/n10-approved-background-20261023-v1/approval.json)
- [前阶段完整诊断与保留失败](../.codex-temp/shared-curve-footprint-20261023-v1/)
