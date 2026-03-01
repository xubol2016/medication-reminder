// 药品数据云端同步工具
const { getMembers, getMedicines, getRecords, getMemberById } = require('./storage')

// 缓存 ownerOpenId 避免重复调用
let _cachedOpenId = null

function getOwnerOpenId() {
  return new Promise((resolve, reject) => {
    if (_cachedOpenId) return resolve(_cachedOpenId)
    wx.cloud.callFunction({ name: 'getOpenId' }).then(res => {
      _cachedOpenId = res.result.openId
      resolve(_cachedOpenId)
    }).catch(reject)
  })
}

// 分页获取云端集合中某 ownerOpenId 的所有记录（小程序端 limit 上限20）
function getAllCloudRecords(db, collection, ownerOpenId) {
  return new Promise((resolve) => {
    const all = []
    function fetchPage(skip) {
      db.collection(collection).where({ ownerOpenId }).skip(skip).limit(20).get().then(res => {
        const data = res.data || []
        all.push(...data)
        if (data.length === 20) {
          fetchPage(skip + 20)
        } else {
          resolve(all)
        }
      }).catch(() => resolve(all))
    }
    fetchPage(0)
  })
}

// 同步所有药品数据到云数据库
function syncMedicinesToCloud() {
  if (!wx.cloud) return

  getOwnerOpenId().then(ownerOpenId => {
    if (!ownerOpenId) return

    const medicines = getMedicines()
    const db = wx.cloud.database()

    getAllCloudRecords(db, 'user_medicines', ownerOpenId).then(cloudMeds => {
      const cloudMap = {}
      cloudMeds.forEach(m => { cloudMap[m.localMedicineId] = m })

      const localMap = {}
      medicines.forEach(med => { localMap[med.id] = med })

      // 新增或更新
      medicines.forEach(med => {
        const member = getMemberById(med.memberId)
        const memberName = member ? member.name : '未知'
        const cloudMed = cloudMap[med.id]

        const data = {
          ownerOpenId,
          localMedicineId: med.id,
          memberId: med.memberId,
          memberName,
          name: med.name,
          dosage: med.dosage,
          times: med.times,
          enabled: med.enabled,
          drugNames: med.drugNames || [],
          drugTimes: med.drugTimes || [],
          drugDosages: med.drugDosages || [],
          healthTip: med.healthTip || null,
          updatedAt: db.serverDate()
        }

        if (cloudMed) {
          db.collection('user_medicines').doc(cloudMed._id).update({
            data
          }).catch(err => console.warn('云端更新药品失败:', err))
        } else {
          db.collection('user_medicines').add({
            data
          }).catch(err => console.warn('云端新增药品失败:', err))
        }
      })

      // 删除云端多余的（本地已删除的）
      cloudMeds.forEach(cloudMed => {
        if (!localMap[cloudMed.localMedicineId]) {
          db.collection('user_medicines').doc(cloudMed._id).remove()
            .catch(err => console.warn('云端删除药品失败:', err))
        }
      })
    })
  }).catch(err => {
    console.warn('云同步失败（getOpenId 不可用）:', err)
  })
}

// 同步成员数据到云数据库
function syncMembersToCloud() {
  if (!wx.cloud) return

  getOwnerOpenId().then(ownerOpenId => {
    if (!ownerOpenId) return

    const members = getMembers()
    const db = wx.cloud.database()

    getAllCloudRecords(db, 'user_members', ownerOpenId).then(cloudMembers => {
      const cloudMap = {}
      cloudMembers.forEach(m => { cloudMap[m.localMemberId] = m })

      const localMap = {}
      members.forEach(m => { localMap[m.id] = m })

      members.forEach(member => {
        const cloudMember = cloudMap[member.id]
        const data = {
          ownerOpenId,
          localMemberId: member.id,
          name: member.name,
          updatedAt: db.serverDate()
        }

        if (cloudMember) {
          db.collection('user_members').doc(cloudMember._id).update({
            data
          }).catch(err => console.warn('云端更新成员失败:', err))
        } else {
          db.collection('user_members').add({
            data
          }).catch(err => console.warn('云端新增成员失败:', err))
        }
      })

      cloudMembers.forEach(cloudMember => {
        if (!localMap[cloudMember.localMemberId]) {
          db.collection('user_members').doc(cloudMember._id).remove()
            .catch(err => console.warn('云端删除成员失败:', err))
        }
      })
    })
  }).catch(err => {
    console.warn('成员云同步失败:', err)
  })
}

// 同步最近30天的记录到云数据库
function syncRecordsToCloud() {
  if (!wx.cloud) return

  getOwnerOpenId().then(ownerOpenId => {
    if (!ownerOpenId) return

    const allRecords = getRecords()
    const db = wx.cloud.database()

    // 计算30天前的日期
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const recentRecords = allRecords.filter(r => r.date >= cutoffStr)

    getAllCloudRecords(db, 'user_records', ownerOpenId).then(cloudRecords => {
      const cloudMap = {}
      cloudRecords.forEach(r => { cloudMap[r.localRecordId] = r })

      const localMap = {}
      recentRecords.forEach(r => { localMap[r.id] = r })

      recentRecords.forEach(record => {
        const cloudRecord = cloudMap[record.id]
        const data = {
          ownerOpenId,
          localRecordId: record.id,
          medicineId: record.medicineId,
          memberId: record.memberId,
          date: record.date,
          time: record.time,
          status: record.status,
          takenAt: record.takenAt || null,
          drugIndex: record.drugIndex !== undefined ? record.drugIndex : null,
          updatedAt: db.serverDate()
        }

        if (cloudRecord) {
          db.collection('user_records').doc(cloudRecord._id).update({
            data
          }).catch(err => console.warn('云端更新记录失败:', err))
        } else {
          db.collection('user_records').add({
            data
          }).catch(err => console.warn('云端新增记录失败:', err))
        }
      })

      // 删除云端多余的（本地已删除或超出30天的）
      cloudRecords.forEach(cloudRecord => {
        if (!localMap[cloudRecord.localRecordId]) {
          db.collection('user_records').doc(cloudRecord._id).remove()
            .catch(err => console.warn('云端删除记录失败:', err))
        }
      })
    })
  }).catch(err => {
    console.warn('记录云同步失败:', err)
  })
}

// 聚合同步：同步所有数据到云端
function syncAllToCloud() {
  syncMedicinesToCloud()
  syncMembersToCloud()
  syncRecordsToCloud()
}

module.exports = { syncMedicinesToCloud, syncMembersToCloud, syncRecordsToCloud, syncAllToCloud }
