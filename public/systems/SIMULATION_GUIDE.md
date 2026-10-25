# GPU / LLM 机制仿真：本次学习主线

当前路线是 **真实 CPU / ONNX 动手 + 明确标注的 GPU / LLM 机制仿真**。不会创建 Kaggle/Colab 会话、运行 GPU、下载模型或使用云配额。真实 CUDA/vLLM 源码保留为今后另行授权的可选练习，尚未实机核验。

## 先预测，再运行，再解释

打开「可视化实验」。仍是原来的八个模型，没有新增仪表盘：梯度、缓存、并行与 Roofline、批处理、KV、量化、融合、请求 Trace。每页底部列出具体任务、模型假设和完整参数；下载当前仿真 JSON，然后改变一个条件另存。通过「真实动手」中的结果导入区重算、写解释并保存。

最小完整练习：

1. 在并行页设 65 项工作、8 个槽：手画各槽的索引，预测最后一轮空槽；解释为什么串行开销不能被增加槽数消除。槽不对应某型号 SM/warp。
2. 在 KV 页固定总预算，先扣权重、工作区、余量，再算 KV 页。把 4096 改成 4097 token，解释逻辑数据与 16-token 页取整的差异；找出第一次超预算的并发数。
3. 固定调度种子，导出 batch 1 与 batch 8。比较完整 32 请求的等待、服务、p95 与有限窗口吞吐；增加 batch 可能增加等待，不能只挑吞吐。
4. 保持相同到达轨迹，比较 FIFO 与短作业优先，检查最长请求是否受损。换一个种子复做，解释有限样本和排队策略的限制。
5. 在 Trace 页单独增加并行槽。基线 batch 4 / 槽 4 时改为 8 槽没有必然收益；说明是哪项资源或批大小限制了收益。
6. 写交接说明：题设、参数、种子、完整原始记录、重算方法、正/负结果、未覆盖条件与下一次反证。用变式评测的 trace/decision 任务练习代码检查与解释；其中的质量数字也是合成题设，不是 LLM 评估。

## 模型精确定义

调度器用 LCG `s=(1664525*s+1013904223) mod 2^32` 生成 32 个请求。假设输出长度 8–64；相邻到达间隔为 `1000/rate × (0.5 + draw(101)/100)`。只有一个非抢占执行器，等待满批或最老请求的等待上限；FIFO 或在已到达队列内按长度择短。未满的最后一批也正常执行，不丢弃记录。

服务时间是人为题设：`8 + 0.25 × 批内最长假设长度 × ceil(批大小/并行槽)` ms。这刻意模拟固定启动成本和 padding/有限并行开销，**不是 CUDA、vLLM 或具体显卡预测公式**。没有连续 batching、prefill/decode 流水、真实 token 生成、KV 动态释放、取消、多 GPU 或真实任务质量。吞吐用全部请求数除以从首次到达到最后完成的窗口；p95 用完整总延迟最近秩，不能把阶段分位数相加。

KV 使用 `2 × layers × kv_heads × 128 × tokens × batch × bytes`，再按每请求 16-token 页取整；权重/工作区/余量均由题设扣除，不含所有真实 allocator、量化元数据。Roofline 是上限；并行小模型另有 4 ms 串行工作和每项 1 ms 的同速槽，不能把两种简化模型拼成精确实机预测。

## 复现与来源

JSON 格式为 `mlsys-simulation-v1`，固定 `source=deterministic-educational-simulation`，携带 `provenance.kind=simulation` 和 `hardwareMeasured=false`、`languageModelExecuted=false`、`realDeviceGateSatisfied=false`。浏览器和服务端都从参数重建轨迹；改来源、删请求、改汇总或加虚假的实机标记会被拒绝。保存和备份保留这些字段，评阅不得把它们升格为实测。

已经准备好本地开发仓库时，还可以离线用项目 Node 依赖复跑（新文件名，不覆盖旧证据）：

```sh
node scripts/run-simulation.mjs --model batch --output /tmp/batch-simulation-01.json
node scripts/run-simulation.mjs --verify /tmp/batch-simulation-01.json
# 将上述 parameters 对象单独存为参数文件并改一个值后：
node scripts/run-simulation.mjs --model batch --parameters /tmp/batch-parameters-02.json --output /tmp/batch-simulation-02.json
```

其他 model 名称：`gradient cache roofline kv quantization fusion trace`。这段命令执行确定性模型，不计时设备，不联网也不安装工具。

同一文件通过内部一致性检查，并不能证明作者身份或真实执行。手工伪造整套实测 JSON 仍无法靠格式验证鉴真，因此平台不会自动授予任何真实设备能力。CPU 和 ONNX 参考的实际本机测量仍保留为实测，不能反过来改称仿真。未来真的执行 CUDA/vLLM 时，应新建独立记录和设备证据，不修改仿真文件的标签。
