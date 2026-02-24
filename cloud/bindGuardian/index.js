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
      return { success: false, message: '该邀请已被绑定' }
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

  return { success: false, message: '未知操作' }
}
