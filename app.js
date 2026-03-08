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

    // 新用户默认为主成员（owner）
    if (!wx.getStorageSync('appRole')) {
      wx.setStorageSync('appRole', 'owner')
    }

    // 检查是否通过邀请链接打开
    if (options && options.query && options.query.inviteCode) {
      this.globalData.pendingInviteCode = options.query.inviteCode
    }

    // 根据持久化角色恢复 globalData 状态
    const role = wx.getStorageSync('appRole')
    if (role === 'secondary') {
      this.globalData.isSecondary = true
      this.globalData.secondaryChecked = true
      this.globalData.guardianChecked = true
      this.globalData.primaryOwnerName = wx.getStorageSync('primaryOwnerName') || '家人'
    } else if (role === 'guardian') {
      this.globalData.isGuardian = true
      this.globalData.guardianChecked = true
      this.globalData.secondaryChecked = true
      this.globalData.guardianOwnerName = wx.getStorageSync('guardianOwnerName') || '家人'
    } else {
      // owner
      this.globalData.isGuardian = false
      this.globalData.isSecondary = false
      this.globalData.guardianChecked = true
      this.globalData.secondaryChecked = true
    }
  },

  onShow() {
    const role = wx.getStorageSync('appRole') || 'owner'

    if (role === 'secondary') {
      // 副成员：刷新云端数据
      this.refreshSecondaryData()
      this.startSecondaryRefresh()
    } else if (role === 'guardian') {
      // 守护人：刷新云端数据
      this.refreshGuardianData()
      this.startGuardianRefresh()
    } else {
      // 主成员：正常流程
      this.runOwnerFlow()
    }
  },

  onHide() {
    this.stopSecondaryRefresh()
    this.stopGuardianRefresh()
  },

  // 主成员的正常流程
  runOwnerFlow() {
    if (wx.cloud) {
      const { syncAllToCloud } = require('./utils/cloud-sync')
      syncAllToCloud()
    }

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

  // ===== 角色切换方法（由邀请接受流程调用） =====

  // 切换为副成员角色
  switchToSecondary(data, ownerName) {
    wx.setStorageSync('appRole', 'secondary')
    wx.setStorageSync('primaryOwnerName', ownerName)
    this.globalData.isSecondary = true
    this.globalData.isGuardian = false
    this.globalData.secondaryData = data
    this.globalData.primaryOwnerName = ownerName
    this.globalData.secondaryChecked = true
    this.globalData.guardianChecked = true
    this.startSecondaryRefresh()
  },

  // 切换为守护人角色
  switchToGuardian(data, ownerName) {
    wx.setStorageSync('appRole', 'guardian')
    wx.setStorageSync('guardianOwnerName', ownerName)
    this.globalData.isGuardian = true
    this.globalData.isSecondary = false
    this.globalData.guardianData = data
    this.globalData.guardianOwnerName = ownerName
    this.globalData.guardianChecked = true
    this.globalData.secondaryChecked = true
    this.startGuardianRefresh()
  },

  // 重置为主成员角色
  resetToOwner() {
    wx.setStorageSync('appRole', 'owner')
    this.globalData.isGuardian = false
    this.globalData.isSecondary = false
    this.globalData.guardianData = null
    this.globalData.secondaryData = null
    this.globalData.guardianChecked = true
    this.globalData.secondaryChecked = true
    this.stopSecondaryRefresh()
    this.stopGuardianRefresh()
  },

  // 刷新守护人端的云端数据
  refreshGuardianData(callback) {
    if (!wx.cloud) {
      if (callback) callback(false)
      return
    }
    wx.cloud.callFunction({ name: 'getOwnerData' }).then(res => {
      if (res.result && res.result.success) {
        this.globalData.guardianData = {
          members: res.result.members || [],
          medicines: res.result.medicines || [],
          records: res.result.records || []
        }
        this.globalData.guardianOwnerName = res.result.ownerName || '家人'
        this.globalData.dataVersion++
        if (callback) callback(true)
      } else {
        if (callback) callback(false)
      }
    }).catch(err => {
      console.warn('刷新守护人数据失败:', err)
      if (callback) callback(false)
    })
  },

  // 启动守护人数据自动刷新（60秒间隔）
  startGuardianRefresh() {
    this.stopGuardianRefresh()
    this.globalData.guardianRefreshInterval = setInterval(() => {
      this.refreshGuardianData()
    }, 60000)
  },

  // 停止守护人自动刷新
  stopGuardianRefresh() {
    if (this.globalData.guardianRefreshInterval) {
      clearInterval(this.globalData.guardianRefreshInterval)
      this.globalData.guardianRefreshInterval = null
    }
  },

  // 启动副成员数据自动刷新（60秒间隔）
  startSecondaryRefresh() {
    this.stopSecondaryRefresh()
    this.globalData.secondaryRefreshInterval = setInterval(() => {
      this.refreshSecondaryData()
    }, 60000)
  },

  // 停止副成员自动刷新
  stopSecondaryRefresh() {
    if (this.globalData.secondaryRefreshInterval) {
      clearInterval(this.globalData.secondaryRefreshInterval)
      this.globalData.secondaryRefreshInterval = null
    }
  },

  // 刷新副成员数据
  refreshSecondaryData(callback) {
    if (!wx.cloud) {
      if (callback) callback(false)
      return
    }
    wx.cloud.callFunction({ name: 'getSecondaryData' }).then(res => {
      if (res.result && res.result.success) {
        this.globalData.secondaryData = {
          members: res.result.members || [],
          medicines: res.result.medicines || [],
          records: res.result.records || []
        }
        this.globalData.primaryOwnerName = res.result.ownerName || '家人'
        this.globalData.dataVersion++
        if (callback) callback(true)
      } else {
        if (callback) callback(false)
      }
    }).catch(err => {
      console.warn('刷新副成员数据失败:', err)
      if (callback) callback(false)
    })
  },

  globalData: {
    reminderInterval: null,
    pendingInviteCode: null,
    subscribeTemplateId: 'QuGtuTUpRcrRiQeH4t9WW2xhTa57CFSzVX3zWHj9PEI',
    isGuardian: false,
    guardianData: null,
    guardianOwnerName: '',
    guardianChecked: true,
    guardianRefreshInterval: null,
    // 副成员相关
    isSecondary: false,
    secondaryData: null,
    primaryOwnerName: '',
    secondaryChecked: true,
    secondaryRefreshInterval: null,
    dataVersion: 0
  }
})
