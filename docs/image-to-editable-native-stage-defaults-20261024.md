# 原生连线路由阶段的默认值遗漏修复

2026-10-24。承接 [默认值统一](image-to-editable-native-default-unification-20261023.md) 和 [完整卡片端口诊断](image-to-editable-native-card-group-ports-20261024.md)。本轮仅修复代码入口的策略回退；不将旧版单轮廓移动验收扩展为整卡编辑通过。

## 额外发现与修复

核心 parser 已默认返回 `reroutable-elbow`，但 `compileExistingSceneRoutes` 和 `compileSharedSceneRoutes` 的参数解构仍各自默认 `auto`。直接调用这些阶段，或经关系 fallback 调用单线阶段且省略模式时，会绕过核心原生默认值。完整场景入口一直显式传入已解析模式；不能将这个遗漏归因为用户某个具体文件的唯一来源。

两阶段改为首先调用同一个 `parseConnectorCornerMode`，在扫描源图和空计划提前返回之前校验模式。内部 `compileMeasuredScene` 删除独立 `auto` 默认，并在类型中要求入口提供已解析模式。显式视觉模式保持，非法模式继续拒绝，没有提高预算、关闭规则或扩大批准近似范围。

新增 `source-scene-route-stage-defaults.test.js` 使用实际源测量和编译器复现缺省回退。覆盖单线及 fallback 的渐变、反向、分段描边、双端绑定，共享网络的完整阶段消费，显式视觉模式，空输入、缺失端点，以及非法、超长和不可执行的恶意模式对象。由统一 unit/all 入口发现。

## 验证证据

- [修复前记录](../.codex-temp/native-stage-defaults-20261024-v1/before.tap)：6 项中的 3 项失败，分别复现默认输出变化、共享阶段传入 `auto`、空计划未拒绝非法模式。记录保留。
- [修复后定向回归](../.codex-temp/native-stage-defaults-20261024-v1/after-v2.tap)：6/6。首次修复后测试把分段原生线误要求为单个 elbow 的标记；该失败也保留，最终检查真实 line 类型、全段端点和完整输出等价。
- [路由回归](../.codex-temp/native-stage-defaults-20261024-v1/routing-verified-result.json)：统一 unit 发现的 77 文件、403/403，退出 0、无跳过；含上述 6 项，不重复相加。
- [OpenXML 契约](../.codex-temp/native-stage-defaults-20261024-v1/contracts-v2.tap)：13/13。首轮旧断言要求每条自由路径都含 `lnTo`，但真实路径有全部由 cubic 构成的合法分支。新断言逐条核对全部路径命令及 writer 舍入后的控制点，并补坐标篡改、错误命令、丢失命令及闭合路径反例。首轮失败记录保留，没有通过跳过检查获取通过结果。
- 两套 TypeScript、全量 Lint、最终五个文件定向 ESLint 和架构预算均终态退出 0。已有 7 项递减预算例外保持。本轮没有依赖或 C# 源码变更，未重跑完整 `verify:ci`、依赖审计或锁定 .NET build。

本阶段实际打包与隔离安装已收终态：[closeout](../.codex-temp/native-stage-defaults-20261024-v1/closeout.json) 保留首次安装超时及同一超时设置下的重试通过。该包打包时间早于后续卡片分组修复，不能代表后续最终源码的安装验收。

## 同源真实回放与原生基线

[真实 raw 回放](../.codex-temp/native-stage-defaults-replay-20261024-v1/capture-result.json) 在 rebuilder 调用中省略 `connectorCornerMode`，使用冻结 OCR、计划及原有 n4/n6/n8、n10 批准范围。3068 项输入在执行前后摘要一致，没有 OCR/VLM 调用和共享服务作业。

[完整绘制比较](../.codex-temp/native-stage-defaults-replay-20261024-v1/default-replay-verification.json) 确认形状、文字、图片放置和实际资产字节与显式原生基线相等。两张共享网络仍为 `reroutable-elbow`，下层共享闭环保留。

实际生产 writer 生成 [current-native.pptx](../.codex-temp/native-stage-defaults-replay-20261024-v1/office-static/current-native.pptx)，[独立 XML 核查](../.codex-temp/native-stage-defaults-replay-20261024-v1/office-static/writer-verification.json) 确认 44 个共享原生连接器及 88 个有效端点引用。正式 n10 基线和先前 current 文件未替换。新版尚无 Office 拖动验收。

输入快照的“执行前后未变”仅覆盖回放执行期；之后仅修改了 OpenXML 契约测试。最终源码及测试身份由本轮 closeout 独立绑定，不追改历史输入快照。

## 未完成的边界

当前仍为 11 条已接纳关系、严格区域 9/12，严格 semantic/native-component 门禁失败。同一 `relation-regional-0-0` 仍有两层固定填充轮廓；这两层没有取得原生跟随验收，不能称为共享闭环回退。36 个混合接触点、完整业务卡片分组、旧位置残影和整页最终图层验收仍未完成。

[共享 Worker 只读复核](../.codex-temp/native-stage-defaults-20261024-v1/runtime-version.json) 确认仍运行 10 月 19 日启动的旧镜像，当前核心模式模块不可用、Worker 源摘要与本地不一致。本地修复尚未激活到该服务。核查前后容器身份、启动时间及重启次数未变，没有部署或重启。

本阶段读取 PowerPoint 状态时，Windows 安全中心的 Node.js 网络访问权限请求曾阻止操作，未通过其他自动化通道绕过。用户随后明确回复已处理；后续已完成诊断卡片组平移、缩放、保存和重开的验证，并修复顶层连接器端点卡片被过度解组的问题，见[后续终态记录](image-to-editable-root-connector-card-groups-20261024.md)。这不等于真实整页的拖动验收通过。用户随后以 Esc 停止桌面操作，当前继续暂停桌面输入。

目标保持未完成；本轮无提交、推送或发布。
