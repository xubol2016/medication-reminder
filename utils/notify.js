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
    const result = res.result
    if (!result) return

    // 有守护人配额不足，引导续订
    if (result.noQuotaCount > 0) {
      const msg = result.sentCount > 0
        ? `已通知${result.sentCount}位守护人，但有${result.noQuotaCount}位守护人通知配额已用完，无法收到提醒。`
        : `所有守护人的通知配额已用完，漏服提醒无法送达。`

      wx.showModal({
        title: '⚠️ 通知配额不足',
        content: msg + '\n请让守护人打开小程序点击"续订提醒"，或您在设置页点击"开启服药提醒通知"补充配额。',
        confirmText: '去设置',
        cancelText: '稍后',
        success: (modalRes) => {
          if (modalRes.confirm) {
            wx.switchTab({ url: '/pages/settings/settings' })
          }
        }
      })
    }
  }).catch(err => {
    console.error('守护人通知失败:', err)
  })
}

module.exports = { notifyGuardians }
