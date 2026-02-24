const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const db = cloud.database()
  const { OPENID } = cloud.getWXContext()
  const { localMedicineId, date, time } = event

  if (!localMedicineId || !date || !time) {
    return { success: false, message: '缺少参数' }
  }

  console.log(`[confirmTaken] ${OPENID} 确认服药: ${localMedicineId} ${date} ${time}`)

  // 1. 根据 localMedicineId 查找云端药品记录
  const { data: meds } = await db.collection('user_medicines')
    .where({
      ownerOpenId: OPENID,
      localMedicineId
    })
    .limit(1)
    .get()

  if (meds.length === 0) {
    console.log('[confirmTaken] 未找到对应云端药品')
    return { success: false, message: '未找到药品记录' }
  }

  const cloudMedicineId = meds[0]._id

  // 2. 更新 notification_log 中对应记录为 confirmed
  const { data: logs } = await db.collection('notification_log')
    .where({
      ownerOpenId: OPENID,
      medicineId: cloudMedicineId,
      date,
      time,
      type: 'reminder'
    })
    .limit(1)
    .get()

  if (logs.length > 0) {
    await db.collection('notification_log').doc(logs[0]._id).update({
      data: {
        confirmed: true,
        confirmedAt: db.serverDate()
      }
    })
    console.log(`[confirmTaken] 已标记确认: ${logs[0]._id}`)
  }

  return { success: true }
}
