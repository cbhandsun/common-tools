# n10 获准底色修复与正式整卡移动验收

2026-10-23。用户已明确允许仅对 n10「运行控制」卡片及周边 3–4px 使用现有页面底色近似。本轮已完成可信 host 选项接入、真实主链回放、正式 writer/PowerPoint 渲染，以及同一正式 PPT 的整组移动、保存、关闭和重开。n10 局部验收通过；整页目标仍 active，共享 Worker 未激活。

## 实现与授权边界

复用 `createApprovedFrameAssetApplication(frameReview, { cardBackdrop: n10HostReview })` 及现有最终封存事务，不增加主入口业务逻辑。新增 `approved-card-backdrop-input.js` 解析独立授权、固定范围、源身份和 14 个精确成员指纹；`approved-card-backdrop.js` 校验成员归属、边界、页面底色和外部连接，再准备原生底色矩形及整卡组。

14 个逻辑成员进入 `approved-card-region-n10`。`approved-card-backdrop-region-n10` 留在移动组外、残差之上，使用 `#FBFAF8`。原生几何为源像素 x376/y1043/337×325；实际影响严格限制于已批准的 x376/y1042/337×326。原图、原资产和严格结果保留，不获得源测量、源擦除或其他区域的授权。job/page metadata 或公开 approvalId 不能安装此服务。

成员、范围、来源、只读输出、取消和最终审计失败均拒绝；shapes/images/textBoxes/meta 及新资产作为同一事务提交或回滚。授权数据与内层数组、范围和源绑定均深度冻结，输出报告不能扩展后续作业权限。

## 同一正式产物的结果

回放使用原图、68 行冻结 OCR、已确认计划和关系选择，0 次新模型调用。调用正常应用函数；回放 host 包装只提供本次已批准的选项，内存 compiler 插桩只记录账本，不改磁盘编译器。这是冻结输入主链回放，尚非实时共享 Worker 作业。

- 正式 PowerPoint PDR **7.766157%**、Missing **1.989393%**、MAD **8.259741**，通过原门槛 8%/12%/12，阈值不变。
- 相较上一阶段正式产物，**6571** 个变化像素全部在批准实际影响范围内，范围外变化 **0**。
- 独立比较确认原 **334** 项 IR 绘制数据、**368** 个原叶绘制对象及 **30** 份嵌入图像内容保持。14 个成员仅改变必要的分组字段；新增一张原生底色矩形。
- n10 具有 **14** 个逻辑成员、**19** 个实际叶绘制对象。底色矩形在组外；原始源文件逐字节保持，`page.source` 和 `sourceSceneCompilation` 深度相等。
- 41 个共享连接器的 **82** 项具名端点绑定及 site 索引保持。连接器实际几何和绘制数据与上一阶段相等；本轮没有重新移动六个业务端点，也不另称一次端点跟随验收。

对上述正式 PPT 的卡片组上移 350pt，保存、关闭、重开并再次由 PowerPoint 渲染。这个位移只是暴露旧位置的验收动作，不是新布局。独立保存包验证：唯一页面变化为父组 y 偏移 **-4445000 EMU**；19 个叶对象、文字样式和内容完整保持，卡片外 **294** 个绘制对象的完整 XML 子树保持。另一个包变化仅是 Office 正常增加 revision 和更新时间。

旧卡片范围 x379/y1046/330×319 的 **105270** 个像素全部为 `#FBFAF8`，非底色像素 **0**，原卡片框、徽章和淡字残影已消除。批准范围最上和最下各一行仍有合计 **674** 个边缘混色像素，完整保留在测量中；没有把整个批准范围报告成逐像素纯色，也没有为此扩大修复范围。

生产 IR 的 `wholeCardMoveVerified`、`noGhostVerified` 等字段保持创建时 false，创建操作本身不签发验收通过；独立实际 Office 报告单独记录通过。

## 工程验证与保留失败

新增输入、安全边界、成员、授权不可变性、正常行为、取消和回滚回归进入统一 unit/all 发现器。相关统一发现范围 **16 文件、116/116**，零跳过。旧独立包测试最初因声明清单遗漏两个新增模块失败，已补齐清单；保留 `related-v1.tap`，最终 `related-v2.tap` 全部通过，未关闭测试或放宽规则。

主/严格边界类型检查通过；最终完整 Lint、架构和包边界通过，2329 个架构目标保留原 7 项 decreasing-only 例外，无新增或提高。实际运行包、隔离安装、消费者和生产依赖闭包通过：**4055193 bytes、1927 文件、20 包、6 类能力**。该包验证在本文新增前执行，运行源码在其后未改。

原始渲染后的比较脚本误用了 PNG 的 `data` 字段，渲染已完成但诊断比较失败；改用实际 `rgba` 数据核验同一产物，没有重绘或修改产物。独立 XML 检查器最初遗漏绝对关系目标的前导斜线处理、并错误计入无名称的根 spTree 属性；v1/v2 失败日志保留，v3 对合法根节点单独校验后通过，未略过绘制对象。首次相关回归失败及全部严格拒绝保留。

封存复核发现上一阶段清单把自身输出 `seal.log` 在写完前按空文件绑定。旧清单和日志不改写：1055 项中 1054 项逐摘要保持，唯一日志的完成输出逐字段与旧 `seal.json` 一致，并单独记录原空摘要、当前摘要和原因。这不是源代码或验收产物变更；本轮失败封存日志也保留，新封存不把尚在写入的自身输出日志纳入摘要。

没有执行本轮全仓单次 `verify:ci`，没有提交、推送、部署、重启或激活共享 Worker；结束时无 PowerPoint 进程残留。

## 整页剩余项

严格区域仍 **9/12**，已接纳关系 **11**；三个已批准近似外框不改写严格区域结果，strict/native-path semantic 和 native-component 仍失败。36 个 mixed contacts、平滑内核的生产曲线输出接入、完整关系语义及真实 Worker 验收仍需独立完成。本轮只关闭 n10 完整卡片旧位置残影这一项。

## 证据

- [本轮授权记录](../.codex-temp/n10-approved-background-20261023-v1/approval.json)
- [最终正式 PPT](../.codex-temp/n10-approved-background-20261023-v1/office-static/n10-approved-native.pptx)
- [正式静态渲染与范围检查](../.codex-temp/n10-approved-background-20261023-v1/office-static/verification-v2.json)
- [独立结构与严格证据比较](../.codex-temp/n10-approved-background-20261023-v1/static-structure-v3.json)
- [实际移动、保存、关闭和重开](../.codex-temp/n10-approved-background-20261023-v1/move-v1/office-workflow.json)
- [独立保存包和旧位置像素验证](../.codex-temp/n10-approved-background-20261023-v1/move-v1/independent-verification.json)
- [相关回归](../.codex-temp/n10-approved-background-20261023-v1/related-v2.tap)
- [运行包验证](../.codex-temp/n10-approved-background-20261023-v1/runtime-package-v1.log)
- [证据封存](../.codex-temp/n10-approved-background-20261023-v1/seal.json)
