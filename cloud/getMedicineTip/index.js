// =====================================================================
// 云函数：getMedicineTip
// 功能：调用 Anthropic Claude API，为指定药物生成适合老年人阅读的健康小提示
//
// 【用户部署步骤】
// 1. 前往 https://console.anthropic.com 注册并申请 API Key
// 2. 将下方 ANTHROPIC_API_KEY 的值替换为您自己的 API Key
// 3. 在微信开发者工具中，右键本目录 → "上传并部署：云端安装依赖"
// =====================================================================

const https = require('https')
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// ⚠️ 请替换为您自己的 Anthropic API Key
const ANTHROPIC_API_KEY = 'YOUR_API_KEY_HERE'

// 调用 Claude API 生成药物健康提示
function callClaudeAPI(medicineName) {
  return new Promise((resolve, reject) => {
    const prompt = `你是一位专业药剂师，请用简单易懂的中文为老年人介绍以下药物。
药物名称：${medicineName}

请严格按以下JSON格式返回（不要加任何其他内容，不要加代码块标记）：
{
  "effect": "药效简介（1-2句，50字以内）",
  "usage": "服药方法（1-2句，包含餐前/餐后、用水量等建议）",
  "cautions": ["注意事项1", "注意事项2", "注意事项3"],
  "tip": "综合健康小提示（1句话，温馨提醒）"
}`

    const requestBody = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.error) {
            reject(new Error(parsed.error.message || 'API 返回错误'))
            return
          }
          const text = parsed.content && parsed.content[0] && parsed.content[0].text
          if (!text) {
            reject(new Error('API 返回内容为空'))
            return
          }
          // 解析 JSON 结果
          const tipData = JSON.parse(text)
          resolve(tipData)
        } catch (err) {
          reject(new Error('解析 API 返回内容失败: ' + err.message))
        }
      })
    })

    req.on('error', (err) => {
      reject(err)
    })

    req.write(requestBody)
    req.end()
  })
}

exports.main = async (event) => {
  const { medicineName } = event

  if (!medicineName || !medicineName.trim()) {
    return { success: false, error: '药物名称不能为空' }
  }

  if (ANTHROPIC_API_KEY === 'YOUR_API_KEY_HERE') {
    return {
      success: false,
      error: '请先在云函数中配置 Anthropic API Key（见 cloud/getMedicineTip/index.js 顶部注释）'
    }
  }

  try {
    const tipData = await callClaudeAPI(medicineName.trim())

    // 校验返回结构
    if (!tipData.effect || !tipData.usage || !tipData.tip) {
      return { success: false, error: '生成的提示格式不正确，请重试' }
    }

    return {
      success: true,
      data: {
        effect: tipData.effect,
        usage: tipData.usage,
        cautions: Array.isArray(tipData.cautions) ? tipData.cautions : [],
        tip: tipData.tip,
        queriedAt: new Date().toISOString()
      }
    }
  } catch (err) {
    return { success: false, error: err.message || '查询失败，请稍后重试' }
  }
}
