# Agent Colab output review

2026-10-04；用户已批准实施。这里审查的是 CLI 返回给 Agent 的 stdout，不是 GUI/API 的工程数据。

## 实施契约

六个协作 CLI 统一使用 `skills/colab/lib/output_views.py` 的逐操作字段白名单。
成功只含 `ok`、`data`，需要继续读取时加 `page`，无通用 null cursor。
翻页键分别是 `nextAfter`、`nextBefore`、`nextOffset`、`nextCursor`。
消息正文和 Markdown 胶囊表示原样保留；发送/保存只回回执。
Canvas apply-patch 只有 Core 已获远端确认的 Done 才回 applied:true。
Files tree 最多 500 条，超出显式 treeTruncated:true，可从 localPath 用原生工具继续探索。
Session 保留请求的正文与工具内容，但移除 session/snapshot/turn ID 等工程外层。
Skill 保留 targetAgent、state、installedPath、activation；版本 hash 不暴露。
成员保留 displayName/email/role/status（包括邀请未加入状态）。
安装器 setup 是更新程序依赖的机器接口，保留其 receipt，不适用协作 CLI 的精简契约。
下表是审查时建议，实际字段以这里及自动化测试为准；源路径用于 source 消歧仍保留。

## 原则

只返回本次任务内容、后续操作必需的寻址参数、必要的状态或失败原因。
不按“工程能拿到什么”设计输出。采用逐操作 allow-list，不用递归删几个字段的 blacklist。
ID 不是一律删除：消息引用、runtime 绑定、source 消歧等后续命令确实需要的 ID 必须保留。
不能把完整 API dump 藏进默认 debug 字段；诊断仍由工程观测链路提供。

## 逐脚手架结论与建议

| 入口/操作 | 已观察的问题 | 建议默认 data |
| --- | --- | --- |
| messages request reply | 返回整份 IM 对象：正文重复、ProseMirror JSON、头像、Channel ID、发送者、时间；无分页也带 null cursor | `{sent:true,messageId}`；已在源码修复 |
| messages send | 同样重复完整 IM 对象 | `{sent:true,messageId}`；发送成功不等于 Agent 任务完成 |
| messages list / request context | 富文本树与 body 重复，头像/Channel ID 无助理解；列表没有可用下一页提示 | 消息 `{id,seq,senderName,body,replyToMessageId?}`；外层仅有下一页时给 `nextAfter`/`nextBefore`。正文保留真实换行 |
| messages blueprint list/upsert | owner avatar、内部关联、设备/provider 重复；配置是否需要读取应区别于成员浏览 | 列表 `{id,name,ownerName,runtimeId,runtimeLabel,invocationPolicy,inChannel,editable}`；读取/编辑配置时才带 loadingInstruction/loadingCommand；写入只回 `{saved:true,id,name}` |
| messages blueprint runtimes | deviceId、skillVersion 与选 runtime 无关 | `{id,label,provider,available}`；不可用可给简短 reason |
| messages select/remove | 当前简短回执基本合理 | `{name,inChannel}` / `{removed:name}` |
| browser open/search | blacklist 只删除三字段，实际透传 contributorAvatarUrl、icon、内部同步字段；发现混入 localPath | Channel `{ref,name,role}`；Item `{ref,type,name,contributor,state,summary?,capabilities}`；更新时间仅在判断新旧有意义时保留 |
| browser use/sync | 消费混入发现/同步工程元数据 | `{ref,localPath,tree,readOnly}`；若离线读取旧副本必须说明 freshness，不能删掉会改变任务判断的警告；tree 应有上限/截断说明 |
| browser session-sources | source catalog 结果缺少明确的面向 share 的输入契约 | `{sourceId,name,provider,updatedAt}`；有重名时给区分所需路径；sourceId 必须能直接传 share，不额外展示多种内部 ID |
| browser create/update/share/withdraw/member mutations | 部分操作仍直接回传完整资源 | 创建/共享 `{created:true,ref,state}`，preparing 不能说 ready；更新 `{updated:true,ref}`；撤回 `{withdrawn:true,ref}`；成员 `{name,role}` 加 mutation 结果 |
| canvas list/create | 数据库 ID、parent/folder/channel IDs、schemaVersion、lastServerSeq、创建时间等透传 | documents `{ref,title,path,canEdit}`；folders `{path}`；创建 `{created:true,ref,title}` |
| canvas read | lastServerSeq 与 revision 重复；syncState 只在未最新时有意义；空 nextOffset | `{ref,path,content,offset,nextOffset?}`；revision 仅在写入并发校验要求传回时保留。离线/未同步警告不得省略 |
| canvas search | 现有 ref/path/line/text 基本合理 | `{ref,matches:[{line,text}],truncated?}`；revision 同 read |
| canvas apply-patch | 成功不能输出 CRDT/同步序号；还需实测正式返回字段 | `{applied:true,ref}`；离线持久化时 `{applied:true,ref,syncState:"saved_locally"}`，不能声称远端已同步 |
| session-reader read | turns 与工具输出是任务内容；page 内 snapshot 等工程状态应不透传；cursor 重复位置 | `{turns,nextCursor?}`；每 turn 只保留角色/正文和显式请求的工具记录。工具输出限长，必须标 truncated；snapshot-pinned cursor 是继续阅读必需，不删除 |
| skill-tool sources | sourceId/sourcePath 并列，discoveredTargets 等并非默认必要 | `{sourceId,name,description}`；同名需要路径区分时才给 path；share 可直接用 sourceId |
| skill-tool status/check-update | 当前把 installations 原样返回；hash 应变成业务状态，不交给 Agent 比较 | `{name,target,state,updateAvailable,locallyModified?}`；冲突时给可执行恢复说明 |
| skill-tool install/ensure/update/uninstall | ensure 原样展开 API 回执 | `{name,target,state,loadPath?}`；loadPath 仅 native loader 确实需要时给；不返回版本库/缓存路径 |
| transfer create | capability 是交付物，不能删；内部 manifest/存储目录不需要 | `{transferId,capability,expiresAt}`；只回一条 canonical capability，不重复完整提示词 |
| transfer receive | localPath/tree 是任务内容；传输机制字段不需要 | `{items:[{name,type,localPath,tree?,sourceAdapter?}]}`；adapter 仅 Session reader 后续需要时给 |
| transfer revoke | 当前简短回执合理 | `{transferId,revoked:true}` |
| colab-open | 成功 opened 已足够；失败暴露 discovery 路径 | `{opened:true}`；失败给 Core 不可用及恢复命令，不暴露内部 discovery 文件位置 |
| setup/colab-setup | 安装属于工程入口，与协作工具区别；完整安装 receipt 不应默认回给 Agent | 成功 `{installed:true,version,restartRequired}`；失败组件+原因+恢复动作，下载过程放 stderr，不打印凭证/详细配置 |

## 公共 envelope

成功保留 `{ok:true,data:...}`。只有分页操作携带 `page`，取消普遍出现的 `next_cursor:null`。
失败 `{ok:false,error:{code,message,retryable,action?}}`；歧义的 candidates 是下一步选择所需，应保留。
不得用 `sent/applied/installed` 混淆 provider 完成、远端同步、下载完毕。

## Recent conversation

现有 Server 源码以单个换行连接消息，不是完全没有换行；不足之处是缺少清晰的消息边界。
已改源码为：

```text
Recent conversation:
[Message 40 · Lin]
第一行
第二行

[Message 41 · Yu]
下一条消息
```

保留正文原始换行，不用把正文压为单行。引用也使用同一格式。当前只是 prompt 构造修复，
不是声称已核实所有历史消息写入阶段的段落到 plain text 转换。

## 本轮执行与边界

- 安装态真实成功执行：browser open（根/Channel）、session-sources；messages list、blueprint list/runtimes；canvas list/read/search；skill-tool sources。
- 隔离 CLI 子进程 fixture 成功执行：messages send/upsert/select/context/reply；transfer create/receive/revoke；session-reader read；skill-tool status/check-update；canvas read/search；colab-open 使用隔离 discovery 与 launcher。
- 六个协作 CLI 与 setup 的安装树 --help 均执行通过。Browser share/use 的 resolution/use-case 测试通过，但不是每个 browser mutation 的真实子进程验收。
- 25 项 Python 测试、6 项 Server 测试通过。没有对用户消息执行 reply 重发；没有生产创建、删除、安装/卸载来凑审查覆盖。
- 尚未逐项真实执行的成功路径：browser 全部成员/Channel mutation、Canvas create/apply-patch、Skill ensure/update/uninstall、真实 transfer 及完整 setup 安装。本表这些项来自源码/API路径审查，不冒充运行结果。
- 上述为审查轮覆盖记录；实施轮新增逐操作输出投影测试，所有六个协作 CLI 已接入公共白名单。发布与安装验收记录见 validation-plan。
