# Worker 预算隔离与渲染终止修复

本轮修复独立安装完整 CI v2 暴露的两项失败。旧结果仍保存在 `.codex-temp/native-engine-installed-resolution-20261023-v1/production-ci-v2.json`，退出 1；没有回写成功。

## 问题与行为

并发预算测试以真实墙钟和 30ms timer 区分 140ms 预算内的快慢请求。高负载下快请求实际耗时约 295ms，正确触发超时，原 fixture 却预期成功。测试现在通过受控单调时钟和两请求重叠屏障验证：slow 在 t=0 开始，fast 在 t=100 开始，两者在 t=150 释放；slow 必须超时，fast 必须成功且剩余 90ms。预算仍为 140ms，真实进程终止集成测试继续使用实际墙钟。

渲染适配器的 `stop` 和后续 `close` 原来会对同一进程树重复执行同步终止。修复后每个 child 缓存第一次终止结果；第一次失败在再次观察时仍抛出相同错误。适配器继续等待进程实际关闭，不能把未确认终止变成成功。

真实父子进程探针在修复前记录两次 taskkill，总耗时约 7.61s；修复后记录一次，总耗时约 5.53s。父进程、后代进程和延迟写入文件检查均符合预期。这是两次诊断观测，不代表普遍延迟承诺。

## 修改与验证边界

相对前次 CI 冻结输入，仅四个文件变化：

- `packages/slideclone-core/renderer-process.js`
- `packages/slideclone-worker-adapter/worker-budget-runner.js`
- `test/libreoffice-core-package.test.js`
- `test/worker-budget-runner.test.js`

新回归位于统一 CI 已发现的测试文件。25/25 定向回归、主类型检查、严格边界类型检查、修改源码 Lint、架构预算及工作区边界检查通过。真实进程树集成测试本次耗时约 4.62s，原 2500ms 预算与 9000ms 上限断言保持。

精确修改前快照、差异、日志、真实探针和最终摘要见 `.codex-temp/worker-budget-determinism-20261023-v1/validation.json`。本轮没有新增依赖、放宽超时或修改门禁 baseline。

新的完整 `npm run verify:ci` 已退出 0，耗时 2268885ms（约 37.8 分钟）。原入口的 unit、contract、integration、Python lock 和运行包验证均走到终态。`final-verify.cjs` 随后通过：冻结的 2492 项工程输入及 unit/contract/integration 的 814/34/94 文件清单完全保持，25/25 定向回归证据与前次失败 CI 指纹保持。机器结果见 [final-verification.json](../.codex-temp/goal-engineering-verification-20261023-v1/final-verification.json)。前次失败仍保留，不以当前通过覆盖。

原配置 Lint 的通过与扩大源码 Lint 的 705 项既有错误分别报告；本次没有把后者称为全部源码无问题。此终检认证当前冻结工程输入，不自动刷新此前 Linux 消费或整页业务编辑结论。

本修复不认证 `.codex-temp/approved-approx-frames-20261023-v1/` 内的隔离近似外框候选。三个框允许近似表示，但严格结果仍为 9/12；整页产品验收仍未完成。没有激活或重启共享 Worker。
