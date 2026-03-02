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
    customRelation: '',
    // 邀请绑定相关
    showInvitePanel: false,
    currentInviteGuardianId: null,
    inviteCode: '',
    // 输入邀请码相关
    showInputCodePanel: false,
    inputInviteCode: ''
  },

  onShow() {
    const app = getApp()
    if (app.globalData.isGuardian === true) {
      wx.showToast({ title: '守护人无权管理', icon: 'none' })
      wx.switchTab({ url: '/pages/index/index' })
      return
    }
    this.loadGuardians()
  },

  onLoad(options) {
    // 检查是否通过邀请链接直接打开此页面
    if (options && options.inviteCode) {
      const code = options.inviteCode
      // 只处理 grd_ 前缀或无前缀的邀请码（兼容旧邀请码）
      if (code.indexOf('sec_') !== 0) {
        this.handleInviteAccept(code)
        return
      }
    }
    // 检查是否有待处理的邀请码（从 app.js 传递）
    const app = getApp()
    if (app.globalData.pendingInviteCode) {
      const code = app.globalData.pendingInviteCode
      // 只处理 grd_ 前缀或无前缀的邀请码
      if (code.indexOf('sec_') !== 0) {
        app.globalData.pendingInviteCode = null
        this.handleInviteAccept(code)
      }
    }
  },

  loadGuardians() {
    this.setData({ guardians: getGuardians() })
    this.loadGuardianQuotas()
  },

  loadGuardianQuotas() {
    if (!wx.cloud) return
    const app = getApp()
    const templateId = app.globalData.subscribeTemplateId
    if (!templateId) return

    const guardians = this.data.guardians
    if (guardians.filter(g => g.bound && g.openId).length === 0) return

    wx.cloud.callFunction({
      name: 'bindGuardian',
      data: { action: 'getQuota', templateId }
    }).then(res => {
      if (!res.result || !res.result.success) return
      const quotas = res.result.guardianQuotas || {}
      const updated = guardians.map(g => {
        if (g.bound && g.openId && quotas[g.openId] !== undefined) {
          g.quota = quotas[g.openId]
        } else if (g.bound && g.openId) {
          g.quota = 0
        }
        return g
      })
      this.setData({ guardians: updated })
    }).catch(() => {})
  },

  showAddForm() {
    this.setData({ showForm: true, formName: '', formRelation: '', editingId: null, relationIndex: 0, customRelation: '' })
  },

  editGuardian(e) {
    const id = e.currentTarget.dataset.id
    const guardian = this.data.guardians.find(g => g.id === id)
    if (guardian) {
      let relationIndex = this.data.relationOptions.indexOf(guardian.relation)
      let customRelation = ''
      if (relationIndex < 0) {
        // 自定义关系（不在预设列表中）
        relationIndex = 4
        customRelation = guardian.relation
      }
      this.setData({
        showForm: true,
        formName: guardian.name,
        formRelation: guardian.relation,
        editingId: id,
        relationIndex,
        customRelation
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
    const index = parseInt(e.currentTarget.dataset.index)
    this.setData({ relationIndex: index, customRelation: index === 4 ? this.data.customRelation : '' })
  },

  onCustomRelationInput(e) {
    this.setData({ customRelation: e.detail.value })
  },

  cancelForm() {
    this.setData({ showForm: false, formName: '', formRelation: '', editingId: null, customRelation: '' })
  },

  saveForm() {
    const name = this.data.formName.trim()
    if (!name) {
      wx.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }

    const relation = this.data.relationIndex === 4 && this.data.customRelation.trim()
      ? this.data.customRelation.trim()
      : this.data.relationOptions[this.data.relationIndex]
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
    this.setData({ showForm: false, formName: '', formRelation: '', editingId: null, customRelation: '' })
    this.loadGuardians()
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  // 生成邀请并分享
  inviteGuardian(e) {
    const id = e.currentTarget.dataset.id

    // 本地生成邀请码（不依赖云函数），加 grd_ 前缀区分副成员邀请
    const inviteCode = 'grd_' + generateId() + '_' + Date.now().toString(36)

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
        const app = getApp()
        // 立即加载守护人数据并切换角色
        wx.cloud.callFunction({ name: 'getOwnerData' }).then(dataRes => {
          if (dataRes.result && dataRes.result.success) {
            app.switchToGuardian(
              {
                members: dataRes.result.members || [],
                medicines: dataRes.result.medicines || [],
                records: dataRes.result.records || []
              },
              dataRes.result.ownerName || '家人'
            )
          }
        }).catch(() => {})

        wx.showModal({
          title: '绑定成功 🎉',
          content: '您已成功成为守护人！当家人漏服药物时，您将收到微信提醒。',
          confirmText: '授权提醒',
          cancelText: '去首页',
          success: (modalRes) => {
            if (modalRes.confirm) {
              this.requestSubscription()
            }
            wx.switchTab({ url: '/pages/index/index' })
          }
        })
      } else if (res.result && res.result.alreadyBound) {
        wx.showModal({
          title: '已绑定',
          content: '守护人的邀请已被绑定，即将前往首页查看用药信息。',
          showCancel: false,
          confirmText: '去首页',
          success: () => {
            wx.switchTab({ url: '/pages/index/index' })
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

  // 显示配额说明提示
  showQuotaTip() {
    wx.showModal({
      title: '提醒配额说明',
      content: '配额由守护人自行授权获取，每次授权+1次，每发送一条漏服通知-1次。\n\n如需增加，请让守护人打开小程序，进入「设置」页点击「增加提醒配额」按钮。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  // 请求订阅消息授权（绑定成功后引导使用）
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
            }).then(() => this.loadGuardianQuotas()).catch(() => {})
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

  // 显示输入邀请码面板
  showInputCodePanel() {
    this.setData({ showInputCodePanel: true, inputInviteCode: '' })
  },

  closeInputCodePanel() {
    this.setData({ showInputCodePanel: false, inputInviteCode: '' })
  },

  onInviteCodeInput(e) {
    this.setData({ inputInviteCode: e.detail.value })
  },

  submitInviteCode() {
    const code = this.data.inputInviteCode.trim()
    if (!code) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    this.setData({ showInputCodePanel: false, inputInviteCode: '' })
    this.handleInviteAccept(code)
  },

  noop() {}
})
