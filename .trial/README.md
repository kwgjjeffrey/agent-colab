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

- [`interaction-wireframe/`](interaction-wireframe/)：Channel、Sessions、Files、Skills、Settings 的低保真功能布局
- [`V-INFRA-01-baas/`](V-INFRA-01-baas/)：单一 BaaS 能否承载首版 Colab
- [`V-GIT-01-shadow-git/`](V-GIT-01-shadow-git/)：独立 shadow Git 的隔离、语义与性能
- [`V-INFRA-02-cloudflare/`](V-INFRA-02-cloudflare/)：Cloudflare 能否完整承载首版服务端
- [`V-SYNC-01-supabase/`](V-SYNC-01-supabase/)：Supabase 双客户端 Git object 增量同步、Realtime、断点续传与 10 万 OID 求缺
- [`V-LOCAL-01-application-core/`](V-LOCAL-01-application-core/)：一个 Application Core 同时服务 GUI 与多个 Agent runtime
