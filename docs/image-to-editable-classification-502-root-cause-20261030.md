# 完整候选分类请求 HTTP 502：根因与修复（2026-10-30）

接续 `docs/image-to-editable-model-handoff-20261030.md` 第 8 节。

## 根因（已验证）

- 代理受控事件（`proxy-events.jsonl`，只读取 kind/type/errorType/status 字段）：两次 502
  （06:15:35Z、06:23:01Z）均为 `type=openai_responses_to_chat_conversion_error`、
  `errorType=conversion_failed`，约 3–4 秒。即上游 Codex Responses SSE 返回错误事件，
  代理 Chat←Responses 转换失败后统一回 502；不是 Key、余额、图片支持或超时问题。
- 离线重建完整请求体（假 token、无网络）：`response_format:{type:"json_object"}`，但提示词与图片标签
  **均不含 “JSON” 一词**。小请求 “Return only JSON {}.” 含该词，故成功。
- 最小 A/B（纯文本、同参数、仅差一个词）：不含 JSON → **502**（同一 conversion_failed 事件签名）；
  含 JSON → **200**。

## 修复

- `packages/remote-mcp-server/source-scene-client.js`：json_object 模式下若受信提示词不含 JSON，
  追加固定句 `OUTPUT TRANSPORT: respond with exactly one JSON object.`；已含 JSON 的提示词、json_schema
  和非 JSON 模式不变。`SCENE_HTTP_FAILED` 额外携带仅数值的 `httpStatus`（100–599），不保留正文/headers。
- `packages/slideclone-core/scene-plan/source-scene-candidate-classification.js`：提示词明确为 “one JSON object”。
- 回归：`test/source-scene-client.test.js` 新增 2 项，`test/source-scene-visual-candidates.test.js` 断言提示词含 JSON。
- 未改代理配置、凭据、生产容器；预算、模型、门槛均未改。

## 冻结 32 候选严格分类（首次通过协议）

目录 `.codex-temp/clipboard-candidate-experiment-20261030-v3/`（atlas/selected 与 v2 同哈希；v2 失败证据保留）。
一次请求，38 秒，`readSceneCandidateClassifications` 严格校验通过，32/32。

| kind | 数量 | complete=true |
| --- | ---: | ---: |
| text | 11 | 0 |
| container | 7 | 7 |
| icon | 6 | 4 |
| connector | 4 | 3 |
| unknown | 4 | 0 |

14 个冻结图示标注中被前 32 候选定位到的 5 个：5 个均分类为 icon，其中 4 个 complete。
范围仅限单图近似人工子集；complete 是模型假设，不是源证据或原生编辑许可。未做全页类别真值评估。

## 验证

`node --test test/source-scene-*.test.js test/scene-*.test.js` exit 0；typecheck、改动文件 ESLint、
`verify:architecture-budgets`（2569 文件，7 个既有例外）、`verify:workspace-boundaries` 通过。
完整 `verify:ci`、正常 MCP 全门禁和 Office 验收仍未完成；未部署。

## P1：候选空间分层选择（融合方案第一阶段）

- 新模块 `packages/slideclone-core/scene-plan/source-scene-candidate-selection.js`（`selectSceneCandidates`）：
  4×4 网格 × 4 个尺度档轮询；OCR 行框覆盖 ≥90% 的候选只延后、不删除；常数在评估前预注册，未在 dev 图上调整。
  只决定位置优先级，不授予归属、类别、完整性或原生权限。
- 回归：`test/source-scene-candidate-selection.test.js`（4 项：小图标不被饿死、OCR 延后不删除、确定性/顺序无关/不改输入、非法输入拒绝）。
- dev 离线评估（当前图，冻结 14 标注 sha256 `17b0b17e…1873`，无在线调用）：

| 预算 | 面积优先 | 分层选择 |
| ---: | ---: | ---: |
| 32 | 5/14 | 8/14 |
| 64 | 9/14 | 11/14 |
| 全部 203 | 13/14 | 13/14 |

  203 个候选中 158 个被判为 OCR 覆盖而延后。预算 32 时分层选择丢了面积优先命中的 `robot-left`，新增 4 个。
  这是单张 dev 图的结果，不能作为泛化结论；test 集评估待独立样本到位。
- 验证：typecheck、ESLint、架构预算（2571 文件）、包边界（1377 文件）、`test/source-scene-*` + `test/scene-*` 均通过。

## P2：笔画骨架线图与箭头证据

- 新模块 `packages/slideclone-core/scene-plan/source-scene-stroke-graph.js`（`extractSceneStrokeGraph`）：
  深色墨迹（与候选检测同阈值）去掉 OCR 行框 → Zhang-Suen 细化 → 按交叉数分端点/交叉点 → 追踪边与闭环 →
  剪短毛刺（<6px）并合并二度点 → RDP（ε=1.5）折线 → 箭头候选（三度交叉点 + 两条 4–48px 短刺通向自由端，
  与箭杆夹角 15–75°，分居箭杆两侧）。上限：细化 128 轮、节点/边各 8192，超限报错，不截断。
  输出只是来源证据，`sourceAuthorized:false`，不授予关系、归属或擦除权限。
- 回归：`test/source-scene-stroke-graph.test.js`（5 项：直线、两个方向的开口箭头、T 形交叉/闭合框/前叉不误报、OCR 排除与确定性、非法输入拒绝）。
- 合成测试在 dev 评估前抓到一个几何定义错误：短刺夹角原本按“相对箭杆反方向”写成 105–165°，实际两者都从尖端向外量，应为 15–75°。已在跑真实图之前修正，这是语义修正，不是调参。
- dev 定性检查（当前图，离线，0.5 秒）：220 节点、216 边（≥40px 的 51 条），箭头候选 6 个。
  叠加图人工目视：6 个的位置与方向都与可见箭头相符；漏检约 3–4 个（浅色箭头不满足深色阈值、
  `商品快没库存了→生成暂存动作` 箭头的短刺没连到箭杆上）。此处没有冻结的连线标注，不报精确率/召回率；连线标注放到 P0。
- 箭头尖端会因细化向内缩约 5px，P4 端口绑定时沿方向回推到墨迹末端。

## P3：图形定位进入全局 planner（默认关闭）

- 新模块 `packages/slideclone-core/scene-plan/source-scene-graphic-locations.js`：检测候选 → P1 分层选择（固定 64 个）→
  归一化 0–1000 `[index,box_2d]`。OCR 框向外取整。像素超过 4M 或检测器容量超限时**省略辅助并记录原因**，不截断。
- `source-scene-planner.js`：新增 `graphicCandidates`（默认 `false`，严格布尔）。开启时在全局提示词中附加
  “不可信的源墨迹包络，不是对象/类别/归属/权限；仅当可见图标/节点/容器与某候选吻合时原样复制其框”，
  并在审核目录写入 `graphic-candidates.json`。准入、审核和编译器都未改。
- `source-scene-runtime.js`：环境变量 `COMMON_TOOLS_IMAGE_SCENE_GRAPHIC_CANDIDATES`，只接受 `'true'`/`'false'`/未设置，
  访问器/非字符串直接拒绝。**生产未设置 = 行为不变**。
- 回归：`test/source-scene-graphic-locations.test.js`（4 项：归一化与 OCR 延后、容量省略、planner 只在开启时提供并落盘、运行时开关严格）。

### 预注册在线 A/B（dev 图，每组 1 次全局调用，`.codex-temp/graphic-locations-ab-20261030/`）

| 组 | 对象数 | 关系数 | 14 标注匹配 | 平均 IoU（探索性） | 与候选框完全相同的对象 |
| --- | ---: | ---: | ---: | ---: | ---: |
| off | 21 | 7 | 11/14 | 0.830 | — |
| on | 21 | 8 | 11/14 | 0.772 | 10/21 |
| 历史基线（交接记录） | 25 | — | 1/14 | — | — |

- 结论：本图单次对照里**定位召回没有提升**（11 = 11）。模型确实采用了辅助框（10 个对象直接用了候选框），
  但平均 IoU 略低，这项不在预注册指标内，只供参考。
- 重要发现：同样关闭辅助时，历史基线 1/14 与本次 11/14 相差很大，两者对象结构相近，差在是否列出图标对象。
  说明**全局调用逐次方差很大**，单次结果不能下结论；交接中“原场景框 1/14”应视为单次样本。
- 处理：开关保持默认关闭，不部署。判断是否有用需要每组 ≥3 次重复，并在独立测试图上评估。

### P3 重复对照（预注册：每组 3 次、交错顺序、主指标为每次 14 标注匹配数）

| 组 | r0（首轮） | r1 | r2 | r3 | 范围 |
| --- | ---: | ---: | ---: | ---: | --- |
| off | 11 | 11 | 11 | 11 | 11–11 |
| on | 11 | 10 | 11 | 11 | 10–11 |

- 4 次关闭辅助全部是 11/14：在当前代码和模型下全局定位**很稳定**。历史上的 1/14 应是旧代码或旧运行的异常值，不能作为基线。
- 开启辅助没有带来召回提升，有一次少了 1 个；每次有 9–10 个对象直接复制了候选框。
- 结论：**`graphicCandidates` 保持默认关闭**。当前图上全局定位不是瓶颈，瓶颈在关系绑定（见 P4）。
  模块和开关先保留，供独立测试集评估时再判断。

## P4（第一步）：笔画证据绑定关系端点

- 新模块 `packages/slideclone-core/scene-plan/source-scene-stroke-binding.js`（`bindSceneStrokeRelations`）：
  对每条提案关系，要求**恰好一条**骨架边（≥20px）的两端分别距起点框、终点框边界 ≤24px；多条为 ambiguous，零条为 unbound。
  箭头候选所在端与提案方向（forward/backward/both/undirected）比较，得到 agrees/contradicts/unobserved。
  只作证据，`sourceAuthorized:false`，不写入计划、不授予路由/归属/擦除权限、不绕过编译器。常数预注册。
- 回归：`test/source-scene-stroke-binding.test.js`（4 项：斜线绑定与方向、无箭头/多候选、短边/远端/缺端点、非法输入拒绝）。
- dev 离线评估（同一 OCR 与骨架图；对照为现有直线拟合 `measureSceneRelationDetailed` 单独调用）：

| 计划 | 关系 | 直线拟合 fit | 笔画 bound | 方向 agrees | ambiguous / contradicts |
| --- | ---: | ---: | ---: | ---: | --- |
| 历史基线（交接回放原生绑定 2/8） | 8 | 0 | 5 | 3 | 0 / 0 |
| A/B off | 7 | 0 | 6 | 3 | 0 / 0 |

- 直线拟合失败原因主要是 `node-axis-alignment`（斜向/未对齐）和 `shaft-support`，与其注释“未对齐、弯曲关系保持未解决”一致。
- 叠加图目视：off 计划中 6 条 bound 均为两框之间的真实连线（6/6）；未绑定的是弯曲、浅色的 `推广` 箭头。
  方向 unobserved 的 3 条是浅色或短刺断开的箭头，不是矛盾。没有冻结的连线标注，故以上是单图目视证据，不是精确率统计。
- 未接入编译器。下一步需要设计“笔画证据 → 原生连接线”的受控路径：用已绑定边的端点和折线作为
  斜向/折线连接线的几何来源，仍由编译器做端口、锚点和残影门禁。
