import { useState, useEffect, useRef } from 'react'

const WS_URL = 'ws://cmp-llm-svc:8764'

interface AIInsightsProps {
  dashboardId: string
  dashboardTitle: string
  panelsData: Array<{ id: string; title: string; type: string; data?: any[][]; columns?: string[] }>
  panelsConfig: Array<{ id: string; title: string; type: string; targets?: Array<{ refId: string; rawSql: string }> }>
  trigger?: number
  section?: 'risk' | 'plan'
  editable?: boolean
  initialData?: { score?: number; conclusion?: string; risks?: string[]; evaluation?: string; plan?: string }
  onDataChange?: (data: { score: number; conclusion: string; risks: string[]; evaluation: string; plan: string }) => void
}

function cleanLine(line: string): string {
  return line.replace(/\*\*/g, '').replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/<[^>]+>/g, '').trim()
}

function isBulletLine(line: string): string | null {
  const trimmed = line.trim()
  if (/^#{1,6}\s/.test(trimmed)) return null
  if (trimmed.startsWith('|') || /^\s*\|.*\|\s*$/.test(trimmed)) return null
  if (!trimmed) return null
  if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) return cleanLine(trimmed.substring(2))
  const numMatch = trimmed.match(/^\d+[\.、、)]\s*(.+)$/)
  if (numMatch) return cleanLine(numMatch[1])
  return null
}

function extractBullets(content: string): string[] {
  if (!content) return []
  const bullets: string[] = []
  for (const raw of content.split('\n')) {
    const b = isBulletLine(raw)
    if (b && b.length > 2) bullets.push(b)
  }
  return bullets
}

function extractScore(content: string): number {
  if (!content) return 75
  const m = content.match(/分数[:：\s]*(\d+)/i) || content.match(/评分[:：\s]*(\d+)/i) || content.match(/(\d+)\s*分/)
  if (m) {
    const n = parseInt(m[1])
    if (n >= 0 && n <= 100) return n
  }
  return 75
}

function extractShortSummary(content: string): string[] {
  if (!content) return []
  const bullets = extractBullets(content)
  if (bullets.length > 0) return bullets
  const sentences = content.split(/[。.!?！？\n]/).map(s => s.trim()).filter(s => s && s.length > 3)
  const filtered = sentences.filter(s => !/^(分析|以下|以上|综上|总结|数据显示|从)/.test(s))
  return filtered.slice(0, 2)
}

function ScoreCircle({ score, loading }: { score: number; loading: boolean }) {
  const size = 110, stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (score / 100) * c
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e5e7eb" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={loading ? '#94a3b8' : color} strokeWidth={stroke} fill="none" strokeDasharray={`${c} ${c}`} strokeDashoffset={loading ? c : offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }} />
      </svg>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 32, fontWeight: 700, color: loading ? '#94a3b8' : color, lineHeight: 1 }}>{loading ? '-' : score}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>健康度</span>
      </div>
    </div>
  )
}

function ScoreHelpIcon() {
  const [showHelp, setShowHelp] = useState(false)

  const scoreRules = [
    { range: '90-100', level: '优秀', color: '#22c55e', desc: '系统运行非常健康，各项指标表现优异，无明显风险' },
    { range: '80-89', level: '良好', color: '#22c55e', desc: '系统运行稳定，大部分指标正常，存在少量可改进项' },
    { range: '70-79', level: '中等', color: '#f59e0b', desc: '系统整体可用，部分指标存在波动或接近阈值，需关注' },
    { range: '60-69', level: '一般', color: '#f59e0b', desc: '系统存在明显问题，多个指标异常，需要及时处理' },
    { range: '0-59', level: '危险', color: '#ef4444', desc: '系统运行存在严重风险，关键指标异常，需立即处理' }
  ]

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowHelp(!showHelp)}
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          border: '1px solid var(--border-color)',
          background: 'var(--bg-button)',
          color: 'var(--text-muted)',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease'
        }}
        title="查看打分规则"
      >
        ?
      </button>
      {showHelp && (
        <div style={{
          position: 'absolute',
          top: 28,
          left: 0,
          width: 320,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          padding: 12,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 1000,
          fontSize: 11
        }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10, fontSize: 13 }}>
            📊 健康度评分规则
          </div>
          {scoreRules.map((rule, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'flex-start',
              padding: '6px 0',
              borderBottom: i < scoreRules.length - 1 ? '1px dashed var(--border-color)' : 'none'
            }}>
              <div style={{
                width: 50,
                fontWeight: 600,
                color: rule.color,
                flexShrink: 0
              }}>
                {rule.range}
              </div>
              <div style={{
                flex: 1,
                minWidth: 0
              }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                  {rule.level}
                </div>
                <div style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {rule.desc}
                </div>
              </div>
            </div>
          ))}
          <div style={{
            marginTop: 10,
            padding: '8px 10px',
            background: 'var(--bg-input)',
            borderRadius: 4,
            color: 'var(--text-muted)',
            fontSize: 10
          }}>
            💡 AI基于报表数据分析多个维度：<br/>
            数据完整性、指标趋势、异常值、阈值接近度等
          </div>
          <button
            onClick={() => setShowHelp(false)}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: 'none',
              background: 'var(--bg-input)',
              color: 'var(--text-muted)',
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

export function EditableText({ content, loading, waiting, isEditing, onChange }: { content: string; loading: boolean; waiting?: boolean; isEditing?: boolean; onChange?: (v: string) => void }) {
  if (loading || waiting || !content) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>AI 生成中...</span>
  if (isEditing) {
    return (
      <textarea
        value={content}
        onChange={(e) => onChange?.(e.target.value)}
        style={{ width: '100%', fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5, border: '1px solid #3b82f6', borderRadius: 4, padding: '6px 8px', background: 'var(--bg-input)', resize: 'vertical', minHeight: 60 }}
        placeholder="点击编辑..."
        autoFocus
      />
    )
  }
  return (
    <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', minHeight: 60, padding: '6px 0' }}>
      {content.split('\n').map((line, i) => <div key={i}>{line}</div>)}
    </div>
  )
}

export function EditableRisks({ risks, loading, waiting, isEditing, onChange }: { risks: string[]; loading: boolean; waiting?: boolean; isEditing?: boolean; onChange?: (risks: string[]) => void }) {
  const [expanded, setExpanded] = useState(false)
  const maxShow = 3
  const displayRisks = expanded ? risks : risks.slice(0, maxShow)
  const hasMore = risks.length > maxShow

  if (loading || waiting || risks.length === 0) return <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '10px 12px', fontSize: 12, color: '#b91c1c' }}>AI 生成中...</div>

  return (
    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#991b1b' }}>关键风险 ({risks.length})</span>
        {hasMore && !isEditing && <button onClick={() => setExpanded(!expanded)} style={{ fontSize: 11, color: '#b91c1c', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>{expanded ? '收起' : `展开更多 (${risks.length - maxShow})`}</button>}
      </div>
      {isEditing ? (
        <textarea
          value={risks.join('\n')}
          onChange={(e) => onChange?.(e.target.value.split('\n').filter(r => r.trim()))}
          style={{ width: '100%', fontSize: 12, color: '#991b1b', lineHeight: 1.5, border: '1px solid #dc2626', borderRadius: 4, padding: '4px 8px', background: '#fff', resize: 'vertical', minHeight: 60 }}
          placeholder="每行一条风险..."
        />
      ) : (
        displayRisks.map((risk, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', padding: '3px 0', borderBottom: i < displayRisks.length - 1 ? '1px dashed #fecaca' : 'none' }}>
            <span style={{ color: '#dc2626', fontSize: 12, marginRight: 6, flexShrink: 0 }}>•</span>
            <span style={{ color: '#991b1b', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{risk}</span>
          </div>
        ))
      )}
    </div>
  )
}

export function EditableBullets({ content, loading, waiting, isEditing, onChange }: { content: string; loading: boolean; waiting?: boolean; isEditing?: boolean; onChange?: (v: string) => void }) {
  if (loading || waiting || !content) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>AI 生成中...</span>
  if (isEditing) {
    return (
      <textarea
        value={content}
        onChange={(e) => onChange?.(e.target.value)}
        style={{ width: '100%', fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5, border: '1px solid #f59e0b', borderRadius: 4, padding: '6px 8px', background: 'var(--bg-input)', resize: 'vertical', minHeight: 60 }}
        autoFocus
      />
    )
  }
  const bullets = extractBullets(content)
  return (
    <div style={{ minHeight: 60, padding: '6px 0' }}>
      {bullets.slice(0, 3).map((b, i) => <div key={i} style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.6, paddingLeft: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>• {b}</div>)}
    </div>
  )
}

function deepExtractValue(v: any, depth: number = 0): string {
  if (depth > 3) return ''
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return v.toFixed(2)
  if (typeof v === 'string') return v.substring(0, 30)
  if (typeof v === 'object' && !Array.isArray(v)) {
    const priorityKeys = ['value', 'text', 'name', 'label', 'data', 'val']
    for (const k of priorityKeys) if (v[k] !== undefined) return deepExtractValue(v[k], depth + 1)
    const keys = Object.keys(v)
    if (keys.length > 0) return deepExtractValue(v[keys[0]], depth + 1)
    return ''
  }
  if (Array.isArray(v) && v.length > 0) return deepExtractValue(v[0], depth + 1)
  return String(v).substring(0, 30)
}

function buildDataSummary(panelsData: any[], panelsConfig: any[]): string {
  const summaries: string[] = []
  panelsData.slice(0, 8).forEach((p, idx) => {
    if (!p.data || p.data.length === 0) return
    const config = panelsConfig.find((c) => c.id === p.id)
    const title = config?.title || p.title || `报表${idx + 1}`
    const type = p.type || config?.type || 'table'

    // 将 data（可能是二维数组 MetricRow[][]）展平为一维行数组
    let allRows: any[] = []
    if (Array.isArray(p.data)) {
      // 检查是否为嵌套数组 (MetricRow[][])
      if (p.data.length > 0 && Array.isArray(p.data[0])) {
        // 二维数组：合并所有 target 的行
        for (const targetRows of p.data) {
          if (Array.isArray(targetRows)) {
            allRows = allRows.concat(targetRows)
          }
        }
      } else {
        allRows = p.data
      }
    }

    if (allRows.length === 0) return

    // 获取列名
    let columns: string[] = []
    if (p.columns && Array.isArray(p.columns)) {
      columns = p.columns.map((c: any) => deepExtractValue(c))
    } else if (allRows.length > 0 && typeof allRows[0] === 'object' && !Array.isArray(allRows[0])) {
      columns = Object.keys(allRows[0])
    }

    if (type === 'gauge') {
      // 仪表板：取最后一行所有数值
      const nums: number[] = []
      const lastRow = allRows[allRows.length - 1]
      if (lastRow && typeof lastRow === 'object' && !Array.isArray(lastRow)) {
        Object.values(lastRow).forEach((v: any) => {
          const num = parseFloat(deepExtractValue(v))
          if (!isNaN(num)) nums.push(num)
        })
      }
      if (nums.length > 0) {
        summaries.push(`【${title}】仪表板: 值=${nums.map((v) => v.toFixed(2)).join(', ')}`)
      }
    } else {
      // 表格和图表：输出列名 + 前20行数据
      let tableInfo = `【${title}】(共${allRows.length}行)\n`
      if (columns.length > 0) {
        tableInfo += `列(${columns.length}列): ${columns.slice(0, 10).join(', ')}\n`
      }
      const sampleRows = allRows.slice(0, 50)
      if (sampleRows.length > 0) {
        tableInfo += '数据行:\n'
        sampleRows.forEach((row: any, i: number) => {
          if (typeof row === 'object' && !Array.isArray(row)) {
            // 键值对格式
            const keyVals = columns.slice(0, 8).map((col) => {
              const val = row[col]
              return `${col}=${deepExtractValue(val)}`
            }).join(', ')
            if (keyVals) tableInfo += `  ${keyVals}\n`
          } else if (Array.isArray(row)) {
            const vals = row.slice(0, 8).map((v: any) => deepExtractValue(v)).join(' | ')
            if (vals) tableInfo += `  第${i + 1}行: ${vals}\n`
          }
        })
      }
      summaries.push(tableInfo)
    }
  })
  return summaries.join('\n\n')
}

export function checkHasReportContent(panelsData: any[]): boolean {
  return panelsData.some((p) => p.type === 'table' && p.data && p.data.length > 0 && p.data.some((r: any) => r?.length > 0))
}

interface AIInsightsPanelProps {
  dashboardId: string
  dashboardTitle: string
  panelsData: Array<{ id: string; title: string; type: string; data?: any[][]; columns?: string[] }>
  panelsConfig: Array<{ id: string; title: string; type: string; targets?: Array<{ refId: string; rawSql: string }> }>
  trigger?: number
  editable?: boolean
  initialData?: { score?: number; conclusion?: string; risks?: string[]; evaluation?: string; plan?: string }
  onDataChange?: (data: { score: number; conclusion: string; risks: string[]; evaluation: string; plan: string }) => void
  showPlan?: boolean
}

export function AIInsightsPanel({ dashboardTitle, panelsData, panelsConfig, trigger, initialData, onDataChange, showPlan = false }: AIInsightsPanelProps) {
  const [contents, setContents] = useState({ score: initialData?.score ?? 75, conclusion: initialData?.conclusion ?? '', risks: initialData?.risks ?? [] as string[], evaluation: initialData?.evaluation ?? '', plan: initialData?.plan ?? '' })
  const [loading, setLoading] = useState({ score: !initialData?.conclusion, risks: false, evaluation: false, plan: false })
  const [isEditing, setIsEditing] = useState({ risk: false, plan: false })
  const startedRef = useRef(false)
  const anyLoading = loading.score || loading.risks || loading.evaluation || loading.plan

  useEffect(() => {
    if (initialData) {
      setContents({ score: initialData.score ?? 75, conclusion: initialData.conclusion ?? '', risks: initialData.risks ?? [], evaluation: initialData.evaluation ?? '', plan: initialData.plan ?? '' })
      setLoading({ score: false, risks: false, evaluation: false, plan: false })
      startedRef.current = true
    }
  }, [initialData])

  useEffect(() => { onDataChange?.(contents) }, [contents, onDataChange])

  useEffect(() => {
    if (initialData && initialData.conclusion && initialData.risks && initialData.risks.length > 0) return
    if (startedRef.current) return
    startedRef.current = true
    startGeneration()
  }, [trigger, initialData])

  const startGeneration = async () => {
    setIsEditing({ risk: false, plan: false })
    setLoading({ score: true, risks: false, evaluation: false, plan: false })
    setContents({ score: 75, conclusion: '', risks: [], evaluation: '', plan: '' })
    const dataSummary = buildDataSummary(panelsData, panelsConfig)
    
    const scorePrompt = [
      '你是运维监控专家。分析以下仪表板数据，给出健康度评分和结论：',
      `仪表板名称: "${dashboardTitle}"`,
      `报表数据:\n${dataSummary}`,
      '请分析每个报表的数据，综合评估系统健康度：',
      '严格按以下格式输出：',
      '分数:XX',
      '- 结论要点',
      '- 扣分项：简要列出扣分原因',
      '规则：',
      '- 分数范围0-100',
      '- 结论要具体',
      '- 扣分项要简洁明了',
      '- 不要其他任何文字',
    ].join('\n')
    const conclusionResult = await generateSingle(scorePrompt)
    const score = extractScore(conclusionResult)
    const summary = extractShortSummary(conclusionResult)
    setContents(prev => ({ ...prev, score, conclusion: summary.join('\n') }))
    setLoading(prev => ({ ...prev, score: false, risks: true }))
    
    await new Promise(r => setTimeout(r, 1000))
    
    const risksPrompt = [
      '你是运维监控专家。分析以下仪表板数据，识别关键风险：',
      `仪表板名称: "${dashboardTitle}"`,
      `健康度评分: ${score}分`,
      `已有结论: ${summary.join('；')}`,
      `报表数据:\n${dataSummary}`,
      '请基于数据识别真正的风险点：',
      '严格按以下格式输出风险要点：',
      '- 具体风险点（指出哪个报表、什么问题）',
      '规则：',
      '- 只输出 "- "开头的要点行',
      '- 每条风险要具体、有数据支撑',
      '- 如果系统健康无明显风险，输出 "- 无明显风险" 即可，不要编造风险',
      '- 有风险时最多3-5条，无风险时只输出1条',
    ].join('\n')
    const risksResult = await generateSingle(risksPrompt)
    const risks = extractBullets(risksResult).slice(0, 5)
    setContents(prev => ({ ...prev, risks }))
    setLoading(prev => ({ ...prev, risks: false, evaluation: true }))
    
    await new Promise(r => setTimeout(r, 1000))
    
    const evalPrompt = `你是运维监控专家。分析以下仪表板数据，给出核心评估：\n仪表板名称: "${dashboardTitle}"\n报表数据:\n${dataSummary}\n请综合所有报表数据，给出整体评估：\n严格按以下格式输出：\n- 评估结论\n规则：\n- 只输出 "- "开头的要点\n- 最多2条`
    const evalResult = await generateSingle(evalPrompt)
    setContents(prev => ({ ...prev, evaluation: evalResult }))
    setLoading(prev => ({ ...prev, evaluation: false, plan: true }))
    
    await new Promise(r => setTimeout(r, 1000))
    
    const planPrompt = `你是运维监控专家。基于以下仪表板数据分析结果，给出下一步计划：\n仪表板名称: "${dashboardTitle}"\n报表数据:\n${dataSummary}\n请基于数据分析结果，给出具体的改进计划：\n严格按以下格式输出：\n- 具体行动计划\n规则：\n- 只输出 "- "开头的要点\n- 计划要具体可行\n- 最多2条`
    const planResult = await generateSingle(planPrompt)
    setContents(prev => ({ ...prev, plan: planResult }))
    setLoading(prev => ({ ...prev, plan: false }))
  }

  const generateSingle = (prompt: string): Promise<string> => new Promise((resolve) => {
    let buffer = ''
    try {
      const ws = new WebSocket(WS_URL)
      ws.onopen = () => ws.send(JSON.stringify({ type: 'chat', message: prompt }))
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'heartbeat') return
          if (data.type === 'end') { ws.close(); resolve(buffer); return }
          const chunk = data.message || ''
          if (data.msg_category === 'model' && chunk) buffer += chunk
        } catch {}
      }
      ws.onerror = () => resolve('')
      ws.onclose = () => resolve('')
    } catch { resolve('') }
  })

  return (
    <>
      {/* 核心结论与风险 */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>📊 核心结论与风险</span>
            <ScoreHelpIcon />
            <button 
              onClick={() => setIsEditing(prev => ({ ...prev, risk: !prev.risk }))}
              disabled={anyLoading || !contents.conclusion}
              style={{ fontSize: 11, marginLeft: 'auto', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border-color)', background: anyLoading || !contents.conclusion ? 'var(--bg-disabled)' : 'var(--bg-button)', color: anyLoading || !contents.conclusion ? 'var(--text-muted)' : 'var(--text-primary)', cursor: anyLoading || !contents.conclusion ? 'not-allowed' : 'pointer' }}
            >
              {isEditing.risk ? '完成编辑' : '编辑'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0, background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-card) 100%)', borderRadius: 8, padding: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <ScoreCircle score={contents.score} loading={loading.score} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <EditableText content={contents.conclusion} loading={loading.score} waiting={anyLoading} isEditing={isEditing.risk} onChange={(v) => setContents(prev => ({ ...prev, conclusion: v }))} />
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <EditableRisks risks={contents.risks} loading={loading.risks} waiting={anyLoading} isEditing={isEditing.risk} onChange={(risks) => setContents(prev => ({ ...prev, risks }))} />
            </div>
          </div>
        </div>
      </div>

      {/* 评估与计划 - 只有 showPlan 为 true 时才显示 */}
      {showPlan && (
        <div style={{ marginTop: 12 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>📋 评估与计划</span>
              <button 
                onClick={() => setIsEditing(prev => ({ ...prev, plan: !prev.plan }))}
                disabled={anyLoading || !contents.evaluation}
                style={{ fontSize: 11, marginLeft: 'auto', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border-color)', background: anyLoading || !contents.evaluation ? 'var(--bg-disabled)' : 'var(--bg-button)', color: anyLoading || !contents.evaluation ? 'var(--text-muted)' : 'var(--text-primary)', cursor: anyLoading || !contents.evaluation ? 'not-allowed' : 'pointer' }}
              >
                {isEditing.plan ? '完成编辑' : '编辑'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0, background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-card) 100%)', borderRadius: 6, padding: 12, border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6', marginBottom: 8 }}>✅ 核心评估</div>
                <EditableBullets content={contents.evaluation} loading={loading.evaluation} waiting={anyLoading} isEditing={isEditing.plan} onChange={(v) => setContents(prev => ({ ...prev, evaluation: v }))} />
              </div>
              <div style={{ flex: 1, minWidth: 0, background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-card) 100%)', borderRadius: 6, padding: 12, border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b', marginBottom: 8 }}>📋 下一步计划</div>
                <EditableBullets content={contents.plan} loading={loading.plan} waiting={anyLoading} isEditing={isEditing.plan} onChange={(v) => setContents(prev => ({ ...prev, plan: v }))} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function AIInsightsSection(props: AIInsightsProps) {
  return AIInsightsPanel(props)
}

export function clearInsightsCache() {}