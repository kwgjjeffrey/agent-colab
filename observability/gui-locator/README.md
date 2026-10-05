# Agent Colab GUI trace 定位

这是 Agent Colab 的项目适配器。正式入口清单由独立 Trace Skill 的 MCP App 提供；此服务不提供另一份清单页面。

启动：`node observability/gui-locator/server.mjs`。默认监听 `127.0.0.1:53480`，可用 `TRACE_LOCATOR_PORT` 修改。Trace App 启动时配置 `TRACE_LOCATOR_URL=http://127.0.0.1:53480/locate` 与 `TRACE_LOCATOR_EMBED_URL=http://127.0.0.1:53480/embed`；默认信任的目录来源为 `TRACE_CATALOG_ORIGIN=http://127.0.0.1:53481`。正式浏览器目录直接在右侧嵌入真实 GUI，通过限定父窗口和来源的消息定位。

`/locate?operation=<registered-id>` 展示已安装的真实 Colab GUI，读取项目统一注册表，导航到对应页面并呼吸高亮。`/` 是同一 GUI 的认证代理；没有第二个 Trace 清单。`/trial` 已停用并返回 410。

定位不执行目标业务动作；缺失资源或权限时明确报告所属区域及前提。认证信息仅由服务读取受保护的 Core discovery 文件，浏览器不接触 bearer。HTTP/WS 只接受本机同源请求。

本机 LaunchAgent 为 `personal.trace.locator`；正式 Trace App 为 `personal.trace.catalog`。两者均使用持久 plist 的 RunAtLoad/KeepAlive。代码修改后重启定位服务，GUI 属性修改按 GUI 制品发布流程构建、安装。


### 2026-10-05 正式 Trace App 定位页面修复

先前仅有独立试验页、正式目录却无真实 GUI 预览的状态已被替代。正式浏览器入口 http://127.0.0.1:53481/ 现在拥有左侧统一入口清单、右侧真实 GUI；点击 GUI 入口通过项目适配器 /embed 在同页导航和呼吸高亮，重复定位保留 GUI 状态。Skill 入口显示实际脚手架命令。项目适配器迁至 observability/gui-locator，旧 /trial 返回 410，启动使用持久 LaunchAgent。

实际浏览器点击验证 channels.list、messages.send、system.check-update、system.update 均在正式页面产生对应高亮，未执行目标业务操作；browser.open 显示 colab-browser open。截图为本机验收快照，不纳入 Git。GUI 定位回归 4/4、Trace 工具测试 7/7、注册绑定审计 92/92 通过。本机 Trace Skill 已从独立源码仓安装 0.2.1-dev；这不是新的公开发行。MCP 宿主内嵌渲染未在本次验收范围内。
