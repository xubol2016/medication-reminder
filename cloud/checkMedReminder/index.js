const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function pad(n) {
  return String(n).padStart(2, '0')
}

// 向指定用户发送服药提醒，成功则扣减配额
async function sendReminderToUser(db, _, openId, med, today, currentTime) {
  // 查询订阅配额（字段名为 guardianOpenId）
  const { data: tokens } = await db.collection('subscription_tokens')
    .where({ guardianOpenId: openId })
    .limit(1)
    .get()

  const tokenDoc = tokens[0]
  if (!tokenDoc || tokenDoc.remaining <= 0) {
    console.log(`[checkMedReminder] ${openId} 无订阅配额，跳过`)
    return { success: false, reason: 'no_quota' }
  }

  // templateId 从 token 记录中获取
  const templateId = tokenDoc.templateId
  if (!templateId) {
    console.log(`[checkMedReminder] ${openId} token 无 templateId，跳过`)
    return { success: false, reason: 'no_template' }
  }

  try {
    await cloud.openapi.subscribeMessage.send({
      touser: openId,
      templateId,
      page: 'pages/index/index',
      data: {
        thing1: { value: med.memberName || '家人' },
        thing2: { value: med.name },
        time3: { value: `${today} ${currentTime}` },
        thing4: { value: `${med.dosage}，请按时服药` }
      }
    })

    // 扣减配额（字段名为 remaining）
    await db.collection('subscription_tokens').doc(tokenDoc._id).update({
      data: { remaining: _.inc(-1) }
    })

    console.log(`[checkMedReminder] 已向 ${openId} 发送提醒: ${med.memberName} - ${med.name}`)
    return { success: true }
  } catch (err) {
    console.error(`[checkMedReminder] 向 ${openId} 发送失败:`, err)
    return { success: false, reason: err.message || 'send_failed' }
  }
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
    // 2. 检查今天是否已通知过（owner）
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

    // 3. 向 owner 发送提醒
    const ownerResult = await sendReminderToUser(db, _, med.ownerOpenId, med, today, currentTime)

    // 4. 查询已绑定的副成员，也向他们发送提醒
    const secondaryResults = []
    try {
      const { data: memberBindings } = await db.collection('member_bindings')
        .where({
          primaryOpenId: med.ownerOpenId,
          status: 'bound'
        })
        .limit(50)
        .get()

      for (const binding of memberBindings) {
        if (binding.secondaryOpenId && binding.secondaryOpenId !== med.ownerOpenId) {
          const result = await sendReminderToUser(db, _, binding.secondaryOpenId, med, today, currentTime)
          secondaryResults.push({ openId: binding.secondaryOpenId, ...result })
        }
      }
    } catch (err) {
      console.warn('[checkMedReminder] 查询副成员绑定失败:', err)
    }

    // 5. 记录通知日志
    const anySuccess = ownerResult.success || secondaryResults.some(r => r.success)
    await db.collection('notification_log').add({
      data: {
        ownerOpenId: med.ownerOpenId,
        medicineId: med._id,
        date: today,
        time: currentTime,
        type: 'reminder',
        success: anySuccess,
        ownerResult,
        secondaryResults,
        sentAt: db.serverDate()
      }
    })

    if (anySuccess) remindedCount++
    console.log(`[checkMedReminder] ${med.memberName} - ${med.name} ${currentTime} 通知完成`)
  }

  console.log(`[checkMedReminder] 完成，共提醒 ${remindedCount} 条`)
  return { reminded: remindedCount }
}
