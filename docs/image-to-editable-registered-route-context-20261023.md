# 实际注册图层的关系上下文读取

2026-10-23。承接[默认原生策略](image-to-editable-native-default-unification-20261023.md)及[实际文件绑定修复](image-to-editable-retained-layer-file-binding-20261023.md)。本轮增加源域观察机制，没有用新自由路径替换已验收原生连接器。

## 实现与边界

`source-route-retained-context.js` 同时要求实际测量的关系 fit、原源图缓冲及摘要、私有裁剪注册 token、原放置框和当前资产字节。填充关系编译保留完整组件的私有只读记录，绑定到源坐标；复制的 fit/body/注册 metadata 无法恢复该记录。

查询首先排除完整关系组件，包括头部、线干、浅色边缘和混合接触。组件外只有当前实际 PNG 中完全不透明、且逐 RGBA 等于原图相应 texel 的贡献才返回 `retained-source-context`。透明/半透明、非源色、裁剪外部均保持各自 unknown 原因。移动、缩放、旋转、额外 crop/effect/opacity、符号链接或改写资产不提供该观察。所有查询保留顺序和重复项；耗尽原 4M 账本返回 null，不发布成功前缀。

新增 `readRegisteredSourceCropSnapshot` 直接解码当前文件字节，返回脱离凭证状态的源裁剪窗口和 raster。它不依赖渲染器缓存，也不授权语义归属或擦除。已有窗口读取复用此校验。

这里观察的是一个注册图层的源域贡献，不证明整个最终图层栈的可见性，也不预测 Office 变换后的采样。其他覆盖层、隐藏色恢复和新原生关系表达仍需各自证明；不能将这个读取器描述为完整编辑或整个 composite renderer 已完成。

## 真实原图与独立复核

修正装载顺序的 [v3 真实 raw 回放](../.codex-temp/registered-route-context-replay-20261023-v3/live-context-observation.json)使用实际编译 fit、源编译会话和真实 crop 注册，不从 JSON 重建凭证。独立 PNG 解码及原始 flood fill [复核](../.codex-temp/registered-route-context-20261023-v1/live-independent-verification-v3.json)检查全部 1257 条观察：

- 13 个外侧背景点均为实际保留的原图贡献。
- 209 个不透明原关系反例均被排除。
- 36 个混合接触点全部保持未知。
- 原完整 999-cell 关系组件全部被排除，不只排除所选截面。

后 3 项包含重复坐标，观察未去重或删除失败点。实际 underlay 的 77,631 个不透明 texel 全部与原源裁剪 RGBA 一致，非源色匹配错误为 0。读取账本为 1,297,037，沿用原 4,000,000 上限，没有签发所有权或擦除许可。

[无诊断控制回放](../.codex-temp/registered-route-context-control-20261023-v1/default-replay-verification.json)与 [v3 观察回放](../.codex-temp/registered-route-context-replay-20261023-v3/default-replay-verification.json)均与此前显式原生基线的 235 个形状、69 个文字对象、30 个图片对象及实际资产字节相等。路径只在包含关系和字节摘要核对后规范化。每次回放的 3067 项绑定输入在执行前后未变，模型调用为 0。

实际生产 writer [输出检查](../.codex-temp/registered-route-context-replay-20261023-v3/office-static/writer-verification.json)通过，保持 44 个共享原生连接器、88 个有效 XML 端点绑定和闭环。新文件是验证产物，未替换正式 n10 基线，没有新的 Office 拖动或像素门禁。

## 失败记录与纠正

首次单元验证 24/25 通过，失败的是缓存测试误认为渲染器返回共享的可写缓冲。实际渲染缓存已经返回脱离副本，已更正夹具，保留旧失败和测试副本。

v1/v2 诊断读取验证通过，但整页资产相等检查失败。逐像素差分为完整 residual 中 1000 个重新不透明的像素，坐标不属于跨区关系；最初按 999-cell 关系归因不准确。[失败差分](../.codex-temp/registered-route-context-20261023-v1/first-replay-rejection.json)完整保留。

原因是诊断在既有共享编译器插桩之前提前加载编译器，随后替换 require.cache 产生两个共享编译器实例，导致私有输出凭证来自不同实例。没有修改生产模块修补此诊断现象。v3 先完成既有装载，再用普通导出观察实际输出、通过原编译会话读取源缓冲，不再重载关系模块。无诊断控制和 v3 的全部绘制与资产相等检查均通过，v1/v2 仍不接纳。

## 工程验证与后续

新模块加入严格边界类型与实际运行包必需文件清单；测试由 unit/all 入口发现。核心定向 34/34、统一 unit 发现的 76 个路由文件 397/397 通过，无 skip；两组有重叠。核心修改后的两套类型、全量 Lint、定向 ESLint 通过，原 7 项递减架构预算例外保持。

实际运行包第一次验收因 `worker-shared-native-members` 失败。旧探针要求闭环至少含一个自由路径，与已修复的默认原生策略不一致。探针改为验证默认模式、全网原生 line、原生标记、双端绑定、闭环路径共享及旧箭头退休，并加入把未配置核心强制回 auto 的拒绝回归。没有把失败跳过，也没有放宽时限或质量门槛。

最终消费探针回归 [8/8](../.codex-temp/registered-route-context-20261023-v1/runtime-consumer-v2.tap) 通过，0 skip，保留原 60 秒单子进程时限。随后实际 `npm pack`、隔离安装和全部安装消费探针终态退出 0：[整包结果](../.codex-temp/registered-route-context-20261023-v1/runtime-package-v2.log)为 1,941 个文件、20 个包，生产依赖闭包、Worker 消费及残差去重等检查通过。它没有向共享 Worker 提交真实作业。

[独立收口记录](../.codex-temp/registered-route-context-20261023-v1/closeout.json)由 [只读核验脚本](../.codex-temp/registered-route-context-20261023-v1/verify-closeout.cjs)生成，重新核对最终 10 个相关文件指纹、统一测试发现、两次全绘制相等报告、真实 PPTX 内的 44 个共享连接器和 88 个有效端点引用，以及两个共享图的路径连续性和闭环共享。正式 n10 基线及当前 v2 文件摘要保持。3067 项原始输入只声明回放运行前后未变；之后消费探针的修改由独立 10 文件快照绑定，不声称全部旧指纹仍等于当前源码。

仍为 11 条已接纳关系、严格区域 9/12，semantic/native-component 失败。36 个混合接触点的隐藏贡献与同一跨区关系的两层固定绘制仍需新联合表达；本轮仅补齐后续拟合所需的可信外部图层观察。完整组件编辑、大栅格谱系及共享 Worker 实际作业验收仍未完成。没有完整 verify:ci、部署、共享服务更新、提交或推送，目标保持 active。

额外[只读运行版本证据](../.codex-temp/registered-route-context-20261023-v1/runtime-version.json)确认共享图片转换容器仍为 10 月 19 日启动的旧镜像，缺少当前连线模式模块，Worker 文件摘要也与本地不同。容器核查前后状态相等；当前修复未部署，不能据本地安装包通过声称使用端已更新。
