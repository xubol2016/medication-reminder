const { getMembers, saveMember, deleteMember } = require('../../utils/storage')
const { generateId } = require('../../utils/date')

Page({
  data: {
    members: [],
    showForm: false,
    formName: '',
    editingId: null,
    isSecondary: false,
    isGuardian: false,
    primaryOwnerName: '',
    // 副成员管理相关
    secondaryMembers: [],
    showSecondaryForm: false,
    secondaryFormName: '',
    showInvitePanel: false,
    inviteCode: '',
    showInputCodePanel: false,
    inputInviteCode: ''
  },

  onLoad(options) {
    // 检查是否通过副成员邀请链接打开
    if (options && options.inviteCode) {
      this._handleInviteIfSecondary(options.inviteCode)
      return
    }
    const app = getApp()
    if (app.globalData.pendingInviteCode) {
      const code = app.globalData.pendingInviteCode
      // 只处理 sec_ 前缀的邀请码
      if (code.indexOf('sec_') === 0) {
        app.globalData.pendingInviteCode = null
        this._handleInviteIfSecondary(code)
      }
    }
  },

  onShow() {
    const app = getApp()
    const isSecondary = app.globalData.isSecondary === true
    const isGuardian = app.globalData.isGuardian === true
    this.setData({
      isSecondary,
      isGuardian,
      primaryOwnerName: isSecondary ? app.globalData.primaryOwnerName : ''
    })
    this.loadMembers()
    if (!isSecondary) {
      this.loadSecondaryMembers()
    }
  },

  loadMembers() {
    const allMembers = getMembers()
    const secondaryList = wx.getStorageSync('secondaryMembers') || []
    const secondaryMemberIds = {}
    secondaryList.forEach(s => {
      if (s.memberId) secondaryMemberIds[s.memberId] = true
    })
    const members = allMembers.map(m => ({
      ...m,
      isSecondaryMember: !!secondaryMemberIds[m.id]
    }))
    const hasPrimaryMember = members.some(m => !m.isSecondaryMember)
    this.setData({ members, hasPrimaryMember })
  },

  loadSecondaryMembers() {
    const list = wx.getStorageSync('secondaryMembers') || []
    this.setData({ secondaryMembers: list })
  },

  showAddForm() {
    if (this.data.isSecondary) return
    if (this.data.hasPrimaryMember) {
      wx.showToast({ title: '主成员只能添加一个', icon: 'none' })
      return
    }
    this.setData({ showForm: true, formName: '', editingId: null })
  },

  editMember(e) {
    if (this.data.isSecondary) return
    const id = e.currentTarget.dataset.id
    const member = this.data.members.find(m => m.id === id)
    if (member) {
      this.setData({ showForm: true, formName: member.name, editingId: id })
    }
  },

  deleteMember(e) {
    if (this.data.isSecondary) return
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name
    wx.showModal({
      title: '确认删除',
      content: `删除「${name}」将同时删除其所有药物和服药记录，确定吗？`,
      confirmColor: '#E74C3C',
      success: (res) => {
        if (res.confirm) {
          deleteMember(id)
          this.loadMembers()
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  onNameInput(e) {
    this.setData({ formName: e.detail.value })
  },

  cancelForm() {
    this.setData({ showForm: false, formName: '', editingId: null })
  },

  saveForm() {
    const name = this.data.formName.trim()
    if (!name) {
      wx.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }

    const member = { name }
    if (this.data.editingId) {
      member.id = this.data.editingId
    }

    saveMember(member)
    this.setData({ showForm: false, formName: '', editingId: null })
    this.loadMembers()
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  // ===== 副成员管理 =====

  // 第一步：显示姓名输入表单
  addSecondaryMember() {
    if (this.data.isSecondary) return
    this.setData({ showSecondaryForm: true, secondaryFormName: '' })
  },

  onSecondaryNameInput(e) {
    this.setData({ secondaryFormName: e.detail.value })
  },

  cancelSecondaryForm() {
    this.setData({ showSecondaryForm: false, secondaryFormName: '' })
  },

  // 第二步：保存姓名后生成邀请码，显示邀请面板
  saveSecondaryForm() {
    const name = this.data.secondaryFormName.trim()
    if (!name) {
      wx.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }

    // 同时添加为家庭成员（可被选为服药人）
    const member = saveMember({ name })

    const inviteCode = 'sec_' + generateId() + '_' + Date.now().toString(36)

    // 保存副成员邀请记录
    const list = wx.getStorageSync('secondaryMembers') || []
    list.push({ id: generateId(), inviteCode, name, memberId: member.id, status: 'pending' })
    wx.setStorageSync('secondaryMembers', list)

    // 关闭姓名表单，显示邀请面板
    this.setData({
      showSecondaryForm: false,
      secondaryFormName: '',
      showInvitePanel: true,
      inviteCode,
      secondaryMembers: list
    })
    this.loadMembers()

    // 写入云端 member_bindings
    if (wx.cloud) {
      wx.cloud.callFunction({ name: 'getOpenId' }).then(res => {
        const primaryOpenId = res.result.openId
        const db = wx.cloud.database()
        db.collection('member_bindings').add({
          data: {
            inviteCode,
            primaryOpenId,
            secondaryOpenId: '',
            secondaryName: name,
            status: 'pending',
            createdAt: db.serverDate()
          }
        }).catch(err => console.warn('云端同步副成员邀请失败:', err))
      }).catch(err => console.warn('getOpenId 不可用:', err))
    }
  },

  closeInvitePanel() {
    this.setData({ showInvitePanel: false })
  },

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

  onShareAppMessage() {
    return {
      title: '邀请您成为副成员',
      path: '/pages/members/members?inviteCode=' + this.data.inviteCode
    }
  },

  checkSecondaryStatus(e) {
    const inviteCode = e.currentTarget.dataset.code
    if (!inviteCode || !wx.cloud) return

    wx.showLoading({ title: '检查中...' })
    const db = wx.cloud.database()
    db.collection('member_bindings').where({
      inviteCode
    }).get().then(res => {
      wx.hideLoading()
      if (res.data.length > 0 && res.data[0].status === 'bound') {
        const list = wx.getStorageSync('secondaryMembers') || []
        const item = list.find(s => s.inviteCode === inviteCode)
        if (item) {
          item.status = 'bound'
          wx.setStorageSync('secondaryMembers', list)
          this.loadSecondaryMembers()
        }
        wx.showToast({ title: '已绑定', icon: 'success' })
      } else {
        wx.showToast({ title: '对方尚未接受邀请', icon: 'none' })
      }
    }).catch(() => {
      wx.hideLoading()
      wx.showToast({ title: '检查失败', icon: 'none' })
    })
  },

  deleteSecondaryMember(e) {
    const inviteCode = e.currentTarget.dataset.code
    const name = e.currentTarget.dataset.name || '该副成员'
    wx.showModal({
      title: '确认删除',
      content: `删除「${name}」将同时删除其所有药物和服药记录，确定吗？`,
      confirmColor: '#E74C3C',
      success: (res) => {
        if (res.confirm) {
          // 同时删除对应的家庭成员
          const allSecondary = wx.getStorageSync('secondaryMembers') || []
          const target = allSecondary.find(s => s.inviteCode === inviteCode)
          if (target && target.memberId) {
            deleteMember(target.memberId)
          }
          const list = allSecondary.filter(s => s.inviteCode !== inviteCode)
          wx.setStorageSync('secondaryMembers', list)
          this.loadSecondaryMembers()
          this.loadMembers()
          // 云端解绑
          if (wx.cloud) {
            wx.cloud.callFunction({
              name: 'bindSecondary',
              data: { action: 'unbind', inviteCode }
            }).catch(() => {})
          }
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  // 显示输入邀请码面板（对方成为副成员）
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
    this._handleInviteIfSecondary(code)
  },

  _handleInviteIfSecondary(inviteCode) {
    // 只处理 sec_ 前缀的邀请码
    if (inviteCode.indexOf('sec_') !== 0) return

    if (!wx.cloud) return

    wx.showLoading({ title: '绑定中...' })
    wx.cloud.callFunction({
      name: 'bindSecondary',
      data: { action: 'bind', inviteCode }
    }).then(res => {
      wx.hideLoading()
      if (res.result && res.result.success) {
        const app = getApp()

        // 立即加载副成员数据并切换角色
        wx.cloud.callFunction({ name: 'getSecondaryData' }).then(dataRes => {
          if (dataRes.result && dataRes.result.success) {
            app.switchToSecondary(
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
          title: '绑定成功',
          content: '您已成功成为副成员！现在可以查看家人的用药信息。',
          showCancel: false,
          confirmText: '去首页',
          success: () => {
            wx.switchTab({ url: '/pages/index/index' })
          }
        })
      } else if (res.result && res.result.alreadyBound) {
        wx.showModal({
          title: '已绑定',
          content: '该邀请已被绑定，即将前往首页。',
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
      console.error('副成员绑定失败:', err)
      wx.showToast({ title: '绑定失败', icon: 'none' })
    })
  }
})
