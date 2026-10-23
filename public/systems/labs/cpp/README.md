# C++ 真运行实验：从源码到内存、线程与矩阵性能

**这是可下载后在本机运行的固定源码工程，不是网页服务器执行任意代码。** 只使用 Python 标准库、已有的 C++17 编译器和 CPU；不联网、不安装依赖、不申请账号、不访问 GPU。源码、参考实现、测试全部可读。参考程序跑通说明环境和这些测试成立，不说明你独立掌握或已经能胜任岗位。

## 0｜准备与第一步

1. 下载 `cpp_labs.zip`，解压整个 `cpp_labs` 文件夹，不要只下载 `run.py`。
2. 打开终端进入解压目录。Linux/macOS 可使用 `cd 路径`、`ls`；Windows 可用已有获准的 WSL/Linux 或提供 `g++` 的环境。本包没有测试原生 MSVC，也不自动安装工具链。
3. 执行 `python3 --version` 与 `g++ --version`。若只有 `python`，把命令相应替换。需要 Python 3 和支持 C++17 的 `g++`。缺少编译器时先完成阅读和手算，真实编译证据仍待补，不能改输出JSON冒充成功。
4. 执行以下命令：

```sh
python3 run.py --help
python3 run.py basics --output basics-01.json
python3 run.py memory --output memory-01.json
python3 run.py selftest --output tests-01.json
```

5. 用编辑器打开生成的 JSON。`status` 应是 `passed`；若是 `failed`，先看 `error` 和 `processes[].stderr`。输出文件拒绝覆盖；重新实验请换文件名，保留失败记录。

默认规模小：矩阵边长64、计时7次、最多4个工作线程、100,000个整数。上限分别是128、15次、8线程、1,000,000整数。每次编译/链接和单项运行最多30秒；即使用户误输入很大值也会先拒绝。`all`最多四项运行。不要提高上限来通过练习，也不要使用 `python -O`。

## 1｜工程结构：每个文件为什么存在

```text
run.py                固定源码构建、运行、保留原始数据的入口
include/lab.hpp       声明：函数名、参数、类接口
src/basics.cpp        定义mean函数：const引用、vector、异常
src/matrix.cpp        Matrix所有权/边界、朴素与分块矩阵乘
src/parallel.cpp      串行与线程局部归并、线程生命周期
src/main.cpp          测试、计时、命令分发与JSON输出
exercises/            独立修改任务与专门的错误定位例子
verification/         制作者实际验证记录；不是你的运行证据
```

`#include` 让编译器看到声明。`.cpp` 中给出实现。入口先把四个 `.cpp` 分别编译为 `.o`，再链接为可执行程序，所有命令都在结果 JSON 的 `processes` 中。构建产物位于临时目录并在结束后清理；输出证据保留在你指定的位置。

一条编译命令的含义：`g++ -std=c++17 -O2 -Wall -Wextra -Wpedantic -pthread -I include -c src/basics.cpp -o basics.o`。`-std`选择语言标准，`-O2`选择优化等级，警告选项帮助发现问题，`-I`增加头文件查找位置，`-c`只编译不链接。链接时把四个目标文件交给编译器驱动。不要用不同优化等级比较两个算法却把差异全归因于源码。

### 练习前的通用流程

**预测 → 运行参考 → 看源码 → 在副本里只改一处 → 正确性测试 → 实际计时 → 解释与迁移。**

每个任务保存：源码差异、完整命令、JSON原始结果、解释、限制。不要删掉失败测试或只选最好一次。没有加速但测量公平、解释充分，也是合格实验结果。

## 2｜basics：类型、函数、vector与const引用

```sh
python3 run.py basics --output basics-02.json
```

先手算 `[10,20,30]` 的平均值20。打开 `basics.cpp`，逐行观察：

- `std::vector<double>` 拥有一组连续存储的double数值；离开生命周期后自动释放。
- `const std::vector<double>& xs` 是对已有vector的只读引用，避免为参数复制整个vector，也不能通过这个引用修改元素。
- `xs.empty()` 防止空输入没有平均值；抛出 `std::invalid_argument` 明确拒绝，而不是制造NaN或假零值。
- `std::accumulate(..., 0.0)` 从double零开始累加。若使用整数累加器或整数除法，可能改变计算语义。
- 头文件是声明，源文件是定义；重复定义或遗漏定义可能产生不同的编译/链接错误。

测试包含正常、单元素、有正负数、空输入四种条件。输出的 `source_files=4` 是此工程实际参与构建的四个编译单元。

**独立修改：**新增 `weighted_mean(values, weights)`。先写契约：两列表长度相同、非空，权重不得为负，总权重大于零；不合法时抛出清晰异常。已知例子 `[10,20]`、权重 `[1,3]` 得17.5。不能只修改打印数字。按照 `exercises/CHALLENGES.md` 添加正常和错误测试，再用未参与编写的输入复测。

**验收：**你能解释为何使用const引用、如何处理空输入；函数真正参与编译链接；至少五个新测试通过。看过参考实现后的成功仍是“引导完成”，不是独立能力证书。

## 3｜memory：连续布局、RAII、拷贝与越界

```sh
python3 run.py memory --output memory-02.json
python3 run.py selftest --sanitize --output ubsan-01.json
```

`Matrix` 通过vector拥有 `rows*cols` 个double，零维度及大于256的维度被拒绝。这个界限同时限制资源并避免维度乘法溢出。默认拷贝会复制vector数据，因此改变拷贝不影响原矩阵。`const Matrix&` 通过const版本的 `at` 只读访问。

row-major布局中 `(row,col)` 的元素偏移是 `row*cols+col`。3×4矩阵中 `(1,2)` 的偏移是6个元素，字节偏移为 `6*sizeof(double)`。这里实际对同一个vector里的元素指针做差，再与公式核对；不硬编码所有平台double大小。

`at` 检查行列与底层下标。访问第3行或第4列（均零起始）会抛出越界异常。**RAII管理资源释放，不自动修复所有索引错误；const也不等于永久有效的引用。** vector扩容、对象销毁后保留旧指针/引用都需谨慎，本参考实现不暴露内部可变vector以减少这些风险。

### 亲眼定位一次内存错误

`exercises/bounds_bug.cpp` 是故意错误的教学程序，不参与正常构建。只按以下带UBSan的命令运行；若工具链不支持该诊断，请停止，不运行无诊断版本：

```sh
g++ -std=c++17 -O1 -g -fsanitize=undefined -fno-sanitize-recover=all exercises/bounds_bug.cpp -o bounds_bug
./bounds_bug
```

预期是**非零退出**和数组下标4超出4元素数组的诊断，不是正常数字。检查合法范围0..3，将下标修正为3后应输出40。再解释为什么“换一个刚好没崩溃的下标”不是通用输入校验。

`--sanitize` 默认使用UBSan且遇到错误即退出。`--sanitize address-undefined` 可以请求ASan+UBSan；它不代表所有环境都支持。制作者环境中LeakSanitizer报告不支持ptrace，组合诊断未通过；本包保留此限制，没有关闭泄漏检查后伪称通过。诊断版本时间不能与-O2性能结果混比。

**独立修改：**实现返回新矩阵的transpose，检验2×3→3×2、1×N、两次转置恢复原值、修改结果不改变原矩阵。解释对象何时创建、由谁拥有、何时销毁。再加一个已知坏输入测试，让错误版本失败、修复版本通过。

## 4｜threads：正确的分块归并与真实线程开销

```sh
python3 run.py threads --elements 100000 --workers 4 --repeats 7 --output threads-100k.json
python3 run.py threads --elements 1000000 --workers 8 --repeats 7 --output threads-1m.json
python3 run.py threads --elements 7 --workers 8 --repeats 3 --output threads-small.json
```

输入确定性生成：第i个值为 `i%101-50`，采用int64累加以覆盖本实验的总和范围。第w个工作者处理 `[N*w/W, N*(w+1)/W)`，所有范围互不重叠且覆盖全部输入。每线程先写自己的局部和，主线程join后归并；没有多个线程同时修改一个共享计数器。

`JoinThreads` 是RAII守卫。如果创建后续线程抛出异常，已经创建的线程仍会被join，引用的数据保持存活。正常路径也显式join，守卫只处理仍joinable的线程。观察为什么 `partial` 必须比引用它的线程活得更久。

结果包含串行所有样本和1/2/4（选择8时包括8）线程扫描。计时包含线程创建、join和归并，**不是预建线程池**。线程多时更慢完全可能：小任务的启动成本可能大于计算，或CPU资源与内存带宽已饱和。`hardware_concurrency_hint`仅是系统提示，不保证你独占这些核；它也可能返回0。

**独立修改：**在副本新增 `parallel_dot(a,b,workers)`，分块计算点积，线程局部累加后合并。验证不同长度、N小于线程数、不整除、空向量和非法线程数；不要用浮点原子或一个大锁掩盖分块逻辑。先用整数输入得到严格相等，再讨论浮点归并顺序。

**验收：**能画每个工作者范围；测试串行参考一致；保留所有线程配置结果；解释不加速的情形。此练习不包含生产线程池、无锁队列或NUMA调优，后者还需要对应独立项目。

## 5｜matmul：同语义、同输入、完整计时

```sh
python3 run.py matmul --size 64 --tile 8 --repeats 7 --output matmul-64-t8.json
python3 run.py matmul --size 65 --tile 7 --repeats 7 --output matmul-65-t7.json
python3 run.py matmul --size 96 --tile 16 --repeats 7 --output matmul-96-t16.json
```

朴素实现按i/j/k循环；候选按tile及i/k/j顺序工作，复用A元素并让B/C的列轴访问更连续。边界使用min处理非整除维度，不假设shape总是tile倍数。输出分配、带边界检查访问、矩阵乘、checksum和销毁均包含在计时区间内；两版采用相同输入与构建选项。

先用两版完整运行作为预热和正确性检查，再交替每轮谁先运行。测试包含手算2×2乘2×1（输出4与10）、五种矩形shape×四种tile、非法内维度与tile=0。最大绝对误差上限为1e-10，仅针对当前double小规模输入；不可把它当所有模型的统一误差标准。

结果保存 `baseline_samples_ms`、`candidate_samples_ms`、中位数、最近秩P95和两种收益口径：

- 加速比=baseline中位数/candidate中位数。
- 耗时下降比例=1-candidate中位数/baseline中位数。

10ms→6ms约1.67倍、耗时下降40%，不是下降67%。7次样本的P95通常就是最大值，不能冒充生产长尾。计时器为单调时钟，所有数值来自当前CPU运行，不是预设动画。候选较慢也照实保存。

**独立修改：**支持矩形M/K/N而不只正方形；然后新增一个转置B的候选。分别报告“含转置端到端”与“已预处理复用”的口径，不能混比。增加非方阵、单行和tile比维度更大的测试。最后在陌生shape上解释优化是否迁移。

**局限：**这是教学C++循环，不是BLAS、PyTorch或GPU性能。边界检查和checksum也有开销；没有固定CPU亲和性、清cache或控制温度。不要根据这里的倍率宣称真实模型可加速相同比例。

## 6｜证据格式与报告

输出schema为 `mlsys-cpp-labs-v1`。主要字段：

- `status`：passed/failed；失败报告含错误与进程stderr。
- `environment`：Python、平台、机器、逻辑CPU、实际编译器路径与版本。
- `source_sha256`：源码、头文件和runner摘要，用来识别你运行的是哪份代码。
- `parameters`、`processes`：参数、实际编译/链接/执行命令与退出码。
- `labs`：正确性项数、原始计时、汇总、布局/数值结果。
- `evidence_kind`：cpu-measured或cpu-diagnostic；单纯基础断言不能被理解为性能评估。
- `verification`：本地参考测试，**不证明独立作者身份**。

报告依次写：问题 → 先验预测 → 控制变量 → 正确性 → 全部原始结果 → 解释与替代解释 → 未解决项 → 新条件复测。不要把JSON字段改成通过来提交；系统可以检查内部一致性，但无法仅凭文件证明是谁运行或是否看过答案。

## 7｜从引导完成到独立实操

| 层级 | 必须做什么 | 不能声称什么 |
|---|---|---|
| 跑通参考 | 原封运行、能指出输入/输出与命令 | 不等于会写该程序 |
| 修改验证 | 完成新函数/新测试，解释每项变更 | 不等于处理陌生项目 |
| 独立迁移 | 不看参考从接口写实现，通过新shape和故障测试 | 不等于全部C++或MLSys精通 |
| 项目证据 | 接陌生代码、定位故障、做公平benchmark、提交评审包 | 不等于真实GPU/生产服务经验 |

`exercises/CHALLENGES.md` 提供具体迁移任务与验收。真实独立考核需要在不同时间使用未提前给出完整解答的任务，必要时由他人复核；本包公开参考与测试不能充当隐藏考试。

## 8｜常见问题

- 找不到g++：记录缺失工具，不下载不明安装脚本，不把Python结果当编译结果。
- 编译失败：先看首个相关错误、对应文件和行号；再检查声明/定义与include路径。
- 链接失败：检查实现是否进入目标文件列表。不要删除函数调用来掩盖缺失实现。
- 旧输出已存在：换新文件名，保留历史；脚本不覆盖也不删文件。
- 线程没有更快：检查任务规模、启动成本、机器负载，允许负结果。
- sanitizer不支持：记录确切工具/环境限制，使用可用诊断，不绕过系统权限。
- `status=failed`：先看测试和stderr；不会因为产生JSON就判定通过。

本包制作核查日：2026-10-23。C++接口与资源管理学习可参阅 [C++ Core Guidelines](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines)。本包示例为原创教学代码，非该指南复制。
