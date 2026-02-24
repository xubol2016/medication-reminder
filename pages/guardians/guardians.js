const { getGuardians, saveGuardian, deleteGuardian, getGuardianById } = require('../../utils/storage')
const { generateId } = require('../../utils/date')

Page({
  data: {
    guardians: [],
    showForm: false,
    formName: '',
    formRelation: '',
    editingId: null,
    relationOptions: ['儿子', '女儿', '孙子', '孙女', '其他'],
    relationIndex: 0,
    // 邀请绑定相关
    showInvitePanel: false,
    currentInviteGuardianId: null,
    inviteCode: ''
  },

  onShow() {
    this.loadGuardians()
  },

  onLoad(options) {
    // 检查是否通过邀请链接直接打开此页面
    if (options && options.inviteCode) {
      this.handleInviteAccept(options.inviteCode)
      return
    }
    // 检查是否有待处理的邀请码（从 app.js 传递）
    const app = getApp()
    if (app.globalData.pendingInviteCode) {
      this.handleInviteAccept(app.globalData.pendingInviteCode)
      app.globalData.pendingInviteCode = null
    }
  },

  loadGuardians() {
    this.setData({ guardians: getGuardians() })
  },

  showAddForm() {
    this.setData({ showForm: true, formName: '', formRelation: '', editingId: null, relationIndex: 0 })
  },

  editGuardian(e) {
    const id = e.currentTarget.dataset.id
    const guardian = this.data.guardians.find(g => g.id === id)
    if (guardian) {
      const relationIndex = this.data.relationOptions.indexOf(guardian.relation)
      this.setData({
        showForm: true,
        formName: guardian.name,
        formRelation: guardian.relation,
        editingId: id,
        relationIndex: relationIndex >= 0 ? relationIndex : 4
      })
    }
  },

  deleteGuardian(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name
    wx.showModal({
      title: '确认删除',
      content: `确定删除守护人「${name}」吗？删除后将不再收到漏服提醒。`,
      confirmColor: '#E74C3C',
      success: (res) => {
        if (res.confirm) {
          deleteGuardian(id)
          // 同时删除云端绑定记录
          if (wx.cloud) {
            const guardian = getGuardianById(id)
            if (guardian && guardian.inviteCode) {
              wx.cloud.callFunction({
                name: 'bindGuardian',
                data: { action: 'unbind', inviteCode: guardian.inviteCode }
              }).catch(() => {})
            }
          }
          this.loadGuardians()
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  onNameInput(e) {
    this.setData({ formName: e.detail.value })
  },

  selectRelation(e) {
    this.setData({ relationIndex: parseInt(e.currentTarget.dataset.index) })
  },

  cancelForm() {
    this.setData({ showForm: false, formName: '', formRelation: '', editingId: null })
  },

  saveForm() {
    const name = this.data.formName.trim()
    if (!name) {
      wx.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }

    const relation = this.data.relationOptions[this.data.relationIndex]
    const guardian = {
      name,
      relation,
      bound: false,
      openId: '',
      subscribedCount: 0
    }

    if (this.data.editingId) {
      // 编辑时保留原有绑定信息
      const existing = getGuardianById(this.data.editingId)
      guardian.id = this.data.editingId
      if (existing) {
        guardian.bound = existing.bound
        guardian.openId = existing.openId
        guardian.subscribedCount = existing.subscribedCount
        guardian.inviteCode = existing.inviteCode
      }
    }

    saveGuardian(guardian)
    this.setData({ showForm: false, formName: '', formRelation: '', editingId: null })
    this.loadGuardians()
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  // 生成邀请并分享
  inviteGuardian(e) {
    const id = e.currentTarget.dataset.id

    // 本地生成邀请码（不依赖云函数）
    const inviteCode = generateId() + '_' + Date.now().toString(36)

    // 保存邀请码到本地守护人记录
    const guardian = getGuardianById(id)
    if (guardian) {
      guardian.inviteCode = inviteCode
      saveGuardian(guardian)
    }

    // 显示邀请面板（立即展示，不等待云端）
    this.setData({
      showInvitePanel: true,
      currentInviteGuardianId: id,
      inviteCode
    })
    this.loadGuardians()

    // 后台尝试写入云数据库（如云开发已配置则同步，否则忽略）
    if (wx.cloud) {
      wx.cloud.callFunction({ name: 'getOpenId' }).then(res => {
        const ownerOpenId = res.result.openId
        const db = wx.cloud.database()
        db.collection('guardian_bindings').add({
          data: {
            inviteCode,
            ownerOpenId,
            guardianOpenId: '',
            guardianName: '',
            status: 'pending',
            createdAt: db.serverDate()
          }
        }).catch(err => console.warn('云端同步邀请记录失败（可忽略）:', err))
      }).catch(err => console.warn('云函数 getOpenId 不可用（可忽略）:', err))
    }
  },

  closeInvitePanel() {
    this.setData({ showInvitePanel: false, currentInviteGuardianId: null })
  },

  // 复制邀请码到剪贴板（备用分享方式）
  copyInviteCode() {
    const code = this.data.inviteCode
    if (!code) return
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({ title: '邀请码已复制', icon: 'success' })
      }
    })
  },

  // 分享小程序卡片给守护人
  onShareAppMessage() {
    return {
      title: '邀请您成为服药守护人',
      path: '/pages/guardians/guardians?inviteCode=' + this.data.inviteCode
    }
  },

  // 守护人端：接受邀请绑定
  handleInviteAccept(inviteCode) {
    if (!wx.cloud) return

    wx.showLoading({ title: '绑定中...' })
    wx.cloud.callFunction({
      name: 'bindGuardian',
      data: { action: 'bind', inviteCode }
    }).then(res => {
      wx.hideLoading()
      if (res.result && res.result.success) {
        wx.showModal({
          title: '绑定成功 🎉',
          content: '您已成功成为守护人！当家人漏服药物时，您将收到微信提醒。',
          confirmText: '授权提醒',
          cancelText: '稍后',
          success: (modalRes) => {
            if (modalRes.confirm) {
              this.requestSubscription()
            }
          }
        })
      } else {
        wx.showToast({ title: res.result ? res.result.message : '绑定失败', icon: 'none' })
      }
    }).catch(err => {
      wx.hideLoading()
      console.error('绑定失败:', err)
      wx.showToast({ title: '绑定失败', icon: 'none' })
    })
  },

  // 请求订阅消息授权
  requestSubscription() {
    const templateId = getApp().globalData.subscribeTemplateId
    if (!templateId) {
      wx.showToast({ title: '模板未配置', icon: 'none' })
      return
    }

    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: (res) => {
        if (res[templateId] === 'accept') {
          wx.showToast({ title: '授权成功', icon: 'success' })
          // 更新云端订阅计数
          if (wx.cloud) {
            wx.cloud.callFunction({
              name: 'bindGuardian',
              data: { action: 'subscribe', templateId }
            }).catch(() => {})
          }
        }
      },
      fail: () => {
        wx.showToast({ title: '授权失败', icon: 'none' })
      }
    })
  },

  // 检查绑定状态
  checkBindingStatus(e) {
    const id = e.currentTarget.dataset.id
    const guardian = getGuardianById(id)
    if (!guardian || !guardian.inviteCode || !wx.cloud) return

    wx.showLoading({ title: '检查中...' })
    const db = wx.cloud.database()
    db.collection('guardian_bindings').where({
      inviteCode: guardian.inviteCode
    }).get().then(res => {
      wx.hideLoading()
      if (res.data.length > 0 && res.data[0].status === 'bound') {
        guardian.bound = true
        guardian.openId = res.data[0].guardianOpenId
        saveGuardian(guardian)
        this.loadGuardians()
        wx.showToast({ title: '已绑定', icon: 'success' })
      } else {
        wx.showToast({ title: '对方尚未接受邀请', icon: 'none' })
      }
    }).catch(() => {
      wx.hideLoading()
      wx.showToast({ title: '检查失败', icon: 'none' })
    })
  },

  noop() {}
})
