# 一条可运行的小项目：NumPy 数组 → 线性层 → 手工梯度 → Attention

目标是独立解释、实现、排错与复测一个小的 CPU 数值程序，不是读完就会训练大模型。本包没有模型下载、GPU、付费 API、网络请求或自动安装。全部输入合成；网页「真实动手 → 张量到 Attention 工作台」直接使用包内同一份 `cases.json`。不需要另学旧归档课。

先完成 s0 文件/终端/报错和 s1-l1/l2 的变量、循环、函数与列表/字典。不会函数返回值时，先用第一批日志排障包练习；不要一次实现四个任务。主线衔接为 s1-l3 数组 → s2-l1 矩阵/线性层 → s2-l2 梯度 → s3-l1 张量 → s3-l3 Attention。本指南把这些任务的缺失操作串起来；没有固定天数。

## 0. 隔离环境、先保留一次失败

将 ZIP 解压到新目录，核对 `learner.py`、`run.py`、`test_lab.py`、`cases.json`、`requirements.txt`、本指南。不要在私人项目目录修改。检查器会执行你写的 Python，不是运行未知源码的沙箱。

用终端进入该目录（`cd` 后跟路径，含空格时加英文引号）。macOS/Linux 用 `ls`，PowerShell 用 `Get-ChildItem`，命令提示符用 `dir` 核对文件。查看 `python3 --version`；Windows 用 `py -3` 替换创建环境命令里的 python3。

macOS/Linux：

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -c "import sys,numpy; print(sys.version.split()[0], numpy.__version__)"
.venv/bin/python run.py arrays --output arrays-before.json
```

Windows（PowerShell 或命令提示符，无须修改执行策略）：

```text
py -3 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -c "import sys,numpy; print(sys.version.split()[0], numpy.__version__)"
.venv\Scripts\python.exe run.py arrays --output arrays-before.json
```

安装命令需你自己的正常联网环境；不安装 PyTorch/CUDA。本包固定 NumPy 2.3.5，使用 Python 3.12 验证。安装不支持时保存准确错误与版本，不把缺依赖当通过。以下统一以 `.venv/bin/python` 表示解释器，Windows 换为上面的完整路径；不依赖激活脚本或系统 pip。

最初应有 0/5 组符合约定、状态 needs-work、退出码 1，提示 NotImplementedError。只修改 `learner.py` 的 TODO，保留原测试；每次输出使用新名字。退出码 0 代表该组公开检查符合约定；缺 NumPy 时退出 2、零组执行；超过 8 秒写 timed-out。检查只使用 1～8 的小维度和单线程 CPU，不记录性能。

## 1. 数组：shape 是每条轴的长度

Python 列表可以装不同东西；NumPy ndarray 保存带 shape 与 dtype 的规则数组。标量没有轴；向量有一条轴；矩阵有两条轴。更高维数组也可表示张量，NumPy **不会自动求导**。

共同输入 `tokens = [[1,0],[0,1],[1,1]]`：外层三行代表三个 token，内层两个数代表两个特征，所以 shape=(3,2)、ndim=2、元素个数=6。token 是序列中的一个位置；这里手工提供特征，尚未做文本分词或词嵌入。

`X[0,1]` 取第 0 行第 1 列；`X[:,0]` 取所有行的第 0 列，结果 shape=(3,)；`X[:,0:1]` 保留一列，shape=(3,1)。这两者元素可能相同，广播行为却不同。`.shape` 是各轴长度的元组，`.ndim` 是轴数，`.dtype` 是元素表示。float64 是双精度浮点，选它是为了容易核对有限差分，不代表生产推理应使用它。

完成 `as_tokens(rows)`：检查输入是规则二维实数数组、每维 1～8、所有元素有限，返回独立 float64 副本。负数特征合法，别沿用耗时不能为负的规则。数字字符串、bool、复数、None、NaN、Infinity 都拒绝；ragged 如 `[[1],[1,2]]` 也拒绝。先检查再转换，避免把 True 或 `"1"` 静默变成数值。

可使用 `np.asarray(rows, dtype=object)` 查看原元素类型，`np.ndindex` 遍历下标；验证后再 `np.array(..., dtype=np.float64, copy=True)`。检查 bool 时包含 `np.bool_`；NumPy 的整数/浮点标量类型也应支持。错误用 ValueError 表达，不靠可以被关闭的 assert。

```sh
.venv/bin/python run.py arrays --output arrays-after.json
```

网页点选 token 对照行/列下标，再检查返回值的 shape、dtype。常见失败：只有 `print` 没有 return；把矩阵压平成一维；返回原对象使后续修改污染输入。新增你的测试：修改返回数组的第一个元素，原列表/数组应保持原样。

每步检查符合约定后，回执的 `example` 包含**你的代码**对网页同一份 cases.json 的实际中间输出：数组、Y、梯度，最后到 Q/K/V、scores、probabilities、output。打开 JSON 与网页表逐项对照。变式仍会另做随机参数检查；example_source 明确该展示值来自网页例题，不冒充未展示的变式输入。

## 2. 线性层：矩阵乘法，再按特征广播

乘法契约是 `X(T,D) @ W(D,O) + b(O,) → Y(T,O)`。T 是 token 数，D 是输入特征数，O 是输出特征数；中间的 D 必须相等。`@` 是矩阵乘法；`*` 是逐元素乘法，不能互换。转置 `.T` 交换矩阵两条轴。行与列都从 0 开始编号。

本例 W=[[1,2,3],[4,5,6]]，b=[0.5,1,1.5]。第一个 token [1,0] 乘 W 的第 0 列 [1,4]，点积为 1×1+0×4=1，加 b[0]=0.5，得到 Y[0,0]=1.5。整张结果：

| token | 输出0 | 输出1 | 输出2 |
| --- | --- | --- | --- |
| 0 | 1.5 | 3 | 4.5 |
| 1 | 4.5 | 6 | 7.5 |
| 2 | 5.5 | 8 | 10.5 |

广播从右侧对齐形状；对应维相等或一方为 1 才能扩展。这里 (3,) 偏置沿每个 token 重复。危险情况：T=O=3 时，(3,1) 也能加到 (3,3)，却是每个 token 加一个数，语义错了。`linear` 接口只接受 b.shape==(O,)，不能靠 NumPy 不报错就认定正确。`reshape` 改形状不等于完成正确的轴映射。

实现前核对 X/W 都二维、b 一维、D 匹配；沿用实数/有限值和维度边界规则，返回 float64、不改输入。可以复用 as_tokens 验证二维对象，单独检查偏置。

```sh
.venv/bin/python run.py linear --output linear-after.json
```

累积重跑数组与线性层共 10 组。先手算一个单元，再看网页点积展开；当报 broadcast/shape 错误时，写出 X、W、b 的每条轴，而不是随意加 reshape。

## 3. 梯度：给定上游导数，沿计算图往回走

梯度表示损失随变量微小变化的局部变化率。先核对标量例子：y=w×x，L=(y-t)²，dL/dw=2(y-t)x。正负号不是损失大小：梯度为负时，小幅增加 w 会降低局部损失。已有「张量与梯度」模拟器对应这一步。

现在给线性层每个输出一个上游梯度 dY(T,O)，它是“后续损失对 Y 的导数”。本包为便于核对使用 L=Σ(Y×dY)，固定 dY，不训练模型。本例 dY=[[1,0,-1],[2,1,0],[0,1,1]]。

| 返回值 | 公式 | 本例结果 |
| --- | --- | --- |
| dX (3,2) | dY @ W.T | [[-2,-2],[4,13],[5,11]] |
| dW (2,3) | X.T @ dY | [[1,1,0],[2,2,1]] |
| db (3,) | 沿 token 轴对 dY 求和 | [3,2,0] |

例如 W[0,0] 同时影响三个 token 的 Y[:,0]，各路径贡献 X[i,0]×dY[i,0] 相加为 1。偏置 b[0] 在每个 token 重用，所以 db[0]=1+2+0=3。前向广播，反向就要沿被重复的轴求和。dY 已表达损失约定，不再额外除 T；若损失定义含平均，应由上游 dY 携带这一系数。

独立核对：把 W[0,0] 分别改成 w+h、w-h，重算标量 L，近似导数 `[L(w+h)-L(w-h)]/(2h)`；取 h=1e-5，应接近 1。本检查器用独立标量循环求损失，避免错误的前向与后向互相抵消。容差 1e-6 适用于此 float64 小例，不是所有模型的通用阈值。

```sh
.venv/bin/python run.py gradient --output gradient-after.json
```

累积 15 组：解析梯度、有限差分、错轴、隐式多除一次以及输入不被修改。先写公式和形状，再写代码。负梯度可以正确；不是看到负值就 clip。NumPy 在此只做数值计算，我们自己实现反向传播。

## 4. Attention：分数 → mask → 每行概率 → 加权 V

同一 X 通过三个线性投影生成 Q、K、V。本例 Wq=Wk=单位矩阵，所以 Q=K=X；Wv=[[10,0],[0,20]]、偏置零，V=[[10,0],[0,20],[10,20]]。你已实现的 linear 可重用于投影；不要将常数答案写进 attention。

Q 的每行是一个 query：当前 token 想找什么；K 的每行描述一个 key；V 的每行是要汇总的信息。契约允许 Q(T,Kdim)、K(S,Kdim)、V(S,Vdim)，输出(T,Vdim)；自注意力时通常 T=S，交叉注意力不一定相等。

1. `scores=Q @ K.T / sqrt(Kdim)`，shape=(T,S)。缩放使用特征维，不是 token 数。第一行分数约 [0.707107,0,0.707107]。
2. `allowed(T,S)` 是 bool，True 可见、False 屏蔽。因果例子的三行分别 [真,假,假]、[真,真,假]、[真,真,真]。先把不可见位置临时设为 -inf，再算 softmax；原始 scores 单独保留。
3. 每行减该行可见分数最大值，再 exp，除该行 exp 之和。指数可能非常大，减最大值保持概率不变并避免溢出。归一化沿 key 轴 S，每行和=1，不是每列。
4. `probabilities @ V` 得到输出。第 0 行因果概率 [1,0,0]，输出 [10,0]；第 1 行约 [0.330238,0.669762,0]，输出约 [3.302385,13.395231]。网页点选行、开关 mask、改未来 token 特征，观察早期因果输出是否保持不变。

mask 每行至少一个 True；全屏蔽行没有定义概率，本实验明确 ValueError，不能用 nan_to_num 把故障伪装成合法输出。布尔 mask 不接受 0/1 浮点数组。返回三项均为 float64：未屏蔽 scores、屏蔽后 probabilities、output。不原地改输入；不能把 -inf 留在原始 scores。

```sh
.venv/bin/python run.py attention --output attention-after.json
.venv/bin/python run.py attention --variant transfer --seed 913 --output attention-transfer-913.json
```

累积 20 组，检查中间结果、mask 的零概率、因果前缀不变、大分数稳定性、不同 Q/K 长度和非法输入。不是仅验证程序不崩溃或张量形状。

## 5. 运行前未展示的变式与交接

transfer 用本地固定种子产生未在网页例题展示的不同长度、宽度、正负数和矩形 Attention。种子可取 0～1000000，同种子可复现；生成器与测试是公开的，不是保密考试。先预测形状和不变量再运行，首次错误回执也保留；换种子不等于完成新的独立能力认证。

额外独立任务：关闭例题，用自己选择的矩形 Q/K/V 和一个非三角 mask，先手算一行；写一条新测试。再故意删除缩放、换 softmax 轴或将 bias 梯度求均值，确认对应检查失败并解释原因。代码、测试、diff、环境与原始回执保留在自己目录，网页提交回执和四项中文交接：问题、修复、复测、限制。

只有参考实现/公开测试通过，不能证明学习者独立完成。这里没有训练文本模型、自动微分框架、位置编码、多头/批次 Attention、KV cache、任务质量或性能测量；后续应在真实 CPU 框架中对照这些接口，再进行 profiling 和陌生负载评审。

网页保存规范化的检查回执与交接，不认证其中的源码指纹，也不保管全部数值输出。完整 example、代码与原始回执由你在本地保留。

可核对的官方资料：[NumPy 数组入门](https://numpy.org/doc/stable/user/absolute_beginners.html)、[广播](https://numpy.org/doc/stable/user/basics.broadcasting.html)、[matmul](https://numpy.org/doc/stable/reference/generated/numpy.matmul.html)、[Attention 原论文](https://arxiv.org/abs/1706.03762)。中文步骤是主入口，阅读英文资料不作为先修门槛。
