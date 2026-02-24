# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

微信小程序"吃药提醒"——面向老年人/家庭的服药提醒工具。纯 JavaScript，无构建步骤、无 npm 依赖，所有数据存储在微信本地 Storage 中，并可选接入微信云开发同步到云端。

## Development Environment

- **平台**: 微信小程序原生框架 + 微信云开发（可选）
- **开发工具**: 微信开发者工具（WeChat DevTools）打开项目根目录即可运行
- **无需构建/编译命令**，无 package.json、无 node_modules（云函数目录除外）
- **无测试框架**，在模拟器中手动测试
- **无 linter 配置**
- **云函数部署**: 在微信开发者工具中右键每个 `cloud/` 子目录 → "上传并部署"

## Architecture

### 页面结构 (6 个页面)

| 页面 | 路径 | 功能 |
|------|------|------|
| 今日服药 | `pages/index/` | 主页，展示当天药物列表和完成进度，支持按成员筛选，60 秒轮询提醒 |
| 用药记录 | `pages/records/` | 日历视图 + 历史记录筛选 |
| 设置 | `pages/settings/` | 数据清理、导出、重置，入口页跳往成员/药品/守护人 |
| 家庭成员 | `pages/members/` | 成员 CRUD |
| 药品管理 | `pages/medicines/` | 药品 CRUD，按成员分组（`groupedByMember`），多时间点配置 |
| 守护人 | `pages/guardians/` | 守护人 CRUD + 邀请绑定流程 |

Tab 栏（自定义 `custom-tab-bar/`）包含前三个页面，后三个通过 `wx.navigateTo` 进入。

**Tab 栏同步**: 三个 Tab 页面的 `onShow` 必须调用 `this.getTabBar().setData({ selected: N })`，N 为 0/1/2 对应今日/记录/设置。

### 核心工具模块 (`utils/`)

- **`storage.js`** — 封装 `wx.getStorageSync/setStorageSync`，所有写入为**全量替换**（读取完整数组 → 修改 → 写回），无局部更新。`saveMember/saveMedicine/saveRecord/saveGuardian` 均为 upsert（有 `id` 则更新，无 `id` 则追加）。删除成员时级联删除关联药品和记录。
- **`reminder.js`** — 核心业务逻辑：
  - `checkMissedMedications()` — 将过去时间点的未记录项**写入 storage** 标记为 `missed`，返回新增漏服列表
  - `getTodayMedStatus()` — **不写 storage**，实时计算今日各药物状态（`pending`/`taken`/`missed`），供首页展示
  - `checkCurrentReminders()` — 精确匹配当前分钟（`time === getNow()`），返回需提醒项
- **`date.js`** — 日期格式化（YYYY-MM-DD / HH:mm）、`compareTime()`、日历辅助函数、`generateId()`。
- **`cloud-sync.js`** — 将本地药品单向同步到云数据库 `user_medicines`，在成员/药品变更后调用。
- **`notify.js`** — 检测到漏服时，通过云函数 `sendNotification` 向已绑定守护人发送订阅消息。

### 数据模型

```
members:   { id, name }
medicines: { id, memberId, name, dosage, times: string[], enabled, healthTip?: { effect, usage, cautions: string[], tip, queriedAt } }
records:   { id, medicineId, memberId, date, time, status: "taken"|"missed"|"pending", takenAt }
guardians: { id, name, relation, bound, openId, subscribedCount, inviteCode }
```

### 云函数 (`cloud/`)

所有云函数均使用 `cloud.DYNAMIC_CURRENT_ENV`。

| 云函数 | 功能 |
|--------|------|
| `getOpenId` | 获取当前用户 openId |
| `bindGuardian` | 三合一：`action=bind`（守护人接受邀请）/ `action=unbind`（删除绑定）/ `action=subscribe`（记录订阅配额 +1，用户端和守护人端均调用此 action）|
| `sendNotification` | 向所有已绑定守护人推送订阅消息（检查 `subscription_tokens` 余量，发送后扣减）|
| `getMedicineTip` | 调用 Anthropic Claude API，根据药物名称生成适合老年人阅读的健康小提示（`{ effect, usage, cautions[], tip }`），用内置 `https` 模块请求，无额外依赖 |
| `checkMedReminder` / `checkMissedReminder` / `confirmTaken` | 定时触发备用，当前小程序端已自行处理 |

**订阅消息模板字段** (`sendNotification` 发送时的字段名，须与微信后台模板一致):
- `thing1` → memberName（成员姓名）
- `thing2` → medicineName（药品名称）
- `time3` → `${date} ${missedTime}`（漏服时间）
- `thing4` → 固定文字"请及时提醒家人服药"

### 云数据库集合

- `user_medicines` — 本地药品镜像，供守护人端读取
- `guardian_bindings` — `{ inviteCode, ownerOpenId, guardianOpenId, status: "pending"|"bound" }`
- `subscription_tokens` — `{ guardianOpenId, templateId, remaining }`（每次 subscribe action +1，发消息 -1）

### 提醒生命周期

`App.onShow()` → `checkMissedMedications()` → 若有新漏服则 `notifyGuardians()` → `syncMedicinesToCloud()` → 首页 `startReminder()` 每 60 秒轮询 → `checkCurrentReminders()` 精确匹配当前分钟 → 弹出模态框 → 记录写 storage → `onHide()` 清除定时器。全局 `app.globalData.reminderInterval` 管理定时器。

**首页数据加载顺序**: `onShow` 先调 `checkMissedMedications()`（写漏服记录到 storage），再调 `getTodayMedStatus()`（读取显示）。两者均以 `enabled` 药品为范围。

**记录页 vs 首页的数据构建差异**: 首页使用 `reminder.js` 的 `getTodayMedStatus()`；记录页直接遍历 `getMedicines()` 自行构建当日应服列表（不使用 `reminder.js`），对历史日期不计算 missed 状态（仅显示 storage 中已有的 record 状态或 `pending`）。

**补服流程**: 首页 `handleMissed(e)` 将 `missed` 记录 upsert 为 `status: 'taken'`，同时调用 `confirmTaken` 云函数回写。

**守护人邀请流程**: 用户在守护人页生成邀请码（本地 `generateId()` 生成，同时后台写入 `guardian_bindings`）→ 分享小程序卡片（路径携带 `inviteCode`）→ 守护人打开触发 `handleInviteAccept()` → 调用 `bindGuardian(action=bind)` → 弹窗引导授权订阅 → 调用 `bindGuardian(action=subscribe)`。若通过分享链接打开，`app.js` 将邀请码存入 `globalData.pendingInviteCode`，守护人页 `onLoad` 读取处理。

### 重要配置

- `app.globalData.subscribeTemplateId`（`app.js`）：在微信公众平台申请订阅消息模板后填入，否则漏服通知功能完全不工作（`notify.js` 和 `guardians.js` 都会提前退出）。
- `ANTHROPIC_API_KEY`（`cloud/getMedicineTip/index.js` 顶部）：填入从 console.anthropic.com 申请的 API Key，否则药物健康小提示功能不可用。
- 云开发：各云函数目录下各有独立 `package.json`（依赖 `wx-server-sdk`），部署前需 npm install。

## Design Conventions

- **适老化设计**: 全局基础字体 18px，按钮最小高度 96rpx
- **配色体系**: 主蓝 #4A90D9（渐变至 #5BA3EC）、成功绿 #2ecc71、危险红 #e74c3c、警告橙 #f0932b、文本深色 #1a1a2e、辅助灰 #a0a0b8
- **图标**: 使用 emoji（💊🕐⚠️📋👥🗑️✏️等），无第三方图标库
- 使用 rpx 单位；按钮统一 `linear-gradient(135deg, ...)` 渐变 + `box-shadow`
- 全局公共样式（`.btn-primary`、`.btn-danger`、`.btn-secondary`、`.card`、`.form-input` 等）定义在 `app.wxss`
- **Bottom-Sheet Modal**: 表单编辑使用 `.tp-mask` + `.tp-panel`，遮罩用 `catchtap="noop"` 阻止穿透（必须定义 `noop(){}` 空方法，不能用 `catchtap=""`）
- **安全区**: Tab 页面底部用 `padding-bottom: calc(160rpx + env(safe-area-inset-bottom))`
- **小程序 input**: 必须显式设置 `height` + `line-height` 才能正确渲染，不能只靠 padding
- **时间选择器**: 分钟以 5 为步长（0/5/10…/55），见 `medicines.js` `adjustMinute()`
