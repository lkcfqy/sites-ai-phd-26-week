# 框架部署：PyTorch → ONNX Runtime / torch.compile

**参考验证状态（2026-10-24）：**`deploy.py --mode compile` 已在 macOS arm64、Python 3.14.7、PyTorch 2.14.1、NumPy 2.5.4、CPU 单线程真实运行，batch 1/2/7/31/64 与 eager 输出一致。每组保留首次调用和 31 个热态样本。本次编译路径比 eager 慢，没有加速或正摊销点。ONNX 模式现已另行在相同 CPU 环境、ONNX 1.23.2 / ONNX Script 0.7.2 / ONNX Runtime 1.31.0 通过五个 batch 对照，最大绝对误差约 1.2e-7。已有训练模型另行通过六个 batch（含 13）和 64 条留出质量对照。脚本不下载模型/数据，不用 GPU，不调用付费 API。随机权重小 MLP 只检查数值一致性，不证明任务质量或学习者独立完成。

## 小课1：模型、图、运行时分别是什么
PyTorch Module定义运算与参数；ONNX表达图与算子；ONNX Runtime负责在目标执行提供者上实现算子。文件导出成功，只代表生成一个文件，不代表每个形状和dtype都能正确运行。固定形状样例可能把batch固定；本脚本使用torch.export的动态batch约束1..64，输入特征维16仍固定。导出后先跑onnx.checker，再用真实Runtime对照PyTorch。

`eval()`改变Dropout/BatchNorm等模块行为；`inference_mode()`关闭梯度相关记录，二者不能互相替代。本例只有Linear/ReLU也保留标准推理流程。rtol/atol控制相对和绝对误差，必须先定合理标准再看优化结果，不可失败后随意放宽。质量需要另有真实任务评价，本包仅数值一致性。

## 小课2：编译何时划算
torch.compile第一次调用可能包括图捕获和编译；后续同形状调用使用缓存。新形状也可能再次编译。若只报告热态耗时，就可能隐藏短任务的高启动代价。分开记录第一次、热态中位数和p95；有稳定每次收益时才讨论摊销。这里给出的摊销次数仅用首次调用差额近似，ONNX导出/Session初始化另列，不能漏掉它们就当完整部署成本。候选比eager慢时没有正的摊销点。

## 环境与操作
先创建独立Python环境，不覆盖其它科研项目依赖：
```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip --version
```
按下列官方安装页为操作系统选择 **CPU** PyTorch。ONNX模式另需numpy/onnx/onnxscript/onnxruntime，compile模式还需受支持C++工具链。依赖可能较大；确认磁盘和网络后才手动安装。不要安装来源不明wheel；本次实际组合为 Python 3.14.7、PyTorch 2.14.1、NumPy 2.5.4、onnx 1.23.2、onnxscript 0.7.2、onnxruntime 1.31.0、onnx_ir 1.1.0、protobuf 7.36.2、ml_dtypes 0.6.0、flatbuffers 25.12.19。这个 Mac CPU 组合已实测，其他平台仍需选择兼容官方 wheel 并核验；不要将本机已有 PyTorch 的复用误认为全新环境只需下载 33 MB。

```sh
python deploy.py --mode onnx --output-dir result-onnx-01
python deploy.py --mode compile --output-dir result-compile-01
python -m pip freeze > environment.txt
```
输出目录必须尚不存在，避免覆盖旧证据。若输出`dependency-unavailable`并退出2，**没有完成测量**。失败时保存错误，不把failed改成completed。成功会有results.json；ONNX另有model.onnx。固定单线程、5次预热、31个热态样本与5个batch；每组先和PyTorch对照，全部通过才完成报告。

## 你必须自己补的实验
1. 用纸写出(7,16)→(7,32)→(7,4)形状与参数量；再核对代码。
2. 给输入加错特征维与错dtype的负向测试，确认明确报错而非悄悄转换。加入未见batch=13与边界外batch，记录Runtime实际接受范围；导出约束不一定等于运行时强制限制，需接口显式验证。
3. 将随机权重替换为你在CPU模型项目训练好的模型，保持训练/验证集隔离；加预测质量与量化前后误差，不能仅用随机权重结果宣称任务无损。
4. 固定shape与动态shape导出各一版，公平比较初始化和热态，保留失败案例。
5. 自己写一个短生命周期总成本计算器，纳入导出、初始化、冷启动与请求数；再实测小请求数验证预测。
6. 在另一个CPU或线程数上重复，解释收益为何不可直接迁移。编译缓存冷热环境要记录。

## 验收与陌生条件
提交代码diff、环境版本、导出日志、原始延迟、逐batch误差、失败输入测试、短/长生命周期取舍与回滚。评审现场给一个新shape/模型层或运行时版本，要求你定位导出失败、算子不支持、形状或精度问题。不能以“成功导出了文件”通过；不能用网页自评代替真实执行。

## 常见失败的定位顺序
先确认python指向本环境→依赖版本→CPU提供者→输入名称/shape/dtype→导出报告→数值对照→最后才性能。fullgraph模式若报图断裂，先缩小复现、解释触发Python行为，不要直接关闭检查并继续宣称完整编译。不同操作系统/编译器支持可能不同；不支持时标未核验，保留eager回退。

官方资料（2026-10-23核查）：
- https://pytorch.org/get-started/locally/
- https://docs.pytorch.org/docs/stable/onnx.html
- https://docs.pytorch.org/tutorials/intermediate/torch_compile_tutorial.html
- https://onnxruntime.ai/docs/api/python/api_summary.html


2026-10-24 补充：相邻 `model_project/engineering.py` 已在已有 PyTorch 2.14.1 CPU 环境执行真实训练模型的 torch.export 保存/加载与 HTTP 全流程，可用于建立有质量基线的框架入口。本包 compile 路径现另有实际参考结果：首次 batch 1 调用约 5331 ms；五组热态中位数 0.0177–0.0254 ms，eager 为 0.0075–0.0118 ms，候选更慢。原始样本、环境与运行日志保存在本地交接证据中。这是一次小型 CPU 对照，不能推广到其他模型/设备。ONNX 已另行补验，见下。`mlsys-framework-v1` 未提供全部参考输出，不能当作网站可独立重算质量的导入证据；可在项目交接报告中引用原件。


## ONNX CPU 参考补验（2026-10-24）

`deploy.py --mode onnx` 实际使用 CPUExecutionProvider、单线程，batch 1/2/7/31/64 全部通过。每组 5 次预热、31 个热态样本；最大绝对误差 1.1921e-7，符合预先指定的 rtol=1e-4、atol=1e-5。随机 MLP 的 ONNX 热态中位数 0.003917–0.005750 ms，eager 为 0.005250–0.008542 ms；导出约 2514.42 ms，Session 初始化约 3.846 ms。热态差异不能省略启动成本，微秒级单次测量也不是生产加速保证。

维护者还复用相邻模型工程保存的 8 特征线性分类器权重（没有重新训练、没有下载预训练模型），验证 float64 ONNX 的 batch 1/2/7/13/31/64。64 条原留出样本保留全部逐条预测，准确率仍为 0.90625；反转 logit 的质量负对照仍为 0.09375，留出最大 logit 差为 4.44e-16。训练与留出种子分别为 41/73。导出约 2453.91 ms、初始化约 1.530 ms；交替执行的每组 31 个热态样本中，ONNX 中位数 0.002416–0.002541 ms，eager 0.003000–0.003125 ms。这里只证明这个合成任务的参考模型转换，没有验证工业模型质量、ONNX HTTP 后端或学习者独立作业。

**实际输入边界：**错误特征数、dtype 和 rank 会被 Runtime 拒绝；空 batch、batch 65 和 NaN 输入则被接受。训练模型的 NaN 结果仍为 NaN，随机模型甚至可能返回有限值，因此不能靠检查输出有限就认定输入合法。`torch.export.Dim(min=1,max=64)` 没有自动成为 ONNX 的接口防线。相邻模型服务现有 `core.validate` 对空 batch、超限 batch、非有限值和错误特征数的拒绝已补测；将 ONNX 接到服务时仍必须显式沿用输入校验。本包的学习者 TODO 保留，维护者补验不自动完成个人作业。

精确环境清单、官方 wheel 的 SHA256、两次运行日志、逐条质量记录、原始计时及可复跑维护者脚本存于本地交接 `ONNX_ACCEPTANCE_ZH.md`。`maintainer-onnx-acceptance-v1` 是维护者补验格式，不会被网站当作已独立评阅证据自动导入。没有 GPU/vLLM 验收。
