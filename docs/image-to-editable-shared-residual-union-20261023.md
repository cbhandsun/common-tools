# 完整残差中的共享原线去重（2026-10-23）

本轮将共享线网的完整私有源证明接入完整残差擦除。它与前轮局部 crop 的706点修复共同工作：局部底图修复后，完整残差仍保留1254/1753个已证明原线像素；移动原生共享组会露出这些旧线。本轮保留全部既有擦除，只追加完整共享组件的源 cells，不恢复旧擦除或扩展浅色背景归属。

本地源码已合入，**整页仍是11条接纳关系、9/12个完整区域；严格语义、路径语义和原生组件门禁仍失败**。没有提交、推送、部署或激活共享Worker。完整CI终态见下方验证状态，不能用历史CI替代本轮。

## 新附件比对

用户本次JPEG与冻结源PNG均为1086×1448。重新完整解码RGB后，1,572,528个像素全部相同，差异0；因此沿用已确认OCR、计划和源坐标，不重复OCR或赋予额外源证明。两文件摘要与比较结果保存在[源图比对](../.codex-temp/shared-residual-union-20261023-v1/source-comparison-v1.json)。

## 实现与授权边界

- `source-shared-route-output-paint.js`为残差增加专用reader。原测量源仍须通过原buffer identity和摘要检查；fresh decode须通过安全raster校验，完整RGBA SHA256及宽高与仍有效的原源一致。普通reader仍要求原buffer，不开放fresh decode。
- 每个共享组仍要求全部真实输出对象恰一出现、完整既有快照和唯一ID保持。端点保留既有唯一ID+box合同；没有声称端点原对象identity或完整样式也已绑定。
- 新`source-shared-residual-union.js`分别接收完整源形状清单与实际擦除清单。只有全部真实共享成员都在擦除清单中才追加该组；同ID、同几何或复制对象不能替代。返回精确一像素高横向runs，不推断AA、背景或未知split归属。
- builder保留原mask顺序和内容，再追加runs；继续经过原eraser、文字背景归属、像素所有权审计和安全发布。`team-native-rebuild.js`仅透传`page.shapes`，入口不新增业务求解。
- 专用reader支持旧builder的30,000对象上限，普通reader原10,000限制保持。证明仍有4M工作账本；追加后总masks仍受原30,000上限约束。资源超限会明确失败，**没有自动发布旧结果的回退**。

## 真实输出与实际编辑

证据根目录：[shared-residual-union-20261023-v1](../.codex-temp/shared-residual-union-20261023-v1/)。独立[Pillow/NumPy与原生PNG复核](../.codex-temp/shared-residual-union-20261023-v1/independent-replay-review-v1/README.md)比较完整输出，结论如下。

| 项目 | auto | reroutable-elbow |
| --- | ---: | ---: |
| 完整私有共享组件S | 5282点/522 runs | 5282点/522 runs |
| 旧擦除已覆盖的S | 4028 | 3529 |
| 本轮净新增透明 | 1254 | 1753 |
| S外RGBA变化 / 旧透明恢复 | 0 / 0 | 0 / 0 |
| 其他图片资产逐字节保持 | 29/29 | 29/29 |
| 移组后新增位置近原线色点数 | 1037→29 | 1458→31 |

所有新增点的旧RGBA均与源相同，新RGBA均为既有透明白色约定`[255,255,255,0]`；逐像素满足`E_new = E_old ∪ S`。唯一变化的图片是完整残差。完整规范化Deck中，除残差引用及其覆盖统计外的形状、文字、其余图片和元数据保持；完整scope除耗时保持，全部失败门禁也保持。

实际writer及PowerPoint两种模式均导出整页。两份候选分别移动两个完整共享组8pt/5pt，保存、关闭、重开通过；组成员为4+36 / 4+46。与Office控制包比较，完整绘制XML只有两个组的平移变化，媒体字节保持。移动基线复用前轮同一当前基线PPTX的已验证移动副本，没有重复执行相同基线。

近源色统计只是本次1254/1753个新增位置的移动观察，不表示整页无残影。原局部三张split映射未知，完整业务卡片分组与三个外框仍未解决。

## 当前路径及真实包复核

续跑时新增[最终IR结构核对](../.codex-temp/shared-residual-union-20261023-v1/current-output-audit-v1.json)，逐项检查两模式的实际对象、全部共享物理边、逻辑路径的连续顺序及原两端身份。11条关系都有实际输出；上层图无环、下层图的循环秩为1。auto下层为21节点/21边，可重路由模式为26节点/26边，各自保留5条明确的逻辑路径；没有用关系数量相等代替逐条路径对账。

原先退化为15段的`n201`在两模式均只有1个成员。auto为带2个三次贝塞尔圆角、6个渐变色标及圆端帽的开放freeform；可重路由模式为双端绑定的原生连接器。[实际PPTX读取](../.codex-temp/shared-residual-union-20261023-v1/current-pptx-path-audit-v1.json)进一步核对对应XML及两模式全部24/29条共享物理边，确认IR中的路径已写入实际文件。读取的是本轮已导出Office的原始候选，没有重跑Office或Worker，也不证明所有编辑能力或整页门禁通过。

诊断脚本初版误要求`rotWithShape=0`，已保留[该次失败](../.codex-temp/shared-residual-union-20261023-v1/current-pptx-path-audit-failure-v1.json)及原脚本。实际XML为`rotWithShape=1`，但auto路径没有旋转/翻转，故当前幻灯片中的6色标轴仍为90度。最终检查同时验证实际变换和渐变角度；没有修改生产writer或将“随对象旋转”误报为当前页面的轴错误。

## 静态代价

| 实际Office指标 | auto | reroutable-elbow |
| --- | ---: | ---: |
| 当前基线PDR | 7.693154% | 7.786252% |
| 本轮PDR | 7.705364% | 7.827905% |
| Missing | 1.976190% | 1.993882% |
| MAD | 8.149802 | 8.234332 |
| 新增均差>24失败点 / 恢复点 | 237 / 45 | 701 / 46 |

两模式仍通过原PDR≤8%、Missing≤12%、MAD≤12门槛；静态略退，不能全部归因为AA。合入依据是实际移动时大量旧线残影减少，同时数值门槛保持；没有新增“零新增失败点”硬门槛，也没有放宽原阈值。主要白缝、边框和部分原生样式差异保留。

## 验证状态与历史失败

- 首轮12项根回归已进入统一unit/all发现入口；结合共享crop和残差连接器几何回归，33/33生产定向检查通过。覆盖原源及fresh decode漂移、RGBA/宽高、真实成员/端点、代理/getter/稀疏数组、资源边界、完整实际擦除清单、带填充及textInk掩码输入的逐像素合同、空输入、读写失败及取消。独立introspection确认初版textInk用例的ownedPixels为0，故首轮不能称为实际owned文字恢复冲突分支覆盖；后续补强及最终通过见下一项。
- 补充[有界owned文字诊断](../.codex-temp/shared-residual-union-20261023-v1/final-production-review-v1/owned-text-probe-v1.json)仅用原fixture及3个明确扩大框，不改原RGBA/fit。三次均有1172个owned像素与S交叠，旧文字恢复实际改动906点；新完整RGBA仍严格等于旧结果∪S，S外RGBA变化及透明恢复均0。随后根回归采用第一个扩大框，增加`ownedInsideS>0`前置断言；原全RGBA、失败传播和预算断言保持。[最终定向日志](../.codex-temp/shared-residual-union-20261023-v1/production-package-and-owned-regression-v3.log)记录包含该用例及隔离包契约的18/18通过。早期owned=0的覆盖限制保留为历史事实，不能继续描述为当前回归未覆盖该分支。
- 原架构预算通过。第一轮完整CI在unit通过后于contract失败：隔离包测试的required清单未列新helper；随后定向v2继续发现其依赖闭包未完整列入。保留两次失败，不能由此认定真实tar已漏包。清单仅新增23个必需路径和2条解释注释，旧行无改动；同测试解析器展开的174文件静态闭包缺失0，更新后动态定向18/18通过，详见[独立补充审查](../.codex-temp/shared-residual-union-20261023-v1/supplement-v2-review/README.md)。[第二轮完整CI](../.codex-temp/shared-residual-union-20261023-v1/production-ci-v2.json)现已退出0，耗时2214970ms（36分54.970秒）：812 unit、34 contract、94 integration，共940文件、11分片全部通过；Lint、两套类型、插件/配置检查、.NET安全审计与锁定构建、Python lock及真实运行包安装消费也通过。实际包包含20个包、1890个文件、6类能力，归档3977194字节，生产依赖闭包及实际消费者通过。静态闭包和定向结果没有替代完整CI。
- 第一轮已捕获2490项工程输入，捕获时点为CI已派发、Lint尚未完成。第二轮在CI派发前另存`engineering-inputs-v2.json`；与第一轮仅required清单和上述根回归两项预期变化，五个核心模块保持。[最终终检](../.codex-temp/shared-residual-union-20261023-v1/final-verification-v1.json)已逐项核对第二轮全部2490摘要、五模块与sandbox/迁入备份、源图及实际Office包，全部保持；没有回写第一轮快照或借用历史CI结果。整页产品、共享Worker激活、提交和部署仍未完成。
- 隔离初版第6项测试曾失败。诊断证明Node同父request缓存使baseline与candidate实际为同一factory；改成直接sandbox加载并断言factory不同后6/6通过。新透明像素RGB按既有eraser白色约定比较，S外RGBA仍严格不变。原失败日志保留。
- 隔离v1真实回放后，reader仅修改了residual清单上限以兼容旧30,000对象合同；v1原绑定保留。[最终正常生产复核](../.codex-temp/shared-residual-union-20261023-v1/final-production-review-v1/README.md)确认两模式30/30图实际字节、完整Deck仅归一化随机assetPath后、完整scope仅去seconds后均与Office候选相同。五生产模块与当前sandbox逐字节一致；恢复唯一清单上限条件后，reader SHA精确命中旧v1捕获，证明无其他源码漂移。161项主输入和191项文字探针依赖终检保持，产物封存；没有回写旧绑定。

源码修改前快照、迁移前后摘要、失败和成功日志、实际Office包及移动副本全部保留在证据目录。下一步仍是解决三个外框的完整源归属与完整业务卡片编辑；本补丁不增加完整区域计数。
