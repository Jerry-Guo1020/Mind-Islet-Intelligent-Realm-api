# 心屿智境后端基础实现计划

> **For agentic workers:** Required workflow is task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 在不连接 MySQL 的前提下，把登录、打卡、信箱和精灵的后端骨架写到可单测。

**Architecture:** Nest.js 模块保持 auth、users、island、records、mailbox、ai-agent。Prisma schema 先增加 session 和 chat 表，但不 migrate。AI 用 WebSocket 加两次 OpenAI 兼容请求。

**Tech Stack:** Nest.js 11、Prisma 6.19、Node crypto、Node fetch、WebSocket。

**前置:** 用户已审核 `docs/superpowers/specs/2026-10-10-api-scope-design.md`。未审核时停止。

---

## 文件

- `prisma/schema.prisma`：补登录 session、聊天消息、打卡日期约束所需字段。
- `src/common/`：响应外壳、登录守卫、异常过滤器。
- `src/modules/auth/`：微信登录和随机身份。
- `src/modules/records/`、`island/`、`mailbox/`：打卡一次写入，信箱只读打卡。
- `src/modules/ai-agent/`：提示词、双跳、WebSocket、降级。
- `.env.example`：只增加变量名，不写真实密钥。

## 任务 1：Schema

- [ ] 增加 `AuthSession`、`ChatMessage`。
- [ ] User 改为可存公开 openid 和 openid HMAC。
- [ ] CheckInRecord 增加用于「每天一次」判断的日期字段。
- [ ] 运行 `npx prisma validate` 和 `npx prisma generate`。
- [ ] 不运行 `prisma migrate`。

## 任务 2：登录

- [ ] 先写失败测试：缺 code、微信错误、新用户、老用户。
- [ ] 实现 code2session、HMAC 查重、`用户` 加六位昵称、Dicebear URL、opaque session。
- [ ] 响应使用 `{ code, data, msg }`，不返回微信 openid。
- [ ] 测试通过后提交。

## 任务 3：打卡与岛屿

- [ ] 先写失败测试：首次打卡写记录、资产、关键词；同日第二次拒绝；无打卡天气为 calm。
- [ ] 实现三个查询和一个提交。
- [ ] 测试通过后提交。

## 任务 4：信箱

- [ ] 先写失败测试：年、月、情绪筛选，节点、边、信件都只来自打卡。
- [ ] 实现三个只读接口。
- [ ] 测试通过后提交。

## 任务 5：精灵

- [ ] 先写失败测试：第一跳失败时只发兜底文案；成功时按策略拼接提示词；结束后保存用户消息和完整回复。
- [ ] 用假模型客户端测试，不请求真实模型。
- [ ] 实现 WebSocket 主流程。
- [ ] 测试通过后提交。

## 约束

不改小程序，不读取或提交 `.env`，不在日志中写密钥。
