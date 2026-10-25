# AI Systems 学习与岗位实训

面向零基础、自主安排进度的中文学习项目：从编程/数学基础，到 AI 推理优化与 ML Systems 性能工程，再到软硬件协同。不是固定26周课程，也不通过读完或自勾授予“精通/就业”承诺。

## 当前功能
- 55节中文核心课，先修与逐课例子、练习、迁移任务；相关基础已嵌入新主线。
- 8个交互模拟器、6个岗位工单、8个标准库CPU起步实验。
- 5层能力矩阵、12项工程实践契约、5项毕业作品，提供C++、CPU模型/HTTP、CUDA、框架部署和LLM服务专项源码包。
- 原始记录重算、来源标记、变式评测、失败诊断、反馈与重试历史；参考运行不算独立掌握。
- 每账号隔离的学习证据、乐观并发保护、草稿恢复、冲突比较与导出。
- 旧170课仅保留归档兼容，不是新主线第二套必修。

## 来源与隐私边界
这是 2026-10-24 已发布 v12（Sites 源提交 `012b680f5b4139d4fb727a0fbc7f80e28fb01e73`）的**净化开发快照**。它在本仓库 v11 快照的历史上继续开发，保留 GitHub 原历史；不是 Sites 完整 Git 历史的复制。应用与教学资产对应已验收版本，说明文档另作发布状态更新和本机路径脱敏。排除了内部笔记、账号备份、截图、原始运行报告、凭据、数据库和个人学习记录。原 Site 仍仅所有者可访问，GitHub 可见性未改。

`.openai/hosting.json`保留`YOUR_SITES_PROJECT_ID`占位；不携带原站身份。部署时只使用自己获授权的站点配置，不新建或覆盖他人站点。SQL/drizzle是结构，不是数据库导出。开发登录不是生产认证；勿公开开发服务器。没有新增项目开源许可证；公开可见不自动授予新的许可。

## 开发与验证
建议 Node.js 22.18+（原课程部分SQLite检查需Node.js24）、Python3、C++17编译器。

```sh
npm run install:ci
npm run typecheck
npm run check:systems
npm run check:assessment
npm run check:simulation
npm run check:self-study
npm run db:migrate:local
npm run dev
```

生产构建：`npm run build`。具体命令以`package.json`为准。`check:systems`在此导出使用`data/legacy-source-hashes.json`核对旧教材，避免依赖不存在的Sites Git对象。部分历史审计脚本依赖已排除的内部回执，应重新生成自己的结果，不能据缺失回执声称应用无法运行。

## 验证状态
本地完整检查、独立代码复审、390 px / 1280 px 浏览器、键盘、草稿恢复与冲突流程通过。最终评测回归 12 项；隔离 Worker 77 项和 HTTP 专项 65 项检查通过。发布前在实际 Sites 源码上复跑 typecheck、9 组 systems、12 项 assessment 及官方生产构建，通过。线上正常账号连接、课堂与仿真交互，以及一条明确标为 RELEASE QA 的参考尝试和草稿保存后刷新恢复通过；这不是真实学习成绩或跨账号测试。

真实 C++、CPU 模型训练/HTTP/测量/排错，以及 CPU PyTorch、ONNX 数值一致性与计时已验证。小模型上的 compile / INT8 变慢结果照实保留。GPU/LLM 机制仿真保留参数、假设和合成轨迹；不满足真实设备证据门槛。CUDA / vLLM 实机、真实 LLM 质量、跨设备/跨账号生产验证和数据库恢复演练未执行。依赖缺失、模拟输出或自报材料都不能冒充实机结果。详细范围见 [产品验收](docs/GOAL_ACCEPTANCE_ZH.md)。

**下一位开发者请先读 [CODEX_HANDOFF.md](CODEX_HANDOFF.md)。**
