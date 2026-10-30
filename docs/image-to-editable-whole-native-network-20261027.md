# 完整原生关系线网：当前验证与交付边界

最新 2026-10-28 更新见[正式语义模式生命周期修复](image-to-editable-semantic-lifecycle-20261028.md)：今天的新识别计划回放中，语义图片选择与最终组件审计通过，11 条关系均为单条双端绑定原生连接器，当前区域程序账本 14/14 物化。历史严格差异保留；PowerPoint 编辑和整页最终验收仍未完成。下文保留 2026-10-27 历史证据。

本记录更新于 2026-10-27（工作区本地时间）。用户已明确接受关系正确、完整原生、可编辑优先，允许圆角、渐变与路径外观存在适度差异。原严格检查继续保留。

## 当前结论

### UNO 路径恢复：真实静态 PDF 的独立核验

2026-10-27 后续诊断在 LibreOffice 原生 `ConnectorShape` 上写入从源 XML 解码的 `PolyPolygonBezier`，没有将连接器替换为普通形状。四个独立旋转/翻转样例实际 PDF 保留五段路径。真实图直接保留绑定的实验仍失败，故本次真实成功范围仅为现有静态渲染暂存副本：临时移除 24 个端点引用，交付源文件保持全部绑定与原哈希。

对实际导出 PDF 的[独立路径核验](../.codex-temp/connector-uno-routing-20261027-v1/real-pdf-path-verification-v2.json)确认 **12/12 条路径**（11 条业务关系及 1 条保留物理短臂）、**11/11 个箭头**的尖端、方向与数量；两条虚线按实际描边区间检查起点、顺序、共线性、最大间隙及与箭头的接触。两组实际描边的区间并图与源 XML 对应，上层 1 个连通分量、0 环，下层 1 个连通分量、1 环。点位容差从 UNO 的 1/100 mm 与 PDF 的 .001pt 量化推导，没有放宽产品门槛。该诊断还验证各条有序路径，不能只凭相同环数推断图完全相同。

原比较器将每条虚线要求为单条 PDF 描边，因此报告 10/12。新核验识别 PDF 将虚线展开成多段描边，未改写旧失败文件。LibreOffice 仍简化自定义虚线的节奏，报告明确 `customDashPatternVerified:false`，不能宣称描边样式严格还原。[9 项诊断破坏测试](../.codex-temp/connector-uno-routing-20261027-v1/mutation-verification-v2.log)通过，覆盖缺失虚线段、反向虚线、箭头数量不足、反向箭头、错误折点、缺失闭环短臂、环数变化及错误线宽。这些测试用于验证诊断器，尚未作为生产修复或统一 CI 的替代证据。

已查看[实际整页预览](../.codex-temp/connector-uno-routing-20261027-v1/real-static-native-track-restored-page.png)，并按此前相同 1086×1448 尺寸与配置重算[像素指标](../.codex-temp/connector-uno-routing-20261027-v1/real-pixel-metrics-v2.json)：PDR **7.1231164087%**、前景缺失 **3.0003287489%**、MAD **9.2832873246**，原 8% / 12% / 12 数值阈值通过。这些是静态诊断数值，非整页验收通过。

原导出任务取得真实终态 **exit 1**：PDF 与路径记录已经产生，随后 `doc.close(True)` 报 `DisposedException`。本次 PDF 的独立核验及诊断测试均退出 0，但不将原导出失败改写为成功，也不忽略后续清理问题。没有发现仍带该独立 profile 的 LibreOffice 进程。方案尚未接入生产渲染器；需要处理明确的 UNO 依赖、输入边界、跨平台运行、超时/取消与资源清理，并进入正常发行及 CI 后才能交付。当前 Docker 镜像尚无 `python3-uno`。PowerPoint 移动、缩放及保存重开仍未验证，共享 Worker 未部署。

### 疑似安全软件隔离的核查边界

用户报告此前测试文件消失可能由卡巴斯基删除。本轮确认 `test/rendered-page-snapshot-cache.test.js` 仍在，含此前已验证的修复，未用 HEAD 再次覆盖。卡巴斯基隔离目录存在近期 `.klq` 条目，但读取记录内容返回拒绝访问；当前只能证实有隔离记录，不能将其与该测试文件建立对应，也不能将 Node 路径差异、`ENOTEMPTY` 或 LibreOffice 导入问题一并归因于安全软件。没有操作隔离恢复、关闭防护或修改排除项；迁移形成的 Git 删除项不做批量恢复。

### 原生连接器导入的独立对照与诊断修复

本轮在真实样例以外构造了四个五段折线，覆盖旋转及翻转，使用纯色描边并按首末段切线设置正确端口。经新建 LibreOffice 26.2.4.2 配置目录直接渲染保留绑定的原文件，以及正常静态渲染流程的去绑定副本，四个案例均显示为三段，双向路径偏差约 **30pt**。见 [直接渲染路径对比](../.codex-temp/connector-preset-import-20261027-v1/direct-path-comparison.json)。该结果排除了本次问题仅由渐变、实际样例复杂度或去绑定兼容步骤引起的解释；它不证明 PowerPoint 存在同样的问题。

随后将 v11 原绑定文件直接送入同版 LibreOffice，绕过所有静态兼容处理。[实际 PDF 路径](../.codex-temp/connector-preset-import-20261027-v1/real-sample-direct-paths.json)同样只包含四顶点的下层主路径，未恢复预期的六顶点路线，且较静态副本又有端点和折点差异。故仅取消暂存步骤不能作为当前真实图的修复。原 PPTX 未修改，也未用普通形状替代完整原生连接器。

另一个仅用于诊断的普通形状对照保留相同预设和调整值，四个案例均保留五段，偏差约 0.05–0.074pt，见 [对照结果](../.codex-temp/connector-preset-import-20261027-v1/path-comparison.json)。没有将该普通形状替换方案写入交付 PPTX 或生产渲染器。相同版本 LibreOffice 的官方源文件已留存用于定位：`ConnectorHelper::applyBentHandleAdjustments` 仅在 OOXML 调整柄数量与内部路径柄数量相等时应用调整。这与五段预设变为三段的现象一致，但尚未通过运行期插桩确认其为唯一根因。

修复了渲染报告的证据边界：新增 [原生连线诊断](../packages/slideclone-core/libreoffice-connector-evidence.js)，在实际正常渲染入口返回 `nativeConnectorRoutingEvidence`，分别报告原生对象及五段预设数量，明确 `renderedPathsVerified:false` 与 `officeEditingVerified:false`。仅有对象、端点或全页像素通过，不能将这两个结论写成通过。此修改不改变线条几何、交付文件、已有像素授权或质量阈值。

当前源码对已有 v11 的[暂存复核](../.codex-temp/connector-preset-import-20261027-v1/current-sample-evidence.json)识别 22 个全部原生线对象，其中两个五段预设；11 条业务关系是其中的子集，不将 22 误报为业务关系数。源文件哈希及全部 24 个端点引用保持。此为旧产物的当前暂存检查，不是新一次完整生产回放。

新增诊断、实际 writer、独立安装消费及原渲染兼容回归 [42/42 通过](../.codex-temp/connector-preset-import-20261027-v1/evidence-regression-v1.log)，类型检查及完整 Lint 通过；新测试已加入统一集成入口，模块已列入发行文件清单。Office 文档连接通道本轮再次查询仍为空，没有新的真实移动、缩放及保存重开证据。

### 恢复测试及当前集成失败定位

**当前终态（路径修复后）**：[完整集成 v10](../.codex-temp/connector-preset-import-20261027-v1/integration-portable-v10-exit.json)退出 0，98 个测试文件的三个分片全部通过，外部进程分片 **773/773**、跳过 0；恢复的快照测试及其全部 31 项断言已实际执行，没有从测试清单移除或绕过。当前[完整 Lint](../.codex-temp/connector-preset-import-20261027-v1/lint-current-v10-exit.json)与[两套类型检查](../.codex-temp/connector-preset-import-20261027-v1/typecheck-current-v10-exit.json)均退出 0。修改没有重新生成或替换 v11，正式 PPTX 和 v11 的哈希均保持。

本轮[完整契约运行](../.codex-temp/connector-preset-import-20261027-v1/contract-final-v6-exit.json)仍退出 1：唯一失败文件为 `openxml-gradient-angle-contract.test.js`，其 writer 子进程启动后保持单线程等待、CPU 时间为零，随后由本轮终止。该文件[独立补验](../.codex-temp/connector-preset-import-20261027-v1/gradient-contract-recheck-v10-exit.json)退出 0；原中断记录保留，不将补验改写成一次完整契约或统一 CI 成功。首次 Lint 同样发生语法检查子进程停滞，已保留中断记录；上方当前 Lint 是后续完整成功运行。此前 914 个单元文件通过的结果早于本轮入口路径修复，本轮没有重新执行全部单元或完整 `verify:ci`。本次恢复文件与完整集成验证已完成，整体原生连线目标仍未完成 Office 编辑及实际路线验收。

2026-10-27 后续验证已将快照异常缩小到 Node v22.22.3 的测试入口路径：同一文件以 Windows 反斜杠路径启动时，TAP 仅输出头部并退出 5；移除并发参数或改用 spec 报告仍退出 5。同参数改为正斜杠路径后 **31/31 通过**，见 [反斜杠复现](../.codex-temp/connector-preset-import-20261027-v1/snapshot-exact-runner-v6.log)、[正斜杠对照](../.codex-temp/connector-preset-import-20261027-v1/snapshot-forward-path-v7.log)及[修复入口消费](../.codex-temp/connector-preset-import-20261027-v1/snapshot-through-fixed-runner-v10.log)。这是当前环境可重复的入口差异；尚未确定 Node 内部或其他运行时组件的唯一触发机制。

`scripts/test-sharded.js` 现仅在启动 Node 子进程的边界将路径分隔符统一为 `/`，原生路径清单及资源调度规则保持。先前增加的逐文件父进程隔离并未消除问题，已撤回，保留原批量 runner；相关失败日志不删除。新增真实子进程回归验证 Windows 路径执行、测试实际运行、空/非法清单拒绝及失败后继续执行。与 OCR/临时目录回归合计 [33/33 通过](../.codex-temp/connector-preset-import-20261027-v1/portable-runner-regression-v10.log)。

[隔离父进程集成 v5](../.codex-temp/connector-preset-import-20261027-v1/integration-isolated-parent-v5.log)退出 1，除快照测试未输出断言外，明确失败为 OCR 检查点测试清理根目录的 `ENOTEMPTY`。该 fixture 已接入现有归属校验与有限文件系统重试 helper，新增回归实际注入一次 `rmdirSync` 的 `ENOTEMPTY` 并验证重试后目录消失；清理工具的永久失败及越界拒绝回归保留。[18 项清理回归](../.codex-temp/connector-preset-import-20261027-v1/ocr-cleanup-regression-v1.log)全部通过。修正清理但尚未加载路径修复的 [v6 集成](../.codex-temp/connector-preset-import-20261027-v1/integration-final-v6-exit.json)仍退出 1，不能计为全量通过。最新路径修复后的完整集成与契约终态应另行记录，不覆盖这些失败。

用户明确授权恢复 `test/rendered-page-snapshot-cache.test.js` 后，已从 HEAD 恢复，并单独取得 31/31、测试清单及恢复回归 83/83 通过。一次集成后该文件再次消失，恢复后按原先选取的九个文件追踪重跑 319/319 通过，没有复现删除或捕获删除调用。后续文件存在且最初与 HEAD 一致的集成仍失败，因此不能把所有失败都解释为误删。

[详细集成日志](../.codex-temp/connector-preset-import-20261027-v1/integration-tap-v3.log)取得终态，98 个集成文件的第三分片仍失败：生产预检测试的临时目录清理为 `ENOTEMPTY`；快照缓存测试子进程为 **exit code 5**，未输出普通断言错误。不是该文件内部的 31 项断言均已执行失败，也不能据此直接归因于某款安全软件。失败日志继续保留。

已将生产预检测试接入现有有归属校验、有限文件系统重试的临时目录 helper。另修复快照缓存测试中一个可直接复现的问题：故障注入原先会破坏所有数字文件描述符，现仅拦截该次回放自己打开的 PNG 描述符，并断言无关描述符写入保持。只在内存中恢复旧注入逻辑的[反事实回归](../.codex-temp/connector-preset-import-20261027-v1/unscoped-fault-counterfactual.log)按预期失败于无关文件写入；当前[54 项回归](../.codex-temp/connector-preset-import-20261027-v1/scoped-fault-regression-v5.log)全部通过。此证明确实修复了过宽注入，尚不能单独证明它解释 exit code 5。未提高测试期限、跳过测试或改写生产门槛。

### 新核实的实际渲染差异与 CI 终态

2026-10-27 01:17 PDT 的 [v4 统一 CI 终态](../.codex-temp/whole-native-closeout-20261027-v4/verify-ci-exit.json)退出 1：914 个单元测试文件及 41 个契约测试文件的全部执行分片通过；集成阶段失败，后续 Python 锁及安装消费阶段未由本次命令执行。失败包括共享线网消费检查和缺失的 `test/rendered-page-snapshot-cache.test.js`。用户随后明确说明并非有意删除，已仅恢复该文件，未从测试清单移除。

实际 v11 PDF 路径检查比 XML 解码提供了新的反证：[下层线网路径](../.codex-temp/whole-native-closeout-20261027-v3/rendered-lower-network-paths.json)显示 `relation-n206` 的预期六个顶点在显示中成为四个顶点，局部回路折点消失。保留短臂位于图像约 `(579..596,748)`，它是 `source-network-arm` 原生物理分支，并非可直接擦除的栅格残影。故 XML 推导的环数 0、1 不能作为实际渲染闭环保持的结论；此前的 `fullActualTopologyVerified:false` 继续有效。

[静态渲染准备复核](../.codex-temp/whole-native-closeout-20261027-v4/render-staging-geometry.json)确认现有流程已在临时副本移除全部 24 个端点引用，同时保留所有连接器几何；交付源文件没有修改。因此再次去掉绑定不是独立的对照实验，当前证据不能把差异归因于端点绑定触发的自动路由。标准预设的导入与显示解释尚需定位，PowerPoint 交互仍未验证。全页像素指标通过并未覆盖这一局部结构差异。

共享消费测试另暴露一个支持范围：合成方形回路右侧指定路径包含七段正交线段，超出标准五段预设的表达能力。最终选择会拒绝整个网络并保留中间源路径，不能将其当成原生连接器成功。已为最终选择报告补充独立的 `requestedMode` 和 `routeRepresentations`，使零替换的失败事务也按最终请求模式报告未满足关系；不改写被批准的中间页面对象身份。消费测试继续执行全部场景和错误路径，并明确断言该七段回路被拒绝、两条关系未满足、默认严格语义检查失败；没有把自由路径当成完整连接器成功。

恢复测试及报告修复后的 [定向回归](../.codex-temp/whole-native-closeout-20261027-v4/final-selection-regression-v2.log) **50/50 通过，跳过 0**，覆盖恢复的快照缓存测试、最终选择和实际 Worker 工厂消费；[Lint](../.codex-temp/whole-native-closeout-20261027-v4/lint-v2.log)及[两套类型检查](../.codex-temp/whole-native-closeout-20261027-v4/typecheck-v2.log)通过。v4 全量失败记录保留，不以定向结果改写为全量通过。

随后独立执行原统一入口末尾的 [Python 锁验证](../.codex-temp/whole-native-closeout-20261027-v4/python-lock-v2.log)及[实际安装消费验证](../.codex-temp/whole-native-closeout-20261027-v4/runtime-package-v2.log)，均退出 0；后者实际打包 2,020 个文件、安装并验证 20 个工作区包及六项能力，包含修复后的共享线网消费探针。没有重新完整执行 v4 的集成阶段，不能将这组补验称为一次全量 CI 成功。报告字段修复后未重新生成 v11；该产物及其输入绑定仍对应先前源码快照，不能宣称它已绑定本轮新增报告字段。

### 2026-10-27：语义策略已进入正常构建事务

[v11 回放](../.codex-temp/native-network-production-20261027-v11/replay-result.json)使用正常 `createRawImageNativeRebuilder` 入口、冻结 OCR 和已确认关系计划，在可信工厂选项中显式选择 `outputPolicy: 'semantic-native'`。本次包含最后一处与 writer 对齐的默认 1pt 描边宽度修复，并重新绑定当前源码。选择在源清单及文字恢复的最终私有封存之前执行，运行期原生组件门禁与语义门禁均通过。原保真输入的 `large-raster-lineage` 失败独立保存在 [输出选择报告](../.codex-temp/native-network-production-20261027-v11/semantic-output-selection.json)，没有改写旧结果。

该策略省略 11 个不属于源清单成员、分组或连接端点的已擦除非受保护重建残余图片，保留 19 个受保护图标及全部原生形状和文字。未知、受保护或未完成擦除的图片不能成为省略目标；若保留后语义检查仍失败，则拒绝发布该语义候选。它不改变任何源像素，不重做旧 803 像素补丁，也不扩大原背景授权。

[实际 PPTX 核验](../.codex-temp/native-network-production-20261027-v11/actual-pptx-verification.json)确认 11 条完整原生关系的双端对象、箭头、7 条共享路径及保留物理分支，两个网络的有界采样环数为 0、1；19 个图标字节与文字保持。LibreOffice 渲染的 PDR 为 **7.3940177854%**、前景缺失 **3.5083712143%**、MAD **9.5717570689**，原门槛未修改。图上仍可见少量孤立向量细线，不能把上述检查解释为整页无残影或 PowerPoint 交互通过。v11 的正常回放、渲染与 XML 核验退出码均为 0，见同目录三份 `*-exit.json`；未调用识别模型，不能当作任意新截图的识别成功率。

实现位于 [native-output-selection.js](../packages/slideclone-core/quality/native-output-selection.js)，Core composition root 只选择最终图片数组并继续原有封存、审计流程；[服务端工厂](../packages/remote-mcp-server/image-native-rebuilder.js)支持可信显式选项，外部任务 metadata 不授予此能力。默认保真策略和共享 Worker 配置未变，未进行共享部署。

先前全量单元运行 [v2/unit-exit.json](../.codex-temp/whole-native-closeout-20261027-v2/unit-exit.json)退出 1。定位到两处旧测试发现断言、四处 Windows 临时目录清理 `ENOTEMPTY`，以及一处箭头绘制范围造成的多面节点分组保留回归。已分别修正当前测试清单、使用有归属检查且仅重试临时文件系统错误的测试清理 helper，以及按末端切线限定箭头范围并匹配默认描边；未更改测试/子进程期限或生产门槛。定向策略及 Worker 回归 32/32、绘制范围及分组回归 49/49、测试清单回归 28/28 通过。

随后统一 `npm run verify:ci` 的 [v3 终态](../.codex-temp/whole-native-closeout-20261027-v3/verify-ci-exit.json)仍为退出 1：Lint、类型、插件/可观测性/ADR 验证、锁定 .NET 审计与构建通过；914 个单元测试文件所在的五个执行分片中，四个通过，一个失败。唯一列出的失败为 `powerpoint-roundtrip-evidence.test.js` 清理临时根时 `ENOTEMPTY`。已将该测试根的创建和清理接入同一有归属检查、有限文件系统重试 helper，相关 [20 项回归](../.codex-temp/whole-native-closeout-20261027-v3/roundtrip-cleanup-regression-exit.json)通过。新一轮完整检查在 [v4 日志](../.codex-temp/whole-native-closeout-20261027-v4/verify-ci.log)运行，必须取得终态；不把未执行的契约及集成阶段计为通过。

本轮按真实 XML 定位了分组内的全部 11 条连接器，为 v11 另备独立 Office 校验脚本，计划仅在临时副本移动及缩放端点，检查连接身份与几何并保存重开。实际 [Office 结果](../.codex-temp/whole-native-closeout-20261027-v3/office-current-result.json)失败在 `application`，HRESULT `0x80010001`；文件未打开，移动、缩放、保存及重开均未执行，源文件哈希未变。不得以静态 XML 检查替代该失败或宣称交互通过。

### 先前保存的保真基线与失败回放

保存的 v4 真实原图正常重建入口回放中，**11 条业务关系均为单条、双端绑定的标准原生连接器**。两组共享线网整体拟合后才发布；下层保留闭环及未被逻辑关系单独占用的物理分支。该结果尚未完成 PowerPoint 的移动、缩放、保存关闭重开验收，不能宣布整页交付通过。

中间 v7 回放未完成，失败于 `approved-opaque-drawing-binding`，见 [failure.json](../.codex-temp/native-network-production-20261027-v7/failure.json)及 [replay-exit.json](../.codex-temp/native-network-production-20261027-v7/replay-exit.json)。后续核查发现六个形状渐变及暂存路径变化；v8 起未重新绑定这份旧 803 像素补丁，而是省略该失效应用并保留失败。v11 使用上述语义输出策略，未再次采用旧补丁。下表仅保留 v4 历史基线，当前结果以上方 v11 为准。

权威输入与结果位于 [v4 回放](../.codex-temp/native-network-production-20261027-v4/)。这是正常入口使用冻结 OCR、已确认关系计划及可信本地服务的回放；没有重新调用识别模型，也没有部署共享 Worker。

| 检查范围 | 当前证据与结论 |
| --- | --- |
| 原图及回放输入 | 85 项绑定重新核对，缺失 0、变更 0，见 [重核结果](../.codex-temp/whole-native-closeout-20261027-v1/replay-input-recheck.json) |
| 完整对象结构 | [关系报告](../.codex-temp/native-network-production-20261027-v4/whole-relations.json)中 11/11 为 `single-native-connector`，未满足清单为空 |
| 实际 PPTX | [诊断文件](../.codex-temp/native-network-production-20261027-v4/diagnostic.pptx)逐项核对名称、端点引用、箭头、渐变及路径几何；并非只读取 IR 标签 |
| 共享路径 | 实际 XML 解码后匹配两组线网的全部 7 条有序关系及 1 条保留物理分支；标准 Office 预设的整数调整值与 EMU 量化误差保持在推导界限内 |
| 闭环检查 | 两组实际描边采样均为 1 个连通分量，环数分别为 0、1；这是有界采样诊断，不替代完整实际图拓扑等价证明 |
| 静态渲染 | LibreOffice 渲染：PDR **7.9900644058%**，前景缺失 **2.5831213189%**，MAD **8.6736686088**；原 8% / 12% / 12 数值门槛未修改 |
| 内容与资产 | 文字、图像内容及原正式文件保持；没有新增背景像素近似，未采用先前未批准的额外 73 像素 |
| 原生组件门禁 | 当前回放通过；区域编译清单为 12/12、未物化组件为 0。这是编译物化计数，不是 12/12 像素严格重建或整页验收 |
| 严格语义门禁 | 仍失败于 `large-raster-lineage`；跨区关系原清单预期 4 成员、获准输出 1 成员的严格差异也单独保留 |
| PowerPoint 编辑行为 | 未验证。桌面工具启动后返回了 PowerPoint 窗口，但截图失败于 `IGraphicsCaptureItemInterop.CreateForMonitor ... 0x80070057`，恢复后的可访问性状态为空；没有据此执行盲点输入 |

实际文件核验详见 [actual-pptx-verification.json](../.codex-temp/native-network-production-20261027-v4/actual-pptx-verification.json)。其中 `actual-office-preset-xml` 表示检查 Office 预设的 OpenXML，**不是 PowerPoint 应用实际渲染或交互证明**；静态图片来自 LibreOffice。

## 通用实现与回归

通用链路是测量源线网、保留独立源绘制依据，再在输出事务中整体收缩和拟合物理线网、组装完整逻辑路径、重设渐变坐标，最后验证顺序和描边闭环。它不依赖本图节点坐标常量；不支持的网络保留原成员并报告未满足项，不发布部分替换。

主要模块：

- [线网拟合](../packages/slideclone-core/routing/whole-route-network-fit.js)与[路径对应检查](../packages/slideclone-core/routing/whole-route-network-paths.js)。
- [私有测量绑定](../packages/slideclone-core/routing/source-native-network-registry.js)与[最终输出事务](../packages/slideclone-core/routing/source-native-route-finalization.js)。
- [渐变坐标转换](../packages/slideclone-core/routing/source-route-native-gradient.js)。

本轮补充 [真实 writer 契约回归](../test/openxml-whole-relationship-contract.test.js)及 [XML 读取测试辅助模块](../test/helpers/native-connector-xml.cjs)。回归把两个真实网络写入 PPTX，再从 XML 解码后验证 7 条关系、1 条直线分支、全部双端引用、箭头、有序路径及闭环。直线也使用从 XML 重建的标准 frame，避免诊断脚本因原始 IR 未携带 `connectorFrame` 而崩溃。旧诊断失败日志保留，修正版另存为 `verify-native-v2.cjs`。

该文件已明确列入统一 `contract` 测试分类，并由 `test:ci` / `verify:ci` 发现；外部 writer 测试继续按外部进程资源串行调度。相关定向测试、类型检查、完整 Lint、架构预算、锁定 .NET 审计与 Release 构建已执行；全量单元测试另在 [unit.log](../.codex-temp/whole-native-closeout-20261027-v1/unit.log)中持续记录，未结束前不计为通过。

扩大运行另发现 `test-sharded.test.js` 实际启动嵌套 Node 进程，却仍归为普通资源；本轮契约并发运行已出现子进程期限失败。已将它归入外部进程串行队列，新增分类断言通过，原 15 秒期限和其余断言均未修改。原全量运行仍须收取终态，不能用此前独立通过的 17 项调度与 writer 测试覆盖这次失败。

另有可回退的 [语义优先诊断副本](../.codex-temp/whole-native-closeout-20261027-v1/semantic-clean-preview.pptx)：只省略 11 个显式标为非受保护截图残余的图像层，保留全部 shapes、文字和 19 个受保护最小图标。其静态语义检查通过；首次渲染失败保留，随后 [LibreOffice 重试成功](../.codex-temp/whole-native-closeout-20261027-v1/semantic-clean-render-v2-result.json)，原阈值下 PDR 为 7.3895663543%、前景缺失为 3.5104836570%、MAD 为 9.5717042876。细小向量碎片与孤立短线仍须检查；不能把全页数值通过当作无残影证明。该副本未接纳为生产或正式成品。它源于序列化 JSON，没有私有运行期收据；[同序列化基线比较](../.codex-temp/whole-native-closeout-20261027-v1/semantic-clean-audit-comparison.json)确认两者均有四项收据相关失败，不能冒充正常运行期门禁证据，也不能关闭这些检查。

2026-10-26 后续收取的全量单元及契约运行均已结束，退出码均为 1，见 [unit-exit.json](../.codex-temp/whole-native-closeout-20261027-v1/unit-exit.json)及 [contract-exit.json](../.codex-temp/whole-native-closeout-20261027-v1/contract-exit.json)。失败包括隔离包消费者及调度子进程期限、低幅渐变拟合、旧物理成员预期、原生图层收据及 writer 源码结构断言等；具体分类和修复仍须逐项验证，不能笼统认定全是环境问题。此前定向测试通过不覆盖这些失败，当前统一工程验收未通过。

## 验收取舍与剩余工作

关系起终点、方向、标签、分支、闭环及完整原生对象是硬要求；PowerPoint 移动、缩放和保存重开后的连接保持也必须实际验证。圆角、渐变、细微折点和背景纹理独立报告视觉质量。可见旧线残影仍需解决，不能因 PDR 通过而忽略。

2026-10-26 重新核查 Microsoft、Miro、Lucidchart 和 yFiles 官方资料，支持结构与编辑行为优先、外观独立评价的工程取舍；未发现可直接套用的统一像素阈值。[行业对照与语义优先目标](image-to-editable-semantic-first-industry-20261026.md)记录了来源、适用边界及本次用户选择。生产自动策略及历史严格结论均未因此改写。

旧验证副本为 [office-edit-copy.pptx](../.codex-temp/whole-native-closeout-20261027-v1/office-edit-copy.pptx)，早于当前语义输出，不可用它证明 v11 编辑行为。下一步收取 v4 统一工程门禁终态，并在可用的 Office 会话中用 v11 的新副本完成节点移动、缩放和保存重开，重新核查关系与残影。当前文档控制无连接会话，独立 COM 尝试也未打开文件，不据此宣称交互通过。当前目标继续保持 active。

## 2026-10-28 接续状态

上文是早期候选的历史记录；当前状态以[编辑生命周期文档](image-to-editable-semantic-lifecycle-20261028.md)及[最新证据页](../.codex-temp/semantic-final-gates-20261028-v1/review.html)为准。11/11 完整原生业务连接器和双端绑定已通过实际 Office 编辑保存重开；普通拖动保持共享物理闭环仍有明确失败反证。

新增通用显式线网重排模块，不依赖本图对象名。在真实 B 移动、C 放大的副本上显式重排后，实际 PowerPoint 另存、关闭重开通过：11 条业务线绑定、节点位置尺寸、对象清单、渐变定义保持；下层采样为 1 个连通分量、1 个环，业务路径有序对应通过。它尚未接入生产编辑宿主，不能计为普通拖动自动保持闭环已修复。40 项相关几何回归、两套类型、完整 Lint 与最终真实安装消费通过；完整集成仍以快照缓存测试进程 exitCode=5 失败，根因未明。整页残影、新鲜真实 Worker 和最终全量 CI 未完成，目标保持 active。

后续已接通页面原子事务及正式 IR 编辑入口，并由编译器保存便携网络编辑模型。真实 CLI 通过 `networkId` 完成节点 body 编辑和显式重排，再经真实 .NET writer 输出 11 条完整双端绑定原生业务线；下层连续几何采样保持 1 连通分量、1 环。60 项扩大回归、两套类型及新测试 ESLint 通过。有界 fatal 诊断的快照缓存相邻测试 116 项通过，但未复现并解决完整集成 exitCode=5。新生产入口文件的 Office 保存重开因桌面接口有限重试仍超时而未验证；此前几何副本 Office 证据单独保留。生产宿主接线已完成的具体范围、当前工程门禁及剩余边界以[生命周期文档末节](image-to-editable-semantic-lifecycle-20261028.md)和[当前证据页](../.codex-temp/semantic-final-gates-20261028-v1/review.html)为准，普通拖动自动保持闭环仍未通过。
