# V-LOCAL-01：Desktop Application Core

状态：通过

## Null hypothesis

> GUI 与多个 Agent runtime 无法安全地复用 Desktop App 内同一个 Application Core，因而必须预先拆出另一套 Local Gateway 服务。

实测拒绝该假设。

## 已验证

- Core 持有 Supabase 用户 token，GUI/Agent 只持有本机随机 bearer token；
- 错误本机 token 返回 401；
- GUI mock、Agent A、Agent B 同时请求同一个 Share 同步；
- 三个调用者收到相同结果，Core 实际只执行一次远端同步；
- 任务状态由 Core 独占写入 SQLite；
- GUI 调用结束后，Agent 仍可读取任务状态；
- Local API 响应不包含云端 access token。

因此首版保持一个 Desktop App 交付单元：UI、Application Core 与 Local API Adapter 可以在同一应用进程内。关闭窗口不等于退出应用；需要后台工作时由应用生命周期保持 Core。只有未来出现独立开机常驻、跨用户 session 或进程崩溃隔离要求时，才考虑把相同 Core 搬到独立后台进程。

原型使用 Node 内置 SQLite，仅验证职责和并发语义，不构成正式技术栈选择。
