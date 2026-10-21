# 工程规范

本文件是本项目的硬性约定。凡是与本文冲突的做法，以本文为准；确需例外时，在提交信息里写明理由。

## 1. 提交规范

采用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/) 格式：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**type** 只允许以下取值：

| type | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | 修复缺陷 |
| `docs` | 仅文档 |
| `refactor` | 重构，不改变外部行为 |
| `perf` | 性能优化 |
| `test` | 增删改测试 |
| `build` | 打包配置、依赖变更 |
| `ci` | 持续集成配置 |
| `chore` | 杂项（工程配置、忽略规则等） |
| `revert` | 回滚 |

**scope** 可选，取值建议：`stats`、`data`、`main`、`ui`、`widget`、`manager`、`tooling`。

**subject**：中文，动词开头，不加句号，整行不超过 72 字符。

**body**：说明“为什么”和“影响了什么”，不要逐行复述 diff。涉及破坏性变更时，在 footer 写 `BREAKING CHANGE: <说明>`。

示例：

```
feat(stats): 增加周/月完成情况分析与已完成任务清单

- 数据层新增 getStats，按自然周与自然月聚合，汇总只统计到当天
- 管理窗口支持周月切换、周柱状图与月度热力图

补充统计相关单测，测试总数 36 条。
```

**强制手段**：`.githooks/commit-msg` 会校验格式，不合规直接拒绝提交。安装钩子：`npm run hooks:install`。

### 提交粒度

一个提交只做一件事，且**必须能独立通过测试**（`npm test` 全绿）。拆分判断标准：

- 能用一个 type 概括，不出现“顺便也改了……”
- 回滚这个提交不会连带回滚别的功能
- 重构与新功能分开提交

不要为了拆而拆：拆出来的中间态如果跑不起来，反而破坏 `git bisect` 的价值。

## 2. 分支规范

- `main`：可发布分支，只接受经过测试的提交，禁止直接在上面试错。
- 功能分支：`feat/<简述>`，修复分支：`fix/<简述>`。
- 合并进 `main` 前必须 `npm run verify` 通过。

## 3. 版本与发布

- 遵循 [语义化版本](https://semver.org/lang/zh-CN/)：`MAJOR.MINOR.PATCH`。
  - 新增功能 → `MINOR`；仅修缺陷 → `PATCH`；不兼容的数据结构变更 → `MAJOR`。
- 每次发版同步做三件事：改 `package.json` 的 `version`、在 `CHANGELOG.md` 记一条、打 tag `vX.Y.Z`。
- `CHANGELOG.md` 遵循 Keep a Changelog 的分类：新增 / 变更 / 修复 / 移除。
- 数据文件结构变更时，`data-store.js` 的 `SCHEMA_VERSION` 加一并补 `migrate()` 分支，缺一不可。

## 4. 代码规范

### 分层边界（不可突破）

| 层 | 可以做 | 不可以做 |
|---|---|---|
| `renderer/*` | 操作 DOM、调 `window.planner` | `require` 任何模块、直接读写文件、访问 Node API |
| `preload.js` | 白名单暴露 IPC | 暴露 `ipcRenderer` 本体、暴露 Node 模块 |
| `main.js` | 窗口、托盘、通知、dialog、调用数据层 | 写业务数据规则、直接拼数据结构 |
| `data-store.js` | 数据规则、持久化、统计 | `require('electron')` 或任何 Electron API |

`data-store.js` 必须能在纯 Node 下运行，这是全部单测的前提。

### 新增写操作的四件套

1. `data-store.js` 增加方法（含参数校验与默认值）
2. `main.js` 注册 `handle(channel, fn, { mutate: true })`
3. `preload.js` 暴露对应 API
4. `test/data-store.test.js` 至少一条用例

漏掉第 2 步的第 3 个参数，两个窗口就不会同步刷新；漏掉第 4 步，钉不住回归。

### 数据与时间

- 日期键一律用 `dateKeyOf()`（本地时区），不要用 `toISOString().slice(0, 10)`，两者跨时区会差一天。
- 统计口径以 `docs/architecture-review.md` 为准：自然周/自然月，汇总只到当天，环比用同期区间。
- 缺数据时返回 `null`，不要用 `0` 冒充“没有数据”。

### 界面与样式

- 数值驱动尺寸的元素（进度条、图表柱），DOM 结构与 CSS 选择器必须成对核对，禁止一处用 `::after`、另一处用内联 `width`。
- 文本一律走 `textContent`，不用 `innerHTML` 拼接用户数据。
- 主题变量集中定义在 `:root` 与 `body[data-theme="dark"]`，不要写死颜色。

### 通用

- 2 空格缩进，单引号，行尾不加分号，单行不超过 100 字符（与现有代码一致）。
- 不允许提交 `debugger`；`console.log` 仅允许出现在错误分支，且需带上下文。
- 文件编码 UTF-8，换行 LF（见 `.editorconfig`）。

## 5. 提交前检查

```bash
npm run verify   # 单测 + ESLint
```

交付任何功能前，除了单测，还要做一次真实验证（启动应用截图、读回 DOM 状态或实际执行），不能只看工具返回 ok。

## 6. 目录约定

```
main.js           主进程入口
preload.js        IPC 白名单桥
data-store.js     数据层（纯 Node）
renderer/         两个窗口的页面、样式与脚本
test/             数据层单测
docs/             架构审查与技术文档
scripts/          工程脚本（提交信息校验等）
.githooks/        版本控制钩子
.github/          CI 配置
```
