# 从日志文件到 CLI：Mac 与 Linux 的共同起点

下载 `log_cli.py`，先阅读源码，在一个新目录创建 `requests.json`：

```json
[
  {"id": 0, "ms": 0, "ok": true},
  {"id": 1, "ms": 20, "ok": false},
  {"id": 2, "ms": 100, "ok": true}
]
```

先预测成功数 2、失败数 1、成功均值 50、最近秩 p95 为 100。然后运行：

```sh
python3 log_cli.py --help
python3 log_cli.py --input requests.json --output summary-01.json --threshold-ms 100 > run-01.json 2> debug-01.log
echo $?
cat run-01.json
cat debug-01.log
cat summary-01.json
```

这是一条真实执行的 Python 文件处理练习；输入数字是你提供的合成记录，没有测量设备。`stdout` 保存机器摘要，`stderr` 保存诊断，`summary-01.json` 保存完整统计与输入。检查退出码必须紧跟要检查的命令；上面的 `echo $?` 只读取前一条 Python 命令状态。

先只把阈值改为 99、输出名改为 `summary-02.json`，预测超预算成功请求由 0 变 1。再依次试空列表、重复 id、`ms: true`、`ms: "20"`、负数以及无成功请求；前五项应明确失败，无成功请求应保留失败数量，均值/p95 为 `null`。阈值是 `>`，等于阈值不超预算。

重复使用已有输出名会退出 2 并拒绝覆盖。错误输出不应被当作安装或管理员权限问题；先读 stderr 的类型和行/字段提示。这个教学格式不是网站实验导入格式，先把文件位置和解释写进课堂反思，不要手改 schema 冒充实测。

## 进程、输出与停止

1. `pwd` 确认当前目录，`ls` 核对文件；绝对路径与相对路径分开试一次。不要删除第一次失败材料。
2. `ps -p $$ -o pid,ppid,comm` 只观察当前 shell 的 PID、父 PID 和命令名。程序是磁盘文件，进程是一次运行；同一程序可以有多个进程。
3. 在练习终端前台执行 `python3 -c "import time; time.sleep(60)"`，然后主动按 **Ctrl-C**，再查看 `echo $?`。这是一个等待示例，不是训练、服务或后台任务；无需等满一分钟，也不用 kill 其他人的进程。
4. 保留 `$?`、stdout 和 stderr 三种信息。退出码 0 表示该程序声明成功，不自动代表结果正确；该 CLI 的格式/文件错误返回 2，主动中断返回 130。
5. 用系统监视器或 `top` 观察进程 CPU/内存，然后退出观察工具。macOS 的 Activity Monitor、`top` 选项与 Linux `/proc`、`top`、服务管理工具不同；不要把 Linux 命令照抄到 Mac 后以失败判定代码错误。

学习目标是可重复运行、定位失败、分离日志与数据，以及停止自己的进程。这里没有验证 Linux 生产服务、容器、权限隔离、NUMA 或内核调优；以后进入具体 Linux 环境时再分别练习。
