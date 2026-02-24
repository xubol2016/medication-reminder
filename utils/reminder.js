// 提醒与漏服检测逻辑
const { getToday, getNow, compareTime } = require('./date')
const { getMedicines, getRecords, saveRecord, findRecord } = require('./storage')
const { generateId } = require('./date')

/**
 * 将药物展开为时间条目列表
 * 有具体药名时，按各药名独立展开；否则使用全局时间
 * @returns [{time, drugName, drugIndex, dosage}]
 */
function getTimeEntries(med) {
  if (med.drugNames && med.drugNames.length > 0 &&
      med.drugTimes && med.drugTimes.length > 0) {
    const entries = []
    med.drugNames.forEach(function(drugName, i) {
      const times = med.drugTimes[i] || []
      const dosage = (med.drugDosages && med.drugDosages[i]) ? med.drugDosages[i] : med.dosage
      times.forEach(function(time) {
        entries.push({ time: time, drugName: drugName, drugIndex: i, dosage: dosage })
      })
    })
    return entries
  }
  // 无具体药名：使用全局时间
  return (med.times || []).map(function(time) {
    return { time: time, drugName: null, drugIndex: null, dosage: med.dosage }
  })
}

// 检查漏服并标记，返回新标记的漏服列表（用于通知守护人）
function checkMissedMedications() {
  const today = getToday()
  const now = getNow()
  const medicines = getMedicines().filter(function(m) { return m.enabled })
  const newlyMissed = []

  medicines.forEach(function(med) {
    const entries = getTimeEntries(med)
    entries.forEach(function(entry) {
      if (compareTime(entry.time, now) < 0) {
        const existing = findRecord(med.id, today, entry.time, entry.drugIndex)
        if (!existing) {
          const record = {
            medicineId: med.id,
            memberId: med.memberId,
            date: today,
            time: entry.time,
            status: 'missed',
            takenAt: null
          }
          if (entry.drugIndex !== null) record.drugIndex = entry.drugIndex
          saveRecord(record)
          newlyMissed.push({ med: med, time: entry.time, entry: entry })
        }
      }
    })
  })

  return newlyMissed
}

// 获取今日药物状态列表（供首页使用）
function getTodayMedStatus() {
  const today = getToday()
  const now = getNow()
  const medicines = getMedicines().filter(function(m) { return m.enabled })
  const result = []

  medicines.forEach(function(med) {
    const entries = getTimeEntries(med)
    entries.forEach(function(entry) {
      const record = findRecord(med.id, today, entry.time, entry.drugIndex)
      var status = 'pending'
      if (record) {
        status = record.status
      } else if (compareTime(entry.time, now) < 0) {
        status = 'missed'
      }

      result.push({
        medicineId: med.id,
        memberId: med.memberId,
        medicineName: med.name,       // 记忆名称（如"降压药"）
        drugName: entry.drugName,     // 具体药名（如"氨氯地平"），null 表示无
        drugIndex: entry.drugIndex,   // 具体药名索引，null 表示无
        dosage: entry.dosage,         // 该条目对应的剂量
        time: entry.time,
        status: status,
        recordId: record ? record.id : null
      })
    })
  })

  result.sort(function(a, b) { return compareTime(a.time, b.time) })
  return result
}

// 检查当前时间是否有需要提醒的药物（小程序内提醒用）
function checkCurrentReminders() {
  const now = getNow()
  const today = getToday()
  const medicines = getMedicines().filter(function(m) { return m.enabled })
  const reminders = []

  medicines.forEach(function(med) {
    const entries = getTimeEntries(med)
    entries.forEach(function(entry) {
      if (entry.time === now) {
        const existing = findRecord(med.id, today, entry.time, entry.drugIndex)
        if (!existing) {
          reminders.push({
            medicineId: med.id,
            memberId: med.memberId,
            medicineName: med.name,
            drugName: entry.drugName,
            drugIndex: entry.drugIndex,
            dosage: entry.dosage,
            time: entry.time
          })
        }
      }
    })
  })

  return reminders
}

module.exports = {
  checkMissedMedications,
  getTodayMedStatus,
  checkCurrentReminders
}
