const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function pad(n) {
  return String(n).padStart(2, '0')
}

exports.main = async () => {
  const db = cloud.database()
  const _ = db.command

  const now = new Date()
  // 转为北京时间 (UTC+8)
  const bjOffset = 8 * 60 * 60 * 1000
  const bjNow = new Date(now.getTime() + bjOffset)
  const currentTime = `${pad(bjNow.getUTCHours())}:${pad(bjNow.getUTCMinutes())}`
  const today = `${bjNow.getUTCFullYear()}-${pad(bjNow.getUTCMonth() + 1)}-${pad(bjNow.getUTCDate())}`

  console.log(`[checkMedReminder] 当前时间: ${today} ${currentTime}`)

  // 1. 查询所有 enabled 且 times 包含当前时间的药品
  const { data: medicines } = await db.collection('user_medicines')
    .where({
      enabled: true,
      times: currentTime
    })
    .limit(100)
    .get()

  if (medicines.length === 0) {
    console.log('[checkMedReminder] 当前时间无需提醒')
    return { reminded: 0 }
  }

  console.log(`[checkMedReminder] 找到 ${medicines.length} 条需提醒药品`)

  let remindedCount = 0

  for (const med of medicines) {
    // 2. 检查今天是否已通知过
    const { data: existing } = await db.collection('notification_log')
      .where({
        ownerOpenId: med.ownerOpenId,
        medicineId: med._id,
        date: today,
        time: currentTime,
        type: 'reminder'
      })
      .limit(1)
      .get()

    if (existing.length > 0) {
      console.log(`[checkMedReminder] ${med.name} 今天 ${currentTime} 已通知，跳过`)
      continue
    }

    // 3. 检查订阅消息配额
    const { data: tokens } = await db.collection('subscription_tokens')
      .where({ openId: med.ownerOpenId })
      .limit(1)
      .get()

    const tokenDoc = tokens[0]
    if (!tokenDoc || tokenDoc.count <= 0) {
      console.log(`[checkMedReminder] ${med.ownerOpenId} 无订阅配额，跳过`)
      // 写一条失败日志
      await db.collection('notification_log').add({
        data: {
          ownerOpenId: med.ownerOpenId,
          medicineId: med._id,
          date: today,
          time: currentTime,
          type: 'reminder',
          success: false,
          reason: 'no_quota',
          sentAt: db.serverDate()
        }
      })
      continue
    }

    // 4. 发送订阅消息
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: med.ownerOpenId,
        templateId: med.templateId || '',
        page: 'pages/index/index',
        data: {
          thing1: { value: med.memberName || '家人' },
          thing2: { value: med.name },
          time3: { value: `${today} ${currentTime}` },
          thing4: { value: `${med.dosage}，请按时服药` }
        }
      })

      // 5. 记录通知日志
      await db.collection('notification_log').add({
        data: {
          ownerOpenId: med.ownerOpenId,
          medicineId: med._id,
          date: today,
          time: currentTime,
          type: 'reminder',
          success: true,
          sentAt: db.serverDate()
        }
      })

      // 6. 扣减配额
      await db.collection('subscription_tokens').doc(tokenDoc._id).update({
        data: { count: _.inc(-1) }
      })

      remindedCount++
      console.log(`[checkMedReminder] 已提醒: ${med.memberName} - ${med.name} ${currentTime}`)
    } catch (err) {
      console.error(`[checkMedReminder] 发送失败:`, err)
      await db.collection('notification_log').add({
        data: {
          ownerOpenId: med.ownerOpenId,
          medicineId: med._id,
          date: today,
          time: currentTime,
          type: 'reminder',
          success: false,
          reason: err.message || 'send_failed',
          sentAt: db.serverDate()
        }
      })
    }
  }

  console.log(`[checkMedReminder] 完成，共提醒 ${remindedCount} 条`)
  return { reminded: remindedCount }
}
