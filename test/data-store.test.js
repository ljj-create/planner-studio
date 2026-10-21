const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { DataStore, genId, dateKeyOf } = require('../data-store')

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-test-'))
  return { store: new DataStore(path.join(dir, 'data.json')), dir }
}

test('genId 生成唯一 id', () => {
  const ids = new Set(Array.from({ length: 100 }, genId))
  assert.equal(ids.size, 100)
})

test('首次加载返回默认结构', () => {
  const { store, dir } = tmpStore()
  assert.deepEqual(store.getTasks(), [])
  assert.deepEqual(store.getTodos('2026-08-12'), [])
  fs.rmSync(dir, { recursive: true, force: true })
})

test('addTodo 追加待办并持久化', () => {
  const { store, dir } = tmpStore()
  store.addTodo('2026-08-12', '晨跑')
  store.addTodo('2026-08-12', '写报告')

  const reloaded = new DataStore(path.join(dir, 'data.json'))
  const list = reloaded.getTodos('2026-08-12')
  assert.equal(list.length, 2)
  assert.equal(list[0].text, '晨跑')
  assert.equal(list[0].done, false)
  assert.ok(list[0].id)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('toggleTodo 切换完成状态并持久化', () => {
  const { store, dir } = tmpStore()
  const todo = store.addTodo('2026-08-12', '晨跑').at(-1)
  store.toggleTodo('2026-08-12', todo.id)

  const reloaded = new DataStore(path.join(dir, 'data.json'))
  assert.equal(reloaded.getTodos('2026-08-12')[0].done, true)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('removeTodo 删除指定待办', () => {
  const { store, dir } = tmpStore()
  const a = store.addTodo('2026-08-12', 'a').at(-1)
  const b = store.addTodo('2026-08-12', 'b').at(-1)
  store.removeTodo('2026-08-12', a.id)

  const list = store.getTodos('2026-08-12')
  assert.equal(list.length, 1)
  assert.equal(list[0].id, b.id)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('不同日期的待办互不干扰', () => {
  const { store, dir } = tmpStore()
  store.addTodo('2026-08-12', '今天的事')
  store.addTodo('2026-08-13', '明天的事')
  assert.equal(store.getTodos('2026-08-12').length, 1)
  assert.equal(store.getTodos('2026-08-13').length, 1)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('addTask 添加未来任务并持久化', () => {
  const { store, dir } = tmpStore()
  store.addTask('交季度报告', '2026-09-30T18:00:00')

  const reloaded = new DataStore(path.join(dir, 'data.json'))
  const task = reloaded.getTasks()[0]
  assert.equal(task.title, '交季度报告')
  assert.equal(task.dueAt, '2026-09-30T18:00:00')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('removeTask 删除指定任务', () => {
  const { store, dir } = tmpStore()
  const t1 = store.addTask('A', '2026-09-01T00:00:00')
  store.addTask('B', '2026-09-02T00:00:00')
  store.removeTask(t1.id)
  assert.equal(store.getTasks().length, 1)
  assert.equal(store.getTasks()[0].title, 'B')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('clearOverdueTasks 只清除已过期的任务', () => {
  const { store, dir } = tmpStore()
  store.addTask('已过期任务', '2000-01-01T00:00:00')
  store.addTask('未来任务', '2999-01-01T00:00:00')
  const remaining = store.clearOverdueTasks()
  assert.equal(remaining.length, 1)
  assert.equal(remaining[0].title, '未来任务')

  const reloaded = new DataStore(path.join(dir, 'data.json'))
  assert.equal(reloaded.getTasks().length, 1)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('addTodo 支持优先级和重复设置', () => {
  const { store, dir } = tmpStore()
  store.addTodo('2026-08-12', '重要', { priority: 'high', repeat: 'daily' })
  const todo = store.getTodos('2026-08-12')[0]
  assert.equal(todo.priority, 'high')
  assert.equal(todo.repeat, 'daily')
  assert.equal(todo.repeatOf, null)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('addTodo 非法优先级/重复值回退默认', () => {
  const { store, dir } = tmpStore()
  store.addTodo('2026-08-12', 'x', { priority: 'urgent', repeat: 'hourly' })
  const todo = store.getTodos('2026-08-12')[0]
  assert.equal(todo.priority, 'medium')
  assert.equal(todo.repeat, 'none')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('toggleTodo 记录完成时间，取消完成清空', () => {
  const { store, dir } = tmpStore()
  const todo = store.addTodo('2026-08-12', '晨跑').at(-1)
  store.toggleTodo('2026-08-12', todo.id)
  assert.ok(store.getTodos('2026-08-12')[0].doneAt)
  store.toggleTodo('2026-08-12', todo.id)
  assert.equal(store.getTodos('2026-08-12')[0].doneAt, null)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('设置读写与持久化', () => {
  const { store, dir } = tmpStore()
  assert.equal(store.getSettings().theme, 'light')
  store.setSettings({ theme: 'dark' })
  const reloaded = new DataStore(path.join(dir, 'data.json'))
  assert.equal(reloaded.getSettings().theme, 'dark')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('shouldRepeat 判断', () => {
  const { store, dir } = tmpStore()
  const mon = new Date('2026-08-10T12:00:00')
  const sat = new Date('2026-08-15T12:00:00')
  assert.equal(store.shouldRepeat('daily', sat), true)
  assert.equal(store.shouldRepeat('workdays', mon), true)
  assert.equal(store.shouldRepeat('workdays', sat), false)
  assert.equal(store.shouldRepeat('weekly', mon), true)
  assert.equal(store.shouldRepeat('weekly', sat), false)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('applyRepeats 每日任务自动生成且不重复', () => {
  const { store, dir } = tmpStore()
  const tuesday = new Date('2026-08-11T12:00:00')
  store.addTodo(dateKeyOf(tuesday), '喝水', { repeat: 'daily' })
  const wednesday = new Date('2026-08-12T12:00:00')
  assert.equal(store.applyRepeats(wednesday), 1)
  const list = store.getTodos(dateKeyOf(wednesday))
  assert.equal(list.length, 1)
  assert.equal(list[0].text, '喝水')
  assert.equal(list[0].repeatOf, store.getTodos(dateKeyOf(tuesday))[0].id)
  assert.equal(store.applyRepeats(wednesday), 0)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('applyRepeats 周末不生成工作日任务', () => {
  const { store, dir } = tmpStore()
  const friday = new Date('2026-08-14T12:00:00')
  store.addTodo(dateKeyOf(friday), '打卡', { repeat: 'workdays' })
  const saturday = new Date('2026-08-15T12:00:00')
  assert.equal(store.applyRepeats(saturday), 0)
  const monday = new Date('2026-08-17T12:00:00')
  assert.equal(store.applyRepeats(monday), 1)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('renameTodo 修改待办文字并持久化', () => {
  const { store, dir } = tmpStore()
  const todo = store.addTodo('2026-08-12', '原文字').at(-1)
  store.renameTodo('2026-08-12', todo.id, '新文字')
  const reloaded = new DataStore(path.join(dir, 'data.json'))
  assert.equal(reloaded.getTodos('2026-08-12')[0].text, '新文字')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('删除某天的重复实例后当天不生成，次日恢复', () => {
  const { store, dir } = tmpStore()
  const tue = new Date('2026-08-11T12:00:00')
  store.addTodo(dateKeyOf(tue), '喝水', { repeat: 'daily' })
  const wed = new Date('2026-08-12T12:00:00')
  assert.equal(store.applyRepeats(wed), 1)
  const todayInst = store.getTodos(dateKeyOf(wed))[0]
  store.removeTodo(dateKeyOf(wed), todayInst.id)
  assert.equal(store.applyRepeats(wed), 0)
  const thu = new Date('2026-08-13T12:00:00')
  assert.equal(store.applyRepeats(thu), 1)
  const reloaded = new DataStore(path.join(dir, 'data.json'))
  assert.ok(Object.keys(reloaded.data.repeatSkips).length > 0)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('当天创建的每日任务被删除后，次日仍会生成', () => {
  const { store, dir } = tmpStore()
  const today = new Date('2026-08-12T12:00:00')
  const tpl = store.addTodo(dateKeyOf(today), '晨跑', { repeat: 'daily' }).at(-1)
  store.removeTodo(dateKeyOf(today), tpl.id)
  const tomorrow = new Date('2026-08-13T12:00:00')
  assert.equal(store.applyRepeats(tomorrow), 1)
  assert.equal(store.getTodos(dateKeyOf(tomorrow))[0].text, '晨跑')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('重复模板在创建时登记，删除实例不丢失模板', () => {
  const { store, dir } = tmpStore()
  const today = new Date('2026-08-12T12:00:00')
  const tpl = store.addTodo(dateKeyOf(today), '喝水', { repeat: 'daily', priority: 'high' }).at(-1)
  assert.ok(store.data.repeatTemplates[tpl.id])
  store.removeTodo(dateKeyOf(today), tpl.id)
  const tomorrow = new Date('2026-08-13T12:00:00')
  store.applyRepeats(tomorrow)
  const inst = store.getTodos(dateKeyOf(tomorrow))[0]
  assert.equal(inst.priority, 'high')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('每日任务的完成状态每天独立，次日副本未完成', () => {
  const { store, dir } = tmpStore()
  const tue = new Date('2026-08-11T12:00:00')
  store.addTodo(dateKeyOf(tue), '晨跑', { repeat: 'daily' })
  const wed = new Date('2026-08-12T12:00:00')
  store.applyRepeats(wed)
  const wedInst = store.getTodos(dateKeyOf(wed))[0]
  store.toggleTodo(dateKeyOf(wed), wedInst.id)
  assert.equal(store.getTodos(dateKeyOf(wed))[0].done, true)
  const thu = new Date('2026-08-13T12:00:00')
  store.applyRepeats(thu)
  const thuInst = store.getTodos(dateKeyOf(thu))[0]
  assert.equal(thuInst.done, false)
  assert.notEqual(thuInst.id, wedInst.id)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('当天创建的每日任务不会当天重复生成，次日才生成', () => {
  const { store, dir } = tmpStore()
  const today = new Date('2026-08-12T12:00:00')
  store.addTodo(dateKeyOf(today), '英语', { repeat: 'daily' })
  assert.equal(store.applyRepeats(today), 0)
  assert.equal(store.getTodos(dateKeyOf(today)).length, 1)
  const tomorrow = new Date('2026-08-13T12:00:00')
  assert.equal(store.applyRepeats(tomorrow), 1)
  assert.equal(store.getTodos(dateKeyOf(tomorrow)).length, 1)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('updateRepeat 修改模板与所有实例的周期', () => {
  const { store, dir } = tmpStore()
  const today = new Date('2026-08-12T12:00:00')
  const tpl = store.addTodo(dateKeyOf(today), '英语', { repeat: 'daily' }).at(-1)
  const tomorrow = new Date('2026-08-13T12:00:00')
  store.applyRepeats(tomorrow)
  assert.equal(store.updateRepeat(tpl.id, 'weekly'), 2)
  assert.equal(store.data.repeatTemplates[tpl.id].repeat, 'weekly')
  assert.equal(store.getTodos(dateKeyOf(today))[0].repeat, 'weekly')
  assert.equal(store.getTodos(dateKeyOf(tomorrow))[0].repeat, 'weekly')
  const nextDay = new Date('2026-08-14T12:00:00')
  assert.equal(store.applyRepeats(nextDay), 0)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('修改为不重复后不再生成', () => {
  const { store, dir } = tmpStore()
  const today = new Date('2026-08-12T12:00:00')
  const tpl = store.addTodo(dateKeyOf(today), '打卡', { repeat: 'daily' }).at(-1)
  store.updateRepeat(tpl.id, 'none')
  const tomorrow = new Date('2026-08-13T12:00:00')
  assert.equal(store.applyRepeats(tomorrow), 0)
  assert.equal(store.getTodos(dateKeyOf(tomorrow)).length, 0)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('deleteRepeatTemplate 删除所有实例后不再生成', () => {
  const { store, dir } = tmpStore()
  const today = new Date('2026-08-12T12:00:00')
  const tpl = store.addTodo(dateKeyOf(today), '健身', { repeat: 'daily' }).at(-1)
  const tomorrow = new Date('2026-08-13T12:00:00')
  store.applyRepeats(tomorrow)
  store.removeTodo(dateKeyOf(today), tpl.id)
  assert.equal(store.deleteRepeatTemplate(tpl.id), 1)
  assert.equal(store.data.repeatTemplates[tpl.id], undefined)
  assert.equal(store.getTodos(dateKeyOf(today)).length, 0)
  assert.equal(store.getTodos(dateKeyOf(tomorrow)).length, 0)
  assert.equal(store.applyRepeats(new Date('2026-08-14T12:00:00')), 0)
  fs.rmSync(dir, { recursive: true, force: true })
})

// ---- 持久化健壮性与备份导入 ----

test('首次启动写入带版本号的数据文件', () => {
  const { store, dir } = tmpStore()
  store.addTodo('2026-08-12', 'a')
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf-8'))
  assert.equal(onDisk.version, 1)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('旧文件缺少 version 字段时自动补版本并回写', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-test-'))
  const file = path.join(dir, 'data.json')
  fs.writeFileSync(
    file,
    JSON.stringify({ futureTasks: [], todos: {}, settings: { theme: 'dark' } })
  )
  const store = new DataStore(file)
  assert.equal(store.data.version, 1)
  const onDisk = JSON.parse(fs.readFileSync(file, 'utf-8'))
  assert.equal(onDisk.version, 1)
  assert.equal(onDisk.settings.theme, 'dark')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('损坏的数据文件被改名留档，而不是被静默覆盖', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-test-'))
  const file = path.join(dir, 'data.json')
  fs.writeFileSync(file, 'not-json{{{')
  const store = new DataStore(file)
  assert.deepEqual(store.getTodos('2026-08-12'), [])
  assert.equal(fs.existsSync(file), false)
  assert.equal(
    fs.readdirSync(dir).some((f) => f.startsWith('data.json.corrupt-')),
    true
  )
  fs.rmSync(dir, { recursive: true, force: true })
})

test('保存后不残留临时文件', () => {
  const { store, dir } = tmpStore()
  store.addTodo('2026-08-12', 'a')
  assert.deepEqual(fs.readdirSync(dir), ['data.json'])
  fs.rmSync(dir, { recursive: true, force: true })
})

test('importData 保留重复任务模板与跳过记录', () => {
  const { store, dir } = tmpStore()
  const result = store.importData({
    futureTasks: [],
    todos: { '2026-10-01': [] },
    repeatSkips: { tpl1: ['2026-10-02'] },
    repeatTemplates: { tpl1: { text: '喝水', priority: 'high', repeat: 'daily' } },
  })
  assert.deepEqual(result, { ok: true })
  assert.equal(store.data.repeatTemplates.tpl1.text, '喝水')
  assert.deepEqual(store.data.repeatSkips.tpl1, ['2026-10-02'])

  const reloaded = new DataStore(path.join(dir, 'data.json'))
  assert.equal(reloaded.data.repeatTemplates.tpl1.text, '喝水')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('importData 保留当前设置，不被旧备份覆盖', () => {
  const { store, dir } = tmpStore()
  store.setSettings({ theme: 'dark', motto: '当前的激励语' })
  store.importData({
    futureTasks: [],
    todos: {},
    settings: { theme: 'light', motto: '旧备份里的激励语' },
  })
  assert.equal(store.getSettings().theme, 'dark')
  assert.equal(store.getSettings().motto, '当前的激励语')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('importData 拒绝格式不正确的备份', () => {
  const { store, dir } = tmpStore()
  assert.deepEqual(store.importData(null), { ok: false, reason: '备份格式不正确' })
  assert.deepEqual(store.importData({ todos: {} }), { ok: false, reason: '备份格式不正确' })
  assert.deepEqual(store.importData({ futureTasks: [] }), { ok: false, reason: '备份格式不正确' })
  fs.rmSync(dir, { recursive: true, force: true })
})

test('损坏的 data.json 自动恢复默认结构', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-test-'))
  fs.writeFileSync(path.join(dir, 'data.json'), 'not-json{{{')
  const store = new DataStore(path.join(dir, 'data.json'))
  assert.deepEqual(store.getTasks(), [])
  assert.deepEqual(store.getTodos('2026-08-12'), [])
  fs.rmSync(dir, { recursive: true, force: true })
})

// ---- 统计（getStats） ----
// 固定基准日：2026-10-21 是周三，所在自然周为 2026-10-19（周一）至 2026-10-25（周日）

function addTodo(store, dateKey, text, done, priority) {
  const todo = store.addTodo(dateKey, text, { priority }).at(-1)
  if (done) store.toggleTodo(dateKey, todo.id)
  return todo
}

test('getStats 周统计从周一开始，未来日期不计入汇总', () => {
  const { store, dir } = tmpStore()
  addTodo(store, '2026-10-19', 'a', false)
  addTodo(store, '2026-10-19', 'b', false)
  addTodo(store, '2026-10-20', 'c', true)
  addTodo(store, '2026-10-24', '周六', false)

  const stats = store.getStats(new Date('2026-10-21T09:00:00'))
  assert.equal(stats.week.startKey, '2026-10-19')
  assert.equal(stats.week.endKey, '2026-10-25')
  assert.equal(stats.week.days.length, 7)
  assert.equal(stats.week.days[0].weekday, '一')
  assert.equal(stats.week.days[6].weekday, '日')
  assert.equal(stats.week.total, 3)
  assert.equal(stats.week.done, 1)
  assert.equal(stats.week.rate, 1 / 3)
  assert.equal(stats.week.countedEndKey, '2026-10-21')

  const saturday = stats.week.days.find((d) => d.key === '2026-10-24')
  assert.equal(saturday.isFuture, true)
  assert.equal(saturday.total, 1)
  assert.equal(saturday.isToday, false)
  assert.equal(stats.week.days.find((d) => d.key === '2026-10-21').isToday, true)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('getStats 周环比只比较上周同期区间', () => {
  const { store, dir } = tmpStore()
  // 上周同期区间 = 2026-10-12 至 2026-10-14（本周已过 3 天）
  addTodo(store, '2026-10-12', '上周一 a', true)
  addTodo(store, '2026-10-12', '上周一 b', true)
  addTodo(store, '2026-10-15', '上周四，应被窗口排除', false)
  // 本周：1/2 完成
  addTodo(store, '2026-10-19', '本周一 a', true)
  addTodo(store, '2026-10-19', '本周一 b', false)

  const stats = store.getStats(new Date('2026-10-21T09:00:00'))
  assert.equal(stats.week.rate, 0.5)
  assert.equal(stats.week.prev.total, 2)
  assert.equal(stats.week.prev.rate, 1)
  assert.equal(stats.week.delta.rate, -0.5)
  assert.equal(stats.week.delta.prevTotal, 2)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('getStats 月统计按自然月聚合，排除上月与本月未来', () => {
  const { store, dir } = tmpStore()
  addTodo(store, '2026-09-30', '上月', false)
  addTodo(store, '2026-10-01', '月初', true)
  addTodo(store, '2026-10-31', '本月未来', false)

  const stats = store.getStats(new Date('2026-10-21T09:00:00'))
  assert.equal(stats.month.startKey, '2026-10-01')
  assert.equal(stats.month.endKey, '2026-10-31')
  assert.equal(stats.month.days.length, 31)
  assert.equal(stats.month.total, 1)
  assert.equal(stats.month.done, 1)
  assert.equal(stats.month.rate, 1)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('getStats 月天数随当月实际天数（含闰年二月）', () => {
  const { store, dir } = tmpStore()
  assert.equal(store.getStats(new Date('2028-02-15T09:00:00')).month.days.length, 29)
  assert.equal(store.getStats(new Date('2027-02-15T09:00:00')).month.days.length, 28)
  assert.equal(store.getStats(new Date('2026-04-10T09:00:00')).month.days.length, 30)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('getStats 按月同期计算上月环比，月末天数不等时截断', () => {
  const { store, dir } = tmpStore()
  // 上月同期 = 2026-09-01 至 2026-09-21
  addTodo(store, '2026-09-10', '上月同期', true)
  addTodo(store, '2026-09-25', '上月同期之后，应被排除', true)
  // 本月 2026-10-01 至 2026-10-21
  addTodo(store, '2026-10-05', '本月 a', true)
  addTodo(store, '2026-10-06', '本月 b', false)

  const stats = store.getStats(new Date('2026-10-21T09:00:00'))
  assert.equal(stats.month.rate, 0.5)
  assert.equal(stats.month.prev.total, 1)
  assert.equal(stats.month.prev.rate, 1)
  assert.equal(stats.month.delta.rate, -0.5)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('getStats 按优先级分档统计', () => {
  const { store, dir } = tmpStore()
  addTodo(store, '2026-10-19', '高 a', true, 'high')
  addTodo(store, '2026-10-19', '高 b', false, 'high')
  addTodo(store, '2026-10-20', '中 a', true, 'medium')
  addTodo(store, '2026-10-21', '低 a', false, 'low')

  const stats = store.getStats(new Date('2026-10-21T09:00:00'))
  assert.deepEqual(stats.week.byPriority.high, { total: 2, done: 1 })
  assert.deepEqual(stats.week.byPriority.medium, { total: 1, done: 1 })
  assert.deepEqual(stats.week.byPriority.low, { total: 1, done: 0 })
  assert.deepEqual(stats.month.byPriority.high, { total: 2, done: 1 })
  fs.rmSync(dir, { recursive: true, force: true })
})

test('连续完成天数：今天还没完成时不清零', () => {
  const { store, dir } = tmpStore()
  addTodo(store, '2026-10-18', '周日', true)
  addTodo(store, '2026-10-19', '周一', true)
  addTodo(store, '2026-10-20', '周二', true)

  const stats = store.getStats(new Date('2026-10-21T09:00:00'))
  assert.equal(stats.streak, 3)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('连续完成天数：中途断档从最近一段重新计数', () => {
  const { store, dir } = tmpStore()
  addTodo(store, '2026-10-17', '周六', true)
  addTodo(store, '2026-10-18', '周日', true)
  addTodo(store, '2026-10-19', '周一未完成', false)
  addTodo(store, '2026-10-20', '周二', true)

  const stats = store.getStats(new Date('2026-10-21T09:00:00'))
  assert.equal(stats.streak, 1)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('getStats 返回已完成任务清单，同日同名合并计数', () => {
  const { store, dir } = tmpStore()
  addTodo(store, '2026-10-19', '读论文', true)
  addTodo(store, '2026-10-19', '写周报', true)
  addTodo(store, '2026-10-19', '读论文', true)
  addTodo(store, '2026-10-20', '健身', true)
  addTodo(store, '2026-10-21', '没做完的事', false)
  addTodo(store, '2026-10-24', '未来日期的事', true)

  const stats = store.getStats(new Date('2026-10-21T09:00:00'))
  assert.equal(stats.week.completed.length, 2)
  assert.equal(stats.week.completed[0].key, '2026-10-20')
  assert.deepEqual(stats.week.completed[0].items, [{ text: '健身', count: 1 }])

  const monday = stats.week.completed.find((g) => g.key === '2026-10-19')
  assert.equal(monday.month, 10)
  assert.equal(monday.day, 19)
  assert.deepEqual(
    monday.items.map((i) => [i.text, i.count]),
    [
      ['读论文', 2],
      ['写周报', 1],
    ]
  )

  const texts = stats.week.completed.flatMap((g) => g.items.map((i) => i.text))
  assert.equal(texts.includes('没做完的事'), false)
  assert.equal(texts.includes('未来日期的事'), false)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('无待办记录时完成率与环比为 null', () => {
  const { store, dir } = tmpStore()
  const stats = store.getStats(new Date('2026-10-21T09:00:00'))
  assert.equal(stats.week.rate, null)
  assert.equal(stats.week.delta.rate, null)
  assert.equal(stats.week.delta.done, null)
  assert.equal(stats.month.rate, null)
  assert.equal(stats.month.prev.total, 0)
  assert.equal(stats.streak, 0)
  fs.rmSync(dir, { recursive: true, force: true })
})
