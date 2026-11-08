# 场景数组输入边界修复

2026-10-23。单独修复隔离 residual 候选审查中复现的稀疏数组漏洞。视觉候选未合入；本轮生产修改仅涉及共用数组校验及共享输出入口的代理检查顺序，没有更改绘制几何、源擦除范围、质量阈值或预算。

## 根因与修复

原共用 `list` 仅要求 own key 数量等于数组 length+1，且所有描述符是数据属性。稀疏数组用自己的 `every`、`map`、`Symbol.iterator` 等补足 key 数量后仍能通过，后续数组操作就会调用输入函数。旧 `Object.values` 检查还遗漏 Symbol 描述符。

现在先拒绝 proxy，再检查普通 Array 原型；own keys 必须恰为完整的 `0..length-1,length`，每项须为自己的数据描述符。空、稠密、冻结、显式 undefined 及不可枚举 numeric data slot 保持兼容。超大稀疏 length 在 key 数量检查即拒绝，不按虚构 length 遍历。

修复位于共用 `source-scene-group-containment.js::list`，直接调用者和共享 reader 都使用同一规则；没有只在 residual 包装器重复一套校验。`sharedOutputList` 和共享 `read` 的 proxy 检查提前，撤销的顶层代理也在访问 Array/length 前拒绝。既有 4M 预算、失败无部分结果、私有证明与普通 buffer identity 合同保持。

[独立复核](../.codex-temp/shared-output-array-boundary-20261023-v1/review-report.md)在保留的原生产字节副本中重现三条直接调用路径：圆角路由、文字多边形、共享组 seal 的输入函数调用均为 1 次；修复后均为 0 次。没有替换真实生产模块或私有 registry 来制造该对照。

## 回归和工程验证

新增六项回归，另扩展撤销代理负例。覆盖正常、空、冻结、不可枚举、非法及极端数组、方法/名称/Symbol 补位、getter/proxy、不执行输入函数、实际 reader/capture 与直接路由调用、无证明发布及统一 unit 自动发现。

修复前四项失败，另一个撤销代理负例失败，红色日志全部保留；最终定向 14/14 通过。完整 Lint、双套类型与架构预算通过；完整 810 文件 unit 套件于 12:46:04 UTC 退出 0，5 个分片全部通过，5 项源码/测试绑定在各门禁执行期间均未改变。这些验证不能表述为本轮完整 `verify:ci`。[unit 终态](../.codex-temp/shared-output-array-boundary-20261023-v1/unit-result.json)。

[回归绿灯](../.codex-temp/shared-output-array-boundary-20261023-v1/regression-green-v2.log)、[原失败](../.codex-temp/shared-output-array-boundary-20261023-v1/regression-red.log)、[工程绑定](../.codex-temp/shared-output-array-boundary-20261023-v1/bindings.json)。

## 正常生产回放

两模式正常 raw rebuilder 复用原源、冻结 OCR、原计划和真实人工确认 adapter；零模型调用，未使用隔离 residual 模块或改变私有注册表解析。每模式 192/202 个 shapes、69 段 text、全部 30 张图片的字节及其其他完整元数据、编译与区域报告、strict/path semantic 报告均与前轮白楔最终回放一致。部分临时图像文件名不同，按各自真实文件 SHA256 归一后比较，初次未归一文件名的比较失败另保留。

仍为 11 条接纳关系、9/12 完整区域，n4/n6/n8 外框缺项与严格质量失败保持。没有新的 writer/Office 或编辑行为结论，前轮相应证据保持原范围。

[完整回放对照](../.codex-temp/shared-output-array-boundary-20261023-v1/replay-comparison.json)。

## 保留边界

独立审查发现 `sharedRouteOutputSnapshot` 的嵌套 `safe()` 对 revoked proxy 仍会抛原生 IsArray 错误，尚未统一为 null/domain error；这项既存问题不执行输入 hook 或授予 paint，单独记录，不能宣称本轮覆盖所有嵌套代理。共用 list 不负责校验数组元素内容，也不防御全局 Array.prototype 被外部篡改。

[共享残差候选及新附件对照](image-to-editable-shared-residual-review-20261023.md)。本轮没有依赖或 writer 改动，没有完整 CI、安装消费、共享 Worker 激活、提交、推送或部署。
