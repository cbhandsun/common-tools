# 架构优化的合并交付批次

快速查看当前结论和剩余事项：[架构改进当前状态](architecture-current-status.md)。本文件保留历史过程证据，较早记录中的“当前”不代表最新状态。

本文件调整执行顺序与批次，不替代 architecture-improvement-plan.md 的 A–F 验收要求，不将剩余范围缩小后宣称整体完成。

用户已澄清实际入口是 Codex 聊天插件，过去已测试过图片转 PPT 闭环；本次同时核查图片转可编辑 PPT 和创建 PPT。Web 入口不是缺项，不再以寻找额外客户端为前置条件。当前公开服务健康且声明两项能力，Codex 未配置工具黑白名单；重新请求两项 PPT 与原有思源 OAuth 能力后 CLI 报告登录成功，但当前会话尚未暴露上传/创建任务工具。此为当前连接待复核项，不能反推历史闭环不存在，也不能把重新授权成功当作远程任务验收。证据 `.codex-tmp/codex-ppt-entry-status.json`，不保存登录链接或凭证到验收报告。

## 当前可核实的交付基线

OCR 持久化检查点已接入图片 Handler 与 Worker 配置（默认关闭）：稳定键位于已验证 owner/job 根目录 `.internal/ocr/`，不放在 attempt 产物目录；绑定源字节、页码、尺寸和显式 OCR 发布摘要，命中后重新验证绑定及 OCR 内容。源文件读入有界，识别期间变化、取消、存储权限/网络/写入错误及损坏缓存均有负向测试。只有 `NoSuchKey` 表示缺失；检查点不成为交付产物，保留清理会收集该对象。先用真实 Handler 故障注入复现 OCR 两次执行，再以新 Handler/新临时目录和真实 attempt 前缀格式证明 OCR 一次、重建两次，质量仍失败，未绕过验收。此测试是 Handler 级恢复模拟，不是 PostgreSQL/Redis/S3 进程杀死演练，也不改变普通失败作业的终态规则。两份 OCR Compose overlay 支持可选 `COMMON_TOOLS_IMAGE_OCR_CHECKPOINT_REVISION`，启用前必须绑定代码与模型的完整不可变版本；本轮未修改线上配置。

本轮 75 项相关测试与 18 项 Compose 测试通过，严格类型、全 Lint、907 文件预算、14 包 209 文件依赖扫描通过，13 个递减例外/1 条历史适配边保持；实际包 738 文件、2208833 字节、6 项能力探针通过。证据 `.codex-tmp/ocr-checkpoint-delivery-evidence.json`，复现日志 `.codex-tmp/ocr-checkpoint-worker-before.log`，操作说明见 [生产手册](ppt-production-runbook.md#ocr-阶段检查点)。下条完整 CI 是这些检查点改动之前的基线，本轮未重复全量 CI。E 保持部分完成，仍需真实进程恢复、发布版本绑定和全阶段复用证据。

最新统一 CI 已一次连续通过 `npm run verify:ci`（exit 0），涵盖完整静态检查、类型、插件、观测/ADR、.NET 审计与构建、unit/contract/integration、Python 锁文件及实际打包安装；打包当时 737 文件、2204194 字节、6 项能力探针。捕获的 1088 个工程源码/配置/测试文件哈希保持不变。保留 1 项既有 Windows 符号链接测试跳过，相关两文件与之前 Linux 8 项全通过时哈希一致；本轮没有重复 Linux。证据 `.codex-tmp/architecture-current-consolidated-ci-evidence.json`、`architecture-current-ci-scope.json` 和完整日志 `architecture-current-consolidated-ci.log`。本条覆盖下方“未重跑完整 CI”的历史限制，但不补足远程验收或真实视觉质量证据，A–F 整体仍未完成。

本轮最终工程验证：58 项连线相关回归、10 项边框模块及隔离包测试通过；严格类型与全 Lint 通过，905 文件预算、13 个只减不增例外、14 包 208 文件依赖扫描通过，仍有 1 条历史引擎适配依赖。实际运行时打包 736 文件、2202236 字节、6 项能力探针通过。未重跑完整 CI。源码哈希及验收范围记录在 `.codex-tmp/source-border-and-anchor-delivery-evidence.json`。

连接线穿过标签的修复（2026-09-06）已接入生产知识图谱重建：`translator-hub` 原先从翻译层文字中心出发，现复用矩形边界求交，从翻译层框边连接到人员框边。新增断言先复现旧行为，再经 58 项相关回归通过。真实 Worker 结果 `.codex-tmp/candidate-production-worker-DQkeRX` 的 pixel-diff / foreground-missing 为 0.07789243 / 0.18654863，整体门禁仍失败，不宣称总体质量通过。稳定性检查确认除该连线外的全部形状、文字和图像对象不变，八个局部图像资产字节不变；整页残差改变 242 像素，均位于旧连线附近（源像素 x624–636、y258–279），原图不变。证据 `.codex-tmp/translator-anchor-before.log`、`translator-anchor-tests.log`、`translator-anchor-stability.json`。

独立边框定位模块 `source-border-fit.js` 已加入核心包导出、严格类型边界、统一 unit 发现及发布文件准入，但尚未接入生产 Worker。Terra / medium 实现，主线程审查并要求补极端坐标终止、采样上限、旋转拒绝、类型收窄，另补真实隔离包行为测试。10 项模块及隔离测试通过；最大 40MP、16384 像素边长、128 个目标节点、10000 个总形状和 2000 万采样操作，拒绝无连续边线、纯色填充及不适用的旋转候选。旧样本离线验证只确认 3/5 个节点，两个蓝色节点保留原候选；离线测试显式补回最终 IR 已清理掉的前期 node role，不能作为生产接入成功的证据。详见 `.codex-tmp/source-border-fit-real-evidence.json`。补充重渲染表明，连接线端点修正和不透明擦除能消除透明擦除产生的方形灰线，但总体质量仍失败，因此该擦除方案也未接入生产。新增 PDF 仍未参与调参或转换。

双边框诊断（2026-09-06）已完成两组真实 OpenXML 构建与 LibreOffice 渲染对照，未修改生产算法。原生节点按 OCR 固定留白推算，与源图边框不一致；局部保真图片仍含源边框。围绕五个候选框进行源像素四边探测均找到连续边线，但这只证明本样本的定位可行，尚不构成通用检测器。基线 pixel-diff / foreground-missing 为 0.07791520 / 0.18653528；只校正五框为 0.07602378 / 0.18732308；同时矩形擦除局部图片为 0.07689387 / 0.18734978。两组质量门禁均失败，后者还出现方形灰边。不能把像素差异下降当作修复通过，也不能把缺失增长全部归因于擦除。下一步需联合验证节点边框、连接线端点及局部图片的像素归属，避免整块清空；本轮两个方案均未接入生产。诊断脚本与证据位于 `.codex-tmp/node-border-diagnostic.cjs`、`.codex-tmp/node-border-diagnostic.json`、`.codex-tmp/node-border-render-diagnostic.cjs` 和 `node-border-render-diagnostic-84bd42` / `node-border-render-diagnostic-3KPBoL` 各目录的 `evidence.json`。新增 PDF 未参与这些实验；未宣称 B–F 完成。

新增 PDF 验证已完成提交前准备：元数据检查为 16 页、未加密，源文件 15257723 字节；通过项目 `team editable-source-archive` 生成 `.codex-tmp/pdf-validation-upload-T4q0Es/source.tar.gz`（15255459 字节），独立 TAR 检查确认仅有普通文件 `assets/source.pdf` 且内容 SHA256 与原文件一致。原文件未修改，尚未查看页面内容。证据 `.codex-tmp/pdf-validation-preflight.json`，本地源码基线 `.codex-tmp/pdf-validation-local-source-snapshot.json`。当前任务工具清单仍仅提供既有作业查询/取消/下载，缺上传/创建接口；未尝试上传、未创建作业，也没有转换产物。安装技能要求通过 hosted HTTPS MCP 完成重建，因此不将本地临时生成器作为这个用户验证任务的替代结果。临时源副本/上传包待实际上传尝试后清理。

不确定 OCR 单字形回退已接入 Worker：只有低于 0.8 置信度、单字符且高度超过同页可靠文字中位数 2.5 倍、至少有 4 条可靠参考文字时，才保留为源图小裁片；规则不绑定具体字符。重建引擎仍接收完整 OCR，重建后按稳定 ID 移除不确定文字，并追加原图裁片，避免影响其他区域分割。显式记录 `ocrAdmission`（本例 32 条输入、31 条可编辑文字、1 个栅格回退），不将回退图块宣称为可编辑文字。裁片发布禁止覆盖目标，拒绝目录逃逸，限制累计 40MP，失败回滚本次产物并保留错误。Terra / medium 实现裁片模块，主代理实现准入策略、接入及对照验收。

实际生产样例 `.codex-tmp/candidate-production-worker-aoKASv` 已恢复此前误识别为“8”的图标：相对弧线修复基线，pixel-diff 从 0.07976516 降至 0.07791520，foreground-missing 从 0.20169043 降至 0.18653528，关注区域从 17 减至 16，整体质量仍失败。逐项比较证明其他形状和保留文字、全部原有 8 个图像对象及其资产字节均未变化，证据 `.codex-tmp/ocr-glyph-stability-evidence.json`。曾尝试在引擎前过滤 OCR，虽恢复图标但改变区域分割，未采用该路径。76 项不同回归通过（74 项相关集，最后 12 项聚焦检查与前者部分重叠），全 Lint/类型/902 文件预算和依赖边界通过，实际打包 735 文件、2197997 字节、六项能力探针通过；未重跑完整 CI。证据 `.codex-tmp/ocr-glyph-delivery-evidence.json`。新增 PDF 尚未用于调参或转换。

新增用户授权验证材料：`D:/下载/2026_China_Enterprise_AI_Agent_Landscape.pdf`（15257723 字节，SHA256 `ec982b2b53509ff69c1a488d9ca8d852d362af8f6117ff49993a5020baf1f367`）。已登记 `.codex-tmp/pdf-validation-input-registration.json`，尚未读取页面内容或用于调参，待当前修复固定后执行 PDF → 可编辑 PPT 验证；其在本任务外的历史来源未确认，不直接宣称独立性已证明。当前会话仍缺上传/创建任务工具，未开始远程转换，文件登记不等于转换通过。

语义弧线源图准入已接入生产 Worker：新增 strict/checkJs 模块，按实际轨迹、颜色、局部反差与连续支持检查语义候选，拒绝空背景、仅端点、错位/异色、低透明度和非法/超限输入。Terra / high 实现独立模块，主代理补局部反差保护、严格边界类型修正及 Worker 接入。检查发生在残差擦除前；任何候选被拒绝都会保留原图底层，并将“主要语义结构全部原生”标记置为 false。未删除整片图标残图。

当前实际生产样例 `.codex-tmp/candidate-production-worker-8dFx5e` 拒绝 2/2 条推算弧线，保留 18 个原生形状；pixel-diff 从 0.08076535 降至 0.07976516，foreground-missing 仍为 0.20169043，整体质量门禁仍失败。65 项相关测试、全 Lint、严格类型、899 文件预算及依赖边界通过；两个回归文件纳入统一 unit，实际发布包探针通过。证据 `.codex-tmp/semantic-admission-delivery-evidence.json`。未重跑完整 CI，未完成独立保留样本或远程验收；双框、底部重复路线、OCR 图标误识别和内容缺失仍待处理，F 未完成。

真实图片质量已用当前生产组合重新验证：`.codex-tmp/candidate-production-worker-Alp4kI` 的指标与旧失败样本完全一致。只读复核和实际看图确认，知识图谱分支从 OCR 推算固定节点外壳/弧线，未校验源像素几何；最终 local 残片仍保留旧边框/路线，与新增原生形状重复。实际 Worker 已开启 local footprint 底图擦除，因此不能归因为该选项漏开，也不能删除整个残片（会丢图标）。

单次诊断在残差生成前拒绝两条推算弧线：`.codex-tmp/quality-arc-admission-diagnostic-4WtY8G` 实际构建、渲染后，pixel-diff 从 0.08076535 降至 0.07976516，foreground-missing 保持 0.20169043，整体仍失败。目视确认不存在的下弧消失、源图上弧保留；双框、底部双线和 OCR 图标误识别仍在。源像素沿两条候选路径支持度约 35%/4%，该测量参数仅为诊断，不作为生产阈值。证据 `.codex-tmp/semantic-shape-quality-diagnosis.json` 与 `.codex-tmp/semantic-arc-source-evidence.json`。下一步是源几何准入和残片所有权协调；未修改生产规则、未放宽质量门禁，F 未完成。

可编辑 IR 的正文、表格单元格、图表分类/系列名补齐 XML 字符准入：拒绝非法控制字符、孤立 UTF-16 代理项及 U+FFFE/U+FFFF，保留空文本、中文、XML 转义字符、TAB/CR/LF 与合法补充平面字符。共用严格类型验证函数，正文修改与新增对象沿用同一入口；失败在预览/编辑/构建之前返回有界错误，不回显内容。新回归修改前 6 失败/1 通过，修改后相关 37 项通过；System.Xml.XmlConvert 独立验证六类非法码点，两个保留 IR 样例通过。新测试进入统一 unit suite。相关 Lint、类型、896 文件预算通过，实际打包 733 文件/2191656 字节/六项能力探针通过；未重跑完整 CI，证据 `.codex-tmp/editable-xml-delivery-evidence.json`。本次未覆盖完整 Deck IR 样式和全部类型，C 继续保持未完成。

图表原生形状职责已从历史大脚本拆出至 `packages/slideclone-core/native-chart-shell-shapes.js`。Terra / medium 完成抽离，主代理完成行为对照、发布与门禁验收：47 个函数体逐字保持一致；9 组既有调用的 62 个形状及输入副作用完全一致；728 项上层回归与 3 项独立 core/预算检查通过。隔离安装在没有 skills 源码的环境实际生成轴线和柱形。模块已加入 package exports 和发布清单，实际打包 733 文件、2191159 字节、六项能力探针通过。

本次类型检查通过；Lint 的 ESLint/配置检查通过后，预算门禁要求下调历史入口上限，已从 41281 行/1982239 字节收紧至 40658 行/1949507 字节，随后预算及剩余依赖边界检查通过（895 文件、13 个递减豁免；205 文件、14 包、1 条历史组合边）。证据 `.codex-tmp/native-chart-delivery-evidence.json`。未重跑完整 CI；本次证明代码拆分兼容性，不代表真实图片视觉质量或远程流程通过。历史引擎仍未拆完，B 保持未完成。文中“迁移”均指内部代码职责拆分，不涉及搬数据、更换服务器或改变 Codex 操作方式。

本批统一验证已执行：原始 `npm run verify:ci` 通过 Lint/类型/插件/观测/ADR/.NET 审计与锁定构建，以及 unit/contract/integration；在 Python 锁检查因 PATH 命中不可用 WindowsApps alias 以 9009 退出。显式使用桌面已配置 Python 后，补跑 Python 锁和实际打包安装，exit 0。不将这记录为单条完整 CI exit 0。

复核 CI 的既有 Windows 跳过项，在隔离只读、无网络 Linux 容器实际运行 prompt suite，先暴露测试相对路径错误，修正后进一步发现同步/异步 persistPromptPlan 在 insideRoot 解析后才 lstat，导致原始符号链接被接受。现共享 checkedPromptInput，同时检查原始文件的 lstat；补齐禁止覆盖断言，Windows 可执行格式/覆盖测试，符号链接在 Linux 真实执行。最终 Windows 相关 39 通过、1 个平台跳过；Linux 8 通过、0 跳过；Lint/类型/diff 通过。该最后修复仅改 prompt.js 和对应测试，其余 1106 个已捕获工程文件哈希不变；最后两文件变更后未重复完整测试集。完整证据与命令边界 `.codex-tmp/ppt-boundaries-consolidated-ci-evidence.json`，A–F 剩余审计 `.codex-tmp/delivery-remaining-audit.json`。整体仍未完成。

原始可编辑 IR 的表格/图表内容边界已落地：新增独立 unknown 输入验证模块并纳入严格 checkJs，ir-editor 入口统一调用；拒绝非法容器、单元格/数值类型、非有限数、超限和无可用数据，在预览/补丁/构建前拦截。保留旧引擎支持的不等长/空表格行、换行、图表缺省分类及 values 回退等格式，未套用新建表单较小的数量限制。Terra / high 实现，主代理补发布检查及输入矩阵回归。43 项相关测试、Lint、类型、预算/依赖边界及 diff 通过；实际隔离打包安装 732 文件、2189005 字节、六项能力探针通过，安装后的编辑入口实际拒绝 rows:[null]。同一组 3 种坏输入在 HEAD 旧校验中被接受、新校验中拒绝；现有新建/图片重建 IR 兼容检查通过且源文件不变。证据 `.codex-tmp/editable-data-delivery-evidence.json`。未重跑完整 CI；unknown→void 验证函数不等于输出完整强类型 Deck IR，C 的其余边界仍未完成。

当前远程工具发现已作只读核验：服务 healthy/ready，声明两项 PPT 能力；两个 remote-mcp 实例运行同一镜像 `sha256:dbd522e44ee659519c4be1643141a3c93a0bceeef6d85d854f7107c541238228`，OCI revision 标签均为空。在该实际镜像中用合成 principal 调用 toolsFor：仅 siyuan-note 能力返回的 8 个工具与当前会话完全一致，增加 image-to-editable/ppt-create 则出现上传和创建工具。此证据证明运行镜像已有入口实现，并将当前缺工具问题收敛到授权范围/工具发现链路；未读取真实 token/claims，不能断言具体身份配置错误。证据 `.codex-tmp/remote-ppt-discovery-diagnosis.json`。未修改 OAuth/线上配置；远程两条流程和版本绑定仍未验收。

HTML 导出字体边界已修复：原先只做 HTML 转义，字体值中的分号仍可注入 CSS 声明；修复前 DOM 回归实际读到 position=fixed。现将有界字体名称编码为单个带引号的 CSS 字符串，转义引号/反斜杠，空值、非法类型、控制字符和超长值回退 Arial。中文/英文字体保留，恶意值不产生额外样式。新增回归在统一 unit 入口，修复前 2 失败、修复后相关 25 通过、0 跳过；Lint（含预算/依赖边界）、类型及 diff 检查通过，无新增依赖，未重跑完整 CI。证据 `.codex-tmp/font-css-boundary-evidence.json`。这补齐了一个实际输入输出边界，不代表全部 Deck IR 类型与内容校验已完成。

PowerPoint 内原生数据编辑进一步完成一份合成样例：表格单元格改为 39、激活图表内嵌 Excel 工作簿将 B2 改为 39，调用 Chart.SetSourceData 刷新数据范围，保存并重新打开验证。独立检查同时要求表格、工作簿和图表缓存一致；最终为 39 与 [39,9,21]，全部通过。证据 `.codex-tmp/ppt-native-data-refresh-20260906/evidence.json`、`independent-data-evidence.json`，同目录保留 `powerpoint-data-edited.pptx`/PDF；LibreOffice 实渲染后折线首点为 39。源 PPTX 哈希不变，结束后无 POWERPNT/EXCEL 遗留进程。本次修正的是 COM 验收驱动调用顺序，未修改生产代码；初次仅写工作簿并 Refresh 时，工作簿为 39 而缓存仍为 27，已明确记为未通过，证据 `.codex-tmp/ppt-native-data-20260906/independent-data-evidence.json`。因此当前证据证明显式刷新范围的 Office 自动化编辑路径，不推断任意 GUI 操作或未刷新的直接 COM 写入都可同步，也不关闭独立保留集、远程交付和 F 的其他要求。

两份创建 PPT 样例现已完成真实 PowerPoint 文字回写验收：本地生成的柱状图样例及编辑导出的折线图样例，均打开→修改原生文字→保存副本→关闭→重新打开→验证修改保留，2/2 通过；源文件 SHA256 不变，验收结束无遗留 POWERPNT 进程。证据 `.codex-tmp/ppt-create-powerpoint-Xc1ORF/evidence.json` 和同目录 `powerpoint-editable-roundtrip-report.json`。保存副本已归档为 `powerpoint-saved-column.pptx`、`powerpoint-saved-line.pptx`；独立 ZIP 检查确认 5 页、编辑标记、原生表格、图表原数值和内嵌工作簿仍在，见 `saved-artifacts-evidence.json`。PowerPoint 会把文字拆为多个运行段，因此检查按文字段拼接验证，没有把原始 XML 连续字符串作为唯一判据。本次仅证明文字在 PowerPoint 内修改后保留，以及表格/图表结构数据随保存保留；尚未证明在 PowerPoint 内修改图表工作簿或表格单元格，也不代表远程闭环或独立业务视觉质量通过。

创建 PPT 的本地编辑导出已实际走通：对上述样例通过版本绑定补丁修改标题、表格单元格，以及图表类型/数值；生成新目录，源 IR 字节保持不变。首次实渲染暴露折线图仅有点、没有线，原因是 NativeChartWriter 对所有系列输出 noFill 描边。现对折线系列输出 2pt、自身系列颜色的可见线条，其余图表保留原行为。回归先失败，修改后相关 15 项测试通过、0 跳过，Release 构建、预算、依赖边界和 diff 检查通过。最终三页实看确认新标题、表格 27 和折线 27→9→21 正确呈现。证据 `.codex-tmp/chart-line-delivery-evidence.json`；保留样例 `.codex-tmp/ppt-create-edit-Bo6AmM/output/deck.pptx` 及 `deck.pdf`。本次为生产编辑/导出 API 验收，尚不包含浏览器交互、PowerPoint 内编辑回写和远程 Codex；未重跑完整 CI。

最新图表文字修复的构建、Lint、类型、预算/依赖边界及 diff 检查通过；未重跑完整 CI。修复前回归 1 失败，修复后 7 通过、0 跳过。哈希绑定记录：`.codex-tmp/chart-text-color-delivery-evidence.json`。

- 创建 PPT 已完成一份保留产物的本地生产流程验收：5 页中文合成样例，原生图表、表格、备注及 PPTX/PDF/HTML，源指纹与页数门禁通过。实际看图发现深色主题图表坐标文字为黑色，已修复 OpenXML 图表未输出 `style.textColor` 的问题；修复后重新生成并确认坐标文字可见。回归覆盖显式深浅色、短色值、空值、非法/极端输入及缺省行为，并保留陈旧数据签名拒绝测试，7 项相关测试通过、无跳过。证据 `.codex-tmp/ppt-create-acceptance-LMJ7Mz/evidence.json`，样例同目录 `output/deck.pptx`、`output/deck.pdf`，前后图分别为 `.codex-tmp/ppt-create-acceptance-1JOxzw/page-3.png` 和 `.codex-tmp/ppt-create-acceptance-LMJ7Mz/chart.png`。这是本地合成样例验收，不代表 PowerPoint 编辑回写、独立业务质量或当前远程 Codex 两条流程均已通过。

- 当前批次完整 `npm run verify:ci` 已通过（exit 0），覆盖自由形状/图表清理、严格类型核心迁移、有向线段准入及精确组合边界门禁。证据：`.codex-tmp/architecture-boundary-consolidated-ci-evidence.json`。276 个工程文件在验收期间哈希未变；日志 SHA256 为 `e2deabea3b48f9435c2b459128d00eb9babc31a09f9cc0bfee4f56fea89da642`。本地 CI 通过不代表真实视觉质量或远程交付通过。
- 当前隔离包 700 文件、六项能力探针通过。真实 PostgreSQL/Redis/Worker/S3 恢复及 OpenXML 缓存六步复用已有证据，后续不因整理文档而重跑。
- 已有真实样本仍未通过视觉质量：pixel-diff-ratio=0.08076535258912308，foreground-missing-ratio=0.2016904342252844；不能将结构检查或可编辑对象数量作为视觉通过。
- 用户确认两份根目录 PPTX 是否参与调参/规则开发为“不确定”。作为定位/回归材料使用，不作为独立保留样本；不再次询问同一来源问题。

## 执行顺序

| 批次 | 实际交付物 | 验收与退出条件 | 外部依赖 |
| --- | --- | --- | --- |
| 1：真实失败定位与质量修复（C/E/F） | 已有失败样本的原因证据、针对通用原因的修复及回归；必要的实际构建/渲染对照 | 不改阈值；分开报告结构、视觉、编辑回写结果；跨样本证明之前不关闭 F | 独立样本来源仍缺。现有样本和保存的 OCR 可先定位 |
| 2：完整职责的架构与类型收尾（B/C） | 按传递依赖闭包整理核心职责、类型边界及隔离发布测试 | 消除历史引擎向上依赖，保留行为与预算；迁移数量和行数下降不作为完成标准 | 本地可推进；不等远程身份配置 |
| 3：当前版本远程交付与恢复验收（D/E/F） | 绑定版本的上传、创建、执行、下载、正负向授权及回滚记录 | 干净客户端实际完成；实际 revision/digest 与批准目标一致；缺项明确保留 | 具备上传/创建权限的测试客户端、受管负向测试身份、目标版本和回滚材料、独立样本 |

批次 2 与批次 3 的材料准备可在批次 1 等待构建/渲染时并行。独立子任务确有收益时才使用 Terra；简单有界盘点可使用 Luna，均公开模型与思考深度并只传必要上下文。

## 降低重复工作的执行约束

1. 同一原因的相关修改集中完成，统一跑相关回归；完整 CI 在可交付批次收尾运行，发生新风险才扩大检查。
2. 复用已有 OCR、源图和基线工件；先定位差异，再运行能区分原因的最小实验。
3. 暂停单纯为了目录归属或行数下降的迁移；B 的目标保留，迁移必须交付可独立执行、检查和发布的职责边界。
4. 不继续按每个小补丁累积长进度日志；优先更新此处的批次状态和明确证据位置。
5. 不沿用依据不足的“6–12 个工作日”估算。下一次估时依据批次 1 的已定位原因及批次 3 的外部条件，分别给出可控执行时间与等待条件；不承诺未核实的总工期。

## 当前下一步

批次 1 已完成首次定位与一个阻断修复：

- 已看源图和保存的实际渲染图：节点边框和连接线存在可见重复/偏移；左下人物图标被 OCR 识别为“8”。对应文本 confidence=0.7812374234199524；这些是诊断事实，尚不能推断统一删除低置信 OCR 即可修复。
- 发现当前准入会拒绝该真实样本的有向线段。Program.cs 的 CreateConnectionShape 明确将有符号端点差转换为非负尺寸与翻转标记；现只对 shapes/line 保留负宽高，仍保留有限数值和绝对值上限，其余对象拒绝负尺寸。新增回归先失败；修复后 53 项 Worker 测试、类型、Lint、861 文件预算和 diff 通过。
- 同一保存样本修复后通过准入（1 页、9 个引用素材），实际 Release 构建 exit 0，PPTX 129,333 字节、5 个方向翻转标记。证据 `.codex-tmp/signed-line-admission-evidence.json`；回归日志 `.codex-tmp/signed-line-before.log`、`.codex-tmp/signed-line-final.log`。构建通过不等于视觉指标通过，未修改已保存的失败结论。

分层实验已完成，证据 `.codex-tmp/quality-layer-ablation-CxsqrY/evidence.json`：同一保存 IR、相同构建/渲染链的基线精确复现原失败指标；仅移除原生形状时，像素差由 0.08076535 降至 0.07591075，但前景缺失由 0.20169043 升至 0.20513539，两者均未获得完整通过。因此不能以移除可编辑对象作为修复。

源残差仍保留面板边框；四个面板/带状对象标记 preserveResidualInterior，代码据此跳过擦除。另有语义裁剪细化 matched=false、但语义原生结构 matched=true 的组合。这些支持“重复叠加是部分误差来源”，尚不足以证明擦除更多边框就能解决前景缺失。

区域定位已完成，证据 `.codex-tmp/quality-missing-regions.json`，直接读取保存的源图/渲染图，未重渲染：标题区域约 6,601 个缺失前景像素，底部标语约 3,401 个，误识别“8”的图标区约 2,262 个。区域会重叠，不能相加为全页贡献；面板整体区域尤其不能作为独立图形贡献。

额外只读核对原始 PPTX 的 slide1.xml：原标题字号 36 pt、底部标语 23.25 pt，字体均 Microsoft YaHei；重建相应为 32.24 pt、14.55975 pt。原文字内容还与 OCR 标点/箭头识别存在差异。ocr-source-deck.js 的初始字号为框高×0.72；证据提示字号估算有明显偏差，但尚不能从单页推导一个通用替代系数。

已完成两页、24 个已知字号的合成渲染样本：Microsoft YaHei，中英文、单/双行、常规/加粗、12/18/24/36 pt。所有行数投影与设计一致。字号/实际字形行高为 0.96–1.04348；以字形行高代入当前 0.72 公式，平均相对误差 28.83%。证据 `.codex-tmp/font-height-calibration-NelHc3/evidence.json`，含输入 IR、实际 PPTX 与渲染工件；脚本 `.codex-tmp/font-height-calibration.cjs`。

限制：上述测量是渲染字形边界，不是实际 OCR 输出框，也只覆盖当前字体/渲染环境，不能把结果作为替换全局系数或 F 完成的充分证据。原 PPTX 仅用于诊断，不向生产注入它的字号或文字。

实际本地 Umi/Paddle OCR 校准已完成：24 个样本全部匹配，共 32 行；当前框高×0.72 公式的平均字号相对误差为 18.77%，字号/OCR 框高跨度为 0.58537–1.09091。证据 `.codex-tmp/font-height-calibration-NelHc3/ocr-evidence.json`。这一结果说明直接换另一个固定系数缺乏依据。

复用相同图片与 OCR 框，测量框内实际黑色字形高度，按 1:1 高度估计并保持 6–36 pt 限制，平均相对误差为 4.08%。证据 `.codex-tmp/font-height-calibration-NelHc3/ink-hypothesis.json`。这是单字体、黑字白底合成样本上的诊断假设；不是独立验收，也未证明在彩色、复杂背景、旋转或其他字体下可靠。未据此修改生产估算公式。

跨字体反证已完成：四页、48 个单行样本，声明 Microsoft YaHei/Arial/Times New Roman/Consolas，12/18/24/36 pt，分别使用 Agyp 123、HELLO、minimum；实际本地 OCR 全部匹配。OCR 框内字形高度 1:1 假设的平均相对误差依次为 17.36%、20.72%、26.45%、27.14%；原公式分别为 23.21%、26.13%、29.46%、26.71%。Consolas 还出现退化。因此否决把 1:1 字形高度作为通用生产修复；不再为这一假设追加复杂背景实验。

证据：`.codex-tmp/font-family-calibration-HYiOuk/ocr-ink-comparison.json`，同目录保存输入 IR、PPTX、渲染图及 OCR 输出；生成与比较脚本 `.codex-tmp/font-family-calibration.cjs`、`.codex-tmp/font-family-ocr.cjs`、`.codex-tmp/font-family-ocr-ink.cjs`。仅验证当前渲染环境，尚未独立核实字体替换。最初沿用多行投影时会把字母 i 的独立点误作新行；已用已知单行区域的完整像素上下界纠正，见 `single-line-ink-evidence.json`，不采用初始 rowRuns 数作行数通过证据。

文字度量验证已完成：复用上述 48 个样本及实际 OCR 文字，以 Pillow 在 256 px 下测量四种候选字体的字形宽高，再分别反推字号。给定正确字体时，平均相对误差 1.72%；按宽高估算一致性选择字体时，平均误差 5.17%，但仅 29/48 次选中声明字体，最大字号误差 26.88%。证据 `font-family-calibration-HYiOuk/text-metrics-evidence.json`（位于 `.codex-tmp/`），脚本 `.codex-tmp/font-text-metrics.py`。该实验未新增依赖或修改生产代码，说明文字度量值得继续，但几何一致性不足以独立决定候选。

已有实现盘点由 Terra / medium 只读完成，并核对入口：`python/font_ranker.py` 已使用 Pillow 比较候选渲染与源图几何，但仅对当前字号做离散偏移，按角色聚合；`lib/font-fast-rank.js` 为异步 Python 包装。`lib/text-box-micro-adjust.js` 的高置信 OCR 拟合使用字符宽度常数且字号只能缩至当前值的 75%–100%，不能纠正当前字号偏小；不采纳直接抽取这一公式替换初始字号的建议。现有 `font-evidence.js` 仅读取已填入的 sizePt。

字形匹配实验已完成：按度量估计字号渲染候选字形，以归一化二值墨迹交并比选择字体，同样 48 个样本的平均字号误差为 2.08%，45/48 次选中声明字体，最大误差仍为 18.07%。证据 `.codex-tmp/font-family-calibration-HYiOuk/text-silhouette-evidence.json`；脚本 `.codex-tmp/font-text-silhouette.py`。只在内存中比较候选，不改写源图、不重跑 OCR 或 PPTX 渲染。失败包括 OCR 丢失空格、框内字形不完整以及 Arial/YaHei 相近字形歧义。

事后诊断的回退规则（字形误差≤0.35、宽高字号差≤0.10、前两候选评分差≥0.05）接受 39/48 个，接受部分平均误差 0.88%、最大 2.80%，9 个回退。将回退样本按现有公式计入后，全体平均误差 6.79%，最大仍达 57%。证据同目录 `text-confidence-diagnostic.json`。这些阈值是在看过样本后选择，不能作为独立验证或生产门禁；平均值改善尚未解决回退难例。

固定策略迁移验证完成：生成前保存 `.codex-tmp/font-transfer-policy.json`（含匹配脚本 SHA256），新增 48 个 Budget 2026/REVIEW/workflow、10/16/22/30 pt、黑/蓝/灰文字、白/浅蓝背景样本；四种字体和渲染环境相同。原公式平均误差 26.57%，含回退后 8.62%，31 个接受、17 个回退；接受部分平均 1.50%、最大 11.98%，无相对原公式的退化。全体最大仍 48.4%。证据 `.codex-tmp/font-transfer-validation-abCDJ6/frozen-policy-evidence.json`。这是新增合成迁移验证，仍不是真实业务独立保留集；阈值未根据新结果调整。

真实页标题/标语验证完成：复用保存 OCR 和源图，候选增加各字体实际粗体文件，原 PPTX 字号仅作诊断标签。两者均选中 Microsoft YaHei Bold，估算分别 33.14/20.29 pt（原始 36/23.25 pt），但字形误差 0.597/0.728 超过固定 0.35，两者必须回退。因此该策略当前不能修复真实失败页，不能凭合成平均值进入生产。证据 `.codex-tmp/font-real-text-validation/text-silhouette-evidence.json`，脚本 `.codex-tmp/font-real-text-validation.py`；候选数量与合成实验不同，不能混合统计。

真实文字对照完成：仅诊断副本改用原始标题/标语，字号估计为 33.54/21.59 pt，字形误差为 0.366/0.606，宽高字号不一致为 0.117/0.142，仍均不满足固定规则。证据 `.codex-tmp/font-real-text-oracle/text-silhouette-evidence.json`。原始页面尺寸读取为 12192000×9144000 EMU，即 960×720 pt，与字号标签一致；没有将原始文字或字号写入生产。OCR 错字仅解释部分误差，不能把改正文字当作完整修复。

当前决策：结束这一轮字号方案试验，保留失败结论和固定策略证据，暂不接入生产或追加单页调参。F 仍未通过；字号方案后续需解决字形分割/对齐和真实样本迁移，不能以平均数替代实际质量验收。执行重心转回批次 2 的完整职责边界。

批次 2 新基线：按当前引擎入口的静态字面量 require 传递闭包，实际涉及 143 个工作区文件（91 个 skills 文件、52 个 core 文件）、213 条边，未发现动态 require 或未解析引用；逐文件保存 SHA256。证据 `.codex-tmp/native-engine-transitive-graph.json`，脚本 `.codex-tmp/native-engine-transitive-graph.cjs`。此口径不包含工作区外依赖、Python/.NET 等运行时资产，也不是整个 core 包的逆向依赖审计；闭包内 core→skills 为零不能证明历史入口适配器已消除。后续迁移以这一闭包及运行时资产为准，不能再用入口直接依赖数估算全部剩余工作。

批次 2 门禁修复：全包检查确认目前核心包没有反向导入；唯一历史边位于 `packages/remote-mcp-server/bin/common-tools-team-image-worker.js` → 历史引擎。原检查器宽泛允许整个 CLI 包和 Worker bin 目录导入任意包外文件，不能阻止迁移反弹；现改为仅放行上述精确文件对，其余包外导入继续拒绝。回归覆盖现有边、同入口换目标、CLI、新 Worker、嵌套同名 Worker 和领域模块。修改前两个回归均失败；修改后 16 项边界/工程门禁测试通过，Lint、861 文件预算通过。测试保留在统一 unit/verify:ci 入口；本轮未重跑完整 CI。日志 `.codex-tmp/composition-edge-before.log`、`.codex-tmp/composition-edge-final.log`。这收紧了迁移门禁，没有消除剩余引擎依赖，B 仍未完成。

上述修复随后统一完成全量 CI，见顶部基线。其后完成 Worker 残差职责装配修复：`createFullSlideResidualBuilder` 直接绑定 core 的 `eraseMasks/readPng`，历史实现仅需提供 `rebuildDeckFromWorkDir`。回归在旧版抛出“legacy eraseMasks must not be accessed”，新版通过；实际 PNG 擦除后整张像素数组与预期一致，区域外像素与原文件字节均保留。Worker、核心隔离、边界共 69 项测试通过，类型、Lint、861 文件预算通过。证据 `.codex-tmp/worker-core-residual-evidence.json`。顶部全量 CI 早于这次装配修复，此次只跑匹配风险的检查；历史引擎依赖本身仍在，B 未完成。

视觉分层分类这一完整职责已交付：13 个旧实现转为 core 兼容入口，两个大模块按图形几何、语义识别、像素组件、拓扑、残差分析和组件策略拆分，当前闭包为 31 个核心模块、无循环或外部运行时导入。撤销两个旧超限豁免，没有增加新豁免；892 文件预算检查保留 13 个其他历史豁免。Terra / high 负责实现，主代理完成接口、发布清单和验收。

验收证据 `.codex-tmp/visual-classification-delivery-evidence.json`：无 skills 的隔离安装实际从像素识别节点、连接线和图标；保存真实源图的整页与三个面板共 141 个元素，分类与检测结果哈希和迁移前一致。779 项上层/Worker/边界回归及最终 127 项相关检查通过（集合重叠，不相加），Lint、类型、预算通过。真实打包安装为 731 文件、2184979 字节、六能力探针通过。这里只证明分类职责可独立执行且已验行为未回退，不代表整个历史引擎已拆完，也不代表图片视觉质量或远程两条 PPT 流程通过。上一份完整 CI 早于本次改动，本次运行上述相关检查及实际打包安装。


## 2026-09-06：统一 CI 收尾前的状态页历史快照

以下原状态页完整归档；其中的当前、最新和下一步均指各自记录时点。当前结论以 architecture-current-status.md 为准。


本页用于快速查看剩余工作；验收范围仍以 [原实施计划](architecture-improvement-plan.md) 的 A–F 为准。详细历史证据见 [分批交付记录](architecture-delivery-batches.md)。

| 项目 | 当前结论 | 完成前还需要什么 |
| --- | --- | --- |
| A 工程预算 | 已恢复，后续只收紧 | 随每批改动保持门禁通过 |
| B 核心引擎拆分 | 未完成 | 生产图片 Worker 仍通过唯一历史适配入口调用 `rebuildDeckFromWorkDir`；移出剩余识别与重建职责，并证明真实行为不回退 |
| C 类型和输入边界 | 部分完成 | 已补 XML 字符/结构、模板占位符、实际模板上下文、原生图表载荷及构建模式标量准入；完整 Deck IR 与剩余核心边界尚未证明覆盖完整 |
| D 远程交付 | 未完成 | 当前连接恢复上传/创建工具后，完成两条真实流程、部署版本绑定、授权负例和回滚验证 |
| E 阶段恢复 | 本地场景已验证，部署待验收 | 原计划中的失败分类、耗时/关联、缓存失效/复用、取消、租约恢复及清理已逐项核对，见 [恢复验收表](stage-recovery-acceptance.md)；剩余为实际 OCR 发布版本绑定、部署启用及线上观测验收 |
| F 实际编辑质量 | 未完成 | 新建 PPT 的本地创建及 Office 编辑已验证；当前开发图片样例已通过实际 Worker 全部交付检查和 PowerPoint 编辑、保存、重开验证，交付级别为部分可编辑；还缺新 PDF、独立样本及完整质量/成本比较 |

### 当前优先顺序

最新 C 增量：工具平台图重建已纳入 strict/checkJs 与 unknown 入参类型负例，坐标、文字、字体和元数据在修改目标前校验；探针先复现 getter/toString 被执行且输入获准的问题，现拒绝访问器和对象转换，并将已验证文字复制到普通数组，避免执行调用方覆写的数组方法。保留无源图的原有短路行为及合法输入的元数据更新；复用 30,000 项、32,768 字符的现有边界尺度，并限制累计文字大小、避免每张图片重复校验整页文字。最终 725 项回归、108 次合法输入及元数据变更对照、类型、Lint 和 757 文件运行包通过，证据 `.codex-tmp/tool-platform-typing-evidence.json`。此结论仅覆盖这一识别模块，其他算法的严格边界、远程及独立 PDF 验收仍未完成；未重跑全量 CI。

最新 B 增量：工具平台图、评审风险门禁图两组重建职责及共用复杂图形保留策略整批移入核心，共 26 个函数；共用策略进入现有图片元数据模块，其他调用方使用同一实现。除修正 Lint 发现的多余正则转义外，算法函数体保持一致；该修正逐一比较全部 65,536 个 UTF-16 码元，行为一致。原生重建相关 721 项回归通过；最终原生及标签测试 716 项、隔离安装 6 项通过，类型、完整 Lint、757 文件运行包通过。证据 `.codex-tmp/platform-review-delivery-evidence.json`。历史引擎仍有 38,794 行、1,355 个顶层函数，完整严格类型和独立视觉/远程验收继续保留，未重跑全量 CI。后续依赖清单已刷新；下文为此前批次记录。

最新 B 增量：根据 ESLint 作用域引用生成剩余函数依赖清单，整组迁出“带截图的流程图重建”11 个函数，布局、原生对象、文字及最小单元裁剪共用已有核心依赖，无回调历史脚本。提取前后算法函数体哈希一致。721 项原生重建相关回归通过；隔离安装另经 6 项测试，实际生成原生卡片和文字。类型门禁、完整 Lint、预算及 755 文件运行包通过，证据 `.codex-tmp/screenshot-flow-delivery-evidence.json`。新模块保留既有内部 JS 契约，算法的完整严格类型仍待覆盖；未新增独立视觉或 Office 验收。当前历史引擎 39,784 行、1,381 个顶层函数；后续按 `.codex-tmp/engine-function-closures.json` 的完整职责闭包推进，B/C 不以行数下降作为完成标准。下文为此前批次的证据。

最新 B/C 增量为文字策略职责：字号、字重、标题/指标识别及单行换行策略集中到严格类型核心模块 `native-text-style`，旧入口导出兼容，初始化时先加载策略再组装 finalizer。724 项原生重建/隔离包/策略回归通过；与提取前源码的 17,920 次确定性行为对照无差异、输入未变。类型、完整 Lint、预算及 754 文件运行包通过，未重复全量 CI，也没有声称新增视觉质量或 Office 验收。证据 `.codex-tmp/native-text-style-delivery-evidence.json`。历史引擎仍有 40,415 行，B/C 保持未完成；下述完整 CI 证据对应此增量之前的冻结源码。

本轮完成 PPTX 构建执行职责的核心包接入：`pptx-build-execution` 负责批量任务校验、Python/OpenXML 调度及有界 Python 进程；`pptx-build-mode` 独立负责构建模式，历史入口保留兼容导出并提供资源路径。复用既有严格任务准入，保留合法扩展字段且拒绝访问器；Python 失败不回显用户路径或子进程内容。真实 Python 验收发现并修复资源路径漏掉 `scripts` 的迁移问题。最终 732 项回归全部通过，无跳过，包含完整原生重建、实际 OpenXML 批量构建和核心包隔离执行；另有真实 Python 构建及可编辑文字 XML 检查。双配置类型、Lint、预算和 753 文件运行包通过。历史引擎预算降至 40,559 行，仍有识别及页面重建职责留在原脚本，B/C 未完成。证据 `.codex-tmp/pptx-execution-delivery-evidence.json`；本轮未新增远程、Office 或独立 PDF 验收。

1. 当前代码已通过单次完整 `npm run verify:ci`，退出码 0，覆盖静态检查、插件/观测/ADR、.NET 审计和构建、全部单元/合同/集成测试、Python 依赖锁及运行包。启动前已配置提供的 Python/.NET 路径。静态检查阶段捕获的 1,171 个输入文件至结束未变；保留 1 项既有 Windows 符号链接测试跳过。运行包 753 文件、6 项能力探针通过。证据 `.codex-tmp/build-delivery-consolidated-ci-evidence.json`。本次包含最近的 Deck IR、模板上下文及构建执行改动，不替代远程或独立样本验收。
2. 当前开发图片样例已通过本地实际 Worker 的全部 17 项交付检查及实际 PowerPoint 编辑验证。两条右侧关系改为根据源像素定位，修复错误圆弧及被误拒绝的主要结构；沿用原有门禁和背景例外规则。下一步转向新 PDF 和独立样本验证，不继续围绕此单一开发样例调参。
3. 阶段恢复的本地验收已收敛，部署验证与 D 合并推进；核心引擎后续改动必须对应实际职责或边界缺口，不单纯追求拆文件。
4. 远程工具恢复后立即执行 PDF 转换和新建 PPT 的远程验收，记录实际部署版本。

当前 C 批次补齐三类真实入参缺口：非法 XML 控制字符/残缺 Unicode 在原校验中被接受、实际 .NET 构建失败，现由严格类型的 `deck-ir-tree` 提前拒绝，保留合法中文、换行及 emoji 和既有深度/数量/数值限制；模板占位符按构建器的 128 项、字段、范围及唯一键规则校验；显式原生图表载荷复用签名/哈希/数据校验，过期或损坏数据在构建前拒绝，未指定载荷的旧矢量回退保持。错误不回显输入内容。

本批 89 项回归（含真实 OpenXML 构建、原生图表工作簿及统一套件分类）通过，无跳过；双配置类型、完整 Lint、预算、包边界和 748 文件运行包验证通过。实际 Worker 再验收 `.codex-tmp/text-refinement-production-UXdUgg` 全部 17 项检查通过、6 个文件生成、源图未变。既有单页图片及五页新建 PPT 的结构数据通过新规则，导出资源路径不等同于上传归档路径契约。证据 `.codex-tmp/deck-admission-delivery-evidence.json`。

模板上下文缺口已补齐：Worker 在构建前使用 OpenXML 构建器的只读模板检查，按实际关联的布局及源页序号校验；无模板的保留页/布局请求提前拒绝，布局大小写及保留页忽略新布局的行为与构建器一致。.NET 直接调用也先检查，失败不留下输出或改写模板。71 项相关回归通过，无跳过；新增集成测试已进入统一 CI 分类，运行包 751 个文件及 6 项能力探针通过。双配置类型、完整 Lint、预算及包边界通过。实际图片 Worker 再验证全部 17 项检查通过，耗时 30.43 秒。证据 `.codex-tmp/template-context-delivery-evidence.json`；本批未重跑完整 CI，完整 Deck IR 及剩余核心边界仍待覆盖，C 保持未完成。

最新交付证据为 `.codex-tmp/relation-production-delivery-evidence.json`，对应 `.codex-tmp/text-refinement-production-pS69t9`：实际归档 Worker 完成原生重建、OpenXML 构建、一次文字校正和最终多格式交付，17 项检查全通过、6 个文件已生成，原图 SHA-256 未变。报告为 `partially-editable`，包含 51 个原生对象、10 条原生连接关系和 9 张残差图片；整页残差仍存在，按既有背景例外保留，不能称为全原生可编辑。单次本地运行 39.63 秒，使用保留 OCR 和内存对象存储，不代表线上耗时或独立样本成本。

关系模块新增正常、空白、非法、重复目标、极端比例、无箭头、非目标样式及采样上限回归；6 项模块测试、69 项 Worker/隔离包相关测试、两套类型检查、完整 Lint、架构预算和包边界检查通过。运行包实际打包 747 个文件，隔离安装的 6 项能力探针通过。此次证据不替代完整 CI 或远程验收。下文保留早期失败和逐步修复记录，当前结论以上表和最新证据为准。

最终交付 PPTX 的 PowerPoint 16.0 验证已完成：在独立副本中修改一段原生文字、上方圆弧横坐标和下方直线粗细，保存并重新打开后三项修改均保留。已查看 PowerPoint 导出的修改前后整页图片，并导出修改后 PDF。独立 OpenXML 检查确认 61 个对象名称不变、圆弧横坐标增加 12,700 EMU、直线粗细增加 3,175 EMU，原始交付文件和输入副本字节相同。证据 `.codex-tmp/image-office-9161d475/independent-evidence.json` 及同目录 `edit-evidence.json`。此验证覆盖选定原生对象，不表示所有残差图案可编辑，也不替代独立样本或远程验收。

合并工程验证已覆盖新增关系回归：单元、契约、集成套件分别完成，未新增跳过或放宽门禁；Python 依赖锁 dry-run 和 747 文件的运行包隔离安装亦已完成。环境中断和补跑日志均保留，代码输入哈希及文件集合相同。当前连接仍未提供上传目标/创建任务工具，因此尚未启动已登记 PDF 的远程转换；本地可继续推进 B/C，不将整个计划标为阻塞或完成。

双边框定位证据 `.codex-tmp/node-border-layer-ownership.json` 表明，3 个灰色节点的旧边框同时存在于整页残差和 3 张局部残差。修复因此同步处理节点位置、相关连线端点及全部相关图层。

隔离实验已接入实际 Worker 组装，最新样本为 `.codex-tmp/candidate-production-worker-XdWVHV`：定位 3 个灰色节点，4 个图层分别变更 516/242/445/166 像素。真实 OpenXML 构建及渲染后像素差异率为 0.0751789、缺失前景比例 0.1860145；几何和全部 9 张图片像素与实验一致，文字及源图字节未变，见 `.codex-tmp/gray-border-production-parity.json`。整页门禁仍失败；圆角、蓝色节点及其他连线残留尚未解决。

`knowledge-graph-gray-node-fit` 和 `gray-border-pixels` 负责几何及像素计算；`gray-border-residual` 负责有界文件输入、无覆盖发布及失败回滚，Worker 在质量审计前调用。已验证异步取消、首层实际发布后取消回滚、目标碰撞、路径/符号链接拒绝、聚合像素上限及 OCR 图标保留。此次是工作区生产代码接入及本地实际执行，尚未部署到线上。

本批相关 110 项回归经修正一项旧元数据断言后通过；PNG 读写器补齐严格 JSDoc 后，另完成 21 项 PNG/发布/Worker/隔离包复验。两套类型检查、完整 Lint、工程预算、包边界及 743 文件的运行包验证通过；新增测试已进入统一 CI 的单元套件。本批未重跑完整 `verify:ci`，证据 `.codex-tmp/gray-border-production-delivery-evidence.json`。

后续按整页报告定位：16 个需关注区域中 11 个是文字。原图/渲染墨迹测量表明标题、正文和底部文案的缩小程度不同，不能套统一字号倍率。隔离实验 `.codex-tmp/measured-text-fit-probe-JBNdSv` 按每段实际宽高证据调整 19 段可编辑文字，像素差异率降至 0.0619682、前景缺失率降至 0.0869318，现有整页门禁通过（阈值未改）；需关注区域降至 5。原始图片、全部残差图片、形状和文本内容不变。该结果仅证明当前开发样本的实验有效，不代表独立样本或生产交付已通过。

实验已整理为纯模块 `text-ink-geometry` 和 `measured-text-fit`，模块结果与上述真实渲染输入逐项一致。16 项模块/隔离包测试及双配置类型检查通过；新测试进入统一 CI 的单元套件。提议阶段使用与现有 OCR 不确定性策略一致的 0.8 置信度边界，保留透明、多行、自动缩小文本等排除条件。尚需一次性生产控制层：重新构建并渲染候选、只接受质量改善且不回退的结果、失败或取消时保持明确状态。证据 `.codex-tmp/measured-text-module-delivery-evidence.json`。

一次性控制层已完成：`text-refinement-coordinator` 复用首次渲染，只在原结果不达标时尝试一次候选；候选必须通过视觉门禁、三个主要指标均不回退，才交给后续多格式交付。原始 IR/PPTX 不覆盖；更差候选被清理，构建/验证异常与取消明确传播。部分构建写入、UUID 碰撞、非法报告、取消和路径边界均有回归；最终协调器 11 项、相关套件 78 项及 Worker/隔离包测试通过，类型、Lint、预算、包边界通过。本批未重跑完整 CI。

真实归档 Worker 样本 `.codex-tmp/text-refinement-production-J1RZot` 已走完原生重建、OpenXML 构建、两次 LibreOffice 渲染和多格式交付，采用 19 段调整，生成 6 个交付文件；原图未变。整页视觉指标保持 0.0619682/0.0869318，但最终质量报告为失败，唯一失败检查为 `complex-graphic-native-gate`：原生对象 49 个，原生覆盖率 0.1562，残差覆盖率及最大残差均为 1，且不满足背景例外条件。未修改门禁或例外标记。该本地夹具复用了真实 OCR、使用内存对象存储，单次耗时 44.27 秒，其中文字校正约 18.54 秒；不是线上耗时或独立样本成本比较。证据 `.codex-tmp/text-refinement-production-delivery-evidence.json`。

这次完整任务同时发现并修复了知识图谱形状生成器的可选 `endArrow: undefined`：现在在生成处省略未定义样式字段，避免内存 IR 被 Worker 边界拒绝；外部输入校验未放宽。

### 已确认的边界

- 当前 Windows 工作区一次连续执行 `npm run verify:ci`，退出码 0；Lint、类型、插件、观测/ADR、.NET 审计/构建、单元/合同/集成、Python 锁文件及打包安装全部走完。捕获的 1088 个工程源码/配置/测试文件哈希未变。保留 1 项既有 Windows 符号链接测试跳过；其对应的两份源文件与之前 Linux 8 项全通过时哈希相同，本轮未重新运行 Linux。证据 `.codex-tmp/architecture-current-consolidated-ci-evidence.json`。
- 主要入口是 Codex 聊天插件，Web 入口不是当前缺项。历史工作流曾成功，不能因当前连接少工具而否定历史闭环。
- “代码拆分”指内部职责整理，不涉及搬迁用户数据或更换服务器。
- `2026_China_Enterprise_AI_Agent_Landscape.pdf` 已登记并准备上传包，尚未转换或用于调参；不把准备完成当作验收通过。
- 当前真实归档图片 Worker 样本为 `.codex-tmp/text-refinement-production-J1RZot`：视觉门禁通过，最终可编辑性门禁失败。新建 PPT 的 Office 表格和图表数据回写证据为 `.codex-tmp/ppt-native-data-refresh-20260906`。
- 统一 CI、远程流程和真实视觉质量是不同层面的证据；任何一个通过都不能替代其余两项。
- 单页真实重建入口的组合回归已纳入集成套件：首次构建与缓存命中保持相同可编辑内容、每次仅完成一次；PNG 解码和缓存发布失败都不会报告完成。新增 3 项、相关共 19 项通过，见 `test/native-page-lifecycle.test.js`。这些路径没有复现生产缺陷，因此本批未机械拆分主入口，B 仍未完成。
- 上述完整 CI 之后的水平箭头修复通过 75 项相关测试、类型及 Lint/边界门禁；证据 `.codex-tmp/horizontal-connector-fit-delivery-evidence.json`。未为此重跑完整 CI，未部署。


## 2026-09-06：WMS 路线重建职责

WMS 路线形状、文字、组件标记、最小单元裁剪 36 个函数从历史引擎迁入核心包；共用标签匹配和输出横幅布局分别集中维护，旧布局入口转发。36 个函数体及布局辅助字节保持一致，13 个场景、26 次输出和元数据对照无差异；4 个实际 PNG 裁片及元数据一致、源像素未变。718 项原生重建/布局回归与 25 项隔离安装/缓存回归通过；双类型、完整 Lint、760 文件运行包/6 项探针通过。Terra / medium 完成无 Skill 源码的非空 WMS 卡片及文字隔离测试，主代理完成迁移、对照和门禁。证据 `.codex-tmp/wms-route-delivery-evidence.json`。历史入口仍有 37,863 行，B/C 未完成；未重跑完整 CI，未新增远程/独立 PDF/Office 质量证据。模块保留既有内部 JS 契约；保守全包缓存指纹保证变更失效，但横幅辅助变更的失效范围较以前扩大，精确阶段指纹仍待改进。


## 2026-09-06：四步落地流程重建职责

四步落地流程图重建及 OCR 归属筛选共 28 个函数已进入核心包，共用文字匹配和几何距离集中维护。保留原有算法，仅将两个未使用参数改为下划线名称以通过新覆盖的 Lint；还原这两个名称后函数体哈希与原实现一致。18 个场景、36 次输出及元数据对照无差异；初轮 738 项重建/缓存/文字回归通过，最终 721 项重建/隔离回归通过，两组有重叠不累加。最终类型、完整 Lint、761 文件运行包和 6 项探针通过。证据 `.codex-tmp/four-step-landing-delivery-evidence.json`。仍保留内部 JS 契约，未完成全部严格边界，未重跑完整 CI 或独立视觉/远程验收。

Terra / medium 补无旧 Skill 源码的实际四卡片、三箭头、十四文字及组件元数据隔离测试；主代理负责迁移、对照和门禁。WMS 缓存收窄经核查暂不实施：完整关键词条件不足以覆盖局部文字和图形元数据触发的重建路径，不能据此排除实现依赖，决策记录 `.codex-tmp/wms-cache-scope-decision.json`。保守整体指纹继续生效；没有声称精确阶段缓存已完成。


## 2026-09-06：极端旋转角度的实际输出修复

实际 Deck IR → OpenXML 验证发现：获准的正负 100000° 都因整数溢出写为 -2147483648。角度转换现先去除完整圈数，分别保留 280°/-280° 的等价方向，输入准入规则不变。原源码匹配测试升级为实际文本、普通形状、自由形状和图片的 32 组输出断言，覆盖缺省、零、负数、分数、多圈和极端值；回归先失败，最终 58 项合同/准入测试全部通过。第一次组合运行有一项命令行测试遭遇并行构建失败，记录保留，随后串行整组通过。类型、完整 Lint、.NET 审计/锁定构建及运行包通过；相同输入字节的前后 PPTX 对照证据 `.codex-tmp/deck-rotation-delivery-evidence.json`。未重跑完整 CI，不代表全部 Deck IR、独立视觉或远程验收完成。

Luna / medium 只读比对模型和 JS 契约，未发现可确认的新反序列化缺口；主代理通过实际极端输入构建定位输出溢出，完成修复和回归。


## 2026-09-06：Deck IR 数据属性与头部准入

Deck IR 树与顶层版本/尺寸/页数现在由严格类型模块按数据属性准入，拒绝 getter、数组迭代/序列化覆写、Proxy、稀疏数组和非 JSON 原型对象；在反射前识别 Proxy，保留普通 JSON、null 原型记录、输入身份和原有数值/数量限制。初始 3 项回归失败，补充 Proxy 复现后修复，最终 76 项树/Worker/隔离/OpenXML 准入测试通过，无跳过；类型、完整 Lint、761 文件运行包及 6 项探针通过。实际本地 Worker 再验收全部 17 项检查通过，生成 6 个产物，源图未变，证据 `.codex-tmp/deck-data-properties-delivery-evidence.json`。该运行仍使用开发样例、保留 OCR 和内存对象存储，不代表独立 PDF、远程或新增 Office 编辑验收。

生产 Worker 证据：`E:/DEV/WorkSpace/Efficiency/common-tools/.codex-tmp/text-refinement-production-9ClNQH/evidence.json`。本轮由主线程完成，未新增子代理；未重新运行完整 CI，未修改远程配置或输入准入的数值/数量上限。


## 2026-09-06：资产枢纽与资产 OS 闭环重建职责

资产枢纽、AI Skills 与资产 OS 闭环等重建职责共 38 个函数已拆入核心包；图形重建、裁剪、比较矩阵证据和共享几何分别维护。拆分前后 12 个场景（9 个有实际输出）、36 次输出/输入变更/裁剪文件对照无差异，含 11 张实际 PNG 字节相同；恢复明确记录的无效代码清理后，38 个函数体及 2 个完整辅助模块哈希与原实现一致。715 项重建及 29 项隔离/辅助/缓存测试全部通过，无跳过；类型、完整 Lint、766 文件运行包及 6 项探针通过。证据 `.codex-tmp/asset-hub-cycle-delivery-evidence.json`。尚未重跑完整 CI，未完成全量严格类型、独立 PDF 或远程验收。

Terra / medium 补无旧 Skill 目录的真实非空隔离调用，验证连接、中心文字、组件归属及端点图片保真策略。新增断言最初误写中心副标题，已对照拆分前源码纠正，未修改产品文字。初始失败日志保留；主代理完成拆分、Lint 清理、前后行为与裁剪字节对照、包导出和门禁。


## 2026-09-06：五批增量合并完整 CI

最近一次完整 `npm run verify:ci` 退出码为 0，12 项必需阶段均实际执行通过，覆盖最近的 WMS、四步流程、旋转输出、Deck IR 数据属性边界及资产闭环改动。启动前记录的 1,195 个工程输入（本次补含 config、Python 和锁文件）在结束时文件集合与哈希一致；运行包含 766 个文件，6 项能力探针通过，保留 1 项既有 Windows 符号链接测试跳过。证据 `.codex-tmp/cycle-consolidated-ci-evidence.json`；该指纹范围不是整个仓库或所有外部依赖。

本轮未修改生产逻辑。另按当前历史入口哈希复核静态调用关系，记录 `.codex-tmp/production-root-closure-audit.json`：`rebuildDeckFromWorkDir` 的词法函数依赖仍涉及 986 个函数；模块级回调与动态分派还需补充追踪，该数字不是完整运行时调用证明。后续按生产职责推进，不以零散函数数量或脚本行数下降替代消除生产历史依赖。当前可调用工具清单仍无上传和创建任务工具，尚未启动用户 PDF 或新建 PPT 的远程验收。


## 2026-09-06：图形原子的原生形状与支撑职责

图形原子转原生对象的 97 个函数已按形状生成、像素补充识别、拓扑、元数据、提升策略、保真策略和甘特图分别进入核心模块；共享组件归属模块也由核心维护。62 次调用、124 项输出/输入变更对照无差异；97 个函数体在恢复两个无效代码清理后与原实现哈希一致，共享模块字节未变。715 项原生重建与 46 项隔离/缓存/归属/策略测试通过，无跳过；类型、完整 Lint、774 文件运行包与 6 项探针通过。证据 `.codex-tmp/visual-native-delivery-evidence.json`。原生图形编排仍依赖旧关系图重建器及组件策略模块，未将它们反向引入核心包；入口切换、完整严格类型和远程/独立 PDF 验收仍待完成。

Terra / medium 仅补无旧 Skill 目录的真实矩形、箭头、圆环分段及节点连接归属隔离测试；主代理负责完整依赖分析、拆分、前后行为对照及门禁。没有重复运行完整 CI 或相同开发样例的 Office 验收。


## 2026-09-06：组件策略与资产关联核心化

组件策略选择、策略回填与本地资产关联的 56 个函数已由核心包维护，旧路径仅兼容转发。唯一算法表达调整是等价的控制字符清理，新增全部 65,536 个 UTF-16 单元及中文/补充字符回归；还原该函数后整个模块与原实现一致。715 项原生重建和 44 项策略/隔离/缓存测试通过，无跳过；类型、完整 Lint、775 文件运行包与 6 项探针通过。证据 `.codex-tmp/component-strategy-delivery-evidence.json`。仍保留内部 JS 契约，关系图重建器与整个生产入口依赖尚未完成收尾。

本轮由主代理完成；模块无外部依赖，未新增子代理。隔离消费者实际验证策略与资产回填、延迟原生重建决策及输入不变，新增字符清理测试进入已有统一测试文件。未重复完整 CI 或开发样例 Office 验收。


## 2026-09-06：关系图与完整图形原子编排

关系图按分派、布局与完整性判断、原生形状、共享几何拆分，像素曲线识别模块原样进入核心；图形原子的完整编排也已进入核心包。127 个函数体逐字匹配原实现，像素模块字节未变；446 次输出/输入变更对照无差异（包含嵌套调用，不等于独立样本数）。715 项原生重建、38 项关系图、35 项像素/隔离/缓存测试通过，无跳过；类型、完整 Lint、781 文件运行包与 6 项探针通过。无旧 Skill 目录的消费者实际生成 4 节点及 4 连接，并验证不完整图保留整图语义。移除已不需要的关系图超长文件例外，预算例外由 13 降至 12。证据 `.codex-tmp/relationship-delivery-evidence.json`。

Terra / medium 仅补实际关系图及完整图形原子编排的隔离用例；主代理负责按职责分析依赖、拆分、对照、预算收紧和门禁。初始新增夹具误触发 branch-card-flow，按历史 unsafe generic graph 用例纠正；生产算法未为测试改写。类型覆盖仍是已有范围，未宣称新迁入算法全部严格类型化。


## 2026-09-06：关系图拆分后的实际 Worker 复验

关系图与完整图形原子编排拆分后，实际本地归档 Worker 再次通过 17 项交付检查，产出 6 个文件；运行前后 1,210 个工程输入的文件集合及指纹一致。与前一版相同开发样例比较，全部非耗时质量指标一致，预览 HTML 内嵌的 9 张 PNG 资产字节一致，源图未变。单次耗时 32.649 秒，仅记录本次观测，不作为性能提升结论。证据 `.codex-tmp/relationship-worker-delivery-evidence.json`，产物目录 `.codex-tmp/text-refinement-production-Wxklm1/artifacts`。仍使用保留 OCR 与内存对象存储，未新增独立 PDF、在线 OCR、远程或 Office 编辑验收，也未逐字节比较整页渲染图。


## 2026-09-06：结构化插画卡片专用图形职责

结构化插画卡片的原生化判断、专用图形和元数据共 16 个函数已进入核心包，复用此前抽离的公共图形原子模块。仅将未使用的局部绑定改为保留相同求值行为的 void 表达式；还原后 16 个函数体哈希一致。18 个有效场景、36 次输出/输入变更对照无差异；715 项原生重建及 25 项隔离/缓存测试通过，无跳过；类型、完整 Lint、782 文件运行包和 6 项探针通过。隔离调用验证实际连接形状、卡片归属、去重及已存在对象抑制，输入未变。证据 `.codex-tmp/structured-card-delivery-evidence.json`。

前批共享形状已核心化，使本次闭包收敛至 16 个专用函数；本轮由主代理直接完成，未增加子代理。保留卡片属性读取和异常传播，不借 Lint 清理改变原有访问顺序。没有重复全量 CI、实际 Worker 或 Office 样例验收。


## 2026-09-06：比较矩阵及关联案例图重建职责

比较矩阵及关联卡片流程/中心辐射图的 54 个函数已按文字处理、矩阵布局、结构化案例图和入口编排拆入核心包，函数体逐字一致。40 次调用、80 项输出/输入变更对照和 6 次相关图片文件哈希比较无差异；715 项原生重建与 25 项隔离/缓存测试通过，无跳过；类型、完整 Lint、786 文件运行包及 6 项探针通过。无旧 Skill 目录的测试验证实际矩阵线、状态标记、标准化文字和图像元数据，并确保非矩阵页面不误重建。证据 `.codex-tmp/comparison-matrix-delivery-evidence.json`。

Terra / medium 仅补隔离矩阵实例及不适用页面用例；主代理负责依赖分析、拆分、前后行为/文件哈希对照及门禁。OCR 原生文字分支需要有效源像素，隔离用例按原契约提供合成光栅；未为测试调整生产策略。未重复实际 Worker、Office 或全量 CI 验收。


## 2026-09-06：图形与矩阵五批增量合并完整 CI

最近一次完整 `npm run verify:ci` 退出码为 0，12 项必需阶段均实际执行通过，覆盖图形原子基础模块、组件策略、关系图与完整图形编排、结构化卡片和比较矩阵五批改动。启动前记录的 1,215 个工程输入在结束时文件集合及哈希一致；运行包含 786 个文件，6 项能力探针通过，保留 1 项既有 Windows 符号链接测试跳过。证据 `.codex-tmp/matrix-consolidated-ci-evidence.json`；指纹范围包含所选源码、配置、Python 和锁文件，不代表整个仓库或所有外部依赖。

本轮未修改生产逻辑。单元分片共 315.200 秒、契约分片 56.652 秒、集成分片 35.759 秒；它们是本次工程验证耗时，不是 PPT 转换性能指标。B/C 尚未完成，远程 D/E/F 与用户 PDF 验收仍保留。
