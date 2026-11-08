# 原生引擎独立安装加载修复

真实独立安装已复现：归档包含目标模块，但原生引擎按开发工作区的 `@common-tools/slideclone-core` 别名加载，安装后的嵌入目录没有该别名，因此默认引擎冷加载返回 `MODULE_NOT_FOUND`。本轮已修复这条解析路径；无内部工作区别名的 Linux 实际消费、真实截图冻结回放和 Release PPTX 写入均通过，输出保持。整页产品仍为 11 条关系、9/12 完整区域，没有激活共享 Worker。

证据：[本轮索引](../.codex-temp/native-engine-installed-resolution-20261023-v1/README.md)。

## 问题与变更

旧包真实安装在仓库外独立 host，使用 `common-tools@file:`、offline、ignore-scripts、omit dev、workspaces false，并校验安装锁中的归档 SHA-512。安装成功约 79.2 秒后，实际 `loadNativeImageRebuilder()` 缺失 `@common-tools/slideclone-core/archetypes/cover-graphic-rules`。目标文件实际存在；[旧包失败结果](../.codex-temp/native-engine-installed-resolution-20261023-v1/result.json)保留原始结论。

旧的安装消费探针注入了 `loadImplementation`，没有验证默认真实引擎冷加载。前轮 Linux v4 人工建立内部链接后通过，也不能证明独立 tar 安装会自动生成链接。本轮将这两个证据缺口落实为代码修复及统一 CI 的真实消费断言。

- 引擎 80 个文件、178 处 Core 导入通过 Node 标准 `createRequire`，锚定实际 sibling Core manifest，再使用 Core 的公开自引用 exports。没有新增内部符号链接、环境路径、全局 loader 或旧服务目录回退。
- [迁入记录](../.codex-temp/native-engine-installed-resolution-20261023-v1/migration.json)逐文件绑定前后摘要。完整 AST 比较确认解析绑定和调用名称之外的业务逻辑不变，公共模块目标与原工作区相同，避免同一私有凭据或 WeakMap 获得两个实例。
- 边界分析器继续检查这种局部 loader 的导入，动态/空/多参数调用仍被记录为非法；同名参数和普通 factory 不误判。原直接依赖与层次规则保持。
- Worker 安装消费者增加实际默认原生引擎冷加载，再运行原确定性 fixture 和原断言，60 秒期限不变。
- 本轮只改变入口导入解析，未增加业务逻辑；原有超长入口仍受递减预算约束。主重建入口架构字节预算仅下调到 181974，没有提高行数、导入或其他上限。

## 回归与隔离验证

新增 `native-engine-installed-loading.test.js` 与 `scoped-core-import-boundaries.test.js`，均进入统一 unit discovery。前者在仓库外独立目录加载真实引擎，覆盖无链接、同一模块实例、恶意环境别名不执行、缺失 sibling manifest 必须失败；后者覆盖静态、动态、空、多参数和作用域遮蔽。

修复前红结果见 [regression-before.log](../.codex-temp/native-engine-installed-resolution-20261023-v1/regression-before.log)。修复后六个定向文件共 45/45 项通过，原架构门禁 2286 文件、7 项递减例外通过。[本轮冻结输入](../.codex-temp/native-engine-installed-resolution-20261023-v1/engineering-inputs-v1.json)共 2492 项；相对上轮完整 CI 恰好 83 项预期改变、2 个新增测试、0 删除，发现 814 unit、34 contract、94 integration 文件。

额外将非缓存 ESLint 扩大到本轮全部 82 个 JS 源码文件时，旧主入口报告原有 705 errors，其余 81 个文件无诊断。前后完整诊断签名及重数一致，0 新增或消除；位置因导入文本变化不参与比对，业务 AST 等价独立验证。原 CI 配置范围的 Lint 已通过；[扩展检查失败](../.codex-temp/native-engine-installed-resolution-20261023-v1/changed-source-lint.json)仍保留，[前后比较](../.codex-temp/native-engine-installed-resolution-20261023-v1/expanded-lint-comparison.json)仅证明存量保持，不将扩展检查称为全绿，也未改变规则、baseline 或豁免。

| Linux 检查 | 结果 |
| --- | --- |
| 输入与隔离 | 基于前轮无链接镜像，只叠加 80 个解析文件、更新 Worker 探针和验证 runner；断网、只读根、非 root、清空环境、无公开端口 |
| 实际文件绑定 | 1890 包文件、13 冻结输入、6138 第三方依赖、6 Release 文件及回放脚本摘要通过；明确断言内部 `@common-tools` 别名目录不存在 |
| 模块来源 | guard 禁止解析 `/candidate` 外的文件模块，不能使用基础镜像 `/app` 的旧源码 |
| 三个消费者 | Worker / program / shared 严格 ready，约 5.400 / 7.364 / 13.614 秒；原 60 / 60 / 120 秒期限不变 |
| 实际主链回放 | auto / reroutable-elbow 约 39.007 / 40.611 秒，均为 11 条关系、9/12 区域，模型调用 0 |
| 完整 Deck 与报告 | 每模式 30/30 资产字节相同后，仅归一化随机资产路径的完整 Deck 相同；scope 仅去时长后相同 |
| 实际 Linux writer | 每个 PPTX ZIP 条目内容与 Windows 相同，包含 slide XML 和各 30 项媒体 |
| 原生路径 | 共享物理边 24/29；n201 的 2/0 个 cubic、6 个渐变色标、圆端帽和模式绑定保持 |
| 清理与共享服务 | 临时容器移除，本地镜像保留；共享 Worker ID、镜像、启动时间、运行状态与重启次数前后相同 |

对应 [完整比较](../.codex-temp/native-engine-installed-resolution-20261023-v1/comparison.json)、[PPTX 条目比较](../.codex-temp/native-engine-installed-resolution-20261023-v1/pptx-comparison.json)和 [Linux 结果](../.codex-temp/native-engine-installed-resolution-20261023-v1/output/result.json)。本轮完整 CI v1 退出 1：负对照 fixture 没有计入新增的真实引擎冷加载阶段。该 fixture 已修复且原失败断言保留；v1 失败结果继续保留。v2 封存2492项工程输入，814 unit和34 contract通过；94 integration文件全部执行，但 `worker-budget-runner.test.js` 中并发短任务预算与真实进程树终止两项失败，v2耗时3792839ms、退出1。Python lock和新包安装消费未执行，不能标为完整CI通过。后续诊断修复另存 `worker-budget-determinism-20261023-v1/`；旧CI及输入保持。上轮2490输入的CI不证明本轮改动。

## 产品边界

本轮证明安装解析修复及输出保持，不增加完整区域，也没有新 OCR/VLM、队列作业、共享 Worker 激活或 Office 编辑验收。保留 11 条关系、9/12 区域、strict/path semantic 与 native-component 失败。

三个浅色虚线外框 n4/n6/n8 的完整源证明、n107/n111/n119 的整卡绘制归属与分组、填充关系的路径编辑能力和大残差谱系仍待解决。完整 CI 运行期间，用户已明确同意外框依据可见边段拟合近似并保留严格结果；后续候选在独立 `approved-approx-frames-20261023-v1/` 目录推进，不属于本轮冻结代码或 Linux 等价结论，不将拟合当作完整像素证明。新附件与原冻结图的相等结论沿用已封存的全像素比较，本轮没有重复 OCR 或重签源证明。
