# V-GIT-01/02：Shadow Git 验证

状态：V-GIT-01 通过；V-GIT-02 对 Files/Skills 有条件通过，对单文件追加式 Session 不通过

验证独立 Git object database/index 是否能在不接触来源 `.git` 的情况下，对显式共享目录生成 root tree，并测量全量与事件驱动增量成本。

原型刻意不使用 `git add --work-tree`：该方式会遵守来源 ignore 规则，并可能把嵌套仓库记录为 gitlink，不符合“显式共享整个目录”的语义。原型直接扫描文件系统、批量写 blob、维护独立 index，再由 `git write-tree` 生成 root OID。

## Null hypotheses

- **H0-GIT-01**：无法在完全不修改来源 `.git` 的情况下生成符合显式共享语义的 Git tree。
- **H0-GIT-02**：Shadow Git 在真实规模和追加式 Session 上的成本不可接受，不能作为统一快照与传输表达。

## 实测结果

功能夹具包含脏 tracked 文件、ignored 文件、untracked 文件、symlink 和嵌套 Git 仓库。

- 来源 `HEAD`、index hash、`git status` 在快照前后完全一致；
- ignored 与 untracked 文件被纳入，因为用户共享的是明确目录，而不是来源 Git 的 tracked set；
- symlink 以 mode `120000` 保存；
- 嵌套仓库内容被纳入，所有层级的 `.git` 元数据被排除；
- 修改一个嵌套文件后 root OID 正确变化。

基准环境为当前开发机/APFS：

| 场景 | 结果 |
| --- | ---: |
| 10 万小文件首次生成 tree | 192,278 ms |
| 已知单文件变化的增量更新 | 979 ms |
| 100 MiB Session 首次生成 blob | 614 ms |
| 追加 1 MiB 后重新生成 blob | 564 ms |
| 追加后新 blob 逻辑大小 | 101 MiB |

## 判定

**拒绝 H0-GIT-01。** 独立 object database + index 可正确隔离来源 Git，`V-GIT-01` 通过。

**不能整体拒绝 H0-GIT-02。** 分类型判定：

- Files/Skills：有条件通过。首次共享必须作为后台任务显示进度；正常更新必须由文件 watcher 提供变化路径，不能每次全量扫描 10 万文件；低频 reconciliation 也必须后台运行。
- 单文件追加式 Session：不通过。Git blob 是完整内容寻址对象，追加 1 MiB 会生成并需要上传一个 101 MiB 新对象。Git 能判断版本变化，但在“Blob Store 保存 loose Git objects”的传输设计下不会自动产生增量网络传输。

## 对设计的影响

Files 与 Skills 保留 shadow Git tree 方案。

Session 必须另行选择传输表示，候选包括：

1. 将原始文件按稳定边界切为不可变 chunk，tree 指向 chunks 与重组描述；
2. 使用来源本身的追加事件或记录边界形成 append-only segments；
3. 使用 Git pack/delta 传输，但这会把 pack 生命周期、重打包和 GC 带入服务端，复杂度明显更高。

优先验证 1/2。它们只改变传输封装，消费端仍可无损重组来源原始 Session，不转换消息语义。
