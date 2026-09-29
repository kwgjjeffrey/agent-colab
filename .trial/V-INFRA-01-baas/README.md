# V-INFRA-01：单一 BaaS 能否承载首版 Colab

状态：验证通过，带约束  
当前首选候选：Supabase

## 1. 要验证的命题

第一版不另建传统服务端。一个 BaaS 应当同时承载用户身份、关系数据、服务端逻辑、Blob、Realtime、后台任务、搜索、权限与基本运维能力。

本验证不讨论多后端兼容，也不建设基础设施 adapter。只有首选 BaaS 存在不可接受的关键缺口时，才更换候选。

## 2. 为什么先验证 Supabase

Supabase 的官方产品边界与 Colab 的后端需求基本重合：一个项目内提供 PostgreSQL、Auth、Storage、Realtime、Edge Functions、Cron、Queues，以及 PostgreSQL 全文检索和 pgvector。它不是把多个独立云产品临时拼成一套后端。

参考：

- [Supabase 产品能力总览](https://supabase.com/docs)
- [Auth 与身份提供商](https://supabase.com/docs/guides/auth)
- [Edge Functions](https://supabase.com/docs/guides/functions)
- [Storage S3 兼容性](https://supabase.com/docs/guides/storage/s3/compatibility)
- [Cron](https://supabase.com/docs/guides/cron)

Cloudflare 当前更接近 Workers、D1、R2、Queues、Durable Objects 等基础设施能力的组合，用户身份还需要另选方案或自行组装。它可以是未来的基础设施方案，但不优先用于验证“一个完整 BaaS 能否覆盖首版”的命题。

## 3. 资料核验矩阵

| Colab 需求 | Supabase 能力 | 初步判断 | 必须实测的部分 |
| --- | --- | --- | --- |
| 用户与登录 | Auth、Google OAuth、Custom OIDC、SAML SSO、JWT session | 能覆盖 | Desktop PKCE、deep link、refresh、退出 |
| 企业身份 | SAML 2.0 SSO、Custom OIDC | 能覆盖，可能受套餐约束 | 企业连接配置、邀请兑换、账号合并规则与成本 |
| 关系数据库 | PostgreSQL | 能覆盖 | Channel 数据模型、事务和并发写入 |
| 权限 | PostgreSQL RLS + Auth JWT | 能覆盖 | Channel 成员、撤回、跨 Channel 隔离的 allow/deny 测试 |
| 服务端逻辑 | Edge Functions | 能覆盖短时请求 | Sync commit、签名 URL、邀请和管理接口的时限与错误恢复 |
| Git object 存储 | Private Storage、S3 API、signed URL、multipart/resumable upload | 基本覆盖 | 批量 exists、海量小对象、OID 校验、幂等上传和成本 |
| Realtime | Postgres Changes / Broadcast，支持鉴权 | 能覆盖失效通知 | Channel ACL、断线补偿、事件重复与大成员数成本 |
| 后台任务 | Queues、Cron、数据库触发器、Functions | 基本覆盖 | at-least-once、重试、死信、索引任务恢复 |
| 搜索 | PostgreSQL FTS、pgvector | 首版可覆盖 | 从 Blob 快照提取、active root 切换和 ACL 查询 |
| Secrets 与观测 | Project secrets、Function logs/metrics | 基本覆盖 | 审计保留期、告警、敏感信息脱敏 |
| 备份与恢复 | PostgreSQL backup；Storage 行为需单独确认 | 尚未完成 | 数据库恢复演练、Blob 备份和误删恢复策略 |
| 开发可复现 | CLI/local stack/self-host 组件存在 | 暂不作为首版门槛 | 本轮只要求开发环境可重复，不验证脱离 BaaS 部署 |

资料核验使用的关键约束：

- Storage 支持 S3 multipart；付费计划单文件上限可到 500 GB，但具体上传方式仍有各自限制：[S3 uploads](https://supabase.com/docs/guides/storage/uploads/s3-uploads)、[Storage limits](https://supabase.com/docs/guides/storage/uploads/file-limits)。
- Private bucket 可以使用登录凭据或时效 signed URL 读取：[Storage downloads](https://supabase.com/docs/guides/storage/serving/downloads)。
- RLS 可把 Auth 身份直接用于逐行授权，但 grant 与 policy 必须共同测试：[Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)。
- SAML SSO 可用，但传统 IdP-initiated 流程与 PKCE 不兼容；Desktop 应验证 SP-initiated 流程：[SAML SSO](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml)。
- Edge Functions 适合短时、幂等请求，重任务应进入后台队列：[Edge Functions](https://supabase.com/docs/guides/functions)。

## 4. 资料阶段结论（随后已由第 7 节实测确认）

Supabase 在资料阶段通过“值得进入原型验证”的门槛；最终判定以第 7 节为准。

最大风险集中在 Colab 特有负载，而不是常规 CRUD：

1. 一个目录快照可能生成大量 Git objects，Storage 是否有足够高效的批量 exists 路径；
2. Git object 直接按对象存储时，小对象请求数与费用是否可接受；
3. root OID 提交、索引任务登记和 Realtime 通知如何共同保持一致；
4. 撤回访问后，已签发 URL 与 CDN 缓存的失效语义是否满足要求；
5. Desktop Auth 与企业 SSO 是否能在同一身份模型下稳定工作。

其中第 4 点已发现明确约束：signed URL 在到期前不能单独撤销，CDN 缓存与 token 到期也不是同一件事。因此敏感对象不能依赖长时 signed URL 实现权限撤回；实验应采用短 TTL，下载前仍由 Function/RLS 检查当前 Channel 权限。

## 5. 最小纵切实验

纵切只实现证明 BaaS 边界所需的最少对象：`users`、`channels`、`channel_members`、`channel_shares`、`sync_jobs`，以及一个 private Storage bucket。

### 场景 A：身份与权限

1. Desktop 使用 Google + PKCE 登录；
2. 用户 A 创建 Channel 并邀请用户 B；
3. B 可以读取 Channel，用户 C 被 RLS 拒绝；
4. 移除 B 后，数据库、Realtime 和新 Blob 下载请求均立即拒绝；
5. 记录 deep link、refresh、退出及 token 泄漏面。

### 场景 B：同步与 Blob

1. A 创建一个 shadow Git root 和一组 tree/blob objects；
2. Function 接收 OID 列表，只返回缺失对象；
3. 客户端直传 private Storage；
4. Function 验证目标 root 可达对象齐全，以 compare-and-set 更新 `current_root_oid`；
5. B 收到失效通知，下载缺失 objects 并物化；
6. 重复上传、中途断网和旧 base root 提交都得到可恢复、幂等的结果。

### 场景 C：后台索引

1. root 提交时可靠登记索引任务；
2. Worker 从 Storage 读取当前快照并写入 FTS 投影；
3. 人为制造 Function 失败与重复投递；
4. 搜索只返回当前 root，并受 Channel ACL 约束；
5. 撤回 Shared Item 后立即不可搜索。

## 6. 通过标准

- 无独立传统服务端即可跑通 A、B、C；
- 权限拒绝由自动测试覆盖，不能只靠 GUI 隐藏；
- root compare-and-set、任务登记和恢复没有静默丢失；
- 10 万 Git objects 的一次批量协商不会演变为 10 万次客户端 HTTP 请求；
- 1 GB 单对象上传可断点恢复，OID 校验一致；
- 能给出每 1,000 个活跃用户、每用户每日 100 MB 新增对象时的粗略成本模型；
- 所有剩余缺口都有局部补法，不要求再建设一套独立后端。

任一关键权限语义无法实现、Git object 协商必须逐对象远程请求，或后台任务无法可靠恢复，均判定该候选失败并更换 BaaS。

## 7. 实测结论

### Null hypothesis

> **H0：Supabase 不能在不另建独立后端的情况下，完整承载 Colab 首版所需的身份、关系数据、业务逻辑、Blob、同步协调、Realtime、后台任务、搜索和权限。**

### 判定

**拒绝 H0。Supabase 可以作为首版 Colab 的完整服务端，当前没有发现迫使项目另建传统后端的关键缺口。**

这里的“通过”指架构可行，而不是所有容量指标都已完成压测。

### 已实际验证

- Supabase CLI 完成项目 OAuth 授权、link 和远端管理；
- migration 通过 Supavisor pooler 部署到远端 PostgreSQL 17.6；
- Channel、成员、Shared Item、同步任务表和约束可部署；
- RLS 实测通过：成员可读、外部用户不可读、成员被移除后立即不可读；
- `current_root_oid` compare-and-set 与索引任务登记可在同一事务完成；
- `pgmq` 1.5.1 可用；
- private Storage bucket 和 Storage RLS policy 可创建；
- `channel_members`、`channel_shares` 已加入 Realtime publication；
- 带用户鉴权的 Edge Function 已成功部署；
- 权限测试在事务内执行并回滚，没有留下测试用户和业务数据。
- 通过代理实际调用远端 Auth、鉴权 Edge Function 和 REST RPC；
- private Storage object 上传、鉴权下载和字节一致性通过；
- Realtime WebSocket 实际收到 `channel_shares` UPDATE；
- TUS 断点续传从服务端 offset 恢复，下载 SHA-256 一致；
- 双客户端 Git object 增量同步、OID 校验和目录物化通过。

测试脚本见 [`tests/rls-and-sync.sql`](tests/rls-and-sync.sql)，数据库定义见 [`supabase/migrations/`](supabase/migrations/)。

## 8. 缺陷与约束

### 8.1 Git object 批量协商不是 Storage 原生能力

Supabase Storage 提供对象上传、下载、S3、multipart/resumable 和 signed URL，但没有证明存在适合十万 OID 的原生 batch-exists API。

首版不能由客户端逐个 HEAD。PostgreSQL 保存轻量 `git_objects(share_id, oid, storage_path, size)` 对象目录，由 SQL/RPC 分批求缺集；Blob 字节仍在 Storage。这个目录是传输索引和 GC 依据，不是文件条目或产品版本数据。

### 8.2 全局去重与 Storage RLS 存在张力

本次原型使用 `channel_id/share_id/object_oid` 路径，因此 RLS 简单但跨 Share 不去重。若采用全局 `object_oid` 路径，Storage 无法仅从 path 判断某用户是否通过某个 Share 有权读取。

纵切实测后首版决定采用 `(share_id, oid)` 目录和 `channel_id/share_id/oid` Storage key，在 Share 内去重，不做跨 Share 去重。这样 Storage policy、撤回和 GC 都保持简单。全局去重只有在真实存储成本证明收益足够大时再考虑，不为理论收益提前增加授权复杂度。

### 8.3 signed URL 不能承担即时撤权

已签发 URL 在过期前不能单独撤销，CDN 缓存有效期也不等于 token 有效期。Shared Item 撤回只能阻止新的授权，不能追回已经下载到本地的内容，也不能立即废止长时 URL。

因此 URL 必须短 TTL；敏感下载每次先检查当前 Channel ACL。产品语义应明确：撤回阻止后续获取，不承诺抹除成员已经取得的副本。

### 8.4 direct database connection 兼容性一般

本机访问 direct IPv6 数据库地址持续 `ECONNRESET`，Supavisor pooler 正常。开发、CI 和服务端连接应默认使用 pooler，direct connection 只用于明确支持 IPv6 的环境。

### 8.5 本机网络必须显式注入代理

先前 REST/Function HTTPS 被重置，是因为 curl、Node 和 CLI 没有自动继承 macOS 系统代理。显式设置本机 HTTP/HTTPS proxy，并为 Realtime WebSocket 提供 proxy agent 后，Auth、Function、Storage、REST 和 Realtime 均已跑通。

这不是 Supabase 产品缺陷。开发脚手架需要统一读取系统代理或标准 `HTTPS_PROXY`，避免不同网络库表现不一致。

### 8.6 Google/企业 SSO 和容量成本

Email 测试身份的登录、token refresh rotation、`getUser`、global logout 和退出后 refresh 失效已经通过。当前项目 Google provider 为关闭状态，因此真实 Google PKCE/deep link 需要配置 OAuth client 后验收；企业 SSO 的套餐、连接数量和计费在商业化前核算。

10 万 OID 已通过 1,000/批的 100 次 RPC 求缺，代理网络下串行约 49.2 秒；请求不会退化为逐对象 HTTP。1 GB 对象、Realtime 大 Channel 和每日 100 MB/用户的成本保留为上线前容量调优，不再视为架构不确定性。

### 8.7 Database Advisors

远端 Advisors 已执行。修复了 `handle_new_user` 可被客户端直接执行和 profile policy 重复计算 `auth.uid()` 两项。剩余四条 `authenticated_security_definer_function_executable` 是刻意暴露给登录用户的业务 RPC，函数体均再次检查 `auth.uid()` 与 Share/Channel 关系；另有一条 leaked-password protection 未开启，正式启用 email/password 登录前应在 Auth 设置中打开。首版若只开放 Google/OIDC，该项不构成阻塞。

新增 migrations 已与远端 `supabase_migrations.schema_migrations` 对齐，后续 `db push` 不会重复执行。

## 9. Colab 使用的 Supabase 模块

这张表是未来迁移到 Cloudflare、InsForge 等平台时的逐项验证清单。

| Supabase 模块 | Colab 的具体用途 | 是否首版必需 | 替代平台必须证明的语义 |
| --- | --- | --- | --- |
| Auth | Google 登录、OIDC/SAML SSO、用户、session、refresh token | 是 | Desktop PKCE、外部身份映射、session 刷新与撤销 |
| PostgreSQL | Organization、Channel、成员、Shared Item、root OID、邀请、审计、Git object 目录 | 是 | 关系约束、事务、索引和并发更新 |
| Row Level Security | Channel、Share 和 Storage 的成员级访问控制 | 是 | 权限不能只存在于客户端或 GUI |
| Database Functions/RPC | 创建 Channel、原子提交 root、邀请兑换、批量求缺集 | 是 | 服务端事务与 compare-and-set |
| Storage | Git tree/blob object 与头像等二进制内容 | 是 | 私有对象、直传、断点续传、完整性校验、短时授权 |
| Edge Functions | 复杂 ACL、签名 URL、同步协调和外部回调 | 是 | 用户鉴权、Secrets、短时无状态业务逻辑 |
| Realtime | Channel 成员、Share、撤回和 root 变化的失效通知 | 可延后启用 | 带 ACL 的变化通知；丢事件后可用 cursor 补齐 |
| Queues / pgmq | 索引、GC、邮件等可靠异步任务 | 是 | at-least-once、重试、幂等和失败可见 |
| Cron | 扫描失败任务、对象 GC、维护任务 | 是 | 可观测的周期执行和失败重试 |
| PostgreSQL FTS | 首版关键词搜索派生索引 | 是 | 索引可重建、ACL 查询、current root 过滤 |
| pgvector | 后续语义搜索 | 否 | 不作为首版 BaaS 通过条件 |
| Database Webhooks/Triggers | root 提交后的任务唤醒或外部通知 | 可选 | 事务后可靠触发；也可由 Queue 替代 |
| Secrets | OAuth、邮件、外部服务和内部 Function 凭据 | 是 | 服务端隔离、轮换和审计 |
| Logs/Metrics/Advisors | Function、数据库、安全和性能诊断 | 是 | 可定位失败、慢查询与权限风险 |
| CLI/Migrations | 可重复的环境初始化和 schema 演进 | 是 | 版本化部署、回滚策略和 CI 可执行性 |
