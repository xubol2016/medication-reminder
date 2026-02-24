// 药品数据云端同步工具
const { getMembers, getMedicines, getMemberById } = require('./storage')

// 同步所有药品数据到云数据库
function syncMedicinesToCloud() {
  if (!wx.cloud) return

  wx.cloud.callFunction({ name: 'getOpenId' }).then(res => {
    const ownerOpenId = res.result.openId
    if (!ownerOpenId) return

    const members = getMembers()
    const medicines = getMedicines()
    const db = wx.cloud.database()
    const _ = db.command

    // 获取云端已有的药品记录
    db.collection('user_medicines').where({
      ownerOpenId
    }).get().then(cloudRes => {
      const cloudMeds = cloudRes.data || []
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
          updatedAt: db.serverDate()
        }

        if (cloudMed) {
          // 更新
          db.collection('user_medicines').doc(cloudMed._id).update({
            data
          }).catch(err => console.warn('云端更新药品失败:', err))
        } else {
          // 新增
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
    }).catch(err => {
      console.warn('获取云端药品数据失败:', err)
    })
  }).catch(err => {
    console.warn('云同步失败（getOpenId 不可用）:', err)
  })
}

module.exports = { syncMedicinesToCloud }
