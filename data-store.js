const fs = require('fs')
const path = require('path')

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

const DEFAULT_SETTINGS = {
  theme: 'light',
  notify: true,
  autoLaunch: false,
  motto: '今天的努力，是明天的基石',
}
const PRIORITIES = ['high', 'medium', 'low']
const REPEATS = ['none', 'daily', 'workdays', 'weekly']

function defaultData() {
  return {
    futureTasks: [],
    todos: {},
    repeatSkips: {},
    repeatTemplates: {},
    settings: { ...DEFAULT_SETTINGS },
  }
}

function dateKeyOf(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const WEEKDAY_SHORT = ['日', '一', '二', '三', '四', '五', '六']
const DAY_MS = 86400000

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d, n) {
  const x = startOfDay(d)
  x.setDate(x.getDate() + n)
  return x
}

// 周一为一周起点
function startOfWeek(d) {
  const x = startOfDay(d)
  return addDays(x, -((x.getDay() + 6) % 7))
}

function daysBetween(from, to) {
  return Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS)
}

function rangeLabel(start, end) {
  const y = start.getFullYear() === end.getFullYear() ? '' : `${start.getFullYear()}年`
  if (start.getMonth() === end.getMonth()) {
    return `${y}${start.getMonth() + 1}月${start.getDate()}日 - ${end.getDate()}日`
  }
  return `${y}${start.getMonth() + 1}月${start.getDate()}日 - ${end.getMonth() + 1}月${end.getDate()}日`
}

function makeDelta(current, previous) {
  const rate = current.rate === null || previous.rate === null ? null : current.rate - previous.rate
  const done = previous.total === 0 ? null : current.done - previous.done
  return { rate, done, prevRate: previous.rate, prevDone: previous.done, prevTotal: previous.total }
}

class DataStore {
  constructor(filePath) {
    this.filePath = filePath
    this.data = this.load()
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      const settings = parsed.settings || {}
      return {
        futureTasks: Array.isArray(parsed.futureTasks) ? parsed.futureTasks : [],
        todos: parsed.todos && typeof parsed.todos === 'object' ? parsed.todos : {},
        repeatSkips: parsed.repeatSkips && typeof parsed.repeatSkips === 'object' ? parsed.repeatSkips : {},
        repeatTemplates:
          parsed.repeatTemplates && typeof parsed.repeatTemplates === 'object' ? parsed.repeatTemplates : {},
        settings: { ...DEFAULT_SETTINGS, ...settings },
      }
    } catch {
      return defaultData()
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2))
  }

  getTodos(dateKey) {
    return this.data.todos[dateKey] || []
  }

  getAllTodos() {
    return this.data.todos
  }

  addTodo(dateKey, text, extra = {}) {
    const priority = PRIORITIES.includes(extra.priority) ? extra.priority : 'medium'
    const repeat = REPEATS.includes(extra.repeat) ? extra.repeat : 'none'
    const todo = {
      id: genId(),
      text,
      done: false,
      priority,
      repeat,
      repeatOf: extra.repeatOf || null,
      createdAt: new Date().toISOString(),
    }
    if (todo.repeat !== 'none' && !todo.repeatOf) {
      this.data.repeatTemplates[todo.id] = {
        text: todo.text,
        priority: todo.priority,
        repeat: todo.repeat,
      }
    }
    const list = this.getTodos(dateKey)
    list.push(todo)
    this.data.todos[dateKey] = list
    this.save()
    return list
  }

  toggleTodo(dateKey, id) {
    const todo = this.getTodos(dateKey).find((t) => t.id === id)
    if (todo) {
      todo.done = !todo.done
      todo.doneAt = todo.done ? new Date().toISOString() : null
    }
    this.save()
    return this.getTodos(dateKey)
  }

  removeTodo(dateKey, id) {
    const todo = this.getTodos(dateKey).find((t) => t.id === id)
    if (todo && todo.repeat && todo.repeat !== 'none') {
      const templateId = todo.repeatOf || todo.id
      const skips = this.data.repeatSkips[templateId] || []
      if (!skips.includes(dateKey)) skips.push(dateKey)
      this.data.repeatSkips[templateId] = skips
    }
    this.data.todos[dateKey] = this.getTodos(dateKey).filter((t) => t.id !== id)
    this.save()
    return this.getTodos(dateKey)
  }

  renameTodo(dateKey, id, text) {
    const todo = this.getTodos(dateKey).find((t) => t.id === id)
    if (todo) todo.text = text
    this.save()
    return this.getTodos(dateKey)
  }

  getTasks() {
    return this.data.futureTasks
  }

  addTask(title, dueAt) {
    const task = { id: genId(), title, dueAt, createdAt: new Date().toISOString() }
    this.data.futureTasks.push(task)
    this.save()
    return task
  }

  removeTask(id) {
    this.data.futureTasks = this.data.futureTasks.filter((t) => t.id !== id)
    this.save()
    return this.data.futureTasks
  }

  clearOverdueTasks() {
    const now = Date.now()
    const remaining = this.data.futureTasks.filter((t) => new Date(t.dueAt).getTime() > now)
    this.data.futureTasks = remaining
    this.save()
    return remaining
  }

  getSettings() {
    return this.data.settings
  }

  setSettings(partial) {
    Object.assign(this.data.settings, partial)
    this.save()
    return this.data.settings
  }

  updateRepeat(templateId, repeat) {
    if (!REPEATS.includes(repeat)) return 0
    const tpl = this.data.repeatTemplates[templateId]
    if (tpl) tpl.repeat = repeat
    let n = 0
    for (const dateKey of Object.keys(this.data.todos)) {
      for (const t of this.data.todos[dateKey]) {
        if (t.id === templateId || t.repeatOf === templateId) {
          t.repeat = repeat
          n++
        }
      }
    }
    this.save()
    return n
  }

  deleteRepeatTemplate(templateId) {
    delete this.data.repeatTemplates[templateId]
    delete this.data.repeatSkips[templateId]
    let n = 0
    for (const dateKey of Object.keys(this.data.todos)) {
      const before = this.data.todos[dateKey].length
      this.data.todos[dateKey] = this.data.todos[dateKey].filter(
        (t) => !(t.id === templateId || t.repeatOf === templateId)
      )
      n += before - this.data.todos[dateKey].length
    }
    this.save()
    return n
  }

  // 汇总 [start, start+length) 区间。今天之后的日期不计入 total/done，
  // 但仍会出现在 days 里（前端用来画完整周期的空位）。
  summarize(start, length, today) {
    const startDay = startOfDay(start)
    const todayDay = startOfDay(today)
    const days = []
    const byPriority = {
      high: { total: 0, done: 0 },
      medium: { total: 0, done: 0 },
      low: { total: 0, done: 0 },
    }
    const completedByDay = new Map()
    let total = 0
    let done = 0
    for (let i = 0; i < length; i++) {
      const d = addDays(startDay, i)
      const key = dateKeyOf(d)
      const list = this.getTodos(key)
      const dayTotal = list.length
      const dayDone = list.filter((t) => t.done).length
      const isFuture = d.getTime() > todayDay.getTime()
      days.push({
        key,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
        weekday: WEEKDAY_SHORT[d.getDay()],
        total: dayTotal,
        done: dayDone,
        rate: dayTotal === 0 ? null : dayDone / dayTotal,
        isFuture,
        isToday: d.getTime() === todayDay.getTime(),
      })
      if (isFuture) continue
      total += dayTotal
      done += dayDone
      for (const t of list) {
        const p = PRIORITIES.includes(t.priority) ? t.priority : 'medium'
        byPriority[p].total++
        if (!t.done) continue
        byPriority[p].done++
        if (!completedByDay.has(key)) completedByDay.set(key, new Map())
        const texts = completedByDay.get(key)
        texts.set(t.text, (texts.get(t.text) || 0) + 1)
      }
    }
    const endDay = addDays(startDay, length - 1)
    const countedEnd = endDay.getTime() > todayDay.getTime() ? todayDay : endDay
    // 已完成任务按日期倒序分组，同一天同名的合并计数（重复任务常见）
    const completed = [...completedByDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, texts]) => ({
        key,
        month: Number(key.slice(5, 7)),
        day: Number(key.slice(8, 10)),
        items: [...texts.entries()].map(([text, count]) => ({ text, count })),
      }))
    return {
      startKey: dateKeyOf(startDay),
      endKey: dateKeyOf(endDay),
      countedEndKey: dateKeyOf(countedEnd),
      label: rangeLabel(startDay, endDay),
      total,
      done,
      rate: total === 0 ? null : done / total,
      byPriority,
      completed,
      days,
    }
  }

  // 连续完成天数：今天尚未开始时不清零，从昨天往前回溯
  computeStreak(today = new Date()) {
    const hasDone = (d) => this.getTodos(dateKeyOf(d)).some((t) => t.done)
    let cursor = startOfDay(today)
    if (!hasDone(cursor)) cursor = addDays(cursor, -1)
    let streak = 0
    while (hasDone(cursor) && streak < 3650) {
      streak++
      cursor = addDays(cursor, -1)
    }
    return streak
  }

  // 周/月统计：自然周（周一至周日）、自然月；环比用上一周期的同期区间
  getStats(today = new Date()) {
    const todayDay = startOfDay(today)
    const weekStart = startOfWeek(todayDay)
    const weekElapsed = daysBetween(weekStart, todayDay) + 1
    const week = this.summarize(weekStart, 7, todayDay)
    const prevWeekStart = addDays(weekStart, -7)
    const prevWeek = this.summarize(prevWeekStart, weekElapsed, addDays(prevWeekStart, weekElapsed - 1))

    const monthStart = new Date(todayDay.getFullYear(), todayDay.getMonth(), 1)
    const monthLength = new Date(todayDay.getFullYear(), todayDay.getMonth() + 1, 0).getDate()
    const month = this.summarize(monthStart, monthLength, todayDay)
    const prevMonthStart = new Date(todayDay.getFullYear(), todayDay.getMonth() - 1, 1)
    const prevMonthLength = new Date(todayDay.getFullYear(), todayDay.getMonth(), 0).getDate()
    const prevMonthElapsed = Math.min(todayDay.getDate(), prevMonthLength)
    const prevMonth = this.summarize(
      prevMonthStart,
      prevMonthElapsed,
      addDays(prevMonthStart, prevMonthElapsed - 1)
    )

    return {
      todayKey: dateKeyOf(todayDay),
      streak: this.computeStreak(todayDay),
      week: { ...week, prev: prevWeek, delta: makeDelta(week, prevWeek) },
      month: { ...month, prev: prevMonth, delta: makeDelta(month, prevMonth) },
    }
  }

  shouldRepeat(repeat, date) {
    const day = date.getDay()
    if (repeat === 'daily') return true
    if (repeat === 'workdays') return day >= 1 && day <= 5
    if (repeat === 'weekly') return day === 1
    return false
  }

  applyRepeats(today = new Date()) {
    const todayKey = dateKeyOf(today)
    const todays = this.getTodos(todayKey)
    const hasToday = (templateId) =>
      todays.some((t) => t.repeatOf === templateId || t.id === templateId)
    const seen = new Set()
    let added = 0
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      for (const todo of this.getTodos(dateKeyOf(d))) {
        if (!todo.repeat || todo.repeat === 'none') continue
        const templateId = todo.repeatOf || todo.id
        if (seen.has(templateId)) continue
        seen.add(templateId)
        if (hasToday(templateId)) continue
        if (!this.shouldRepeat(todo.repeat, today)) continue
        const skips = this.data.repeatSkips[templateId] || []
        if (skips.includes(todayKey)) continue
        this.addTodo(todayKey, todo.text, {
          priority: todo.priority,
          repeat: todo.repeat,
          repeatOf: templateId,
        })
        added++
      }
    }
    const templates = this.data.repeatTemplates || {}
    for (const [templateId, tpl] of Object.entries(templates)) {
      if (seen.has(templateId)) continue
      seen.add(templateId)
      if (hasToday(templateId)) continue
      if (!this.shouldRepeat(tpl.repeat, today)) continue
      const skips = this.data.repeatSkips[templateId] || []
      if (skips.includes(todayKey)) continue
      this.addTodo(todayKey, tpl.text, {
        priority: tpl.priority,
        repeat: tpl.repeat,
        repeatOf: templateId,
      })
      added++
    }
    return added
  }
}

module.exports = { DataStore, genId, dateKeyOf }
