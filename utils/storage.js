// 本地存储 CRUD 封装
const { generateId } = require('./date')

// 守护人模式检测辅助函数
function _isGuardianMode() {
  try {
    const app = getApp()
    return app && app.globalData && app.globalData.isGuardian
  } catch (e) {
    return false
  }
}

function _getGuardianData() {
  try {
    const app = getApp()
    return app && app.globalData && app.globalData.guardianData
  } catch (e) {
    return null
  }
}

// 副成员模式检测辅助函数
function _isSecondaryMode() {
  try {
    const app = getApp()
    return app && app.globalData && app.globalData.isSecondary === true
  } catch (e) {
    return false
  }
}

function _getSecondaryData() {
  try {
    const app = getApp()
    return app && app.globalData && app.globalData.secondaryData
  } catch (e) {
    return null
  }
}

// 只读模式：守护人或副成员
function _isReadOnly() {
  return _isGuardianMode() || _isSecondaryMode()
}

// ---- Members ----
function getMembers() {
  if (_isGuardianMode()) {
    const data = _getGuardianData()
    return data ? data.members : []
  }
  if (_isSecondaryMode()) {
    const data = _getSecondaryData()
    return data ? data.members : []
  }
  return wx.getStorageSync('members') || []
}

function saveMember(member) {
  if (_isReadOnly()) return member
  const members = getMembers()
  if (member.id) {
    const idx = members.findIndex(m => m.id === member.id)
    if (idx >= 0) members[idx] = member
  } else {
    member.id = generateId()
    members.push(member)
  }
  wx.setStorageSync('members', members)
  // 自动触发云同步
  try {
    const { syncMembersToCloud } = require('./cloud-sync')
    syncMembersToCloud()
  } catch (e) {}
  return member
}

function deleteMember(id) {
  if (_isReadOnly()) return
  const members = getMembers().filter(m => m.id !== id)
  wx.setStorageSync('members', members)
  // 同时删除关联的药物和记录
  const medicines = getMedicines().filter(m => m.memberId !== id)
  wx.setStorageSync('medicines', medicines)
  const records = getRecords().filter(r => r.memberId !== id)
  wx.setStorageSync('records', records)
  // 自动触发云同步（级联删除需全量同步）
  try {
    const { syncAllToCloud } = require('./cloud-sync')
    syncAllToCloud()
  } catch (e) {}
}

function getMemberById(id) {
  return getMembers().find(m => m.id === id)
}

// ---- Medicines ----
function getMedicines() {
  if (_isGuardianMode()) {
    const data = _getGuardianData()
    return data ? data.medicines : []
  }
  if (_isSecondaryMode()) {
    const data = _getSecondaryData()
    return data ? data.medicines : []
  }
  return wx.getStorageSync('medicines') || []
}

function getMedicinesByMember(memberId) {
  return getMedicines().filter(m => m.memberId === memberId)
}

function saveMedicine(medicine) {
  if (_isReadOnly()) return medicine
  const medicines = getMedicines()
  if (medicine.id) {
    const idx = medicines.findIndex(m => m.id === medicine.id)
    if (idx >= 0) medicines[idx] = medicine
  } else {
    medicine.id = generateId()
    medicines.push(medicine)
  }
  wx.setStorageSync('medicines', medicines)
  // 自动触发云同步
  try {
    const { syncMedicinesToCloud } = require('./cloud-sync')
    syncMedicinesToCloud()
  } catch (e) {}
  return medicine
}

function deleteMedicine(id) {
  if (_isReadOnly()) return
  const medicines = getMedicines().filter(m => m.id !== id)
  wx.setStorageSync('medicines', medicines)
  const records = getRecords().filter(r => r.medicineId !== id)
  wx.setStorageSync('records', records)
  // 自动触发云同步
  try {
    const { syncMedicinesToCloud } = require('./cloud-sync')
    syncMedicinesToCloud()
  } catch (e) {}
}

function getMedicineById(id) {
  return getMedicines().find(m => m.id === id)
}

// ---- Records ----
function getRecords() {
  if (_isGuardianMode()) {
    const data = _getGuardianData()
    return data ? data.records : []
  }
  if (_isSecondaryMode()) {
    const data = _getSecondaryData()
    return data ? data.records : []
  }
  return wx.getStorageSync('records') || []
}

function getRecordsByDate(date) {
  return getRecords().filter(r => r.date === date)
}

function getRecordsByMemberAndDate(memberId, date) {
  return getRecords().filter(r => r.memberId === memberId && r.date === date)
}

function saveRecord(record) {
  if (_isReadOnly()) return record
  const records = getRecords()
  if (record.id) {
    const idx = records.findIndex(r => r.id === record.id)
    if (idx >= 0) records[idx] = record
  } else {
    record.id = generateId()
    records.push(record)
  }
  wx.setStorageSync('records', records)
  // 自动触发云同步
  try {
    const { syncRecordsToCloud } = require('./cloud-sync')
    syncRecordsToCloud()
  } catch (e) {}
  return record
}

function findRecord(medicineId, date, time, drugIndex) {
  const records = getRecords()
  if (drugIndex !== undefined && drugIndex !== null) {
    // 有具体药名索引：精确匹配 drugIndex
    return records.find(r =>
      r.medicineId === medicineId && r.date === date && r.time === time && r.drugIndex === drugIndex
    )
  }
  // 无具体药名：匹配没有 drugIndex 的记录（兼容旧数据）
  return records.find(r =>
    r.medicineId === medicineId && r.date === date && r.time === time &&
    (r.drugIndex === undefined || r.drugIndex === null)
  )
}

// ---- Guardians ----
function getGuardians() {
  if (_isReadOnly()) return []
  return wx.getStorageSync('guardians') || []
}

function saveGuardian(guardian) {
  if (_isReadOnly()) return guardian
  const guardians = getGuardians()
  if (guardian.id) {
    const idx = guardians.findIndex(g => g.id === guardian.id)
    if (idx >= 0) guardians[idx] = guardian
  } else {
    guardian.id = generateId()
    guardians.push(guardian)
  }
  wx.setStorageSync('guardians', guardians)
  return guardian
}

function deleteGuardian(id) {
  if (_isReadOnly()) return
  const guardians = getGuardians().filter(g => g.id !== id)
  wx.setStorageSync('guardians', guardians)
}

function getGuardianById(id) {
  return getGuardians().find(g => g.id === id)
}

// 清理超过指定月数的记录
function cleanOldRecords(months) {
  if (_isReadOnly()) return
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const records = getRecords().filter(r => r.date >= cutoffStr)
  wx.setStorageSync('records', records)
}

module.exports = {
  getMembers, saveMember, deleteMember, getMemberById,
  getMedicines, getMedicinesByMember, saveMedicine, deleteMedicine, getMedicineById,
  getRecords, getRecordsByDate, getRecordsByMemberAndDate, saveRecord, findRecord,
  cleanOldRecords,
  getGuardians, saveGuardian, deleteGuardian, getGuardianById
}
