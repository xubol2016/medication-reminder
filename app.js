const { checkMissedMedications } = require('./utils/reminder')

App({
  onLaunch(options) {
    // 初始化云开发
    if (wx.cloud) {
      wx.cloud.init({
        traceUser: true
      })
    }

    // 初始化默认存储
    if (!wx.getStorageSync('members')) {
      wx.setStorageSync('members', [])
    }
    if (!wx.getStorageSync('medicines')) {
      wx.setStorageSync('medicines', [])
    }
    if (!wx.getStorageSync('records')) {
      wx.setStorageSync('records', [])
    }
    if (!wx.getStorageSync('guardians')) {
      wx.setStorageSync('guardians', [])
    }

    // 检查是否通过守护人邀请链接打开
    if (options && options.query && options.query.inviteCode) {
      this.globalData.pendingInviteCode = options.query.inviteCode
    }
  },

  onShow() {
    // 每次打开小程序时同步药品数据到云端
    if (wx.cloud) {
      const { syncMedicinesToCloud } = require('./utils/cloud-sync')
      syncMedicinesToCloud()
    }

    // 每次打开小程序时检查漏服并通知守护人
    const newlyMissed = checkMissedMedications()
    if (newlyMissed && newlyMissed.length > 0 && wx.cloud) {
      const { notifyGuardians } = require('./utils/notify')
      const { getMemberById } = require('./utils/storage')
      const { getToday } = require('./utils/date')
      const today = getToday()
      newlyMissed.forEach(({ med, time }) => {
        const member = getMemberById(med.memberId)
        notifyGuardians(
          member ? member.name : '未知',
          med.name,
          time,
          today
        )
      })
    }
  },

  globalData: {
    reminderInterval: null,
    pendingInviteCode: null,
    subscribeTemplateId: ''  // 在微信后台配置订阅消息模板后填入
  }
})
