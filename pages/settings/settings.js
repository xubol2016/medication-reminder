const { getMembers, getMedicines, cleanOldRecords, getGuardians } = require('../../utils/storage')

Page({
  data: {
    memberCount: 0,
    medicineCount: 0,
    guardianCount: 0,
    myRemaining: -1,
    guardianTotal: -1,
    isGuardian: false,
    guardianOwnerName: '',
    isSecondary: false,
    primaryOwnerName: '',
    showDialog: false,
    dialogTitle: '',
    dialogContent: '',
    dialogShowCancel: true,
    dialogCancelText: '取消',
    dialogConfirmText: '确定',
    dialogConfirmDanger: false
  },

  _lastDataVersion: -1,
  _secondaryReloadTimer: null,

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    const app = getApp()
    const isGuardian = app.globalData.isGuardian
    const isSecondary = app.globalData.isSecondary === true
    this.setData({
      isGuardian,
      guardianOwnerName: isGuardian ? app.globalData.guardianOwnerName : '',
      isSecondary,
      primaryOwnerName: isSecondary ? app.globalData.primaryOwnerName : '',
      memberCount: getMembers().length,
      medicineCount: getMedicines().length,
      guardianCount: getGuardians().length
    })
    this.loadQuota()
    if (isSecondary) {
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
        this.setData({
          memberCount: getMembers().length,
          medicineCount: getMedicines().length
        })
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
        this.setData({
          memberCount: getMembers().length,
          medicineCount: getMedicines().length
        })
      }
    }, 2000)
  },

  stopSecondaryAutoReload() {
    if (this._secondaryReloadTimer) {
      clearInterval(this._secondaryReloadTimer)
      this._secondaryReloadTimer = null
    }
  },

  loadQuota() {
    if (!wx.cloud) return
    const app = getApp()
    const templateId = app.globalData.subscribeTemplateId
    if (!templateId) return
    wx.cloud.callFunction({
      name: 'bindGuardian',
      data: { action: 'getQuota', templateId }
    }).then(res => {
      if (res.result && res.result.success) {
        const app = getApp()
        const isSecondary = app.globalData.isSecondary === true
        if (isSecondary) {
          // 副成员只显示自己的配额
          this.setData({
            myRemaining: res.result.myRemaining
          })
        } else {
          // Owner 显示自己的 + 副成员的合并配额
          this.setData({
            myRemaining: res.result.myRemaining + (res.result.secondaryTotal || 0),
            guardianTotal: res.result.guardianTotal
          })
        }
      }
    }).catch(() => {})
  },

  goMembers() {
    wx.navigateTo({ url: '/pages/members/members' })
  },

  goMedicines() {
    wx.navigateTo({ url: '/pages/medicines/medicines' })
  },

  goGuardians() {
    wx.navigateTo({ url: '/pages/guardians/guardians' })
  },

  _showDialog({ title, content, showCancel = true, cancelText = '取消', confirmText = '确定', danger = false, onConfirm, onCancel }) {
    this._dialogCallback = { onConfirm, onCancel }
    this.setData({
      showDialog: true,
      dialogTitle: title,
      dialogContent: content,
      dialogShowCancel: showCancel,
      dialogCancelText: cancelText,
      dialogConfirmText: confirmText,
      dialogConfirmDanger: danger
    })
  },

  dialogConfirm() {
    this.setData({ showDialog: false })
    if (this._dialogCallback && this._dialogCallback.onConfirm) {
      this._dialogCallback.onConfirm()
    }
    this._dialogCallback = null
  },

  dialogCancel() {
    this.setData({ showDialog: false })
    if (this._dialogCallback && this._dialogCallback.onCancel) {
      this._dialogCallback.onCancel()
    }
    this._dialogCallback = null
  },

  noop() {},

  cleanOldData() {
    this._showDialog({
      title: '清理历史记录',
      content: '将删除6个月前的服药记录，确定吗？',
      confirmText: '确定清理',
      onConfirm: () => {
        cleanOldRecords(6)
        wx.showToast({ title: '已清理', icon: 'success' })
      }
    })
  },

  requestSubscription() {
    const app = getApp()
    const templateId = app.globalData.subscribeTemplateId
    if (!templateId) {
      wx.showToast({ title: '提醒模板未配置', icon: 'none' })
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: (res) => {
        if (res[templateId] === 'accept') {
          // 记录订阅配额到云端
          if (wx.cloud) {
            wx.cloud.callFunction({
              name: 'bindGuardian',
              data: { action: 'subscribe', templateId }
            }).then(() => this.loadQuota()).catch(err => console.warn('记录订阅配额失败:', err))
          }
          wx.showToast({ title: '已授权提醒', icon: 'success' })
        } else {
          wx.showToast({ title: '已取消授权', icon: 'none' })
        }
      },
      fail: () => {
        wx.showToast({ title: '授权失败', icon: 'none' })
      }
    })
  },

  showGuardianQuotaTip() {
    const total = this.data.guardianTotal
    let content
    if (total < 0) {
      content = '守护人配额信息加载中，请稍后再试。'
    } else if (total === 0) {
      content = '当前所有守护人的通知配额为0，漏服提醒无法送达。\n\n请让守护人打开小程序，在「守护人管理」页点击「续订提醒」进行授权。'
    } else {
      content = `当前守护人通知配额共${total}次。\n\n配额由守护人自行授权获得，每次授权+1次，每发送一条漏服通知-1次。\n如需增加，请让守护人点击「增加守护人提醒配额」。`
    }

    const myR = this.data.myRemaining
    if (myR >= 0) {
      content += `\n\n您的服药提醒配额：${myR}次（含副成员配额），用于到点推送服药提醒。`
    }
    this._showDialog({
      title: '守护通知说明',
      content,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  clearAllData() {
    this._showDialog({
      title: '警告',
      content: '将清除所有成员、药物和服药记录，此操作不可恢复！',
      confirmText: '确定删除',
      danger: true,
      onConfirm: () => {
        this._showDialog({
          title: '再次确认',
          content: '真的要删除所有数据吗？此操作无法撤销！',
          confirmText: '确认删除',
          danger: true,
          onConfirm: () => {
            wx.setStorageSync('members', [])
            wx.setStorageSync('medicines', [])
            wx.setStorageSync('records', [])
            wx.setStorageSync('guardians', [])
            wx.setStorageSync('secondaryMembers', [])
            getApp().resetToOwner()
            this.onShow()
            wx.showToast({ title: '已清除', icon: 'success' })
          }
        })
      }
    })
  }
})
