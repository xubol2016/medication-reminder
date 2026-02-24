// 日期工具函数

function formatDate(date) {
  const d = typeof date === 'string' ? new Date(date.replace(/-/g, '/')) : date
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatTime(date) {
  const d = typeof date === 'string' ? new Date(date.replace(/-/g, '/')) : date
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function getToday() {
  return formatDate(new Date())
}

function getNow() {
  return formatTime(new Date())
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
}

// 获取某月的天数
function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

// 获取某月第一天是星期几 (0=周日)
function getFirstDayOfMonth(year, month) {
  return new Date(year, month - 1, 1).getDay()
}

// 比较两个时间字符串 "HH:mm"，返回 -1, 0, 1
function compareTime(a, b) {
  const [ah, am] = a.split(':').map(Number)
  const [bh, bm] = b.split(':').map(Number)
  if (ah !== bh) return ah < bh ? -1 : 1
  if (am !== bm) return am < bm ? -1 : 1
  return 0
}

module.exports = {
  formatDate,
  formatTime,
  getToday,
  getNow,
  generateId,
  getDaysInMonth,
  getFirstDayOfMonth,
  compareTime
}
