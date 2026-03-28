# 软件设计文档（SDD）
## AI 智能对话平台

**版本**：v1.0
**日期**：2026-03-26
**状态**：草稿

---

## 1. 系统架构概述

### 1.1 整体架构

本系统采用**前后端分离**架构，前端 SPA 应用通过 REST API 和 SSE 与后端服务通信。

```
┌─────────────────────────────────────────────────────────┐
│                       客户端浏览器                        │
│  ┌──────────────────────────────────────────────────┐   │
│  │  React 19 SPA                                    │   │
│  │  ├─ 认证模块                                     │   │
│  │  ├─ 对话管理模块                                  │   │
│  │  ├─ 聊天交互模块（SSE 消费端）                    │   │
│  │  └─ 文件上传模块                                  │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────┬──────────────────────────────────────────┘
               │ HTTP/SSE (CORS)
┌──────────────▼──────────────────────────────────────────┐
│                   Spring Boot 3.2.5                      │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │ Security   │  │ Controllers │  │ Services         │  │
│  │ JWT Filter │  │ Auth        │  │ AuthService      │  │
│  │ CORS Config│  │ Chat        │  │ ChatService(SSE) │  │
│  └────────────┘  │ Conversation│  │ DeepSeekService  │  │
│                  │ FileUpload  │  │ ConversationSvc  │  │
│                  └─────────────┘  └──────────────────┘  │
│                                                          │
│  ┌─────────────────────────┐  ┌───────────────────────┐  │
│  │ Repositories (JPA)      │  │ External API Client   │  │
│  │ UserRepository          │  │ WebClient             │  │
│  │ ConversationRepository  │  │ (Spring WebFlux)      │  │
│  │ MessageRepository       │  └───────────────────────┘  │
│  └─────────────────────────┘                            │
└──────────────┬──────────────────────────────────────────┘
               │                         │
    ┌──────────▼─────────┐   ┌───────────▼────────────┐
    │   MySQL 8.0        │   │  DeepSeek API          │
    │   users            │   │  /chat/completions     │
    │   conversations    │   │  (stream=true)         │
    │   messages         │   └────────────────────────┘
    └────────────────────┘
```

### 1.2 技术栈

| 层次 | 技术 | 版本 |
|------|------|------|
| 前端框架 | React | 19.2.0 |
| 前端构建 | Vite (rolldown) | 7.2.5 |
| Markdown 渲染 | markdown-it | 14.1.0 |
| 后端框架 | Spring Boot | 3.2.5 |
| 编程语言 | Java | 17 |
| ORM | Spring Data JPA / Hibernate | 与 Boot 版本对应 |
| 安全框架 | Spring Security | 与 Boot 版本对应 |
| 异步 HTTP 客户端 | Spring WebFlux WebClient | 与 Boot 版本对应 |
| JWT 库 | jjwt | 0.12.5 |
| 数据库 | MySQL | 8.0 |
| 代码简化 | Lombok | 最新稳定版 |

---

## 2. 模块设计

### 2.1 后端模块结构

```
com.llmchat/
├── LlmChatApplication.java          # Spring Boot 入口
├── config/
│   ├── SecurityConfig.java          # Spring Security + CORS 配置
│   └── WebClientConfig.java         # WebClient Bean 配置
├── controller/
│   ├── AuthController.java          # 注册/登录接口
│   ├── ChatController.java          # 流式对话接口
│   ├── ConversationController.java  # 对话 CRUD 接口
│   └── FileUploadController.java    # 文件上传接口
├── service/
│   ├── AuthService.java             # 认证业务逻辑
│   ├── ChatService.java             # SSE 流式对话编排
│   ├── ConversationService.java     # 对话和消息持久化
│   └── DeepSeekService.java         # DeepSeek API 调用
├── entity/
│   ├── User.java                    # 用户实体
│   ├── Conversation.java            # 对话实体
│   └── Message.java                 # 消息实体（含 Role 枚举）
├── repository/
│   ├── UserRepository.java
│   ├── ConversationRepository.java
│   └── MessageRepository.java
├── dto/
│   ├── LoginRequest.java
│   ├── RegisterRequest.java
│   ├── ChatRequest.java
│   └── AuthResponse.java
├── security/
│   ├── JwtTokenProvider.java        # JWT 生成与验证
│   ├── JwtAuthFilter.java           # 请求拦截过滤器
│   └── UserDetailsServiceImpl.java  # 用户信息加载
└── exception/
    └── GlobalExceptionHandler.java  # 全局异常处理
```

### 2.2 前端模块结构

```
frontend/src/
├── main.jsx                 # React 应用挂载入口
├── App.jsx                  # 根组件（状态管理、页面路由）
├── App.css                  # 全局样式
├── index.css                # 基础样式重置
└── api/
    └── index.js             # 所有 API 调用封装
```

---

## 3. 数据库设计

### 3.1 ER 图

```
┌─────────────────┐        ┌─────────────────────┐
│     users        │        │    conversations     │
├─────────────────┤        ├─────────────────────┤
│ id (PK)         │──┐     │ id (PK)             │
│ username (UK)   │  │     │ user_id (FK→users)  │
│ email (UK)      │  └────>│ title               │
│ password        │        │ created_at          │
│ created_at      │        │ updated_at          │
└─────────────────┘        └──────────┬──────────┘
                                      │
                                      │ 1:N
                                      ▼
                           ┌─────────────────────┐
                           │      messages        │
                           ├─────────────────────┤
                           │ id (PK)             │
                           │ conversation_id(FK) │
                           │ role (USER/ASSISTANT)│
                           │ content (LONGTEXT)  │
                           │ created_at          │
                           └─────────────────────┘
```

### 3.2 表结构详细设计

#### users 表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT | PK, AUTO_INCREMENT | 用户 ID |
| username | VARCHAR(255) | UNIQUE, NOT NULL | 用户名 |
| email | VARCHAR(255) | UNIQUE, NOT NULL | 邮箱 |
| password | VARCHAR(255) | NOT NULL | BCrypt 加密密码 |
| created_at | DATETIME | NOT NULL | 创建时间（自动设置） |

#### conversations 表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT | PK, AUTO_INCREMENT | 对话 ID |
| user_id | BIGINT | FK → users.id, NOT NULL | 所属用户 |
| title | VARCHAR(200) | - | 对话标题 |
| created_at | DATETIME | NOT NULL | 创建时间 |
| updated_at | DATETIME | NOT NULL | 最后更新时间 |

#### messages 表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT | PK, AUTO_INCREMENT | 消息 ID |
| conversation_id | BIGINT | FK → conversations.id, NOT NULL | 所属对话 |
| role | ENUM('USER','ASSISTANT') | NOT NULL | 消息角色 |
| content | LONGTEXT | NOT NULL | 消息内容 |
| created_at | DATETIME | NOT NULL | 创建时间 |

### 3.3 索引策略

| 表 | 索引字段 | 类型 | 用途 |
|----|---------|------|------|
| users | username | UNIQUE | 登录查询 |
| users | email | UNIQUE | 注册唯一性检查 |
| conversations | user_id | INDEX | 按用户查询对话列表 |
| conversations | updated_at | INDEX | 对话列表排序 |
| messages | conversation_id | INDEX | 按对话查询消息 |

---

## 4. API 接口设计

### 4.1 统一约定

- **Base URL**：`http://localhost:8081`
- **认证方式**：`Authorization: Bearer <JWT Token>`
- **内容类型**：`Content-Type: application/json`（文件上传除外）
- **时间格式**：ISO 8601（`2026-03-26T10:00:00`）

### 4.2 认证接口

#### POST /api/auth/register

**请求体**：
```json
{
  "username": "john",
  "email": "john@example.com",
  "password": "password123"
}
```

**成功响应（200）**：
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "username": "john"
}
```

**失败响应（400）**：
```json
{
  "message": "用户名已存在"
}
```

#### POST /api/auth/login

**请求体**：
```json
{
  "username": "john",
  "password": "password123"
}
```

**成功响应（200）**：
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "username": "john"
}
```

---

### 4.3 聊天接口

#### POST /api/chat/stream

**认证**：Bearer Token 必填

**请求体**：
```json
{
  "conversationId": null,
  "content": "请帮我分析这段代码...",
  "regenerate": false
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| conversationId | Long / null | null 表示新建对话 |
| content | String | 用户消息内容 |
| regenerate | Boolean | true 表示重新生成（不写入用户消息） |

**响应**：SSE 流（`text/event-stream`）

```
data: {"type":"content","delta":"这段"}
data: {"type":"content","delta":"代码"}
data: {"type":"content","delta":"的问题..."}
data: {"type":"done","conversationId":42}
```

**错误事件**：
```
data: {"type":"error","message":"DeepSeek API 调用失败"}
```

---

### 4.4 对话管理接口

#### GET /api/conversations

**认证**：Bearer Token 必填

**成功响应（200）**：
```json
[
  {
    "id": 42,
    "title": "请帮我分析这段代码...",
    "createdAt": "2026-03-26T09:00:00",
    "updatedAt": "2026-03-26T10:30:00"
  }
]
```

#### GET /api/conversations/{id}/messages

**认证**：Bearer Token 必填

**路径参数**：`id` - 对话 ID

**成功响应（200）**：
```json
[
  {
    "id": 1,
    "role": "USER",
    "content": "请帮我分析这段代码...",
    "createdAt": "2026-03-26T09:00:00"
  },
  {
    "id": 2,
    "role": "ASSISTANT",
    "content": "这段代码的问题在于...",
    "createdAt": "2026-03-26T09:00:05"
  }
]
```

#### DELETE /api/conversations/{id}

**认证**：Bearer Token 必填

**路径参数**：`id` - 对话 ID

**成功响应**：`204 No Content`

---

### 4.5 文件上传接口

#### POST /api/files/upload

**认证**：Bearer Token 必填

**请求体**：`multipart/form-data`，字段名 `file`

**成功响应（200）**：
```json
{
  "filename": "example.java",
  "content": "public class Example {\n    ...\n}",
  "size": 1024
}
```

**失败响应（400）**：
```json
{
  "message": "不支持的文件类型"
}
```

---

## 5. 核心流程设计

### 5.1 用户认证流程

```
客户端                          Spring Security                 数据库
  │                                    │                           │
  │──POST /api/auth/login──────────────▶│                          │
  │                                    │──查询用户──────────────────▶│
  │                                    │◀──返回 User 实体────────────│
  │                                    │                           │
  │                                    │  BCrypt 验证密码           │
  │                                    │  生成 JWT Token            │
  │◀──{token, username}────────────────│                           │
  │                                    │                           │
  │  保存 token 到 localStorage         │                           │
```

### 5.2 流式对话完整流程

```
客户端                    ChatService           DeepSeekService        DeepSeek API
  │                           │                      │                    │
  │─POST /api/chat/stream──────▶│                     │                   │
  │                           │                      │                    │
  │                           │ 创建 SseEmitter       │                   │
  │                           │ 获取/创建 Conversation │                   │
  │                           │ 保存用户 Message      │                   │
  │                           │ 获取历史 40 条        │                   │
  │                           │──streamChat()─────────▶│                  │
  │                           │                      │─POST /completions──▶│
  │                           │                      │                    │(stream=true)
  │                           │                      │◀──data: {delta}────│
  │◀──SSE: {type:content}─────│◀──Flux<String>───────│                   │
  │                           │                      │◀──data: {delta}────│
  │◀──SSE: {type:content}─────│◀──Flux<String>───────│                   │
  │                           │                      │◀──data: [DONE]─────│
  │                           │ 保存完整 AI Message   │                   │
  │◀──SSE: {type:done}────────│                      │                   │
```

### 5.3 重新生成流程

```
客户端                          ChatService
  │                                 │
  │─POST {regenerate:true}──────────▶│
  │                                 │ 跳过保存用户消息步骤
  │                                 │ 获取对话历史（包含上条用户消息）
  │                                 │ 调用 DeepSeek API
  │◀──SSE 流式响应──────────────────│
  │                                 │ 保存新的 AI 回复
  │◀──SSE: {type:done}──────────────│
```

### 5.4 JWT 认证过滤链

```
HTTP 请求
    │
    ▼
JwtAuthFilter.doFilterInternal()
    │
    ├─ 提取 Authorization: Bearer <token>
    │
    ├─ JwtTokenProvider.validateToken(token)
    │     ├─ 验证签名
    │     ├─ 验证过期时间
    │     └─ 提取 username
    │
    ├─ UserDetailsServiceImpl.loadUserByUsername(username)
    │
    ├─ 设置 SecurityContextHolder
    │
    └─ chain.doFilter() → 进入 Controller
```

---

## 6. 安全设计

### 6.1 JWT 设计

| 项目 | 配置 |
|------|------|
| 算法 | HMAC-SHA256 |
| 密钥 | Base64 编码，至少 32 字节 |
| 有效期 | 24 小时（86400000 ms） |
| Payload | sub: username, iat, exp |

### 6.2 密码安全

- 使用 `BCryptPasswordEncoder` 进行哈希存储
- 验证时通过 `passwordEncoder.matches()` 比对
- 不存储明文密码，不可逆

### 6.3 CORS 配置

```java
// SecurityConfig.java
allowedOriginPatterns: "http://localhost:*"
allowedMethods: GET, POST, PUT, DELETE, OPTIONS
allowedHeaders: *
allowCredentials: true
```

### 6.4 接口权限矩阵

| 接口 | 认证要求 |
|------|---------|
| POST /api/auth/register | 公开 |
| POST /api/auth/login | 公开 |
| OPTIONS /* | 公开（CORS 预检） |
| 所有其他接口 | Bearer Token 必填 |

### 6.5 数据隔离

- `ConversationRepository.findByUserOrderByUpdatedAtDesc(user)` 确保只查询当前用户的对话
- `deleteConversation` 删除前验证对话所属用户
- 无管理员角色，所有操作仅限当前认证用户

---

## 7. 异常处理设计

### 7.1 全局异常处理器

`GlobalExceptionHandler` 捕获以下异常并返回结构化错误响应：

| 异常类型 | HTTP 状态码 | 响应体 |
|---------|------------|--------|
| 用户名已存在 | 400 | `{"message": "用户名已存在"}` |
| 邮箱已存在 | 400 | `{"message": "邮箱已存在"}` |
| 认证失败 | 401 | `{"message": "用户名或密码错误"}` |
| 资源不存在 | 404 | `{"message": "对话不存在"}` |
| 无权访问 | 403 | `{"message": "无权访问此对话"}` |
| 文件类型不支持 | 400 | `{"message": "不支持的文件类型"}` |
| 其他运行时异常 | 500 | `{"message": "服务器内部错误"}` |

### 7.2 SSE 异常处理

```java
// ChatService 中的错误处理
subscriber.onError(error -> {
    emitter.send(SseEmitter.event()
        .data("{\"type\":\"error\",\"message\":\"" + error.getMessage() + "\"}"));
    emitter.complete();
});
```

---

## 8. 前端架构设计

### 8.1 状态管理

App.jsx 通过 React Hooks 统一管理所有状态：

#### 认证状态

| 状态 | 类型 | 说明 |
|------|------|------|
| token | String / null | JWT Token，null 表示未登录 |
| username | String | 当前登录用户名 |
| authMode | 'login' / 'register' | 当前认证表单类型 |
| authLoading | Boolean | 表单提交中 |
| authError | String | 认证错误信息 |

#### 聊天状态

| 状态 | 类型 | 说明 |
|------|------|------|
| conversations | Array | 对话列表 |
| currentConvId | Long / null | 当前对话 ID |
| messages | Array | 当前对话消息列表 |
| input | String | 输入框内容 |
| isStreaming | Boolean | SSE 流是否进行中 |
| lastUserContent | String | 最后一条用户消息内容（用于重新生成） |

#### 文件状态

| 状态 | 类型 | 说明 |
|------|------|------|
| attachedFiles | Array | 已上传附件列表 `[{filename, content}]` |
| isUploading | Boolean | 文件上传中 |

### 8.2 API 层设计

`src/api/index.js` 封装所有 HTTP 请求：

```javascript
// Token 管理
getToken()               // 从 localStorage 读取
setToken(token)          // 写入 localStorage
removeToken()            // 清除 localStorage

// 带认证的 fetch 封装
authFetch(url, options)  // 自动附加 Authorization 头

// 业务接口
login(username, password)
register(username, email, password)
getConversations()
getMessages(conversationId)
deleteConversation(id)
uploadFile(file)
streamChat(conversationId, content, onDelta, onDone, onError)
```

### 8.3 SSE 客户端实现

```javascript
// streamChat 核心逻辑
const response = await authFetch('/api/chat/stream', { method: 'POST', body });
const reader = response.body.getReader();
const decoder = new TextDecoder();

// 读取流
while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value);
  // 解析 "data: {...}\n\n" 格式
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const event = JSON.parse(line.slice(6));
      if (event.type === 'content') onDelta(event.delta);
      if (event.type === 'done') onDone(event.conversationId);
      if (event.type === 'error') onError(event.message);
    }
  }
}
```

---

## 9. 配置说明

### 9.1 后端配置（application.yml）

```yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/llm_chat
    username: ${DB_USERNAME:root}
    password: ${DB_PASSWORD:password}
    driver-class-name: com.mysql.cj.jdbc.Driver
  jpa:
    hibernate:
      ddl-auto: update      # 生产环境应改为 validate
    show-sql: false
  servlet:
    multipart:
      max-file-size: 10MB
  mvc:
    async:
      request-timeout: 200000  # 200 秒

server:
  port: 8081

jwt:
  secret: <base64-encoded-32-byte-key>
  expiration: 86400000   # 24 小时

deepseek:
  api-key: ${DEEPSEEK_API_KEY}
  api-url: https://api.deepseek.com/chat/completions
  model: deepseek-chat
```

### 9.2 前端配置（vite.config.js）

```javascript
// 开发环境代理（可选）
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8081',
      changeOrigin: true
    }
  }
}
```

---

## 10. 部署架构

### 10.1 开发环境

```
本地开发机
├── 前端开发服务器：http://localhost:5173 (Vite HMR)
├── 后端服务：http://localhost:8081
└── MySQL：localhost:3306/llm_chat
```

### 10.2 构建流程

#### 前端构建

```bash
cd frontend
npm install
npm run build    # 输出到 dist/ 目录
```

#### 后端构建

```bash
cd backend
mvn clean package -DskipTests
# 输出：target/llm-chat-*.jar
```

### 10.3 生产环境部署（单机）

```
服务器
├── Nginx
│   ├── / → 前端静态文件 (dist/)
│   └── /api → 代理到 8081
└── Spring Boot JAR：localhost:8081
    └── 连接 MySQL 数据库
```

---

## 11. 关键设计决策

### 11.1 为什么使用 SSE 而非 WebSocket

- SSE 是单向服务器推送，适合 AI 流式输出场景
- 比 WebSocket 实现简单，基于 HTTP 协议
- Spring 的 `SseEmitter` 原生支持，与 Spring Security 集成良好

### 11.2 为什么使用 WebFlux WebClient 调用 DeepSeek

- 需要非阻塞处理 DeepSeek 的流式响应（`Flux<String>`）
- `RestTemplate` 不支持响应式流，`WebClient` 是 Spring 官方推荐的异步客户端
- 允许在 Tomcat 线程上进行非阻塞 I/O，提升并发性能

### 11.3 历史消息限制 40 条

- 平衡 DeepSeek API 的 Token 消耗成本与上下文完整性
- 每次调用携带最近 40 条（约 20 轮对话），通常足够理解上下文
- 超过此限制的早期消息不再发送给 AI，但仍保存在数据库中

### 11.4 前端使用原生 fetch + SSE 而非 EventSource

- `EventSource` API 不支持自定义请求头（无法传递 JWT）
- 使用 `fetch` + `ReadableStream` 可以完全控制请求，包括认证头
- 同样支持流式读取，与 SSE 格式完全兼容

---

## 12. 待优化项

| 优先级 | 问题 | 建议方案 |
|--------|------|---------|
| 高 | DeepSeek API Key 硬编码在配置文件 | 使用环境变量 `${DEEPSEEK_API_KEY}` |
| 高 | JWT Secret 硬编码 | 使用环境变量，密钥长度至少 32 字节 |
| 高 | ddl-auto: update 不适合生产 | 使用 Flyway/Liquibase 做数据库迁移 |
| 中 | 无请求频率限制 | 添加接口限流（令牌桶或滑动窗口）|
| 中 | 消息数量无上限 | 实现分页加载历史消息 |
| 低 | 前端无 TypeScript | 迁移至 TypeScript 提升可维护性 |
| 低 | 无单元测试 | 补充 Service 层单元测试 |
