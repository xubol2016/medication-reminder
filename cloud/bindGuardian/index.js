const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action, inviteCode, templateId } = event

  if (action === 'bind') {
    // 守护人接受邀请绑定
    const { data } = await db.collection('guardian_bindings').where({
      inviteCode
    }).get()

    if (data.length === 0) {
      return { success: false, message: '邀请码无效或已过期' }
    }

    const binding = data[0]
    if (binding.status === 'bound') {
      return { success: false, alreadyBound: true, message: '守护人的邀请已被绑定' }
    }

    await db.collection('guardian_bindings').doc(binding._id).update({
      data: {
        guardianOpenId: wxContext.OPENID,
        status: 'bound',
        boundAt: db.serverDate()
      }
    })

    return { success: true, message: '绑定成功' }
  }

  if (action === 'unbind') {
    // 删除绑定记录
    await db.collection('guardian_bindings').where({
      inviteCode
    }).remove()
    return { success: true }
  }

  if (action === 'subscribe') {
    // 记录订阅授权
    const guardianOpenId = wxContext.OPENID
    const { data } = await db.collection('subscription_tokens').where({
      guardianOpenId,
      templateId
    }).get()

    if (data.length > 0) {
      await db.collection('subscription_tokens').doc(data[0]._id).update({
        data: {
          remaining: data[0].remaining + 1,
          updatedAt: db.serverDate()
        }
      })
    } else {
      await db.collection('subscription_tokens').add({
        data: {
          guardianOpenId,
          templateId,
          remaining: 1,
          updatedAt: db.serverDate()
        }
      })
    }

    return { success: true }
  }

  if (action === 'getQuota') {
    const myOpenId = wxContext.OPENID

    // 查询当前用户自身的订阅配额
    const { data: myTokens } = await db.collection('subscription_tokens').where({
      guardianOpenId: myOpenId,
      templateId
    }).get()
    const myRemaining = myTokens.length > 0 ? myTokens[0].remaining : 0

    // 查询所有已绑定守护人的订阅配额（含明细）
    const { data: bindings } = await db.collection('guardian_bindings').where({
      ownerOpenId: myOpenId,
      status: 'bound'
    }).get()

    let guardianTotal = 0
    const guardianQuotas = {}
    for (const binding of bindings) {
      if (binding.guardianOpenId === myOpenId) continue
      const { data: gTokens } = await db.collection('subscription_tokens').where({
        guardianOpenId: binding.guardianOpenId,
        templateId
      }).get()
      const remaining = gTokens.length > 0 ? gTokens[0].remaining : 0
      guardianTotal += remaining
      guardianQuotas[binding.guardianOpenId] = remaining
    }

    return { success: true, myRemaining, guardianTotal, guardianQuotas, guardianCount: bindings.length }
  }

  return { success: false, message: '未知操作' }
}
