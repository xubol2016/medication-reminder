const { getMembers, getMemberById, getRecordsByDate, getMedicines, findRecord } = require('../../utils/storage')
const { getToday, formatDate, getDaysInMonth, getFirstDayOfMonth } = require('../../utils/date')

// 与 reminder.js 保持一致：将药物展开为时间条目（支持具体药名）
function getTimeEntries(med) {
  if (med.drugNames && med.drugNames.length > 0 &&
      med.drugTimes && med.drugTimes.length > 0) {
    const entries = []
    med.drugNames.forEach(function(drugName, i) {
      const times = med.drugTimes[i] || []
      const dosage = (med.drugDosages && med.drugDosages[i]) ? med.drugDosages[i] : med.dosage
      times.forEach(function(time) {
        entries.push({ time: time, drugName: drugName, drugIndex: i, dosage: dosage })
      })
    })
    return entries
  }
  return (med.times || []).map(function(time) {
    return { time: time, drugName: null, drugIndex: null, dosage: med.dosage }
  })
}

Page({
  data: {
    year: 0,
    month: 0,
    selectedDate: '',
    calendarDays: [],
    members: [],
    currentMember: '',
    dayRecords: [],
    dayTakenCount: 0,
    isGuardian: false,
    guardianOwnerName: '',
    isSecondary: false,
    primaryOwnerName: ''
  },

  _lastDataVersion: -1,
  _secondaryReloadTimer: null,

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    const app = getApp()
    this.setData({
      isGuardian: app.globalData.isGuardian,
      guardianOwnerName: app.globalData.isGuardian ? app.globalData.guardianOwnerName : '',
      isSecondary: app.globalData.isSecondary === true,
      primaryOwnerName: app.globalData.isSecondary ? app.globalData.primaryOwnerName : ''
    })
    const now = new Date()
    const today = getToday()
    this.setData({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      selectedDate: today,
      members: getMembers()
    })
    this.buildCalendar()
    this.loadDayRecords()

    if (this.data.isSecondary) {
      this.startSecondaryAutoReload()
    }
  },

  onHide() {
    this.stopSecondaryAutoReload()
  },

  // 副成员手动刷新
  manualRefresh() {
    wx.showLoading({ title: '刷新中...' })
    getApp().refreshSecondaryData((success) => {
      wx.hideLoading()
      if (success) {
        this.setData({ members: getMembers() })
        this.buildCalendar()
        this.loadDayRecords()
        wx.showToast({ title: '已刷新', icon: 'success' })
      } else {
        wx.showToast({ title: '刷新失败', icon: 'none' })
      }
    })
  },

  startSecondaryAutoReload() {
    this.stopSecondaryAutoReload()
    const app = getApp()
    this._lastDataVersion = app.globalData.dataVersion
    this._secondaryReloadTimer = setInterval(() => {
      if (app.globalData.dataVersion !== this._lastDataVersion) {
        this._lastDataVersion = app.globalData.dataVersion
        this.setData({ members: getMembers() })
        this.buildCalendar()
        this.loadDayRecords()
      }
    }, 2000)
  },

  stopSecondaryAutoReload() {
    if (this._secondaryReloadTimer) {
      clearInterval(this._secondaryReloadTimer)
      this._secondaryReloadTimer = null
    }
  },

  prevMonth() {
    let { year, month } = this.data
    month--
    if (month < 1) { month = 12; year-- }
    this.setData({ year, month })
    this.buildCalendar()
  },

  nextMonth() {
    let { year, month } = this.data
    month++
    if (month > 12) { month = 1; year++ }
    this.setData({ year, month })
    this.buildCalendar()
  },

  buildCalendar() {
    const { year, month, selectedDate } = this.data
    const today = getToday()
    const daysInMonth = getDaysInMonth(year, month)
    const firstDay = getFirstDayOfMonth(year, month)
    const days = []

    // 填充月初空白
    for (let i = 0; i < firstDay; i++) {
      days.push({ date: '', day: '' })
    }

    // 获取当月所有记录用于标记
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const dayRecords = getRecordsByDate(dateStr)
      const hasRecords = dayRecords.length > 0
      const allTaken = hasRecords && dayRecords.every(r => r.status === 'taken')
      const hasMissed = dayRecords.some(r => r.status === 'missed')

      days.push({
        date: dateStr,
        day: d,
        isToday: dateStr === today,
        isSelected: dateStr === selectedDate,
        hasRecords,
        allTaken,
        hasMissed
      })
    }

    this.setData({ calendarDays: days })
  },

  selectDate(e) {
    const date = e.currentTarget.dataset.date
    if (!date) return
    this.setData({ selectedDate: date })
    this.buildCalendar()
    this.loadDayRecords()
  },

  switchMember(e) {
    this.setData({ currentMember: e.currentTarget.dataset.id })
    this.loadDayRecords()
  },

  loadDayRecords() {
    const { selectedDate, currentMember } = this.data
    const medicines = getMedicines()
    const records = getRecordsByDate(selectedDate)
    const members = getMembers()

    // 构建当天应服列表
    let dayList = []
    medicines.filter(m => m.enabled).forEach(med => {
      const member = getMemberById(med.memberId)
      const entries = getTimeEntries(med)
      entries.forEach(entry => {
        const record = findRecord(med.id, selectedDate, entry.time, entry.drugIndex)
        dayList.push({
          medicineId: med.id,
          memberId: med.memberId,
          medicineName: med.name,
          drugName: entry.drugName,
          drugIndex: entry.drugIndex,
          memberName: member ? member.name : '未知',
          dosage: entry.dosage,
          time: entry.time,
          status: record ? record.status : 'pending'
        })
      })
    })

    // 按成员筛选
    if (currentMember) {
      dayList = dayList.filter(i => i.memberId === currentMember)
    }

    // 按时间排序
    dayList.sort((a, b) => a.time.localeCompare(b.time))

    const dayTakenCount = dayList.filter(i => i.status === 'taken').length

    this.setData({ dayRecords: dayList, dayTakenCount })
  }
})
