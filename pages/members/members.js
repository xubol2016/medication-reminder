const { getMembers, saveMember, deleteMember } = require('../../utils/storage')
const { syncMedicinesToCloud } = require('../../utils/cloud-sync')

Page({
  data: {
    members: [],
    showForm: false,
    formName: '',
    editingId: null
  },

  onShow() {
    this.loadMembers()
  },

  loadMembers() {
    this.setData({ members: getMembers() })
  },

  showAddForm() {
    this.setData({ showForm: true, formName: '', editingId: null })
  },

  editMember(e) {
    const id = e.currentTarget.dataset.id
    const member = this.data.members.find(m => m.id === id)
    if (member) {
      this.setData({ showForm: true, formName: member.name, editingId: id })
    }
  },

  deleteMember(e) {
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
          syncMedicinesToCloud()
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
  }
})
