// 守护人通知工具模块
const { getGuardians } = require('./storage')

// 发送漏服通知给所有已绑定的守护人
function notifyGuardians(memberName, medicineName, missedTime, date) {
  const guardians = getGuardians().filter(g => g.bound)
  if (guardians.length === 0) return

  const app = getApp()
  const templateId = app.globalData.subscribeTemplateId
  if (!templateId) return

  wx.cloud.callFunction({
    name: 'sendNotification',
    data: {
      memberName,
      medicineName,
      missedTime,
      date,
      templateId
    }
  }).then(res => {
    console.log('守护人通知结果:', res.result)
  }).catch(err => {
    console.error('守护人通知失败:', err)
  })
}

module.exports = { notifyGuardians }
