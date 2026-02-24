// 本地存储 CRUD 封装
const { generateId } = require('./date')

// ---- Members ----
function getMembers() {
  return wx.getStorageSync('members') || []
}

function saveMember(member) {
  const members = getMembers()
  if (member.id) {
    const idx = members.findIndex(m => m.id === member.id)
    if (idx >= 0) members[idx] = member
  } else {
    member.id = generateId()
    members.push(member)
  }
  wx.setStorageSync('members', members)
  return member
}

function deleteMember(id) {
  const members = getMembers().filter(m => m.id !== id)
  wx.setStorageSync('members', members)
  // 同时删除关联的药物和记录
  const medicines = getMedicines().filter(m => m.memberId !== id)
  wx.setStorageSync('medicines', medicines)
  const records = getRecords().filter(r => r.memberId !== id)
  wx.setStorageSync('records', records)
}

function getMemberById(id) {
  return getMembers().find(m => m.id === id)
}

// ---- Medicines ----
function getMedicines() {
  return wx.getStorageSync('medicines') || []
}

function getMedicinesByMember(memberId) {
  return getMedicines().filter(m => m.memberId === memberId)
}

function saveMedicine(medicine) {
  const medicines = getMedicines()
  if (medicine.id) {
    const idx = medicines.findIndex(m => m.id === medicine.id)
    if (idx >= 0) medicines[idx] = medicine
  } else {
    medicine.id = generateId()
    medicines.push(medicine)
  }
  wx.setStorageSync('medicines', medicines)
  return medicine
}

function deleteMedicine(id) {
  const medicines = getMedicines().filter(m => m.id !== id)
  wx.setStorageSync('medicines', medicines)
  const records = getRecords().filter(r => r.medicineId !== id)
  wx.setStorageSync('records', records)
}

function getMedicineById(id) {
  return getMedicines().find(m => m.id === id)
}

// ---- Records ----
function getRecords() {
  return wx.getStorageSync('records') || []
}

function getRecordsByDate(date) {
  return getRecords().filter(r => r.date === date)
}

function getRecordsByMemberAndDate(memberId, date) {
  return getRecords().filter(r => r.memberId === memberId && r.date === date)
}

function saveRecord(record) {
  const records = getRecords()
  if (record.id) {
    const idx = records.findIndex(r => r.id === record.id)
    if (idx >= 0) records[idx] = record
  } else {
    record.id = generateId()
    records.push(record)
  }
  wx.setStorageSync('records', records)
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
  return wx.getStorageSync('guardians') || []
}

function saveGuardian(guardian) {
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
  const guardians = getGuardians().filter(g => g.id !== id)
  wx.setStorageSync('guardians', guardians)
}

function getGuardianById(id) {
  return getGuardians().find(g => g.id === id)
}

// 清理超过指定月数的记录
function cleanOldRecords(months) {
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
