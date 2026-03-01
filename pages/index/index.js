const { getMembers, getMemberById, saveRecord } = require('../../utils/storage')
const { getTodayMedStatus, checkMissedMedications, checkCurrentReminders } = require('../../utils/reminder')
const { getToday, formatDate } = require('../../utils/date')

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// 将 dataset 中的 drugIndex 还原为数字或 null
function parseDrugIndex(val) {
  if (val === null || val === undefined || val === '' || val === 'null') return null
  const n = parseInt(val)
  return isNaN(n) ? null : n
}

Page({
  data: {
    today: '',
    weekday: '',
    members: [],
    currentMember: '',
    allList: [],
    filteredList: [],
    missedCount: 0,
    takenCount: 0,
    completionRate: 0,
    isGuardian: false,
    guardianOwnerName: '',
    isSecondary: false,
    primaryOwnerName: ''
  },

  _lastDataVersion: -1,
  _secondaryReloadTimer: null,
  _guardianReloadTimer: null,

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }

    this._initPage()
  },

  _initPage() {
    const app = getApp()
    const isGuardian = app.globalData.isGuardian
    const isSecondary = app.globalData.isSecondary

    this.setData({
      isGuardian,
      guardianOwnerName: isGuardian ? app.globalData.guardianOwnerName : '',
      isSecondary,
      primaryOwnerName: isSecondary ? app.globalData.primaryOwnerName : ''
    })

    if (isSecondary) {
      this.loadData()
      this.startSecondaryAutoReload()
    } else if (isGuardian) {
      this.loadData()
      this.startGuardianAutoReload()
    } else {
      checkMissedMedications()
      this.loadData()
      this.startReminder()
    }
  },

  onHide() {
    this.stopReminder()
    this.stopSecondaryAutoReload()
    this.stopGuardianAutoReload()
  },

  loadData() {
    const now = new Date()
    const today = formatDate(now)
    const weekday = WEEKDAYS[now.getDay()]
    const members = getMembers()
    const allList = getTodayMedStatus().map(item => {
      const member = getMemberById(item.memberId)
      return { ...item, memberName: member ? member.name : '未知' }
    })

    this.setData({ today, weekday, members, allList })
    this.filterList()
  },

  switchMember(e) {
    this.setData({ currentMember: e.currentTarget.dataset.id })
    this.filterList()
  },

  filterList() {
    const { allList, currentMember } = this.data
    const filteredList = currentMember
      ? allList.filter(i => i.memberId === currentMember)
      : allList
    const takenCount = filteredList.filter(i => i.status === 'taken').length
    const missedCount = filteredList.filter(i => i.status === 'missed').length
    const completionRate = filteredList.length > 0 ? Math.round(takenCount / filteredList.length * 100) : 0
    this.setData({ filteredList, takenCount, missedCount, completionRate })
  },

  takeMedicine(e) {
    if (this.data.isGuardian || this.data.isSecondary) return
    const { medicineId, memberId, time } = e.currentTarget.dataset
    const drugIndex = parseDrugIndex(e.currentTarget.dataset.drugIndex)
    const today = getToday()

    const record = { medicineId, memberId, date: today, time, status: 'taken', takenAt: new Date().toISOString() }
    if (drugIndex !== null) record.drugIndex = drugIndex
    saveRecord(record)

    if (wx.cloud) {
      wx.cloud.callFunction({
        name: 'confirmTaken',
        data: { localMedicineId: medicineId, date: today, time }
      }).catch(err => console.warn('云端确认回写失败:', err))
    }

    wx.showToast({ title: '已记录', icon: 'success' })
    this.loadData()
  },

  handleMissed(e) {
    if (this.data.isGuardian || this.data.isSecondary) return
    const { recordId, medicineId, memberId, time } = e.currentTarget.dataset
    const drugIndex = parseDrugIndex(e.currentTarget.dataset.drugIndex)
    const today = getToday()

    wx.showModal({
      title: '漏服处理',
      content: '是否要记录为补服？',
      confirmText: '补服',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          const record = {
            id: recordId || undefined,
            medicineId, memberId, date: today, time,
            status: 'taken', takenAt: new Date().toISOString()
          }
          if (drugIndex !== null) record.drugIndex = drugIndex
          saveRecord(record)

          if (wx.cloud) {
            wx.cloud.callFunction({
              name: 'confirmTaken',
              data: { localMedicineId: medicineId, date: today, time }
            }).catch(err => console.warn('云端确认回写失败:', err))
          }

          wx.showToast({ title: '已记录补服', icon: 'success' })
          this.loadData()
        }
      }
    })
  },

  goSettings() {
    wx.switchTab({ url: '/pages/settings/settings' })
  },

  // 副成员手动刷新
  manualRefresh() {
    wx.showLoading({ title: '刷新中...' })
    getApp().refreshSecondaryData((success) => {
      wx.hideLoading()
      if (success) {
        this.loadData()
        wx.showToast({ title: '已刷新', icon: 'success' })
      } else {
        wx.showToast({ title: '刷新失败', icon: 'none' })
      }
    })
  },

  // 守护人手动刷新
  guardianManualRefresh() {
    wx.showLoading({ title: '刷新中...' })
    getApp().refreshGuardianData((success) => {
      wx.hideLoading()
      if (success) {
        this.loadData()
        wx.showToast({ title: '已刷新', icon: 'success' })
      } else {
        wx.showToast({ title: '刷新失败', icon: 'none' })
      }
    })
  },

  // 守护人自动重新加载（监听 dataVersion 变化）
  startGuardianAutoReload() {
    this.stopGuardianAutoReload()
    const app = getApp()
    this._lastDataVersion = app.globalData.dataVersion
    this._guardianReloadTimer = setInterval(() => {
      if (app.globalData.dataVersion !== this._lastDataVersion) {
        this._lastDataVersion = app.globalData.dataVersion
        this.loadData()
      }
    }, 2000)
  },

  stopGuardianAutoReload() {
    if (this._guardianReloadTimer) {
      clearInterval(this._guardianReloadTimer)
      this._guardianReloadTimer = null
    }
  },

  // 副成员自动重新加载（监听 dataVersion 变化）
  startSecondaryAutoReload() {
    this.stopSecondaryAutoReload()
    const app = getApp()
    this._lastDataVersion = app.globalData.dataVersion
    this._secondaryReloadTimer = setInterval(() => {
      if (app.globalData.dataVersion !== this._lastDataVersion) {
        this._lastDataVersion = app.globalData.dataVersion
        this.loadData()
      }
    }, 2000)
  },

  stopSecondaryAutoReload() {
    if (this._secondaryReloadTimer) {
      clearInterval(this._secondaryReloadTimer)
      this._secondaryReloadTimer = null
    }
  },

  startReminder() {
    if (this.data.isGuardian || this.data.isSecondary) return
    this.stopReminder()
    const app = getApp()
    app.globalData.reminderInterval = setInterval(() => {
      const reminders = checkCurrentReminders()
      if (reminders.length > 0) {
        const names = reminders.map(r => {
          const member = getMemberById(r.memberId)
          const displayName = r.drugName || r.medicineName
          return `${member ? member.name : ''}的${displayName}(${r.dosage})`
        }).join('、')

        wx.showModal({
          title: '吃药提醒',
          content: `现在该吃药了：${names}`,
          confirmText: '已吃',
          cancelText: '稍后',
          success: (res) => {
            if (res.confirm) {
              const todayStr = getToday()
              reminders.forEach(r => {
                const record = {
                  medicineId: r.medicineId,
                  memberId: r.memberId,
                  date: todayStr,
                  time: r.time,
                  status: 'taken',
                  takenAt: new Date().toISOString()
                }
                if (r.drugIndex !== null) record.drugIndex = r.drugIndex
                saveRecord(record)

                if (wx.cloud) {
                  wx.cloud.callFunction({
                    name: 'confirmTaken',
                    data: { localMedicineId: r.medicineId, date: todayStr, time: r.time }
                  }).catch(err => console.warn('云端确认回写失败:', err))
                }
              })
              this.loadData()
            }
          }
        })
      }
    }, 60000)
  },

  stopReminder() {
    const app = getApp()
    if (app.globalData.reminderInterval) {
      clearInterval(app.globalData.reminderInterval)
      app.globalData.reminderInterval = null
    }
  }
})
