# 阶段诊断与恢复验收

本表按架构实施计划 E 的原始要求核对，区分本地行为验证和实际部署验收。没有将“所有阶段都新增持久化缓存”作为新增要求。

| 原始要求 | 当前证据 | 范围与结论 |
| --- | --- | --- |
| 有界失败分类与重试 | `test/worker-failure-boundary.test.js`、`test/common-tools-team-providers.test.js` | 已验证白名单失败、上传未就绪重试、错误脱敏；检查点缺失保留 `NoSuchKey`，其他读取错误不冒充未命中 |
| 阶段耗时和安全关联 | `test/common-tools-telemetry.test.js` | 已验证并发任务 trace 隔离、耗时、固定字段和 256 个阶段 span 上限；收集端失败不改变业务结果。实际部署是否启用 OTLP 仍需核对 |
| 阶段复用和缓存失效 | `test/ocr-checkpoint.test.js`、`test/openxml-cache-recovery-smoke.test.js` | OCR 绑定来源、页码、尺寸、作业和版本；OpenXML 真实构建验证复用、素材变化失效及损坏重建 |
| 租约恢复和幂等 | `test/postgres/lease-recovery.test.cjs` 及其 process recovery helpers | 真实 PostgreSQL/Redis/MinIO、独立 Worker、进程中断后 attempt 2 复用 OCR；旧租约被拒绝，产物按 attempt 隔离，队列清空 |
| 取消和有限终止 | `test/linux/ocr-process-recovery.test.cjs`、`test/ocr-checkpoint.test.js`、`test/common-tools-image-team-worker.test.js` | Linux 实际进程和后代在取消、超时、输出超限时停止；检查点与交付边界取消保持失败，不产生伪成功 |
| 崩溃后的临时文件和对象清理 | `test/container/worker-scratch-recovery.test.cjs`、OCR process recovery helper | 实际容器重启清除 tmpfs；保留清理删除作业内检查点及产物，邻接对象保留 |
| 脱敏与告警配置 | `test/common-tools-observability-config.test.js`、failure/telemetry 测试 | 本地合同通过；不等于实际告警接收链路已触发成功 |

本轮新增运行 25 项测试，全部通过、无跳过：诊断/告警/OpenXML 10 项、Linux 进程 7 项、容器 2 项、trace 6 项。上一轮真实 PostgreSQL 恢复测试及 84 项相关测试的源码哈希另行复核。日志与哈希记录位于 `.codex-tmp/stage-recovery-acceptance-evidence.json`。

E 的本地恢复与诊断场景已有直接证据。剩余是按实际发布的 OCR 代码和模型确定检查点 revision，核对部署中的启用状态，并与 D 一起验收线上恢复及观测配置。OCR 演练使用受控识别和重建结果，不能替代 F 的真实图片视觉质量；新 PDF 尚未转换。后续一次连续全量 CI 已覆盖 OCR 检查点改动，退出码 0，1,131 个捕获输入文件哈希未变，保留 1 项既有 Windows 符号链接测试跳过；证据 `.codex-tmp/checkpoint-consolidated-ci-evidence.json`。
