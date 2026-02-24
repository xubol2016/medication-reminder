const { getMembers, getMedicines, cleanOldRecords, getGuardians } = require('../../utils/storage')

Page({
  data: {
    memberCount: 0,
    medicineCount: 0,
    guardianCount: 0
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.setData({
      memberCount: getMembers().length,
      medicineCount: getMedicines().length,
      guardianCount: getGuardians().length
    })
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

  cleanOldData() {
    wx.showModal({
      title: '清理历史记录',
      content: '将删除6个月前的服药记录，确定吗？',
      success: (res) => {
        if (res.confirm) {
          cleanOldRecords(6)
          wx.showToast({ title: '已清理', icon: 'success' })
        }
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
              data: { action: 'subscribe' }
            }).catch(err => console.warn('记录订阅配额失败:', err))
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

  requestGuardianSubscription() {
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
          if (wx.cloud) {
            wx.cloud.callFunction({
              name: 'bindGuardian',
              data: { action: 'subscribe' }
            }).catch(err => console.warn('记录订阅配额失败:', err))
          }
          wx.showToast({ title: '已授权守护通知', icon: 'success' })
        } else {
          wx.showToast({ title: '已取消授权', icon: 'none' })
        }
      },
      fail: () => {
        wx.showToast({ title: '授权失败', icon: 'none' })
      }
    })
  },

  clearAllData() {
    wx.showModal({
      title: '警告',
      content: '将清除所有成员、药物和服药记录，此操作不可恢复！',
      confirmColor: '#E74C3C',
      success: (res) => {
        if (res.confirm) {
          wx.showModal({
            title: '再次确认',
            content: '真的要删除所有数据吗？',
            confirmColor: '#E74C3C',
            success: (res2) => {
              if (res2.confirm) {
                wx.setStorageSync('members', [])
                wx.setStorageSync('medicines', [])
                wx.setStorageSync('records', [])
                wx.setStorageSync('guardians', [])
                this.onShow()
                wx.showToast({ title: '已清除', icon: 'success' })
              }
            }
          })
        }
      }
    })
  }
})
