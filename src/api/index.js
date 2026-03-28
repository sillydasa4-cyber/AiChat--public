const TOKEN_KEY = 'llm_chat_token'

// 后端地址，SSE 流直接连后端，绕过 Vite proxy 的缓冲
const BACKEND = 'http://localhost:8081'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token)
export const removeToken = () => localStorage.removeItem(TOKEN_KEY)

const authHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getToken()}`,
})

// ── Auth ──────────────────────────────────────────────────────────────
export async function login(username, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error((await res.json()).error || 'Login failed')
  return res.json()
}

export async function register(username, email, password) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  })
  if (!res.ok) throw new Error((await res.json()).error || 'Register failed')
  return res.json()
}

// ── Conversations ─────────────────────────────────────────────────────
export async function getConversations() {
  const res = await fetch('/api/conversations', { headers: authHeaders() })
  if (!res.ok) throw new Error('Unauthorized')
  return res.json()
}

export async function getMessages(conversationId) {
  const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to load messages')
  return res.json()
}

export async function deleteConversation(conversationId) {
  const res = await fetch(`/api/conversations/${conversationId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to delete conversation')
}

// ── File Upload ───────────────────────────────────────────────────────
/**
 * 上传文件，返回 { filename, content, size }
 */
export async function uploadFile(file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${BACKEND}/api/files/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${getToken()}` },
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Upload failed')
  }
  return res.json()
}

// ── Chat SSE Stream ───────────────────────────────────────────────────
/**
 * 发送消息并流式接收 AI 回复
 * @param {number|null} conversationId
 * @param {string} content
 * @param {(delta: string) => void} onDelta
 * @param {(conversationId: number) => void} onDone
 * @param {(message: string) => void} onError
 * @param {AbortSignal} [signal]   - 传入可取消流
 * @param {boolean} [regenerate]   - true 时后端不重复写入用户消息
 */
export async function streamChat(conversationId, content, onDelta, onDone, onError, signal, regenerate = false) {
  let res
  try {
    res = await fetch(`${BACKEND}/api/chat/stream`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ conversationId, content, regenerate }),
      signal,
    })
  } catch (e) {
    if (e.name === 'AbortError') return  // 用户主动取消，静默退出
    onError('Network error: ' + e.message)
    return
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    onError(body.error || `HTTP ${res.status}`)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    let readResult
    try {
      readResult = await reader.read()
    } catch (e) {
      if (e.name === 'AbortError') return  // 中断读取，静默退出
      break
    }
    const { done, value } = readResult
    console.log('[SSE] read:', done, value?.length, 'bytes')
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      console.log('[SSE] line:', JSON.stringify(line))
      // 兼容 'data: ' 和 'data:'（Spring 不带空格）
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data) continue

      try {
        const event = JSON.parse(data)
        if (event.type === 'content') onDelta(event.delta)
        else if (event.type === 'done') onDone(event.conversationId)
        else if (event.type === 'error') onError(event.message)
      } catch {
        // 忽略解析失败的片段
      }
    }
  }
}
