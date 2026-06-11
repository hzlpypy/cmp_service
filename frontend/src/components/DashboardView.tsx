import { useState, useEffect, useRef } from 'react'
import html2canvas from 'html2canvas'
import ChartPanel from './ChartPanel'
import AIChatDialog from './AIChatDialog'
import * as api from '../api'
import type { DashboardRes, DashboardDataRes, DashboardJSON, MetricRow, PanelDef, PanelDataRes, DatasourceRes } from '../api'

interface DashboardViewProps {
  dashboardId: string
  onBack: () => void
  onEditPanel?: (ctx: {
    panel: PanelDef
    dashboardId: string
    datasources: DatasourceRes[]
    draftJson: any
    panelsData?: PanelDataRes[]
    onSave: (updated: PanelDef) => void
  }) => void
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export default function DashboardView({ dashboardId, onBack, onEditPanel }: DashboardViewProps) {
  const [dashboard, setDashboard] = useState<DashboardRes | null>(null)
  const [dataRes, setDataRes] = useState<DashboardDataRes | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [showJson, setShowJson] = useState(false)
  const [datasources, setDatasources] = useState<DatasourceRes[]>([])

  // ---- 本地草稿状态：所有编辑操作仅修改此状态，不调 API ----
  const [draftJson, setDraftJson] = useState<any>(null)
  // 上次保存时的快照，用于判断有无未保存变更
  const [savedJson, setSavedJson] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const hasUnsaved = savedJson !== null && JSON.stringify(draftJson) !== JSON.stringify(savedJson)

  // AI 对话面板
  const [chatOpen, setChatOpen] = useState(false)

  // 创建仪表盘快照
  const [snapModalOpen, setSnapModalOpen] = useState(false)
  const [snapName, setSnapName] = useState('')
  const [snapping, setSnapping] = useState(false)
  const [snapshots, setSnapshots] = useState<api.SnapshotRes[]>([])
  const [snapLoading, setSnapLoading] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const shareLink = `${window.location.origin}/snapshot/`

  const loadSnapshots = async () => {
    setSnapLoading(true)
    try { setSnapshots(await api.listSnapshots(dashboardId, '')) } catch {}
    finally { setSnapLoading(false) }
  }

  const handleCreateDashboardSnapshot = async () => {
    if (!draftJson || !dataRes) return
    setSnapping(true)
    try {
      const panelDataList: api.PanelDataRes[] = (dataRes.panels_data || []).map((pd) => ({
        panel_id: pd.panel_id,
        panel_title: pd.panel_title,
        panel_type: pd.panel_type,
        datasource_id: pd.datasource_id,
        target: pd.target,
        columns: pd.columns,
      }))
      const snap = await api.createSnapshot({
        dashboard_id: dashboardId,
        panel_id: '',
        name: snapName || `${displayTitle || '仪表盘'} 快照`,
        dashboard_json: draftJson as DashboardJSON,
        panels_data: panelDataList,
      })
      setSnapshots((prev) => [snap, ...prev])
      setSnapName('')
    } catch (e: any) {
      alert('创建快照失败: ' + (e.message || '未知错误'))
    } finally {
      setSnapping(false)
    }
  }

  const handleDeleteSnapshot = async (key: string) => {
    if (!confirm('确认删除该快照？')) return
    try {
      await api.deleteSnapshot(key)
      setSnapshots((prev) => prev.filter((s) => s.snapshot_key !== key))
    } catch (e: any) { alert('删除失败: ' + (e.message || '未知错误')) }
  }

  // 导出为图像
  const canvasRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const handleExportImage = async () => {
    if (!canvasRef.current) return
    setExporting(true)

    const canvasEl = canvasRef.current
    const wrapperEl = wrapperRef.current

    // 保存原始样式
    const origCanvasStyle = canvasEl.style.cssText
    const origWrapperStyle = wrapperEl?.style.cssText || ''
    // 保存 dashboard-view 根节点的 overflow 样式
    const viewRoot = canvasEl.closest('.dashboard-view') as HTMLElement
    const origRootOverflow = viewRoot?.style.overflow || ''

    try {
      // 临时展开整个仪表盘面板区域，确保所有内容可见
      if (wrapperEl) {
        wrapperEl.style.height = 'auto'
        wrapperEl.style.flex = 'none'
        wrapperEl.style.overflow = 'visible'
      }
      canvasEl.style.height = 'auto'
      canvasEl.style.flex = 'none'
      canvasEl.style.overflow = 'visible'
      canvasEl.style.maxHeight = 'none'
      if (viewRoot) {
        viewRoot.style.overflow = 'visible'
      }

      // 等待一帧让浏览器重新布局
      await new Promise((r) => requestAnimationFrame(r))

      const canvas = await html2canvas(canvasEl, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: canvasEl.scrollWidth,
        windowHeight: canvasEl.scrollHeight,
      })
      const link = document.createElement('a')
      link.download = `${displayTitle || 'dashboard'}_${new Date().toISOString().slice(0, 10)}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (e: any) {
      alert('导出失败: ' + (e.message || e))
    } finally {
      // 恢复原始样式
      canvasEl.style.cssText = origCanvasStyle
      if (wrapperEl) wrapperEl.style.cssText = origWrapperStyle
      if (viewRoot) viewRoot.style.overflow = origRootOverflow
      setExporting(false)
    }
  }

  /** AI 通过 onDraftUpdate 回调传入修改后的 dashboard_json，立即生效 */
  const handleDraftUpdate = (newDashboardJson: any) => {
    if (!newDashboardJson) return
    setDraftJson(newDashboardJson)
    // 立即用新草稿查询面板数据，实现预览
    reloadDataWithDraft(newDashboardJson)
  }

  // 单面板编辑器
  // 仪表板元信息编辑器
  const [showMetaEdit, setShowMetaEdit] = useState(false)
  const [metaTitle, setMetaTitle] = useState('')
  // 添加面板
  const [showNewPanel, setShowNewPanel] = useState(false)

  // 时间范围选择
  type TimePreset = '6h' | '24h' | '7d' | 'custom'
  const [timePreset, setTimePreset] = useState<TimePreset>('6h')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const getTimeRange = (): { from: string; to: string } | null => {
    if (timePreset === 'custom') {
      if (!customFrom && !customTo) return null
      return {
        from: customFrom ? new Date(customFrom).toISOString() : '',
        to: customTo ? new Date(customTo).toISOString() : '',
      }
    }
    const now = new Date()
    const to = now.toISOString()
    const hours = timePreset === '6h' ? 6 : timePreset === '24h' ? 24 : 168
    const from = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString()
    return { from, to }
  }

  // 加载仪表板详情和数据
  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const tr = getTimeRange()
      const [db, dbData, dsList] = await Promise.all([
        api.getDashboard(dashboardId),
        api.getDashboardData(dashboardId, tr?.from, tr?.to),
        api.listDatasources(),
      ])
      setDashboard(db)
      setDataRes(dbData)
      setDatasources(dsList)
      // 初始化本地草稿为当前 dashboard_json 的深拷贝
      const dj = JSON.parse(JSON.stringify(db.dashboard_json || {}))
      setDraftJson(dj)
      setSavedJson(dj)
    } catch (e: any) {
      setError(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  // 用指定草稿 JSON 重新加载数据（面板编辑暂存后立即预览效果）
  const reloadDataWithDraft = async (draft: any) => {
    if (!draft) return
    try {
      const tr = getTimeRange()
      const dbData = await api.getDashboardData(dashboardId, tr?.from, tr?.to, draft as DashboardJSON)
      setDataRes(dbData)
    } catch (e: any) {
      // 静默失败，不影响草稿编辑
    }
  }

  useEffect(() => { loadData() }, [dashboardId, timePreset, customFrom, customTo])

  const toggleMenu = (panelId: string) => {
    setOpenMenuId((prev) => (prev === panelId ? null : panelId))
  }

  // ---- 工具栏：保存仪表板（将草稿持久化到后端） ----
  const handleSaveDashboard = async () => {
    if (!dashboard || !draftJson) return
    setSaving(true)
    try {
      const title = draftJson.title || dashboard.title
      await api.updateDashboard(dashboard.id, title, dashboard.folder_id, draftJson as DashboardJSON)
      // 保存成功后更新快照
      const saved = JSON.parse(JSON.stringify(draftJson))
      setSavedJson(saved)
      // 同步更新 dashboard 的 title（若标题变化）
      if (title !== dashboard.title) {
        setDashboard({ ...dashboard, title, dashboard_json: saved })
      }
      loadData()
    } catch (e: any) {
      alert('保存失败: ' + (e.message || e))
    } finally {
      setSaving(false)
    }
  }

  // ---- 单面板编辑：导航到全屏编辑页面 ----
  const handleEditPanel = (panelId: string) => {
    setOpenMenuId(null)
    const panels: any[] = draftJson?.panels || []
    const panel = panels.find((p: any) => p.id === panelId)
    if (panel && onEditPanel) {
      onEditPanel({
        panel: panel as PanelDef,
        dashboardId,
        datasources,
        draftJson,
        panelsData: dataRes?.panels_data,
        onSave: (updated: PanelDef) => {
          // 更新本地草稿
          const newPanels: any[] = [...(draftJson?.panels || [])]
          const idx = newPanels.findIndex((p: any) => p.id === updated.id)
          if (idx >= 0) newPanels[idx] = updated
          const newDraft = { ...draftJson, panels: newPanels }
          setDraftJson(newDraft)
          // 用新草稿 JSON 立即查询面板数据，实现预览
          reloadDataWithDraft(newDraft)
        },
      })
    }
  }

  // ---- 仪表板元信息编辑（仅修改本地草稿） ----
  const handleOpenMetaEdit = () => {
    setMetaTitle(draftJson?.title || dashboard?.title || '')
    setShowMetaEdit(true)
  }

  const handleSaveMeta = () => {
    if (!metaTitle.trim()) return
    setDraftJson({ ...draftJson, title: metaTitle.trim() })
    setShowMetaEdit(false)
  }

  // ---- 添加面板（仅修改本地草稿） ----
  const handleAddPanel = () => {
    setShowNewPanel(false)
    const panels: any[] = [...(draftJson?.panels || [])]
    const ds = datasources[0]
    // 自动计算新面板的 y 位置：放在已有面板最下方
    const maxY = panels.reduce((max, p) => {
      const bottom = (p.gridPos?.y || 0) + (p.gridPos?.h || 8)
      return bottom > max ? bottom : max
    }, 0)
    panels.push({
      id: uid('panel'),
      title: '新面板',
      type: 'table',
      gridPos: { x: 0, y: maxY, w: 24, h: 8 },
      datasource_id: ds?.id,
      targets: [{ refId: 'A', rawSql: 'SELECT 1', aliasMap: {}, category: '', metricName: '' }],
      options: {},
    })
    setDraftJson({ ...draftJson, panels })
  }

  // ---- 删除面板（仅修改本地草稿） ----
  const handleRemovePanel = (panelId: string) => {
    const newPanels = (draftJson?.panels || []).filter((p: any) => p.id !== panelId)
    setDraftJson({ ...draftJson, panels: newPanels })
    setOpenMenuId(null)
  }

  if (loading) {
    return (
      <div className="dashboard-view">
        <div className="dashboard-toolbar">
          <div className="toolbar-left"><button className="btn-sm" onClick={onBack}>← 返回</button></div>
        </div>
        <div className="empty-state">加载中...</div>
      </div>
    )
  }

  if (error || !dashboard) {
    return (
      <div className="dashboard-view">
        <div className="dashboard-toolbar">
          <div className="toolbar-left"><button className="btn-sm" onClick={onBack}>← 返回</button></div>
        </div>
        <div className="empty-state" style={{ color: 'var(--red)' }}>{error || '仪表板不存在'}</div>
      </div>
    )
  }

  // 使用本地草稿渲染面板
  const dj = draftJson || (dashboard.dashboard_json as any) || {}
  const panels: any[] = dj.panels || []
  const displayTitle = dj.title || dashboard.title

  // 建立 panel_id → 图表类型 的映射，用于时间范围过滤
  const panelTypeMap = new Map<string, string>()
  panels.forEach((p: any) => { if (p.id) panelTypeMap.set(p.id, p.type) })

  const dataMap = new Map<string, MetricRow[][]>()
  const columnMap = new Map<string, string[]>()
  if (dataRes?.panels_data) {
    const tr = getTimeRange()
    const fromMs = tr ? new Date(tr.from).getTime() : 0
    const toMs = tr ? new Date(tr.to).getTime() : Infinity

    dataRes.panels_data.forEach((pd) => {
      const pType = panelTypeMap.get(pd.panel_id)
      // 时间范围仅对折线图生效
      const shouldFilter = pType === 'line' && tr

      const filtered = shouldFilter
        ? (pd.target || []).map((rows) => {
            if (rows.length === 0) return rows
            const dateCol = Object.keys(rows[0]).find((k) => {
              const kl = k.toLowerCase()
              return kl.includes('date') || kl.includes('time') || kl.includes('日期') || kl.includes('时间') || kl === 'day'
            })
            if (!dateCol) return rows
            return rows.filter((row: any) => {
              const val = row[dateCol]
              if (!val) return false
              const t = new Date(val).getTime()
              return !isNaN(t) && t >= fromMs && t <= toMs
            })
          })
        : (pd.target || [])

      dataMap.set(pd.panel_id, filtered)
      columnMap.set(pd.panel_id, pd.columns || [])
    })
  }
  const panelRows = groupPanelsIntoRows(panels)

  return (
    <div className="dashboard-view">
      {/* ---- Toolbar ---- */}
      <div className="dashboard-toolbar">
        <div className="toolbar-left">
          <button className="btn-sm" onClick={onBack}>← 返回</button>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{displayTitle}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{panels.length} 个面板</span>
          {hasUnsaved && (
            <span style={{
              fontSize: 11, color: '#f5a623', background: 'rgba(245,166,35,0.12)',
              padding: '1px 6px', borderRadius: 3, fontWeight: 500,
            }}>未保存</span>
          )}
        </div>
        <div className="toolbar-right">
          {/* 时间范围选择器 - 仅对折线图生效 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>时间范围</span>
            <select
              value={timePreset}
              onChange={(e) => setTimePreset(e.target.value as TimePreset)}
              style={{ fontSize: 11, padding: '2px 6px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 3 }}
            >
              <option value="6h">最近6小时</option>
              <option value="24h">最近24小时</option>
              <option value="7d">最近7天</option>
              <option value="custom">自定义</option>
            </select>
            {timePreset === 'custom' && (
              <>
                <input type="datetime-local" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                  style={{ fontSize: 10, padding: '1px 4px', width: 130, background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 3 }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>至</span>
                <input type="datetime-local" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                  style={{ fontSize: 10, padding: '1px 4px', width: 130, background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 3 }} />
              </>
            )}
          </div>
          <button className="btn-sm" onClick={() => setShowNewPanel(true)}>+ 添加面板</button>
          <button className="btn-sm" onClick={handleOpenMetaEdit} title="编辑仪表板信息">&#x270E; 设置</button>
          <button className="btn-sm" onClick={() => setShowJson(true)} title="查看仪表板JSON">{'{ }'} 查看JSON</button>
          <button className="btn-sm" onClick={handleExportImage} disabled={exporting} title="导出仪表板为PNG图像">
            {exporting ? '导出中...' : '📷 导出图像'}
          </button>
          <button className="btn-sm" onClick={() => { setSnapName(''); setSnapModalOpen(true); loadSnapshots() }} title="创建仪表盘快照">
            📸 创建快照
          </button>
          <button className="btn-sm" onClick={loadData} title="刷新数据">&#x1F504; 刷新</button>
          <button className="btn-sm" onClick={() => setChatOpen(!chatOpen)} title="AI 智能助手"
            style={chatOpen ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : undefined}
          >{chatOpen ? '✕ 关闭AI' : '💬 AI 助手'}</button>
          {/* 保存按钮：有未保存变更时高亮 */}
          <button
            className="btn-sm"
            onClick={handleSaveDashboard}
            disabled={saving}
            title="保存仪表板（将所有面板变更持久化）"
            style={hasUnsaved ? {
              background: 'var(--primary)',
              color: '#fff',
              borderColor: 'var(--primary)',
              fontWeight: 600,
            } : undefined}
          >
            {saving ? '保存中...' : hasUnsaved ? '\u{1F4BE} 保存仪表板' : '保存仪表板'}
          </button>
        </div>
      </div>

      {/* ---- 仪表板元信息编辑 Modal ---- */}
      {showMetaEdit && (
        <div className="modal-overlay" onClick={() => setShowMetaEdit(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 440 }}>
            <div className="modal-header">
              <h2>仪表板设置</h2>
              <button className="modal-close" onClick={() => setShowMetaEdit(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>标题</label>
                <input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder="仪表板名称" autoFocus />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                修改仪表板的基础信息。保存后需点击右上角"保存仪表板"才会持久化。
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowMetaEdit(false)}>取消</button>
              <button className="btn-primary" onClick={handleSaveMeta}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- 创建快照 Modal ---- */}
      {snapModalOpen && (
        <div className="modal-overlay" onClick={() => setSnapModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
            <div className="modal-header">
              <h2>创建仪表盘快照</h2>
              <button className="modal-close" onClick={() => setSnapModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflow: 'auto' }}>
              <div className="form-group">
                <label>快照名称（可选）</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={snapName} onChange={(e) => setSnapName(e.target.value)} placeholder={`${displayTitle || '仪表盘'} 快照`} autoFocus style={{ flex: 1 }} />
                  <button className="btn-primary" onClick={handleCreateDashboardSnapshot} disabled={snapping} style={{ whiteSpace: 'nowrap' }}>
                    {snapping ? '创建中...' : '创建快照'}
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
                快照将保存当前仪表盘中所有面板的数据和配置。
              </div>

              <div>
                <h4 style={{ marginBottom: 8, fontSize: 14 }}>
                  已有快照 {snapshots.length > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({snapshots.length})</span>}
                </h4>
                {snapLoading ? (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>加载中...</div>
                ) : snapshots.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                    暂无快照，输入名称后点击"创建快照"保存当前状态
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {snapshots.map((snap) => (
                      <div key={snap.snapshot_key} style={{
                        border: '1px solid var(--border-color)', borderRadius: 6, padding: '10px 12px',
                        display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {snap.name || '未命名快照'}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {shareLink}{snap.snapshot_key}
                          </div>
                        </div>
                        <button className="btn-sm"
                          onClick={() => window.open(`/snapshot/${snap.snapshot_key}`, '_blank')}
                          style={{ fontSize: 11, whiteSpace: 'nowrap', padding: '4px 10px' }}>
                          查看
                        </button>
                        <button className="btn-sm"
                          onClick={() => { navigator.clipboard.writeText(`${shareLink}${snap.snapshot_key}`); setCopiedKey(snap.snapshot_key); setTimeout(() => setCopiedKey(null), 2000) }}
                          style={{ fontSize: 11, whiteSpace: 'nowrap', padding: '4px 10px' }}>
                          {copiedKey === snap.snapshot_key ? '已复制' : '复制链接'}
                        </button>
                        <button className="btn-sm"
                          onClick={() => handleDeleteSnapshot(snap.snapshot_key)}
                          style={{ fontSize: 11, color: 'var(--red)', borderColor: 'transparent', padding: '4px 8px' }}>
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSnapModalOpen(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- 添加面板确认 ---- */}
      {showNewPanel && (
        <div className="modal-overlay" onClick={() => setShowNewPanel(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
            <div className="modal-header">
              <h2>添加面板</h2>
              <button className="modal-close" onClick={() => setShowNewPanel(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                将在当前仪表板中新增一个空面板，添加后面板以 🖉 标记在编辑状态，点击右上角"保存仪表板"后生效。
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowNewPanel(false)}>取消</button>
              <button className="btn-primary" onClick={handleAddPanel}>添加</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- JSON Viewer ---- */}
      {showJson && (
        <div className="modal-overlay" onClick={() => setShowJson(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 700, maxHeight: '85vh' }}>
            <div className="modal-header">
              <h2>仪表板JSON定义（当前草稿）</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-sm primary" onClick={() => navigator.clipboard.writeText(JSON.stringify(dj, null, 2))}>复制</button>
                <button className="modal-close" onClick={() => setShowJson(false)}>&times;</button>
              </div>
            </div>
            <div className="modal-body">
              <pre style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', padding: 16, borderRadius: 4, overflow: 'auto', maxHeight: '60vh', fontSize: 12, lineHeight: 1.6, fontFamily: 'monospace' }}>
                {JSON.stringify(dj, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ---- Canvas ---- */}
      <div ref={wrapperRef} style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div className="dashboard-canvas" ref={canvasRef} style={{ flex: 1, overflow: 'auto' }}>
          {panelRows.map((row, rowIdx) => (
            <div key={rowIdx} className="panel-row">
              {row.map((panel: any) => {
                const panelWidth = panel.gridPos?.w || 12
                const panelData = dataMap.get(panel.id) || []
                return (
                  <div key={panel.id} className="panel-col" style={{ flex: panelWidth / 24 }}>
                    <ChartPanel
                      type={panel.type || 'table'}
                      title={panel.title || '未命名'}
                      data={panelData}
                      targets={panel.targets || []}
                      options={panel.options}
                      columns={columnMap.get(panel.id)}
                      menuOpen={openMenuId === panel.id}
                      onToggleMenu={() => toggleMenu(panel.id)}
                      onEdit={() => handleEditPanel(panel.id)}
                      onRemove={() => handleRemovePanel(panel.id)}
                    />
                  </div>
                )
              })}
            </div>
          ))}
          {panels.length === 0 && (
            <div className="add-panel-zone">
              <span style={{ color: 'var(--text-muted)' }}>此仪表板暂无面板，点击"+ 添加面板"开始创建</span>
            </div>
          )}
        </div>

        {/* AI 聊天侧边栏 */}
        {chatOpen && (
          <div style={{
            width: 380, flexShrink: 0,
            borderLeft: '1px solid var(--border-color)',
            overflow: 'hidden',
          }}>
            <AIChatDialog
              dashboardId={dashboardId}
              dashboardTitle={displayTitle}
              panelsSummary={panels.map((p: any) => ({
                id: p.id,
                title: p.title,
                type: p.type,
              }))}
              draftJson={draftJson}
              onDraftUpdate={handleDraftUpdate}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function groupPanelsIntoRows(panels: any[]) {
  const sorted = [...panels].sort((a, b) => {
    const ay = a.gridPos?.y ?? 0
    const by = b.gridPos?.y ?? 0
    return ay - by || (a.gridPos?.x ?? 0) - (b.gridPos?.x ?? 0)
  })
  const rows: any[][] = []
  let currentRow: any[] = []
  let currentY = -1
  sorted.forEach((p) => {
    const y = p.gridPos?.y ?? 0
    if (y !== currentY && currentRow.length > 0) { rows.push(currentRow); currentRow = [] }
    currentY = y
    currentRow.push(p)
  })
  if (currentRow.length > 0) rows.push(currentRow)
  return rows
}
