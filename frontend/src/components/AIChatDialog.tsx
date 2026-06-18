import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import * as api from '../api'

interface AIChatDialogProps {
  /** 当前仪表板 ID */
  dashboardId: string
  /** 当前仪表板标题 */
  dashboardTitle: string
  /** 当前面板列表摘要，供 AI 上下文使用 */
  panelsSummary: Array<{ id: string; title: string; type: string }>
  /** 当前草稿 dashboard_json，用于合并 agent 返回的 panel 变更 */
  draftJson: any
  /** 接收合并后的 dashboard_json 草稿，触发界面刷新 */
  onDraftUpdate: (dashboardJson: any) => void
  /** WebSocket 服务地址 */
  wsUrl?: string
  /** 对话窗口是否可见，用于控制 WebSocket 连接 */
  visible?: boolean
}

/** 聊天消息 */
interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  /** 消息类别：model=模型输出, reasoning=思考过程, toolcallchunk=tool */
  category?: 'model' | 'reasoning' | 'toolcallchunk'
  /** 是否在执行 update_draft 指令 */
  applied?: boolean
  /** 附件列表 */
  attachments?: Array<{ name: string; path: string }>
  /** 思考/tool调用是否折叠（reasoning 和 toolcallchunk 默认折叠） */
  collapsed?: boolean
}

/**
 * 尝试从文本中提取 update_draft 指令。
 * agent 返回格式（新）：
 *   {"action": "update_draft", "panels": [...], "message": "..."}
 * 兼容旧格式：
 *   {"action": "update_draft", "dashboard_json": {"panels": [...]}, "message": "..."}
 */
function tryExtractCommand(text: string): { panels?: any[]; dashboard_json?: any; message: string } | null {
  const re = /\{\s*"action"\s*:\s*"update_draft"[^}]*\}[\s\S]*$/
  const m = text.match(re)
  if (!m) return null

  const start = m.index!
  let depth = 0, end = start
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) { end = i + 1; break }
    }
  }
  if (depth !== 0) return null

  try {
    const obj = JSON.parse(text.slice(start, end))
    if (obj.action === 'update_draft') {
      if (obj.panels && Array.isArray(obj.panels)) {
        return { panels: obj.panels, message: obj.message || '' }
      }
      if (obj.dashboard_json) {
        return { dashboard_json: obj.dashboard_json, message: obj.message || '' }
      }
    }
  } catch { /* ignore */ }
  return null
}

/** 生成确定性面板 ID（基于标题） */
function generateDeterministicId(title: string): string {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    const c = title.charCodeAt(i)
    hash = ((hash << 5) - hash) + c
    hash |= 0
  }
  return `panel-gen-${Math.abs(hash)}`
}

/**
 * 将 agent 返回的 panels 合并到当前 draftJson 中。
 * - 已有 id 的面板：按 id 替换
 * - 无 id 的面板：基于 title 生成确定性 id，若已存在则替换，否则追加
 */
function mergePanels(draftJson: any, newPanels: any[]) {
  const dj = JSON.parse(JSON.stringify(draftJson)) // 深拷贝
  const existingPanels: any[] = dj.panels || []

  for (const np of newPanels) {
    const panelId = np.id || generateDeterministicId(np.title || '')
    const idx = existingPanels.findIndex((p: any) => p.id === panelId)

    if (idx >= 0) {
      // 已存在 → 合并更新
      existingPanels[idx] = {
        ...existingPanels[idx],
        ...np,
        id: panelId,
        // targets 完全替换（agent 返回完整 targets）
        targets: np.targets || existingPanels[idx].targets,
        // options 深合并：AI 只传要改的 option 字段，保留其余
        options: np.options != null
          ? { ...(existingPanels[idx].options || {}), ...np.options }
          : existingPanels[idx].options,
      }
    } else {
      // 新面板
      const newPanel = { ...np, id: panelId }
      if (!newPanel.gridPos) {
        const maxY = existingPanels.reduce((max: number, p: any) =>
          Math.max(max, (p.gridPos?.y || 0) + (p.gridPos?.h || 8)), 0)
        newPanel.gridPos = { x: 0, y: maxY, w: 24, h: 8 }
      }
      existingPanels.push(newPanel)
    }
  }

  dj.panels = existingPanels
  return dj
}

const DEFAULT_WS_URL = 'ws://127.0.0.1:8764'

const ALLOWED_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx', '.xlsx', '.jpg', '.jpeg', '.png']

export default function AIChatDialog({
  dashboardId,
  dashboardTitle,
  panelsSummary,
  draftJson,
  onDraftUpdate,
  wsUrl = DEFAULT_WS_URL,
  visible = true,
}: AIChatDialogProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const isUserScrolledUp = useRef(false)
  const scrollRAF = useRef<number | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 附件上传状态
  const [attachments, setAttachments] = useState<Array<{ name: string; path: string; uploading: boolean }>>([])

  // 流式消息累积
  const streamRef = useRef<{
    currentTokenId: string | null
    currentCategory: string | null
    content: string
    msgIndex: number
    draftApplied: boolean
  }>({ currentTokenId: null, currentCategory: null, content: '', msgIndex: -1, draftApplied: false })

  // 始终保持最新的 draftJson 引用
  const draftRef = useRef(draftJson)
  useEffect(() => { draftRef.current = draftJson }, [draftJson])

  // 检测用户是否手动滚离底部
  const handleScroll = useCallback(() => {
    const el = chatContainerRef.current
    if (!el) return
    isUserScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight > 50
  }, [])

  const scrollToBottom = useCallback((force = false) => {
    if (scrollRAF.current) cancelAnimationFrame(scrollRAF.current)
    scrollRAF.current = requestAnimationFrame(() => {
      if (isUserScrolledUp.current && !force) return
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
    })
  }, [])
  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  // 连接 WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        setMessages((prev) => {
          if (prev.length > 0 && prev[prev.length - 1].role === 'system') return prev
          return prev
        })
      }

      ws.onmessage = (event) => {
        setLoading(false)
        try {
          const data = JSON.parse(event.data)
          handleStreamChunk(data)
        } catch {
          // 非 JSON，忽略
        }
      }

      ws.onerror = (e) => {
        console.error('WebSocket error:', e)
        setConnected(false)
        setLoading(false)
        setMessages((prev) => [...prev, {
          role: 'system',
          content: 'WebSocket 连接异常，请确认后端已启动 (ws://127.0.0.1:8764)',
        }])
      }

      ws.onclose = () => {
        finalizeSegment()
        setConnected(false)
        setLoading(false)
        reconnectTimerRef.current = setTimeout(() => connect(), 5000)
      }
    } catch {
      setConnected(false)
    }
  }, [wsUrl])

  /**
   * 渐进式检测并应用 update_draft 指令。
   * 不依赖 token_id 变化或 WS 关闭，每收到 chunk 就尝试检测。
   */
  const tryApplyDraft = (content: string, msgIdx: number) => {
    // 去重：当前 token 段已应用过则跳过
    if (streamRef.current.draftApplied) return false
    if (!content.includes('update_draft')) return false

    const cmd = tryExtractCommand(content)
    if (!cmd) return false

    streamRef.current.draftApplied = true

    if (cmd.panels) {
      const updated = mergePanels(draftRef.current, cmd.panels)
      draftRef.current = updated // 同步更新 ref，避免陈旧闭包
      onDraftUpdate(updated)
    } else if (cmd.dashboard_json) {
      draftRef.current = cmd.dashboard_json
      onDraftUpdate(cmd.dashboard_json)
    }

    setMessages((prev) => {
      const updated = [...prev]
      if (msgIdx >= 0 && msgIdx < updated.length) {
        const textOnly = content.replace(/\{[\s\S]*\}$/, '').trim()
        updated[msgIdx] = {
          ...updated[msgIdx],
          content: cmd.message || textOnly || '面板已更新',
          applied: true,
        }
      }
      return updated
    })
    return true
  }

  /**
   * 处理流式消息块。
   * 协议：{ token_id, type, message, msg_category, time, client_id }
   * msg_category: model=模型输出, reasoning=思考过程, toolcallchunk=tool
   * token_id 或 msg_category 变化时创建新消息。
   */
  const handleStreamChunk = (data: any) => {
    // 过滤心跳包及其他非流式消息
    if (data.type === 'heartbeat') return

    const tokenId: string = data.token_id || ''
    const chunk: string = data.message || ''
    const category: string = data.msg_category || 'model'

    // 无内容的不处理
    if (!tokenId || !chunk) return
    const s = streamRef.current

    // token_id 变化 → 前一段完成
    if (s.currentTokenId && tokenId !== s.currentTokenId) {
      tryApplyDraft(s.content, s.msgIndex)
    }

    // 新 token_id 或 category 变化 → 新建消息
    if (!s.currentTokenId || tokenId !== s.currentTokenId || category !== s.currentCategory) {
      s.currentTokenId = tokenId
      s.currentCategory = category
      s.content = chunk
      s.draftApplied = false
      setMessages((prev) => {
        s.msgIndex = prev.length
        return [...prev, {
          role: 'assistant' as const,
          content: chunk,
          category: category as ChatMessage['category'],
          collapsed: category === 'reasoning' || category === 'toolcallchunk',
        }]
      })
      return
    }

    // 同一段：累积
    s.content += chunk
    setMessages((prev) => {
      const updated = [...prev]
      if (s.msgIndex >= 0 && s.msgIndex < updated.length) {
        updated[s.msgIndex] = { ...updated[s.msgIndex], content: s.content }
      }
      return updated
    })

    // 渐进式检测
    tryApplyDraft(s.content, s.msgIndex)
  }

  /** 一段 token 流结束时，尝试提取 update_draft 指令并合并面板 */
  const finalizeSegment = () => {
    const s = streamRef.current
    if (!s.currentTokenId) return
    tryApplyDraft(s.content, s.msgIndex)
    s.currentTokenId = null
    s.currentCategory = null
    s.content = ''
    s.msgIndex = -1
  }

  useEffect(() => {
    setMessages([])
  }, [dashboardId])

  useEffect(() => {
    if (visible) {
      connect()
    } else {
      // 隐藏时断开 WebSocket，避免长时间闲置连接
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
      setConnected(false)
    }
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (scrollRAF.current) cancelAnimationFrame(scrollRAF.current)
      wsRef.current?.close()
    }
  }, [connect, visible])

  /** 构建带完整面板上下文的消息 */
  const buildContextMessage = (userText: string) => {
    const panels = draftRef.current?.panels || panelsSummary
    const panelList = panels.map((p: any, i: number) => ({
      idx: i,
      id: p.id || '',
      title: p.title || '',
      type: p.type || '',
      datasource_id: p.datasource_id || '',
      targets: (p.targets || []).map((t: any) => ({
        refId: t.refId,
        rawSql: t.rawSql || '',
        metricName: t.metricName || '',
        aliasMap: t.aliasMap || {},
      })),
    }))
    const count = panelList.length
    const summary = `${count} 个面板: ${JSON.stringify(panelList)}`

    return [
      `【仪表盘上下文】`,
      `仪表盘ID: ${dashboardId}`,
      `标题: ${dashboardTitle}`,
      summary,
      `---`,
      `【用户指令】${userText}`,
    ].join('\n')
  }

  // ---- 文件上传 ----
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setMessages((prev) => [...prev, {
          role: 'system',
          content: `不支持的文件类型: ${file.name}。支持的类型: ${ALLOWED_EXTENSIONS.join(', ')}`,
        }])
        continue
      }

      // 添加文件到附件列表（上传中状态）
      setAttachments((prev) => [...prev, { name: file.name, path: '', uploading: true }])

      try {
        const res = await api.uploadFile(file)
        setAttachments((prev) => prev.map((a) =>
          a.name === file.name && a.uploading ? { name: file.name, path: res.file_path, uploading: false } : a
        ))
      } catch (err: any) {
        setAttachments((prev) => prev.filter((a) => a.name !== file.name || !a.uploading))
        setMessages((prev) => [...prev, {
          role: 'system',
          content: `文件 ${file.name} 上传失败: ${err.message}`,
        }])
      }
    }

    // 重置 input 以支持重新选择同一文件
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAttachment = (name: string) => {
    setAttachments((prev) => prev.filter((a) => a.name !== name))
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text || !connected || loading) return

    // 收集已上传完成的文件路径
    const uploadedPaths = attachments.filter((a) => !a.uploading && a.path).map((a) => a.path)
    const uploadedFiles = attachments.filter((a) => !a.uploading && a.path).map((a) => ({ name: a.name, path: a.path }))

    setMessages((prev) => [...prev, {
      role: 'user',
      content: text,
      attachments: uploadedFiles.length > 0 ? uploadedFiles : undefined,
    }])
    setInput('')
    setLoading(true)

    const contextMsg = buildContextMessage(text)
    const payload: any = {
      type: 'chat',
      message: contextMsg,
    }
    if (uploadedPaths.length > 0) {
      payload.files = uploadedPaths
    }
    wsRef.current?.send(JSON.stringify(payload))

    // 发送后强制滚动到底部并清空附件
    scrollToBottom(true)
    setAttachments([])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const statusColor = connected ? '#52c41a' : '#ff4d4f'
  const statusText = connected ? '已连接' : '未连接'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', maxHeight: '100%',
      background: 'var(--bg-primary)', borderRadius: 4,
      border: '1px solid var(--border-color)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid var(--border-color)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            AI 智能助手
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, color: statusColor,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: statusColor, display: 'inline-block',
            }} />
            {statusText}
          </span>
        </div>
      </div>

      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        style={{
        flex: 1, overflow: 'auto', padding: '10px 14px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {messages.map((msg, i) => {
          const isReasoning = msg.category === 'reasoning'
          const isToolCall = msg.category === 'toolcallchunk'

          return (
          <div key={i} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '88%',
          }}>
            <div style={{
              fontSize: 10, color: 'var(--text-muted)',
              marginBottom: 2,
              textAlign: msg.role === 'user' ? 'right' : 'left',
            }}>
              {msg.role === 'user' ? '你' : msg.role === 'system' ? '系统' : (
                isReasoning ? '思考过程' : isToolCall ? 'tool' : 'AI'
              )}
            </div>

            {/* tool & 思考过程：可折叠，默认收起，显示首行预览 */}
            {(isToolCall || isReasoning) ? (
              <div>
                <button
                  onClick={() => {
                    setMessages((prev) => {
                      const updated = [...prev]
                      updated[i] = { ...updated[i], collapsed: !updated[i].collapsed }
                      return updated
                    })
                  }}
                  style={{
                    background: isToolCall ? '#fff7e6' : '#f5f5f5',
                    border: `1px solid ${isToolCall ? '#ffd591' : '#d9d9d9'}`,
                    borderRadius: 8, padding: '6px 12px',
                    cursor: 'pointer', width: '100%', textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: isToolCall ? '#d46b08' : '#8c8c8c' }}>
                      {msg.collapsed ? '▶' : '▼'}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: isToolCall ? '#d46b08' : '#595959' }}>
                      {isToolCall ? 'tool' : '思考过程'}
                    </span>
                  </div>
                  {msg.collapsed && (
                    <div style={{
                      marginTop: 4, fontSize: 11, color: '#999',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}>
                      {msg.content.split('\n')[0].slice(0, 80) || '(空)'}
                    </div>
                  )}
                </button>
                {!msg.collapsed && (
                  <div style={{
                    marginTop: 4, padding: '8px 12px', borderRadius: 8,
                    background: isToolCall ? '#fffbe6' : '#fafafa',
                    border: `1px solid ${isToolCall ? '#ffe58f' : '#e8e8e8'}`,
                    fontSize: 12, lineHeight: 1.6, color: isToolCall ? '#8c6900' : '#595959',
                    maxHeight: 300, overflow: 'auto',
                  }}>
                    <div className="chat-markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* 模型输出：Markdown 渲染 */
              <div style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 13,
                lineHeight: 1.6,
                ...(msg.role === 'user' ? {
                  background: 'var(--primary)', color: '#fff',
                } : msg.role === 'system' ? {
                  background: '#fff3cd', color: '#856404',
                } : {
                  background: 'var(--bg-input)', color: 'var(--text-primary)',
                }),
              }}>
                {/* 附件显示 */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                    {msg.attachments.map((att) => (
                      <div key={att.name} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        padding: '2px 6px', fontSize: 11,
                        background: msg.role === 'user' ? 'rgba(255,255,255,0.2)' : '#e6f7ff',
                        borderRadius: 4,
                      }}>
                        <span>📎</span>
                        <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {att.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {msg.role === 'user' ? msg.content : (
                  <div className="chat-markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            )}

            {msg.applied && (
              <div style={{
                fontSize: 10, color: '#52c41a',
                marginTop: 4, display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span>&#10003;</span> 面板配置已更新
              </div>
            )}
          </div>
        )})}

        {loading && (
          <div style={{
            alignSelf: 'flex-start', padding: '8px 12px',
            borderRadius: 8, background: 'var(--bg-input)',
            fontSize: 13, color: 'var(--text-muted)',
          }}>
            AI 正在思考...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div style={{
        display: 'flex', gap: 8, padding: '10px 14px',
        borderTop: '1px solid var(--border-color)', flexShrink: 0,
        flexDirection: 'column',
      }}>
        {/* 附件列表 */}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {attachments.map((att) => (
              <div
                key={att.name}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px',
                  fontSize: 11,
                  background: att.uploading ? 'var(--bg-input)' : '#e6f7ff',
                  border: `1px solid ${att.uploading ? 'var(--border-color)' : '#91d5ff'}`,
                  borderRadius: 4,
                  color: 'var(--text-primary)',
                }}
              >
                <span style={{ color: att.uploading ? 'var(--text-muted)' : '#1890ff' }}>
                  {att.uploading ? '⏳' : '📎'}
                </span>
                <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {att.name}
                </span>
                {!att.uploading && (
                  <button
                    onClick={() => removeAttachment(att.name)}
                    style={{
                      background: 'none', border: 'none',
                      cursor: 'pointer', padding: 0,
                      fontSize: 12, color: '#999',
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_EXTENSIONS.join(',')}
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          {/* 上传附件按钮 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!connected || loading}
            title="上传附件"
            style={{
              padding: '6px 8px', fontSize: 16,
              background: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: 4, cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            📎
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={connected ? '描述你想做的修改...' : '正在连接...'}
            disabled={!connected || loading}
            rows={2}
            style={{
              flex: 1, resize: 'none',
              padding: '6px 10px', fontSize: 13,
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 4, outline: 'none',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!connected || loading || !input.trim()}
            style={{
              alignSelf: 'flex-end',
              padding: '6px 14px', fontSize: 13, fontWeight: 500,
              background: connected && input.trim() ? 'var(--primary)' : 'var(--bg-input)',
              color: connected && input.trim() ? '#fff' : 'var(--text-muted)',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              cursor: connected && input.trim() ? 'pointer' : 'default',
            }}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}
