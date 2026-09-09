# 架构改进当前状态

## 2026-09-09 收口：native engine 继续按生产边界拆分

基于“通用插件项目 = MCP 能力目录 + skill 薄壳 + UI contribution + 本地/远程 runtime + 可验收生产闭环”的共识，本轮没有继续按历史 `project-audit` 细项机械扩展，而是直接收敛生产图片/PPT 链路里仍然过大的 native engine。新增边界均落在 `packages/slideclone-native-engine/scripts/lib/`，skill 根目录不承载生产实现。

本轮提交：

- `3a55204 Extract component template palette boundary`
- `9f1fb9a Extract component template geometry boundary`
- `0b2f2af Extract component template family evidence`
- `bda537c Extract component template sanitizers`
- `361ba01 Extract native rebuild strategy profile`
- `cb175a7 Extract native rebuild workdir boundary`
- `ac19f15 Extract component template motif boundary`
- `b34d85f Extract page background fill sampler`

本轮拆出的职责边界：

- component template palette：组件模板颜色提取、soft fill 推导和颜色混合。
- component template geometry：相对/绝对 box、overlap、union、center、distance、anchor 计算。
- component template family evidence：matrix、quadrant、cycle、process、timeline、chart 等结构证据和 family 判定。
- component template sanitizers：文本、颜色、relationship id、本地 PPTX 路径、媒体 target、输出 asset 目录、组件 token 的输入清洗。
- component template motifs：目标 motif、fallback motif、whole-process 判定、asset/group motif 集合。
- native rebuild strategy profile：hybrid native rebuild 的策略说明和运行元数据。
- native rebuild workdir：workdir 枚举、JSON 读取、source native slide metadata/index。
- page background fill sampler：页面背景采样从主 rebuild 编排中移出。
- native rebuild value banner：value banner 背景对象化、稳定填充采样和渐变 native shape 构造从主 rebuild 编排中移出。
- native rebuild asset OS KPI benefit：资产规模/KPI 收益页的 residual 判定、卡片 native shapes、semantic/OCR 文本合并和标题清理从主 rebuild 编排中移出。
- native rebuild KPI evidence text：KPI evidence crop 内部文字识别、原图擦除和 editable native text 回填从主 rebuild 编排中移出。
- native rebuild value quadrant：四象限价值图的 native divider、gem facet、semantic text 和 gem fidelity crop 处理从主 rebuild 编排中移出，asset OS flow 通过模块导出的 gem helper 复用同一实现。
- native rebuild scale landing evidence：规模化落地证据页的 metric card、bottom strip、文本清洗/排版和最小图标 crop 编排从主 rebuild 编排中移出；共享 crop materializer 仍由主入口注入复用。
- native rebuild PPTX build executor：OpenXML/PowerPoint 构建执行器的路径组合和 core executor 装配从主 rebuild 编排中移出，主入口只注入 `__dirname` 并继续导出相同 build gate。
- native engine test entrypoint：25 个原先直接加载 `skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native` 的测试改为通过 `packages/slideclone-native-engine` 包入口加载，旧 skill script 引用预算从 63/45 降到 37/22。
- native runtime script tests：剩余直接测试旧 rebuild/quality-gate 脚本路径的用例迁到 `packages/slideclone-native-engine/scripts`，旧 skill script 引用预算继续降到 35/20；保留项主要是 wrapper 等价性、资源 fixture 和兼容合同。
- CLI slideclone runner：`packages/cli` 的固定执行入口从旧 skill `slideclone.js` 迁到 `packages/slideclone-native-engine/scripts/slideclone.js`，CLI 生产调用链不再把 skill 脚本当运行时事实源。
- component acquisition guidance：component shortlist、motif recall、replacement plan、harvest queue 和 action queue 输出的人工执行命令改为 `packages/slideclone-native-engine/scripts/...`，避免采集/补样流程继续引导旧 skill 脚本路径。
- component library refresh：组件库刷新计划只允许登记过的 native-engine package script，未知脚本不再 fallback 到 `skills/pd-hifi-slideclone/scripts`，并补回归测试证明 fail-closed。
- native rebuild entropy challenge：entropy challenge 的 annotation backplate/text、fragment cloud、perspective island、auto island gate 与 footer bullet native shape 工厂从主 rebuild 编排中移出；像素微组件检测继续复用 core raster detector。
- native rebuild system map diagram：system map 的对象化判定、dense network fidelity crop、line family compaction 和 composeSystemMapDiagram 接线从主 rebuild 编排中移出到 factory 模块；主入口只注入 IO/裁剪/layout 依赖，后续可继续迁出 layout helpers。
- native rebuild system map primitives：system map 的 shape/line 构造、底部领域标签和 asset grid tile freeform segments 从主 rebuild 编排中移出，供 system-map layout helper 局部复用。
- native rebuild system map source detection：system map 的源图文件发现、拓扑 probe、绿色 mapping line 检测、蓝色 network node/edge/detail 检测从主 rebuild 编排中移出到 source-detection factory，`prepareSystemMapTopologyProbe` 与 system-map layout 共用同一检测边界。
- native rebuild system map layout：system map 的 fidelity chrome、diagram layout、背景点阵、搜索框、底部 asset grid、mapping lines、rail modules、fallback network/detail shapes 从主 rebuild 编排中移出；主入口只负责把 source-detection 边界注入 layout factory。
- native rebuild asset OS flow：资产操作系统流转图的对象化判定、六类输入/输出语义组件、中心 shield、路线、icon fidelity crop 和 native component metadata 从主 rebuild 编排中移出到 factory 模块；主入口只注入几何、裁剪和写 PNG 边界。
- native rebuild portal platform：统一门户平台图的对象化判定、三路输入、平台核心、统一门户、路由箭头、icon glyph 和 native text box 构造从主 rebuild 编排中移出到 factory 模块；主入口只注入文本 box 命中和 round 边界。
- native rebuild input/output split：WMS 质量前置 input complexity / portal output 拆分图的对象化判定、native assistant 下整块 crop 保留策略、左侧复杂度网络、右侧输出卡片/渐变/文本、残差 region 声明从主 rebuild 编排中移出到 factory 模块；主入口只注入 round 边界。
- native rebuild product brain vision：产品大脑终局视野页的 candidate 判定、启发式识别、马赛克 tile 背景、中心产品地图、lens/search chrome、tile 颜色采样和残差 region 声明从主 rebuild 编排中移出到 factory 模块；主入口只注入像素、颜色、几何和 round 边界。
- native rebuild funnel hub residual：funnel hub 残差 crop 的输出文档/设备 icon、输入 docs/html、screenshots、mock data native shape 重建从主 rebuild 编排中移出到 factory 模块；主入口只注入 round 边界并继续统一处理 page image drop 标记。
- native rebuild table-zone visual shell：table-zone visual atom shell 的对象化判定、grid-line/native-rect atom 投影、命令 pill、语义 node card 和最近文本节点匹配从主 rebuild 编排中移出到 factory 模块；主入口只注入几何、文本 key 和语义节点边界。
- native rebuild table-zone grid/background：table-zone grid line 投影、dense/visual grid 解析结果消费、cell background 采样和颜色块 native shape 重建从主 rebuild 编排中移出到 factory 模块；主入口只注入 grid 推断、颜色采样和 table-zone visual shell 边界。
- native rebuild prototype loop assets：prototype generation loop 的最小图标 fidelity crop 物化、asset path 生成、source reclassify，以及 AI skills 输入碎片/输出栈 native shape helper 从主 rebuild 编排中移出到 factory 模块；主入口只注入安全文件名、裁剪、写 PNG 和 source 分类边界。
- native rebuild sticky sketch residual：sticky note sketch/process screenshot residual crop 的 banner、line、diagonal line、explanation frame、stroke component 分析和 linear ink stats 从主 rebuild 编排中移出到 factory 模块；主入口只注入 PNG 读取、像素/颜色和 asset path 边界，并保留原导出合同。
- native rebuild table-zone semantic text：table-zone 语义节点文本筛选、native text box 生成、host atom 对齐、对比色选择和残差文字擦除写回从主 rebuild 编排中移出到 factory 模块；主入口只注入矩阵文本规范化、语义宿主、安全 box、PNG 擦除/写回和 asset path 边界，并继续把同一语义节点判定注入 table-zone visual shell 复用。
- native rebuild grid/color helpers：visual grid 可用性判定、visual atom grid 推断、grid stroke 归并、table/cell fill 判定、通用 color block extraction 和 inset pt box 从主 rebuild 编排中移出到共享 factory 模块；table-zone、matrix 和 layer color block 路径继续复用同一公共边界。
- native rebuild quadrant dividers：table-zone 四象限 divider 的对象化判定、二乘二文本象限验证、水平/垂直 divider 像素扫描、stroke/厚度/置信度推断和 native line 输出从主 rebuild 编排中移出到 factory 模块；主入口只注入像素、颜色、坐标转换和 round 边界，并保留 `inferQuadrantDividers` 导出合同。
- native rebuild skill-chain overview：AI Skills 工作流链路的全局/页面级候选识别、语义节点补证、stage card、rail、side route、material cloud/document preview、chrome 文案校正和 component metadata 从主 rebuild 编排中移出到 factory 模块；主入口只注入几何、component token、lineBox 和 union 边界，并保留 deferred rebuild 判定所需 helper 导出合同。
- native rebuild product collaboration challenge：碎片化输入/协作断层/盲盒交付页的 native card、callout、warning、zigzag flow、blind-box crop 和文本回填从主 rebuild 编排中移出到 factory 模块；主入口只注入几何、PNG crop、文本归一化、warning primitive 和 product-collaboration 识别/保护边界。
- native rebuild foundation capability network：组织级产品底座/能力卡/业务域仓/上行 backbone connector 和残差清理策略从主 rebuild 编排中移出到 factory 模块；主入口只注入 residual text 覆盖判断和 component token 边界，继续供 stacked architecture 路径复用。
- native rebuild stacked architecture：平台总体架构与四层标准化架构的 layer/front/top/side、箭头、brace、OSS callout、search/wand icon 和 native text 回填从主 rebuild 编排中移出到 factory 模块；主入口只注入 foundation network 子边界、stacked layer 颜色采样、几何和 component token。
- native rebuild document version：库存查询多增量版本治理与文档版本 folder flow 的主文档、版本卡、连接线、左侧手写 sketch fidelity crop、重复残差标记和 fallback 文本补证从主 rebuild 编排中移出到 factory 模块；主入口只注入 IR asset 解析、PNG crop、文本规范化、几何和 residual overlap 边界。
- native rebuild temporary answer workflow matrix：临时问答到专业 AI 工作流对比矩阵的 source crop 标记、header icon fidelity crop、quote 和 native table 生成从主 rebuild 编排中移出到 factory 模块；模块内清理了未被生产路径调用的旧 text-box table fallback helper。

验证证据：

- `node --check` 覆盖每个新增模块及受影响主文件。
- `test/component-template-native-shapes.test.js` 通过。
- `npm run lint` 通过，新增模块均进入统一 lint 入口。
- `node scripts/verify-runtime-package.js` 通过：运行包 1,246 个文件、20 个 workspace package、6 项能力探针通过。
- `node scripts/verify-architecture-budgets.js` 通过。
- `npm run common-tools:architecture-closeout` 通过只读汇总，无配置失败。

当前剩余架构事实：

- `platform-capability-boundary` 与 `skill-production-decoupling` 已 verified。
- `native-engine-core-modularization` 仍 open，因为硬门禁要求 native engine 内所有 JS 文件不超过 1,500 行；当前仍有 1 个超大文件：
  - `packages/slideclone-native-engine/scripts/rebuild-real-pptx-native.js`：17,827 行。
  - `packages/slideclone-native-engine/scripts/lib/component-template-native-shapes.js` 已降至 1,259 行，低于预算线；hub/tree/timeline、视觉图 helper 与输出投影已迁出到独立模块。
- `local-authenticated-acceptance` 与 `production-remote-acceptance` 仍 open，缺真实本机/生产验收 evidence。
- `strict-input-boundaries`、`recovery-and-retention`、`editable-output-quality` 仍 partial，下一步应继续围绕真实生产闭环补证据，而不是把兼容 wrapper 当作剩余主风险。

结论：整体架构方向已经从“历史 skill 大实现”迁出到“插件平台 + native runtime + core/lib 边界”的轨道上。剩余不需要推倒重来，主线是继续把 `rebuild-real-pptx-native.js` 从大入口拆成 composition root + 可测试职责模块，并完成本地/生产 authenticated acceptance evidence。

## 2026-09-09 收口：本地部署入口简化为一条命令、一次密码、自动 smoke

本轮把本机 Docker 部署路径从“用户需要理解 production env、image digest、release evidence、多个服务密码和后续 smoke 命令”收敛为 `.\scripts\team-runtime-local-apply.ps1` 一条入口。默认行为会自动推导本地 Docker URL/端口，Apply 模式提示一次共享本地部署密码，并在 Apply 成功后运行 `team-runtime-local-smoke.ps1` 校验 gateway readiness、OAuth resource metadata、能力 scope 和未授权 MCP challenge。需要本地浏览器登录验收时传 `-EnableIdentityProvider` 启动 Keycloak，自动 smoke 也会随之要求 IdP discovery 通过；需要分开密码时可显式传 `-SeparatePasswords`；只想部署不 smoke 时可显式传 `-SkipSmoke`；Plan 模式使用临时占位 secret 通过 Compose 配置校验，不提示密码、不写入用户环境。

同时，`prepare-production-env.ps1` 已明确提示本地部署不需要 image digest 或 release evidence，避免把严格生产发布文件误用于本地 Docker 验收。`team-runtime-local-deploy.ps1` 的 stateless 容器清理不再依赖固定 worker 列表，而是跟随 `deploymentPlan.workerServices`，继续保留 Compose project、service label 和 volume mount 安全校验，降低 scale 或能力组合变化后出现容器名冲突的概率。

本轮提交：

- `bf1cb67 Improve local deployment recovery guidance`
- `25c4e80 Simplify local deployment secret prompts`
- `a0560c8 Run local smoke after apply`
- `34a1566 Make local apply plan noninteractive`
- `7574c0b Add browser PKCE local job smoke login`
- `df3f5fe Add optional local identity provider deployment`
- `10cf679 Require IdP smoke when enabled locally`
- 本批新增 `team-keycloak-local-test-user.ps1` 和 `team keycloak-local-test-user`，用于本机 Keycloak 准备可登录测试用户与 `common_tools_projects` claim；密码只走交互式安全输入或当前进程环境变量，不放命令行参数、不写仓库、不出现在结果 JSON。
- 本批新增 `team-runtime-local-acceptance.ps1` / `npm run common-tools:team-local-acceptance`，把本地部署、Keycloak、测试用户和 authenticated Job smoke 串成单入口；默认只提示一次共享本地验收密码并在当前进程临时复用，脚本结束后恢复原环境变量。成功时写入 `artifacts/local-acceptance/` 脱敏 JSON 证据，并可用 `npm run common-tools:verify-local-acceptance` 机器复核通过条件和脱敏边界；需要排障时仍可拆成三条子命令。

验证证据：

- PowerShell 脚本语法检查通过。
- `test/common-tools-team-compose.test.js`：24/24 通过。
- 受影响 ESLint 通过。
- `node scripts/verify-runtime-package.js` 通过：运行包 1,180 个文件、20 个 workspace package、6 项能力探针全通过。
- `node scripts/verify-architecture-budgets.js` 与 `node scripts/verify-workspace-boundaries.js` 通过。
- `.\scripts\team-runtime-local-apply.ps1 -Mode Plan -EnableIdentityProvider` 通过 Compose 配置校验且不修改容器，输出 `identityProviderEnabled:true`。
- 当前已运行的本地 gateway smoke 通过，确认 5 个能力 metadata 与未认证 challenge；因现有 Docker 栈未启动 Keycloak，本次只读 smoke 显示 `identityProviderVerified:false`，需要重新 Apply `-EnableIdentityProvider` 后再做浏览器登录 Job smoke。

结论：本地验收链路已经从“工程师式多步排障”明显向“用户只输入密码”的方向收敛。它仍不等同于真正生产发布验收；生产发布仍需要 immutable image digest、release evidence、迁移/备份/回滚和远程认证 Job smoke 证据。

后续增量 `514e86c Add local authenticated job smoke wrapper` 新增 `.\scripts\team-runtime-local-job-smoke.ps1` / `npm run common-tools:team-local-job-smoke`。该入口会自动生成最小 PNG 输入、打包为 team raw-image archive、发现本地 gateway 并调用受保护 MCP 的 authenticated Job smoke。默认仍可通过 `COMMON_TOOLS_JOB_SMOKE_TOKEN` 显式提供 OAuth bearer token；若本地 Keycloak 已运行，也可传 `-Login`，脚本会打开浏览器走 Authorization Code + PKCE S256，loopback 收到 code 后只把 access token 临时放入当前 PowerShell 进程再调用 smoke，不保存、不打印 token。默认不等待 Worker 终态；传 `-Wait` 时，`image-to-editable` 会同时验证 `deck.pptx` artifact target。

## 2026-09-09 收口：历史 skill lib 引用进入尾部兼容治理

本轮在“不再把生产实现放回 skill”的共识下，继续清理测试与小辅助模块对 `skills/pd-hifi-slideclone/scripts/lib` 的直接依赖。已经完成四批提交：

- `d4c7a1d Ratchet additional skill test imports`
- `6dfcb7f Migrate remaining core-backed skill tests`
- `af8b93e Move remaining small skill helpers to core`
- `fe48312 Drop native rebuild test skill imports`

`component-template-source-evidence` 与 `expression-family-normalizer` 已迁入 `packages/slideclone-core`，旧 skill 文件只保留 thin wrapper；`minimum-unit-crop-evidence` 测试改为直接验证 `graphic-crop-policy` 的核心导出。其余已存在 core 落点的测试 import 也已批量切换到 `packages/slideclone-core`。

当前 `config/skill-source-migration-budget.json` 已从本轮前的 170 个引用 / 111 个文件继续降到 63 个引用 / 45 个文件，并保持 decreasing-only。剩余可见测试引用主要是 wrapper 等价性测试、工程门禁覆盖字符串，以及少数用于证明旧路径兼容转发的断言；这些不再表示生产链依赖历史 skill 实现。

本轮验证证据：

- 大批量受影响测试：397/397 通过。
- `test/native-rebuild.test.js`：715/715 通过。
- 小辅助模块回归：13/13 通过。
- `node scripts/verify-skill-source-migration.js` 通过：63 个引用 / 45 个文件。
- `node scripts/verify-skill-lib-wrappers.js` 通过：159 个 skill lib 文件，非 wrapper 实现继续受 50 行上限约束。
- `node scripts/verify-workspace-boundaries.js` 通过：627 个文件、20 个 workspace packages、0 个外部 runtime package import。
- `node scripts/verify-architecture-budgets.js` 通过：838 个文件、5 个 decreasing-only 例外。
- `node scripts/verify-runtime-package.js` 通过：运行包 1,172 个文件、20 个 workspace package、6 项能力探针全通过。

结论：架构主线已经从“迁出生产实现”推进到“尾部兼容治理”。下一步若继续优化，应优先处理真实生产验收证据与 core 内部大模块聚合度，而不是机械删除 wrapper 合同测试。

## 2026-09-09 收口：关系图核心模块开始按拓扑公共层拆分

在 skill 生产依赖收口后，继续处理 `slideclone-core` 内部“大文件只是换位置”的风险。`relationship-native-layouts.js` 中的拓扑节点筛选、连接端点、距离、连通性、安全布局和可忽略拓扑残片判断已抽入 `relationship-topology-helpers.js`，并纳入 `@common-tools/slideclone-core` package exports、隔离包测试复制清单和运行包探针清单。

本轮提交：`b26b1d1 Extract relationship topology helpers`。

验证证据：

- `test/native-rebuild.test.js`：715/715 通过，覆盖实际关系图/拓扑重建调用链。
- `test/engine-core-package.test.js`：6/6 通过，证明隔离安装后的 core 包不会缺新 helper。
- `node scripts/verify-runtime-package.js` 通过：运行包 1,173 个文件、20 个 workspace package、6 项能力探针全通过。
- `node scripts/verify-workspace-boundaries.js` 通过：628 个文件、20 个 workspace package、0 个外部 runtime package import。
- `node scripts/verify-architecture-budgets.js` 通过：839 个文件、5 个 decreasing-only 例外。
- 受影响 ESLint、skill migration 和 skill wrapper 门禁均通过。

结论：core 内部瘦身已从“迁出历史 skill”进入“按可复用子域拆公共层”。后续可沿着同一边界继续拆 branch-card、sankey、venn、timeline 等 relationship shell，优先拆测试覆盖强、输入输出稳定的子域。

## 2026-09-09 收口：关系图 branch-card shell 从大布局模块拆出

在拓扑公共层拆分后，继续沿同一边界把 `relationship-native-layouts.js` 中的 branch-card 流程 shell 抽入 `relationship-branch-card-shell.js`。该模块承接 branch-card 拓扑判定、单侧方向推断、目标排序、branch 曲线测量接入和 shell 对象创建；`relationship-native-layouts.js` 保持既有公开导出，避免上层调用点跟着震荡。

本轮提交：`ef0ca00 Extract branch card relationship shell`。

验证证据：

- `test/native-rebuild.test.js`：715/715 通过，覆盖实际原生重建关系图调用链。
- `test/engine-core-package.test.js`：6/6 通过，证明隔离安装后的 core 包包含新 shell。
- `node scripts/verify-runtime-package.js` 通过：运行包 1,174 个文件、20 个 workspace package、6 项能力探针全通过。
- `node scripts/verify-workspace-boundaries.js` 通过：629 个文件、20 个 workspace package、0 个外部 runtime package import。
- `node scripts/verify-architecture-budgets.js` 通过：840 个文件、5 个 decreasing-only 例外。
- 受影响 ESLint、skill migration 和 skill wrapper 门禁均通过。

结论：`relationship-native-layouts.js` 不再同时承担拓扑公共层和 branch-card shell 两类职责，core 内部正在从“一个巨型算法仓库”收敛为按关系图子域组织的可测模块。剩余优化重点仍是高聚合大模块分层与真实生产验收，而不是删除兼容 wrapper。

## 2026-09-09 收口：Sankey 关系图 shell 独立成子域模块

继续按“关系图子域 shell + 公共 topology/helper 层”的方向，把 `relationship-native-layouts.js` 中的 Sankey 流程图职责抽入 `relationship-sankey-shell.js`。新模块封装 Sankey 节点筛选、band 输入校验、band 与节点端点绑定、方向无环检查和 shape 输出；原布局模块只导入并继续再导出同一 API。

本轮提交：`9302703 Extract relationship sankey shell`。

验证证据：

- `node --check` 覆盖受影响关系图模块。
- 受影响 ESLint 通过。
- `test/native-rebuild.test.js`：715/715 通过。
- `test/engine-core-package.test.js`：6/6 通过。
- `node scripts/verify-runtime-package.js` 通过：运行包 1,175 个文件、20 个 workspace package、6 项能力探针全通过。
- `node scripts/verify-workspace-boundaries.js` 通过：630 个文件、20 个 workspace package、0 个外部 runtime package import。
- `node scripts/verify-architecture-budgets.js` 通过：841 个文件、5 个 decreasing-only 例外。
- skill migration 与 skill wrapper 门禁均通过。

结论：Sankey 不再藏在关系图大布局文件里，后续继续拆 Venn、Timeline、Hub-Spoke、Funnel/Swimlane/Cycle 时可以沿用这个边界，不需要震荡 production worker 或 skill wrapper。

## 2026-09-09 收口：基础关系图 shell 合并拆出

在 Sankey 子域之后，把 Venn、Concentric Circles、Quadrant Matrix、Comparison Matrix 和 Timeline Roadmap 这五类输入输出稳定、无 worker 副作用的基础关系图 shell 合并抽入 `relationship-basic-shells.js`。该模块同时持有这些 shell 专属的 timeline milestone、grid line、cell grid、axis line 和 concentric layer 安全校验 helper；`relationship-native-layouts.js` 保持公开导出但不再承载这些基础结构算法。

本轮提交：`a1bc5f3 Extract basic relationship shells`。

验证证据：

- `node --check` 覆盖受影响关系图模块。
- 受影响 ESLint 通过。
- `test/native-rebuild.test.js`：715/715 通过。
- `test/engine-core-package.test.js`：6/6 通过。
- `node scripts/verify-runtime-package.js` 通过：运行包 1,176 个文件、20 个 workspace package、6 项能力探针全通过。
- `node scripts/verify-workspace-boundaries.js` 通过：631 个文件、20 个 workspace package、0 个外部 runtime package import。
- `node scripts/verify-architecture-budgets.js` 通过：842 个文件、5 个 decreasing-only 例外。
- skill migration 与 skill wrapper 门禁均通过。

结论：关系图大布局模块已连续拆出 topology、branch-card、Sankey 和基础结构 shell，剩余更适合作为后续独立批次处理的是 Hub-Spoke、Funnel Lens、Swimlane/Layered/Cycle、Fishbone/Flow/Tree 等较高耦合组合。

## 2026-09-09 收口：Hub-Spoke 关系图 shell 独立成子域模块

继续把 `relationship-native-layouts.js` 中的 Hub-Spoke 职责抽入 `relationship-hub-spoke-shell.js`。新模块封装 hub/spoke 节点筛选、星型连接度数验证、中心节点识别、径向角度排序和 shape 输出；原布局模块继续再导出同一函数，保证 `relationship-native-shell.js` 等上游无需改动。

本轮提交：`ea9f1dc Extract hub spoke relationship shell`。

验证证据：

- `node --check` 覆盖受影响关系图模块。
- 受影响 ESLint 通过。
- `test/native-rebuild.test.js`：715/715 通过。
- `test/engine-core-package.test.js`：6/6 通过。
- `node scripts/verify-runtime-package.js` 通过：运行包 1,177 个文件、20 个 workspace package、6 项能力探针全通过。
- `node scripts/verify-workspace-boundaries.js` 通过：632 个文件、20 个 workspace package、0 个外部 runtime package import。
- `node scripts/verify-architecture-budgets.js` 通过：843 个文件、5 个 decreasing-only 例外。
- skill migration 与 skill wrapper 门禁均通过。

结论：Hub-Spoke 也已从关系图大布局文件中分离，关系图 core 的剩余拆分重点进一步收窄到 Funnel Lens、Swimlane/Layered/Cycle、Fishbone/Flow/Tree，以及 measured generic/topology shell 的最终归档。

## 2026-09-09 收口：Funnel Lens 关系图 shell 独立成子域模块

继续把 `relationship-native-layouts.js` 中的 Funnel Lens 职责抽入 `relationship-funnel-lens-shell.js`。新模块封装焦点候选选择、输入/内部节点筛选、左右输入侧判定、轴线连接补全、可忽略残片/线段判断和 funnel lens shape 输出；它直接依赖 geometry、shape 和 topology helper 公共层，不再通过大布局模块回流。

本轮提交：`2a11fa6 Extract funnel lens relationship shell`。

验证证据：

- `node --check` 覆盖受影响关系图模块。
- 受影响 ESLint 通过。
- `test/native-rebuild.test.js`：715/715 通过。
- `test/engine-core-package.test.js`：6/6 通过。
- `node scripts/verify-runtime-package.js` 通过：运行包 1,178 个文件、20 个 workspace package、6 项能力探针全通过。
- `node scripts/verify-workspace-boundaries.js` 通过：633 个文件、20 个 workspace package、0 个外部 runtime package import。
- `node scripts/verify-architecture-budgets.js` 通过：844 个文件、5 个 decreasing-only 例外。
- skill migration 与 skill wrapper 门禁均通过。

结论：Funnel Lens 不再滞留在大布局模块中，关系图 core 剩余主要集中到 Swimlane/Layered/Cycle、Fishbone/Flow/Tree，以及 measured generic/topology shell 的进一步拆分。

## 2026-09-09 收口：Swimlane/Layered/Cycle 关系图 shell 独立成子域模块

继续沿“关系图子域 shell + 公共 topology/helper 层”的共识，把 `relationship-native-layouts.js` 中的 Swimlane、Layered Stack 和 Cycle Loop 职责抽入 `relationship-layered-flow-shells.js`。新模块封装泳道行聚类、泳道内连接判定、分层堆栈节点筛选、环形段角度/覆盖率/同父环校验和对应 shape 输出；原布局模块保留公开导出，避免上游 worker 与 native shell 调用点震荡。

本轮提交：`33b24ef Extract layered relationship shells`。

验证证据：

- `node --check` 覆盖受影响关系图模块。
- 受影响 ESLint 通过。
- `test/native-rebuild.test.js`：715/715 通过。
- `test/engine-core-package.test.js`：6/6 通过。
- `node scripts/verify-runtime-package.js` 通过：运行包 1,179 个文件、20 个 workspace package、6 项能力探针全通过。
- `node scripts/verify-workspace-boundaries.js` 通过：634 个文件、20 个 workspace package、0 个外部 runtime package import。
- `node scripts/verify-architecture-budgets.js` 通过：845 个文件、5 个 decreasing-only 例外。
- skill migration 与 skill wrapper 门禁均通过。

结论：`relationship-native-layouts.js` 已降到约 270 行，剩余 measured generic/topology、Fishbone、Flow/Tree 更像最后的轻量聚合层，而不是此前的历史大引擎本体。后续继续拆分应按收益排序，优先补生产验收证据和部署/运行易用性，再考虑把最后几类 shell 做归档式收口。

## 2026-09-09 收口：远程 Job 验收新增显式认证 smoke

本轮新增 `common-tools:team-authenticated-job-smoke`，用于补齐“受保护远程 MCP 真实 Job 路径”的发布验收入口。它不会绕过 OAuth，也不会默认伪装成快 smoke：调用方必须提供 bearer token 和一个真实能力输入文件；脚本会连接 `/mcp`，执行 `initialize`、`tools/list`、`create_team_upload_target`，上传输入文件，再调用 `create_team_job`。传入 `--wait` 时会继续轮询 `get_team_job`，作业成功后可用 `--artifact-name` 验证 `get_team_artifact_target`。

默认边界只允许本机 `http://127.0.0.1:<port>` gateway；远程环境必须显式传 `--allow-remote`，且 gateway/upload URL 必须为 HTTPS。token 只从环境变量读取，报告只输出能力、项目、输入大小、Job ID 和状态，不输出 token、signed URL 或上传内容。

本地示例：

```powershell
$env:COMMON_TOOLS_JOB_SMOKE_TOKEN = '<bearer-token>'
npm run common-tools:team-authenticated-job-smoke -- --input-file .\path\to\input.tar.gz --capability image-to-editable --wait --artifact-name deck.pptx
```

如果只想验证认证、上传和入队，不等待 Worker 终态，可去掉 `--wait`。该 smoke 证明的是“当前已认证 MCP + 对象存储上传 + Job admission/queue 路径”可用；它不替代能力自身的视觉质量验收、Office 编辑验收或生产迁移/回滚演练。

## 2026-09-08 收口：图片/PPT 生产链不再依赖历史 skill 根实现

本轮已按小批次提交完成 `skills/pd-hifi-slideclone/scripts/*.js` 根入口的迁移：真实实现统一进入 `packages/slideclone-native-engine/scripts`，skill 根入口只保留兼容 wrapper。`review-studio` 的静态 UI 资源也一并迁入 native engine payload，避免出现“入口在包内、资源仍在 skill 内”的半迁移状态。

当前架构图：

```mermaid
flowchart TD
  User[Codex / ChatGPT 用户请求] --> MCP[Common Tools MCP / plugin entry]
  MCP --> Registry[capability registry + signed manifests]
  Registry --> Local[local job capabilities]
  Registry --> Direct[direct remote capabilities]
  Local --> Worker[slideclone-worker-adapter]
  Worker --> Native[@common-tools/slideclone-native-engine]
  Native --> Core[@common-tools/slideclone-core]
  Native --> OOXML[@common-tools/ooxml-core]
  Native --> Payload[native engine runtime payload]
  Payload --> Production[production entrypoints]
  Payload --> Quality[rendering / quality harness]
  Payload --> Acquisition[component acquisition tools]
  Native --> UI[review-studio UI contribution]
  Skills[pd-hifi-slideclone skill] --> Wrappers[thin compatibility wrappers]
  Wrappers --> Native
```

本轮新增提交：

- `b548b2d Move blind layer reporting into native engine`
- `32196ba Move remaining repair gates into native engine`
- `819cdc0 Move review UI entrypoints into native engine`
- `e0cc86e Route slideclone profiles directly to native engine`
- `c8e44e8 Move remaining profile scripts into native engine`
- `6a40129 Gate skill root scripts as native wrappers`

当前验证证据：

- `skills/pd-hifi-slideclone/scripts/*.js` 根入口已由 `verify-skill-source-migration` 强制保持为薄 native-engine wrapper。
- `npm run lint` 通过：627 个 JS 文件，profile、architecture budget、runtime payload、workspace boundary、skill migration、skill lib wrapper 门禁均通过。
- `node scripts/verify-runtime-package.js` 通过：运行包 1,159 个文件、6 项能力探针全通过。
- `node scripts/native-engine-runtime-payload.js` 通过：86 个 root scripts，3 个脚本组，4 个 payload 目录。
- `node scripts/verify-slideclone-profiles.js` 通过：150 个 profiles，150 个全部直达 native engine。
- `config/skill-source-migration-budget.json` 已降到 191 个引用 / 131 个文件，保持 decreasing-only。

结论：截图里提到的 P1 问题，即“图片转 PPT 的生产链仍依赖历史 skill 实现”，在根入口和 profile 路由层面已经解决：生产/质量/修复/UI 入口均迁入 native engine package，`slideclone:*` profile 也不再经 skill wrapper 执行。剩余 `skills/pd-hifi-slideclone/scripts/lib` 下的兼容引用和测试断言仍按预算治理；它们不等同于根生产入口继续住在 skill。更大的 A–F 产品验收仍包含远程上传/创建、独立 PDF、线上 OCR 和实际 Office 质量闭环，不能用本轮架构收口替代。

## 2026-09-09 收口：打包运行时的 PPT 创建不再依赖 skill 文件

本轮进一步验证并修复了“生成不依赖 skill”的打包交付边界：`ppt-create` 的 CLI composition root 不再把 OpenXML builder 定位到 `skills/pd-hifi-slideclone`，而是显式使用 `packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder`。`remote plugin bundle ships a verified local runtime payload` 集成测试会生成 Codex remote plugin bundle，在打包出的 `local-runtime` 内启用 `ppt-create`，再用 fixture LibreOffice 实际运行 `common-tools ppt create` 并检查生成的 `deck.pptx` 页数和可编辑形状；该测试已通过，证明打包运行时不需要历史 skill Python 脚本也能创建 PPTX。

同时补齐了三类架构门禁一致性：capability manifest 对 direct 与 deployed capability 的类型边界显式窄化；project-audit 插件内嵌 Runtime 镜像同步主仓库 manifest 边界；原生重建测试不再检查 skill wrapper 内部实现，而是检查 `packages/slideclone-native-engine/scripts/rebuild-real-pptx-native.js` 中的 registry/orchestrator 注册点，避免测试把业务逻辑拉回 skill 层。

最新完整 `npm run verify:ci` 退出码为 0，已实际执行 lint、typecheck、capability/plugin/observability/ADR 门禁、.NET restore/build、unit、contract、integration、Python lock dry-run 和 runtime package verifier。运行包探针结果：1,161 个文件、20 个 workspace package、6 项能力，`pptCreateLayoutCandidates`、`pptCreatePlanning`、`pptCreateEnhancements` 和 production acceptance plan 探针均通过。生产 Secret 未出现在当前任务环境，因此这不替代真实生产 preflight、migration-status、remote acceptance evidence 或候选 Worker 切换验收。

## 通用插件架构五项整改

本轮面向“通用插件项目”的架构图与合理性评估见 [通用插件项目架构图与合理性评估](general-plugin-architecture.md)。五项整改已经按小批次提交：生产 SlideClone 依赖移出 skill 树、图片重建改走 `@common-tools/slideclone-native-engine` 包内 native engine payload 且不再保留顶层 `runtime/slideclone-native-engine` 或旧式兼容入口、能力注册表落地、local 执行支持由 capability manifest 派生、图片转 PPT 的 worker/归档/归一化/质量渲染/OCR checkpoint 编排移入 `@common-tools/slideclone-worker-adapter`、archive/OOXML/artifact 共享基础包抽出、质量报告 UI contribution 归属到 `ppt-quality-core`、分发和镜像策略收口。后续架构增强已继续落地：`capability-registry` 改为 capability module 聚合，local/direct catalog 由签名 capability manifest 的 `moduleSource` 通过 `scripts/generate-capability-catalogs.js` 生成，并在 `common-tools:verify-capabilities` 中检查；MCP Apps 从 registry 读取能力 UI contribution，且 registry 加载时会对齐签名 manifest 的 capability、toolNames、runtime range 和 worker profile，并要求每个非 direct manifest 都有本地 module；各本地 Job 能力包现在直接导出自己的 `CAPABILITY_MODULE`，registry 只负责聚合、冻结和校验，不再在中心文件里手写每个能力的创建/报告/UI 装配；`siyuan-note-core` 作为 direct remote 能力导出 `REMOTE_CAPABILITY_MODULE`，remote MCP 通过 direct capability catalog 读取 capability、toolNames、参数键、服务 owner、方法映射与 MCP tool contract，并校验合同齐全；`verify-capability-catalogs` 已接入 `common-tools:verify-capabilities`，统一校验 local/direct catalog 与签名 manifest、registry 直接依赖和 direct tool contract 的一致性；`capability-manifests` 成为签名能力目录的代码级事实源，直接导出 manifest 读取、版本范围、依赖图、弃用窗口和 hash 校验，`capability-runtime` 不再承载 manifest 解析规则；本地/团队 MCP tool contracts 共享 `capability-contracts` 中的 Job schema 与 annotations，并通过 `defineMcpToolContract`/`defineMcpObjectSchema` 统一合同创建与校验入口；workspace layer policy 抽为 `config/layer-policy.json`；精确 sibling package dependency policy 抽为 `config/workspace-package-policy.json`，边界 verifier 会阻止未登记包、未知包和多余 workspace 依赖；remote MCP 的环境配置解析已从 `index.js` 抽到 `remote-config.js`，入口继续向 composition root 收敛；`skills/pd-hifi-slideclone/scripts` 引用进入 decreasing-only 迁移预算；PPTX ZIP/Inventory 通用工具迁入 `ooxml-core`，遗留引用预算从 441/273 降到 418/266。旧 A–F 文档仍代表更大的产品验收范围，不能与本轮五项架构整改混为同一个完成口径。

## 最近合并验收：交接边界组

证据：`.codex-tmp/handoff-consolidated-ci-evidence.json`。完整 CI 前 11 个阶段通过，最后的运行包探针因查找旧文件中的常量而失败；修正探针并增加真实通过/绕过失败回归后，13 项探针测试、受影响 ESLint 与打包安装复测通过。运行包 794 文件、6 项能力探针通过。此为组合验收证据，不能表述为单次完整 CI 全绿。

1,233 个工程输入的文件集合一致；前后只有打包验证器及其测试两处修改，生产代码指纹未变。保留 1 项原有 Windows 跳过。最近真实本地 Worker 仍为 XWridH，其运行早于后续规范化/Job/队列改动；PDF、远程和新的 Office 验收未完成。

下一组按 `.codex-tmp/native-registry-group-plan.json` 整组处理注册器及六个重建实现；剩余 OCR/重建元数据和启动配置契约也仍在 B/C 范围内。

本次后续增量：生产共用 Deck IR 准入和纯重建契约验证已进入严格检查；类型、Lint、相关 Worker/契约回归、OpenXML 集成和运行包检查通过。见 `.codex-tmp/deck-ir-admission-delivery-evidence.json`。以下最近完整 CI 仍是变更前基线，不能视为本次增量的完整 CI；归档选择和其他阶段交接尚待完成。

本页只保留当前结论。完整范围以[原实施计划](architecture-improvement-plan.md)的 A–F 为准，历史过程见[交付记录](architecture-delivery-batches.md)。整体尚未完成。

| 项目 | 已有证据 | 完成前还需要什么 |
| --- | --- | --- |
| A 工程预算 | 预算及增量门禁持续通过；architecture budget 不再把 skill 分发镜像或 native engine payload 当作普通核心源码治理对象；native engine payload manifest 已接入 lint 链路，历史 Skill 脚本引用另有 decreasing-only 预算，防止迁移中反弹 | 后续每迁出一组历史引用即同步降低 `config/skill-source-migration-budget.json` |
| B 核心引擎拆分 | 页面阶段、构建、文字策略及多组重建职责已进入核心包；生产 Worker 不再依赖 skill 脚本或旧式兼容入口，改经 `slideclone-native-engine` package 入口加载包内 native engine payload；payload 根脚本已分为 production entrypoints、rendering/quality harness 和 component acquisition tools 三组；图片 worker 编排已从 `slideclone-core` 移到 `slideclone-worker-adapter`，core 不再直接依赖 `team-runtime`；通用 PPTX ZIP/Inventory 已进入 `ooxml-core` | 若继续追求引擎内部瘦身，应优先从 component acquisition tools 入手，再按能力面迁移，而不是让历史大文件重新进入核心包或 production adapter |
| C 类型和输入边界 | Job、OCR、Worker 配置及多项 Deck IR/模板/图表准入已纳入严格类型与回归；工具平台重建及 Deck IR 数据属性/头部边界已补齐 | 完整 Deck IR 和剩余核心边界尚未证明覆盖完整；逐项补足，不能用全量测试通过代替覆盖证明 |
| D 远程交付 | 本地工具和发布/验收能力已有实现；后续实际核对显示候选图片 Worker 曾可创建远程 PDF 作业，但因生产数据库尚未应用 010/011 delivery schema 迁移而失败并回滚；production preflight 已新增必需迁移文件门禁，Plan 输出会显式列出 schemaMigrations 和 preApplyChecklist；`common-tools team migration-status` 可在同一生产环境只读查看已应用/待应用/漂移/缺失的 migration；生产只读诊断、验收命令和受控发布脚本已统一支持通过仓库外受保护 env 文件显式加载生产 `COMMON_TOOLS_*` 配置；`common-tools team production-acceptance-plan` 与 `common-tools team production-acceptance-evidence --out <dir>` 已提供脱敏验收计划和只读证据归档入口；npm scripts 已覆盖 production preflight、migration status 和 acceptance evidence，运行包安装探针也覆盖关键入口；真实隔离 PostgreSQL 恢复测试已验证 001→011 migration、delivery intent 与 Redis 丢失后的恢复链路 | 将生产 Secret 注入同一目标环境后运行 acceptance evidence；受控执行生产迁移并重新切换候选 Worker 后，完成两条真实流程、版本绑定、授权负例和回滚验证 |
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
