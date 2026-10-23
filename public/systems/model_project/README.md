# CPU模型 → 量化 → 本机推理服务：分阶段项目

这是**真实CPU代码与HTTP测量**，不是公式模拟。但是模型仅为8维合成二分类，**不是生产LLM、工业数据或GPU基准**。标准库主线不能替代PyTorch框架技能；可选PyTorch部分在开发环境缺包，明确尚未运行。

## 文件与依赖
- `core.py`参考训练/推理：256条合成训练数据，独立种子64条教学测试数据；浮点点积和实际整数点积。
- `learner.py`留有两个NotImplementedError，必须自己实现，不会伪造通过。
- `test_project.py`检验不同batch形状、坏输入、全零与误差；学习者测试默认明确跳过。
- `experiment.py`基线、量化质量、逐次原始耗时。
- `server.py`仅127.0.0.1本机HTTP；`load.py`有界闭环负载。
- `torch_optional.py`小PyTorch MLP训练和动态INT8。**未实跑**；缺包/缺后端会失败退出2，不填虚构结果。
- `run_acceptance.py`可复跑参考实现整体验收。

主线需Python3.10–3.13，开发实测3.12，只有标准库。无pip/外网下载/API key/GPU/费用。所有文件放到新目录；输出拒绝覆盖。服务固定127.0.0.1、最大32KB请求、最多64样本，负载最多300请求/4并发。不改成0.0.0.0，不发布公网，Ctrl-C停服务。本服务器没有生产认证/HTTPS/可用性保障。

## 1. 从手算到独立实现
先修：函数、循环、列表、点积。先手算w=[1,−2],x=[3,4],b=1，z=−4。实际模型8维：z=Σw[j]x[j]+b；z≥0为正类。先不要看core.py的参考实现，补learner.linear_batch。

```sh
python3 test_project.py
CHECK_LEARNER=1 python3 test_project.py
```
第二条未完成TODO时**应该失败**。Windows PowerShell先设 `$env:CHECK_LEARNER='1'` 再运行。验收：batch1/5/13输出数正确；解释空batch、7维、9维、NaN为何拒绝；不要靠zip悄悄截断。补一个独立反例，不修改参考测试以获得通过。

## 2. 训练、质量与基线
```sh
python3 experiment.py --batch 1 --repeats 100 --output batch1.json
python3 experiment.py --batch 16 --repeats 100 --output batch16.json
```
逻辑回归做180步梯度下降。每种推理预热10次后测100次，保留全部原始耗时、p50/p95、两种accuracy和最大logit差。CPU函数同步，因此高精度单调计时器包围实际调用。训练与测试用不同固定种子，不用测试集挑参数后还当最终测试。
验收：解释训练与推理区别；accuracy相同为何logit仍有差；64条合成样本为何不能证明工业质量。再做3轮独立A/B，交换测量顺序；不要只报告最好一次。15/100个样本的尾延迟仍有统计不确定性。

## 3. 自己实现量化
权重scale=max|w|/127；q=clip(round(w/scale),−127,127)。每个输入行动态计算自己的scale；全零用scale=1。整数累加后乘两个scale，再加bias。完成learner.quantized_batch并重新跑学习者测试。
验收：解释裁剪/舍入误差、为什么对称范围不用−128、Python round规则；给全零和未知batch反例。**Python整数对象不是真的1字节存储，因此不能声称内存缩小4倍；量化/反量化开销可能让Python版本更慢。** 改善必须实测，不能写预期加速当结果。

## 4. 从函数到HTTP服务
终端A：
```sh
python3 server.py --mode float --port 8765
```
终端B：
```sh
python3 load.py --concurrency 1 --batch 8 --requests 60 --output service-c1.json
python3 load.py --concurrency 4 --batch 8 --requests 60 --output service-c4.json
```
先Ctrl-C停旧服务，再换 `--mode int8`；结果用新文件名。不要访问其他人的服务。客户端是闭环：请求完成才发下一个，不是固定到达率。HTTPServer有意串行，4客户端不等于4路模型并行。compute_ms只测服务器模型函数；e2e含排队/解析/序列化/loopback等，二者差值不是纯网络时间。
验收：原始逐请求记录、错误率、成功req/s、p50/p95、并发、batch和样本数；不能相加各阶段p95；负载失败也保留。比较float/int8端到端是否与微基准一致，解释原因。

## 5. 工程交付，而非运行截图
先冻结质量和延迟目标再测试，不能事后改阈值。交代码diff、版本/硬件/线程/输入种子、完整JSON、重复实验、失败案例、回滚操作。说明哪些独立完成、哪些借助AI。换新种子和batch7/31再测；通过现有测试不等于所有输入正确。

参考实现验收：
```sh
python3 run_acceptance.py --out ./authoring-check-01
```
输出目录必须不存在。会在本机启动短暂18765端口、完成有限请求后停止。不调用GPU。作者结果不是你的成绩，也不是就业资格证明。

## 6. 可选且必须另验的PyTorch框架阶段
当前开发机没有torch；没有安装大包。`torch_optional.py`代码已提供，**不可把它列为已经验证通过的框架技能**。
已有兼容环境时，先检查独立venv中的torch版本与CPU量化后端，再运行：
```sh
python3 torch_optional.py --output torch-result.json
```
脚本用固定CPU、1线程、两层MLP训练、独立合成测试，float/动态INT8各预热10次测100次；同时报告质量与最大logit差。面向仍保留 `torch.ao.quantization.quantize_dynamic` 的PyTorch2.x构建，实际可用性由API/CPU backend检测，不承诺所有2.x兼容；不要为此盲目降级已修安全问题的软件。按官方安装选择器自行评估CPU安装，记录确切版本，不在系统全局混装。

官方已建议旧eager量化迁移到torchao，本示例只是可检查的小型旧API对照，不是长期生产推荐。资料（2026-10-23核查）：
- https://docs.pytorch.org/docs/2.14/quantization.html
- https://docs.pytorch.org/ao/stable/index.html

独立框架验收：把相同权重放入nn.Linear，核对不同batch输出与梯度；解释eval和inference_mode不同职责；验证CPU量化算子确实转换；保存依赖清单和真实原始耗时。若后端不支持，提交失败证据与适配计划，不冒充通过。进一步查阅当前torchao CPU路径、建立独立迁移分支和正确性测试；**该迁移不在本包已实测范围**。
