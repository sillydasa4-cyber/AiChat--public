import { useState, useEffect, useRef } from 'react'
import MarkdownIt from 'markdown-it'
import * as api from './api'
import './App.css'

const md = new MarkdownIt()

export default function App() {
  // ── Auth state ───────────────────────────────────────────────────────
  const [token, setToken] = useState(api.getToken())
  const [username, setUsername] = useState('')
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ username: '', email: '', password: '' })
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // ── Chat state ────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState([])
  const [currentConvId, setCurrentConvId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState([]) // [{filename, content}]
  const [isUploading, setIsUploading] = useState(false)
  const [lastUserContent, setLastUserContent] = useState('') // 用于重新生成

  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const abortRef = useRef(null) // 当前流的 AbortController

  // ── Effects ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (token) loadConversations()
  }, [token])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Auth handlers ─────────────────────────────────────────────────────
  const handleAuth = async (e) => {
    e.preventDefault()
    setAuthError('')
    setAuthLoading(true)
    try {
      let result
      if (authMode === 'login') {
        result = await api.login(authForm.username, authForm.password)
      } else {
        result = await api.register(authForm.username, authForm.email, authForm.password)
      }
      api.setToken(result.token)
      setToken(result.token)
      setUsername(result.username)
    } catch (e) {
      setAuthError(e.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = () => {
    api.removeToken()
    setToken(null)
    setUsername('')
    setConversations([])
    setMessages([])
    setCurrentConvId(null)
  }

  // ── Conversation handlers ─────────────────────────────────────────────
  const loadConversations = async () => {
    try {
      setConversations(await api.getConversations())
    } catch (e) {
      if (e.message === 'Unauthorized') handleLogout()
    }
  }

  const selectConversation = async (convId) => {
    if (isStreaming) return
    setCurrentConvId(convId)
    try {
      const msgs = await api.getMessages(convId)
      setMessages(msgs.map((m) => ({
        id: m.id,
        text: m.content,
        sender: m.role === 'USER' ? 'user' : 'ai',
      })))
    } catch (e) {
      console.error(e)
    }
  }

  const startNewChat = () => {
    if (isStreaming) return
    setCurrentConvId(null)
    setMessages([])
    textareaRef.current?.focus()
  }

  const handleDelete = async (e, convId) => {
    e.stopPropagation()
    await api.deleteConversation(convId)
    if (currentConvId === convId) startNewChat()
    loadConversations()
  }

  // ── Send message ──────────────────────────────────────────────────────

  // 公共流式请求逻辑（handleSend 和 handleRegenerate 共用）
  const streamResponse = async (convId, content, isRegenerate, onConvCreated) => {
    const controller = new AbortController()
    abortRef.current = controller

    try {
      await api.streamChat(
        convId,
        content,
        // onDelta
        (delta) => {
          setMessages((prev) => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last?.sender === 'ai') {
              updated[updated.length - 1] = { ...last, text: last.text + delta }
            }
            return updated
          })
        },
        // onDone
        (newConvId) => {
          setIsStreaming(false)
          abortRef.current = null
          if (onConvCreated) onConvCreated(newConvId)
        },
        // onError
        (errMsg) => {
          setIsStreaming(false)
          abortRef.current = null
          setMessages((prev) => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last?.sender === 'ai' && last.text === '') {
              updated[updated.length - 1] = { ...last, text: `Error: ${errMsg}` }
            }
            return updated
          })
        },
        controller.signal,
        isRegenerate,
      )
    } catch (e) {
      if (e?.name !== 'AbortError') console.error(e)
      setIsStreaming(false)
      abortRef.current = null
    }
  }

  // 停止当前生成
  const handleStop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
  }

  // 重新生成最后一条 AI 回复
  const handleRegenerate = async () => {
    if (isStreaming || !lastUserContent || !currentConvId) return

    setIsStreaming(true)
    const aiMsgId = Date.now()

    // 移除最后一条 AI 消息，换成新的空占位
    setMessages((prev) => {
      const base = prev[prev.length - 1]?.sender === 'ai' ? prev.slice(0, -1) : prev
      return [...base, { id: aiMsgId, text: '', sender: 'ai' }]
    })

    await streamResponse(currentConvId, lastUserContent, true, null)
  }

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setIsUploading(true)
    try {
      const results = await Promise.all(files.map((f) => api.uploadFile(f)))
      setAttachedFiles((prev) => [...prev, ...results])
    } catch (err) {
      alert('上传失败: ' + err.message)
    } finally {
      setIsUploading(false)
      e.target.value = ''
    }
  }

  const removeAttachment = (index) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSend = async () => {
    const text = input.trim()
    if ((!text && attachedFiles.length === 0) || isStreaming) return

    const files = attachedFiles
    setInput('')
    setAttachedFiles([])
    setIsStreaming(true)

    const userMsgId = Date.now()
    const aiMsgId = userMsgId + 1

    setMessages((prev) => [...prev, { id: userMsgId, text, sender: 'user', files: files.map((f) => f.filename) }])
    setMessages((prev) => [...prev, { id: aiMsgId, text: '', sender: 'ai' }])

    const fileContext = files.map((f) => `[附件: ${f.filename}]\n${f.content}`).join('\n\n')
    const content = fileContext ? `${fileContext}\n\n${text}` : text

    // 保存本次内容，供"重新生成"使用
    setLastUserContent(content)

    await streamResponse(currentConvId, content, false, (newConvId) => {
      if (!currentConvId) {
        setCurrentConvId(newConvId)
        loadConversations()
      }
    })
  }

  // ── Login / Register page ─────────────────────────────────────────────
  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-title">LLM Chat</h1>
          <div className="auth-tabs">
            <button
              className={authMode === 'login' ? 'active' : ''}
              onClick={() => { setAuthMode('login'); setAuthError('') }}
            >Login</button>
            <button
              className={authMode === 'register' ? 'active' : ''}
              onClick={() => { setAuthMode('register'); setAuthError('') }}
            >Register</button>
          </div>
          <form className="auth-form" onSubmit={handleAuth}>
            <input
              type="text"
              placeholder="Username"
              value={authForm.username}
              onChange={(e) => setAuthForm((p) => ({ ...p, username: e.target.value }))}
              required
            />
            {authMode === 'register' && (
              <input
                type="email"
                placeholder="Email"
                value={authForm.email}
                onChange={(e) => setAuthForm((p) => ({ ...p, email: e.target.value }))}
                required
              />
            )}
            <input
              type="password"
              placeholder="Password"
              value={authForm.password}
              onChange={(e) => setAuthForm((p) => ({ ...p, password: e.target.value }))}
              required
            />
            {authError && <p className="auth-error">{authError}</p>}
            <button type="submit" className="auth-submit" disabled={authLoading}>
              {authLoading ? 'Please wait...' : authMode === 'login' ? 'Login' : 'Register'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Main chat page ────────────────────────────────────────────────────
  return (
    <div className="app-layout">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-user">👤 {username}</span>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
        <button className="new-chat-btn" onClick={startNewChat}>＋ New Chat</button>
        <div className="conversation-list">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`conversation-item ${currentConvId === conv.id ? 'active' : ''}`}
              onClick={() => selectConversation(conv.id)}
            >
              <span className="conv-title">{conv.title || 'New Chat'}</span>
              <button className="conv-delete" onClick={(e) => handleDelete(e, conv.id)}>×</button>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="chat-area">
        <div className="chat-header">
          <h2>AI Assistant</h2>
        </div>

        <div className="messages-container">
          {messages.length === 0 && (
            <div className="empty-chat">
              <p>Send a message to start chatting</p>
            </div>
          )}
          {messages.map((msg, index) => (
            <div key={msg.id} className={`message-group ${msg.sender}`}>
              <div className={`message ${msg.sender}`}>
                <div className="message-content">
                  {msg.sender === 'ai' ? (
                    msg.text ? (
                      <div dangerouslySetInnerHTML={{ __html: md.render(msg.text) }} />
                    ) : (
                      <div className="typing-indicator">
                        <span /><span /><span />
                      </div>
                    )
                  ) : (
                    <>
                      {msg.files?.length > 0 && (
                        <div className="msg-file-chips">
                          {msg.files.map((name, i) => (
                            <span key={i} className="msg-file-chip">📄 {name}</span>
                          ))}
                        </div>
                      )}
                      {msg.text && <p>{msg.text}</p>}
                    </>
                  )}
                </div>
              </div>
              {/* 重新生成按钮：仅在最后一条 AI 消息且不在流式输出时显示 */}
              {msg.sender === 'ai' && index === messages.length - 1 && !isStreaming && lastUserContent && currentConvId && (
                <button className="regenerate-button" onClick={handleRegenerate}>↺ 重新生成</button>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.json,.csv,.xml,.js,.ts,.jsx,.tsx,.java,.py,.html,.css,.yaml,.yml,.sh,.log"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <div className="input-wrapper">
            {attachedFiles.length > 0 && (
              <div className="attachment-chips">
                {attachedFiles.map((f, i) => (
                  <span key={i} className="attachment-chip">
                    📄 {f.filename}
                    <button onClick={() => removeAttachment(i)}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="input-row">
              <button
                className="upload-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming || isUploading}
                title="附加文件"
              >
                {isUploading ? '⏳' : '📎'}
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Message... (Enter to send, Shift+Enter for newline)"
                className="message-input"
                disabled={isStreaming}
              />
              {isStreaming ? (
                <button onClick={handleStop} className="stop-button">■ 停止</button>
              ) : (
                <button
                  onClick={handleSend}
                  className="send-button"
                  disabled={!input.trim() && attachedFiles.length === 0}
                >
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
