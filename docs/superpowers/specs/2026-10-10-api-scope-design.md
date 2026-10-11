# 心屿智境后端范围设计

日期：2026-10-10

状态：待用户审核。审核通过前不写业务路由，不连接 MySQL，不跑 Prisma migration。

## 决定

1. 微信登录照搬本机 three 项目，不使用需求文档里的 JWT 和用户自授权头像。
2. 一次打卡同时完成两件事：发放岛屿资产，并成为信箱里的一条记录。不另做一套日记。
3. 信箱用知识图谱展示，支持按年、月、情绪筛选。
4. 每天只能打卡一次。未打卡时天气是平静、晴天。
5. 精灵使用 WebSocket 双跳，并且每一轮用户输入和完整回复都入库。
6. 只改本后端仓库，不改小程序。

## 参考来源

- 登录：`/Users/jerry/project/three/threevine-api-main` 与 `ThreeApp-main`。
- AI 流式契约：`who_family_wechat` 的 `main`。`feat/ui-ux-redesign-pass` 最新，但 AI 文件与 `main` 相同。它是小程序直连千问 SSE，没有 WebSocket，也没有记忆。双跳、WebSocket 和全量入库由本项目新建。
- `features/helper` 是假打字机，不采用。

## 登录

`POST /api/auth/guest-login`，兼容 `POST /api/auth/wechat-login`。Body 只有 `{ "provider": "weixin", "code": "..." }`。

后端用 `appid`、`secret`、`js_code` 调微信 `jscode2session`。微信 openid 只做 HMAC 后查重，不返回给小程序，也不当主键。新用户生成 `tv_wechat_` 加 14 字节 base64url 的公开 openid。

昵称固定为 `用户` 加 100000 到 999999 的随机数。客户端传入的昵称忽略。头像使用：

`https://api.dicebear.com/7.x/pixel-art/png?seed=<nickname>`

当前项目没有 MinIO。首版直接保存 Dicebear HTTPS 地址，不下载、不转存。

登录态不用 JWT。签发 `tv_session.` 加 32 字节 base64url，库中只存 HMAC。默认 30 天，可注销。除登录外，请求带 `Authorization: Bearer <token>`。

成功响应保持 `{ code, data, msg }`。`data` 含 `token`、`isNewUser`、`userInfo`。`userInfo` 至少有 id、昵称、头像、注册时间。

## 打卡与岛屿

`POST /api/records` 接收情绪和正文。同一用户同一自然日已有记录时拒绝，不发第二件资产。

一次成功写入：

- 一条 `CheckInRecord`：情绪、正文、AI 鼓励语、时间。
- 一条 `IslandAsset`：类型、坐标、层级、R2 图片地址，并关联这次打卡。
- 若干 `GraphNode`：从正文抽出的关键词，和这次打卡多对多。

`GET /api/island/assets` 返回当前用户资产及关联日期、情绪。`GET /api/island/weather` 读取今天的情绪；没有记录时返回 `calm`。`GET /api/island/assets/:id` 返回这件资产对应的日期和情绪。

打卡鼓励语走精灵的非流式生成。它写入 `CheckInRecord.aiReply`，不代替聊天历史。

## 信箱

信箱不创建第二份日记。信件就是打卡记录。

`GET /api/mailbox/graph?year=&month=&mood=` 返回筛选后的关键词节点和边。边表示两个关键词出现在同一条打卡里。不传筛选条件时返回该用户全部。

`GET /api/mailbox/nodes/:id/letters` 返回该关键词下的打卡摘要。`GET /api/mailbox/letters/:recordId` 返回完整正文和鼓励语。摘要和正文接受同样的年、月、情绪筛选。

## 精灵

传输用 WebSocket：`/api/ai`。客户端消息为 `{ message, timestamp, currentMood? }`。身份以登录态为准，不信任消息里的 userId。

第一跳调用小模型，非流式，只返回：

```json
{
  "core_emotion": "焦虑",
  "time_relevance": "high",
  "strategy": "empathy"
}
```

`strategy` 只能是 `empathy`、`cbt`、`sfbt`、`celebrate`。超时、解析失败或 API 失败时，推送一条固定安抚文案和 `{ "type": "finish" }`，不调用第二跳。

第二跳按策略拼接系统提示词，调用大模型并流式转发文本块。模型返回结束后发送 `{ "type": "finish" }`。

存储分两层：

- 全量聊天：每一轮用户消息和拼接完成的助手回复写入 `ChatMessage`，按用户和时间保留。第二跳请求带最近历史。
- 当天方向：如果今天有打卡，系统提示词加入今天的情绪、正文和鼓励语。没有打卡则按平静、晴天。

模型密钥只留在服务端。提供商先做成 OpenAI 兼容接口，可用 SiliconFlow 或 DashScope，具体地址和模型名放环境变量。

## 明确不做

- 不连接 MySQL，不执行 migration。schema 可以先改。
- 不改小程序。
- 不做管理后台、好友、推送、删除打卡、手动摆放资产。
- 不把 Dicebear 图片下载进对象存储。
- 不使用 JWT，不使用 `getUserProfile` 的头像和昵称。
