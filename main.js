const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, dialog, screen } = require('electron')
const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const { DataStore } = require('./data-store')

let store
let managerWin = null
let widgetWin = null
let tray = null
const notifiedTaskIds = new Set()
// 只提醒最近 24 小时内到期的任务，避免每次启动把陈年过期任务全弹一遍
const DUE_NOTIFY_WINDOW_MS = 24 * 60 * 60 * 1000

function broadcast() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('data-changed')
  }
}

function attachToDesktop(win) {
  try {
    const hwnd = win.getNativeWindowHandle().readUInt32LE(0)
    const script = path.join(__dirname, 'assets', 'attach-desktop.ps1')
    const ps = process.env.SystemRoot + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    execFile(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, String(hwnd)], (err) => {
      if (err) console.error('attach to desktop failed:', err.message)
    })
  } catch (e) {
    console.error('attach to desktop failed:', e.message)
  }
}

const WIDGET_W = 340
const WIDGET_H = 560
const isAutoStart = process.argv.includes('--autostart')

function widgetTopRightBounds() {
  const wa = screen.getPrimaryDisplay().workArea
  const margin = 16
  return { x: wa.x + wa.width - WIDGET_W - margin, y: wa.y + margin }
}

function createWidget() {
  const win = new BrowserWindow({
    width: WIDGET_W,
    height: WIDGET_H,
    frame: false,
    transparent: true,
    alwaysOnTop: false,
    skipTaskbar: true,
    resizable: false,
    title: 'Planner Studio',
    ...(isAutoStart ? widgetTopRightBounds() : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  widgetWin = win
  win.loadFile(path.join(__dirname, 'renderer', 'widget.html'))
  win.webContents.once('did-finish-load', () => attachToDesktop(win))
  win.on('closed', () => app.quit())
}

function openManager() {
  if (managerWin && !managerWin.isDestroyed()) {
    managerWin.show()
    managerWin.focus()
    return
  }
  managerWin = new BrowserWindow({
    width: 720,
    height: 860,
    title: 'Planner Studio - 管理',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  managerWin.loadFile(path.join(__dirname, 'renderer', 'manager.html'))
  managerWin.on('closed', () => (managerWin = null))
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'assets', 'tray.png'))
  tray.setToolTip('Planner Studio')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '显示挂件',
        click: () => {
          widgetWin.show()
          widgetWin.focus()
        },
      },
      {
        label: '隐藏挂件',
        click: () => widgetWin.hide(),
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => app.quit(),
      },
    ])
  )
}

function checkDueTasks() {
  const now = Date.now()
  const settings = store.getSettings()
  for (const task of store.getTasks()) {
    const due = new Date(task.dueAt).getTime()
    if (!Number.isFinite(due) || due > now || notifiedTaskIds.has(task.id)) continue
    notifiedTaskIds.add(task.id)
    if (!settings.notify || now - due > DUE_NOTIFY_WINDOW_MS) continue
    if (Notification.isSupported()) {
      new Notification({ title: '任务到期', body: task.title }).show()
    }
  }
}

function checkRepeats() {
  if (store.applyRepeats() > 0) broadcast()
}

function registerIpc() {
  // 第三参数 { mutate: true } 标记写操作：等落盘完成后再广播，两个窗口一起刷新
  const handle = (channel, fn, opts = {}) =>
    ipcMain.handle(channel, async (_e, ...args) => {
      const result = await fn(...args)
      if (opts.mutate) broadcast()
      return result
    })

  handle('todos:get', (dateKey) => store.getTodos(dateKey))
  handle('todos:all', () => store.getAllTodos())
  handle('todos:add', (dateKey, text, extra) => store.addTodo(dateKey, text, extra), { mutate: true })
  handle('todos:toggle', (dateKey, id) => store.toggleTodo(dateKey, id), { mutate: true })
  handle('todos:remove', (dateKey, id) => store.removeTodo(dateKey, id), { mutate: true })
  handle('todos:rename', (dateKey, id, text) => store.renameTodo(dateKey, id, text), { mutate: true })
  handle('todos:updateRepeat', (templateId, repeat) => store.updateRepeat(templateId, repeat), {
    mutate: true,
  })
  handle('todos:deleteRepeat', (templateId) => store.deleteRepeatTemplate(templateId), {
    mutate: true,
  })
  handle('tasks:list', () => store.getTasks())
  handle('tasks:add', (title, dueAt) => store.addTask(title, dueAt), { mutate: true })
  handle('tasks:remove', (id) => store.removeTask(id), { mutate: true })
  handle('tasks:clearOverdue', () => store.clearOverdueTasks(), { mutate: true })
  handle('settings:get', () => store.getSettings())
  handle('settings:set', (partial) => store.setSettings(partial), { mutate: true })
  handle('stats:get', () => store.getStats())
  handle(
    'app:autoLaunch',
    (enabled) => {
      app.setLoginItemSettings({
        openAtLogin: !!enabled,
        args: ['--autostart'],
      })
      return store.setSettings({ autoLaunch: !!enabled })
    },
    { mutate: true }
  )
  handle('backup:export', async () => {
    const dateStr = new Date().toISOString().slice(0, 10)
    const { canceled, filePath } = await dialog.showSaveDialog(managerWin, {
      title: '导出备份',
      defaultPath: `planner-backup-${dateStr}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePath) return { ok: false }
    fs.writeFileSync(filePath, JSON.stringify(store.data, null, 2))
    return { ok: true, path: filePath }
  })
  handle(
    'backup:import',
    async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog(managerWin, {
        title: '导入备份',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      })
      if (canceled || !filePaths[0]) return { ok: false, reason: '已取消' }
      try {
        const parsed = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'))
        return store.importData(parsed)
      } catch {
        return { ok: false, reason: '文件读取失败' }
      }
    },
    { mutate: true }
  )
  ipcMain.on('manager:open', () => openManager())
}

if (!app.requestSingleInstanceLock()) {
  // 已有实例在跑：直接退出，避免两个进程同时读写同一个 data.json
  app.quit()
} else {
  app.on('second-instance', () => {
    if (widgetWin && !widgetWin.isDestroyed()) {
      widgetWin.show()
      widgetWin.focus()
    }
    openManager()
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.planner.studio')
    store = new DataStore(path.join(app.getPath('userData'), 'data.json'))
    registerIpc()
    createWidget()
    createTray()
    checkDueTasks()
    checkRepeats()
    setInterval(() => {
      checkDueTasks()
      checkRepeats()
    }, 30000)
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
