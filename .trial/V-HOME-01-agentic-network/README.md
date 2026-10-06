# Home 协作网络动效样板

第二版（2026-10-06）：横向窄条，每组三个人节点；两组现代团队各配三个独立 Agent。人周期 6 秒、Agent 周期 0.6 秒，严格 1:10；人际边跟随人，Colab 的 9px Agent 边跟随 Agent。真实浏览器读回节点数、周期和线宽符合上述值，窄窗口三组仍横排、区域约 296px 高。当前团队仅人际传输有堵塞，Agent 自身继续快速呼吸。构建通过。

假设：相同团队拓扑下，尺寸、呼吸、传输停顿和连线端点能表达协作差异，无须文字解释机制。传统仅人节点；另外两组人/Agent 配对，当前团队连人，Colab 连 Agent。等待用户审美确认，未移植正式 Home。

运行：`npm ci && npm run dev -- --port 5198`，访问 http://127.0.0.1:5198 。构建：`npm run build`。

比较 Motion React SVG 与 GSAP Timeline 后选 GSAP 3.14.2：固定重复时间线绑定每次呼吸和传输，第二组显式停顿；直线坐标插值，无须 MotionPath。没有动态创建 DOM 的计时器，没有生产依赖变更。参考：https://gsap.com/docs/v3/GSAP/Timeline/ 与 https://motion.dev/docs/react-svg-animation 。

2026-10-06 已验证：Vite 6.4.4 生产构建通过、安装审计 0 漏洞；真实浏览器三组布局与暂停/恢复通过。支持 reduced-motion 初始暂停、隐藏页面暂停。窄屏有纵向 CSS，尚未单独视觉验收。未发布制品。

后续 Home：Tips 分隔线且整体可收起；去掉重复 Tab 入口；近期活动必须使用真实共享、读取和指令数据，不用假动态占位、不预取全部资产。
