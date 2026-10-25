# 开发交接

2026-10-24：原 AI Site 已发布 v12，Sites 源提交 `012b680f5b4139d4fb727a0fbc7f80e28fb01e73`。保留 owner-only、原数据库和可恢复的 v11 源码/版本。按用户决定取消另建 staging，没有新建 Site / D1。本仓库是该应用的脱敏备份，保留自己的 Git 历史；公开源码不含线上记录或部署身份。

## 产品需求
零基础中文自学 → AI推理优化/MLSys性能工程 → 长期软硬件协同。无固定周数；需要可视化、真正编程/测量/排错、岗位工单与陌生任务验收。旧课不是完整性的包袱；相关知识融入主线，不让学习者跨旧课拼教材。不能承诺网页毕业即精通或保证就业。

## 当前状态
入口 `app/page.tsx`，主UI `app/systems/`；课程 `data/mlsystems-curriculum.ts`；能力契约 `data/systems-practice-contracts.ts`。当前55课、8模拟、6工单、5能力层、12工程实践、5毕业作品。实操源码在 `public/systems/`。后端 `app/api/systems/route.ts` 使用独立D1表、服务端用户ID和CAS；不得破坏账号隔离或旧记录。旧路由 `/legacy` 只兼容归档。

## 已完成与后续边界
1. 55 课按先修、逐步例题、引导练习、失败例子与独立变式复核，增加 Python / C++ / 终端桥梁；保持旧课归档。平台可用不等于已证实学习效果或个人岗位能力。
2. 真实 CPU 训练、HTTP 服务、测量、故障、回归与交接完成；CPU PyTorch / ONNX / compile 有数值和计时证据，包括变慢结果。用户选用 GPU / LLM 机制仿真，不启用云 GPU；CUDA / vLLM 代码保留为以后另行核验的可选练习。
3. 390 px 与 1280 px、键盘/焦点、代码缩进、刷新恢复、文本草稿冲突完成实际浏览器验收。生产只做了正常账号连接及一条显式 QA 参考尝试和草稿的保存/刷新核验，没有跨账号、跨设备或退出后缓存测试。
4. 变式题库 v2、常见错误负对照、调试输出与语法/超时反馈、评阅与重试、历史 v1 较弱覆盖提示完成。仿真来源贯穿导入、保存与导出，不能满足真实设备门槛；参考执行与自评不授予能力认证。

## 验证与运行
先查看 `.agents/skills`（如有）及相关说明。使用项目独立依赖环境。
- `npm run install:ci`，`npm run typecheck`
- `npm run check:systems`（9组，含真实C++有界编译测试）
- `npm run check:assessment`（12项）、`npm run check:simulation`、`npm run check:foundations`、`npm run check:cli`
- `npm run check:self-study`（旧教材结构兼容）
- `npm run build`
- 本地隔离API验收：构建后 `SYSTEMS_QA_TEST=1 node --import ./scripts/sites-env.mjs scripts/preview-acceptance.mjs`；仅合成账号，不指向生产数据。
- `scripts/check-systems-browser.mjs`须本地测试服务与可用浏览器，真实用户站点不得保存QA记录。

## 发布/数据约束
仓库是净化快照，不含原站数据库/凭据/完整内部审计记录。保留现有许可、仓库历史与可见性；不要force push。`.openai/hosting.json`是占位项目身份，不得凭它自动create/deploy。生产站的受众仍应保持私人；源码公开不等于允许公开用户学习数据。
不得提交 `.env`、令牌、数据库、用户报告、截图、聊天记录；新增CPU实验应有边界、超时和独占输出。A100/新增收费资源须另获明确授权，实际访问拒绝不得绕过。不要自动启用远程模型代码或公网推理服务。

## 源码快照差异
以源部署 v12 为依据，v11 是其直接父提交。部署身份已去除，内部 docs/verification、机器回执与线上 QA 记录未导出；说明文档更新了发布状态并移除本机绝对路径。C++ ZIP 仅教学源码/指南，无内部测试日志。旧教材回归用固定哈希文件适配本仓库历史。GitHub SHA 与 Sites SHA 不同，不能互当远端基线。后续流程是先核对两边新变化，在本地开发并验收，再更新已授权原 Site，最后备份脱敏源码；不要直接覆盖并行编辑，也不要把代码回退当作数据库恢复。
