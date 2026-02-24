const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function pad(n) {
  return String(n).padStart(2, '0')
}

exports.main = async () => {
  const db = cloud.database()
  const _ = db.command

  const now = new Date()
  const bjOffset = 8 * 60 * 60 * 1000
  const bjNow = new Date(now.getTime() + bjOffset)
  const today = `${bjNow.getUTCFullYear()}-${pad(bjNow.getUTCMonth() + 1)}-${pad(bjNow.getUTCDate())}`

  // 查找 15 分钟前发送的提醒且未确认的
  const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000)

  console.log(`[checkMissedReminder] 检查 ${today} 超时未确认的提醒`)

  // 1. 查询已发送的提醒通知（成功的、未确认的）
  const { data: reminders } = await db.collection('notification_log')
    .where({
      date: today,
      type: 'reminder',
      success: true,
      confirmed: _.neq(true),
      sentAt: _.lt(fifteenMinAgo)
    })
    .limit(100)
    .get()

  if (reminders.length === 0) {
    console.log('[checkMissedReminder] 无超时未确认的提醒')
    return { notified: 0 }
  }

  console.log(`[checkMissedReminder] 发现 ${reminders.length} 条超时未确认提醒`)

  // 按 ownerOpenId 分组，避免重复查询守护人
  const ownerMap = {}
  for (const r of reminders) {
    if (!ownerMap[r.ownerOpenId]) {
      ownerMap[r.ownerOpenId] = []
    }
    ownerMap[r.ownerOpenId].push(r)
  }

  let notifiedCount = 0

  for (const [ownerOpenId, ownerReminders] of Object.entries(ownerMap)) {
    // 2. 检查是否已给守护人发过漏服通知（同一药品同一时间段只发一次）
    for (const reminder of ownerReminders) {
      const { data: existingNotif } = await db.collection('notification_log')
        .where({
          ownerOpenId,
          medicineId: reminder.medicineId,
          date: today,
          time: reminder.time,
          type: 'missed_guardian'
        })
        .limit(1)
        .get()

      if (existingNotif.length > 0) {
        continue // 已通知过守护人
      }

      // 3. 查询该用户的守护人
      const { data: bindings } = await db.collection('guardian_bindings')
        .where({ ownerOpenId })
        .limit(20)
        .get()

      if (bindings.length === 0) {
        console.log(`[checkMissedReminder] ${ownerOpenId} 无守护人绑定`)
        continue
      }

      // 4. 获取药品信息
      let medInfo = null
      try {
        const { data: med } = await db.collection('user_medicines')
          .doc(reminder.medicineId)
          .get()
        medInfo = med
      } catch (e) {
        console.warn(`[checkMissedReminder] 药品 ${reminder.medicineId} 查询失败`)
        continue
      }

      // 5. 给每个守护人发送漏服通知
      for (const binding of bindings) {
        const guardianOpenId = binding.guardianOpenId
        if (!guardianOpenId) continue

        // 检查守护人订阅配额
        const { data: tokens } = await db.collection('subscription_tokens')
          .where({ openId: guardianOpenId })
          .limit(1)
          .get()

        const tokenDoc = tokens[0]
        if (!tokenDoc || tokenDoc.count <= 0) {
          console.log(`[checkMissedReminder] 守护人 ${guardianOpenId} 无配额`)
          continue
        }

        try {
          await cloud.openapi.subscribeMessage.send({
            touser: guardianOpenId,
            templateId: binding.templateId || '',
            page: 'pages/index/index',
            data: {
              thing1: { value: medInfo.memberName || '家人' },
              thing2: { value: medInfo.name },
              time3: { value: `${today} ${reminder.time}` },
              thing4: { value: `已超时15分钟未服药，请提醒` }
            }
          })

          // 扣减守护人配额
          await db.collection('subscription_tokens').doc(tokenDoc._id).update({
            data: { count: _.inc(-1) }
          })

          notifiedCount++
          console.log(`[checkMissedReminder] 已通知守护人: ${guardianOpenId}`)
        } catch (err) {
          console.error(`[checkMissedReminder] 通知守护人失败:`, err)
        }
      }

      // 6. 记录已通知守护人
      await db.collection('notification_log').add({
        data: {
          ownerOpenId,
          medicineId: reminder.medicineId,
          date: today,
          time: reminder.time,
          type: 'missed_guardian',
          success: true,
          sentAt: db.serverDate()
        }
      })
    }
  }

  console.log(`[checkMissedReminder] 完成，共通知守护人 ${notifiedCount} 次`)
  return { notified: notifiedCount }
}
