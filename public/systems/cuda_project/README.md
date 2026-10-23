# CUDA 实操项目：两个 kernel 是否值得融合？

## 状态与安全
本课程构建环境没有 nvcc / NVIDIA GPU；源码尚未由课程在 CUDA 环境编译或运行。它是完整待验证基线，不是已通过的 GPU 实验。没有自动申请算力；仅在你已获授权的 CUDA 机器手动执行。Mac MPS 不能编译运行 CUDA；不必为了读课买显卡。若使用计费资源，先确认预算、停止条件和销毁/断开方式。

## 先修小课：从 C++ 循环到 GPU
CPU 循环依次处理 i；这里一个线程负责一个 i。线程号由 blockIdx.x * blockDim.x + threadIdx.x 构成。grid 向上取整，因此最后一个块可能多出线程；`if(i<n)` 不能删除。x/y 的设备内存与主机 vector 不在同一地址空间，cudaMemcpy 表示传输。Buffer 用 RAII 释放设备内存，禁止复制避免重复释放。kernel launch 对主机是异步的；只计 launch 返回的 CPU 时间会把未完成的计算漏掉。

计算是 y=max(0,0.75*x-0.2)。基线有 affine 和 relu 两个 kernel：前者读x写y，后者再读写y。理想流量约16N字节；融合后约8N字节，不含缓存、事务粒度等。流量减半不保证墙钟时间减半，小N可能受 launch 开销主导，大N可能受带宽约束，端到端还包含PCIe传输。

## 第一步：建立可复现基线
保存此指南与 affine.cu 到专用目录。先读源码，确认只做固定有界测试、不联网。记录 GPU、驱动、工具链、空闲状态。nvcc 的目标架构应匹配你实际设备，不要照抄另一台机器的 sm 编号。

```sh
nvcc --version
nvidia-smi
nvcc -O2 -std=c++17 affine.cu -o affine
./affine > baseline.jsonl
compute-sanitizer --tool memcheck --error-exitcode 1 ./affine
```

输出15行，每行有规模、block、CPU对照误差、21个kernel/端到端耗时及p95。stderr打印设备信息，需另外留存。程序先预热，event计两kernel的设备时间，CPU单调时钟计传入/计算/同步/传出。内存分配不在计时中，不能把它称为从进程启动到返回的全生命周期延迟。21个样本不足稳定刻画极端尾延迟；增加重复次数并复跑才能谈置信度。重定向可能覆盖已有文件，请使用新的结果名。

## 第二步：先解释，再写优化（不给成品答案）
1. 手算 n=257、block=128 时 grid 与最后块有效线程数；解释 n=1 测试价值。
2. 在新文件 affine_fused.cu 中自己写 `affine_relu`：每线程读一次x，直接输出relu值。保留原kernel与可选路径，不删CPU对照。
3. 保持相同数据/编译参数/block/规模/预热，重新测量。不能只挑最快规模。
4. 每个结果先正确性再性能。增加非默认a/b和含负数、零、极大有限数的输入；设计合理误差界，别把阈值调大掩盖错误。
5. 比较 event 与端到端结果：如果kernel快30%而端到端快2%，这不是矛盾。用分项时间解释瓶颈转移。
6. 用 profiler 查看访存与launch，记录工具版本和采样开销；没有profile证据时只写“推测访存减少”，不写已证实带宽瓶颈。

## 第三步：陌生任务 / 独立验收
让评审人另给质数长度、未见block大小、不同a/b、错误注入版本和显存预算。你需要独立给出合法launch范围、CPU对照、失败处理、性能报告。把合法block上限与设备属性比较；不要只凭默认256成功就声称所有设备适用。

通过材料：基线/修改diff、环境清单、原始JSONL、sanitizer退出码及报告、逐规模误差/中位数/p95、失败或无收益案例、回滚命令。评审应让你现场解释为什么异步计时需同步，并要求在没见过的规模重做。网页提交不代替这次评审。

## 错误排查
- nvcc不存在：CUDA工具链未配置，不是算法错误；查看官方对应系统安装说明，不在Mac盲装。
- no CUDA device/驱动错误：记录原错误与环境，不把CPU模拟当GPU成功。
- illegal memory access：先核查索引、分配大小与边界，跑memcheck；不要反复加同步掩盖越界。
- sanitizer通过但数值错：地址合法不表示数学正确，仍须CPU参考与独立输入。
- 未通过环境验证：保留“未核验”状态，继续CPU项目，不填造GPU数据。

## 原始官方资料（核查2026-10-23）
https://docs.nvidia.com/cuda/cuda-programming-guide/
https://docs.nvidia.com/compute-sanitizer/ComputeSanitizer/index.html

## 协作kernel第二课：shared memory归并（另附 reduction.cu）
这不是把向量相加循环换一个名字。一个block的128线程先各装载一个值到共享数组；越界线程装0而不是提前return。所有线程到达barrier后，每轮一半线程合并两值，所有线程再次同步，直到thread0写本block部分和。最后CPU只合并每个block的部分结果：本程序**不是纯GPU全局归并**，也没有测时，不能用它声称加速。

```sh
nvcc -O2 -std=c++17 reduction.cu -o reduction
./reduction
compute-sanitizer --tool memcheck --error-exitcode 1 ./reduction
compute-sanitizer --tool racecheck --error-exitcode 1 ./reduction
compute-sanitizer --tool synccheck --error-exitcode 1 ./reduction
```
此文件同样尚未在课程环境编译/运行。需真实执行后再保留通过证据。

先画出8线程时stride=4/2/1的数据流，再回答：为什么barrier不能只放在if(t<stride)内？为什么n=257最后block不能让越界线程提前return？当前循环要求block大小为2的幂；试图直接改成96不是合法泛化。浮点加法不满足精确结合律，CPU顺序与GPU树形结果可能不同；容差与输入幅值相关，不能要求任意数据逐bit相等。

独立任务：增加多轮GPU归并直到仅一个值（不把所有部分和回CPU），保留CPU double参考；处理n=0的接口约定与非整齐长度；给每个阶段添加合理计时，区分设备计算/传输/端到端；与基线比较并保留无收益规模。现有容差仅是起步检查，请以极端抵消输入检验是否过宽或过窄。评审再给非2幂block需求，要求你先解释合法算法修改，再写代码。不能绕过同步错误或删sanitizer检查来通过。
