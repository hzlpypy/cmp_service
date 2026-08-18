import { useState, useEffect, useRef, useCallback } from 'react'
import { message, Button } from 'antd'
import { WS_URL } from '../api'

/** 报告缓存：按 dashboardId 存储已生成的报告 */
const reportCache: Map<string, string> = new Map()

interface ReportModalProps {
  dashboardId: string
  dashboardTitle: string
  /** 面板摘要，格式与 AI Chat Dialog 相同 */
  panelsSummary: Array<{ id: string; title: string; type: string; targets?: Array<{ refId: string; rawSql: string }> }>
  onClose: () => void
}

export default function ReportModal({ dashboardId, dashboardTitle, panelsSummary, onClose }: ReportModalProps) {
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState('')
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reportRef = useRef('')
  const startedRef = useRef(false)
  const contentRef = useRef<HTMLDivElement | null>(null)

  /** 自动滚动到底部 */
  const scrollToBottom = useCallback(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    // 防止 React StrictMode 双重调用
    if (startedRef.current) return
    startedRef.current = true

    // 检查缓存：如果有已生成的报告，直接显示
    const cached = reportCache.get(dashboardId)
    if (cached) {
      setReport(cached)
      reportRef.current = cached
      setLoading(false)
      return
    }

    generateReport()

    return () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close()
      }
    }
  }, [])

  const generateReport = () => {
    setLoading(true)
    setError(null)
    setReport('')
    reportRef.current = ''

    // 1. 构建提示词（与 AIChatDialog.buildContextMessage 格式一致 + 报告指令）
    const panelList = panelsSummary.map((p, i) => ({
      idx: i,
      id: p.id || '',
      title: p.title || '',
      type: p.type || '',
      targets: (p.targets || []).map((t: any) => ({
        refId: t.refId,
        rawSql: t.rawSql || '',
      })),
    }))
    const summary = `${panelList.length} 个面板: ${JSON.stringify(panelList)}`

    const prompt = [
      `【仪表板上下文】`,
      `仪表板ID: ${dashboardId}`,
      `标题: ${dashboardTitle}`,
      summary,
      `---`,
      `【用户指令】请基于当前仪表板的所有面板数据，生成一份专业的分析报告。`,
      `要求：`,
      `1. 数据概览和关键发现`,
      `2. 趋势分析（如适用）`,
      `3. 异常点和重要变化`,
      `4. 建议和结论`,
      `请使用 Markdown 格式，中文输出，清晰易读。`,
    ].join('\n')

    // 2. 连接 WebSocket 并发送
    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'chat', message: prompt }))
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          // 忽略心跳
          if (data.type === 'heartbeat') return

          // 检测 end 消息：代表已全部完成，一次性展示报告
          if (data.type === 'end') {
            if (reportRef.current) {
              reportCache.set(dashboardId, reportRef.current)
              setReport(reportRef.current)
              setLoading(false)
              scrollToBottom()
            }
            return
          }

          const chunk: string = data.message || ''
          const category: string = data.msg_category || ''

          // 只收集 model 类型的内容
          if (category !== 'model' || !chunk) return

          // 只累积数据，不实时显示（block 模式：接收完后一次性展示）
          reportRef.current += chunk
        } catch {
          // 非 JSON，忽略
        }
      }

      ws.onerror = () => {
        if (!reportRef.current) {
          setError(`WebSocket 连接异常，请确认 AI Agent 已启动 (${WS_URL})`)
        }
        setLoading(false)
      }

      ws.onclose = () => {
        if (reportRef.current) {
          // 接收完成，一次性显示完整报告
          reportCache.set(dashboardId, reportRef.current)
          setReport(reportRef.current)
          setLoading(false)
          scrollToBottom()
        } else if (!error) {
          setLoading(false)
          setError('连接已关闭，未收到报告内容。请检查 AI Agent 是否正常运行。')
        }
      }
    } catch (e: any) {
      setError(e.message || '生成报告失败')
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!report) return
    const cleaned = cleanReport(report)
    const blob = new Blob([cleaned], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${dashboardTitle || '仪表板'}-分析报告.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleCopy = () => {
    if (!report) return
    navigator.clipboard.writeText(cleanReport(report)).then(() => {
      message.success('已复制到剪贴板')
    })
  }

  const handleRetry = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close()
    }
    reportRef.current = ''
    reportCache.delete(dashboardId)
    setReport('')
    generateReport()
  }

  /**
   * 清理报告内容：去除 agent 的思考过程前缀和收尾话语。
   * Agent 思考过程通常以中文口语化表达开头，最终报告以 Markdown 标题开始。
   */
  const cleanReport = (content: string): string => {
    const lines = content.split('\n')
    const thinkPatterns = /^(我来|首先|现在|让我|基于|接下来|接下去|下面|以下|好的|收到|了解了|明白了|已经|所有|全部|我需要|我将|现在开始|连接成功)/

    // 找到第一个 Markdown 标题行，去掉之前的所有行
    let startIdx = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      // 跳过空行和思考过程行
      if (!line || thinkPatterns.test(line)) {
        startIdx = i + 1
        continue
      }
      // 找到第一个有实际内容的行，从这里开始
      if (line.startsWith('#') || line.startsWith('- ') || line.startsWith('* ') || line.startsWith('|') || line.startsWith('> ') || /^\d+\./.test(line)) {
        startIdx = i
        break
      }
      // 其他非思考行也作为开始
      if (!thinkPatterns.test(line) && line.length > 3) {
        startIdx = i
        break
      }
    }

    return lines.slice(startIdx).join('\n').trim()
  }
  const renderMarkdown = (content: string) => {
    // 去掉 agent 的思考过程前缀：跳过前置的非标记语言行
    const lines = cleanReport(content).split('\n')
    return lines.map((line, i) => {
      if (line.startsWith('### ')) {
        return <h4 key={i} style={{ margin: '16px 0 8px', fontSize: 16, fontWeight: 600 }}>{line.slice(4)}</h4>
      }
      if (line.startsWith('## ')) {
        return <h3 key={i} style={{ margin: '20px 0 10px', fontSize: 18, fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: 4 }}>{line.slice(3)}</h3>
      }
      if (line.startsWith('# ')) {
        return <h2 key={i} style={{ margin: '24px 0 12px', fontSize: 20, fontWeight: 700 }}>{line.slice(2)}</h2>
      }
      if (line.startsWith('> ')) {
        return (
          <div key={i} style={{
            borderLeft: '3px solid var(--primary)', paddingLeft: 12,
            color: 'var(--text-secondary)', fontStyle: 'italic', margin: '8px 0',
          }}>
            {line.slice(2)}
          </div>
        )
      }
      if (line.match(/^[\s]*[-*]\s/)) {
        return <div key={i} style={{ paddingLeft: 20, lineHeight: 1.8 }}>{renderInline(line.replace(/^[\s]*[-*]\s/, ''))}</div>
      }
      if (line.match(/^\d+\.\s/)) {
        return <div key={i} style={{ paddingLeft: 20, lineHeight: 1.8 }}>{renderInline(line.replace(/^\d+\.\s/, ''))}</div>
      }
      if (line.trim() === '---') {
        return <hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '12px 0' }} />
      }
      if (line.startsWith('|')) {
        const isHeader = line.includes('---')
        if (isHeader) return null
        const cells = line.split('|').filter(c => c.trim() !== '')
        return (
          <tr key={i}>
            {cells.map((cell, ci) => (
              <td key={ci} style={{
                padding: '4px 8px', border: '1px solid var(--border-color)',
                fontSize: 12, background: 'var(--bg-input)',
              }}>
                {renderInline(cell.trim())}
              </td>
            ))}
          </tr>
        )
      }
      if (line.trim() === '') {
        return <div key={i} style={{ height: 8 }} />
      }
      return <p key={i} style={{ lineHeight: 1.7, margin: '4px 0' }}>{renderInline(line)}</p>
    })
  }

  const renderInline = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>
      }
      const codeParts = part.split(/(`.*?`)/g)
      return codeParts.map((cp, j) => {
        if (cp.startsWith('`') && cp.endsWith('`')) {
          return <code key={`${i}-${j}`} style={{
            background: 'var(--bg-input)', padding: '1px 4px', borderRadius: 3, fontSize: 12,
          }}>{cp.slice(1, -1)}</code>
        }
        return <span key={`${i}-${j}`}>{cp}</span>
      })
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'var(--bg-primary, #1a1a2e)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* 顶部导航栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 20px', borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary, #16213e)', flexShrink: 0,
      }}>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--text-secondary)',
          cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center',
        }} title="返回">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
            <path d="M11 3L5 9l6 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, flex: 1 }}>
          {dashboardTitle} - 分析报告
        </h2>
        {report && !loading && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="primary" size="small" onClick={handleDownload}>下载报告 (.md)</Button>
            <Button size="small" onClick={handleCopy}>复制内容</Button>
            <Button size="small" onClick={handleRetry}>重新生成</Button>
          </div>
        )}
      </div>

      {/* 内容区 */}
      <div ref={contentRef} style={{ flex: 1, overflow: 'auto', padding: '24px 48px' }}>
        {error && !report ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div style={{ color: 'var(--danger)', marginBottom: 16 }}>{error}</div>
            <Button type="primary" onClick={handleRetry}>重试</Button>
          </div>
        ) : (
          <>
            {/* 报告内容 */}
            {report && (
              <div style={{
                maxWidth: 900, margin: '0 auto',
                fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6,
              }}>
                {renderMarkdown(report)}
              </div>
            )}

            {/* AI生成中指示器：loading 时始终显示 */}
            {loading && (
              <div style={{
                textAlign: 'center', padding: report ? '16px 0' : 80, color: 'var(--text-muted)', fontSize: 12,
                maxWidth: 900, margin: '0 auto',
              }}>
                {!report && (
                  <div style={{
                    width: 40, height: 40, border: '3px solid var(--border-color)',
                    borderTopColor: 'var(--primary)', borderRadius: '50%',
                    animation: 'spin 1s linear infinite', margin: '0 auto 16px',
                  }} />
                )}
                <span style={{
                  display: 'inline-block', width: 8, height: 8,
                  background: 'var(--primary)', borderRadius: '50%',
                  animation: 'pulse 1s ease-in-out infinite', marginRight: 8,
                }} />
                AI 正在生成中...
                <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }`}</style>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
