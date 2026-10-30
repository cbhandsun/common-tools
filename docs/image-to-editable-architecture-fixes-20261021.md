# 图片转可编辑 PPT 架构修复（2026-10-21）

本次修改对应审计中的五项问题。历史人工候选的 `PDR 7.885%` 不作为本次默认编译器或生产 Worker 的验收结果。代码尚未提交、推送或部署到共享运行时。

## 已落地的行为

| 审计项 | 实现与边界 |
| --- | --- |
| Worker 与编排器预算 | `team-worker.js` 保留兼容导出，作业执行移入 `worker-job-runner.js`，候选、证据、文字、图形及质量策略独立成模块。Core 两个主编排器经 stage 聚合模块访问实现。未提高架构预算。 |
| 共享路由源证明 | 分支分别证明连通、宽度、表面颜色与真实箭头；接点允许独立拟合的渐变／抗锯齿，不通过膨胀掩码连接断线。逐行背景仍要求各行四侧独立一致，沿用四百万几何账本及全部源组件覆盖证明。 |
| 默认圆角编译 | `source-route-corner-mode.js` 根据已证明的源中心线估计半径；原生开放路径输出三次贝塞尔、箭头和渐变。无法解释为单一空间渐变时保留原分段渐变，不静默变为纯色。 |
| 三种模式 | `compileSourceScene`、单路／共享路由、raw rebuilder 和 remote factory 贯通 `connectorCornerMode`。非法模式抛错。 |
| Core 目录 | 583 个实现归入 `ocr/`、`typography/`、`scene-plan/`、`routing/`、`archetypes/`、`quality/`；根目录保留 47 个 JS。已逐一核对 HEAD 的 268 个公共 exports 别名仍存在且目标有效；隔离包测试复制真实依赖闭包。 |

## 连线选项

```js
compileSourceScene({ ...input, connectorCornerMode: "auto" });
```

- `auto`（通用编译器默认）：源图拐角半径至少 4px 时生成圆角开放 freeform；直线、尖角或不支持的几何保留既有原生表示。
- `rounded-freeform`：可表示的正交折线使用有界圆角自由路径；直线仍保留直连。
- `reroutable-elbow`：保留 Office 原生连接器与 `stCxn/endCxn` 锚点，节点移动时重路由。

圆角 freeform 是可编辑矢量路径，但节点移动时不会自动重路由。严格语义门禁仍拒绝此类固定关系绘制；生产 Worker 的 composition root 显式选择 `reroutable-elbow`。不可用 `editable: true` 绕过这项门禁。

渐变按源空间拟合；elbow 写入前逆变换旋转和 flip 框架，圆角路径保持全局轴。非空间颜色模型使用既有分段渐变回退。

## 追加的边界修复

- 私有节点边缘不再参与可见间隙背景推断；四个样本只能移到各自边界的第一个未拥有像素，不能跳过异常颜色或推断缺失背景。
- 接触点先去除同一私有轮廓点的重复假设，再使用源覆盖率选择横截面中心；不增加接触距离或 32 对容量。
- 完整保留的 shaft 逐截面检查覆盖宽度，防止中段中位数掩盖局部超过 5px 的不透明实线。
- 单次断裂的实心箭头不能作为虚线。真实多段虚线仍逐段测量，空白不获得墨迹所有权。
- 共享边的箭头宽容仅用于独立测得的箭头端；短边不能借两端宽容吞掉真实分支。
- 圆角输入拒绝 Proxy、getter、稀疏数组、非法坐标与超限路径，拒绝前不调用 getter。
- 浅色 OCR 取色的支持率分母包含全部对比墨迹，不能先筛去较暗的竞争色再把混色判为纯白；保留占优势的抗锯齿浅色核心、704 次采样预算及只读取源像素的边界。

## 验证记录

- Worker 聚焦回归：228/228 通过（`.codex-temp/worker-v4.log`）。
- 编译器三模式、反向渐变、非空间渐变回退、共享 T 及真实场景入口：5/5 通过（`.codex-temp/compiler-corners-v2.log`）。
- 六种实际 OpenXML 构建组合通过，验证开放 cubic、`gradFill`、原生箭头与连接器锚点（`.codex-temp/corner-contract-v2.log`）。
- 最终安装后的 runtime 包：1791 个文件、20 个工作区包、3752803 字节，生产依赖闭包验证通过（`.codex-temp/runtime-package-final-v7.log`）。
- 全量单元测试：761 个文件，五个分片全部通过，899309ms（`.codex-temp/verify-ci-final-v2.log`）。
- 全量契约测试：31 个文件、三个分片全部通过，514196ms（`.codex-temp/contract-final-v3.log`）。
- 最终全量集成测试：93 个文件、三个分片全部通过，870451ms（`.codex-temp/integration-final-v4.log`）。
- 追加 OCR 取色与场景投影回归：56/56 通过（`.codex-temp/ocr-projection-final.log`）；LibreOffice 隔离包回归 8/8 通过（`.codex-temp/libreoffice-core-final-v2.log`）。
- 最终 Lint、类型检查、架构预算及工作区边界通过（`.codex-temp/lint-final-v7.log`、`.codex-temp/typecheck-final-v7.log`）；native engine Debug 构建通过，锁定依赖的 .NET 安全审计与 Release 构建通过，零警告、零错误。
- 统一 CI 各阶段已分段通过：Lint、类型、插件／能力契约、可观测性配置、ADR、.NET 安全审计及构建、单元、契约、集成、Python 锁文件和安装包验证。首轮 `verify:ci` 在旧布局契约测试失败后退出，未声称该单次命令成功；相关契约已修复并全量通过。集成首轮发现隔离包夹具与 OCR 混色失败，修复后的全量复跑已通过，早期失败日志保留。Python 锁文件证据见 `.codex-temp/python-lock-final-v2.log`。
- Office 实际打开：两个模式的合成产物均不经修复成功打开，完整 open gate 通过（`corner-mode-acceptance-v1/open-gate-v2/`）。默认圆角产物已实际导出并目视核对；该 240×180 合成样例 PDR 0.9074%、Missing 0.0997%、MAD 0.9250。该数字仅为此合成样例，不是历史整页原图结果。
- Office 编辑保存重开：2/2 通过。圆角路径以单独原生路径检查几何编辑持久性；elbow 检查实际两端节点移动、连接几何变化及锚点持久性。重开后的包仍保留 cubic／渐变／箭头，或连接器两端锚点（`corner-mode-acceptance-v1/edit-roundtrip/`、`retained-geometry.json`）。最初 COM 拒绝调用和导出超时的失败记录保留；最终使用足够的完整执行窗口通过。

上述源像素回归、安装包证明与 Office 合成样例不能替代原始整页图片的真实 Worker/OCR、视觉门禁及全部关系编辑验收。历史整页指标保持历史证据身份。

后续真实图复现与渐变、接点、Worker 编辑策略修复见 [路由后续修复记录](image-to-editable-routing-followup-20261021.md)。该轮完整冻结输入回放为 4/11 条关系，整页仍未通过组件和语义门禁。
