const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const callerOpenId = wxContext.OPENID
  if (!callerOpenId) {
    return { success: false, message: '无法获取用户身份' }
  }

  const db = cloud.database()

  // 查询守护人绑定关系
  const bindingRes = await db.collection('guardian_bindings').where({
    guardianOpenId: callerOpenId,
    status: 'bound'
  }).limit(1).get()

  if (!bindingRes.data || bindingRes.data.length === 0) {
    return { success: false, message: '非守护人身份' }
  }

  const ownerOpenId = bindingRes.data[0].ownerOpenId

  // 并行查询被守护人的所有数据
  const [membersRes, medicinesRes, recordsRes] = await Promise.all([
    db.collection('user_members').where({ ownerOpenId }).limit(1000).get(),
    db.collection('user_medicines').where({ ownerOpenId }).limit(1000).get(),
    db.collection('user_records').where({ ownerOpenId }).limit(1000).get()
  ])

  // 将云端字段映射回本地 storage 一致的结构
  const members = (membersRes.data || []).map(m => ({
    id: m.localMemberId,
    name: m.name
  }))

  const medicines = (medicinesRes.data || []).map(m => ({
    id: m.localMedicineId,
    memberId: m.memberId,
    name: m.name,
    dosage: m.dosage,
    times: m.times || [],
    enabled: m.enabled,
    drugNames: m.drugNames || [],
    drugTimes: m.drugTimes || [],
    drugDosages: m.drugDosages || [],
    healthTip: m.healthTip || null
  }))

  const records = (recordsRes.data || []).map(r => ({
    id: r.localRecordId,
    medicineId: r.medicineId,
    memberId: r.memberId,
    date: r.date,
    time: r.time,
    status: r.status,
    takenAt: r.takenAt || null,
    drugIndex: r.drugIndex !== undefined ? r.drugIndex : null
  }))

  // 尝试获取被守护人名称（取第一个成员名或使用默认值）
  const ownerName = members.length > 0 ? members[0].name : '家人'

  return {
    success: true,
    ownerOpenId,
    ownerName,
    members,
    medicines,
    records
  }
}
