# 架构改进当前状态

## 最近合并验收：交接边界组

证据：`.codex-tmp/handoff-consolidated-ci-evidence.json`。完整 CI 前 11 个阶段通过，最后的运行包探针因查找旧文件中的常量而失败；修正探针并增加真实通过/绕过失败回归后，13 项探针测试、受影响 ESLint 与打包安装复测通过。运行包 794 文件、6 项能力探针通过。此为组合验收证据，不能表述为单次完整 CI 全绿。

1,233 个工程输入的文件集合一致；前后只有打包验证器及其测试两处修改，生产代码指纹未变。保留 1 项原有 Windows 跳过。最近真实本地 Worker 仍为 XWridH，其运行早于后续规范化/Job/队列改动；PDF、远程和新的 Office 验收未完成。

下一组按 `.codex-tmp/native-registry-group-plan.json` 整组处理注册器及六个重建实现；剩余 OCR/重建元数据和启动配置契约也仍在 B/C 范围内。

本次后续增量：生产共用 Deck IR 准入和纯重建契约验证已进入严格检查；类型、Lint、相关 Worker/契约回归、OpenXML 集成和运行包检查通过。见 `.codex-tmp/deck-ir-admission-delivery-evidence.json`。以下最近完整 CI 仍是变更前基线，不能视为本次增量的完整 CI；归档选择和其他阶段交接尚待完成。

本页只保留当前结论。完整范围以[原实施计划](architecture-improvement-plan.md)的 A–F 为准，历史过程见[交付记录](architecture-delivery-batches.md)。整体尚未完成。

| 项目 | 已有证据 | 完成前还需要什么 |
| --- | --- | --- |
| A 工程预算 | 预算及增量门禁持续通过，未放宽规则 | 后续改动持续保持门禁 |
| B 核心引擎拆分 | 页面阶段、构建、文字策略及多组重建职责已进入核心包；独立执行、隔离打包及行为对照通过 | 历史引擎仍有 31,530 行，生产 Worker 仍依赖唯一历史适配入口；完成剩余识别、对象重建等职责拆分，消除该依赖，并证明同语料质量不回退 |
| C 类型和输入边界 | Job、OCR、Worker 配置及多项 Deck IR/模板/图表准入已纳入严格类型与回归；工具平台重建及 Deck IR 数据属性/头部边界已补齐 | 完整 Deck IR 和剩余核心边界尚未证明覆盖完整；逐项补足，不能用全量测试通过代替覆盖证明 |
| D 远程交付 | 本地工具和发布/验收能力已有实现，当前连接可查询、取消、下载作业 | 当前连接缺上传、创建工具；恢复后完成两条真实流程、版本绑定、授权负例和回滚验证 |
| E 阶段恢复 | [本地恢复验收](stage-recovery-acceptance.md)覆盖故障、缓存、取消、租约和清理 | 实际 OCR 发布版本绑定、部署启用及线上观测验收，与 D 合并执行 |
| F 实际编辑质量 | 开发图片样例通过实际 Worker 全部交付检查与 PowerPoint 选定对象编辑；新建 PPT 本地生成及 Office 表格、图表编辑通过 | 新 PDF、独立样本、相同环境的完整质量和成本比较；远程两条流程仍待验证 |

## 当前工程基线

最新 B 增量：比较矩阵及关联卡片流程/中心辐射图的 54 个函数已按文字处理、矩阵布局、结构化案例图和入口编排拆入核心包，函数体逐字一致。40 次调用、80 项输出/输入变更对照和 6 次相关图片文件哈希比较无差异；715 项原生重建与 25 项隔离/缓存测试通过，无跳过；类型、完整 Lint、786 文件运行包及 6 项探针通过。无旧 Skill 目录的测试验证实际矩阵线、状态标记、标准化文字和图像元数据，并确保非矩阵页面不误重建。证据 `.codex-tmp/comparison-matrix-delivery-evidence.json`。最近五批已纳入下述完整 CI。生产 Worker 其余历史引擎依赖、完整类型和远程/独立 PDF 验收仍未完成。

最近一次完整 `npm run verify:ci` 退出码为 0，12 项必需阶段均实际执行通过，覆盖图形原子基础模块、组件策略、关系图与完整图形编排、结构化卡片和比较矩阵五批改动。启动前记录的 1,215 个工程输入在结束时文件集合及哈希一致；运行包含 786 个文件，6 项能力探针通过，保留 1 项既有 Windows 符号链接测试跳过。证据 `.codex-tmp/matrix-consolidated-ci-evidence.json`；指纹范围包含所选源码、配置、Python 和锁文件，不代表整个仓库或所有外部依赖。

关系图与完整图形原子编排拆分后，实际本地归档 Worker 再次通过 17 项交付检查，产出 6 个文件；运行前后 1,210 个工程输入的文件集合及指纹一致。与前一版相同开发样例比较，全部非耗时质量指标一致，预览 HTML 内嵌的 9 张 PNG 资产字节一致，源图未变。单次耗时 32.649 秒，仅记录本次观测，不作为性能提升结论。证据 `.codex-tmp/relationship-worker-delivery-evidence.json`，产物目录 `.codex-tmp/text-refinement-production-Wxklm1/artifacts`。仍使用保留 OCR 与内存对象存储，未新增独立 PDF、在线 OCR、远程或 Office 编辑验收，也未逐字节比较整页渲染图。

## 已验证的用户流程

- 图片：最新本地实际归档 Worker 的开发样例通过 17 项交付检查，结果为 `partially-editable`；报告包含 20 个原生形状、11 条连接、31 个文字框和 9 张残差图片。证据 `.codex-tmp/relationship-worker-delivery-evidence.json`。此前 PowerPoint 在旧验收产物中修改文字、圆弧位置和线宽，保存重开后三项保留，证据 `.codex-tmp/image-office-9161d475/independent-evidence.json`；本轮未重复 Office 编辑。使用保留 OCR 和本地对象存储夹具，不代表线上或独立样本质量。
- 新建 PPT：五页中文样例的 PPTX/PDF/HTML、本地编辑导出及实际 Office 编辑已验证。表格、图表工作簿数据修改并显式刷新后保留，证据：`.codex-tmp/ppt-create-acceptance-LMJ7Mz/evidence.json`、`.codex-tmp/ppt-native-data-refresh-20260906/independent-data-evidence.json`。
- 用户提供的 `D:/下载/2026_China_Enterprise_AI_Agent_Landscape.pdf` 已登记并准备上传包，尚未转换或用于调参；它在本任务外的使用历史不确定，因此独立性未被证明。当前工具清单复核：`.codex-tmp/cycle-ci-remote-tool-recheck.json`。

## 后续执行边界

执行方式已调整为[收尾计划](architecture-closeout-plan.md)：先明确生产依赖与边界缺项，再按完整职责组实施，最后合并验收；停止逐个小模块推进及固定批次数的重复完整 CI。原 A–F 验收范围保持不变。

1. B/C 按完整业务职责和明确输入边界成批推进；先消除生产调用历史入口的依赖，再以包接口、真实行为及质量证据验收。文件数量和行数下降不作为完成标准。
2. 当前连接恢复上传和创建工具后，用已登记 PDF 与新建 PPT 合成材料执行 D/E/F 联合远程验收；复用现有本地证据，不重复同一开发样例调参。
3. 主入口是 Codex 聊天插件，Web 入口不属于缺项。“代码拆分”是内部职责整理，不涉及搬迁用户数据或更换服务器。缺失的远程证据不否定历史闭环，也不能以历史成功代替当前版本验收。

后续归档准入增量：三类归档选择已严格化，62 项相关测试通过；见 `.codex-tmp/archive-admission-delivery-evidence.json`。本增量尚未执行新的完整 CI/运行包检查。

重建交接增量：单页 Deck IR 现在先验证、再读取/遍历及复制资源，新增 getter/Proxy 回归通过。真实本地 Worker `text-refinement-production-XWridH` 的 17 项交付检查通过、源文件未改，非计时质量指标与 Wxklm1 相同；使用开发图片和保留 OCR，不能代表远程或 PDF 验收。证据：`.codex-tmp/rebuilt-page-delivery-evidence.json`。其余结果元数据和 Worker 编排契约仍待完成。

文档规范化交接已增加严格准入：验证连续页码、规范路径、普通本地 PNG 文件、实际尺寸、页级和总量上限，并返回不可变投影；异常在 OCR 前失败。63 项相关测试、追加边界用例、3 项规范化器测试及类型/受影响 ESLint 通过。证据：`.codex-tmp/normalized-pages-delivery-evidence.json`。此增量晚于 XWridH 真实 Worker 运行，未新增 PDF/远程验收。

Job/handler 交接增量：仓储返回值到尝试级 Job、不可变 handler context 已进入严格检查，拒绝读取型属性与 Proxy；历史 ID 值保持原样。44 项运行时/边界测试及最终兼容用例通过；证据 `.codex-tmp/worker-context-delivery-evidence.json`。完整持久化字段和队列编排契约仍未全部严格化，当前工具目录仍无远程上传/创建能力。

完整持久化 Job 行读取已严格化：复用身份、状态、选项、产物、质量及安全错误读取器，产物哈希对象不再被隐式转为字符串。52 项相关测试、类型、受影响 ESLint 和架构/工作区门禁通过；见 `.codex-tmp/job-row-reader-delivery-evidence.json`。剩余队列编排及 OCR/重建元数据交接继续推进，尚未执行本组完整 CI。

注册器职责组已整组完成：七个模块进入核心包、旧路径兼容转发；六个实现字节不变，注册器只调整一处策略 import。45 项行为测试和 1 项独立包测试通过，类型/受影响 ESLint/架构及工作区门禁通过。证据 `.codex-tmp/registry-group-delivery-evidence.json`。保守静态闭包中的历史实现模块从 51 减至 44，但主入口的注入回调仍未全部迁出，B 未完成；此为合并 CI 之后的增量。

页面文本收尾组已完成：36 个注入回调及 40 个共享函数迁入两个核心模块，并迁入字体证据辅助模块。主脚本 31,530→30,087 行，保守生产函数闭包 1,006→930；文本收尾器不再注入主脚本局部函数。719 项行为回归、6 项包隔离检查、类型/受影响 ESLint/架构门禁通过。76 个函数体除一处等价正则转义清理外一致。证据 `.codex-tmp/page-text-group-delivery-evidence.json`；此为合并 CI 后增量，B 及远程/PDF 验收仍未完成。

图形/输出收尾组已完成：29 个函数迁入 `page-output-rules.js`，函数体完全一致；主脚本 30,087→29,478 行。四个页面收尾/图像元数据组装点均不再注入主脚本局部函数。732 项行为回归、6 项包隔离测试、类型/受影响 ESLint/架构和工作区门禁通过。证据 `.codex-tmp/page-output-group-delivery-evidence.json`。图形准备、其他注册回调及历史组件实现仍未全部核心化，整体未完成。


### 图形准备组收口（2026-09-06）

已将 101 个图形准备函数及裁剪、封面辅助模块迁入核心包，主脚本为 27,235 行。738 项相关测试、类型检查、Lint、架构预算和包边界检查通过；函数体比对仅规范化 Python 资源目录路径，算法体无差异。证据：`.codex-tmp/graphics-preparation-delivery-evidence.json`。本组未重新运行完整 CI，未完成远程或 PDF 验收；Python 实际修补仍受当前运行时缺少 scipy 限制。按用户提速要求，本轮不再扩展拆分范围，下一里程碑为累计变更的集成验收；整体 A–F 尚未完成。


### 累计改动统一 CI（2026-09-06）

`npm run verify:ci` 本次单次完整运行退出码 0，覆盖注册器、文本/图像/形状/输出收尾及图形准备组的累计改动。检查前后 1,254 个工程输入的路径及哈希一致；打包安装包含 816 个文件、2,282,991 字节，6 项能力探针通过。保留 1 项既有平台跳过，未新增跳过。证据：`.codex-tmp/graphics-consolidated-ci-evidence.json`。此记录替代此前“完整 CI 后定向修复打包门禁”的工程基线；不代表 B–F 全部完成，不替代远程任务、实时 OCR 或 PDF 实际编辑质量验收。


### 图片 Worker 启动配置边界（2026-09-06）

从入口抽出严格类型的启动配置组合和环境快照读取，修复构建器路径 getter 会执行的问题（修复前回归失败）。已知字段只读取自有数据属性，拒绝代理、访问器、非字符串、超长及 NUL 输入；保留原有 OCR 文件与摘要校验。86 项定向测试、类型、Lint、架构预算及包边界通过，新增测试在既有统一 CI 入口中。证据：`.codex-tmp/image-startup-delivery-evidence.json`。属于上一完整 CI 后的增量；未重新运行完整 CI 或远程/PDF 验收。OCR 适配器内部与完整 Worker 编排的严格类型覆盖仍未全部完成。


### 实时/缓存 OCR 结果统一准入（2026-09-06）

实时 OCR 与检查点结果现在都先经过严格类型的 `ocr-result-admission.js`，再交给重建器。已知字段读取自有数据快照，拒绝 getter、Proxy、稀疏数组及越界输出；复用原有文字/几何校验，保留原始文字与默认置信度行为。79 项相关测试及 1 项真实 Worker 边界回归通过，类型、Lint、架构预算和包边界通过。证据：`.codex-tmp/ocr-handoff-delivery-evidence.json`。属于完整 CI 后增量，未重新执行打包安装、实时 OCR 或 PDF 验收；重建器附加元数据和完整 Worker 编排仍未全部覆盖。


### 重建结果附加信息边界（2026-09-06）

新增严格类型的源图片路径、重建配置名、残差计数和使用到的组件质量指标校验；在复制页面资产和交付前读取数据快照。源图片经 realpath 限定在原始输入或本页目录中，计数保证 20 页累加精度。62 项 Worker 测试及扩展的访问器回归通过，类型、Lint、架构预算和包边界通过。证据：`.codex-tmp/rebuilt-metadata-delivery-evidence.json`。未新增完整 CI、运行包安装或远程/PDF 验收；完整 Worker 编排仍需继续覆盖。


### 边界改动实际本地 Worker 验收（2026-09-06）

当前代码实际运行本地 Worker，17 项交付检查全部通过，生成 6 种交付文件。与 XWridH 同图基线相比，全部非耗时质量指标一致，源图未改变；19 个文本框微调被接受，PPTX 为 143,199 字节。本次耗时 40,452 ms，仅为单次观测。证据：`.codex-tmp/boundary-worker-delivery-evidence.json`，实际产物位于 `.codex-tmp/text-refinement-production-CIXd6U/artifacts`。使用保留的 OCR 数据及内存对象存储，不覆盖生产启动配置、实时 OCR、远程任务、独立 PDF 或新的 Office 编辑验收。


### 原生注册器回调组（2026-09-06）

三角拓扑、网络图和封面图的 25 个回调依赖函数迁入 `registry-graphic-rules.js` 与 `cover-graphic-rules.js`；封面元数据直接复用核心模块同一函数，移除对主脚本注册器绑定的反向依赖。主脚本 27,235 → 26,724 行。739 项相关行为/包隔离测试、类型、Lint、预算和边界门禁通过。函数体比对仅规范化一处保留求值的未使用变量清理，其余无差异。证据：`.codex-tmp/registry-callback-delivery-evidence.json`。此为完整 CI 后增量；B 仍未完成，远程/PDF 验收未新增。


### 38 个辅助模块整组迁入核心（2026-09-06）

不依赖文件自身位置的 38 个辅助模块迁入核心包，旧入口保留同一导出对象。当前静态依赖清单中的旧目录实现模块从 41 个减至 3 个：组件模板形状、组件资产学习及页面缓存。27 个模块字节不变，其余仅作 Lint 所需调整和 ZIP 原始错误原因保留；控制字符处理完成全 UTF-16 等价检查。首轮 863 项测试中 862 项通过，包隔离复制清单缺依赖导致 1 项失败；补齐后 6 项隔离测试通过，3 项 ZIP 边界测试通过，类型、Lint、预算和包边界通过。证据：`.codex-tmp/auxiliary-core-delivery-evidence.json`。主脚本仍为 26,724 行，B 未完成；未新增完整 CI 或远程/PDF 验收。


### 辅助模块迁移后运行包验收（2026-09-06）

实际打包、安装及 6 项能力探针通过，安装包 859 个文件、2,293,790 字节，图片转可编辑、新建 PPT 相关入口通过。证据：`.codex-tmp/auxiliary-runtime-package-evidence.json`。本次验证覆盖此前完整 CI 后累积的运行包变更，但不能代替完整 CI 或真实远程/PDF 任务。边界台账已同步已完成的 OCR 和重建元数据校验，避免继续重复处理已关闭项。
