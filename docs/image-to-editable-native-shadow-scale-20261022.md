# 原生阴影收缩写入与真实节点核验

证据目录：`.codex-temp/shadow-native-scale-20261022-v1/`。延续用户确认的 A/A 路径；完整可编辑目标仍为 active。开始修改前独立复核上一轮 manifest 的 **242 项指纹**，保存 2,097 条已有 dirty entries。本轮没有新增 OCR/VLM、提交、推送、部署或共享 Worker 更新。

## 生产代码修复

此前 `style.shadow.scaleX/scaleY` 会被 writer 静默忽略，非法缩放值也会落回默认效果。新增独立 JS 准入模块 `scene-plan/native-shadow-scale.js` 和 C# 写入模块 `NativeShadowScale.cs`，主入口只负责装配。

形状与图片的阴影可选提供 `scaleX`、`scaleY`，每轴独立。输入必须为有限数值，范围 `[0.00001, 1]`，按 DrawingML 的十万分之一分辨率取最近整数。它只收缩阴影 mask，不移动形状、源轮廓、路径或连接端口。未提供某轴时不新增对应 XML 属性；既有无缩放阴影的 XML 保持不变。

JS 边界拒绝 getter、Proxy、异常原型、错误大小写、非数值、非有限及越界值；不执行这些输入的代码，异常消息不含输入内容。.NET 直接 JSON 入口另拒绝重复 `shadow`、重复轴字段、非规范大小写和非法数字，避免绕过 JS 后静默丢失效果。空/缺失阴影保留旧的无效果行为；未调整其他历史阴影参数的默认值或解析规则。

新 JS helper 已进入边界 TypeScript 与安装包必需文件检查；IR schema 描述了参数范围。`test/native-shadow-scale.test.js` 自动进入 unit，`test/openxml-native-shadow-scale-contract.test.js` 明确进入统一 contract/all 清单。

## 回归与工程验证

`before-writer-regression.log` 保存修复前两个真实 writer 回归失败：合法缩放没有写出、非法值成功退出。`focused-v1.log` 的 **6/6** 回归通过且无跳过，包括空输入、上下界、数值取整、恶意对象、直接 JSON 重复键、数值溢出和实际 writer。契约检查效果之外的整个 slide XML 完全不变，并验证移除新参数后恢复原 XML；原生直线连接器也保持原生类型。

定向 ESLint 退出 0。完整 `npm run verify:ci` 首次返回 1，`ci-result-v1.json` 与 `verify-ci-v1.log` 保留终态。Lint、两组 TypeScript、插件/治理检查、锁定 .NET 安全审计及 Release 构建通过；unit 的一个缓存目录并发 rename 发生 EPERM，其余四个 shard 通过。没有修改该缓存实现或隐藏失败。缓存单文件独立复跑 15/15 通过，日志与退出码为 `office-cache-recheck-v1.log`、`office-cache-recheck-v1.json`；不能据此把首次完整 CI 改写为成功。`continue-gates.ps1` 经原入口补跑，contract 的 32 个测试文件通过；integration 返回 1，`worker-budget-runner` 的进程树截止测试实测 9027.739ms，超过现有小于 9000ms 的要求。脚本随后停止，Python lock 和运行包检查尚未执行；终态见 `remaining-checks-v1.json`。未提高时间门槛或修改该测试，不能生成要求这些门禁全部通过的交付快照。

## 实际 writer 与 Office 证据

`build-real-node.cjs` 从保留的三形状节点 IR 生成新 PPTX，直接写出四侧源拟合的收缩阴影。没有后处理或替换 XML。与上一轮仅修改阴影的诊断 PPTX 比较：11 个 ZIP 条目齐全，只有 slide1.xml 的字节不同，变化仅为阴影元素的序列化；阴影属性/内容等价，元素之外完全一致。节点与端口不变。

实际写出 `sx="95238"`、`sy="87281"`、`blurRad="241370"`、`dist="36486"`、`dir="5400000"`、颜色 `#FD5809`、alpha=0.7。报告为 `native-writer-v1/report.json`，PPTX SHA256 为 `aeec308ee7e0286ce07ba6d10813d872f9ef1005fc1a22a61710a631d299889a`。

`render-real-node.cjs` 经现有生产 PowerPoint adapter 导出 1086×1448 PNG，解码后与上一轮收缩阴影诊断逐字节一致。目标 `(450,510)` 的源 RGB 为 `(255,218,192)`，输出为 `(250,216,198)`，最大通道误差 **6**。因此保留的完整外圈诊断（1,665 个新增容差内 cells、零新增超差）对应相同绘制像素。

但本次 adapter **未成功完成**。`native-writer-office-v1/report.json` 保留 `workflowPassed:false`，只有 PNG 导出和解码结果得到证明；未记录原始错误文本，不能仅据用时推断具体退出原因。未提高时限，未授予节点所有权，未执行保存重开或整页编辑验收。

随后 `assess-complete-effect.cjs` 检查整张解码图中所有实际受阴影影响的 cells，包括内部和角部。共 11,094 个 cells，新增容差内 1,744 个，但有 **3 个新增超差**：`(377,404)` 和 `(709,502)` 的误差均从 18 到 19，`(597,510)` 从 10 到 19。候选不能因为外圈零新增超差而获准启用；完整记录为 `complete-effect-assessment-v1.json`。不提高容差、不丢弃这些 cells，生产写入能力与此源拟合候选的准入状态分开记录。

## 未解决的所有权与整页边界

原图及原计划 `region-n4` 表明，节点上方约 17px 处有执行层虚线边框。`top-exterior-evidence-v1.json` 对原 region 顶边的 8 行、节点左/中/右三个完整区间作观察，没有按颜色删点；节点两侧也有超出既有容差的绘制。它为拟合中异常顶侧 band 提供了另一个组件身份线索，但尚未完成该边框的独立原生证明。

完整源软边模型、不可变源身份绑定、私有 mask 与残差合成必须一起解决。不能仅凭一个接点误差 6 或整体通过比例把未解释的源像素授予节点；也不能叠加阴影后保留原残差造成重复绘制。

本轮没有新的 raw rebuilder 或整页 Office 回放。上一轮权威整页仍为 11/11 已接纳关系（原观察 12）、7/12 完整区域，严格语义仍有 15 个固定关系绘制，native-path 仍有两个填充体。`remaining-filled-v1.json` 核对冻结 IR，确认这两个 body 都属于 `relation-regional-0-0`，不是两条不同关系。`large-raster-lineage` 和组件门禁仍未通过。共享 Worker 尚未激活本地修改，整页可编辑目标未完成。
