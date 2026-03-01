const { getMembers } = require('../../utils/storage')
const { getMedicines, saveMedicine, deleteMedicine, getMedicineById } = require('../../utils/storage')

Page({
  data: {
    medicines: [],
    groupedByMember: [],
    totalCount: 0,
    members: [],
    memberNames: [],
    showForm: false,
    editingId: null,
    formName: '',           // 老人记忆名称（如"降压药"）
    formDosage: '',         // 全局剂量（无具体药名时使用）
    formTimes: [],          // 全局时间（无具体药名时使用）
    memberIndex: 0,
    // formDrugs: [{name, tip, loading, dosage, times}] — 具体药名列表
    formDrugs: [{ name: '', tip: null, loading: false, dosage: '', times: [] }],
    hasDrugNames: false,    // 是否有非空具体药名（控制全局剂量/时间的显隐）
    showTimePicker: false,
    pickerHour: 8,
    pickerMinute: 0,
    timePickerTargetIdx: -1, // -1=全局，>=0=对应具体药名的索引
    presetTimes: [
      { label: '早上', time: '08:00' },
      { label: '中午', time: '12:00' },
      { label: '下午', time: '18:00' },
      { label: '睡前', time: '21:00' }
    ],
    showMemberPicker: false,
    showTipPanel: false,
    viewingDrugTips: [],
    viewingMedName: ''
  },

  onShow() {
    const app = getApp()
    this.setData({
      isReadOnly: app.globalData.isSecondary === true || app.globalData.isGuardian === true
    })
    this.loadData()
  },

  loadData() {
    const members = getMembers()
    const allMeds = getMedicines().map(med => {
      const hasTip = (Array.isArray(med.drugNames) && med.drugNames.some(n => n)) || !!med.healthTip
      return { ...med, hasTip }
    })
    const groupedByMember = members
      .map(member => ({
        memberId: member.id,
        memberName: member.name,
        medicines: allMeds.filter(med => med.memberId === member.id)
      }))
      .filter(group => group.medicines.length > 0)

    this.setData({
      members,
      memberNames: members.map(m => m.name),
      medicines: allMeds,
      groupedByMember,
      totalCount: allMeds.length
    })
  },

  showAddForm() {
    if (this.data.members.length === 0) {
      wx.showModal({
        title: '提示',
        content: '请先添加成员',
        showCancel: false,
        success: () => { wx.navigateTo({ url: '/pages/members/members' }) }
      })
      return
    }
    this.setData({
      showForm: true,
      editingId: null,
      formName: '',
      formDosage: '',
      formTimes: [],
      memberIndex: 0,
      formDrugs: [{ name: '', tip: null, loading: false, dosage: '', times: [] }],
      hasDrugNames: false,
      timePickerTargetIdx: -1
    })
  },

  editMedicine(e) {
    const id = e.currentTarget.dataset.id
    const med = getMedicineById(id)
    if (!med) return
    const memberIndex = this.data.members.findIndex(m => m.id === med.memberId)

    let formDrugs
    if (med.drugNames && med.drugNames.length > 0) {
      formDrugs = med.drugNames.map((name, i) => ({
        name: name,
        tip: (med.drugTips && med.drugTips[i]) ? med.drugTips[i] : null,
        loading: false,
        dosage: (med.drugDosages && med.drugDosages[i]) ? med.drugDosages[i] : '',
        times: (med.drugTimes && med.drugTimes[i]) ? [...med.drugTimes[i]] : []
      }))
    } else {
      formDrugs = [{ name: '', tip: null, loading: false, dosage: '', times: [] }]
    }

    const hasDrugNames = formDrugs.some(d => d.name.trim() !== '')

    this.setData({
      showForm: true,
      editingId: id,
      formName: med.name,
      formDosage: med.dosage || '',
      formTimes: hasDrugNames ? [] : [...(med.times || [])],
      memberIndex: memberIndex >= 0 ? memberIndex : 0,
      formDrugs: formDrugs,
      hasDrugNames: hasDrugNames,
      timePickerTargetIdx: -1
    })
  },

  deleteMedicine(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name
    wx.showModal({
      title: '确认删除',
      content: `确定删除「${name}」及其所有服药记录吗？`,
      confirmColor: '#E74C3C',
      success: (res) => {
        if (res.confirm) {
          deleteMedicine(id)
          this.loadData()

          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  toggleEnabled(e) {
    const id = e.currentTarget.dataset.id
    const med = getMedicineById(id)
    if (med) {
      med.enabled = e.detail.value
      saveMedicine(med)
      this.loadData()
    }
  },

  openMemberPicker() { this.setData({ showMemberPicker: true }) },
  closeMemberPicker() { this.setData({ showMemberPicker: false }) },

  selectMember(e) {
    this.setData({ memberIndex: e.currentTarget.dataset.idx, showMemberPicker: false })
  },

  onNameInput(e) { this.setData({ formName: e.detail.value }) },
  onDosageInput(e) { this.setData({ formDosage: e.detail.value }) },

  // ===== 具体药名管理 =====

  onDrugNameInput(e) {
    const idx = parseInt(e.currentTarget.dataset.idx)
    const drugs = this.data.formDrugs.map((d, i) =>
      i === idx ? { ...d, name: e.detail.value, tip: null, loading: false } : d
    )
    const hasDrugNames = drugs.some(d => d.name.trim() !== '')
    this.setData({ formDrugs: drugs, hasDrugNames })
  },

  onDrugDosageInput(e) {
    const idx = parseInt(e.currentTarget.dataset.idx)
    const drugs = this.data.formDrugs.map((d, i) =>
      i === idx ? { ...d, dosage: e.detail.value } : d
    )
    this.setData({ formDrugs: drugs })
  },

  addDrugName() {
    if (this.data.formDrugs.length >= 5) {
      wx.showToast({ title: '最多添加5个具体药名', icon: 'none' })
      return
    }
    this.setData({
      formDrugs: [...this.data.formDrugs, { name: '', tip: null, loading: false, dosage: '', times: [] }]
    })
  },

  removeDrugName(e) {
    const idx = parseInt(e.currentTarget.dataset.idx)
    let drugs = this.data.formDrugs.filter((_, i) => i !== idx)
    if (drugs.length === 0) {
      drugs = [{ name: '', tip: null, loading: false, dosage: '', times: [] }]
    }
    const hasDrugNames = drugs.some(d => d.name.trim() !== '')
    this.setData({ formDrugs: drugs, hasDrugNames })
  },

  // ===== 时间选择（统一入口，通过 targetIdx 区分全局/-具体药名） =====

  openTimePicker(e) {
    const targetIdx = parseInt(e.currentTarget.dataset.targetIdx)
    this.setData({
      showTimePicker: true,
      pickerHour: 8,
      pickerMinute: 0,
      timePickerTargetIdx: targetIdx
    })
  },

  closeTimePicker() { this.setData({ showTimePicker: false }) },

  adjustHour(e) {
    let h = this.data.pickerHour + parseInt(e.currentTarget.dataset.delta)
    if (h < 0) h = 23
    if (h > 23) h = 0
    this.setData({ pickerHour: h })
  },

  adjustMinute(e) {
    let m = this.data.pickerMinute + parseInt(e.currentTarget.dataset.delta)
    if (m < 0) m = 55
    if (m > 55) m = 0
    this.setData({ pickerMinute: m })
  },

  selectPresetTime(e) {
    this.doAddTime(e.currentTarget.dataset.time)
  },

  confirmTimePicker() {
    const h = String(this.data.pickerHour).padStart(2, '0')
    const m = String(this.data.pickerMinute).padStart(2, '0')
    this.doAddTime(`${h}:${m}`)
  },

  doAddTime(time) {
    const targetIdx = this.data.timePickerTargetIdx

    if (targetIdx < 0) {
      // 全局时间
      const times = [...this.data.formTimes]
      if (times.includes(time)) {
        wx.showToast({ title: '该时间已添加', icon: 'none' })
        return
      }
      times.push(time)
      times.sort()
      this.setData({ formTimes: times, showTimePicker: false })
    } else {
      // 具体药名的时间
      const drug = this.data.formDrugs[targetIdx]
      const times = [...(drug.times || [])]
      if (times.includes(time)) {
        wx.showToast({ title: '该时间已添加', icon: 'none' })
        return
      }
      times.push(time)
      times.sort()
      const drugs = this.data.formDrugs.map((d, i) =>
        i === targetIdx ? { ...d, times } : d
      )
      this.setData({ formDrugs: drugs, showTimePicker: false })
    }
  },

  removeTime(e) {
    const targetIdx = parseInt(e.currentTarget.dataset.targetIdx)
    const timeIdx = parseInt(e.currentTarget.dataset.idx)

    if (targetIdx < 0) {
      const times = [...this.data.formTimes]
      times.splice(timeIdx, 1)
      this.setData({ formTimes: times })
    } else {
      const drug = this.data.formDrugs[targetIdx]
      const times = [...(drug.times || [])]
      times.splice(timeIdx, 1)
      const drugs = this.data.formDrugs.map((d, i) =>
        i === targetIdx ? { ...d, times } : d
      )
      this.setData({ formDrugs: drugs })
    }
  },

  // ===== 表单操作 =====

  cancelForm() {
    this.setData({
      showForm: false,
      formDrugs: [{ name: '', tip: null, loading: false, dosage: '', times: [] }],
      hasDrugNames: false
    })
  },

  noop() {},

  saveForm() {
    const { formName, formDosage, formTimes, memberIndex, members, editingId, formDrugs, hasDrugNames } = this.data

    if (!formName.trim()) {
      wx.showToast({ title: '请输入药物名称', icon: 'none' })
      return
    }

    const validDrugs = formDrugs.filter(d => d.name.trim())

    if (hasDrugNames) {
      // 有具体药名：验证每个药名都有剂量和时间
      for (let i = 0; i < validDrugs.length; i++) {
        if (!validDrugs[i].dosage.trim()) {
          wx.showToast({ title: `请填写「${validDrugs[i].name}」的剂量`, icon: 'none' })
          return
        }
        if (!validDrugs[i].times || validDrugs[i].times.length === 0) {
          wx.showToast({ title: `请为「${validDrugs[i].name}」添加服药时间`, icon: 'none' })
          return
        }
      }
    } else {
      // 无具体药名：使用全局剂量/时间
      if (!formDosage.trim()) {
        wx.showToast({ title: '请输入剂量', icon: 'none' })
        return
      }
      if (formTimes.length === 0) {
        wx.showToast({ title: '请添加服药时间', icon: 'none' })
        return
      }
    }

    let dosage, times, drugDosages, drugTimes

    if (hasDrugNames && validDrugs.length > 0) {
      // 全局 dosage = 第一个具体药名的剂量（供首页摘要显示）
      dosage = validDrugs[0].dosage
      // 全局 times = 所有具体药名时间的并集（供 reminder.js 使用）
      const allTimes = []
      validDrugs.forEach(d => {
        d.times.forEach(t => { if (!allTimes.includes(t)) allTimes.push(t) })
      })
      allTimes.sort()
      times = allTimes
      drugDosages = validDrugs.map(d => d.dosage)
      drugTimes = validDrugs.map(d => [...d.times])
    } else {
      dosage = formDosage.trim()
      times = formTimes
      drugDosages = null
      drugTimes = null
    }

    const medicine = {
      memberId: members[memberIndex].id,
      name: formName.trim(),
      dosage,
      times,
      enabled: true,
      drugNames: validDrugs.map(d => d.name),
      drugTips: validDrugs.map(d => d.tip || null),
      drugDosages,
      drugTimes
    }

    if (editingId) medicine.id = editingId

    saveMedicine(medicine)
    this.setData({
      showForm: false,
      formDrugs: [{ name: '', tip: null, loading: false, dosage: '', times: [] }],
      hasDrugNames: false
    })
    this.loadData()
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  // ===== 查询用药提示 =====

  queryMedicineTip(e) {
    const idx = parseInt(e.currentTarget.dataset.idx)
    const drug = this.data.formDrugs[idx]
    if (!drug || !drug.name.trim()) {
      wx.showToast({ title: '请先填写具体药名', icon: 'none' })
      return
    }
    const drugs = this.data.formDrugs.map((d, i) =>
      i === idx ? { ...d, tip: null, loading: true } : d
    )
    this.setData({ formDrugs: drugs })

    const name = drug.name.trim()
    setTimeout(() => {
      const { queryTip } = require('../../utils/medicine-tips')
      const result = queryTip(name)
      const updated = this.data.formDrugs.map((d, i) =>
        i === idx ? { ...d, loading: false, tip: result } : d
      )
      this.setData({ formDrugs: updated })
    }, 400)
  },

  viewMedicineTip(e) {
    const id = e.currentTarget.dataset.id
    const med = getMedicineById(id)
    if (!med) return

    const { queryTip } = require('../../utils/medicine-tips')
    const viewingList = []
    if (med.drugNames && med.drugNames.length > 0) {
      med.drugNames.forEach((name, i) => {
        // 有保存的 tip 直接用，否则从本地数据库实时查询
        const tip = (med.drugTips && med.drugTips[i]) ? med.drugTips[i] : queryTip(name)
        viewingList.push({ drugName: name, tip })
      })
    } else if (med.healthTip) {
      viewingList.push({ drugName: med.name, tip: med.healthTip })
    }

    if (viewingList.length === 0) return
    this.setData({ showTipPanel: true, viewingDrugTips: viewingList, viewingMedName: med.name })
  },

  closeTipPanel() {
    this.setData({ showTipPanel: false, viewingDrugTips: [], viewingMedName: '' })
  }
})
