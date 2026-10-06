# Trials

这里存放有明确问题、判断标准和结论的隔离验证。

每项验证独占一个目录，并至少记录：

1. 要验证的假设
2. 验证方法
3. 成功与失败标准
4. 观察结果
5. 对产品或技术决策的影响

当前已进入交互与技术方案阶段，trial 仍以验证明确判断为目的，不承载正式产品代码。

## 当前验证

- [`V-HOME-01-agentic-network/`](V-HOME-01-agentic-network/)：三组协作网络 GSAP 动效样板，用户确认后再移植正式 Home

- [`F-CANVAS-03-markdown-roundtrip/`](F-CANVAS-03-markdown-roundtrip/)：真实 GUI schema 的 Markdown 往返损失审计、mention 身份扩展及现有 collaboration binding 增量更新验证；不宣称完整无损或正式 patch 已实现

- [`interaction-wireframe/`](interaction-wireframe/)：Channel、Sessions、Files、Skills、Settings 的低保真功能布局
- [`V-INFRA-01-baas/`](V-INFRA-01-baas/)：单一 BaaS 能否承载首版 Colab
- [`V-GIT-01-shadow-git/`](V-GIT-01-shadow-git/)：独立 shadow Git 的隔离、语义与性能
- [`V-INFRA-02-cloudflare/`](V-INFRA-02-cloudflare/)：Cloudflare 能否完整承载首版服务端
- [`V-SYNC-01-supabase/`](V-SYNC-01-supabase/)：Supabase 双客户端 Git object 增量同步、Realtime、断点续传与 10 万 OID 求缺
- [`V-LOCAL-01-application-core/`](V-LOCAL-01-application-core/)：一个 Application Core 同时服务 GUI 与多个 Agent runtime
- [`V-AGENT-WRITER-01-codex-writer/`](V-AGENT-WRITER-01-codex-writer/)：Codex app-server writer 所有权、steer 与 per-thread queue 黑盒验证
- [`V-MESSAGES-RECOVERY-01-half-open-websocket/`](V-MESSAGES-RECOVERY-01-half-open-websocket/)：Conversation WebSocket 半开检测、重连与真实消息 cursor 补齐
- [`F-CANVAS-01-yjs-yrs-projection/`](F-CANVAS-01-yjs-yrs-projection/)：Tiptap/Yjs 与 Rust/Yrs wire compatibility、投影 patch 和并发收敛的实现前体外验证
- [`V-CANVAS-02-core-skill-recovery/`](V-CANVAS-02-core-skill-recovery/)：正式 Server、Local Core、打包 Skill 的 Canvas 纵向链路与 durable outbox 故障恢复

- [`V-TRACE-ENTRY-01/`](V-TRACE-ENTRY-01/)：统一 Trace 入口清单、真实 GUI 定位/呼吸高亮与 Skill 命令样例
