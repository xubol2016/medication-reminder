const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { memberName, medicineName, missedTime, date, templateId } = event
  const wxContext = cloud.getWXContext()
  const ownerOpenId = wxContext.OPENID

  // 查找该用户的所有已绑定守护人
  const { data: bindings } = await db.collection('guardian_bindings').where({
    ownerOpenId,
    status: 'bound'
  }).get()

  if (bindings.length === 0) {
    return { sent: false, reason: 'no_bound_guardians' }
  }

  const results = []

  for (const binding of bindings) {
    // 检查守护人的订阅消息配额
    const { data: tokens } = await db.collection('subscription_tokens').where({
      guardianOpenId: binding.guardianOpenId,
      templateId
    }).get()

    if (tokens.length === 0 || tokens[0].remaining <= 0) {
      results.push({
        guardian: binding.guardianOpenId,
        success: false,
        reason: 'no_subscription_quota'
      })
      continue
    }

    try {
      // 发送订阅消息
      await cloud.openapi.subscribeMessage.send({
        touser: binding.guardianOpenId,
        templateId: templateId,
        data: {
          thing1: { value: memberName },
          thing2: { value: medicineName },
          time3: { value: `${date} ${missedTime}` },
          thing4: { value: '请及时提醒家人服药' }
        },
        page: 'pages/index/index'
      })

      // 扣减订阅配额
      await db.collection('subscription_tokens').doc(tokens[0]._id).update({
        data: {
          remaining: tokens[0].remaining - 1,
          updatedAt: db.serverDate()
        }
      })

      results.push({ guardian: binding.guardianOpenId, success: true })
    } catch (err) {
      results.push({
        guardian: binding.guardianOpenId,
        success: false,
        error: err.message
      })
    }
  }

  return { sent: true, results }
}
