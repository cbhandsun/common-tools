# 原生连接器默认值统一与回退风险修复

2026-10-23。针对“原生连线此前已经通过，为何又回退”的追查，承接[有效基线](image-to-editable-native-baseline-status-20261023.md)与[当前回放](image-to-editable-native-replay-repair-20261023.md)。

## 根因及修改

正式基线没有被圆角候选覆盖。但代码存在真实入口差异：Worker 配置默认是 `reroutable-elbow`，核心 `parseConnectorCornerMode(undefined)` 却返回 `auto`。直接调用核心编译器或 raw rebuilder 且省略模式时，仍可能生成不能随业务节点移动的自由路径。此前圆角矢量可编辑、原生连接器跟随、完整组件编辑的验收范围也被混在一起汇报。

本轮将核心 parser 的未配置默认值统一为 `reroutable-elbow`。单关系、共享网络、整页编译和 raw rebuilder 都消费这个 parser。显式 `auto` / `rounded-freeform` 保持原行为，非法输入继续拒绝。没有修改预算、批准范围或质量门槛。

不能据此推断用户某个具体文件来自哪个入口；需要该文件及作业记录才能归因。此前通过的原生基线也不因此失效。

## 防退化回归与工程检查

- 单关系：省略模式和显式 `undefined` 的完整输出都与显式原生模式相等，保留双端锚点、方向和渐变，包括分段渐变。
- 共享闭环：读取真实 Worker 默认配置，并覆盖省略模式、显式 `undefined`；注入必抛错的圆角编译器，断言原生路径完全不调用它，保留全部分支和绑定。
- 整页入口：默认输出原生连接器，并绑定到实际 `scene-container-object-*` 节点。圆角测试显式选择策略。
- [最终路由测试](../.codex-temp/native-default-unification-20261023-v1/routing-verified-result.json)：统一 unit 发现的 75 个文件，389/389 通过，0 skip，终态退出码 0。直接受影响的 28 项与其重叠，不相加。
- 两套 TypeScript 检查、全量 Lint、修复文件定向 ESLint 均通过。已有 7 项递减预算例外保持，没有提高 baseline。

本轮没有重跑完整 `verify:ci`、依赖安全审计或锁定 .NET 构建；没有依赖与 C# 修改。没有提交、推送或部署。

## 真实原图的默认入口回放

[本轮回放](../.codex-temp/native-default-raw-replay-20261023-v1/default-replay-verification.json)在 raw rebuilder 调用处完全省略 `connectorCornerMode`，使用原始截图及冻结 OCR、计划、已批准外框和 n10 底色范围。没有新增模型请求，也没有提交共享服务作业。

回放终态退出 0；3065 项绑定输入在执行前后摘要一致。两张共享网络的实际编译模式均为 `reroutable-elbow`。逐项核对当前默认输出与上一轮显式原生输出：全部 235 个形状、69 个文字对象、30 个图片对象及图片实际字节相等；图片路径仅在验证根目录包含关系和资产字节后规范化。44 个共享连接器的完整几何、渐变和 88 个 IR 端点绑定保持。

随后调用实际生产 writer，独立核对新 PPT 的 44 个共享 `<p:cxnSp>` 和 88 个有效 XML 端点绑定。[writer 结果](../.codex-temp/native-default-raw-replay-20261023-v1/office-static/writer-verification.json)退出 0。新文件仅作为默认入口验证产物，没有替换正式基线，尚未做这份新文件的 Office 拖动或像素验收。

仍为 11 条已接纳关系、严格区域 9/12，严格 semantic/native-component 结果仍失败。这是默认策略修复的端到端冻结输入证据，不是全新 OCR/VLM 或共享服务验收。

## 真实 Office 验证的范围与失败

对当前 v2 PPT 创建独立副本后进行拖动、保存、关闭和重开。独立读取[保存包结果](../.codex-temp/native-default-unification-20261023-v1/motion-verification.json)，44 个共享 `<p:cxnSp>`、88 个有效端点绑定及其描边身份保留，对象属性总数为 440，图片变换未变。

但六次拖动中，五次选中了外观层：`n112/n119/n120` 的 container，以及 `n111/n118` 的 paint。实际绑定的 outline 未移动，不能算作跟随通过。这暴露了外观层与锚定轮廓分离导致的直接拖卡体验缺口。只有按选择窗格定位的 `scene-container-object-n110` 实际移动，其共享连线端点同步移动，保存 XML 的差值为 1 EMU。另一条 regional 连接的原有轴向最小宽度带来约 0.1pt 差值，未计作精确跟随通过。

随后创建干净副本，准备按名称重试六端点。控制工具先后出现 `get_window_state` 超时、两次 `list_windows` 超时；重置 JavaScript 会话并重新初始化后仍然超时，按工具恢复要求停止 UI 输入。干净副本摘要仍与原文件相同，未移动。两个诊断窗口可能仍打开。

因此本轮新验证为 1 个实际移动的共享端点，完整六端点复验及整卡移动均未通过。此前同一原生实现的历史 6/6 结果单独保留，不替代本轮结果。错误选择、重试副本和失败证据均保留，没有覆盖正式原件。

## 产物与运行边界

- 正式 [n10-approved-native.pptx](../.codex-temp/n10-approved-background-20261023-v1/office-static/n10-approved-native.pptx) 的摘要仍为 `c10d59e538322276aa1c8b8c4f5a067e553720997218fd6acd3801dcb601ae1c`。
- 当前 [current-native.pptx](../.codex-temp/native-baseline-replay-repair-20261023-v2/office-static/current-native.pptx) 的摘要仍为 `0304973b1cd44906eeaac0eb581c6fabb58f08d2315cfe3622a7f94040094032`。
- 本轮未核查或更新共享容器。上次只读核查发现旧镜像，不能描述为本轮源码已经对共享服务生效。
- 完整组件编辑、剩余固定关系绘制体、混合接触点、大栅格谱系以及共享服务真实作业验收仍未完成。目标保持 active。

后续任何候选替换这份基线，都必须在同一产物上重新验证连线跟随；自由路径候选不能继承原生连接器的验收结果。

## 安装包消费与当前结构复核

后续[注册图层观察轮次](image-to-editable-registered-route-context-20261023.md)修正了旧安装消费探针对默认自由路径的要求。最终 8/8 消费回归通过，包含将未配置核心强制退回 `auto` 的负对照；实际打包、隔离安装及全部消费探针终态退出 0。当前真实 raw 产物再次独立核对 44 个共享原生连接器、88 个有效 XML 端点引用及闭环路径，正式 n10 基线和当前 v2 文件未被覆盖。

当前两层固定填充轮廓同属 `relation-regional-0-0`，其原生跟随仍待完成。不能将这两层表述为两个缺失关系，也不能据此认定已通过的共享闭环退回自由路径。[收口记录](../.codex-temp/registered-route-context-20261023-v1/closeout.json)保留源码及证据摘要，Office 新产物拖动和共享服务实际作业仍未验收。

最后补做[共享 Worker 只读版本核查](../.codex-temp/registered-route-context-20261023-v1/runtime-version.json)。当前图片转换容器启动于 `2026-10-19T12:48:03.464497735Z`，镜像 ID 为 `sha256:c2c6f35b2ded64c7e56f07ea3fc6263920795e3ba9b75b3acc118707ceb06c8e`。镜像内不存在当前路由目录或旧平铺位置的连线模式模块，实际 Worker/settings 文件摘要与本地不一致，加载的设置也没有 `connectorCornerMode` 字段。核查前后容器 ID、镜像、启动时间、运行状态和重启次数完全保持。

这证明本地的默认策略修复尚未激活到该共享服务，不能把本地工程验收描述为线上已经生效。它不证明用户某个文件的作业来源或唯一故障原因。本轮未部署、重启或提交共享作业；正式产物仍按原路径保留。
