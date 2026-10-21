#!/usr/bin/env node
// 校验提交信息是否符合 Conventional Commits，规则见 docs/CONVENTIONS.md
const fs = require('fs')

const TYPES = ['feat', 'fix', 'docs', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']
const MAX_HEADER = 72
const HEADER_RE = /^([a-z]+)(\([a-z0-9/-]+\))?(!)?: (.+)$/

function fail(message) {
  console.error(`\n提交信息不符合规范：${message}`)
  console.error('\n格式：<type>(<scope>): <subject>')
  console.error(`type 取值：${TYPES.join(' / ')}`)
  console.error('示例：feat(stats): 增加周/月完成情况分析')
  console.error('规则详见 docs/CONVENTIONS.md\n')
  process.exit(1)
}

const file = process.argv[2]
if (!file) fail('缺少提交信息文件参数')

let raw
try {
  raw = fs.readFileSync(file, 'utf-8')
} catch {
  fail(`无法读取提交信息文件 ${file}`)
}

// git 会往提交信息模板里写以 # 开头的说明，需要忽略
const meaningful = raw.split(/\r?\n/).filter((line) => !line.startsWith('#'))
while (meaningful.length && meaningful[meaningful.length - 1].trim() === '') meaningful.pop()
while (meaningful.length && meaningful[0].trim() === '') meaningful.shift()

if (meaningful.length === 0) fail('提交信息为空')

const header = meaningful[0].trim()
// 合并与回滚提交由 git 自动生成，放行
if (/^(Merge|Revert) /.test(header)) process.exit(0)

const match = header.match(HEADER_RE)
if (!match) fail('标题行不符合 <type>(<scope>): <subject>')
const [, type, , , subject] = match
if (!TYPES.includes(type)) fail(`type "${type}" 不在允许列表内`)
if (!subject.trim()) fail('subject 不能为空')
if (header.length > MAX_HEADER) fail(`标题行 ${header.length} 字符，超过上限 ${MAX_HEADER}`)
if (/[。.]$/.test(subject)) fail('subject 结尾不要加句号')
if (meaningful.length > 1 && meaningful[1].trim() !== '') fail('标题行与正文之间需要空一行')

process.exit(0)
