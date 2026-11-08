# 区域端点绘制诊断与 PowerPoint 重试兼容修复

证据目录：`.codex-temp/source-ring-contact-paint-20261021-v1/`。本轮延续用户确认的 B/C 各沿本侧向下的 A/A 路径，没有新增 OCR/VLM、部署、重启、提交或推送。整页可编辑目标仍为 active。

## 已修复的生产缺陷

`renderer-process.run` 对无 stdout/stderr 的非零退出返回 `Error("renderer process failed")` 及数值 `code`。PowerPoint 适配器仍只识别旧的 `Command failed: powershell.exe ... export-pptx.ps1` 文本，导致这些失败只尝试一次，未进入已有的四次重试。

`packages/slideclone-native-engine/scripts/adapters/render-powerpoint-com.js` 增加对该精确消息、非零安全整数退出码和空诊断的兼容。原 COM 错误匹配及旧格式兼容保留。四次上限、500/1000/1500ms 等待、默认每次 60 秒和部分页清除机制保持不变；取消、终止未确认、其他消息及无有效退出码的错误不进入新增分支。有诊断的错误仍按既有 COM 分类处理，没有增加日志或依赖。

`test/powerpoint-export-retry.test.js` 进入统一 unit/all 发现。`retry-before-regression.log` 保存修复前的三个失败；`retry-focused-v3.log` 确认两个相关文件共 10 项通过（包括新增的真实子进程契约），无跳过。新增回归通过整个适配器验证二次成功、部分页清除、四次后返回最后错误和不重试取消/终止未确认；同时启动一个真实静默非零退出的 Node 子进程，验证实际底层错误能被适配器识别。测试中的 PNG header 为隔离夹具，不是 Office 渲染。

本轮完整 `npm run verify:ci` 返回 **0**，结果为 `ci-result-v1.json` 和 `verify-ci-v1.log`。791 个 unit、31 个 contract、93 个 integration 共 **915 个测试文件**通过；完整 Lint、两套 TypeScript、架构/依赖边界、插件/观测/ADR、锁定 .NET 安全审计与构建、Python 锁文件和安装包消费门禁均通过。另对实际修改的适配器与新测试执行定向 ESLint，通过且无输出。安装包消费采用固定夹具，未将隔离 Office 诊断当作共享 Worker 验收。

## 源像素与原生阴影候选

`border-profiles.json` 沿现有节点底边采样，确认浅橙色场沿底边连续存在。相对边界 offset 0、1、5、12 的源中位 RGB 分别为 `(250,211,187)`、`(251,219,197)`、`(251,230,216)`、`(253,239,230)`。这为软边缘提供观察，尚未证明其所有权。

`shadow-profile-fit.json` 的一维源中位数拟合得到 sigma=10.75px、distance=-6px、alpha=0.6、颜色 `#fe6601`，最大拟合误差 2.564。distance 达到该诊断的搜索边界；OpenXML blur-radius=两倍 sigma 的假设未经标定。该结果没有进入生产。

`native-shadow-v1/` 由实际 .NET writer 生成三形状节点，在 container 上附加该候选阴影。首次生产 Office 适配器返回失败，保留 `failure.json`；该目录没有 PNG。后续阶段诊断不是对此失败的覆盖或改写。

`office-diagnostic-v2/` 和 `office-diagnostic-v3/` 成功退出并导出 1086×1448 PNG。v3 的脚本在 23.379 秒到达结束标记，子进程约 59.978 秒完成；`processEvents` 确认 exit 与流关闭均发生在末尾，不能把差额解释为只等待继承管道。若干其他诊断在导出后耗尽原有时限，故退出稳定性仍未解决。

`office-baseline-v1/` 的新增标记脚本有一次插入错误：JS 行被误放入生成的 PowerShell，导致导出后的清理未执行。错误脚本、失败结果和 PNG 全部保留。修正后的 `office-baseline-v2/` 已记录文档关闭、剩余数量 0、Quit 返回及脚本结束，但进程仍超时。两次基线 PNG 独立解码后逐字节相同，只将它们作为已导出的诊断像素，不称作成功工作流。

`office-release-v1/` 测试显式释放 COM 引用与等待 finalizer；它仍超时，不能声称这已修复退出延迟，也没有把该变更合入生产。

## 整圈检查拒绝该阴影

`assess-exterior.cjs` 比较实际 Office 阴影与三形状基线的完整外圈，使用既有逐通道容差 18。节点边界外 12px 范围共 10,935 个 cells，没有只选接点或删去关系边缘。该采样带用于诊断，不是新生产阈值。

接点 `(450,510)` 的源 RGB 为 `(255,218,192)`；三形状基线为 `(249,230,219)`，阴影候选为 `(249,223,207)`，最大误差从 27 降至 15。但完整外圈新增 **5,643** 个原先误差不超过 18、现在超差的 cells：上方 3,968、右侧 829、左侧 846。下方虽有改善，不能据此接纳整个节点阴影。候选被拒绝，原始关系 paint 全部保留。

`verify-render-evidence.cjs` 独立确认两次成功阴影 PNG 解码一致，两次基线 PNG 解码一致，且本轮开始时的前序 **158 项指纹**全部保持；该核验发生在更新本轮文档之前。`render-evidence-verification-v1.json` 记录了成功进程、失败基线及未授予所有权等边界。

## 四侧源约束

`profile-all-sides.cjs` 补充现有节点外轮廓之外 20px 的完整源采样，纳入 18,742 个 cells、80 个方向/距离 bands，共 791,440 次几何检查。没有按颜色或交汇点过滤像素，关系墨迹也保留在采样中。四侧最邻近 band 的源中位 RGB 分别为：上方 `(254,229,222)`、右侧 `(255,223,210)`、下方 `(251,216,196)`、左侧 `(255,223,216)`；底边一维观察不足以确定完整效果。

`fit-all-sides.cjs` 用其中 40 个 bands 提名半空间软边模型，并复核完整 80 个 bands。诊断在 1,434,960 次颜色检查内得到一个收缩阴影 mask 的分析参数：sigma=7px、上下/左右 inset 分别 7.25/8px、下移 3.25px、alpha=0.7、颜色 `(253,88,9)`；对应 mask scale 约 `(0.952381,0.872807)`。这些值是源中位数模型的结果，没有修改节点几何或端口。

提名 bands 的最大中位误差为 8.057，完整 bands 的最大中位误差仍为 18.997。它未逐像素证明，未标定 Office kernel，未创建新的原生候选或生产缩放支持。全部外圈还可能包含其他组件绘制，需先依据既有组件身份与实际背景证明厘清，不能任意剔除不合模型的 bands。该分析仅为下一步约束，不授予任何节点所有权。

随后 `calibrate-office-spread.cjs` 使用已有的实际 Office 阴影/基线图，在长边远离端部的位置提取 14,336 个外侧像素，通过实际三形状基线逐点确认背景一致。固定已写入的阴影颜色及 alpha，2,279,424 次颜色检查表明名义 blur=21.5px 更接近 sigma=7px 的半空间近似（RGB MSE=0.434、最大误差 3.111），半径/sigma 约 3.071。拟合未使用源图，也未证明角部或完整 Office kernel；它修正了此前两倍 sigma 的未经验证假设，为后续隔离候选提供依据。

## 收缩阴影的实际绘制进展

`prepare-contracted-shadow.cjs` 依据四侧源拟合和上述独立 Office spread 近似，制作第二个隔离诊断。以实际 .NET writer 的三形状 PPTX 为基础，仅替换单个 `a:outerShdw`：保留已标定的 blur，设置 mask scale 约 `(0.952381,0.872807)`、向下 3.25px、alpha=0.7、颜色 `#FD5809`。11 个 ZIP 条目中只有 slide1.xml 改变，且该条目也只改变 outer shadow；节点、连线端口及其他 XML 均未移动。生产 writer 目前没有 shadow scale 支持，此修改仅位于新诊断 PPTX。

`office-contracted-v1/` 在约 49.330 秒完成实际 PNG 导出，49.929 秒记录脚本结束，随后子进程超时，原 60 秒时限未变。它是保留的导出像素证据，不是成功工作流、保存重开或编辑验收。

`exterior-assessment-contracted-v1.json` 确认 10,935-cell 完整外圈有 10,645 个误差不超过 18，较基线新增 1,665 个，新增超差为 **0**。另对 10,573 个实际受阴影影响的外侧 cells 检查，新增超差同样为 0。源图中的其他关系绘制仍不在隔离三形状图中，不能要求这个节点单独重画全部关系，也不能把剩余不匹配的像素删掉。

`check-contracted-endpoints.cjs` 核对旧诊断的六个越界 cells，明确它们不等同于当前简化修复后的剩余越界列表。仅 `(450,510)` 受到该节点效果影响：原生输出 `(250,216,198)` 对源 `(255,218,192)`，最大误差 **6**；其他五个历史 cells 不受该阴影影响，其关系证明继续由既有路径处理。没有将所有颜色近似或未受绘制影响的 cells 一并归给节点。

这一结果改变了下一步：收缩的原生阴影能够绘制目标接点，完整外圈也没有新增容差失败。但源身份、完整模型/像素所有权证书、残差擦除、节点私有 mask、生产序列化及编辑验收尚未接入。当前诊断未授予任何节点所有权，未删除任何源 paint，也没有替换权威整页 PPTX。

## 尚未完成

本轮没有重新运行 raw rebuilder 或整页 Office 验收。此前权威冻结回放保持 11/11 已接纳关系、原始 12 条观察、7/12 完整区域；下层 12 条源边/一个闭环、21 条原生边/五条逻辑路径的输入和产物指纹未变。权威 PPTX 仍为 `.codex-temp/source-junction-transition-20261021-v1/raw-replay-human-a-v1/compiled/actual-human-a-v1.pptx`，SHA256 `7d34dddd4ccd44ee5abe799ae252cfa04a508e3fba7bbb3a3f91d964165ae6ad`。

区域接点尚未获得完整节点绘制证明，两个填充体继续保留。严格语义的 15 个固定关系绘制、native-path 的两个填充体及 `large-raster-lineage` 均未因本轮诊断消除；组件与语义门禁仍失败。共享 Worker 尚未激活本地修改。

下一步应将已改善的隔离绘制与不可变源身份、完整软边模型和像素所有权证明绑定，再接入生产 writer、节点私有 mask 及残差擦除；不能只凭单点颜色或汇总比例删除源像素。Office 退出延迟需独立定位，本轮的重试兼容修复不解决这一延迟。
