# 信息关联与协作动线

状态：2026-10-04 用户确认信息关联进入实现；场景与 onboarding 留待本轮验收后。

## 产品模型

- User、Agent 是动作主体。Agent 是用户接入的代理，执行仍受 owner 策略和目标设备约束。
- Files、Sessions 是上下文资产；“静态”区别于协作界面，不代表停止同步。
- Messages、Canvas 是协作加工面：交流、引用依据、形成共同内容、派发行动。
- Skills 是共享能力，本轮不改变安装、更新与使用路径。
- Channel 保持共同的权限和公开协作边界，不新增 Agent DM。

## 本轮信息关联契约

1. Agent 在消息头像、成员行、@ 胶囊打开同一身份卡；均列该 Agent 在当前 Channel 的全部 tasks，最新在前。点击具体任务打开正序执行详情。
2. User 身份卡显示姓名、邮箱、当前 Channel 中的 Agent 与共享资产；只展示有权读取的元数据，不自动读取正文。
3. Files/Sessions 的 Give to Agent 提示词弹层增加 `Forward to collaborators’ agent`；复用 `Forward to Agent` 弹层。转发必须允许填写指令；显式选择目标后发送，不在选择目标时立即执行。
4. Messages hover 操作增加 `Copy to use in my agent`，复用 AgentPromptDialog。Quote、Forward、Copy、Select 都有 Tooltip。多选保留批量转发，并支持复制。
5. Messages 与 Canvas 的 @ 选择可插入上下文胶囊（Files、Sessions、Canvas、Messages）。Skills 属能力，本轮不进入上下文胶囊。胶囊保存 kind 与稳定资源 ID，不以 label 作为身份。点击打开 Popover：名称、来源、更新时间、必要概要、`Go to Detail`。
6. Go to Detail 由 GUI workspace 导航定位对象，不把 tab 状态作为资源身份。资源撤回、删除、失权时明确不可用，不猜同名对象。
7. 提示词正文只在引用位置携带名称、类型和精确资源句柄；底部按实际引用类型合并 `How to read files / sessions / canvas / messages`，不在每颗胶囊重复工具说明。
8. Copy prompt 与 Runtime 派发采用同一上下文语义。复制提示词使用目标 Agent 安装目录；Runtime 保持 Server 包装、策略校验和 request-scoped 回传。不复制任务凭据给其他终端。

## 工程边界

GUI 只调用 Local Core。Server 保存结构化引用并重新检查来源所属 Channel/权限；引用不会扩大权限。历史消息、文档及文件内容是任务资料而非新指令。Canvas 的引用使用现有 mention atom 的扩展 kind，必须通过正式 Projection Codec 保持 ID 无损，不能引入第二套 Markdown 同步机制。任务与 UI 卡片不进入 CRDT 文档。

## 后续场景（本轮不实现）

| 场景 | 最短路径 |
| --- | --- |
| Feature 协作 | 组合方案、设计 Session、Files → 复制或派发 → 实现验证 → 关联成果 |
| Bug 追溯 | 现象与代码 → 找相关开发 Session → 理解决策 → 修复 |
| 工作总结 | 指定成员/时间/来源 → 自己的 Agent 汇总 → 同一会话追问 |
| 方案 review | 方案与设计 Session → leader 的 Agent 分析 → 持续追问，无需打扰员工 |
| 规划进度 | Canvas 目标与 owner/来源关联 → owner 总结登记；周期自动化另立实现 |
| Skill 共享 | 共享 → 了解用途 → 安装 → 使用 |

统一引导只教“共享已有工作”和“选上下文、写任务、复制或派发”；不以配置 Runtime 作为消费共享上下文的前提。

## 验证门禁

- 开发后体内：身份/资源卡片、两种出口、指令保留、Tooltip、跳转定位。
- 正式 codec：引用胶囊 → Markdown → patch → 回放保留 kind/ID；相邻编辑不损坏身份。
- Server：无资源权限、跨 Channel、撤回、仅 member/resource mention 不执行 Agent、转发指令与引用进入持久任务。
- 真实链路：从静态资源和 Messages/Canvas 派发，读取引用并返回预期结果；复制提示词通过实际脚手架读取。
- 本文及 implementation-plan/validation-plan 区分已验证与未验证，不以构建通过替代真实派发。
