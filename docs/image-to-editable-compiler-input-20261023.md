# 场景编译输入校验修复

2026-10-23 UTC。完整 CI v7 在 unit 阶段退出 1，两项已有安全回归失败：清单修订接入在 descriptor 校验前展开输入，执行了 `surfaceSelection` / `spatialExterior` getter。该次运行的 2449 个绑定保持不变，原日志和失败终态保留；contract、integration、Python lock、安装消费未运行，不能算完整通过。

正式编译现在先校验全部顶层属性描述符和原控制选项，再展开输入、取得有效清单并读取源文件。预检入口也在展开前校验。新回归进一步发现共用 `record` 仅检查字符串属性，已改为检查全部自有键，覆盖隐藏属性与 Symbol getter；普通及 null-prototype 数据继续兼容。错误保留固定安全文本，不执行 provider getter 或 Proxy trap。

[本轮证据](../.codex-temp/compiler-input-boundary-20261023-v1/README.md)包含先红后绿记录。新增两文件共十项回归，最终明确核对存在的 **24 文件、254 项** 全通过，零跳过；定向 ESLint、原架构预算检查通过。测试覆盖非法记录、getter/setter、隐藏/Symbol 属性、撤销及多 trap Proxy、非法控制项、读取源文件前失败，以及失败输入不能消耗可信清单修订凭据；正常预检和正式编译仍使用修订清单。新测试经实际发现确认进入原 unit/all 入口。

新的[正常冻结回放](../.codex-temp/inventory-supersession-20261022-v1/raw-replay-compiler-input-v6/comparison.json)保持 **11 条关系、9/12 完整区域、195 形状、69 文字、30 图像**；31 项引用绘制资产逐字节相同。两个临时资产路径仅在严格身份、格式和完整字节核对后映射比较，没有忽略其他变化。源像素扫描 1566048，旧观察 12、n200 及历史账本保留。未增加模型或 Office 请求。

修复后的[完整 CI v8](../.codex-temp/goal-engineering-verification-20261023-v8/README.md)已通过，原命令和时限保留；共 **927 文件**（800 unit、33 contract、94 integration）、11 个分片全部成功，运行 1915675ms，**2451 项绑定未变**。Lint、两套类型、配置、安全审计、锁定 Release 构建、Python 锁校验及实际运行包安装消费全部完成，独立 `verified.json` 再次核对阶段、分片、当前发现结果及摘要。实际归档 3919987 bytes、1862 文件，20 个包、六类能力和生产依赖闭包通过。旧 v7 失败原样保留，不能用工程通过代替产品验收。

这次修复没有新增区域、PPTX、Office 编辑证明、部署或共享 Worker 激活。三个外框、填充关系编辑与大栅格谱系仍未解决；两种语义和原生组件门禁仍失败，整页产品目标保持未完成。
