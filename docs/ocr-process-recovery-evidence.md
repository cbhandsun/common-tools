# OCR Linux 子进程恢复验收

## 验收范围

2026-09-04 在本机 Docker Linux 服务 29.7.2 中执行当前工作区测试，3/3 通过，无跳过。测试启动真实 Node 子进程，等待其安装忽略 SIGTERM 的处理器后，分别触发超时、取消和输出超限。

每种情况均检查：停止信号顺序为 SIGTERM → SIGKILL；runner 返回原始固定失败分类；已收到 close 且退出信号为 SIGKILL；`process.kill(pid, 0)` 返回 ESRCH，确认直接子进程已回收。用例耗时分别约 4.02、1.26、1.15 秒。

本证据不覆盖进程后代树、真实 OCR 二进制内部行为、容器外的远程服务或完整阶段恢复。Git HEAD 当时为 `c6c666352c94c09cdc1fef29235c6cfb8449d169`，但工作区包含未提交修改，因此证据绑定下述文件内容，不能视为该 commit 的发布验收。

| 对象 | SHA-256 |
| --- | --- |
| 本地 `node:22-bookworm-slim` 镜像 ID | `f32b81066cde10a75dbac96646099533316d94bac4150c55da1636e1f0ffdc46` |
| `packages/slideclone-core/team-ocr-profile.js` | `0aba7e3d43889955b7ed8ef08533ecb1c1aa2b2c28cf42ed80fb501e4549f821` |
| `test/linux/ocr-process-recovery.test.cjs` | `8f60c54a17f9535fcc351b98b66157ecb06490de1e8baa8e73c704da0ff7523c` |

镜像 ID 是本地内容标识，不冒充注册表发布 manifest digest。

## 持续验证

Linux 环境在仓库根目录运行 `npm run test:linux-process-recovery`。该入口已接入 CI 的 Linux portable-core 作业；Windows 不运行 Linux 信号用例，保留跨平台 runner 测试。直接在 Windows 运行此 Linux 门禁会明确失败，不会跳过或给出绿色结果。

本机验收使用只读、无网络容器，移除 capabilities，限制为 1 CPU、256 MB 内存和 32 个 PID，只挂载核心包、contracts 包和 Linux 测试目录。可在 PowerShell 仓库根目录复现：

```powershell
$recoveryRoot = (Get-Location).Path
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 32 --memory 256m --cpus 1 `
  --mount "type=bind,source=$recoveryRoot/packages/slideclone-core,target=/work/packages/slideclone-core,readonly" `
  --mount "type=bind,source=$recoveryRoot/packages/capability-contracts,target=/work/packages/capability-contracts,readonly" `
  --mount "type=bind,source=$recoveryRoot/test/linux,target=/work/test/linux,readonly" `
  --workdir /work sha256:f32b81066cde10a75dbac96646099533316d94bac4150c55da1636e1f0ffdc46 `
  node --test test/linux/ocr-process-recovery.test.cjs
```

复现需要本机已有该镜像；源码变更后应重新运行并更新证据，不沿用这里的通过结论。
