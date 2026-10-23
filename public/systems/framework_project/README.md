# 框架部署：PyTorch → ONNX Runtime / torch.compile

**交付状态：**课程构建环境缺 PyTorch、ONNX、ONNX Runtime，只验证了Python语法和缺依赖错误路径；没有宣称导出、编译或性能测试已通过。学习者必须在自己的独立环境真实执行。脚本不下载模型/数据，不用GPU，不调用付费API。它是随机权重小MLP的一致性实验，不证明模型任务质量，也不是LLM服务。

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
按下列官方安装页为操作系统选择 **CPU** PyTorch。ONNX模式另需numpy/onnx/onnxscript/onnxruntime，compile模式还需受支持C++工具链。依赖可能较大；确认磁盘和网络后才手动安装。不要安装来源不明wheel；本项目未锁一个未经验证的组合，先记录实际版本并建立自己的锁文件。

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
