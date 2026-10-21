# Planner Studio 架构审查报告

- 审查对象：Planner Studio 0.3.0（Electron 31 + 原生 HTML/CSS/JS）
- 审查日期：2026-10-21
- 审查范围：`main.js`、`preload.js`、`data-store.js`、`renderer/`（两个窗口的 html/css/js）、`test/`、`package.json`、`assets/attach-desktop.ps1`
- 审查方法：通读源码 + 依赖与调用关系梳理 + 单测执行 + Electron 实跑截图与 DOM 实测 + 双实例并发验证

---

## 1. 结论摘要

整体架构分层清晰，边界守得住：主进程负责窗口与系统能力，预加载桥只暴露白名单 API，渲染层不碰 Node，数据层完全不依赖 Electron。**数据层零 Electron 依赖是这个项目最有价值的设计**，它让 43 条单测能在纯 Node 下跑，不需要起窗口。

本次共发现 13 处问题，其中 2 处属于数据安全级、5 处属于功能缺陷、6 处属于规范性缺口。前者不修，一次异常断电就可能让用户数据整体清零。**已修复 12 处，保留 6 条结构性建议待定**（见第 5 节）。

| 等级 | 数量 | 含义 | 处理 |
|---|---|---|---|
| P0 | 2 | 可能造成用户数据丢失或不可恢复 | 已修 |
| P1 | 5 | 功能不正确、行为与预期不符 | 已修 |
| P2 | 5 | 规范性与可维护性缺口 | 已修 |
| P3 | 6 | 结构性改进，需要权衡成本 | 仅建议 |

---

## 2. 架构现状

### 2.1 分层与依赖方向

```
┌──────────────────────────────────────────────────────┐
│ 渲染层  renderer/widget.*   renderer/manager.*        │
│ 无框架 · 不 require 任何模块 · 只认 window.planner      │
└───────────────┬──────────────────────────────────────┘
                │ IPC（contextBridge 白名单）
┌───────────────▼──────────────────────────────────────┐
│ 桥接层  preload.js（34 行，contextIsolation: true）    │
└───────────────┬──────────────────────────────────────┘
                │ ipcRenderer.invoke / send
┌───────────────▼──────────────────────────────────────┐
│ 主进程  main.js（230 行）                              │
│ 窗口生命周期 · 托盘 · 通知 · dialog · 桌面层挂载        │
└───────────────┬──────────────────────────────────────┘
                │ 直接 require（同步调用）
┌───────────────▼──────────────────────────────────────┐
│ 数据层  data-store.js（459 行，纯 Node，无 Electron）  │
│ CRUD · 重复任务规则 · 统计聚合 · 持久化                 │
└──────────────────────────────────────────────────────┘
```

依赖方向单向向下，没有反向依赖，也没有渲染层直接读写文件的情况。

### 2.2 进程与窗口模型

- 单主进程，两个 BrowserWindow：`widget`（340×560，透明无边框，挂到桌面 WorkerW 层）、`manager`（720×860，常规窗口）。
- 挂件不设关闭按钮，销毁即退出应用；管理窗口按需创建，关闭置空。
- 主进程每 30 秒轮询一次到期通知与重复任务生成，这是全应用唯一的时间驱动源。

### 2.3 IPC 契约

共 19 条通道：18 条 `invoke`（请求响应）+ 1 条 `send`（单向）。

| 分组 | 通道 | 类型 | 是否改动数据 |
|---|---|---|---|
| 待办 | `todos:get` `todos:all` | invoke | 否 |
| 待办 | `todos:add` `todos:toggle` `todos:remove` `todos:rename` `todos:updateRepeat` `todos:deleteRepeat` | invoke | 是（6） |
| 任务 | `tasks:list` | invoke | 否 |
| 任务 | `tasks:add` `tasks:remove` `tasks:clearOverdue` | invoke | 是（3） |
| 设置 | `settings:get` | invoke | 否 |
| 设置 | `settings:set` `app:autoLaunch` | invoke | 是（2） |
| 统计 | `stats:get` | invoke | 否 |
| 备份 | `backup:export` | invoke | 否 |
| 备份 | `backup:import` | invoke | 是（1） |
| 窗口 | `manager:open` | send | 否 |

“改动数据”共 13 条，与 `registerIpc()` 中 `mutate: true` 的标记数量一致。写操作完成后由主进程广播 `data-changed`，两个窗口各自重新拉取全量数据。

### 2.4 数据模型

单一 JSON 文件（`%APPDATA%/planner-studio/data.json`），六个字段：

| 字段 | 结构 | 说明 |
|---|---|---|
| `version` | number | 数据结构版本，当前 1 |
| `futureTasks` | Array | 倒计时任务，`{ id, title, dueAt, createdAt }` |
| `todos` | Object | 按 `YYYY-MM-DD` 分桶，值为待办数组 |
| `repeatTemplates` | Object | 重复任务模板，key 为模板 id |
| `repeatSkips` | Object | 模板 id → 被手动删除的日期数组 |
| `settings` | Object | theme / notify / autoLaunch / motto |

日期键统一走本地时区 `dateKeyOf()`，没有混用 ISO UTC 字符串。

---

## 3. 问题清单

### 3.1 P0 数据安全

**P0-1 写盘非原子，崩溃可导致数据全丢**（已修）

- 现象：`save()` 直接 `fs.writeFileSync(this.filePath, ...)` 覆盖原文件。
- 影响链：写到一半崩溃或断电 → 文件变成半截 JSON → 下次 `load()` 解析失败 → 返回默认空数据 → 用户任意一次操作触发 `save()`，空数据覆盖原文件，**原始数据不可恢复**。
- 处置：改为先写 `data.json.tmp` 再 `fs.renameSync` 原子替换。`rename` 在同一分区内是原子操作，最坏情况是留下一个 `.tmp`，原文件完好。

**P0-2 损坏文件被静默吞掉，失去抢救机会**（已修）

- 现象：`load()` 的 `catch` 只返回默认结构，损坏文件原地不动。
- 影响：即使数据还能人工修复，也会在第一次保存时被覆盖。
- 处置：解析失败时把原文件改名为 `data.json.corrupt-<ISO 时间戳>` 留档，再以空数据启动。文件不存在（首次启动）不触发留档，只处理真正的读取/解析失败。

### 3.2 P1 功能缺陷

**P1-1 备份导入丢失重复任务数据**（已修）

- 现象：`backup:import` 里直接重赋 `store.data = { futureTasks, todos, settings }`。
- 影响：`repeatTemplates` 与 `repeatSkips` 被整体丢弃。导入一份备份后，重复任务模板消失（超过 7 天没打开就再也补不回来），被手动跳过的日期记录也丢失。
- 处置：把归一化逻辑下沉到数据层 `importData(parsed)`，与 `load()` 共用 `normalizeData()`，字段补齐后再替换，同时保留当前 `settings`（避免旧备份把主题、提醒开关改回去）。

**P1-2 导入后的广播早于落盘**（已修）

- 现象：原 `handle` 包装器是 `const result = fn(...args); if (MUTATIONS.includes(...)) broadcast()`，不 `await`。
- 影响：`backup:import` 是 async 函数，广播在读取备份文件**之前**就发出去了，另一个窗口收到刷新时数据还是旧的。
- 处置：包装器改为 async 并 `await fn(...)` 后再广播，写操作的广播时序与落盘顺序一致。

**P1-3 没有单实例锁，双进程写同一文件**（已修）

- 现象：缺少 `app.requestSingleInstanceLock()`。
- 影响：重复双击启动会起第二个进程，两边各自持有内存副本，谁的 `save()` 后落盘谁覆盖对方，且窗口之间不广播，数据会“莫名其妙回退”。
- 处置：加单实例锁，第二个实例直接退出；并把 `second-instance` 事件接到“显示挂件 + 打开管理窗口”，符合桌面应用习惯。

**P1-4 挂件进度条从未显示过**（已修）

- 现象：CSS 用 `.progress-bar::after` 画填充条（`width: 0`），而 `widget.js` 给轨道元素本身设 `style.width`。
- 实测证据：`getComputedStyle(track, '::after').width === '0px'`，无论完成几项，蓝色填充宽度恒为 0，进度条只有一条灰底。
- 处置：拆成 `.progress-track`（轨道）+ `.progress-fill`（填充）两层，JS 继续设 `#progress-bar.style.width`，现在作用于填充层。修复后实测 `2 / 4` 对应 129px / 258px，正好 50%。

**P1-5 跨午夜不换天**（已修）

- 现象：两个窗口的 `todos` 只在 `init()` 和 `data-changed` 时加载一次；60 秒定时器只重绘倒计时。
- 影响：挂件常驻桌面，过零点后仍显示前一天的待办、进度和“今日完成”；管理窗口的今日待办、统计口径、日历高亮同样滞后，直到用户触发一次写操作。
- 处置：抽 `loadData()`，在定时器里比对 `dateKey()` 与缓存的 `currentDayKey`，不一致就整屏重载（管理窗口连 `today` 抬头、统计、日历一起刷新）。

### 3.3 P2 规范性

| 编号 | 问题 | 处置 |
|---|---|---|
| P2-1 | 数据文件没有版本号，未来改结构无法迁移 | 加 `version` 字段与 `migrate()` 分派；缺字段的旧文件按 v0 升级到 v1 并回写 |
| P2-2 | 写操作靠 `MUTATIONS` 数组集中登记，新增通道漏登记会导致两窗口不同步 | 改为在调用点显式传 `{ mutate: true }`，声明与实现同处一行 |
| P2-3 | 每次启动给**所有**历史过期任务弹通知 | 只在“到期时间距今 24 小时内”时弹，超期任务仅登记不打扰 |
| P2-4 | `preload.close` 与 `window:close` 通道无人调用 | 删除两侧死代码 |
| P2-5 | `.gitignore` 漏掉本地工具目录；`package.json` 缺 `private` / `engines` / `license` | 补 `.workbuddy/`、`private: true`、`node >= 20`、`UNLICENSED` |

前一轮已处理的两项一并记录：`npm test` 的 `node --test test/` 在 Node 22/24 下会报 `MODULE_NOT_FOUND`，已改为 `node --test`；README 安装路径写死 `0.2.2` 已改为通配版本号。

---

## 4. 本次改动与验证

### 4.1 改动文件

| 文件 | 改动要点 |
|---|---|
| `data-store.js` | `SCHEMA_VERSION` / `normalizeData()` / `migrate()`；`load()` 返回 `{ data, needsSave }`；`save()` 原子写；`quarantine()` 留档坏文件；新增 `importData()` |
| `main.js` | `handle()` 改 async + `mutate` 显式；`backup:import` 走 `store.importData()`；单实例锁与 `second-instance`；通知 24 小时窗口；删除 `window:close` |
| `preload.js` | 删除 `close()` |
| `renderer/widget.{html,css,js}` | 进度条重构为 track/fill；`loadData()` + 跨天轮询 |
| `renderer/manager.js` | 抽 `renderHeader()` / `loadData()` / `refreshAll()`；跨天轮询 |
| `test/data-store.test.js` | 新增 7 条：版本写入与迁移、坏文件留档、无临时文件残留、导入保留模板与跳过、导入保留当前设置、导入格式校验 |
| `package.json` / `.gitignore` / `README.md` | 元信息、忽略规则、数据格式与备份说明 |

### 4.2 验证证据

- 单测：`node --test` 共 **43 条全部通过**（原有 26 条 + 统计聚合 9 条 + 已完成清单 1 条 + 本次持久化与导入 7 条）。
- 挂件：实跑截图，`2 / 4` 时填充 129px / 轨道 258px，肉眼可见蓝色进度。
- 管理窗口：实跑截图，本周完成率 67%（4/6），已完成清单 4 项，今日待办 4 行，抬头日期正确。
- 单实例：先起实例 A，再起实例 B，B 在数秒内以退出码 0 结束（若未生效会一直驻留到超时），A 日志无异常。

### 4.3 未能端到端验证的部分

- **跨天刷新**：逻辑是每分钟比对日期键，但没有等到真实零点，属于代码级验证，建议实际挂一夜再确认。
- **桌面层挂载**：`attach-desktop.ps1` 依赖 WorkerW 窗口层级，沙箱环境无法构造真实桌面，未验证。

---

## 5. 建议但未实施

按“收益 / 成本”排序，都不影响当前正确性：

1. **拆出 `stats.js`**：`data-store.js` 已 459 行，CRUD、重复任务规则、统计聚合三类职责混在一个类里。统计本质是纯函数（输入 `todos` 对象 + 日期，输出结构），独立成模块后可以单独测、单独改，也不必每次改统计都翻 459 行。
2. **拆出 `ipc.js` 并把 `ipcMain` 作为参数注入**：现在 IPC 契约只存在于代码里，19 条通道没有一处可执行的规格说明。注入后可以在纯 Node 里断言“每个 mutate 通道都真的广播了”。
3. **渲染层公共函数去重**：`dateKey()` 与 `formatCountdown()` 在 `widget.js`、`manager.js` 各有一份完全相同的实现，改口径要改两处。可抽 `renderer/common.js`（CSP 的 `default-src 'self'` 允许）。
4. **`todos:all` 全量传输**：目前把全部历史待办一次性送进渲染层。按每天 10 条算，三年约一万条，日历视图会逐渐变卡。建议只传“有记录的日期 → 计数”，点开某天才取详情。
5. **键盘可达性**：挂件全部交互依赖鼠标（双击编辑、右键开管理窗、勾选框无 Tab 路径）。桌面挂件可接受，但可以给勾选框补 `tabindex`。
6. **打包签名**：目前 NSIS 安装包未签名，Windows 会提示未知发布者；`winCodeSign` 的解压问题 README 已有绕行记录，但签名证书需要另行准备。

---

## 6. 长期维护约定（建议固化为约定）

- 新增写操作：数据层方法 + `handle(..., { mutate: true })` + preload 暴露 + 至少一条单测，四件套齐全再提交。
- 新增数据字段：`normalizeData()` 补默认值、`SCHEMA_VERSION` 加一、`migrate()` 写升级分支，三步不可省。
- 时间相关逻辑：一律用 `dateKeyOf()`（本地时区），不要引入 `toISOString().slice(0,10)`，两者跨时区会差一天。
- UI 与样式：进度、图表这类“数值驱动尺寸”的元素，DOM 结构与 CSS 选择器必须成对检查，避免再次出现 `::after` 与内联样式各写一处的情况。
