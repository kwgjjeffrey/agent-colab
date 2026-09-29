# V-SYNC-01 / V-SYNC-02：Supabase 双客户端同步

状态：通过

## Null hypothesis

> Git object OID + Supabase PostgreSQL/Storage 无法以合理的请求数量完成增量同步、冲突控制、断点恢复和另一客户端物化。

实测拒绝该假设。

## 已验证链路

1. Client A 使用独立 bare Git object database 和 index，从普通目录生成 root tree；
2. `missing_git_objects` RPC 以 1,000 OID 一批求缺，不逐对象发送 HTTP HEAD；
3. 缺失的压缩 Git object 原始字节上传 private Storage；
4. `register_git_objects` 登记 `(share_id, oid)` 传输目录；
5. `commit_share_root` compare-and-set 更新 current root，并在同一事务登记索引任务；
6. Client B 从 root tree 开始递归下载 tree/blob objects，逐个用 Git 校验 OID；
7. Client B `read-tree + checkout-index` 物化，目录内容摘要与 Client A 一致；
8. 第二次同步 8 个可达 objects 中只新增、上传并下载 4 个；
9. 使用旧 base root 提交返回冲突，不能覆盖新 root。

实测摘要：

```json
{
  "first": { "objects": 4, "missing": 4, "downloaded": 4 },
  "second": { "objects": 8, "missing": 4, "downloaded": 4 },
  "staleRootConflict": true,
  "elapsedMs": 14420
}
```

## 大对象中断恢复

使用 Supabase Storage TUS direct-storage endpoint 上传 18 MiB 随机对象：

- 固定 6 MiB chunk；
- 第一块上传后主动中断；
- HEAD 得到 `Upload-Offset: 6291456`；
- 从该 offset 继续两块；
- 下载后 SHA-256 与源文件一致。

这证明断点续传机制成立，并且恢复上传不需要重建 shadow tree 或改变逻辑 OID。1 GB 不再是协议验证项，只是上线前容量/耗时测试。

## 10 万 OID 求缺基线

- 100,000 candidates；
- batch size 1,000；
- 100 个 RPC；
- 当前本机代理网络耗时 49.2 秒；
- 返回 100,000 missing。

结论：请求数量不会退化成 10 万次。49 秒包含串行请求与代理延迟，开发阶段可以通过并发批次和更大的安全 batch 调优；它不改变协议。

## 验证中发现并修复的问题

### Storage policy 路径解析

原策略在子查询中把 `s.name` 当成 Storage object name，导致合法贡献者上传也返回 403。现已显式使用 `storage.objects.name`，并形成 migration。

### 去重作用域

若对象 key 为 `channel/share/oid`，全局 `oid` 目录会产生错误：另一个 Share 查询到 OID 已存在，却无权读取原 Share 的路径。首版改为 `(share_id, oid)`：

- Share 内完整增量去重；
- 权限和 GC 简单；
- 不做跨 Share 全局去重；
- 将来只有确认存储收益值得复杂授权时才调整。

## Realtime

通过代理建立 Supabase Realtime WebSocket，订阅 `channel_shares` 后实际收到 root 更新事件。Realtime 只作失效通知；重连后仍读取 current root，不依赖消息完整性。

## 运行

`src/validate.mjs` 是双客户端纵切，`src/validate-realtime.mjs` 是 Realtime 冒烟，`src/benchmark-missing.mjs` 是 10 万 OID 基线。凭据通过环境变量注入，未写入源码。
