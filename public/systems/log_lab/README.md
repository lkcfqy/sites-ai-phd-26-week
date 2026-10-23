# 第一张日志排障工单：从循环到可信指标

先修只需新主线 s0-l1～l3（保存文件、终端、识别报错）。按三个任务逐步补齐 s1 的函数、列表、字典、JSON 与测试，再连接 s2-l3 的分位数和 s5-l3 的服务指标。网页「真实动手 → 日志排障工作台」与本包使用**同一份 cases.json**。这是一份有代码修改的教学工单，不是生产事故或 GPU benchmark。

## 先跑出一次诚实的失败

1. 解压 `log_lab.zip` 到新文件夹。应直接看到本指南、`learner.py`、`run.py`、`test_lab.py`、`cases.json`。全部是可读源码，只依赖 Python 3 标准库；提供的代码不访问网络、不安装软件、不调用 GPU。它会执行你修改的 Python 文件，不是运行未知代码的安全沙箱。
2. 打开终端，先 `python3 --version`。Windows 可用 `py -3 --version`，并将以下命令的 `python3` 换成 `py -3`。进入解压目录（`cd` 后跟文件夹路径，含空格时用引号）；macOS/Linux 用 `ls`、PowerShell 用 `Get-ChildItem`、命令提示符用 `dir` 核对文件。
3. 用文本编辑器打开 `learner.py`。只改这个工作文件；`raise NotImplementedError(...)` 是明确的待完成标记。测试文件公开可读，但不要修改检查或把例题答案写死来凑通过。
4. 运行 `python3 run.py mean --output mean-before.json`。**起始版本应该失败，退出码为 1**，会显示每组检查的目的和错误，例如 `NotImplementedError`。不是缺 GPU，也不需要安装包。失败 JSON 仍写入新文件，保存它作为修改前证据。
5. 每完成一个小改动，用新输出名重跑。脚本拒绝覆盖，5 秒超时会写 `timed-out` 回执。卡住时先检查循环变量是否推进。路径错误先核对当前目录和文件名；语法错误先读行号、英文括号与缩进。

## 任务一：平均数不是固定除以三

工单：一份分析脚本把三条请求的总和当作平均数。先手算 `[12,18,30]`：总和 60 ms，个数 3，均值 20 ms。网页每按一次「执行下一次循环」，都展示一个输入怎样改变 `total` 和已处理个数；不是硬件时间线。

- Python 的列表写作 `[12, 18, 30]`；`len(values)` 是实际个数。变量是当前值的名字，`total = 0` 建立累加起点。
- `for value in values:` 按原顺序取一个数。冒号后的循环体要缩进；`total += value` 表示先读旧 total，加上 value，再把新值写回 total。
- 函数 `def mean_ms(values):` 接收输入，用 `return` 把结果交还调用方；`print` 只显示，不能代替返回值。不要把网页上的三个数写进函数。
- 空列表没有定义平均数，使用 `raise ValueError("空输入没有平均数")`；不要返回 0 来掩盖缺测。
- 必须先拒绝负值、非有限值、文字和布尔值。Python 中 bool 是 int 的子类，单纯 `isinstance(value, (int, float))` 会误收 True；先单独排除 bool。`math.isfinite` 可以检查 NaN 和 Infinity，使用前先核对类型。

完成 `mean_ms`，保留失败后重跑：

```sh
python3 run.py mean --output mean-after.json
python3 run.py mean --variant transfer --output mean-transfer.json
```

第一条检查手算、可变个数、0、小数、空与非法输入。变式改用 `[8,15,22]` 等输入；检查公开，仍不能证明你没有看过答案。**额外独立任务**：关闭网页，自选一组未列在例子里的不同长度数据，先手算，再写一条新测试；解释若固定除以 3 会错在哪里。

## 任务二：坏日志与服务失败有不同分母

`cases.json` 的一行例子：`{"id":"a","status":"ok","latency_ms":12}`。字典的字段名是字符串，用 `row["latency_ms"]` 取值；若字段可能缺失，先检查字段是否存在。JSON 是文件格式；`json.loads` 把文本转换成列表/字典，不能把一整段 JSON 文本直接当字典。`run.py` 提供了加载和保存的完整入口，暂不要求自己写 argparse。

完成 `summarize(records, threshold_ms=100)`。逐条检查，**无效行计数后跳过；有效但 status=error 的请求仍保留在失败率分母中**。合法 status 只有 `ok`、`error`，耗时规则与任务一相同；阈值也必须合法。这里「超过」指严格大于，100 不超过 100。

返回字典必须包含以下全部字段：

| 字段 | 含义 | cases.json 的 records 预期 |
| --- | --- | --- |
| rows_total | 所有输入行数 | 10 |
| valid_count / invalid_count | 合法行 / 无效行 | 7 / 3 |
| success_count / error_count | 合法成功 / 合法失败 | 6 / 1 |
| success_latencies_ms | 成功耗时，保留输入顺序 | [12,18,30,0,100,101] |
| mean_ms | 仅成功请求均值，无成功时 None | 43.5 |
| over_threshold_count | 仅成功请求中严格超过阈值的数量 | 1 |
| error_rate | error_count / valid_count，无合法行时 None | 1/7（不是 1/10 或 1/6） |

网页逐行解释这份数据为何接收/拒绝。注意：`"20"` 是字符串，不能悄悄转为数字；0 是合法记录，不能用真假值过滤。全部无效与全部失败都不能报 0 ms 的好成绩。

```sh
python3 run.py records --output records-after.json
python3 run.py records --variant transfer --output records-transfer.json
```

检查是**累积的**：records 同时重跑任务一。变式有 8 行、4 合法、3 成功、1 失败，成功均值 100 ms，失败率 1/4。另加一组你的测试，覆盖「无成功」与「恰等阈值」。不把测试数量当作能力等级。

## 任务三：p95 的秩与下标

最近秩约定：先复制并排序成功耗时，再取 `ceil(p*n)` 名，最后转换成从 0 开始的列表下标。`math.ceil` 向上取整。p 必须满足 `0 < p <= 1`；空输入、非法耗时和非法 p 均抛 ValueError；不能修改调用者的原列表。

六个成功耗时排序后是 `[0,12,18,30,100,101]`。p95：`ceil(.95*6)=6`，所以第 6 个值 101 ms；p50 是第 3 个值 18 ms。六个样本的 p95 恰好是最大值，但**不能实现成总取最大值**：1～20 的 p95 是第 19 名 19。统计库常用插值，默认结果可能不同，报告必须说明约定。各阶段的 p95 通常不能相加成端到端 p95。

```sh
python3 run.py tail --output tail-after.json
python3 run.py tail --variant transfer --output tail-transfer.json
```

tail 累积重跑三个任务，最多 15 组公开检查。6 个或 3 个成功样本不足以估计生产长尾，不能据此承诺 SLO。这里统计的是合成请求数据，Python 的本地执行不等于请求延迟实测，更不等于 GPU 实测。

## 交接：不是粘贴一个 passed

在网页工作台粘贴脚本回执，再填写：触发问题/失败检查、根因与代码改动、复测命令及新增测试、结论限制和下一步。失败与超时回执同样可以保存，便于记录排障过程。网站只检查回执结构与计数一致性，不执行你的源码、不认证哈希对应的代码、不证明本人独立完成。回执没有用户名、绝对路径或机器秘密；不要额外粘贴私人日志。

交付物放在本地：修改前/后回执、自己的 learner.py、最小 diff、新测试、运行命令和简短交接说明。测试通过后再从空目录按自己的说明重跑，让别人能复现。**岗位迁移任务**：有人提出「去掉慢请求，p95 就达标」。用这里的原始行数、过滤规则、错误率和成功 p95 解释为什么不能据此接受改动，并写出还缺的真实负载、计时边界与样本证据。

后续衔接：s1-l5 再自己写 `analyze.py`，接受输入文件和阈值参数并保存摘要；本包提供的 run.py 不能代替这项独立交付。s5-l3 扩展到真实 CPU 服务日志时须重新定义窗口、失败/拒绝与超时规则；本实验不覆盖吞吐、token 指标或生产监控。
