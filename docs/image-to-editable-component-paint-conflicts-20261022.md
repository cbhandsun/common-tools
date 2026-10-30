# 复杂图业务对象分组与绘制冲突定位

最新[真实包安装及六类消费者](../.codex-temp/runtime-locked-real-candidate-20261022-v3/README.md)已通过：官方离线锁解析与 `ci` 合计 165330ms，未超过原合计 600000ms；50 项锁无链接、归档完整性及公共来源校验通过。共享五场景探针按新 120 秒 profile 运行，实际 23130ms 返回严格 `ready`；其他五类探针与20 个包的依赖闭包也通过。临时安装已清理，2311 个绑定不变。此次成功只覆盖同一保留包的工程消费，未切换生产验证器或重跑完整 CI，也没有新增业务分组、区域、Office/PPTX 或共享 Worker 激活，完整区域仍为 8/12。

前序无目标安装实验的额外自依赖已由 npm Windows 源逻辑及独立进程配置复核定位；[纠正调用的小样例](../.codex-temp/runtime-lock-only-contract-20261022-v5/README.md)和上述真实运行采用独立 host cwd、无 prefix 的无目标命令，严格来源及完整性检查均保留。原生产命名 tarball 安装有显式目标，不受该空目标分支影响。原实验失败及早期工作区 shebang 副作用的恢复证据继续保留。

用户已明确只有当前截图；后续工作不再索要原始 PPT/PDF、矢量或高清源。本轮没有改生产分组规则或生成新产物，完整区域仍为 8/12。

最新 [n111 连续几何反证](../.codex-temp/n111-continuous-outline-occlusion-review-20261022-v1/README.md)完整检查同产物后绘制 outline 和 paint-0：两者均为无外扩 stroke 的填充复合路径，与原 0.123082px² 外露三角的面积交集为 0；实际 PPTX 量化后仍有 0.123521px² 未覆盖下界。共同的 0.0025px² 矩形反例与两层至少分离 0.21px。因此“现有轮廓已确定遮住外露片段”的机制关闭，不能据此签发归属或分组凭证；未审计所有其他后绘制对象的最终可见性。

本轮[离线阶段诊断](../.codex-temp/runtime-extract-phase-diagnosis-20261022-v1/README.md)确认本地解包持续有进展但在 120 秒截止，不能确定此前 npm 安装的具体阻塞操作。[锁定安装可行性样例](../.codex-temp/runtime-locked-install-feasibility-20261022-v8/README.md)真实通过本地依赖和特殊路径：普通安装对候选解包 2 次，复用 npm 原锁的 `ci` 为 1 次，实际加载通过且锁不变。它只提供工程优化方向，没有切换生产、重装真实包、验证共享探针新期限或增加业务对象验收。原预实验失败及更早真实安装失败全部保留。

共享连线期限修复后的[补充工程门禁](../.codex-temp/runtime-shared-probe-timeout-20261022-v1/gates.json)已通过两套完整类型、架构预算和定向差异检查；2311 个绑定未变，临时安装已清理。该结果不改变本轮安装失败及没有新业务对象验收的事实。

> **共享连线期限后续修复（2026-10-22）**：[本轮独立记录](../.codex-temp/runtime-shared-probe-timeout-20261022-v1/README.md)仅为五场景共享连线探针设置 120 秒期限，其他五类探针仍为 60 秒，场景、断言和严格 `ready` 不变；35/35 回归、定向 Lint、严格 helper 类型及独立复核通过。同一包的新一次安装仍在 600903ms 后超时，没有执行消费者，120 秒消费效果尚未验证。原结果保留，没有新分组、完整区域、Office/PPTX 或共享 Worker 激活，区域仍为 8/12。

> **安装期限后续调整（2026-10-22）**：[按用户要求放宽 npm 安装至 10 分钟](../.codex-temp/runtime-install-timeout-20261022-v1/README.md)后，同一保留包一次安装 288679ms 成功；Worker、场景程序探针通过，共享连线探针在保留的 60 秒期限后超时，后续三类消费者未运行。本轮仍失败；32/32 回归、定向 Lint 和严格 helper 类型通过，原失败及 2311 个绑定保留，临时安装已清理。没有新分组、区域、PPTX 或 Office 增量，完整区域仍为 8/12。

> 后续[页脚图标修复](../.codex-temp/region-icon-completion-20261022-v3/README.md)已使正常冻结 IR 的完整区域从 7/12 增至 8/12，新增三条图标原生路径；本文三张卡片的分组冲突及权威 PPTX 缺项仍未解决。后续[命名 file spec 安装消费](../.codex-temp/connector-mode-installed-20261022-v3/verification.json)也已在原期限通过，范围仅覆盖原旧 tarball。下述 7/12、未修改算法等描述均属于各自记录的历史诊断阶段，不代表页脚修复后的最新区域数；未生成新的 Office 或权威 PPTX 验收。

> 本轮[第三次统一 CI](../.codex-temp/goal-engineering-verification-20261022-v3/result.json)在 unit 阶段退出 1，缓存发布及共享消费者两项失败保留，后续新包消费尚未执行；不能用下述旧 tarball 或先前批次的通过记录替代。

> **第四次工程 CI 终态**：缓存发布与共享消费者调度修复的定向回归分别为 39/39 和 20/20，随后在[完整运行](../.codex-temp/goal-engineering-verification-20261022-v4/result.json)中全部 919 个测试文件通过；两套类型、Lint、配置、安全审计、锁定构建及 Python lock 通过，2311 个绑定文件不变。但最后新包安装后的首个 Worker 探针报 `unclassified`，后续安装消费者未执行，整轮仍退出 1。原报告未保留进程原因，不能把它认定为某一种超时或代码异常。这些修改不解决本文的业务对象绘制归属与分组冲突，产品完整区域保持 8/12。

日期：2026-10-22。状态：完成真实冻结回放及缺项定位，未修改生产算法，未取得新的连线/区域完成增量。证据目录：[component-group-paint-20261022-v1](../.codex-temp/component-group-paint-20261022-v1/)。

## 实际产物缺项

对权威 PPTX 的 OOXML 树与绑定 IR 作只读检查，产物共 398 个实际 shape/group 节点，其中 73 个组；根 shape-tree 属性 ID 不计入该节点数。主会话、fork A、Worktree 的底色与边框均没有共同的组祖先：

| 业务对象 | 底色 ID | 边框 ID | 共同分组 |
| --- | --- | --- | --- |
| `object-n107` | 96 | 228 | 无 |
| `object-n111` | 99 | 225 | 无 |
| `object-n119` | 94 | 232 | 无 |

两块填充关系主体及其两个连接片段（283–286）也分别位于顶层。因而此前改字及单对象移动通过，不能证明完整卡片或完整关系可作为一个业务对象编辑。检查保存于 [component-ownership.json](../.codex-temp/powerpoint-target-identity-20261022-v1/component-ownership.json)。

## 真实主链复现

使用已确认 A/A 的原计划、原 OCR 和源图片，经过现有 raw rebuilder 作本地回放；没有新 OCR/VLM。仅在隔离 Node 进程中插入观察器，记录 `paintConflict` 返回 true 的两个对象，不改变判定、参数、源像素、编译文件或阈值。记录不包含文字内容。

回放约 39.69 秒，仍为 11/11 已接纳关系、7/12 完整区域、30 个图像对象。原生组件与两种关系语义门禁仍失败，当前代码重算的未完成组件仍为 14。形状及文字数组与权威 IR 完全一致；30 个图像资产逐个核对均字节一致，图像数组仅 `assetPath` 不同，详见 `asset-comparison.json`。这些证明绘制输入保持一致；本轮未新增 Office 渲染或编辑，不代替整页验收。

11 个分组绘制冲突中，三处关键对象的首个阻塞项为：

| 被移动的源测量边框 | 阻塞它的既有绘制对象 | 已确认的性质 |
| --- | --- | --- |
| `scene-outline-object-n107` | `native-graphic-underlay-2-visual-atom-connector-0` | 旧视觉原子产生的水平线，实际笔宽 4pt，位于卡片顶部边缘 |
| `scene-outline-object-n111` | `solid-region-native-background-84` | 旧实色矩形背景，与新测量边框有绘制冲突 |
| `scene-outline-object-n119` | `native-graphic-underlay-7-visual-atom-connector-0` | 旧视觉原子产生的水平线，实际笔宽 2.6519pt，位于卡片顶部边缘 |

这三处不是由整页透明图片的外接框直接造成；本轮没有证据将它们认定为可忽略的误报。`outlineOwnsAxisLine` 仅处理 `long-axis-line`，而这里两条线的 detector 为 `visual-atom-native-connector`。不能只扩大 detector 白名单、根据中心线/矩形相交删除旧线，或把旧绘制直接标成属于节点。

## 后续修复边界

### 并发复核：完整笔迹与任意分组位置

新增诊断仍没有生产修复或完整区域增量。三条支线分别处理旧线完整笔迹、n111 早期私有分组、以及模式配置与安装包消费；共享生产模块没有并发写入。

- [两条旧线的二维完整笔迹](../.codex-temp/card-legacy-stroke-review-20261022-v1/README.md)：即使只取原始描边保证绘制的矩形核心，n107 和 n119 仍分别有 9.074px²、69.770px² 落在当前轮廓外，不能按完整替代退役，也没有通过当前完整 body 包含证明。完整核查另发现 n107 的三处、n119 的一处其他绘制冲突，删除首个报错项不足以解决分组。
- [早期分组的私有证据与位置检查](../.codex-temp/early-card-group-research-20261022-v1/README.md)：在真实 `bindSourceScenePhysicalGroups` 入口，n111 的完整旧矩形没有唯一私有 owner，几何预算未耗尽。对 body、outline 和已绑定文字枚举所有原子组位置，旧矩形同时要求 slot≤21 和 slot≥22，因此没有合法位置。仅在未授权的反事实中把旧矩形吸收入组才有 96 个位置；不能据此授予成员身份。
- [n107/n119 的位置必要条件](../.codex-temp/card-legacy-stroke-review-20261022-v1/paint-slots.json)：真实绘制顺序下，必要的 body/outline 成员分别要求 slot≥82 且≤77、slot≥138 且≤127，均为空。各自同一条旧顶部线已可构成最小矛盾；保留该线在组外时，增加文字或图标成员也无法消除矛盾。这排除了仅把组改到另一个位置即可修复的方案，不授权扩大成员集合。

此前较晚 native-icon 阶段的同 fill 限制反事实已正常结束，但没有适用的 parent binding，完成组数为零；形状和文字与正常冻结回放完全一致，30 个图像资产逐字节相同。不能将这个实验用作同 fill 限制阻止 n111 分组的证据。早期私有探针则在保存诊断后主动终止，未生成新 deck；两者终态分开记录在[诊断验证](../.codex-temp/early-card-group-research-20261022-v1/verification.json)。

### 本地包安装：命名路径修复后消费通过

前两次原 120 秒隔离安装超时继续保留。[有界 npm 模块诊断](../.codex-temp/npm-local-manifest-wait-review-20261022-v1/README.md)确认本地 tarball 的 manifest 路径会完整解包，裸路径还使 Arborist 先解包发现包名。运行包验证器补充包名校验，并使用原始绝对路径的命名 `file:` spec，避免这次重复工作；实际 npm 解析器另证实编码 file URL 会错指带空格、百分号或井号的路径，见[路径回归](../.codex-temp/runtime-package-file-spec-20261022-v1/README.md)。

[第三次受限安装](../.codex-temp/connector-mode-installed-20261022-v3/verification.json)仅执行一次，同一旧 tarball、原离线 flags、外部临时 prefix 和原 120000ms 期限均保留。安装 95432ms、消费者 31511ms，均退出 0；原消费者 11/11 项、1281 个模块通过，无越界解析。根锁、原源图、计划、权威 PPTX 及旧证据哈希不变，没有残留匹配进程。该结果覆盖旧 tarball 的模式消费，未包含待合入页脚图标修复、未激活共享 Worker、未执行整页 Office 验收，也不是完整 CI 通过。不能由这一个对照宣称前两次超时的唯一成因已得到证明。

### 后续完整背景证明：保留的否决结果

[n111 原始背景生成器核查](../.codex-temp/card-background-producer-20261022-v1/README.md)确认旧矩形右上角有 0.123082px² 超出实测 body，落在 `(578,615)` 这一私有 perimeter cell 内。把全部 14,560 个绘制 cell 片段分别归入私有 perimeter 或原 0.75px 内部完整包含，机械谓词全部通过，但独立审查否决了其完整归属推论：同一 cell 内的 ring 部分与外部背景部分没有被现有证据分开，不能因 cell ID 相同而归属外露的连续片段。

因此未实现这一生产候选，没有新的分组或区域增量。原 producer 私有凭证可以证明来源，不能单独补足格内归属；若改用整格作为分组范围，必须明确为新的分辨率级产品契约，不能写成当前严格判据已通过。当前候选的正面机械结果与失败关闭分别保存在 `perimeter-union.json`、[verification.json](../.codex-temp/card-background-producer-20261022-v1/verification.json)，失败证据继续保留。

下一步应对这些旧绘制证明完整的可见笔迹及引用关系：若被新轮廓完整替代，先取得同源覆盖与关系保全证据再退役；若应随卡片保留，须证明完整物理归属、子组完整性和分组前后的真实绘制顺序，再纳入源绑定的分组凭证。仍保留闭环线网、语义关系、箭头和外部片段；不得仅靠改组 ID、删除有冲突的对象或忽略绘制顺序获得通过。

曲线的另一个限制仍成立：794 个源 cells 中，有 1 个即使使用原始中心线也超过既有描边覆盖边界；它在主节点下方的软边接触处。仅简化/加点无法解释该 cell，现阶段不得删除、改归属、加粗笔宽或移动端口。节点效果、线条及残差需要联合证明。

本轮工程收尾另已完成：[Office 目标发现修复](image-to-editable-office-target-discovery-20261022.md)的完整 integration、Python lock 和安装包消费检查全部退出 0；首次完整 CI 和首次 integration 的失败记录继续保留。这些工程通过不改变本文件的产品缺项。

后续不同源码批次的工程结果不能与上述历史通过拼接：第四次 CI 的 919 个测试文件全部通过，但新包首个 Worker 消费探针失败且未保留进程分类。[安全分类修复](../.codex-temp/runtime-probe-classification-20261022-v1/README.md)保留原探针预算，26/26 回归通过；随后[一次受控安装](../.codex-temp/runtime-installed-probe-diagnostics-20261022-v1/result.json)在原 300000ms 安装期限到达时返回 `ETIMEDOUT / SIGTERM`，所有安装后消费者均未运行。原失败证据、2311 个源码及输入绑定和权威 PPTX 保留；没有新增分组、完整区域或 Office 行为验收，当前区域数仍为 8/12。

## 完整区域报告后续

[完整区域诊断修复](image-to-editable-completion-diagnostics-20261022.md)已经正常冻结回放验证，只增加诊断元数据；全部旧 shapes、69 个文字对象及 30 个图像内容保持。它没有修复本文卡片绘制冲突，也没有增加分组或 Office 编辑验收，当前完整区域仍为 8/12。编辑及视觉的 `not-assessed` 仅约束编译报告，不抹去旧成品的真实行为证据。

