# AI Systems 学习与岗位实训

面向零基础、自主安排进度的中文学习项目：从编程/数学基础，到 AI 推理优化与 ML Systems 性能工程，再到软硬件协同。不是固定26周课程，也不通过读完或自勾授予“精通/就业”承诺。

## 当前功能
- 55节中文核心课，先修与逐课例子、练习、迁移任务；相关基础已嵌入新主线。
- 8个交互模拟器、6个岗位工单、8个标准库CPU起步实验。
- 5层能力矩阵、12项工程实践契约、5项毕业作品，提供C++、CPU模型/HTTP、CUDA、框架部署和LLM服务专项源码包。
- 每账号隔离的学习证据、乐观并发保护、草稿提醒与导出。
- 旧170课仅保留归档兼容，不是新主线第二套必修。

## 来源与隐私边界
这是部署源码 v11（源提交 `6a95e49705532d951d7a4d3fce4767e1f8d23601`）的**净化开发快照**，追加到本仓库已有历史，未改仓库可见性。排除了内部笔记、账号备份、截图、原始运行报告、凭据、数据库和个人学习记录。它不是原Sites完整Git历史复制。

`.openai/hosting.json`保留`YOUR_SITES_PROJECT_ID`占位；不携带原站身份。部署时只使用自己获授权的站点配置，不新建或覆盖他人站点。SQL/drizzle是结构，不是数据库导出。开发登录不是生产认证；勿公开开发服务器。没有新增项目开源许可证；公开可见不自动授予新的许可。

## 开发与验证
建议 Node.js 22.18+（原课程部分SQLite检查需Node.js24）、Python3、C++17编译器。

```sh
npm run install:ci
npm run typecheck
npm run check:systems
npm run check:self-study
npm run db:migrate:local
npm run dev
```

生产构建：`npm run build`。具体命令以`package.json`为准。`check:systems`在此导出使用`data/legacy-source-hashes.json`核对旧教材，避免依赖不存在的Sites Git对象。部分历史审计脚本依赖已排除的内部回执，应重新生成自己的结果，不能据缺失回执声称应用无法运行。

## 验证状态
源版本完成类型/静态检查、9组回归、23项隔离测试账号API检查及桌面真实浏览器验收。C++与标准库CPU模型/本机HTTP基线有实际运行验证；参考实现通过不等于学习者独立通过。

CUDA、PyTorch/ONNX/torch.compile与真实vLLM/GPU路径在源开发环境未执行，源码包明确标注需要合适环境再核验。真实移动视口未完成浏览器验收；响应式样式已实现。不要把模拟输出、依赖缺失退出或自报材料写成真实GPU性能。

**下一位开发者请先读 [CODEX_HANDOFF.md](CODEX_HANDOFF.md)。**
