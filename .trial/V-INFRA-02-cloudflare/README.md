# V-INFRA-02：Cloudflare 能否承载首版 Colab

状态：官方能力调研完成；本地真实运行时纵切通过；远端资源创建待当前任务重新加载已登录的 Cloudflare MCP，或补充可枚举 Account 的 API Token。

## Null hypothesis

> **H0：Cloudflare 无法在不额外引入第三方核心后端的情况下，完整承担 Colab 的身份、关系数据、业务逻辑、Blob、Realtime、后台任务、搜索、权限和平台运维。**

## 结论

**核心后端链路已经拒绝 H0；完整平台结论只剩身份方案尚未定案。**

这次运行时纵切证明 Workers + D1 + R2 + Queues + Durable Objects 可以实现 Colab 的核心共享链路。Cloudflare 仍没有 Supabase Auth 这种应用级用户、Session、Google 登录与企业 SSO 一体能力；Cloudflare Access 面向受保护应用访问，不能直接当作多租户产品用户系统。若首版坚持单一 BaaS 且不自行实现 Auth，Cloudflare 仍不能完整承担后端。

Channel 权限模型很简单，统一在 Worker/Edge Function 中检查成员与角色即可。D1 没有 PostgreSQL RLS 不构成产品能力缺口，也没有必要为了使用 RLS 改变架构。

## 已运行的纵切

原型位于本目录，可执行：

```bash
npm install
npm run types
npm run check
npm run db:migrate
npm run dev
```

实际验证结果：

| 链路 | 结果 | 证据 |
| --- | --- | --- |
| Channel、成员、Shared Item | 通过 | D1 migration 后 API 创建成功 |
| Channel ACL | 通过 | 非成员创建 item 返回 `403` |
| Blob 上传/读取 | 通过 | 请求体流式写入 R2，读回内容一致 |
| root CAS | 通过 | 正确 previous root 更新成功；旧 root 返回 `409` |
| 原子 outbox | 通过 | D1 trigger 在 root 更新的同一事务写入 `sync_jobs` |
| 异步索引 | 通过 | Queue consumer 将 job 完成并更新 `indexed_items` |
| Queue 丢投恢复 | 通过 | dispatcher 重放 pending job；Cron 可周期执行 |
| 乱序/旧 job | 通过 | consumer 对照当前真源 root，将旧任务标为 `stale`，索引不回退 |
| Realtime | 通过 | Durable Object WebSocket 收到 `item.changed` |
| TypeScript/配置 | 通过 | `wrangler types` 与 `tsc --noEmit` 通过 |

WebSocket 实测消息：

```json
{"type":"item.changed","itemId":"it_files","rootOid":"oid_3"}
```

最终状态中 `oid_demo` 遗留任务被重放为 `stale`，而索引仍保持最新 `oid_3`。这验证了搜索索引与 Blob 真源的关键关系：**Blob/root 是真源；root 变更事务只写 outbox；Queue 异步派生索引；消费者必须校验当前 root；pending 由 Cron 重放。**

## 纵切暴露的真实设计约束

1. **D1 与 Queue 无法组成分布式事务。** 对应的实际场景是：Shared Item 的新 root 已经提交，但负责搜索索引、摘要或预览的异步任务可能没有成功投递。它不影响共享内容本身。D1 事务内同时写 root 与 outbox，提交后立即投递，Cron 重放 pending，即可把产品语义明确为“共享立即生效，派生能力最终一致”。
2. **D1 `meta.changes` 不适合作为带 trigger 的 CAS 判据。** 本次实测中 UPDATE 已成功且 trigger 已生成 job，但返回判定导致 API 错报 `409`。改用 `UPDATE ... RETURNING` 后稳定。
3. **Queue 是 at-least-once。** 消费必须幂等，并防止旧 root 的晚到任务把索引回退。
4. **Realtime 是失效通知，不是真源。** WebSocket 丢消息不影响正确性；客户端收到通知后按 root 拉取，重连后主动刷新。
5. **ACL 在应用层。** 客户端只访问 Worker API，不直连 D1；Worker 按 Channel membership/role 检查即可。这是正常业务逻辑，不是待解决的平台风险。
6. **当前原型只证明索引同步协议，没有决定搜索引擎。** 精确关键词搜索使用 D1 FTS、外部搜索还是后续 Cloudflare 产品，仍是 `TODO`；无论选谁都复用同一 outbox 关系。

## 能力映射

| Colab 需求 | Cloudflare 模块 | 验证结论 |
| --- | --- | --- |
| HTTP API 与业务逻辑 | Workers | 满足 |
| 关系元数据 | D1 | 满足首版；接受 SQLite/D1 限制 |
| root CAS 与 outbox | D1 trigger + `RETURNING` | 满足 |
| Git object / 文件 Blob | R2 | 满足 |
| Realtime | Durable Objects + Hibernation WebSockets | 满足，协议自行实现 |
| 异步任务 | Queues + D1 outbox | 满足，需幂等与补偿 |
| 周期补偿 | Cron Triggers | 满足 |
| 用户注册与登录 | 无 Supabase Auth 等价模块 | **核心缺口** |
| Google/OIDC | Worker 自行实现，或外接身份服务 | 可做，但不是托管 BaaS 能力 |
| 企业 SAML | Access 可连接企业 IdP | 能保护应用，不等于产品用户系统 |
| Channel 权限 | Worker 中的 membership/role 检查 | 满足；无需 RLS |
| 精确关键词搜索 | 未选型 | **TODO** |
| 向量/语义搜索 | Vectorize / AI Search | 后续可用，不替代精确搜索决策 |
| 域名、TLS、边缘入口 | Cloudflare 原生平台 | 明显优势 |

## 平台限制

- D1 付费单库上限 10 GB、单行/BLOB 2 MB、单查询最多 100 个绑定参数。内容对象必须进 R2；批量求缺需分批。
- R2 单对象最高 5 TiB，支持 multipart，适合 Git objects 和 session segments。
- Durable Objects 适合按 Channel 建实时协调单元；持久内容仍以 D1/R2 为准。
- Queue 至少一次投递，不能省略 job ID、幂等和 stale 检查。

官方依据：[D1 limits](https://developers.cloudflare.com/d1/platform/limits/)、[R2 limits](https://developers.cloudflare.com/r2/platform/limits/)、[Durable Objects WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)、[Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)、[Cloudflare Access IdP](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/)。

## Codex 接入状态

- 已按 `/Users/yuzhiyuan/Downloads/prompt.md` 安装 Cloudflare 官方 Skills。
- 已安装并登录 Cloudflare 主 MCP 与 bindings/builds MCP；docs MCP 为公开服务。
- 当前 Codex 任务启动早于 MCP 安装，工具清单不会热加载。重启/新开任务后才能直接用已登录 MCP 创建远端资源。
- API Token 自身可验证为 active，但无账户枚举权限，因此 Wrangler 无法获得 Account ID。凭据只放在忽略提交的 `.env.local`，没有散落到源码。

## 下一验证

远端部署不再需要重新设计，只需在 MCP 热加载后的任务中创建隔离的 D1、R2、Queue、Durable Object 和 Worker，重复本地用例，补测 Cloudflare 托管环境的权限、额度、延迟与日志。随后单独决定身份方案；这是 Cloudflare 是否能作为“唯一 BaaS”的最终决策点。
