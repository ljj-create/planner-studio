const api = window.planner

const todayEl = document.getElementById('today')
const taskForm = document.getElementById('task-form')
const taskTitle = document.getElementById('task-title')
const taskDue = document.getElementById('task-due')
const taskList = document.getElementById('task-list')
const todoForm = document.getElementById('todo-form')
const todoInput = document.getElementById('todo-input')
const todoPriority = document.getElementById('todo-priority')
const todoRepeat = document.getElementById('todo-repeat')
const todoList = document.getElementById('todo-list')
const todayProgress = document.getElementById('today-progress')
const clearOverdueBtn = document.getElementById('clear-overdue-btn')
const statTabs = document.getElementById('stat-tabs')
const statRangeLine = document.getElementById('stat-range-line')
const statToday = document.getElementById('stat-today')
const statRate = document.getElementById('stat-rate')
const statRateLabel = document.getElementById('stat-rate-label')
const statDelta = document.getElementById('stat-delta')
const statDeltaLabel = document.getElementById('stat-delta-label')
const statStreak = document.getElementById('stat-streak')
const weekChartWrap = document.getElementById('week-chart-wrap')
const weekChart = document.getElementById('week-chart')
const monthHeatWrap = document.getElementById('month-heat-wrap')
const monthHeat = document.getElementById('month-heat')
const doneList = document.getElementById('done-list')
const doneCount = document.getElementById('done-count')
const settingTheme = document.getElementById('setting-theme')
const settingNotify = document.getElementById('setting-notify')
const settingAutoLaunch = document.getElementById('setting-autolaunch')
const backupExportBtn = document.getElementById('backup-export-btn')
const backupImportBtn = document.getElementById('backup-import-btn')
const calPrev = document.getElementById('cal-prev')
const calNext = document.getElementById('cal-next')
const calTitle = document.getElementById('cal-title')
const calGrid = document.getElementById('cal-grid')
const calDayTitle = document.getElementById('cal-day-title')
const calDayTodos = document.getElementById('cal-day-todos')

let tasks = []
let todos = []
let allTodos = {}
let stats = null
let statRange = 'week'
let currentDayKey = dateKey()
const now = new Date()
let calYear = now.getFullYear()
let calMonth = now.getMonth()
let selectedKey = dateKey(now)

function dateKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatCountdown(task) {
  const diff = new Date(task.dueAt).getTime() - Date.now()
  if (diff <= 0) return { text: '已过期', overdue: true }
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000) % 24
  const mins = Math.floor(diff / 60000) % 60
  if (days > 0) return { text: `还剩 ${days} 天 ${hours} 小时`, overdue: false }
  if (hours > 0) return { text: `还剩 ${hours} 小时 ${mins} 分钟`, overdue: false }
  return { text: `还剩 ${mins} 分钟`, overdue: false }
}

function renderTasks() {
  taskList.textContent = ''
  if (tasks.length === 0) {
    const p = document.createElement('p')
    p.className = 'placeholder'
    p.textContent = '还没有未来任务'
    taskList.appendChild(p)
    return
  }
  for (const task of tasks) {
    const card = document.createElement('div')
    card.className = 'task-card'
    const title = document.createElement('span')
    title.className = 'card-title'
    title.textContent = task.title
    const count = formatCountdown(task)
    const time = document.createElement('span')
    time.className = count.overdue ? 'count overdue' : 'count'
    time.textContent = count.text
    const due = document.createElement('span')
    due.className = 'card-due'
    due.textContent = new Date(task.dueAt).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    const del = document.createElement('button')
    del.className = 'icon-btn'
    del.textContent = '×'
    del.title = '删除'
    del.addEventListener('click', () => api.tasks.remove(task.id))
    card.append(title, time, due, del)
    taskList.appendChild(card)
  }
}

const PRIORITY_CLASS = { high: 'p-high', medium: 'p-medium', low: 'p-low' }

function renderTodos() {
  todoList.textContent = ''
  const sorted = [...todos].sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 }
    return rank[a.priority || 'medium'] - rank[b.priority || 'medium']
  })
  const done = sorted.filter((t) => t.done).length
  const total = sorted.length
  todayProgress.textContent = total === 0 ? '' : `已完成 ${done} / ${total}`
  if (total === 0) {
    const li = document.createElement('li')
    li.className = 'placeholder'
    li.textContent = '今天还没有安排'
    todoList.appendChild(li)
    return
  }
  for (const todo of sorted) {
    const li = document.createElement('li')
    li.className = `todo-item ${PRIORITY_CLASS[todo.priority || 'medium']}`
    if (todo.done) li.classList.add('done')
    const check = document.createElement('input')
    check.type = 'checkbox'
    check.checked = todo.done
    check.addEventListener('change', () => api.todos.toggle(dateKey(), todo.id))
    const label = document.createElement('span')
    label.className = 'todo-text'
    label.textContent = todo.text
    label.title = '双击编辑'
    label.addEventListener('dblclick', () => startEdit(label, dateKey(), todo.id, todo.text))
    if (todo.repeat && todo.repeat !== 'none') {
      const tag = document.createElement('button')
      tag.className = 'repeat-tag'
      tag.textContent = { daily: '每日', workdays: '工作日', weekly: '每周一' }[todo.repeat]
      tag.title = '修改重复规则或永久删除'
      tag.addEventListener('click', (e) => {
        e.stopPropagation()
        showRepeatMenu(todo, tag)
      })
      label.appendChild(document.createTextNode(' '))
      label.appendChild(tag)
    }
    const del = document.createElement('button')
    del.className = 'icon-btn'
    del.textContent = '×'
    del.title = '删除'
    del.addEventListener('click', () => api.todos.remove(dateKey(), todo.id))
    li.append(check, label, del)
    todoList.appendChild(li)
  }
}

function formatKey(key) {
  const [, m, d] = key.split('-').map(Number)
  return `${m}月${d}日`
}

function pct(rate) {
  return rate === null || rate === undefined ? '—' : `${Math.round(rate * 100)}%`
}

function renderStats() {
  if (!stats) return
  const isWeek = statRange === 'week'
  const range = isWeek ? stats.week : stats.month

  for (const btn of statTabs.querySelectorAll('.seg-btn')) {
    btn.classList.toggle('is-active', btn.dataset.range === statRange)
  }

  const today = stats.week.days.find((d) => d.isToday)
  statToday.textContent = today && today.total > 0 ? `${today.done} / ${today.total}` : '—'
  statToday.classList.toggle('is-muted', !today || today.total === 0)

  statRate.textContent = pct(range.rate)
  statRate.classList.toggle('is-muted', range.rate === null)
  statRateLabel.textContent = isWeek ? '本周完成率' : '本月完成率'

  const deltaRate = range.delta.rate
  statDelta.textContent =
    deltaRate === null ? '—' : `${deltaRate > 0 ? '+' : ''}${Math.round(deltaRate * 100)}%`
  statDelta.classList.toggle('is-muted', deltaRate === null)
  statDelta.classList.toggle('delta-up', deltaRate !== null && deltaRate > 0)
  statDelta.classList.toggle('delta-down', deltaRate !== null && deltaRate < 0)
  statDeltaLabel.textContent = isWeek ? '较上周同期' : '较上月同期'
  statDelta.title =
    deltaRate === null
      ? '上一周期同期没有待办记录，无法比较'
      : `上一周期同期完成率 ${pct(range.delta.prevRate)}（${range.delta.prevDone} / ${range.delta.prevTotal}）`

  statStreak.textContent = stats.streak
  statStreak.classList.toggle('is-muted', stats.streak === 0)

  const prefix = isWeek ? '本周' : '本月'
  statRangeLine.textContent =
    range.total === 0
      ? `${prefix} ${range.label} · 暂无待办记录`
      : `${prefix} ${range.label} · 完成 ${range.done} / ${range.total} 项 · 统计至 ${formatKey(range.countedEndKey)}`

  weekChartWrap.classList.toggle('hidden', !isWeek)
  monthHeatWrap.classList.toggle('hidden', isWeek)
  if (isWeek) renderWeekChart(stats.week)
  else renderMonthHeat(stats.month)

  renderCompleted(range)
}

function renderWeekChart(week) {
  weekChart.textContent = ''
  for (const day of week.days) {
    const col = document.createElement('div')
    col.className = 'chart-col'

    const track = document.createElement('div')
    track.className = 'chart-track'
    if (day.isFuture) {
      track.classList.add('is-future')
    } else {
      if (day.isToday) track.classList.add('is-today')
      if (day.rate !== null) {
        const bar = document.createElement('div')
        bar.className = 'chart-bar'
        if (day.rate === 0) bar.classList.add('is-zero')
        bar.style.height = `${Math.round(day.rate * 100)}%`
        track.appendChild(bar)
      }
    }

    const val = document.createElement('span')
    val.className = 'chart-val'
    val.textContent = day.isFuture ? '' : day.total === 0 ? '—' : `${day.done}/${day.total}`

    const label = document.createElement('span')
    label.className = 'chart-label'
    if (day.isToday) label.classList.add('is-today')
    label.textContent = day.weekday

    col.title = day.isFuture
      ? `${formatKey(day.key)} 尚未到来`
      : `${formatKey(day.key)} 完成 ${day.done} / ${day.total}`
    col.append(track, val, label)
    weekChart.appendChild(col)
  }
}

function renderMonthHeat(month) {
  monthHeat.textContent = ''
  const lead = (new Date(month.days[0].year, month.days[0].month - 1, 1).getDay() + 6) % 7
  for (let i = 0; i < lead; i++) {
    const blank = document.createElement('span')
    blank.className = 'heat-blank'
    monthHeat.appendChild(blank)
  }
  for (const day of month.days) {
    const cell = document.createElement('div')
    if (day.isFuture) {
      cell.className = 'heat-cell is-future'
    } else if (day.total === 0) {
      cell.className = 'heat-cell is-empty'
    } else if (day.rate === 0) {
      cell.className = 'heat-cell lvl-0'
    } else if (day.rate <= 0.34) {
      cell.className = 'heat-cell lvl-1'
    } else if (day.rate <= 0.67) {
      cell.className = 'heat-cell lvl-2'
    } else if (day.rate < 1) {
      cell.className = 'heat-cell lvl-3'
    } else {
      cell.className = 'heat-cell lvl-4'
    }
    if (day.isToday) cell.classList.add('is-today')
    cell.textContent = day.day
    cell.title = day.isFuture
      ? `${formatKey(day.key)} 尚未到来`
      : `${formatKey(day.key)} 完成 ${day.done} / ${day.total}`
    if (!day.isFuture) cell.addEventListener('click', () => jumpToDate(day.key))
    monthHeat.appendChild(cell)
  }
}

function renderCompleted(range) {
  doneList.textContent = ''
  const groups = range.completed || []
  const totalDone = groups.reduce((sum, g) => sum + g.items.reduce((s, i) => s + i.count, 0), 0)
  doneCount.textContent = totalDone === 0 ? '' : `共 ${totalDone} 项`
  if (groups.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'placeholder'
    empty.textContent = '这一周期还没有完成的任务'
    doneList.appendChild(empty)
    return
  }
  for (const group of groups) {
    const row = document.createElement('div')
    row.className = 'done-row'
    const date = document.createElement('span')
    date.className = 'done-date'
    date.textContent = `${group.month}月${group.day}日`
    const items = document.createElement('div')
    items.className = 'done-items'
    for (const item of group.items) {
      const chip = document.createElement('span')
      chip.className = 'done-item'
      chip.textContent = item.count > 1 ? `${item.text} ×${item.count}` : item.text
      chip.title = `${formatKey(group.key)} ${item.text}${item.count > 1 ? ` ×${item.count}` : ''}`
      items.appendChild(chip)
    }
    row.append(date, items)
    doneList.appendChild(row)
  }
}

function jumpToDate(key) {
  const [y, m] = key.split('-').map(Number)
  calYear = y
  calMonth = m - 1
  selectedKey = key
  renderCalendar()
  document.querySelector('.calendar-panel').scrollIntoView({ behavior: 'smooth', block: 'center' })
}

async function refreshStats() {
  stats = await api.stats.get()
  renderStats()
}

statTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn')
  if (!btn || btn.dataset.range === statRange) return
  statRange = btn.dataset.range
  renderStats()
})

async function applyTheme() {
  const settings = await api.settings.get()
  document.body.dataset.theme = settings.theme
  return settings
}

async function syncSettings() {
  const settings = await applyTheme()
  settingTheme.value = settings.theme
  settingNotify.checked = settings.notify
  settingAutoLaunch.checked = settings.autoLaunch
}

function startEdit(label, key, id, text) {
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'edit-input'
  input.value = text
  let done = false
  const finish = (save) => {
    if (done) return
    done = true
    const value = input.value.trim()
    if (save && value && value !== text) {
      api.todos.rename(key, id, value)
    }
    input.replaceWith(label)
    label.textContent = text
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      finish(true)
      input.blur()
    } else if (e.key === 'Escape') {
      finish(false)
      input.blur()
    }
  })
  input.addEventListener('blur', () => finish(false))
  label.replaceWith(input)
  input.focus()
  input.select()
}

function showRepeatMenu(todo, anchor) {
  const templateId = todo.repeatOf || todo.id
  document.querySelector('.repeat-menu')?.remove()
  const menu = document.createElement('div')
  menu.className = 'repeat-menu'
  const title = document.createElement('div')
  title.className = 'menu-title'
  title.textContent = '修改重复规则'
  menu.appendChild(title)
  for (const [val, label] of [
    ['daily', '每天'],
    ['workdays', '工作日'],
    ['weekly', '每周一'],
    ['none', '不重复'],
  ]) {
    const b = document.createElement('button')
    b.textContent = label + (todo.repeat === val ? ' ✓' : '')
    b.addEventListener('click', async () => {
      menu.remove()
      await api.todos.updateRepeat(templateId, val)
    })
    menu.appendChild(b)
  }
  const sep = document.createElement('div')
  sep.className = 'menu-sep'
  const del = document.createElement('button')
  del.className = 'danger'
  del.textContent = '永久删除此任务'
  let armed = false
  del.addEventListener('click', async () => {
    if (!armed) {
      armed = true
      del.textContent = '再次点击确认永久删除'
      return
    }
    menu.remove()
    await api.todos.deleteRepeat(templateId)
  })
  menu.append(sep, del)
  document.body.appendChild(menu)
  const r = anchor.getBoundingClientRect()
  menu.style.left = `${Math.min(r.left, window.innerWidth - 160)}px`
  menu.style.top = `${r.bottom + 4}px`
  setTimeout(() => {
    document.addEventListener(
      'click',
      (e) => {
        if (!menu.contains(e.target)) menu.remove()
      },
      { once: true }
    )
  }, 0)
}

function renderCalendar() {
  calTitle.textContent = `${calYear}年${calMonth + 1}月`
  calGrid.textContent = ''
  const first = new Date(calYear, calMonth, 1)
  const startDay = first.getDay()
  const todayKey = dateKey(new Date())
  for (let i = 0; i < 42; i++) {
    const d = new Date(calYear, calMonth, 1 - startDay + i)
    const key = dateKey(d)
    const cell = document.createElement('div')
    cell.className = 'cal-cell'
    cell.textContent = d.getDate()
    if (d.getMonth() !== calMonth) cell.classList.add('dim')
    if (key === todayKey) cell.classList.add('today')
    if (key === selectedKey) cell.classList.add('selected')
    const hasTodo = (allTodos[key] || []).length > 0
    const hasTask = tasks.some((t) => dateKey(new Date(t.dueAt)) === key)
    if (hasTodo || hasTask) {
      const dot = document.createElement('span')
      dot.className = hasTask ? 'dot task-dot' : 'dot'
      cell.appendChild(dot)
    }
    cell.addEventListener('click', () => {
      selectedKey = key
      renderCalendar()
      renderSelectedDay()
    })
    calGrid.appendChild(cell)
  }
  renderSelectedDay()
}

function renderSelectedDay() {
  calDayTitle.textContent = selectedKey === dateKey(new Date()) ? '今日待办' : `${selectedKey} 待办`
  calDayTodos.textContent = ''
  const dayTodos = (allTodos[selectedKey] || []).sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 }
    return rank[a.priority || 'medium'] - rank[b.priority || 'medium']
  })
  const dayTasks = tasks.filter((t) => dateKey(new Date(t.dueAt)) === selectedKey)
  for (const task of dayTasks) {
    const li = document.createElement('li')
    li.className = 'cal-task'
    li.textContent = `⏰ ${task.title}`
    calDayTodos.appendChild(li)
  }
  if (dayTodos.length === 0 && dayTasks.length === 0) {
    const li = document.createElement('li')
    li.className = 'placeholder'
    li.textContent = '这一天没有安排'
    calDayTodos.appendChild(li)
    return
  }
  for (const todo of dayTodos) {
    const li = document.createElement('li')
    li.className = `todo-item ${PRIORITY_CLASS[todo.priority || 'medium']}`
    if (todo.done) li.classList.add('done')
    const check = document.createElement('input')
    check.type = 'checkbox'
    check.checked = todo.done
    check.addEventListener('change', () => api.todos.toggle(selectedKey, todo.id))
    const label = document.createElement('span')
    label.className = 'todo-text'
    label.textContent = todo.text
    const del = document.createElement('button')
    del.className = 'icon-btn'
    del.textContent = '×'
    del.title = '删除'
    del.addEventListener('click', () => api.todos.remove(selectedKey, todo.id))
    li.append(check, label, del)
    calDayTodos.appendChild(li)
  }
}

calPrev.addEventListener('click', () => {
  calMonth--
  if (calMonth < 0) {
    calMonth = 11
    calYear--
  }
  renderCalendar()
})

calNext.addEventListener('click', () => {
  calMonth++
  if (calMonth > 11) {
    calMonth = 0
    calYear++
  }
  renderCalendar()
})

backupExportBtn.addEventListener('click', async () => {
  const result = await api.backup.export()
  alert(result.ok ? `备份已保存到：${result.path}` : '已取消导出')
})

backupImportBtn.addEventListener('click', async () => {
  const result = await api.backup.import()
  alert(result.ok ? '备份导入成功' : `导入失败：${result.reason || '已取消'}`)
})

taskForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  await api.tasks.add(taskTitle.value.trim(), taskDue.value)
  taskTitle.value = ''
  taskDue.value = ''
})

todoForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  await api.todos.add(dateKey(), todoInput.value.trim(), {
    priority: todoPriority.value,
    repeat: todoRepeat.value,
  })
  todoInput.value = ''
  todoPriority.value = 'medium'
  todoRepeat.value = 'none'
})

clearOverdueBtn.addEventListener('click', () => api.tasks.clearOverdue())

settingTheme.addEventListener('change', () => api.settings.set({ theme: settingTheme.value }))
settingNotify.addEventListener('change', () => api.settings.set({ notify: settingNotify.checked }))
settingAutoLaunch.addEventListener('change', () => api.autoLaunch(settingAutoLaunch.checked))

function renderHeader() {
  todayEl.textContent = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
}

// 重新读取数据；currentDayKey 用于识别跨天
async function loadData() {
  currentDayKey = dateKey()
  tasks = await api.tasks.list()
  todos = await api.todos.get(currentDayKey)
  allTodos = await api.todos.all()
}

async function refreshAll() {
  await loadData()
  renderHeader()
  renderTasks()
  renderTodos()
  await refreshStats()
  renderCalendar()
  syncSettings()
}

api.onDataChanged(() => refreshAll())

async function init() {
  await refreshAll()
  setInterval(async () => {
    // 跨过零点：今日待办、统计口径、日历高亮都要跟着换天
    if (dateKey() !== currentDayKey) {
      await refreshAll()
      return
    }
    renderTasks()
    await refreshStats()
  }, 60000)
}

init()
