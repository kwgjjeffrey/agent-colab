# GA 前界面审查 · 2026-10-07

结论：保留现有 Channel 侧栏、工作区 tabs 与详情 Drawer。需要统一的是对象、行布局、文字层级和操作位置，不是增加导航层或重建产品。

## 参照与取舍

| 官方参照 | 可借鉴的原则 | Colab 的应用 |
| --- | --- | --- |
| [Slack：为聚焦重设计](https://slack.com/blog/productivity/a-redesigned-slack-built-for-focus) | 稳定导航与活动入口，工作区保持聚焦 | 不再添加重复功能入口；Home 展示协作动态 |
| [Airtable：Record detail](https://support.airtable.com/articles/5805061650-airtable-interface-layout-record-detail) | 不同视图复用对象详情布局 | 同一个 User、Agent、资源复用同一胶囊和身份卡，而非各处另画一套 |
| [Asana：导航](https://help.asana.com/s/article/navigating-asana) | 全局导航、页面工具栏、内容区域分层 | tab 不动；统一各 tab 的工具栏基线和主操作位置 |
| [Discord：形状、样式和间距](https://discord.com/blog/improving-mobile-with-squircles-styles-and-spacing) | 身份与内容的视觉语义、明确间距及对比 | 头像仍表示人；资源使用类型图标；次级内容退到更轻的层级 |

以上是官方产品说明和设计示例的比较，不声称登录这些产品完成了全功能走查。官网参考 [Linear](https://linear.app/) 和 [Raycast](https://www.raycast.com/) 的克制排版、产品展示与明确下载入口，不复制其品牌视觉。

## 我们自己的实际截图

安装态实际截图保存在本地 `dist/ga-review/`，因含真实成员及工作内容，不提交到公开 Git：

- `home-before.jpg` / `home-after.jpg`：Activity 修改前后。
- `messages.jpg`：消息流、头像、胶囊和右侧成员区。
- `sessions.jpg`：长标题、贡献者与列表密度。
- `files-empty.jpg`：空态与共享入口。
- `canvas.jpg`：文档树、编辑区和页面主操作。
- `settings.jpg`：账号、运行环境与更新区。

Files 有内容的列表本轮未取得可靠截图，因此不将它标记为已目视审查。移动端不是当前桌面产品的验收范围。

## 已修复并发布

Activity 的标题及富文本预览复用 MentionCapsule；真实 actor/Agent ID 由服务端提供，不根据名称猜测。标题统一为完整句子。标题 14px、详情及时间 12px，详情 normal/muted，行统一 `py-4`。整行点击/Enter/Space 打开精确对象或任务；内部胶囊打开 Profile，不触发整行跳转。预览仅取当前分页里的关联消息，并限制文本及节点数量，不读取整个 Channel 的资源正文。

## 建议下一批：只做视觉一致性

| 优先级 | 现状 | 小范围改法 | 验收标准 |
| --- | --- | --- | --- |
| P1 | Sessions 长标题、贡献者及动作的视觉位置不够稳定 | 标题/元数据/动作采用同一行网格；贡献者留在次级区；对象类型图标与人头像分开 | 长标题不挤走动作，贡献者不被误认作资源本身 |
| P1 | 各 tab 的内容宽度、顶部操作基线有差异 | 按列表型与编辑型两类统一容器、工具栏高度和内边距；不强行让 Messages 变成居中卡片 | 切 tab 时主要操作位置可预期 |
| P1 | 空态解释与实际按钮距离较远 | 在空态说明附近放已有真实主动作，减少视线往返 | 初次用户看到说明即可继续，不新增虚构流程 |
| P1 | 次级动作依赖 hover，键盘用户可发现性不足 | 统一 hover/focus-visible 行操作；重要主动作保持可见；统一 Tooltip | 鼠标与键盘都能发现、触发和退出 |
| P1 | Settings 多类内容视觉分隔不够清楚 | 统一 section 标题、间距、说明字号和危险操作语义 | 不移动认证或运行时业务逻辑，不重设计账号流程 |
| P2 | 大窗消息长行及部分列表空白较多 | 统一行内文本上限与内容密度，先保留当前布局 | 不截断正文、不损失上下文，不增加新密度设置 |

建议尺度：4/8px 间距网格；正文/标题与元数据明确两层；Lime 主要用于主操作，角色颜色与执行状态颜色不可混用。Popover/Drawer 均复用现有 shadcn 组件并验证限高、滚动、焦点及关闭。原生可拖拽标题栏是保留项。

本轮不扩展功能、不做自动排程、不增加新页面、不预取全量对象。上述 P1/P2 是待 review 的审查建议，不冒充已经翻修完成。
