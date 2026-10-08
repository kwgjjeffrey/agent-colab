# Agent 脚手架与接口设计

Local Core GET/PATCH /v1/auth/profile provides the current account profile and display-name update, without returning credentials. Google linkage remains the existing browser OAuth flow. Account/profile settings are global, not Channel membership mutations.

Channel invitation: `colab-install --with-app --invitation TOKEN` prepares existing signed artifacts/service, then invokes packaged `bin/colab-join`. The join entry preserves an authenticated account, otherwise calls Local Core device start; ambiguous accounts fail with `account_selection_required` before joining. It accepts through Local Core and returns only `joined` and Channel identity. `colab-open --channel ID` uses a bootstrap-preserved fragment to locate Channel Home. Invitation capabilities must not appear in ordinary receipts or regression evidence.

Canvas 投影实现（2026-10-04）：文本接口仍为 `read` / `apply-patch`，不暴露 CRDT
blocks。读取到的 `[@label](colab-mention:...)` 是胶囊身份的无损 Markdown 表达，
作为上下文时原样保留。每次提交一个 hunk；歧义上下文或无法往返的修改区域明确拒绝。
底层框架、保护边界和实现索引见 [Canvas 技术设计](canvas-technical-design.md#2026-10-04转换实现替换)。

状态：第三版契约草案

## 1. 设计原则

Channel 中的 Session、Files 和 Skills 都是 Shared Item。Agent 不应为每一种类型学习一套重复的 CRUD 工具。

接口分成两层：

1. **Colab Browser**：统一浏览和管理 Channel，发现 Shared Item、取得 Files 本地上下文、搜索，以及执行共享和撤回；
2. **Session Reader**：处理 Session 特有的分页阅读语义，接口复刻 Codex `read_thread` 的成熟模型；
3. **Skill Tool**：处理本机 Skill 来源发现以及共享 Skill 的安装生命周期和目标 Agent 适配，不把 Skill 降格为让 Browser 阅读目录。

Shared Item 的发现、权限、共享和撤回仍复用 Browser；真正消费时按类型进入适合的工具。Files 返回本地上下文，Session 进入 Reader，Skill 进入安装/更新工具。不要因为底层都可表达为文件快照，就强迫三者采用同一种使用方式。

## 2. 脚手架目录

```text
skills/colab/
├── SKILL.md
├── bin/
│   ├── colab-browser
│   ├── colab-session-reader      # 已实现 Session 增量同步、投影与分页读取
│   ├── colab-skill-tool          # 来源发现、状态、ensure/install/update/uninstall
│   └── colab-messages            # Channel 消息与 Agent blueprint 管理
├── lib/
│   ├── local_api.py
│   └── output.py
└── references/
    ├── browser-schema.md
    └── session-schema.md
```

可执行入口按产品语义分工，不再设置一个包办所有对象的 `colab.py`。它们调用本机 Colab Local API；`lib/` 只放共同的传输和输出代码。stdout 只输出 JSON；诊断写入 stderr；成功退出码为 `0`，输入或调用错误为 `2`，本机服务不可用为 `3`，同步或远端错误为 `4`。

`colab-messages` 与 GUI 调用相同的 Local API：`messages list|send` 按 Channel 名称或 ID 工作；`blueprint runtimes` 返回当前 Member 以“设备 + Coding Agent”登记的跨设备 runtime；`blueprint upsert` 强制接收一个精确、可用的 Codex `--runtime` ID，`list|select|remove` 管理 Agent 及其 Channel 关系。`request context` 只能为指定 request 向前读取其 Channel 历史，`request reply` 只能以该 request 的 target blueprint 向原 Channel 回传，调用者不能另传 Channel、sender、被 mention 成员或 reply target；Server 从 request 自动生成 `@requester` 与触发消息引用。可读名称必须唯一解析；歧义时脚本失败而不猜测。脚本不直连 Server，也不承载执行队列；Server 通过独立 runtime WebSocket 把已授权、已拼装上下文的命令交给精确 runtime。

Server 注入 provider session 的提示词只保留任务所需内容：当前发送人与完整 query、可选 reply chain、前十条去重近期对话、具体的 `request context` 加载命令、可选 blueprint instruction，以及具体的 `request reply` 发送命令。不向 Agent 介绍 blueprint/runtime 等产品实现概念，不注入泛化 Rules，不自动把 provider 的最终回答发往 Channel。准确模板与数据契约见 [`docs/architecture/agent-request-data-flow.md`](architecture/agent-request-data-flow.md)。

`blueprint upsert` 不再接受自由填写的设备名或 Agent 名；必须先用 `blueprint runtimes --channel <channel>` 获取平台已经登记的 runtime UUID。登记发生在该设备 Settings 安装/更新 Agent Colab Skill 时，已安装的旧设备会在读取安装状态时补登记。由此“MacBook 上的 Codex”和“Windows PC 上的 Codex”是两个可独立选择、独立在线状态的 runtime。

Skill 的 canonical name 是 `agent-colab`，Codex 中使用 `$agent-colab` 调用。安装后的稳定入口位于各 Agent 自己的 Skill 根目录，例如 Codex 使用 `~/.agents/skills/agent-colab/bin/colab-browser`。Desktop 根据实际安装 receipt 生成“给 Agent”指令，不向 Agent 暴露源码目录、缓存目录或随机 UUID 目录。

`bin/colab-open` 是跨平台 GUI 入口，而不是 setup 子命令：macOS 唤醒 LaunchAgent，Windows 唤醒用户级 `AgentColabCore` 计划任务；两者都等待 discovery 后用一次性 bootstrap URL 打开系统浏览器。Electron 只是可选宿主，不参与 Agent 调用或 Core 生命周期。

## 3. 统一资源模型

Browser 把 Colab 暴露为一棵可导航资源树。Canonical path 同时供 GUI 路由、Agent 引用、搜索结果和审计日志使用：

```text
colab://
└── channel/{channel_name}
    └── {item_name}
        └── {relative_path}
```

- Channel 是 Shared Item 的容器；
- Shared Item 是共享、给 Agent、撤回和版本管理的基本单位；
- Files 和 Skill 的 Shared Item 同时界定一个文件空间，内部内容直接使用相对路径寻址；
- Session 内部不是文件空间，其结构由 Session Reader 自己解释。

对象 URI：

```text
colab://channel/{channel_name}
colab://channel/{channel_name}/{item_name}
colab://channel/{channel_name}/{item_name}/{relative_path}
```

可读名称是日常选择器，不是数据库身份，也不反向限制用户命名。Browser 先使用 Local Core 当前登录账号与当前 Organization 过滤有权访问的 Channel，再沿完整的 `Channel 名/Shared Item 名/子路径` 收窄候选；子孙名称可以消除上层重名。完整路径仍命中多个对象时返回 `ambiguous_reference`，候选带创建时间、创建人/贡献者等判断信息以及精确 UUID ref。人确认后 Agent 才使用该精确 ref；UUID 不进入正常“给 Agent”指令或非歧义输出。

Organization 不写入默认 URI，因为当前 Organization 是 Local Core 的显式账号状态。切换 Organization 后，同一可读 URI 会在新的租户范围内重新解析；Browser 不得跨 Organization 猜测或聚合结果。

GUI 使用相同 canonical path，仅把 scheme 替换为应用路由前缀；筛选、tab 和预览方式等展示状态放在 query 中，不进入资源身份。

Shared Item 的 `item_type` 首版包括：

```text
session | files | skill
```

Files item 的内部路径指向目录和文件。Skill item 同样通过相对路径暴露 `SKILL.md`、scripts、references 和其他包内文件。Session URI 后不继续拼接通用内容路径，完整对话使用 Session Reader 读取。

## 4. 通用响应

成功：

```json
{
  "ok": true,
  "data": {},
  "next_cursor": null
}
```

失败：

```json
{
  "ok": false,
  "error": {
    "code": "not_found",
    "message": "Shared item not found",
    "retryable": false
  }
}
```

资源统一包含：

```json
{
  "ref": "colab://channel/Developer%20Platform/auth-prototype",
  "kind": "item",
  "item_type": "files",
  "name": "auth-prototype",
  "summary": "Authentication prototype and design notes",
  "contributor": { "id": "u_1", "name": "Li Si" },
  "root_oid": "git:...",
  "updated_at": "2026-09-25T10:30:00Z",
  "capabilities": ["open", "give_to_agent"]
}
```

`capabilities` 由权限和资源类型共同决定。对象所有者可能额外获得 `withdraw`；当前设备可贡献的本机来源可能获得 `share` 或 `update`。

## 5. `colab-browser`

一个脚本提供统一的资源浏览与管理操作，首个参数是 operation。原则上，GUI 中存在的产品能力也必须能由 Agent 通过脚本完成；两者共享底层 capability 和权限检查，但不要求逐个复刻页面控件。

### 5.1 `open`

打开任意 Colab 资源。打开根或 Channel 时返回其直接子项；打开 Shared Item 时返回元数据、本地同步状态，以及该类型应使用的本地消费者。

```bash
colab-browser open \
  --ref 'colab://channel/Developer%20Platform/auth-prototype' \
  [--cursor CURSOR] \
  [--limit N]
```

常见用法：

- `--ref colab://`：列出可访问 Channel；
- `--ref 'colab://channel/Developer%20Platform'`：返回 Channel 及其 Shared Item；
- `--ref 'colab://channel/Developer%20Platform/auth-prototype'`：返回 Shared Item 元数据、是否已同步到本地和消费方式。

Files 的内部路径不是服务端 Browser API；同步到本地后，Agent 使用 `rg` 和文件读取工具。Session 转由 Session Reader。Skill 由待设计的 Skill Tool 安装或更新到指定 Agent 目标，之后交给该 Agent 的原生 Skill loader；Browser 不把一个临时物化目录直接当成“已经可用的 Skill”。

### 5.2 `search`

搜索 Channel、Shared Item 元数据及其当前快照的派生内容索引。

```bash
colab-browser search \
  --scope CHANNEL_OR_ITEM_URI \
  --query TEXT \
  [--item-type session|files|skill] \
  [--contributor USER_ID] \
  [--cursor CURSOR] \
  [--limit N]
```

输出 `data.matches[]`：`item_ref`、`item_type`、`name`、`contributor`、`snippet`、`location`、`score` 和 `indexed_root_oid`。

- Session 的 `location` 是来源 reader 可解释的 turn/message 定位；
- Files 与 Skill 的 `location` 是相对路径和行范围；
- 如果当前快照尚未完成索引，响应在 `data.pending_items[]` 中返回对应 Shared Item，而不返回旧快照的正文命中。

搜索只负责发现，命中后仍需同步 Shared Item 并通过本机工具或 Session Reader 阅读原文。

### 5.3 `use`

直接取得一个 Files Shared Item 的可消费本地上下文。Browser 在内部完成名称解析、存在性和权限检查；需要时同步当前快照，贡献者自己的来源目录直接复用。调用方不需要先 `open` 再 `sync`。Session 和 Skill 可以被 Browser 发现，但消费分别转交 Session Reader 与 Skill Tool。

```bash
colab-browser use \
  --ref 'colab://channel/Developer%20Platform/auth-prototype'
```

输出 `data.localPath`、`tree`、`kind` 和当前快照信息。`use` 会等待本次持久化刷新任务完成；如果 root OID 相同则直接复用，否则下载所需对象后原子物化。`tree` 是相对于 `localPath` 的目录项清单，Agent 无需再执行一次列目录操作才能判断应该读取什么。

- Files：`local_path` 是可由本机文件工具读取的目录或文件；
- Skill：Browser 返回对象引用和安装状态，要求调用 Skill Tool；
- Session：Browser 返回对象引用和 reader 类型，要求调用 Session Reader。

### 5.4 `create-channel`

创建 Channel。

```bash
colab-browser create-channel \
  --name "Developer Platform" \
  [--icon LOCAL_IMAGE_OR_EMOJI] \
  [--description TEXT]
```

输出新 Channel 的 `ref`、名称、图标、当前用户角色和创建时间。创建者成为 owner。

### 5.5 `update-channel`

修改 Channel 设置。未提供的字段保持不变。

```bash
colab-browser update-channel \
  --channel 'colab://channel/Developer%20Platform' \
  [--name NAME] \
  [--icon LOCAL_IMAGE_OR_EMOJI] \
  [--description TEXT]
```

只有具有相应权限的成员可以修改。输出更新后的 Channel 表示。

### 5.6 `members`

查看 Channel 成员。

```bash
colab-browser members \
  --channel 'colab://channel/Developer%20Platform' \
  [--cursor CURSOR] \
  [--limit N]
```

输出 `data.members[]`：用户标识、显示名、角色、加入时间和当前调用者可执行的成员管理能力。

### 5.7 `add-member`

邀请或直接加入成员，具体行为由部署环境的身份系统决定。

```bash
colab-browser add-member \
  --channel 'colab://channel/Developer%20Platform' \
  --user USER_ID_OR_EMAIL \
  [--role member|admin]
```

输出成员状态：`invited` 或 `joined`。当存在同名用户时不得猜测，返回候选并要求明确标识。

### 5.8 `update-member`

修改成员角色。

```bash
colab-browser update-member \
  --channel 'colab://channel/Developer%20Platform' \
  --user USER_ID \
  --role member|admin
```

### 5.9 `remove-member`

移除成员。

```bash
colab-browser remove-member \
  --channel 'colab://channel/Developer%20Platform' \
  --user USER_ID
```

这是有外部影响的管理操作。Agent 必须明确复述 Channel 和目标成员，并由本机 Rust Local Core 执行权限及确认策略；不要求 Desktop GUI 正在运行。

### 5.10 `share`

把当前用户拥有的本机对象登记为 Shared Item。

```bash
colab-browser share \
  --channel CHANNEL_URI \
  --item-type session|files|skill \
  --source LOCAL_SOURCE_REF \
  [--name NAME]
```

`LOCAL_SOURCE_REF` 不是任意上传路径字符串，而是 Local Core 已发现、由 CLI 明确登记或由桌面选择器授权的本机来源引用。成功返回新 Shared Item 的 URI、当前 root OID 和同步状态。

当调用来自 agent 时，Local Core 按本机授权策略执行；需要交互确认而 GUI 不在线时，返回结构化的 `confirmation_required`，CLI 可在终端完成确认。GUI 的“共享我的 XXX”调用同一底层 operation。

### 5.11 `withdraw`

撤回当前用户拥有的 Shared Item。

```bash
colab-browser withdraw --item ITEM_URI
```

成功返回 `state=withdrawn` 和生效时间。撤回作用于整个 Shared Item，不能对 Files 或 Skill 内部的单个路径单独撤回。

### 5.12 `changes`

获取某一范围从指定版本或 cursor 开始的变化。

```bash
colab-browser changes \
  --scope CHANNEL_OR_ITEM_URI \
  --since VERSION_OR_CURSOR \
  [--cursor CURSOR] \
  [--limit N]
```

输出新增、更新、删除或撤回的资源引用及新版本，供 agent 避免重复读取完整对象。

## 6. `colab-session-reader`

Session 的内部结构由专用 reader 解释，不进入 Browser 的通用资源模型。专项调研确认沿用成熟的 `read_thread` 形状：最近 turns、向历史分页、`includeOutputs`、`maxOutputCharsPerItem` 和 revision-pinned opaque cursor。持久化仍保留来源原始结构；统一结构只是在读取时由来源 adapter 投影出来，不写回真源，也不建立统一 `session_messages` 表。

### 6.1 `read`

```bash
colab-session-reader read \
  --ref ITEM_URI \
  [--cursor CURSOR] \
  [--turn-limit N] \
  [--include-outputs] \
  [--max-output-chars-per-item N]
```

`--ref` 使用和 Files 一致的可读完整路径，例如 `colab://channel/<channel>/<session>`；歧义时同样返回候选元数据和 UUID fallback。不传 cursor 时读取最新的若干 turns；传入上次响应的 cursor 时继续读取更早内容。cursor 固定到首次读取的 snapshot/revision，翻页过程中来源继续增长也不会造成重复或漏项。

成功输出保持一套小而稳定的 envelope：

- `schemaVersion`；
- `session`：Share ref、标题、贡献者、来源 Agent/provider、来源 schema、状态和安全的 workspace 描述；
- `snapshot`：当前固定的 root/revision 与同步时间；
- `turns[]`：`id/status/startedAt/completedAt/items[]`；
- `page`：`order=newest_first`、`limit`、`hasMore`、`nextCursor`；
- `freshness`：本次是最新同步、使用缓存还是后台同步中。

`items[]` 允许来源 adapter 暴露其原生 item 类型，例如 `userMessage`、`agentMessage`、`reasoning`、`commandExecution` 和 `mcpToolCall`。公共字段只覆盖类型、id、正文/摘要、工具名、参数、结果、状态和截断元数据；无法表达的来源字段保留在 adapter namespaced payload 中，不为了统一而丢弃。用户与 Agent 消息默认完整返回；`include-outputs` 只控制工具、命令和推理等执行细节，`max-output-chars-per-item` 只限制这些高体积 item，并明确返回 `truncated/originalChars`。

Session Reader 在本机解释来源原始快照。一次 `read` 内部完成权限解析、检查更新、拉取缺失 segment 和读取，不要求 Agent 预先调用 Browser。与 Files 一样，已有缓存可先读；刷新超时或离线时返回固定缓存并在 `freshness` 中明确说明，而不是把可用历史变成错误。

分发验收必须从临时安装树直接执行 `colab-open`、`colab-browser`、`colab-session-reader`、`colab-skill-tool` 和 `colab-setup`，不能用源码目录导入成功替代。真实跨账号 E2E 还要由账号 A 经 Browser 分别共享 Files、Session、Skill，账号 B 经三个专用入口完成可见、物化、读取、安装/卸载，最后由 A 撤回；这同时验证脚手架参数、Local API 权限和远端持久化契约。

首版不提供远端 session 正文搜索；需要搜索时先同步，再由来源 adapter 的本地索引/扫描能力完成。等真实使用证明需要语义分段时，再扩展 Reader，而不是现在预设 outline 或 section。

## 7. `colab-skill-tool`

Skill Tool 只处理 Skill 特有的来源发现和安装生命周期。Shared Item 的 Channel 浏览、共享与撤回仍属于 Browser。

```bash
# 搜索 Agent Skill 根目录中发现的来源；recent-hours 依据文件内容变化时间
colab-skill-tool sources [--query TEXT] [--recent-hours 48] [--channel CHANNEL_URI]

# 查看一个共享 Skill 在全部目标或指定目标的安装状态
colab-skill-tool status --ref ITEM_URI [--target codex|claude|myflicker]

# 安装；ensure 在未安装时安装、过期时更新、当前时无操作
colab-skill-tool install --ref ITEM_URI --target TARGET
colab-skill-tool ensure --ref ITEM_URI --target TARGET

colab-skill-tool check-update --ref ITEM_URI --target TARGET
colab-skill-tool update --ref ITEM_URI --target TARGET
colab-skill-tool uninstall --ref ITEM_URI --target TARGET
```

`sources` 返回 `sourceId, sourcePath, name, description, discoveredTargets, lastChangedAt`。自动发现与用户指定路径进入同一个 catalog；Browser 的 `share --item-type skill --source` 接受 `sourceId` 或明确的 Skill 根路径，并要求目录中存在合法 `SKILL.md`。

安装状态以 Local Core receipt 为准。`ensure` 返回 Skill 名称、实际安装路径、安装 `rootOid`、目标 Agent 和 activation 状态。若目标存在同名非托管 Skill，或已管理目录的内容被用户修改，所有写操作必须返回结构化 conflict，不能覆盖。更新判断只比较 receipt 的 `installedRootOid` 与共享对象 `currentRootOid`，不引入额外 Skill version。

## 8. “给 Agent”和“让 Agent 干活”

Shared Item 上的“给 Agent”传递一次可直接执行的 `use` 调用和用户指令，不暴露内部检查步骤或 UUID：

```json
{
  "instruction": "基于这个上下文继续排查登录问题",
  "channel_uri": "colab://channel/Developer%20Platform",
  "context_refs": [
    "colab://channel/Developer%20Platform/auth-prototype"
  ]
}
```

Agent 对指定 Files 对象直接调用 Browser `use`；类型检查、权限检查、同步与目录树生成属于该操作内部行为，随后使用本机文件工具。GUI 用可关闭弹层展示提示词；主操作复制并打开本机默认 Agent，其他已安装 Agent 收进下拉菜单。复制的命令必须使用目标 Agent 对应的稳定安装目录。首版只打开应用，不宣称自动粘贴；等目标 Agent 提供稳定入口后再接入。Skill 尚未安装或有更新时，“给 Agent”生成一次幂等的 Skill Tool `ensure`；目标已经安装当前 root 时，直接提供 Skill 名称和安装路径。Session 的“给 Agent”生成一次可执行的 Session Reader 调用，不经过 Browser，也不暴露本地缓存路径。

Channel 顶部的“让 Agent 干活”不传 `context_refs`，只传当前 `channel_uri` 和用户指令。Agent 使用 `open` 与 `search` 自主发现相关 Shared Item。

## 9. Gateway API 映射

脚本语义直接映射为统一 API：

```text
POST /v1/browser/open
POST /v1/browser/search
POST /v1/browser/use
POST /v1/browser/create-channel
POST /v1/browser/update-channel
POST /v1/browser/members
POST /v1/browser/add-member
POST /v1/browser/update-member
POST /v1/browser/remove-member
POST /v1/browser/share
POST /v1/browser/withdraw
POST /v1/browser/changes

POST /v1/readers/session/read
```

使用 operation endpoint 而不是为 Session、Files、Skill 分别复制 REST 资源接口，使脚本、MCP tool 和未来其他 agent 接入方式可以复用同一契约。GUI 调用相同的 application capability，不维护另一套 Channel 设置语义。

## 10. Quick Share

Quick Share 不属于 `colab://channel/...` 资源树。创建方通过 Browser 的 `create-transfer` 选择本机来源和 TTL；消费方使用独立的 `colab-transfer receive --capability URL_OR_TOKEN`。该入口在一次操作中校验 capability、下载清单、按对象类型调用既有 Files/Session/Skill 消费 adapter，并返回可供 Agent 继续工作的本地结果。它不得要求接收者登录或加入分享者的 Organization。

提示词分两种：检测到 Agent Colab 已安装时直接调用 `colab-transfer receive`；未安装时先运行官方、带版本和摘要校验的 bootstrap 命令，然后调用同一入口。提示词可以携带 secret capability，因此 GUI 必须明确其默认有效期和转发风险；CLI 输出、错误与日志默认遮蔽 token，仅显示短 fingerprint。

已实现接口：

```text
colab-transfer create --item files=/path --item session=/path/thread.jsonl::codex-jsonl-v1 --item skill=/path/skill --expires-in 86400
colab-transfer receive --capability CAPABILITY
colab-transfer revoke --transfer-id TRANSFER_ID
```

Files 返回只读本地路径和树；Session 返回可继续分页的 Reader handle；Skill 返回可检查并安装到目标 Agent 的临时来源。Transfer 到期后已物化的本地副本仍属于接收者设备，服务端不能远程擦除；产品只承诺阻止新的获取和刷新。
## 11. Canvas document interface

Canvas is exposed to an Agent as a Markdown text projection, never as raw CRDT nodes or internal blocks. The request prompt supplies the exact document reference and presents tools in task order: read the current document first, apply a Codex-style patch only if the task requires an edit, and list other Channel documents only if broader exploration is needed. The prompt introduces optional commands with the unambiguous sentence: `Tools below are at your disposal if the user's task requires them.`

An Agent mention dispatch carries the full visible mention and its containing Heading section. The Server resolves the requester, document title, Channel name, and Agent blueprint from authoritative records; the GUI cannot inject a different identity or runtime destination. The Agent continues the persistent `(Canvas, Agent)` provider thread and edits through `colab-canvas`, so runtime delivery never writes Canvas storage directly.
