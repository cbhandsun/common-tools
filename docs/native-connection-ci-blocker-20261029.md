# 通用连线工程验收：历史阻塞与复验

## 2026-10-29 最终工程结果

同一源码的统一集成 v12 已完整结束：**965/965，0 失败、0 跳过，exit 0**。缓存测试真实执行并越过旧失败位置；浏览器实测用例也在本轮统一调度中通过。三个分片为 64、101、800 项。2733 个源码文件前后及收尾实时摘要一致，未改源码、测试内容、清单、分片、门槛或预算。

v12 是用户自行暂停防护后的结果，代理没有更改防护设置。**这只补齐当前环境下的代码工程门禁，不证明开启防护时的拦截已修复，也不证明精确排除规则已生效。**收尾检查四项防护仍为 disabled。历史 v7/v8/v9/v10 失败、v11 浏览器失败及无终态中断不改记通过；单次原 `verify:ci` 仍保留失败结论，相同源码的其他门禁按原证据分阶段覆盖。

证据为 `closeout-integration-v12-terminal.json`、`closeout-integration-v12-supervisor.json`、`closeout-current-source-v1.json`、`closeout-security-state-v1.json`、`closeout-acceptance-v2.json`。本轮按用户确认的通用连线范围收尾，自动识别另列，不继续反复修改该图或要求重复添加例外。

以下是历史诊断与各轮当时状态，当前工程结论以上述终态为准。

## 当前结论

**最新运行状态：**v11 已出现本地 Chrome 实测失败，随后进程消失且无终态文件，不能记录为完整通过或已正常退出；中断原因未知。同一个浏览器用例单独复核 1/1 通过（16,289.7342ms），仅作为未稳定复现的诊断。防护只读复查仍为 disabled。已用隐藏、独立后台监督进程启动原入口 v12，源码、测试清单、分片与门槛不变，日志与退出结果单独落盘；没有启动第二份并行集成。证据 `closeout-integration-v11-interruption.json`、`closeout-integration-v12-detached-start.json`。终态前不计通过。

**最新终态与环境变化：**v10 已退出 1，1,051,379ms，唯一失败仍为缓存测试进程 exit 5；原源码前后摘要一致。新 avp 事件 69088、69089 与失败时刻对应，记录的脚本摘要与原测试一致。未因移除临时诊断预加载而解决完整集成，也未将单独 31/31 改记为统一通过。

用户随后明确告知已暂停保护并要求继续。只读 STATUS 确认 Protection、SW2、File_Monitoring、AMSI 均为 disabled；代理未更改防护配置。现已启动原门槛、原清单、同一源码、无临时预加载的 v11 集成。若通过，只能证明本次防护暂停环境下的工程结果；开启防护下的拦截及精确例外导出差异仍须单独保留，不能宣称已修复。状态证据为 `user-paused-security-state-v1.json`、`closeout-integration-v11-start.json`。

最新复验：用户再次确认规则仍在列表、启用且保存了整个设置。第三次官方配置导出仍未出现目标路径，导出与界面差异尚未解释，不计为精确规则已验证。一次附带临时预加载的短探针 exit 5（26 项开始、25 项完成）；同时出现新的 avp 事件，其 `ProcessSha256` 与原测试摘要不同，不能混用旧 PID 61608 的结论。临时预加载文件随后缺失，原测试仍在。

移除临时预加载，直接运行未修改的 `node --test --test-concurrency=1 --test-reporter=spec test/rendered-page-snapshot-cache.test.js`，**31/31 通过，0 失败、0 跳过**，12,131.4231ms；原测试 SHA256 不变。证据 `snapshot-standard-probe-v1.json`。这不构成永久消除误报或精确规则生效的证明。

随后启动 v10 原 `npm run test:integration`，不加入临时预加载，清单、分片、门槛与源码摘要不变；终态前仍不计通过。启动记录为 `closeout-integration-v10-start.json`。没有扩大排除到 Node、目录或其他文件，也未修改生产代码或测试内容。

通用原生连线与显式整网重排的功能、回归及打包证据已具备；完整工程门禁仍未通过。不能将失败测试排除、改分类、重命名或修改结果来收尾。本项不涉及继续识别原图或追加外观修补。

`npm run verify:ci` v7 与保留原调度的 `npm run test:integration` v8 均在 `rendered-page-snapshot-cache.test.js` 失败。错误为测试进程 `exitCode=5, signal=null`，耗时分别约 5.7 秒、5.9 秒，无内部断言失败与 stderr 诊断。其他集成测试通过。两次均为相同的 2733 文件源码摘要：`fc2436fdcd32fc1499ee3b181a106da33d635e263d29a204aed5038ca37f3909`。

## 已取得的诊断

- 原相邻五文件诊断为 116/116 通过；本次目标文件连续五次为每次 31/31 通过，均未复现退出。单独通过不能覆盖统一集成失败。
- v8 的有界模块记录显示目标文件及其依赖全部加载完成，但随后没有记录到 JavaScript 未捕获异常、正常 exit 或被包装的 `process.reallyExit` 调用。它没有定位到具体失败测试，也不能单凭这些缺失断言是外部终止。
- Windows Application 日志中，2026-10-29 10:49:14 UTC（洛杉矶 03:49:14）的两条 `avp` / 4662 事件，record ID 为 68602、68603；属性同时包含 node.exe 和本测试文件的命令。时间与 v8 失败相符，但事件未提供阻止或终止动作，**关联尚不等于根因证明**。
- 进一步比对已确认：事件中 `ProcessSha256=1AAC220280F4E70AB95D23B7BA87B47A2581591E8B4A6AAE497B7B3F792C4104` 与当前测试脚本逐字节摘要一致；不是 Node 安装程序的摘要。当前 Node v22.22.3 签名为有效的 OpenJS Foundation。不能把这个字段误读为 Node 被替换。

## 本次继续处理：已读到实际检测与历史删除动作

通过产品自带 `avp.com REPORT SW2 /RA:<file>` 导出的报告，已取得指向该脚本的 `PDM:Trojan.Win32.Generic` 检测及历史“对象已删除”记录。这证明此前文件消失确有安全软件处理依据；不能据此自动断言 v7/v8 的每一次 exit 5 都由同一个动作造成。导出命令在无控制台的 Node 子进程中返回 `ReadConsole` 错误（exit 3），但已写出报告；没有将该退出码当作扫描成功。原始报告读取后已删除，仅保留脱敏目标行。

直接在 PowerShell 执行的单文件 `SCAN <test> /i0` 已正常退出 0：1 个对象正常、0 检测、0 错误，明确为 report-only，disinfect/delete 均为 No，文件摘要未变。历史 PDM 与当前静态扫描不一致，仍按待核实误报处理，不作安全保证。官方 PDM 说明：[Heuristic and proactive detections](https://encyclopedia.kaspersky.com/knowledge/heuristic-and-proactive-detections/)。

`avp.com UPDATE` 使用已有官方更新源成功退出 0，病毒库日期仍为 2026-10-26 17:59，不能声称已升级到不同版本或根治。随后保持脚本内容及防护设置不变，两个相邻 renderer 文件与目标测试合计 **50/50 通过、0 跳过**；新增逐项测试及限定临时目录的操作记录完整退出 0。v9 统一集成复核已启动，使用同一源码摘要、原调度、原门槛，不新增排除。终态前不计通过。

### v9 终态与本次删除已对应到同一进程

v9 退出 1，577,760ms；前后仍为同一 2733 文件摘要。缓存测试进程 PID **61608** 约 4.2 秒后 exit 5。该进程的逐项记录停在第 279 行的 `missing/invalid snapshots rerender collection normally while quality-only hits remain available`，最后一个记录为一次 `closeSync` 返回；后面的磁盘写入故障注入测试尚未开始，不能将本次失败归因于那个 helper。

Windows avp 事件 68975、68976 在 17:18:04 UTC 引用相同脚本摘要。新的产品报告明确给出 **10:18:04 检测、10:20:35 删除**（洛杉矶时间），关联进程均为 **61608**，检测名均为 `PDM:Trojan.Win32.Generic`。磁盘与 Git 随后都确认测试文件缺失。这已证明本次文件删除是安全软件处理；它仍不公开内部行为规则或证明具体哪一条文件操作触发了规则。

基于用户之前对该文件“恢复并验证”的明确授权，已从保留的 ZIP 精确恢复 **21694 字节**至相同路径，并校验 SHA256 与删除前一致。没有改名、改内容或重复执行来规避检测。恢复后未再运行该脚本。

删除之后的两次补充扫描退出 0，但实际处理对象数为 0，**不计为有效扫描通过**；文件仍在时保存的 `kaspersky-readonly-file-check-v2.json` 才是处理 1 个对象、正常 1、检测 0 的有效证据。后续验收必须同时检查对象数和文件存在性，不能只看退出码。

当前防护总开关、SW2、File_Monitoring、AMSI 均已核验运行。产品配置已只读导出备份；备份含私有配置，不列入外发复核包。已准备精确文件＋检测名的最小例外提案及约 28KB 的厂商复核包，均未应用或发送。下一步等待用户选择厂商复核或明确批准最小范围例外；如果产品要求扩大到整个 Node 进程或工作区，则不执行提案。

### 用户已授权最小例外；自动应用通道不可用

用户已明确允许：**仅该文件＋检测名的最小例外**。该授权持续有效，不再请求重复批准。

重新只读导出当前配置后，已确认原生规则支持 `object.mask` 精确路径、`verdict_mask` 精确检测名及 `triggers=3` 双条件。准备的配置仅新增一条非递归规则，规则数 2→3；删除新增节点后，整份配置与新鲜备份在 XML 语义上相同。提案审核为 `kaspersky-rule-proposal-audit-v1.json`，配置未外发。

官方 `avp.com IMPORT` 返回 **exit 2**：`Command unavailable due to password protection disabled`。未为此开启或更改密码保护。随后 Computer Use 在打开 `avpui.exe` 时直接拒绝：`product policy blocks this app`。没有使用其他窗口接口绕过该拒绝。产品状态仍报告 Protection、SW2、File_Monitoring、AMSI 运行。

后续两次验证导出未生成目标文件，不能把退出码 0 当作有效导出或宣称例外已生效。当前结论是：**提案准备完成，但自动应用未成功，实际例外状态尚未核验**。测试保持原内容，不启动新的集成测试。

需要用户通过原生界面手动执行已经授权的精确变更：

1. 打开卡巴斯基的“设置 → 威胁和排除项 → 管理排除项 → 添加”。
2. “文件或文件夹”填写 `E:\DEV\WorkSpace\Efficiency\common-tools\test\rendered-page-snapshot-cache.test.js`。
3. “对象/检测名”同时填写 `PDM:Trojan.Win32.Generic`，两个条件必须同时存在。
4. 状态设为启用并保存；仅此精确文件，不使用目录或通配符。

官方说明确认两个字段同时填写时只排除该文件的该种检测：[双条件排除说明](https://support.kaspersky.com/help/kaspersky/win21.7/en-us/227390.htm)。用户完成后，继续只读核验实际规则、源文件及防护状态，再运行原集成入口。

日志只保存有界诊断与脱敏元数据，不保存事件原始内容、环境变量、用户内容或原始 stderr。

## 已通过的工程范围

### 手动保存后的实际配置核验

用户已回复“已添加并保存”。随后两次使用官方只读 EXPORT 取得实际存在的配置文件；第二次读取时间为洛杉矶 2026-10-29 17:28 后。两份均为 16,386,256 字节，第二份 SHA256 为 `b3195056e6e51359939fb3088ed01acd966479be0c3eeb2d4e797a7bbe136c8a`。

实际 `exclusionSettings/fileRules` 仍只有原有 **2 条**，与应用前逐项一致；整份 XML 未找到目标测试文件路径，其他排除设置亦未变化。因此用户已报告保存，但**实际例外尚未核验生效**，不能据此启动新一轮统一集成或宣称安全拦截已解决。测试源码仍为原摘要，Protection、SW2、File_Monitoring、AMSI 均运行。结果见 `kaspersky-exact-rule-effective-audit-v2.json`、`kaspersky-exact-rule-effective-audit-v3.json`；未输出或外发私有配置。

已请用户确认新增规则是否留在列表、启用并保存整个设置页面。这是保存状态差异核实，不是重复请求例外授权；授权范围与后续原门槛集成复验计划不变。本轮没有新启动长测试或单图识别。

v7 已通过 Lint、两套类型、插件、可观测性、ADR、.NET 审计与锁定构建、7756 项 unit（0 失败、1 项既有 Windows 条件跳过）、262 项 contract（0 失败、0 跳过）。本次另外完整补验 Python lock 与 runtime package，均退出 0；打包安装覆盖 20 个包、2061 个文件、6 项能力。

新增通用平移修复已在统一 unit 中实际通过；真实 writer 与 Office 证据边界见 [能力说明](native-connection-capability-scope.md)。自动识别问题按用户决定保留在 [独立清单](image-to-editable-recognition-followups.md)。

## 下一步与停止重复运行的条件

实际报告、单文件只读扫描及官方更新检查已完成，不再要求用户手工查找历史记录。v9 已提供逐项测试、同 PID 检测与删除记录，不再原样重复长测试。用户已授权最小例外，但官方命令行和桌面自动操作通道均未能应用，需要用户手动添加。没有外发源码或宣称厂商已确认误报；普通代码功能与完整工程验收分开报告。

证据根为 `.codex-temp/semantic-final-gates-20261028-v1`：`physical-body-final-ci-v7-terminal.json`、`closeout-integration-v8-terminal.json`、`snapshot-load-probe-v2-result.json`、`snapshot-load-v2-85212.jsonl`、`cache-exit-security-correlation-v1.json`、`closeout-python-lock-v1.log`、`closeout-runtime-package-v1.log`。原失败和诊断记录继续保留。
