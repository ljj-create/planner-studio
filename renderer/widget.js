const api = window.planner

const mottoEl = document.getElementById('motto')
const countdownList = document.getElementById('countdown-list')
const countdownPanel = document.getElementById('countdown-panel')
const todoList = document.getElementById('todo-list')
const progressBar = document.getElementById('progress-bar')
const progressText = document.getElementById('progress-text')
const weekBoard = document.getElementById('week-board')
const weekRange = document.getElementById('week-range')

let tasks = []
let todos = []
let allTodos = {}
let mottoText = ''
let currentDayKey = dateKey()

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
  countdownList.textContent = ''
  if (tasks.length === 0) {
    const p = document.createElement('p')
    p.className = 'placeholder'
    p.textContent = '没有倒计时任务'
    countdownList.appendChild(p)
    return
  }
  for (const task of tasks) {
    const card = document.createElement('div')
    card.className = 'countdown-card'
    const title = document.createElement('span')
    title.className = 'card-title'
    title.textContent = task.title
    const count = formatCountdown(task)
    const time = document.createElement('span')
    time.className = count.overdue ? 'count-overdue' : 'count'
    time.textContent = count.text
    const due = document.createElement('span')
    due.className = 'card-due'
    due.textContent = new Date(task.dueAt).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    card.append(title, time, due)
    countdownList.appendChild(card)
  }
}

function renderTodos() {
  todoList.textContent = ''
  const done = todos.filter((t) => t.done).length
  const total = todos.length
  progressBar.style.width = total === 0 ? '0%' : `${Math.round((done / total) * 100)}%`
  progressText.textContent = total === 0 ? '0 / 0' : `${done} / ${total}`
  if (total === 0) {
    const li = document.createElement('li')
    li.className = 'placeholder'
    li.textContent = '今日暂无待办'
    todoList.appendChild(li)
    return
  }
  for (const todo of todos) {
    const li = document.createElement('li')
    li.className = `todo-item p-${todo.priority || 'medium'}`
    if (todo.done) li.classList.add('done')
    const check = document.createElement('input')
    check.type = 'checkbox'
    check.checked = todo.done
    check.addEventListener('change', () => api.todos.toggle(dateKey(), todo.id))
    const label = document.createElement('span')
    label.className = 'todo-text'
    label.textContent = todo.text
    li.append(check, label)
    todoList.appendChild(li)
  }
}

document.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  api.openManager()
})

// 本周：每天一块，块内任务竖排一条一行，块之间用分隔线隔开，已完成就地划线
function startOfWeek(base = new Date()) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

const RANK = { high: 0, medium: 1, low: 2 }
const WEEKDAY_FULL = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function renderWeek() {
  weekBoard.textContent = ''
  const start = startOfWeek()
  const todayKey = dateKey()
  const days = Array.from(
    { length: 7 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
  )
  const first = days[0]
  const last = days[6]
  weekRange.textContent =
    first.getMonth() === last.getMonth()
      ? `${first.getMonth() + 1}/${first.getDate()} - ${last.getDate()}`
      : `${first.getMonth() + 1}/${first.getDate()} - ${last.getMonth() + 1}/${last.getDate()}`

  for (const d of days) {
    const key = dateKey(d)
    // 与周看板同一口径：只算特殊任务，日常任务每天固定不参与
    const list = (allTodos[key] || [])
      .filter((t) => !t.dailyId)
      .sort((a, b) => (RANK[a.priority] ?? 1) - (RANK[b.priority] ?? 1))
    const done = list.filter((t) => t.done).length

    const block = document.createElement('div')
    block.className = 'week-day-block'
    if (key === todayKey) block.classList.add('is-today')

    // 标题行：周一 11/2 …… 2/4
    const head = document.createElement('div')
    head.className = 'week-day-head'

    const weekday = document.createElement('span')
    weekday.className = 'week-day'
    weekday.textContent = WEEKDAY_FULL[(d.getDay() + 6) % 7]

    const date = document.createElement('span')
    date.className = 'week-date'
    date.textContent = `${d.getMonth() + 1}/${d.getDate()}`

    const count = document.createElement('span')
    count.className = 'week-count'
    count.textContent = list.length === 0 ? '—' : `${done}/${list.length}`

    head.append(weekday, date, count)
    block.appendChild(head)

    // 任务竖排，一条一行，写不下就省略号，不挤在同一行
    if (list.length > 0) {
      const tasks = document.createElement('ul')
      tasks.className = 'week-tasks'
      for (const todo of list) {
        const li = document.createElement('li')
        li.className = 'week-task'
        if (todo.done) li.classList.add('done')
        li.textContent = todo.text
        tasks.appendChild(li)
      }
      block.appendChild(tasks)
    }

    block.title =
      list.length === 0
        ? `${d.getMonth() + 1}月${d.getDate()}日 无安排`
        : `${d.getMonth() + 1}月${d.getDate()}日 ${list
            .map((t) => `${t.done ? '✓' : '·'}${t.text}`)
            .join('  ')}`
    block.addEventListener('click', () => api.openManager())
    weekBoard.appendChild(block)
  }
}

function renderMotto() {
  mottoEl.textContent = mottoText
}

function startMottoEdit() {
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'motto-input'
  input.value = mottoText
  input.maxLength = 50
  let done = false
  const finish = (save) => {
    if (done) return
    done = true
    const value = input.value.trim()
    if (save && value && value !== mottoText) {
      api.settings.set({ motto: value })
    }
    input.replaceWith(mottoEl)
    renderMotto()
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
  mottoEl.replaceWith(input)
  input.focus()
  input.select()
}

mottoEl.addEventListener('dblclick', startMottoEdit)

api.onDataChanged(async () => {
  await loadData()
  renderTasks()
  renderTodos()
  renderWeek()
  applySettings()
})

// 重新读取今天的数据；currentDayKey 用于识别跨天
async function loadData() {
  currentDayKey = dateKey()
  tasks = await api.tasks.list()
  todos = await api.todos.get(currentDayKey)
  allTodos = await api.todos.all()
}

async function applySettings() {
  const settings = await api.settings.get()
  document.body.dataset.theme = settings.theme
  mottoText = settings.motto || ''
  // 旧数据没有这个字段，按显示处理
  countdownPanel.classList.toggle('hidden', settings.showCountdown === false)
  renderMotto()
}

async function init() {
  await loadData()
  await applySettings()
  renderTasks()
  renderTodos()
  renderWeek()
  setInterval(() => {
    // 倒计时每分钟刷新；跨过零点后要重新取当天待办，否则挂件一直显示昨天
    if (dateKey() !== currentDayKey) {
      loadData().then(() => {
        renderTasks()
        renderTodos()
        renderWeek()
      })
      return
    }
    renderTasks()
  }, 60000)
}

init()
