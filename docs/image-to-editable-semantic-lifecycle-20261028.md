# 2026-10-28：正式语义模式的连线生命周期修复

> 当前结论以文末的工程收尾记录和实际 Office 编辑记录为准。11/11 业务关系已完成节点编辑、保存关闭重开核验；旧段落中的“Office 未完成”是当时状态。当前仍未通过的是编辑后的物理闭环/无残影及完整工程门禁，不是业务连线退回分段。

用户确认图片识别由本任务完成，不需要用户回忆识别配置；卡巴斯基告警已消失。本轮复用今天保存的 OCR、复核计划和源图，没有重新调用识别模型，没有操作安全软件或共享部署。

## 修复与回归

正常构建先把已测量的四个源绘制部件替换为一条原生连接器，再选择语义输出图片。旧选择器只识别人工批准的替换凭据，且编译器测量凭据直到图片选择之后才提交，因此错误拒绝已完成的单条原生表示。

- `quality/native-output-selection.js` 复用最终组件审计使用的 `auditFinalRouteMaterialization`，同时验证人工批准与编译器测量凭据。
- `team-native-rebuild.js` 在图片选择前提交测量凭据，最终封存后仍执行实际组件审计。没有关闭检查、修改原始源清单或放宽质量阈值。
- `test/source-filled-route-native.test.js` 新增正常构建生命周期回归，初始化真实对象账本；用 960 像素宽画布保留合成笔画，匹配正常 960pt 页面缩放。验证选择和最终审计均通过，原严格四对一差异保留，序列化克隆和端点变更均不能冒用私有凭据。测试文件原已由统一 unit/all 入口发现。

[隔离反事实](../.codex-temp/fresh-network-debug-20261028-v1/semantic-lifecycle-counterfactual-v43.log)使用最终有效夹具、仅在独立进程内恢复旧实现，12 项中恰好新增生命周期回归失败于 `completeInventory / semantic-native-output-unverified`；生产文件未回退。早期 v35–v37 缺账本及 v38–v41 合成缩放不适配的失败记录保留，不用它们冒充最终回归的因果证据。

## 同一新产物的已验证结果

产物：[production-native-candidate.pptx](../.codex-temp/fresh-network-debug-20261028-v1/raw-replay-v43/production-native-candidate.pptx)。这是正常生产重建入口的冻结识别回放，运行 69.408 秒；不是一次新的 live Worker/OCR 验收。

| 范围 | 结果 |
| --- | --- |
| 正式 `semantic-native` 图片选择 | 通过，最终语义审计 passed=true |
| 最终原生组件审计 | passed=true，findings=[] |
| 当前区域程序账本 | 14/14 已物化，pending=0；不能等同历史严格像素区域分母 12/12 |
| 业务关系 | 11/11 单条标准原生连接器，各有完整双端绑定；unmet=[] |
| 四部件关系转换 | 合并 1 条关系、退役 4 个原绘制部件，历史源清单保持 |
| 图标及残余图片 | 保留 19 个受保护图标，省略 11 个明确擦除的非保护残余图像层 |
| 原始严格检查 | sourceInventory.passed=false，保留 region-n0 的 relations/compile-missing 差异；保真输入仍有 large-raster-lineage，不改写为严格成功 |
| 外观变更范围 | 本轮没有改变源像素或连线几何；没有新的全页渲染指标 |
| PowerPoint 编辑 | 未完成；文档会话为空，桌面列举两次超时，重建工具会话后仍超时，未继续盲输入 |

[实际 PPTX 结构报告](../.codex-temp/fresh-network-debug-20261028-v1/raw-replay-v43/native-package-audit.json)来自生成文件中的 OpenXML。独立[语义与几何核验](../.codex-temp/fresh-network-debug-20261028-v1/raw-replay-v43/semantic-lifecycle-verification.json)另外核对运行期审计结果、全部 11 条关系的 IR 与实际 PPTX 几何相对 v33 保持。静态结构通过不证明 PowerPoint 的移动、缩放、保存关闭重开行为。

旧回放包装脚本在 summary/log 中写死 `semanticNativeAccepted:false`，本轮保留这些原文件。上述独立核验从 `deck.meta.nativeOutputSelection` 和运行期质量结果逐项断言，报告真实语义输出通过；不据旧固定字段判定失败，也不将整页验收标为通过。

## 工程验证及剩余边界

- [相关回归](../.codex-temp/fresh-network-debug-20261028-v1/semantic-lifecycle-regression-v43.log)：45/45，通过且跳过 0，覆盖正常语义输出、私有测量凭据、最终选择、批准层生命周期及真实 Worker 工厂消费。
- [两套类型检查](../.codex-temp/fresh-network-debug-20261028-v1/semantic-lifecycle-typecheck-v43.log)：退出 0。
- [完整 Lint](../.codex-temp/fresh-network-debug-20261028-v1/semantic-lifecycle-lint-v43.log)：退出 0，包含语法、架构预算及发行文件边界检查。
- [架构预算](../.codex-temp/fresh-network-debug-20261028-v1/semantic-lifecycle-architecture-v43.log)：2,527 文件通过，原有 7 个只降不升的例外保留。

没有执行本轮完整 `verify:ci`、重新安装消费、共享部署或新的 Office 编辑验收；这些不能用 45 项回归或 OpenXML 检查替代。原文件和历史失败证据保留，没有提交无关工作区修改。下一步从本轮语义产物的副本继续 Office 验证，完整目标仍 active。

## 后续：正常渲染入口与实际 PDF 核验

本次继续验证以上同一个 v43 PPTX，使用当前正常 `render-libreoffice` 入口，没有替换成普通路径或修改交付文件。[渲染报告](../.codex-temp/semantic-final-gates-20261028-v1/render-result.json)确认 22 个原生线对象的路径在临时渲染副本中恢复，两个五段预设得到处理，所有源绑定保持；这 22 个对象含装饰线等，不是 22 条业务关系。9 条渐变描边仍明确报告需 Office 外观核验，不能由静态路径通过推导 Office 渐变严格还原。

从实际生成的 PDF 提取描边和箭头，按源 PPTX 解码的有序路径独立比较，[结果](../.codex-temp/semantic-final-gates-20261028-v1/actual-pdf-path-verification.json)为：12/12 条路径（11 条业务关系和一条保留物理短臂）、11/11 个箭头均通过。两组共享线网的实际有序路径分别匹配，连通分量均为 1、环数分别为 0 和 1；下层闭环在实际显示中保留。容差沿用从 UNO 和 PDF 坐标量化推导的原值。原生对象类型、XML 绑定、静态 PDF 显示及 Office 编辑是分别核验的证据层次。

使用原 1086×1448 尺寸及相同像素配置的[重新比较](../.codex-temp/semantic-final-gates-20261028-v1/pixel-result-v2.json)：PDR **7.1035301120%**、Missing **3.0219812864%**、MAD **9.2615652949**，原阈值通过。已查看真实页面；这不等于完整区域逐像素严格证明，也不证明所有旧线残影为零。第一次比较因诊断脚本未解析相对 `assets/source.png` 而失败，保留 [render.log](../.codex-temp/semantic-final-gates-20261028-v1/render.log)；后续核对源图哈希，使用绝对路径和已生成的同一 PDF/PNG 重算，没有重新渲染。

[9 项诊断破坏测试](../.codex-temp/semantic-final-gates-20261028-v1/pdf-mutation-checks.log)针对本轮 PDF 通过，验证缺失/反向虚线、箭头数量与方向、折点、闭环短臂和线宽错误会被拒绝。它们复用旧诊断器，不代替生产回归或统一 CI。

完整 [verify:ci](../.codex-temp/semantic-final-gates-20261028-v1/verify-ci.log)已取得退出 1：Lint、两套类型、插件、可观测性及 ADR 检查通过，在锁定 .NET 漏洞审计阶段报 NU1900，无法加载 `https://api.nuget.org/v3/index.json`；后续测试和安装阶段没有由该命令执行。独立审计重查以及保持锁文件和全部安全设置、使用 `--no-cache` 刷新 HTTP 的重查同样失败。Node 及独立 .NET HTTP 请求可取得 200，故不能宣称整个网络中断或已确定唯一证书根因。没有关闭 TLS/证书/漏洞检查、忽略失败源或降级错误。

完整单元测试已从原统一 `test:unit` 入口另行启动，日志为 [unit.log](../.codex-temp/semantic-final-gates-20261028-v1/unit.log)；须取得进程终态才能报告结果。当前完整 CI、锁定漏洞审计、后续契约/集成/安装消费和 PowerPoint 编辑仍不能计为通过。统一桌面接口的 `list_windows` 本轮也超时，未执行盲输入。对照页为 [review.html](../.codex-temp/semantic-final-gates-20261028-v1/review.html)。目标保持 active。

## 后续：实际 Office 编辑与测试清理修复

以上运行中状态已被本节的新证据更新，原始日志保留。

Windows 接口恢复后，从 v43 原产物新建 `office-current-candidate-copy.pptx`，起始 SHA256 与原产物相同。实际用 PowerPoint 移动并缩放 B 节点，保存、关闭并重开；随后移动主会话、C、Hook 和协作层编号节点，另对 C 做纵向缩放，再次保存、关闭并重开。五个端节点组覆盖全部 11 条关系。[实际编辑报告](../.codex-temp/semantic-final-gates-20261028-v1/office-current-edit-verification.json)断言：11/11 原连接器的几何均更新，全部原始双端绑定保留，没有对象新增或丢失；保存前与重开后文件哈希相同，未观察到修复提示。原产物未修改。

本次没有把几何变化和端点绑定等同于编辑后整页保真：共享网络保留的独立物理短臂，在 Office 重新布线后可能落单，已在保存重开的页面观察到。因此原静态 PDF 的闭环证明仍有效，但 **编辑后物理闭环、整页无残影及渐变严格外观仍未验收**。C 的一次拖动选中了背景，立即撤销；最终对象变更清单没有残余背景层，误选截图单独标为无效，未计为 C 移动证据。

完整 `test:unit` 取得退出 1：927 个文件的 5 个资源分片中，4 个分片通过，另一个分片仅报告 `source-shared-residual-union.test.js` 的临时目录清理钩子发生 `ENOTEMPTY`。日志总耗时 1,094,934ms。不能报告完整单元测试通过，也不将该清理故障归因为图形业务断言失败。

该测试的清理增加最多 3 次、间隔基数 100ms 的内置重试，调用前验证目标为系统临时目录下本夹具生成的绝对路径；持续失败仍向测试框架抛出。新增回归真实模拟前两次 `rmdir` 的 `ENOTEMPTY`，验证随后清理成功、持续错误传播及越界路径拒绝。统一发现入口保持；[最终相关回归](../.codex-temp/semantic-final-gates-20261028-v1/unit-cleanup-regression-v3.log)14/14，通过且跳过 0。[独立旧行为反事实](../.codex-temp/semantic-final-gates-20261028-v1/cleanup-counterfactual.log)将同一测试进程内的 `maxRetries` 恢复为 0，回归按预期报 `ENOTEMPTY`，没有改回磁盘源码。早期测试夹具误将底层 `rmdir` 次数等同于重试次数的失败也保留，不作为最终回归结果。

契约测试已从原 `test:contract` 入口运行；Python 锁验证和独立 SDK 8 NuGet 请求诊断另行运行。后续须记录它们的终态，再继续集成及真实安装消费。目标保持 active，不部署或提交无关修改。

## 工程收尾接续

用户确认卡巴斯基告警已消失；没有把旧告警作为当前阻塞，也不要求用户回忆图片识别配置。本次核对 v43 原产物 SHA256 仍为 `05310f28d1d03907aa49e4897c59f0c155bd5a9d1aeea9d07d8d735e5ed6dcfb`，没有重做或回退连线。

- [完整契约测试](../.codex-temp/semantic-final-gates-20261028-v1/contract.log)：43 个文件，3 个资源分片全部通过，退出 0，耗时 1,250,806ms。
- [修改测试后的完整 Lint](../.codex-temp/semantic-final-gates-20261028-v1/lint-after-cleanup.log)：退出 0；架构预算 2,527 文件及发行边界检查通过。
- [Python 锁检查](../.codex-temp/semantic-final-gates-20261028-v1/python-lock.log)：退出 0。
- 清理修复后的完整单元测试重新从统一入口运行，日志为 [unit-after-cleanup.log](../.codex-temp/semantic-final-gates-20261028-v1/unit-after-cleanup.log)，与此前退出 1 的运行分别保留。
- 100 个文件的集成测试从统一入口运行，日志为 [integration.log](../.codex-temp/semantic-final-gates-20261028-v1/integration.log)。真实打包、安装和已安装 CLI/Worker 消费检查日志为 [runtime-package.log](../.codex-temp/semantic-final-gates-20261028-v1/runtime-package.log)。运行中不计通过，终态另行记录。

NuGet 诊断项目无第三方包引用，使用本机 SDK 8.0.422 的 NuGet 6.11.2.1 API。首次应用入口成功请求服务索引和两份漏洞数据；随后用同一程序的 `dotnet.exe` 入口失败，进一步成对复查时两个入口均发生 TLS `ConnectionReset`。因此早期入口差异不能认定为进程专属限制或安全软件根因。日志只输出异常类型、错误码和代理是否存在等诊断字段，不输出凭据或原始环境值。

[正式审计重查](../.codex-temp/semantic-final-gates-20261028-v1/dotnet-audit-after-vulnerability-probe.log)、[保持锁定和全部审计规则的强制依赖重新评估](../.codex-temp/semantic-final-gates-20261028-v1/dotnet-audit-force-evaluate.log)均退出 1；[正式锁定构建](../.codex-temp/semantic-final-gates-20261028-v1/dotnet-locked-build.log)也因 NU1900 退出 1。没有关闭 TLS、证书、撤销或漏洞检查，没有更改源、锁文件或错误级别。独立 API 偶发成功不能替代统一安全门禁通过。

物理短臂仍有源图依据，并非缺失业务连线。现有生产表示将它连接到独立的不可见路由控制点；这些控制点不会随整条业务连接器的内部折点自动移动。后续须建立明确的语义输出投影或可跟随共享接点表示，并保留原始物理线网检查；不能通过删掉短臂、改写源清单或重新使用分段业务连线制造通过。本轮未对该问题发布新的算法修复。

[真实安装消费](../.codex-temp/semantic-final-gates-20261028-v1/runtime-package.log)随后取得退出 0：打包 2,042 文件、4,419,003 字节，20 个包及 6 项能力的已安装 CLI、Worker、共享路由与直接依赖闭包检查通过。没有发布到 registry 或更新共享部署。原此前可能被删除的 `test/rendered-page-snapshot-cache.test.js` 当前存在，并由统一测试发现入口收录。

仅在诊断子进程内禁用 IPv6 的复查仍出现相同的 TLS 连接重置，见 [nuget-ipv4-probe.log](../.codex-temp/semantic-final-gates-20261028-v1/nuget-ipv4-probe.log)，没有改变系统网络设置或生产命令。网络根因仍未确定；不继续以相同条件重复恢复请求。[current-status.json](../.codex-temp/semantic-final-gates-20261028-v1/current-status.json)汇总各独立运行的退出证据，并核对原产物和 Office 副本哈希；没有终态的检查明确标记为 `no-terminal-result`。

## 单元与集成最终结果

清理修复后的[完整单元](../.codex-temp/semantic-final-gates-20261028-v1/unit-after-cleanup.log)已结束，退出 0：927 个文件、5 个资源分片全部通过，耗时 1,535,081ms。此前清理失败的原日志仍保留。

[完整集成](../.codex-temp/semantic-final-gates-20261028-v1/integration.log)已结束，退出 1：100 个文件中，7 文件和 11 文件分片通过，82 文件分片失败；总耗时 1,601,555ms。唯一报告为 `test/rendered-page-snapshot-cache.test.js` 文件级失败（10,296.6572ms，`test failed`），没有内部断言或堆栈，不能据此认定为超时、安全软件或缓存业务错误。

同文件[详细单跑](../.codex-temp/semantic-final-gates-20261028-v1/snapshot-cache-integration-focus.log)31/31 通过、跳过 0；三份同时运行的复查 `snapshot-stress-0/1/2.log` 也全部退出 0、signal=null。成功复查未解释原文件级失败，完整集成仍记为失败。此前相邻 OCR 分批复查的 8/8 仅是排查记录，不是原失败归因。

原会话 11662 和 52940 均已有终态，不再轮询或凭过时 pending 记录重启。完整 CI 的 NuGet 安全审计失败仍独立保留，目标保持 active。

## 共享接点兼容性实验：本候选不合入

在独立的三节点、两条完整业务连接器、一条短横线诊断页验证了两个互相独立的变量，成品和生产实现未改动。OpenXML SDK Office2019 格式检查对基线和三个变体都报告零错误，但实际 Office 行为不同：

- `custom-junction-probe.pptx`：两条完整连接器使用自定义几何和内部 connection site，短横线绑定到它们；PowerPoint 报内容有问题并要求修复，已取消。
- `custom-geometry-only.pptx`：移除短横线对内部端口的引用，仍保留自定义连接器几何；同样触发修复提示，已取消。因此不能仅归因于连接器间的绑定。
- `preset-connector-target.pptx`：保留标准预设几何，短横线引用两个完整连接器的 idx=0；能正常打开。移动绿色节点后，其完整连接器更新，短横线保持原位置，端点未跟随内部竖段；已保存关闭，后续结构报告检查实际保存结果。这个控制不足以支持任意内部端口，也不能作为共享接点跟随的成功证据。

诊断生成器、独立变量对照和无第三方 PackageReference 的 SDK 格式验证项目均在 `.codex-temp/semantic-final-gates-20261028-v1/`。本候选方向停止，不改变生产端点审计，不将 `p:cxnSp` 的理论 schema 能力当作实际 PowerPoint 支持，更不恢复分段业务连接器。完整业务关系 11/11 的既有编辑证据仍有效；编辑后物理闭环仍未解决。

另从原统一集成入口启动详细 reporter 的全量复查，日志为 `integration-detailed.log`，退出码独立写入 `integration-detailed-exit.txt`。原集成失败日志保留；运行中不计通过。

## NuGet 网络阻塞已解除

只读核对当前监听和 Windows 代理记录后，确认正在运行的 xray 在 `127.0.0.1:10808` 监听，而系统 ProxyEnable=0。经该已存在端口显式访问 NuGet 索引返回 HTTP 200、TLS verify=0；没有猜测端口、修改系统代理或操作安全软件。直连连接重置的具体原因仍未确定。

仅为验证子进程设置 `HTTP_PROXY` 和 `HTTPS_PROXY` 后：

- 原 `npm run audit:dotnet` 退出 0，保留 locked-mode、NuGetAudit=true、NuGetAuditMode=all 及 warnaserror，见 `dotnet-audit-via-observed-proxy.log`。
- 同样规则下增加 `--force-evaluate --no-cache` 的新鲜审计退出 0，见 `dotnet-audit-proxy-fresh.log`。
- 原 `npm run build:dotnet:locked` 退出 0，0 警告、0 错误，见 `dotnet-locked-build-after-proxy.log`。

原 `verify:ci` 退出 1 和此前直连失败日志仍保留。以上独立门禁通过表示网络阻塞已有可验证的解决路径，不改写历史命令为通过，也不预先计入仍在运行的详细集成测试。

[共享接点实际保存结果](../.codex-temp/semantic-final-gates-20261028-v1/junction-follow-probe/office-probe-verification.json)进一步确认：绿色节点和完整业务连接器的实际几何均变化，短横线实际几何不变；其对连接器 idx=0 的两端 XML 引用仍存在。因此“有绑定”不能替代“编辑时跟随”的验收。诊断器按实际坐标、旋转和翻转的等价值比较，不把 Office 新增的显式 false 或命名空间声明误判为几何变化。

## 本轮接续：Office 渐变实证与显式语义投影对照

用户再次确认图片识别由本任务负责、卡巴斯基告警已消失。本轮没有要求用户回忆配置或处理旧告警，没有操作安全软件。原 v43 文件哈希及 11 条完整业务关系保持。

从原产物逐字节复制的 `office-pristine-gradient-copy.pptx` 在 PowerPoint 正常打开，并通过桌面另存为 PDF；源文件及该副本的 SHA256 均仍为 `05310f28d1d03907aa49e4897c59f0c155bd5a9d1aeea9d07d8d735e5ed6dcfb`。已渲染并查看完整实际页面。[实际 PDF 渐变物化报告](../.codex-temp/semantic-final-gates-20261028-v1/office-gradient-materialization-v2.json)将 9 条源渐变连接器逐一匹配到 9 个独立的轴向 RGB 渐变图案：8 条按路径内部采样覆盖核验，另 1 条源自定义虚线按完整图案范围单独识别，没有降低实线采样覆盖要求。这证明 Office 实际导出包含对应渐变，不是逐像素色彩、编辑后物理闭环或整页无残影验收。最初诊断漏识别 `custDash` 的失败报告保留为 `office-gradient-materialization.json`。

按用户此前认可的语义优先取舍，另生成两份**明确标记的诊断对照**：`semantic-relations-only-preview.pptx`、`semantic-relations-only-edited-preview.pptx`。只省略源账本中有身份但没有 `sceneRelationId` 的一条物理短臂，原始闭环版本、全部历史严格结果及所有 11 条业务路径保留。[投影清单](../.codex-temp/semantic-final-gates-20261028-v1/semantic-projection-review.json)证明创建时其他对象 XML 及所有其他包部件逐字节保持；这是包级诊断，不是生产算法、默认输出策略或严格源图验收。

随后在投影后的已编辑副本实际移动 B 节点，保存、关闭、重开，没有观察到修复提示。[重开结构审计](../.codex-temp/semantic-final-gates-20261028-v1/semantic-projection-office-audit-reopened.json)确认 11 条原生业务连接器及双端绑定保持，B 与对应 3 条业务连接器几何更新；仅明确省略的短臂缺失，没有新增对象。Office 更新网络父组边界，但 off=chOff、ext=chExt，映射前后均为恒等，没有额外移动其他成员。重开前后副本 SHA256 保持 `029670d42b648b59465404dfbc4c14ac6a82db6efbcdb128ed12e5ebe7028572`。[实际重开截图](../.codex-temp/semantic-final-gates-20261028-v1/semantic-projection-office-reopened.png)已保存。

这不是“短臂跟随已修复”：投影明确不保留该物理闭环，`strictSourceAcceptance=false`、`wholeProductAcceptance=false`。现阶段仅证明一种语义优先对照，不能把诊断文件当作已接入生产的通用解决方案。要推广仍须在编译/选择生命周期中实现有源身份、显式策略、独立严格报告与回归的通用投影，不能根据对象名称或任意外部 metadata 静默删线。

## 测试失败的安全进程诊断

详细 reporter 的完整集成复查已结束，退出 1：100 个文件、3 个分片，仍仅 `rendered-page-snapshot-cache.test.js` 文件级失败，未给内部断言或堆栈。该次 82 文件分片为 768 项、767 通过、1 失败；单元测试数量不能与文件数量混用。原失败仍未归因。含相邻 PowerPoint 渲染及预览测试的 TAP 复查 38/38 通过，不能替代完整集成。

统一入口新增 `scripts/test-process-reporter.js` 与独立可测模块 `scripts/test-process-diagnostics.js`，并列于原有 dot/spec/tap reporter 输出安全的进程退出诊断。仅输出受限文件基名、整数退出码或白名单信号，不复制错误对象、消息、堆栈、凭据或内容；未知值、getter、proxy、控制字符拒绝，流错误继续抛出。Windows reporter 路径使用 `pathToFileURL`，没有跳过测试、改变超时或修改退出结果。

相关入口回归 20/20、补充边界回归 6/6、两套类型检查和修改脚本 ESLint 均通过；真实 `exit(23)` 子进程在三种 reporter 下仍让门禁退出 1，且输出退出身份。[独立内存反事实](../.codex-temp/semantic-final-gates-20261028-v1/process-diagnostics-counterfactual.json)仅去掉补充 reporter 后，原失败仍保留，但退出身份不再可见，回归按预期不通过，没有回退磁盘源码。

最初诊断 reporter 的 Windows 路径及导出形状错误均保留失败日志；它们不是快照缓存失败的原因。修正后又从原 `test:integration` 入口启动 `integration-process-diagnostics-v2.log`，须取得终态后再报告。完整 Lint 本次尝试在另一既有脚本的语法子进程处报 `renderer process termination was not confirmed`，记为失败，不据定向 ESLint 改写成完整 Lint 通过；需在完整集成结束后单独复查，避免并发资源争用。没有放宽原 60 秒语法检查期限或终止确认规则。完整目标保持 active。

### 本轮终态接续

最终补充边界后的两文件回归合并运行 **22/22** 通过、跳过 0（`process-diagnostics-final-regression.log`）；这个数没有将先前的 20 项及包含重叠用例的 6 项简单相加。当前统一发现为 unit 928 文件、contract 43 文件、integration 100 文件；此前完整单元通过的是增加诊断测试前的 927 文件，不改写为 928 文件全量已通过。

增强诊断后的完整集成 `integration-process-diagnostics-v2.log` 已退出 **1**，耗时 1,268,729ms：7 文件及 11 文件分片通过，82 文件分片 768 项中 767 通过、1 文件级失败。新增诊断明确记录该文件 **exitCode=5、signal=null**。没有足够证据将它认定为断言、超时、V8 崩溃或安全软件导致；不能仅从退出码猜根因。相同统一分片入口仅运行该真实文件也退出 0（`snapshot-unified-focus.log`），所以没有证据认定统一入口必然导致失败。只读检索同期 Application 1000/1001 事件未取得相应 Node 故障记录，也不能据此排除原生或外部终止。原全量失败保留。

完整集成和最终回归结束后，另行单独运行完整 Lint，日志 `process-diagnostics-lint-isolated.log`、退出文件 `process-diagnostics-lint-isolated-exit.txt`；运行中不计通过。下一次不要再启动重复的同条件完整集成，应先用有边界的生命周期观察区分显式退出、异常或外部终止，并保留失败。

[语义投影 Office 生命周期报告](../.codex-temp/semantic-final-gates-20261028-v1/semantic-projection-office-lifecycle.json)绑定创建时和编辑后的不同哈希、B 移动及 3 条相邻连线更新、11 条完整绑定，以及保存关闭重开的实际窗口与截图。它继续明确 `generalProductionProjectionImplemented=false` 和完整验收失败，不将包级试验升级为通用生产修复。

### 隔离 Lint 与有边界的退出观察

`process-diagnostics-lint-isolated.log` 已结束，退出 **0**：1,365 项 JavaScript 语法、2,530 文件架构预算、20 包的 1,356 个边界文件和发行路径检查通过。前一轮并发 Lint 的终止未确认失败仍保留。

按真实 82 文件分片的排序，仅取缓存文件及之前四个相邻文件，使用原并发 1 和 TAP 加原安全诊断 reporter 复查；`snapshot-lifecycle-neighborhood.log` **116/116** 通过、跳过 0、退出 0。这不是完整集成通过。临时 preload 只给目标文件记录独立 fd 上的 pid、ppid、序号、固定生命周期标签、合法整数退出码及白名单异常来源，不记录错误对象、消息、堆栈、环境或内容，也不写 runner IPC。目标文件已记录加载、加载返回、beforeExit=0、exit=0。

`lifecycle-observer-selfcheck.json` 用四个独立受控进程核验自然退出、显式 exit(5)、未捕获异常及直接 reallyExit(5) 的不同标签；这些是诊断器自检，不代替产品回归。现有 `resumed-acceptance-20261028-v1/snapshot-process-trace.cjs` 和两次成功的旧 preload 证据也保留；新观察补充主动退出识别，不能据成功诊断断言历史失败根因。

随后仅启动一轮 `integration-lifecycle-observed.log`，仍通过原 `scripts/test-sharded.js --suite integration`、同一测试发现与资源调度入口，沿用 spec 和安全 reporter，只给目标文件加上述退出观察。没有改变超时、跳过文件或失败退出值；须取得终态及对应生命周期文件后再判断。原 exitCode=5 的完整集成失败继续有效。

图片识别设置已从原接续脚本找回，不要求用户回忆或重新提供；当前轮没有新 OCR/VLM 请求。用户报告安全告警已消失，不以旧告警阻塞，也没有操作安全软件。11/11 业务连线及源 PPTX 均保持，编辑后共享闭环短臂问题尚未修复。

### 完整辅助路径的另一路径试验：闭环仍失败

`whole-auxiliary-probe-v2/` 是新的非生产表示试验：把独立物理短臂沿已有的 B→Worktree 与 C→Worktree 路径延伸，构成直接绑定 B、Worktree 的一条完整原生辅助连接器。创建时只替换原短臂的 XML；其余对象、11 条业务连接器及其他包部件保持，原产物未修改。其路径覆盖源短臂及已存在的业务路径，不添加业务关系身份或授予擦除依据。原生预设整数调整量化容差按真实帧尺寸 / 100000 推导；初版错误要求两条独立量化路径完全重合的断言失败保留于 `whole-auxiliary-create.log`。

实际 PowerPoint 正常打开，无修复提示；移动 B 后保存，随后关闭验证副本。`whole-auxiliary-probe-v2/office-b-moved.json` 解码保存文件的标准预设、坐标、调整值和绑定，并检查全部父组坐标映射恒等：原 n206 及辅助连接器均被 Office 改为 `bentConnector3`，四个实际点逐点完全相同。辅助几何确实跟随，但独立笔画拓扑检查为连通分量 **1→1**、环数 **1→0**。因此 **未通过编辑后闭环保留**，不得采用为生产修复；也不能把这项具体失败外推为一切原生表示都不可行。窗口关闭已由窗口列表确认，实际保存页面证据为 `office-b-saved.png`。

带生命周期观察的完整集成尚未取得终态；其中目标缓存文件 pid 11828 已记录 preload、entry-start、entry-return、beforeExit=0、exit=0。本次正常运行没有解释原退出码 5，不能把观测器存在与测试成功的相关性当成修复根因。

### 有边界观察的集成终态与两处测试清理修复

上段运行现已取得实际终态 **exit 1**，日志 `integration-lifecycle-observed.log`：100 文件、5 分片，前四分片通过，82 文件分片 798 项中 796 通过、2 失败，跳过 0。目标缓存文件正常退出 0；失败分别为 `libreoffice-grouped-card-connections.test.js` 的根临时目录和 `worker-budget-runner.test.js` 的嵌套 job 目录清理，均在 after hook 报 `ENOTEMPTY`。不归因于卡巴斯基，也不将这次缓存成功认定为历史 exit 5 的根因已修复。

两处 fixture 现接入已有的 `temporary-directory.cjs`：只清理由 helper 创建并核验归属的临时根，沿用最多 3 次、40ms 间隔的文件系统重试；永久失败继续抛出，Worker 预算、测试时限和产品门禁均未改变。各新增一项实际目录故障注入，覆盖根目录及嵌套目录的两次瞬态 `ENOTEMPTY`，后者同时处理 Node 内部传入的 Buffer 路径。新用例位于原先已进入统一 integration/all 的文件中，原 helper 的永久失败及越界拒绝测试保持。

最终三个文件的回归 **23/23 通过、跳过 0**，日志 `cleanup-consumers-regression-v3.log`。仅在诊断进程内换回旧的无重试删除行为，两项新增回归均以 `ENOTEMPTY` 失败，见 `cleanup-no-retry-counterfactual-v2.log`；生产和测试磁盘源码未回退。初版注入只触发一次，被 Node 自身第一次目录修正吸收，反事实未失败；随后明确注入两次并验证旧行为失败，新行为通过，保留原诊断日志。此次定向 ESLint 及两套类型检查均退出 0。尚未对本次两处 fixture 改动重跑完整集成，不把定向通过改写为全量通过。

用户无需重新回忆图片识别配置或处理已消失的告警。当前原生产候选及 11 条完整原生业务连接器未改动；编辑后共享物理闭环保留仍未解决，本轮清理修复不计作连线算法进度。

### 不同端点完整辅助线：实际编辑后仍不能采用

新的独立诊断将物理短臂延伸为 B→C 的完整原生辅助连接器，不赋予业务关系身份或箭头。极小端点高差的第一候选初始显示大幅绕路；将起点向外偏移 2pt 的第二候选在 Office 移动后丢失起点绑定。两者均保留为失败证据，没有修改生产求解器的边界。

内部偏移候选进一步暴露构建端口排序的差异：新建端口插入中间会改变已有业务线的 idx。最终[追加端口诊断副本](../.codex-temp/semantic-final-gates-20261028-v1/distinct-endpoint-inset-stable-probe-v3/scope.json)保留旧连接点顺序和旧公式，仅追加一个内部端口及其比例公式；只替换辅助线。创建时 11 条业务连接器 XML 及其余包部件逐字保持，原生产产物 SHA256 未变。最初诊断构建的属性匹配错误、公式假设错误和误用 C 组名的断言均已纠正，没有将这些诊断错误归因于产品。

PowerPoint 正常打开，无修复提示。移动 B 后保存，两端绑定和辅助线几何更新；[采样笔画检查](../.codex-temp/semantic-final-gates-20261028-v1/distinct-endpoint-inset-stable-probe-v3/office-b-moved.json)为连通分量 1→1、环数 1→1。随后放大 C 并保存，[检查结果](../.codex-temp/semantic-final-gates-20261028-v1/distinct-endpoint-inset-stable-probe-v3/office-c-scaled.json)为连通分量 1→1、环数 **1→2**。保存后的辅助横段 y≈670.172pt 横跨 x≈464.244..610.872pt，与 Worktree 的 x≈518.895pt 竖段相交，将原闭合区域再分割；绑定正确并不保证独立标准连接器自动重排后维持原物理环数。

随后实际关闭、重新打开同一副本，无修复提示。独立[业务绑定及节点几何审计](../.codex-temp/semantic-final-gates-20261028-v1/distinct-inset-business-after-scaling-verified.json)确认 11/11 业务关系仍各为完整预设连接器，双端身份保持，没有缺失或新增对象；B 组位置及 C 组尺寸确有变化。实际重开页面留存于 `distinct-endpoint-inset-stable-probe-v3/office-reopened.jpg`。这次证明了特定候选可以跟随 B/C 编辑，但严格物理闭环检查仍失败，**不合入生产，也不宣称通用闭环修复完成**。完整验收保持失败；不能通过改为只要求环数大于零制造通过。

### 清理修复后的完整集成终态

[完整集成重跑](../.codex-temp/semantic-final-gates-20261028-v1/integration-after-consumer-cleanup.log)已取得 **exit 1**，耗时 1,020,952ms，100 文件、3 分片：7 文件及 11 文件分片通过，82 文件分片失败。本轮没有再报告之前两处 ENOTEMPTY，失败转为 `common-tools-mcp.test.js` 中 project-audit 工具清单和建单两项断言，均为子进程 status=null（原断言预期 0）。原结果没有输出 error.code 或 signal，不能仅凭耗时认定为超时或安全软件问题。

保持原 5 秒子进程期限的[两项定向复查](../.codex-temp/semantic-final-gates-20261028-v1/mcp-audit-timeout-focus.log) **2/2 通过、跳过 0、exit 0**。定向通过不改写完整集成失败；该记录时尚无运行中的完整集成，后续新增诊断及运行状态见下节。无需用户处理旧告警或重新提供识别参数。

### 类型锁反证与真实编辑回归

仅诊断副本给完整辅助连接器设置 `a:cxnSpLocks noChangeShapeType="1"`，未锁业务节点、改变编辑坐标或修改生产文件。PowerPoint 正常打开；实际移动 B 并保存后，辅助连接器从 `bentConnector5` 改为 `bentConnector3`，采样物理环数 **1→0**，而类型锁属性仍保留在保存 XML 中。具体证据为 [office-b-moved.json](../.codex-temp/semantic-final-gates-20261028-v1/locked-whole-auxiliary-probe/office-b-moved.json) 及同目录 baseline / 实际保存副本。该属性不能作为本候选自动路由的约束；方案否决，未合入生产。这项反证不等于已证明所有 PPTX 表示均不可行。

将两项真实失败的有限几何和绑定提取为回归夹具：C 缩放分环 **1→1→2**；类型锁保留但移动 B 塌环 **1→0**。检查实际 preset、frame、adjustments 解码后的笔画，拒绝用关系数、端点引用、锁属性或“至少还有一个环”代替闭环验证。没有授予源像素擦除权，也不将采样诊断宣称为完整路径等价。现有统一 unit/all 自动发现该测试文件。[最终拓扑回归](../.codex-temp/semantic-final-gates-20261028-v1/office-cycle-lifecycle-regression.log) **10/10 通过、跳过 0**，其[定向 ESLint](../.codex-temp/semantic-final-gates-20261028-v1/office-cycle-lifecycle-eslint.log)退出 0。

### 安全子进程状态诊断接线

`test/helpers/child-process-status.cjs` 为上述两个 MCP 失败断言增加有限状态诊断：只允许整数退出码、白名单信号和错误码及错误是否存在；不输出参数、环境、stdio、错误文本、堆栈或用户内容。通过 own descriptor 读取并拒绝 getter/proxy，正常、空、非法、极端、安全及真实进程超时路径均有回归；原 5 秒期限和业务断言保持。

[两文件最终回归](../.codex-temp/semantic-final-gates-20261028-v1/child-status-final-regression.log) **26/26 通过、跳过 0**；定向 ESLint 和两套 typecheck 均退出 0。这仅补齐错误身份，不表示历史 status=null 根因已修复。

仅启动一次带此诊断的原统一完整集成，工具会话 **44388**，日志 [integration-child-status-diagnostics.log](../.codex-temp/semantic-final-gates-20261028-v1/integration-child-status-diagnostics.log)。本节写入时仍在运行，不能计通过或据此重复启动；终态以同名 exit 文件及 pending-execution.json 为准。

### 后续机制边界

本轮再次核对 [Microsoft PowerPoint 重新路由文档](https://learn.microsoft.com/en-us/office/vba/api/powerpoint.shape.rerouteconnections)：它面向连接器寻找最短路径，允许重新选择附着点。文档没有承诺多个独立连接器共享的物理闭环始终不变；以上实际编辑反证也表明，本任务需要线网级更新机制，单线绑定正确不足以成立。没有把文档缺少承诺推导为格式绝对不可能。

下一项有意义的设计应明确由谁在节点编辑后统一更新共享接点和整条业务路径，例如显式重排服务或编辑宿主的线网求解器；仅保存静态端口和折线参数没有验证这一生命周期。若使用显式重排，它必须明确要求触发重排，不能冒充普通 PowerPoint 独立拖动即保持闭环。暂不安装加载项、写宏或把这一设计当成已交付；继续保留 11 条完整原生业务连接器和原物理闭环。不能靠删短臂、恢复分段线、继续微调端口、放宽环数或只检查 B 移动制造通过。

### 显式线网重排：实际保存重开通过，宿主接线未完成

新增通用几何模块 `packages/slideclone-core/routing/whole-route-network-reflow.js`。输入是原完整物理图、原路径及编辑后真实终端坐标，不依赖这张图的对象名称。它将竖段的 x、横段的 y 作为共享变量，固定编辑后的终端，统一更新关联链，再组装每条完整业务路径及未使用的物理短臂。冲突、额外交叉、超出预设容量返回空结果；预算耗尽继续抛出，不发布部分线网。结果只含几何，调用方须保留实际样式并重设渐变坐标，内部采样颜色不对外返回。

端口夹具取自真实 Office B 移动、C 缩放后的节点连接点，并逐层应用节点祖先组变换；不以各连接器独立量化后的端点充当节点坐标。原 B/C 节点组不是恒等映射，之前的错误诊断及日志保留，没有扩大求解器容差。正常、空、非法、极端、安全、预算、交叉、轨道冲突及名称碰撞均有回归，新文件已进入统一 unit/all、边界类型与真实发行文件清单。

[实际副本](../.codex-temp/semantic-final-gates-20261028-v1/explicit-network-reflow-copy-v3/office-reflow-saved.pptx)保留 B 移动和 C 放大，只替换下层 5 条业务线及原独立短臂的几何。创建时其他对象及包部件逐字保持；11 条业务线仍各是一条完整双端绑定的标准原生连接器。原生产候选 SHA256 仍为 `05310f28d1d03907aa49e4897c59f0c155bd5a9d1aeea9d07d8d735e5ed6dcfb`。

PowerPoint 正常打开候选并另存为新文件，随后实际关闭、重新打开，没有观察到内容修复提示。[保存结构审计](../.codex-temp/semantic-final-gates-20261028-v1/explicit-network-reflow-copy-v3/office-saved-audit.json)确认：11/11 完整业务连接器及双端对象/端口索引保持；全部形状内容、B/C 位置尺寸、对象清单及渐变定义保持；下层 6 条实际预设描边为 **1 个连通分量、1 个环**，每条业务路径的有序对应通过。[生命周期记录](../.codex-temp/semantic-final-gates-20261028-v1/explicit-network-reflow-office-lifecycle.json)绑定不同的创建/Office 保存哈希、实际重开窗口及截图，重开后文件哈希与关闭前一致。

这是**显式重排后保存重开**通过，尚未接入生产编辑宿主、CLI 或 Office 事件。普通 PowerPoint 独立拖动自动保持物理闭环仍未通过；不将此副本计为该要求已修复。`automaticOfficeFollowingVerified=false`、`sourceOwnershipGranted=false`、`sourceFootprintVerified=false`、`fullActualTopologyVerified=false` 和 `wholeProductAcceptance=false` 均保持。下一项需要明确的重排触发及原子应用事务，不能把磁盘诊断脚本当作生产入口。

最终几何源码相关四文件回归 **40/40 通过、跳过 0**；两套 typecheck、定向 ESLint 和完整 Lint 均退出 0。最终真实打包安装会话 **5490 已结束，exit 0**，20 个包、2,043 个发行文件、6 项能力通过。证据分别为 `network-reflow-final-geometry-only-regression.log`、`network-reflow-final-typecheck.log`、`network-reflow-final-eslint.log`、`network-reflow-full-lint.log` 和 `network-reflow-final-runtime-package.log`；前轮打包后有小改动，因此仅以后一次打包作为最终源码证据。

### 带子进程诊断的完整集成已关闭

会话 **44388 已结束，exit 1**，并非仍在运行。100 文件、3 分片，7 文件和 11 文件分片通过，82 文件分片失败；总耗时 1,030,197ms。唯一列出的失败是 `rendered-page-snapshot-cache.test.js`：`exitCode=5`、`signal=null`，无内部断言；本轮未再报告两个 MCP status=null。没有足够证据认定是超时、V8、显式退出或安全软件所致，原失败保留。当前没有运行中的完整集成，不原样再跑同条件 17 分钟测试；后续应补新的有界 fatal/process 证据。整页残影、新鲜真实 Worker、生产编辑宿主和最终全量 CI 仍未完成，goal 保持 active。识别设置已恢复，用户无需重新提供；用户报告卡巴斯基告警已消失。

### 生产 IR 编辑入口与便携模型已接通

此前“尚未接入生产编辑宿主”的结论由本节更新。新增 `native-network-page-reflow.js` 页面事务、`native-network-edit-model.js` 便携输出模型及 `ir-network-reflow.js` IR 适配器。源编译最终化自动保存 `page.source.nativeNetworkEditModels`；后续补丁可通过 `networkId` 请求显式重排，无需用户记忆识别设置，也不需重新手拼原始路径。当前节点 box 和保留的锚点决定端口；整张线网先求解和校验，再原子应用。失败不发布部分页面，整份补丁共享原几何预算。

```json
{"type":"reflow-native-network","pageIndex":0,"networkId":"原页面保存的网络 ID","approximation":"semantic-native"}
```

真实 `common-tools ppt apply-ir-edit` 已通过存储模型方式完成 B body 移动、C body 放大及重排；独立文字标签没有随之移动，不计为整个语义节点组移动。旧源产物缺少模型，本次只在诊断副本补入恢复的原测量模型；新编译器自动输出同格式模型已有回归覆盖。命令行初次失败保留，原因是既有状态记录的能力 manifest 与当前源码不匹配；随后只启用证据目录中的隔离能力配置，没有改用户已有配置或关闭能力门禁。

[命令行结果](../.codex-temp/semantic-final-gates-20261028-v1/production-ir-network-edit-v2/cli-result.json)及[真实 writer 审计](../.codex-temp/semantic-final-gates-20261028-v1/production-ir-network-edit-v2/writer-audit.json)确认：11 条业务关系仍各是一条完整双端绑定的原生连接器，下层 5 条业务线与独立短臂的连续几何采样为 1 连通分量、1 环。新文件为 [edited-native-network.pptx](../.codex-temp/semantic-final-gates-20261028-v1/production-ir-network-edit-v2/edited-native-network.pptx)。原 v43 文件未修改。保留虚线、透明度、箭头、渐变及锚点；连续几何采样不能证明虚线实际绘制拓扑，报告仍为 `actualPaintTopologyVerified=false`。

该新候选尚未完成 Office 生命周期验证。本轮 `list_apps` 两次超时，重建 JS 会话后再次超时，按 computer-use 恢复规则停止桌面输入，没有盲操作，也不重复要求用户处理已消失的安全告警。前节旧几何副本的 Office 另存、关闭重开证据继续有效，但不能挪作这个生产入口新文件的证据。普通 PowerPoint 拖动自动保持闭环、实际绘制拓扑、整页残影、新鲜真实 Worker 和最终全量 CI 均未因此通过。

新增持久化与联合导出回归，覆盖存储模型、最终报告传递、过期 revision、后续失败回滚、拒绝覆盖、导出适配器失败清理，进入原 unit/all 自动发现。首轮测试对既有 revision 错误类型预期不正确，失败日志保留；改为断言既有明确错误消息后，最终扩大回归 **60/60、跳过 0、exit 0**，见 [page-reflow-persistence-final-regression.log](../.codex-temp/semantic-final-gates-20261028-v1/page-reflow-persistence-final-regression.log)。两套类型检查及新测试定向 ESLint 均退出 0。联合导出测试使用适配器夹具，只证明事务和报告；真实 PPTX 写出由上述 writer 审计单独证明。

另以 180 秒上限运行目标快照缓存及前四个相邻文件，启用 fatal report 并排除环境变量与网络数据。[有界诊断](../.codex-temp/semantic-final-gates-20261028-v1/snapshot-fatal-probe-result.json)实际耗时 63,991ms，**116/116、跳过 0、exit 0**，fatal 报告数 0。它没有复现完整集成的 exitCode=5；不能认定根因已解决或将完整集成改记通过。目标保持 active。

本节最终门禁均已收终态：[完整 Lint](../.codex-temp/semantic-final-gates-20261028-v1/page-reflow-complete-lint-v2.log)退出 0，检查 1,369 个 JavaScript 文件、2,538 个架构预算文件及 20 包边界；[最终真实打包安装](../.codex-temp/semantic-final-gates-20261028-v1/page-reflow-final-installed-package.log)退出 0，4,438,424 字节、2,046 个发行文件、20 包、6 项能力，安装后引擎、Worker 消费及生产依赖闭包检查通过。这是新增页面事务、便携模型和 IR 接线之后的安装结果，不沿用前一轮 2,043 文件的结果。原始 PPTX 与新输出的[业务绑定对比](../.codex-temp/semantic-final-gates-20261028-v1/production-ir-network-edit-v2/binding-comparison.json)进一步确认 **11/11 原始端点对象名称及端口索引一致**。范围限定后的审计保留非业务装饰连线，不把无绑定装饰线误作业务线；没有修改输入 PPTX。

[本轮收尾记录](../.codex-temp/semantic-final-gates-20261028-v1/production-network-edit-closeout.json)包含源码指纹、终态门禁、隔离配置范围和未通过事项；[证据页](../.codex-temp/semantic-final-gates-20261028-v1/review.html)将新生产入口与旧几何副本的 Office 证据分开展示。当前没有运行中的本轮工程检查；完整目标保持 active，不提交或部署工作区中的无关修改。

### 新鲜识别终态与仍在运行的集成诊断

上述“当前没有运行中的检查”为上一轮收尾快照。后续隔离 Worker v3 已退出 1：新鲜 OCR 1 次、识别请求 5 次均成功，耗时 253,256ms；返回 `IMAGE_REBUILD_FAILED`，内部拒绝已通过消息摘要与源码核对为 `semantic-native-output-incomplete`。这轮没有取得合格输出，不能将成功调用数计作产品验收，也没有证据将失败归因于安全软件。用户已报告卡巴斯基告警消失，识别参数从既有脚本恢复，无需用户回忆或重新提供。

[安全摘要](../.codex-temp/semantic-final-gates-20261028-v1/fresh-worker-v3-diagnosis.json)区分两个阶段：首次编译为 7/11 关系、16 条聚合未解决记录；随后局部复核为 n206/n207 写入路径选择，两条均未被复核拒绝。**7/11 是复核前统计，最终编译完整关系数尚未保留，不能用它宣称最终退步或升级。** OCR、五份识别回复和失败工作目录均已保存在 `fresh-isolated-worker-v3/`，可用于不新增模型调用的诊断；这些新身份上的旧近似许可未自动迁移。原 11 条原生业务连接器候选保持，未修改线上部署。

统一完整集成的 `integration-stderr-fatal.log` 已在该 Worker 退出后启动，采用原测试发现、期限与资源调度，增加有界 stderr 签名及排除环境和网络数据的 fatal 诊断。2026-10-28 22:54 UTC 核对时仍在运行，未取得终态，不重复启动；后续以 `integration-stderr-fatal-v1/terminal.json` 为准。本节仅记录新鲜识别及运行状态，不将旧定向通过改记为全量通过。

### 本次接续终态：集成通过，生产文件 Office 往返验证完成

[完整集成终态](../.codex-temp/semantic-final-gates-20261028-v1/integration-stderr-fatal-v1/terminal.json)现为 **exit 0，100 文件、5 分片、965/965，通过且跳过 0**，耗时 890,828ms，fatal 报告 0。快照缓存目标进程正常退出 0；本轮未复现历史 exitCode=5，历史根因仍未确认，不能声称观察器已修复它。本次没有提高期限、改变调度、跳过文件或降低原断言。

隔离[保留回复重放](../.codex-temp/semantic-final-gates-20261028-v1/retained-worker-replay-v1/scope.json)复用 OCR 和五份识别回复，新增模型请求 0；只在诊断容器内观察最终输出检查前的候选，再调用原检查并原样抛出拒绝。源码以只读方式挂载，网络关闭，没有修改或绕过生产门禁。原请求的图片及 prompt 摘要未保留，故不能证明与原在线请求逐字等价，更不能把它当作新鲜 Worker 验收。

重放的最终编译为 **10/11 条关系、12/16 个区域完成**。局部复核后的 n206/n207 已不再出现路径歧义；剩余直接缺项为 `object-n132 / icon-source-text`、`object-n107 / object-containment`、`relation-n200 / shaft-window-boundary`，另有四条聚合区域未完成记录。观察清单仍有关系数量义务不一致。此统计属于新识别计划，不与旧计划的 12 区域作直接增量比较；原 11 条原生连线候选也未覆盖。[最终候选诊断](../.codex-temp/semantic-final-gates-20261028-v1/retained-worker-replay-v1/final-candidate-summary.json)及原拒绝均保留。

桌面接口恢复后，已用 PowerPoint 实际打开 `production-ir-network-edit-v2/edited-native-network.pptx` 的独立副本，另存新文件，关闭并核对窗口消失，再通过最近文件列表重新打开，无修复提示。[重开页面](../.codex-temp/semantic-final-gates-20261028-v1/production-ir-office-roundtrip-v1/office-reopened.png)与[有界结构审计](../.codex-temp/semantic-final-gates-20261028-v1/production-ir-office-roundtrip-v1/bounded-office-audit.json)对应本次生产入口文件，而非旧几何诊断副本：**11/11 完整原生业务连接器、两端对象和端口保持、路径点最大误差 0pt、渐变定义保持、对象清单保持**。下层线网采样检查仍为 **1 个连通分量、1 个闭环**。这不包含普通 Office 拖动后的自动跟随，也不是实际渐变笔画的完整拓扑或整页像素验收。

Office 规范化后 487 个非连接器 shape 的 XML 描述发生差异，因此不报告“所有 shape 字节或内容未变”。首个复用的全量 deepEqual 诊断内存异常增长，已只停止该诊断进程；未取得终态结论。后续改为独立文件、768MiB 堆上限、120 秒期限与有限差异摘要，退出 0；没有删除这些差异来伪造全内容一致。[本次接续摘要](../.codex-temp/semantic-final-gates-20261028-v1/continuation-results-20261028-v1.json)记录以上范围、原诊断问题及剩余工作。本轮未修改生产代码或线上部署，完整目标仍 active。

### 后续修复：复用纯几何切片，以完整箭头证据归并接触点

最后一条关系的深层拒绝实际为 `route-geometry-budget`；`shaft-window-boundary` 是先前直线观察器保留的失败，并非最终原因。[分阶段记录](../.codex-temp/semantic-final-gates-20261028-v1/retained-route-profile-v2/route-profile.json)显示端口与细化阶段约用 44 万次检查，后续多个端点候选反复验证同一箭头，耗尽原 400 万几何预算。源码没有扩大预算、端口距离、轮廓误差或源覆盖容差。

通用修复分两层：`source-filled-arrow-slices.js` 在同一工作计数器下复用完全相同的单位像素切片，缓存只保存几何交集且有大小上限，每次仍合并本次自己的像素集合；`source-filled-arrow-profile.js` 仅在完整箭头证书成功后给出尖端至最大展开处的原始像素集合，复合几何将该瞬态证据用于同侧接触点归并。普通接触仍保持原 2px 规则；颈部、另一侧、另一箭头或未认证像素不能借此合并，证据不进入提供商计划或持久化授权。

仅切片缓存的 [Worker 重放](../.codex-temp/semantic-final-gates-20261028-v1/retained-worker-cell-cache-v1/final-candidate-summary.json)仍为 10/11，未解决整条关系；其结果保留，不能报告为最终修复成功。加入尖端证据归并后，未经源码注入的[生产预编译](../.codex-temp/semantic-final-gates-20261028-v1/head-contact-production-preflight-v1/preflight.json)达到 **11/11 关系、7 条共享关系通过且无路由拒绝**。这是编译阶段统计，尚不等于 11 条最终完整原生连接器或整页验收。

[预编译结构摘要](../.codex-temp/semantic-final-gates-20261028-v1/head-contact-preflight-summary.json)中 n200 仍为内部完整源足迹表达：2 个连接器、2 个固定填充路径，`wholeNativeObject: false`。必须继续经过生产 `finalizeNativeRouteRepresentations` 的完整连接器选择和输出门禁；不能把这个中间表示当成用户要求的单条原生连线，也不能复用此前另一个计划的 Office 11/11 结果覆盖它。

相关定向回归 **93/93**、两套类型检查和本次修改的 ESLint 已通过。新增回归进入既有统一单元入口，覆盖同一箭头的五个接触假设、尖端以外与不同侧拒绝、连接分支、反向、空源、耗尽预算、缓存隔离及输出不可污染缓存。去掉缓存的进程内反向验证会复现原几何预算断言失败。旧预算失败样例现在可生成完整几何，相应测试改为验证完整端点、部件数量、像素不变及原预算上限，并保留预先耗尽预算必拒绝的断言；没有跳过失败测试。

切片缓存阶段启动的全量单元测试因随后加入生产归并修复而精确停止，仅停止本轮测试进程树，不算通过。最终源码已重新启动完整 `npm run verify:ci`，日志为 [head-contact-verify-ci.log](../.codex-temp/semantic-final-gates-20261028-v1/head-contact-verify-ci.log)，须取得终态后才能报告全链通过。完整保存回复的 Worker 重放也在重新运行，新增模型请求仍为 0。两个图标/包含关系、观察关系清单差异、整页残影、新鲜 Worker 和本轮输出的 Office 验收仍未完成；既有 Office 候选的结果保持独立。

后续 Worker 重放已终止于 `Scene regional inventory binding is invalid`（错误消息以摘要记录），仅执行到第三份回复，未到最终输出检查。[请求兼容性对照](../.codex-temp/semantic-final-gates-20261028-v1/head-contact-replay-compatibility.json)表明第一份结构请求不变，但第二、第三份局部请求的 prompt 已变化；原回复不能作为新任务的有效识别输入，不能据此判定新编译器退化，也不能移植旧区域编号绕过检查。现已启动 [fresh-isolated-worker-v4](../.codex-temp/semantic-final-gates-20261028-v1/fresh-isolated-worker-v4/input-bindings.json)，重新 OCR 并取得新识别回复；源码只读挂载、容器无网络、凭据仅留在宿主的有界请求通道，未修改线上部署。新任务保存每次请求的图片和 prompt 摘要，后续重放必须核对这些绑定。最终统计及门禁结果待终态读取，尚未报告成功。

保留计划进一步经过实际生产 `compileSourceScene(...deferNativeRoutes:true)` 和 `finalizeNativeRouteRepresentations`，未注入替代实现，已得到[原生输出结构报告](../.codex-temp/semantic-final-gates-20261028-v1/head-contact-native-output-v1/report.json)：`status: applied`、`unmetRelationIds: []`。n200 现在为 **1 个绑定的完整原生连接器、0 固定路径、0 填充片段、0 控制片段**，`wholeNativeObject: true`；其他关系也保持完整原生结构。本报告仍是保留计划下的输出选择阶段证明，没有提交整页物化事务，没有创建已验收 PPTX，也没有替代本轮新鲜 Worker、像素残影及 Office 验收。

### 2026-10-28 接续：两个运行时错误修复，识别清单差异已定位

用户再次明确识别由代理完成、不记得设置，且卡巴斯基告警已经消失。本轮从已有绑定恢复参数，不要求用户回忆或重新处理安全软件。新鲜 v4 的 1 次 OCR、5 次模型调用全部成功，但当时失败于共享残影清理的 `RangeError`；错误摘要与 `Shared residual union proof budget exceeded` 完全一致，没有证据归因于超时或安全软件。

[有界诊断](../.codex-temp/semantic-final-gates-20261028-v1/residual-union-profile-v2/residual-profile.json)精确复现：读取证明已用 3,828,436 次检查，两个组件共 5,294 个原始像素。旧实现为每个像素预扣 32 次排序工作，排序前达到 3,997,854，后续行遍历超过原 4,000,000 上限。现在对集合插入、排序副本、真实比较和行遍历分别计费，比较期间仍可立即中断，不返回部分掩码。原预算、成员完整性、源摘要、背景私有凭证及清理权限均保留。新增近上限完整输出和真实超限拒绝回归，未提高预算或 baseline。首份诊断钩子因重复锚点失败，第二次启动曾遇 Docker 清单超时；这些均不是生产编译结果，失败证据保留。

下一次严格匹配重放越过预算错误，发现 `source-scene-native-program` 合法生成椭圆，但背景清理只接受 `rect/freeform`。新增独立 `residual-ellipse-mask.js`，仅对合法不透明、无旋转、单色原生椭圆投影实际内部的行掩码，并继续匹配原图填充色；外接矩形四角、不同色前景及外部描边不因此获得清理权限。不支持的渐变、透明度、变换、非法输入继续拒绝，未吞异常。新模块进入发行必需文件清单，相关回归进入原 unit/all 自动发现。

最终源码相关[联合回归](../.codex-temp/semantic-final-gates-20261028-v1/residual-combined-regressions.tap) **58/58、失败 0、跳过 0**；发行断言增加后[椭圆最终回归](../.codex-temp/semantic-final-gates-20261028-v1/residual-ellipse-final.tap) **6/6**。两套类型检查、定向 ESLint 已退出 0。完整 Lint 亦退出 0；其工作跨越新模块创建时间，因此新增模块及最终发行清单的 ESLint 以随后定向结果为准。架构检查为 2,543 文件、7 个原有 decreasing-only 例外，没有修改门限。

[严格匹配重放](../.codex-temp/semantic-final-gates-20261028-v1/residual-ellipse-worker-v1/final-candidate-summary.json)已到达原最终输出检查：五次请求的提示词和全部图片摘要都与 v4 保留记录一致，新增模型调用 0，不能记为新的 OCR/识别验收。本轮计划中的 **9/9 条关系均是单条、双端绑定的原生连接器**，无固定路径、填充或控制碎片；`unmetRelationIds` 为空。最终检查仍原样拒绝 `semantic-native-output-incomplete`，不是整页通过。两个运行时错误已不再出现。

必须区分旧计划 11 条关系和本轮 9 条关系。[同源几何清单对照](../.codex-temp/semantic-final-gates-20261028-v1/graph-inventory-drift.json)定位了两条漏报候选：左侧层级徽章 `1→2`、`2→3`（新身份 `object-n106→object-n112→object-n116`）。对照使用同一源摘要和唯一几何匹配，只产生补充核查候选，没有自动移植旧编号、源权限或最终清单。9/9 不能证明原图所有关系齐全，15 个新区域也不能与旧 12/16 区域指标直接比较。

另外，在[独立重放](../.codex-temp/semantic-final-gates-20261028-v1/retained-footer-review-v1/retained-footer-binding.json)中恢复了用户此前“独立三柱、正文从 5 开始”的明确观察，经当前源摘要、唯一页脚对象、原始 OCR、完整观察窗口及现有私有能力重新绑定；没有要求再次确认，也没有伪造较早的控制时间。页脚 `object-n132 / icon-source-text` 已从这份候选的未解决项消失。该诊断仍保留 `proposal-missingText-73 / glyph-source-unit`、region-n3 和根区域的未完成记录，且两条层级关系尚待恢复；未发布合格整页或挪用旧 Office 结果。

此前完整 CI 在源码变化前精确停止，退出 1，不计通过。最终 `npm run verify:ci` 的 Lint、类型、插件、可观测性、ADR 检查已通过，但在原 `audit:dotnet` 门禁以 **NU1900** 失败：无法获取 NuGet 漏洞服务索引；终态和完整日志保留。原命令重试、.NET 8 正确的 `--no-cache --force` 重试也失败；PowerShell 请求同一索引返回 200，故目前仅确认 .NET/NuGet 路径故障，不能声称公共服务整体不可用。中间使用不受 .NET 8 支持的 `--no-http-cache` 失败单独保留，不计为审计重试成功。没有关闭漏洞检查、降低警告级别或制造全量绿色。

当前以原 `npm run test:unit` 入口独立继续全量单元验证，日志 `residual-final-unit.log`、终态 `residual-final-unit-terminal.json`；必须读取终态后才能报告通过。全量 CI、两条缺失关系、剩余清单/字形、整页输出和本轮 Office 验收仍未完成。完整 goal 保持 active，用户暂时无需操作。

### 2026-10-28 接续：关系清单恢复为 11/11，严格区域为 14/15

全局识别提示新增直接区域归属和弱连接复查约束，保持原观察次数与预算。对应真实实验找回左侧两条层级虚线，并修正父子区域重复计数。后续保存回复重放严格检查请求提示与图片摘要，不能记为新鲜 OCR 或整页 Worker 验收。原有 B/C 各沿本侧向下及页脚独立三柱图标的人工确认，通过当前源摘要与测量目录重新绑定；没有重新要求用户确认，也没有把旧对象编号直接移植为源证明。确认恢复目前仍是诊断适配，尚未成为持久化生产 review store。

真实重放另暴露 retained physical arm 的一端实际为业务节点，最终化却将两端都视为隐形控制点而拒绝。最终化现验证真实端口与节点身份，页面重排先读取并固定真实锚点，再求解网络；不移动业务节点充当控制点。新增 `source-native-terminal-arm.test.js` 覆盖正反方向、编辑重排、错误重绑定、缺失、极端输入、getter/proxy 不执行及预算失败，并进入统一 CI 自动发现。

[最新最终候选摘要](../.codex-temp/semantic-final-gates-20261028-v1/census-owner-reviews-v1/final-candidate-summary.json)已确认 **11/11 条关系均为 single-native-connector，wholeNativeObject 为 true**；最终原生选择 applied，rejected 与 unmetRelationIds 均为空。当前计划严格区域 **14/15**，唯一剩余为 region-n6 协作层浅色虚线外框：源边段缺口 59px，原允许 57px，保留严格失败，不提高阈值。当前区域分母来自新识别计划，不与旧 9/12 直接比较。

原生输出选择仍要求严格 unresolved 为空且全部 coverage rows complete，因此最后仍拒绝 semantic-native-output-incomplete。用户既有授权允许此框拟合近似，但需要把这一已批准近似以受限事务接入语义验收，保留严格结果，不能直接清空未解决项或声称源像素证明通过。本轮尚无合格整页 PPTX，也尚无该候选的 Office 编辑、保存重开验收。

[最终联合回归](../.codex-temp/semantic-final-gates-20261028-v1/census-owner-final-regressions.tap) **85/85，失败 0，跳过 0**；后续安全测试后的线臂单测 [5/5](../.codex-temp/semantic-final-gates-20261028-v1/native-terminal-arm-final.tap)。两套类型检查及定向 ESLint 退出 0。上一轮全量单元已退出 0，但跨越后续修复，不代替当前完整 CI。当前唯一完整 `npm run verify:ci` 日志为 [native-terminal-arm-verify-ci.log](../.codex-temp/semantic-final-gates-20261028-v1/native-terminal-arm-verify-ci.log)：Lint、类型、插件、可观测性、ADR、NuGet 审计和锁定 .NET 构建已通过，接续核对时仍在全量测试，未出现终态文件，不能报告 CI 完整通过。此后未修改生产源码。用户确认卡巴斯基告警已消失，当前没有证据将剩余问题归因于安全软件，用户暂时无需操作。完整 goal 保持 active。

### 接续实测：近似外框接入语义验收，真实候选组件门禁通过

上述 CI 后续在新的生产修改前按已核对 PID 与父进程精确停止，终态 exit 1，不计全量通过。新增 `approved-frame-completion.js`，由原已批准资产应用在消费真实 draw receipt 后签发进程内事务，绑定实际页面、原生框对象、源场景、编译结果、画布和审批范围。仅当区域内部物化完整、独立 census 完整、拒绝清单只缺该区域本身，且其未解决项恰为 perimeter/member 两项时，语义输出才可接受该框。原 `unresolved`、严格 coverage、独立清单审计与源像素均不改；克隆报告、改框、改源、改清单、其他漏项或后续事务失败都不能得到此权限。新报告分别保留 `approvedFrameCompletions`、`strictSceneCompletion` 和严格 sourceInventory。

真实图 [v3 重放](../.codex-temp/semantic-final-gates-20261028-v1/frame-semantic-replay-v3/rebuild-1-summary.json)首次越过原 semantic-native-output-incomplete，但组件门禁暴露此前被遮挡的 reviewed graphic index 10。其徽章在场景编译器中已成功，局部复核却因稀疏图标策略拒绝内部高密度填充。复核现在仅在旧策略失败后调用已有完整 pictorial source-isolation 策略，继续使用同一局部 4M 像素账本、原面积/边缘/文字归属限制，不靠删除未解决记录放行。源账本、native finalization 与 owner review 的工作量计数另补精确 IR 字段校验，仍限制在原 4M 上限，坐标及同名其他路径不因此放宽。

[v4 重放候选](../.codex-temp/semantic-final-gates-20261028-v1/frame-semantic-replay-v4/rebuild-1-summary.json)现为 **nativeComponentQuality.passed true、11 条完整原生业务连接器、unresolvedSceneComponents 0、findings 0**。严格区域仍为 14/15，sourceInventory 保留 n200 从 4 个源部件替换为单条原生连接器后的严格 compile-missing；单条原生替换由另行绑定的 measured materialization 证明，不伪称源部件未变。审批范围仍只有原中间框，当前资产采用 before/after 同哈希的 no-op，新增背景改动 **0**，见 [批准范围](../.codex-temp/semantic-final-gates-20261028-v1/frame-semantic-replay-v4/approved-frame-scope.json)。所有重放均复用严格匹配的原请求/图片和保存回复，新增模型调用 0，不能记为新鲜 Worker/OCR 验收。

该候选继续执行 Worker，随后在 IMAGE_ASSET_NAMESPACE_FAILED 停止：旧 namespaceRawPageAssets 仅接受平铺文件，而实际编译器资产含 scene-owned 等子目录。因此仍无合格整页 PPTX 或本轮 Office 验收。已拆出 `worker-asset-namespace.js`，支持受限递归、链接拒绝、字节/条目/深度限制、精确路径替换及暂存后发布，复制失败清理本次暂存；文件、输出目录及源 word-layout 绑定保持原有语义。该修复已进入发行清单、严格类型和统一测试入口。正在进行 v5 整页重放，须读终态后再判断导出/渲染结果。

[139 项最终联合回归](../.codex-temp/semantic-final-gates-20261028-v1/frame-badge-final-regressions.tap)全部通过、跳过 0，含近似许可、真实原生关系、IR 数值边界、徽章、事务/保存以及更新后的隔离发行包检查；随后新增 namespace [6/6 回归](../.codex-temp/semantic-final-gates-20261028-v1/frame-namespace-regressions.tap)通过。最新 [两套类型检查](../.codex-temp/semantic-final-gates-20261028-v1/frame-namespace-typecheck-final.log)和定向 ESLint 退出 0。中间的完整 CI 亦在后续生产修复前精确停止，不能借用其前置通过作为最终完整绿色。下一次全量 CI 应在真实重放接线稳定后启动，避免每发现一个被遮挡的运行时问题就重复全量测试。目标保持 active，无提交、部署或工作区重置。

### v5 终态：已生成通过 Worker 门禁的 PPTX，最终绑定审计通过

[真实生产 Worker 保存回复重放 v5](../.codex-temp/semantic-final-gates-20261028-v1/frame-semantic-replay-v5/worker-result.json)已返回成功并生成 [isolated-proofdeck.pptx](../.codex-temp/semantic-final-gates-20261028-v1/frame-semantic-replay-v5/isolated-proofdeck.pptx)。PDR 6.780674%、Missing 3.614125%、MAD 8.992524；组件、语义、渲染、资产及 PPTX 生成门禁均通过。业务关系 11 条，最小图像单元 21 个，大块 raster 0；严格区域 14/15，原已批准近似外框和严格 sourceInventory 失败继续保留。复用保存识别回复，新增模型调用 0，不算新鲜识别验收；scope 中 originalRequestEquivalenceVerified 仍为 false，不将新记录的请求摘要误称为原在线请求等价证明。

本次新增 [最终 PPTX 原生绑定审计](../.codex-temp/semantic-final-gates-20261028-v1/frame-semantic-replay-v5/native-binding-audit.json)：从最新 IR 独立推导业务集合及全部双端绑定对象，确认 **11/11 业务关系各为一个原生 cxnSp**、无同名固定路径替代；含独立共享短臂在内的 **12/12** 预期双端绑定连接器均指向原 IR 节点，端口索引合法。未以旧计划 ID 或旧 Office 文件充当本次验收。文件 SHA256 为 `1b6aa8c38c14cf7266315cce60d5730450d610928b048a537c72be9a2cbaa365`。

最新完整 CI 会话 48126 已退出 **1**。完整 Lint、类型及前置校验继续执行至 audit:dotnet，随后 NuGet 漏洞数据源 `https://api.nuget.org/v3/index.json` 无法访问，触发 NU1900；这不是完整 CI 通过，后续构建/测试/发行步骤未由本次串行 CI 执行。不得关闭审计或改警告等级绕过。日志为 [frame-namespace-verify-ci.log](../.codex-temp/semantic-final-gates-20261028-v1/frame-namespace-verify-ci.log)。

PowerPoint 启动接口先超时，随后可发现窗口；目标状态截图与目标应用不符，重新绑定和激活后仍无可用 accessibility。未向不确定窗口输入、未处理安全提示，当前副本没有完成移动/缩放/保存重开。剩余交付条件为最新文件 Office 生命周期、新鲜识别 Worker、review 持久化以及最终完整 CI。原目标保持 active，本次没有提交、部署或重置工作区。

### 人工确认持久化与新鲜识别稳定性

新增 `retained-scene-review.js` 和只读 `source-scene-review-store.js`，通过生产 `source-scene-runtime.js` 加载 `COMMON_TOOLS_IMAGE_SCENE_REVIEW_ROOT/<sourceHash>.json`。记录保留同源人工选择、源坐标及物理边顺序，不保存模型节点 ID；当前 catalog、像素证明、预算及进程内图标 receipt 仍重新验证。目录与文件拒绝链接、读取上限 64KiB、读取中变化及 IO 错误均拒绝，错误不暴露源内容或路径。没有配置时保持原行为；本轮没有配置线上服务。

首次新鲜 v5 识别暴露历史人工确认只在诊断脚本中恢复的问题。[生产持久化接线重放 v1](../.codex-temp/semantic-final-gates-20261028-v1/retained-store-current-v1/worker-result.json)随后通过全部 Worker 门禁，11 条完整原生业务连接器，未完成组件 0、findings 0，PDR 6.854949%、Missing 4.307799%、MAD 9.114598。其输入是保存的新鲜 v5 回复，逐请求核对 prompt/图像摘要，新增模型请求 0；仍属于重放，不算独立新鲜识别成功。原批准外框通过同源实际框几何唯一映射当前区域，保留 approvedRegionId 与当前 regionId，不授予严格源证明。

[新鲜 v6](../.codex-temp/semantic-final-gates-20261028-v1/fresh-isolated-worker-v6/worker-terminal.json)执行 1 次 OCR、5 次识别后失败：同一物理卡片由 objects/container 改为 regions/card，原严格 collection/kind 匹配拒绝。新增可选 sourceBox，仅对 card/container 允许跨 collection 表示匹配，必须同源、人工点仍在内部、四边各在 2 源像素内且全体候选唯一；重复、位移、方向或路径变化继续拒绝。不含 sourceBox 的历史记录沿用原匹配方式，不做最近邻推断。

`trusted-scene-reviews-v2` 从旧确认对应的原计划补入原始框几何，保留旧文件和 provenance 摘要；未重新询问用户，也未增加像素近似授权。[最终确认记录回归](../.codex-temp/semantic-final-gates-20261028-v1/retained-review-representation-final.tap)12/12 通过，含真实 catalog/编译、表示互换、重复拒绝、原位置变化、非法输入、文件 IO 及统一 CI 发现检查。最新重放 [retained-store-current-v2](../.codex-temp/semantic-final-gates-20261028-v1/retained-store-current-v2/worker-terminal.json)已终态失败：身份匹配通过后没有当前 source network catalog，不能借用旧 catalog 强行应用人工选择。

进一步读取该轮 compile-preflight.json，发现全部 10 条当前关系均为 `relation-scope`，sharedRoutes graphs=0、resolved=0。新模型把它们归到 region-n18 diagram，但节点的声明父级仍在该分组之外，另有 tuple、program-member 等 admission 拒绝。上述是新鲜识别结构契约失败，不能描述为只剩 ID 映射，也不能由人工路径确认授权改写整个分组或抹掉严格失败。后续应修复/复核分组与端点归属，再重新测量 catalog；没有启动同条件的新鲜请求反复碰运气。

### 全量发现的扫描预留回归与工程验证边界

完整单元入口曾失败：新增 pictorial fallback 在 sparse 策略失败后再次读取同一源窗口，而 allocator 只预留一次扫描。现通过已有 `withSceneFillRasterCache` 在同步策略对内复用不可变源字节，各策略仍独立执行分量、边界、文字归属及裁剪准入；不复用测量结论、不回滚花费、不增加原 4M 上限。[56 项扫描/分配/规划回归](../.codex-temp/semantic-final-gates-20261028-v1/review-scan-cache-regressions.tap)全部通过，包含恰好剩余一个窗口预算时 opaque 成功，以及 blank、text-owned、clipped 拒绝和预算不足失败。

此前 CLI 30 秒超时、OpenXML 缓存清理 ENOTEMPTY 和隔离发行闭包探针 10 秒超时，按原期限、文件间串行独立复跑[31/31 通过](../.codex-temp/semantic-final-gates-20261028-v1/previous-external-failures-isolated.tap)，没有提高 timeout 或吞掉异常；单次复跑不能证明所有宿主竞态消失。完整 Lint 70350 已终态退出 0，本轮最后修改另经定向 [ESLint](../.codex-temp/semantic-final-gates-20261028-v1/review-final-eslint-v3.log)和[两套类型检查](../.codex-temp/semantic-final-gates-20261028-v1/review-final-typecheck-v3.log)退出 0。

NuGet 审计原入口在启用正常网络代理、执行无缓存且保留 NuGetAudit 的锁文件 restore 后已通过；此前完整 CI 的失败保留，不能由单独审计推导全量通过。最新 Office 观察可读取 PowerPoint 控件树，截图仍与目标窗口不一致，未向不确定窗口输入；最新产物的实际移动、缩放、保存重开仍未验收。

最后修改后的原入口完整 `npm run verify:ci` 已启动，证据为 [review-final-ci-v3-start.json](../.codex-temp/semantic-final-gates-20261028-v1/review-final-ci-v3-start.json)与 [review-final-ci-v3.log](../.codex-temp/semantic-final-gates-20261028-v1/review-final-ci-v3.log)，终态由 review-final-ci-v3-terminal.json 记录。仅校验子进程使用实际监听的本地代理；没有关闭审计、扩大预算、提高基线或跳过测试。启动不等于通过。该工程 CI 也不能替代上面的新鲜结构失败或 Office 验收。

### 2026-10-28 当前接续状态：定位复核、区域归属与实际编辑边界

本节取代上面的“当前运行情况”，历史结果保留。原目标继续 active；没有提交、部署、重置工作区或新增近似授权。

定位复核现在可以同时保留不完整 shaft 坐标与错误语义 owner 的受限任务。原始核心、拒绝、槽位和原 owner 不变，仅在既有严格提名成立时安排祖先区域的双观察复核；缺失、伪造、过期控制及越界 shaft 仍拒绝。`containsSceneBox` 移到无 plan 运行时依赖的 endpoint-scope，修复新增依赖环。planner 在复核改变 regions、objects、relations 或 textEndpoints 后，用同一 compilationSession 与原 4M 账本刷新预编译，恢复的关系不再沿用旧 catalog。相关前轮最终回归 [112/112](../.codex-temp/semantic-final-gates-20261028-v1/localization-owner-final-regressions.tap) 通过。

新鲜 v8 完成 1 次 OCR、5 次识别后失败于缺失当前 catalog。修复后的严格匹配重放 v3 已生成 **11/11 单条、双端绑定的完整原生连接器**，但两个 pending program 仍要求已修到祖先的关系留在旧区域，同时独立 census 仍按旧区域分配，因此未通过整页门禁。不能把 v3 描述为 Worker 成功。

本轮修复保留原始 program 依赖快照和全部拒绝历史，并在实际双观察修复记录中保存可选 previousRegionId。持久化读取重新校验同源、尺寸、当前完整关系身份及既有包含祖先链。原 program 仅在原关系确实存在、修复记录匹配、祖先的完整 program 保留该关系时释放本区域成员要求；同端点的新 ID 不能替代。独立观察保留原值，只派生经过守恒分配的当前 owner 计数；本来正确的 census 不重复转移，未知计数保持未知，额外观察到但尚未恢复的关系继续是缺口。区域完成、coverage 与最终 inventory 使用同一派生逻辑，防止“区域编译通过，输出清单仍用旧计数”。

[重放 v4](../.codex-temp/semantic-final-gates-20261028-v1/retained-store-current-v4/final-candidate-summary.json) 首次达到当前计划 **15/15 区域编译完成、pending 0、unresolved 0、11/11 完整原生关系**。该计划有 15 个区域，不能与旧 9/12 指标直接相减。v4 最后仍被 inventory 审计拒绝：当时最终 inventory 还使用原 census，另有正常原生物化事务中的成员替换，不能通过保存 JSON 的只读审计冒充进程内 receipt。此后最终 inventory 接线已修复，必须取得新终态才算通过；v4 本身仍是失败证据。

最终生产修改的 [110 项联合回归](../.codex-temp/semantic-final-gates-20261028-v1/program-owner-final-regressions-v2.tap) 全部通过，失败 0、跳过 0；包括实际双观察 owner 转移、旧 history 兼容、完整 program 恢复、最终序列化 inventory 审计、原 census 已正确时不重复转移、未知/不足/额外观察、缺少实际输出、保留 rejected/reserved attempts、错误源/层级/身份以及 getter/Proxy 拒绝。[两套类型检查](../.codex-temp/semantic-final-gates-20261028-v1/program-owner-final-typecheck-v2.log)及[定向 ESLint](../.codex-temp/semantic-final-gates-20261028-v1/program-owner-final-eslint-v2.log)退出 0。新增测试进入既有 unit/all 统一入口。早期 5 项 fixture 缺 labelRefs 与 1 项部分恢复 census 回归失败均保留，没有关闭断言。

Office 已从未验证推进到实际 B 节点生命周期：在 retained-store-current-v1 的独立副本上移动、放大、保存、关闭，并重新打开，见 [动作记录](../.codex-temp/semantic-final-gates-20261028-v1/office-lifecycle-retained-v2/observed-actions.json)。[补全辅助短臂的 XML 审计](../.codex-temp/semantic-final-gates-20261028-v1/office-lifecycle-retained-v2/bounded-lifecycle-audit-v3.json)确认 **11 个业务连接器和 1 个辅助连接器均保留单个 cxnSp、双端名称及端口绑定，12/12 保持**，对象名称清单保持。改变的业务路径为 n201、n205、n206。86 个 group frame 差异包含 Office 规范化，不等于 86 个节点被移动。

但是同一实际 Office 文件的下层 **5 条业务线 + 1 条辅助短臂**几何采样显示：编辑前 1 个连通分量/1 个环，编辑后 1 个连通分量/0 个环。相关父组 off/chOff 和 ext/chExt 相等，不能归因于遗漏父组缩放。Office 将 n206 从多折连接器重排为三折路径，原辅助短臂没有同步重排。该证据是 sampled-native-stroke-mask-v1，fullTopologyVerified 仍 false；只能确认当前采样闭环保留未通过，不能宣称完整编辑验收通过，也不能把 binding 保持当成共享物理路由保持。

原 localization-owner CI 因后续生产修复被精确停止，记录 [superseded](../.codex-temp/semantic-final-gates-20261028-v1/localization-owner-verify-ci-superseded.json)，不计通过。冻结后的新原入口全量 CI 为 [program-owner-final-ci.log](../.codex-temp/semantic-final-gates-20261028-v1/program-owner-final-ci.log)，start/terminal 文件包含选定最终源码摘要与是否运行中变化；仅切换受支持的 spec reporter 以及时显示失败，所有门禁、预算、超时、审计与断言保留。新鲜 v9 也在采集独立识别，但其启动横跨最后一次 census 边界修复，必须比较输入指纹，不能直接算最终冻结源码的新鲜验收。v5 重放因并行新鲜验证容器仍在运行，被原隔离断言拒绝启动，尚未执行 Worker；未删除该容器或绕过隔离。下一步是在隔离空闲后验证最终输出，并单独处理 Office 移动后的共享闭环保留。

### 状态复核：最终重放通过，全量测试暴露独立事务回归

[v6 Worker 终态](../.codex-temp/semantic-final-gates-20261028-v1/retained-store-current-v6/worker-terminal.json)已返回成功，handlerReturned/qualityPassed 均为 true，耗时 201110ms，主进程退出 0。当前计划 15/15 区域完成、pending 0、unresolved 0、11/11 单条完整原生业务连接器。[scope](../.codex-temp/semantic-final-gates-20261028-v1/retained-store-current-v6/scope.json)明确这是保存回复的严格请求匹配重放，新增 provider 调用 0，freshOcr/freshVision/originalRequestEquivalenceVerified/wholeProductAcceptance 均为 false；不能算独立新识别或整体验收。旧 9/12 和当前 15/15 分母来自不同计划，不能直接比较。

独立新鲜 v9 已失败：模型最初只列出两条关系候选，两条经双观察修正 owner，但其他预期关系没有进入有效清单；并非编译器将 11 条完整关系回退成两条。该运行也跨越一次源码变化，不作为最终冻结代码验收。后续应定位遗漏发现与有界补查，避免重复相同调用碰运气。

本次核查全量 CI 日志发现 approved-route-materialization 测试失败；[独立复现](../.codex-temp/semantic-final-gates-20261028-v1/materialization-current-focused-v1.log)为 15 项中 4 通过、11 失败、0 跳过。共同入口为 approved-frame-completion.js:59 的 invalid-approved-frame-list：已经没有 unresolved 的完整 scene，仍进入近似外框专用 regionTree 校验。现有 110 项 owner/census 定向回归仍通过，但不能覆盖该事务组合问题。全量 CI 尚未终态且已经存在失败，不能报告绿色；当前未为此修改生产源码，保持正在运行的冻结候选。下一步验证无缺口 scene 应无外框例外权限、继续执行普通 finalizer 的边界，并保留不完整/非法 scene 的拒绝测试。

Office 工具已重新成功激活 PowerPoint 并取得正常截图，当前无需用户再操作桌面。仅添加 noChangeShapeType 的 12 连接器副本已生成，但尚未进行其移动/缩放/保存重开实验，不算闭环修复；生产源码未加入该锁。原 B 生命周期中 12/12 绑定保持、采样环数 1 到 0 的失败证据仍有效。完整 goal 保持 active，尚缺新鲜识别完整性、编辑后闭环保留和最终完整工程门禁。

### 完整场景事务回归修复，以及形状约束实验终态

approved-frame-completion 现在在验证 unresolved 为合法清单后，仅当其确实为空时返回 null，不申请任何外框例外；因此不要求完整 legacy scene 提供近似外框专用 regionTree。原 compilation、frames、清单格式校验及有缺口场景的审核保留。无例外权限时原连线事务继续执行，独立输出审计仍能拒绝矛盾或缺失的编译证据。新增回归验证 finalizer 恰执行一次、没有 frame receipt、不改 source/compilation；缺失/null/对象/超限 unresolved 继续失败并回滚。既有事务回滚、克隆、失效、并发与源变化测试未删改。

[联合回归](../.codex-temp/semantic-final-gates-20261028-v1/frame-complete-regressions-v1.tap) **36/36 通过、0 失败、0 跳过**，覆盖 frame completion、原先失败的 materialization 及 owner transfer；[两套类型检查](../.codex-temp/semantic-final-gates-20261028-v1/frame-complete-typecheck-v1.log)和[定向 ESLint](../.codex-temp/semantic-final-gates-20261028-v1/frame-complete-eslint-v1.log)均退出 0。原失败 CI 经核实 wrapper PID、创建时间及脚本后停止，其终态 exit 1，见 [替代记录](../.codex-temp/semantic-final-gates-20261028-v1/program-owner-final-ci-superseded.json)。当前原入口全量 CI 为 [frame-complete-ci.log](../.codex-temp/semantic-final-gates-20261028-v1/frame-complete-ci.log)，并跟踪新增修改的源码摘要；尚未终态。最终代码的严格请求匹配重放 v7 正在执行，不能提前记为成功。

已在 PowerPoint 的独立 shape-type-lock-copy.pptx 上实际移动并放大 B，经菜单保存、关闭，再从最近文件重开，编辑保留。见 [动作记录](../.codex-temp/semantic-final-gates-20261028-v1/office-route-lock-probe-v1/observed-actions.json)、[重开截图](../.codex-temp/semantic-final-gates-20261028-v1/office-route-lock-probe-v1/reopened-B-edited.jpg)及[只读审计](../.codex-temp/semantic-final-gates-20261028-v1/office-route-lock-probe-v1/shape-type-lock-audit-v1.json)。12/12 noChangeShapeType 属性保存后仍在，12/12 双端绑定保持，但 n206 仍从 bentConnector5 变为 bentConnector3，辅助短臂不跟随，采样环数仍为 1→0。此假设已被实际 Office 行为否定；没有加入生产锁，也没有将单节点或绑定保持包装为全线网编辑验收。

新鲜 v9 漏关系的只读定位进一步表明：原识别在 diagram region-n14 中观察到 9 条关系，但该区域直接对象为 0、合法端点为 0，几何上完整包含 23 个其他区域/对象。区域关系补查以合法端点至少 2 个为条件，因层级矛盾未被选中。两条原始关系反而从 n14 经双观察纠正到 root；原 root census 为 2，n14 census 为 9，两者不可合并或降低来制造完整结果。下一步需以这项同源 scope/census 矛盾安排有界复核并处理归属，不能由计数或几何包含直接发明新关系、重挂节点或签发绘制权限。尚未为此修改生产调度，独立新鲜验收保持未完成。

### v7 终态核实：最终代码的保存回复重放成功

[v7 Worker](../.codex-temp/semantic-final-gates-20261028-v1/retained-store-current-v7/worker-terminal.json)已成功退出，qualityPassed 为 true，Worker 耗时 320617ms。最终候选当前计划 15/15 区域完成，11/11 业务关系解决，unresolved 为空；[输出 PPTX](../.codex-temp/semantic-final-gates-20261028-v1/retained-store-current-v7/isolated-proofdeck.pptx)已经生成。visual-fidelity、semantic-editability、native-component-quality 等 Worker 门禁通过，PDR 6.714284%、Missing 3.558542%、MAD 8.878599。该区域口径是当前计划的编译完成数，不等同于跨计划的严格像素指标。

本次仍为保存回复重放，新增 provider 调用 0，freshOcr/freshVision/wholeProductAcceptance 均为 false。没有据此宣称独立新鲜识别完整、共享闭环通过 Office 编辑生命周期或整个目标完成。当前 frame-complete-ci 仍在运行，尚无终态；既有独立新鲜识别缺口和 Office 编辑后环数 1→0 的失败继续保留。

### 区域关系 census 与端点层级矛盾：补查入口及预算实测

新增 source-scene-census-scope-review.js，并接入原 regional inventory 的选取、提示和两视图共识。若语义分组观察到缺失关系，但找不到合法物理端点对，则仅为原区域窗口提名已有的最近共同祖先；端点引用、实际层级、源摘要、尺寸、观察计数和窗口须在消费时重新绑定。它不重挂节点，不修改原 census，不生成关系，也不签发源像素或完成权限。发现仍须两视图同意同一关系及完整 shaft，沿用既有关系尝试额度和源编译门禁。拒绝缺失、越界、冲突、恶意、过期输入；不允许从这个入口新增对象或替代原 program。

OCR 目录中完整位于已提名节点内的标签不作为另一物理端点重复占用发现引用，但目录本身和现有关系不删；已有具体关系引用的文字端点以及独立文字候选保留。明确的关系缺口优先保留共享引用，不能再被零关系装饰区域先占据，重复引用和完整窗口限制仍保留。

[真实全局回复的首轮只读调度探针](../.codex-temp/semantic-final-gates-20261028-v1/census-scope-initial-probe-v5.json)确认 region-n14 的独立关系计数仍为 9，合法端点原为 0，现在可向 region-n0 提名同一窗口、20 个引用。该探针重新解析了原全局回复，但没有重做 source-topology 或调用模型，不能当作新鲜识别。[图集打包探针](../.codex-temp/semantic-final-gates-20261028-v1/census-scope-atlas-probe-v1.json)保留原 32 个观察目标、589250 个预留像素和 45372 个聚焦像素，替换原第 93 号观察窗口后总计 3861278，低于原 4000000；这是布局可行性证据，不是已经派发完成的真实观察。原流程结束后才追加该窗口则预算不足，失败结果也保留。

[最终联合回归](../.codex-temp/semantic-final-gates-20261028-v1/census-scope-regressions-final-v1.tap)为 42/42、失败 0、跳过 0，其中生产规划器回归确认同一全局调用及两次局部调用足以发现关系，并且原缺口继续保留。两套 typecheck、定向 ESLint、架构预算和范围内 diff 检查通过；发行必需文件清单及统一 unit/all 入口包含新增模块和测试。新增关系目前只在 scopeDiscoveries 证据中保留原区域来源，尚未接入守恒的原区域完成义务关联；不能把入口修复算作整页新鲜识别完成，也不能以伪造原 tuple owner repair 历史解决此后续步骤。

frame-complete-ci 已终态退出 1：单元阶段 3 项失败，集中在 source-scene-planner 与 source-scene-program-recovery-pipeline，后续串行 CI 阶段未完成。[独立复现](../.codex-temp/semantic-final-gates-20261028-v1/census-scope-ci-failures-focused-v1.tap)为 43 项中 40 通过、3 失败、0 跳过。涉及最终再 preflight 后 released 计数覆盖、preflight 次数预期，以及恢复控制的某个变异没有被拒绝，仍需逐项定位；未改断言或跳过失败。本 CI 跨过本轮新增模块及调度开发，terminal 的 sourceFilesUnchanged 只覆盖启动时列出的 8 个文件，不代表全工作区冻结，也不作为本轮最终工程验收。当前没有运行中的 CI 或新鲜 Worker；下一步先补对应义务关联和这 3 项失败，再冻结运行完整门禁。Office 共享闭环的失败证据不变，完整 goal 保持 active。

### census 新发现身份接线完成：工程验证与独立识别仍分开验收

本节更新接续状态，保留上面的历史失败。规划器两次 preflight 的测试现在分别验证释放计数 `[63,0]` 及同一 compilationSession；恢复流水线验证两次刷新共用原编译账本。另修复恢复记录可改挂其他区域的漏洞：新增可选 programBinding，绑定 canonicalization 之前的原始 program/source/frame/index；旧无指纹记录继续兼容，但其剩余依赖必须与目标 program 完整匹配，不能利用空依赖改挂区域。该指纹不是源像素或完成权限。

新增 source-scene-census-discovery-history.js，将两视图接纳的新关系身份保存在独立 scopeDiscoveries 中，明确区别于原 tuple repair 历史；保存原各区域观察计数，并在当前 plan 及独立输出清单审计中重新验证源、范围、端点、层级、shaft、local/global 槽位与唯一实际输出。原 observedInventory 不变，只根据实际发现身份守恒分配完成义务；与原 owner repair 共存时不重复抵扣，unknown 及额外缺口仍保留。未新增模型次数或预算，也没有拿计数发明关系。

最终 [124 项联合回归](../.codex-temp/semantic-final-gates-20261028-v1/census-discovery-joint-v4.tap)通过，失败 0、跳过 0。其中生产规划器测试使用实际绘制的卡片、shaft 和箭头：原一次全局、两次局部调用发现关系后，普通源编译器生成一条完整双端绑定连接器；全白源图即使具有同样发现记录仍不能生成连线。早期 blank fixture 未同步 object batch 源绑定的失败保存在 source-compile-v1，不是生产准入放宽；修正测试源绑定后的 [14/14](../.codex-temp/semantic-final-gates-20261028-v1/census-discovery-source-compile-v2.tap)通过。新增模块在发行必需清单，回归由既有 unit/all 入口发现。

[两套类型检查](../.codex-temp/semantic-final-gates-20261028-v1/census-discovery-typecheck-v4.log)与[定向 ESLint](../.codex-temp/semantic-final-gates-20261028-v1/census-discovery-eslint-v2.log)均退出 0。冻结后的独立新识别 v10 使用真实 OCR、全新 provider 回复及原生产门禁，非历史重放；完整 [verify:ci](../.codex-temp/semantic-final-gates-20261028-v1/census-discovery-final-ci.log)同时启动。二者必须以各自 terminal 为准，启动和局部测试通过均不计整体验收完成。v10 另记录 packages/scripts/test/config 全部相关源码的前后摘要，避免只检查少数入口便误称工作区冻结。

当前已交付的 v7 保存回复重放仍是 15/15 当前区域、11/11 完整原生业务连接器，PDR 6.714284%；不能因此宣称新识别完整。Office 实际编辑中 12/12 单条连接器及双端绑定保持，但共享线网采样环数 1→0 的失败未解决；显式整网 reflow 的既有诊断不能替代 Office 自动拖动保持。目标继续 active，无提交、部署、重置或新增近似授权。

### 独立新鲜 v10 终态：确认记录没有对应关系，不是超时

v10 已终态失败，耗时 265585ms，真实 OCR 1 次、识别 3 次，3 次 provider 调用均成功。2711 个相关源文件的前后 aggregate 摘要相同，见 [冻结核验](../.codex-temp/semantic-final-gates-20261028-v1/fresh-census-v10-code-terminal.json)。本轮识别计划有 15 个区域、8 条关系，预编译解决 5 条；保留确认中的两组物理端点均唯一匹配，但 B/C 到 Worktree 的两个有向关系在当前清单中的匹配数均为 0，因此 retained-scene-review 的 relation-unavailable 检查拒绝最终应用。没有放松身份或源像素准入，也没有据此重复相同新鲜请求。

[有界诊断](../.codex-temp/semantic-final-gates-20261028-v1/fresh-census-v10-diagnosis.json)另确认：本轮 root 的独立关系 census 为 null，其余区域为 0，没有 v9 那种“观察到 9 条但无合法端点”的 overlay 缺口，所以 scopeDiscoveries 为空。本轮并未实际验证新 census discovery ledger 在真实图上的触发和完成，只证明其工程回归链路。下一步需将已有同源人工确认的缺失关系作为提前补查线索，仍通过当前端点、两视图及源绘制验证；不能在最终应用阶段临时编造关系或将 unknown 改成预期计数。

首个 PowerShell CI wrapper 经核验进程身份后停止：日志为 0 字节、无命令子进程，其 [superseded 记录](../.codex-temp/semantic-final-gates-20261028-v1/census-discovery-final-ci-superseded.json)不计成功。使用显式 Node npm CLI 启动的同一完整 `npm run verify:ci` 已产生实际 Lint 输出，见 [CI v2 日志](../.codex-temp/semantic-final-gates-20261028-v1/census-discovery-ci-v2.log)及 start/terminal；未修改任何原门禁、预算、baseline、超时或测试选择。接续时先读取 terminal 或现有会话，不重复启动 CI。当前记录类别为 progress；目标 active，独立新鲜完整性、Office 自动共享闭环保留及最终工程验收均未完成。

后续同源提前补查、新鲜 v11 关系 11/11、成功源目录衔接修复、38 项联合回归和 Office 副本实验的真实边界，见 [收尾状态记录](image-to-editable-closeout-status-20261028.md)。
