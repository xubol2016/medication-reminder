const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action, inviteCode } = event

  if (action === 'bind') {
    const { data } = await db.collection('member_bindings').where({
      inviteCode
    }).get()

    if (data.length === 0) {
      return { success: false, message: '邀请码无效或已过期' }
    }

    const binding = data[0]
    if (binding.status === 'bound') {
      return { success: false, alreadyBound: true, message: '该邀请已被绑定' }
    }

    await db.collection('member_bindings').doc(binding._id).update({
      data: {
        secondaryOpenId: wxContext.OPENID,
        status: 'bound',
        boundAt: db.serverDate()
      }
    })

    return { success: true, message: '绑定成功' }
  }

  if (action === 'unbind') {
    await db.collection('member_bindings').where({
      inviteCode
    }).remove()
    return { success: true }
  }

  return { success: false, message: '未知操作' }
}
