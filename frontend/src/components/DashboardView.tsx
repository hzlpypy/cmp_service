import { useState, useEffect, useCallback } from 'react'
import ChartPanel from './ChartPanel'
import PanelEditor from './PanelEditor'
import * as api from '../api'
import type { DashboardRes, DashboardDataRes, DashboardJSON, MetricRow, PanelDef, DatasourceRes } from '../api'

interface DashboardViewProps {
  dashboardId: string
  onBack: () => void
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export default function DashboardView({ dashboardId, onBack }: DashboardViewProps) {
  const [dashboard, setDashboard] = useState<DashboardRes | null>(null)
  const [dataRes, setDataRes] = useState<DashboardDataRes | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [showJson, setShowJson] = useState(false)
  const [datasources, setDatasources] = useState<DatasourceRes[]>([])

  // 单面板编辑器
  const [editingPanel, setEditingPanel] = useState<PanelDef | null>(null)
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
    } catch (e: any) {
      setError(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [dashboardId, timePreset, customFrom, customTo])

  const toggleMenu = (panelId: string) => {
    setOpenMenuId((prev) => (prev === panelId ? null : panelId))
  }

  // ---- 单面板编辑 ----
  const handleEditPanel = (panelId: string) => {
    setOpenMenuId(null)
    const dj = (dashboard?.dashboard_json as any) || {}
    const panels: any[] = dj.panels || []
    const panel = panels.find((p: any) => p.id === panelId)
    if (panel) setEditingPanel(panel as PanelDef)
  }

  const handleSavePanel = async (updated: PanelDef) => {
    if (!dashboard) return
    const dj = (dashboard.dashboard_json as any) || {}
    const panels: any[] = [...(dj.panels || [])]
    const idx = panels.findIndex((p) => panels.indexOf(p) >= 0 && p.id === updated.id)
    // Find by id properly
    const realIdx = panels.findIndex((p: any) => p.id === updated.id)
    if (realIdx >= 0) panels[realIdx] = updated
    const newDj = { ...dj, panels }
    await api.updateDashboard(dashboard.id, dashboard.title, dashboard.folder_id, newDj as DashboardJSON)
    setEditingPanel(null)
    loadData()
  }

  // ---- 仪表板元信息编辑 ----
  const handleOpenMetaEdit = () => {
    setMetaTitle(dashboard?.title || '')
    setShowMetaEdit(true)
  }

  const handleSaveMeta = async () => {
    if (!dashboard || !metaTitle.trim()) return
    const dj = (dashboard.dashboard_json as any) || {}
    const newDj = { ...dj, title: metaTitle.trim() }
    await api.updateDashboard(dashboard.id, metaTitle.trim(), dashboard.folder_id, newDj as DashboardJSON)
    setShowMetaEdit(false)
    loadData()
  }

  // ---- 添加面板 ----
  const handleAddPanel = async () => {
    if (!dashboard) return
    setShowNewPanel(false)
    const dj = (dashboard.dashboard_json as any) || {}
    const panels: any[] = [...(dj.panels || [])]
    const ds = datasources[0]
    panels.push({
      id: uid('panel'),
      title: '新面板',
      type: 'table',
      gridPos: { x: 0, y: panels.length * 8, w: 24, h: 8 },
      datasource_id: ds?.id,
      targets: [{ refId: 'A', rawSql: 'SELECT 1', aliasMap: {}, category: '', metricName: '' }],
      options: {},
    })
    await api.updateDashboard(dashboard.id, dashboard.title, dashboard.folder_id, { ...dj, panels } as DashboardJSON)
    loadData()
  }

  // ---- 删除面板 ----
  const handleRemovePanel = async (panelId: string) => {
    if (!dashboard) return
    const dj = dashboard.dashboard_json as any
    const newPanels = (dj?.panels || []).filter((p: any) => p.id !== panelId)
    try {
      await api.updateDashboard(dashboard.id, dashboard.title, dashboard.folder_id, { ...dj, panels: newPanels } as any)
      loadData()
    } catch (e: any) { alert('删除失败: ' + e.message) }
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

  const dj = dashboard.dashboard_json as any
  const panels = dj?.panels || []

  // 建立 panel_id → 图表类型 的映射，用于时间范围过滤
  const panelTypeMap = new Map<string, string>()
  panels.forEach((p: any) => { if (p.id) panelTypeMap.set(p.id, p.type) })

  const dataMap = new Map<string, MetricRow[][]>()
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
    })
  }
  const panelRows = groupPanelsIntoRows(panels)

  return (
    <div className="dashboard-view">
      {/* ---- Toolbar ---- */}
      <div className="dashboard-toolbar">
        <div className="toolbar-left">
          <button className="btn-sm" onClick={onBack}>← 返回</button>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{dashboard.title}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{panels.length} 个面板</span>
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
          <button className="btn-sm" onClick={loadData} title="刷新数据">&#x1F504; 刷新</button>
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
                修改仪表板的基础信息，不影响面板配置。
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowMetaEdit(false)}>取消</button>
              <button className="btn-primary" onClick={handleSaveMeta}>保存</button>
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
                将在当前仪表板中新增一个空面板，您可以在添加后点击面板上的 ⋮ 菜单进行编辑。
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowNewPanel(false)}>取消</button>
              <button className="btn-primary" onClick={handleAddPanel}>添加</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- 单面板编辑 ---- */}
      {editingPanel && (
        <PanelEditor
          panel={editingPanel}
          datasources={datasources}
          onSave={handleSavePanel}
          onClose={() => setEditingPanel(null)}
        />
      )}

      {/* ---- JSON Viewer ---- */}
      {showJson && (
        <div className="modal-overlay" onClick={() => setShowJson(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 700, maxHeight: '85vh' }}>
            <div className="modal-header">
              <h2>仪表板JSON定义</h2>
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
      <div className="dashboard-canvas">
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
