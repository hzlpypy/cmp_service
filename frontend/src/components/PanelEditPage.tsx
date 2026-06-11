import { useState, useEffect } from 'react'
import ChartPanel from './ChartPanel'
import type { PanelDef, TargetDef, DatasourceRes, DashboardJSON, PanelDataRes, MetricRow } from '../api'
import * as api from '../api'

export interface PanelEditPageProps {
  panel: PanelDef
  datasources: DatasourceRes[]
  dashboardId: string
  draftJson?: any
  panelsData?: PanelDataRes[]
  onSave: (updated: PanelDef) => void
  onBack: () => void
}

type SidebarTab = 'query' | 'options' | 'share'

const CHART_TYPES: { value: PanelDef['type']; label: string; icon: string; hint: string }[] = [
  { value: 'table', label: '表格', icon: '⊞', hint: 'SQL 返回多行多列即展示为表格' },
  { value: 'bar', label: '柱状图', icon: '▐', hint: '第一列作为X轴(分类)，数值列作为Y轴(柱高)' },
  { value: 'line', label: '折线图', icon: '⌇', hint: '第一列作为X轴，数值列作为Y轴(折线)' },
  { value: 'pie', label: '饼图', icon: '◉', hint: '第一列作为扇形名称，数值列作为扇形大小' },
  { value: 'gauge', label: '仪表盘', icon: '◎', hint: '第一行第一列数值作为仪表值' },
]

const refLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/* ── 可折叠分区组件 ── */
function Section({ title, defaultOpen = true, children, badge }: {
  title: string; defaultOpen?: boolean; children: React.ReactNode; badge?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="pe-section">
      <div className="pe-section-header" onClick={() => setOpen(!open)}>
        <svg width="10" height="10" viewBox="0 0 10 10" style={{
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s', flexShrink: 0,
        }} fill="currentColor">
          <path d="M3 1L8 5L3 9z" />
        </svg>
        <span style={{ flex: 1 }}>{title}</span>
        {badge && <span className="pe-badge">{badge}</span>}
      </div>
      {open && <div className="pe-section-body">{children}</div>}
    </div>
  )
}

export default function PanelEditPage({ panel, datasources, dashboardId, draftJson, panelsData, onSave, onBack }: PanelEditPageProps) {
  const [p, setP] = useState<PanelDef>(clonePanel(panel))
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('query')
  const [liveData, setLiveData] = useState<MetricRow[][]>([])
  const [liveColumns, setLiveColumns] = useState<string[]>([])
  const [queryLoading, setQueryLoading] = useState(false)
  const [hasUnsaved, setHasUnsaved] = useState(false)

  useEffect(() => { setP(clonePanel(panel)) }, [panel])

  // 从 panelsData 中获取当前面板的数据用于预览
  useEffect(() => {
    const pd = panelsData?.find((d) => d.panel_id === panel.id)
    if (pd) {
      setLiveData(pd.target || [])
      setLiveColumns(pd.columns || [])
    }
  }, [panelsData, panel.id])

  // 标记有未保存的更改
  useEffect(() => { setHasUnsaved(true) }, [p])

  // ---- 快照状态 ----
  const [snapName, setSnapName] = useState('')
  const [snapshots, setSnapshots] = useState<api.SnapshotRes[]>([])
  const [snapLoading, setSnapLoading] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => { if (sidebarTab === 'share') { loadSnapshots() } }, [sidebarTab])

  const loadSnapshots = async () => {
    setSnapLoading(true)
    try { setSnapshots(await api.listSnapshots(dashboardId, panel.id)) } catch {}
    finally { setSnapLoading(false) }
  }

  const handleCreateSnapshot = async () => {
    if (!draftJson) return
    try {
      // 1. 合并当前编辑状态到 dashboard_json
      const panels: any[] = (draftJson.panels || []).map((dp: any) =>
        dp.id === p.id ? { ...p } : dp
      )
      if (!panels.find((dp: any) => dp.id === p.id)) {
        panels.push({ ...p })
      }
      const mergedJson = { ...draftJson, panels }
      let latestData: MetricRow[][] = liveData

      // 2. 尝试获取最新的面板查询结果
      try {
        const dr = await api.getDashboardData(dashboardId, undefined, undefined, mergedJson as DashboardJSON)
        const pd = dr.panels_data?.find((d) => d.panel_id === panel.id)
        if (pd && pd.target && pd.target.length > 0) {
          latestData = pd.target
          setLiveData(pd.target)
          setLiveColumns(pd.columns || [])
        }
      } catch {
        // API 查询失败，尝试使用已有的 liveData
      }

      // 3. 确保有数据才创建快照
      const hasData = latestData.length > 0 && latestData.some(series => series.length > 0)
      if (!hasData) {
        alert('暂无预览数据，请先点击工具栏的「刷新」按钮获取数据后再创建快照')
        return
      }

      // 4. 构建 panels_data
      const panelData: api.PanelDataRes = {
        panel_id: panel.id,
        panel_title: p.title || panel.title,
        panel_type: p.type,
        datasource_id: p.datasource_id || '',
        target: latestData,
        columns: liveColumns,
      }

      const snap = await api.createSnapshot({
        dashboard_id: dashboardId, panel_id: panel.id,
        name: snapName || `${panel.title} 快照`,
        dashboard_json: mergedJson as DashboardJSON,
        panels_data: [panelData],
      })
      setSnapshots((prev) => [snap, ...prev])
      setSnapName('')
    } catch (e: any) { alert('创建快照失败: ' + (e.message || '未知错误')) }
  }

  const handleDeleteSnapshot = async (key: string) => {
    if (!confirm('确认删除该快照？')) return
    try {
      await api.deleteSnapshot(key)
      setSnapshots((prev) => prev.filter((s) => s.snapshot_key !== key))
    } catch (e: any) { alert('删除失败: ' + (e.message || '未知错误')) }
  }

  const shareLink = `${window.location.origin}/snapshot/`

  // ---- 刷新预览数据 ----
  const handleRefreshPreview = async () => {
    if (!draftJson) return
    setQueryLoading(true)
    try {
      const panels: any[] = (draftJson.panels || []).map((dp: any) =>
        dp.id === p.id ? { ...p } : dp
      )
      if (!panels.find((dp: any) => dp.id === p.id)) {
        panels.push({ ...p })
      }
      const mergedJson = { ...draftJson, panels }
      const dr = await api.getDashboardData(dashboardId, undefined, undefined, mergedJson as DashboardJSON)
      const pd = dr.panels_data?.find((d) => d.panel_id === panel.id)
      if (pd) {
        setLiveData(pd.target || [])
        setLiveColumns(pd.columns || [])
      }
    } catch (e: any) {
      alert('查询失败: ' + (e.message || '未知错误'))
    } finally {
      setQueryLoading(false)
    }
  }

  const handleSave = () => {
    setHasUnsaved(false)
    onSave(p)
  }

  const handleDiscard = () => {
    if (hasUnsaved && !confirm('确定要丢弃所有更改吗？')) return
    setP(clonePanel(panel))
    setHasUnsaved(false)
  }

  const update = (patch: Partial<PanelDef>) => setP((prev) => ({ ...prev, ...patch }))
  const updateGrid = (field: 'x' | 'y' | 'w' | 'h', value: number) => {
    setP((prev) => ({ ...prev, gridPos: { ...prev.gridPos, [field]: value || 0 } }))
  }

  const updateTarget = (ti: number, patch: Partial<TargetDef>) => {
    setP((prev) => ({
      ...prev,
      targets: prev.targets.map((t, i) => (i === ti ? { ...t, ...patch } : t)),
    }))
  }

  const setAlias = (ti: number, col: string, alias: string) => {
    setP((prev) => ({
      ...prev,
      targets: prev.targets.map((t, i) => {
        if (i !== ti) return t
        const am = { ...(t.aliasMap || {}) }
        if (alias) am[col] = alias
        else delete am[col]
        return { ...t, aliasMap: am }
      }),
    }))
  }

  const addAliasPair = (ti: number) => {
    updateTarget(ti, { aliasMap: { ...(p.targets[ti]?.aliasMap || {}), '': '' } })
  }

  const addTarget = () => {
    const nextRef = refLabels[p.targets.length] || `Q${p.targets.length}`
    setP((prev) => ({
      ...prev,
      targets: [...prev.targets, { refId: nextRef, rawSql: '', aliasMap: {}, category: '', metricName: '' }],
    }))
  }

  const removeTarget = (ti: number) => {
    setP((prev) => ({
      ...prev,
      targets: prev.targets.filter((_, i) => i !== ti),
    }))
  }

  const isMultiQuery = p.type === 'line' || p.type === 'bar'
  const panelType = (liveData || []).length > 0 ? p.type : 'table'
  const currentChartInfo = CHART_TYPES.find((c) => c.value === p.type)

  return (
    <div className="pe-root">
      {/* ── 顶部工具栏 ── */}
      <div className="pe-toolbar">
        <div className="pe-toolbar-left">
          <button className="pe-toolbar-btn" onClick={onBack} title="返回仪表盘">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M10 2L4 8l6 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div className="pe-breadcrumb">
            <span className="pe-breadcrumb-link" onClick={onBack}>仪表盘</span>
            <span className="pe-breadcrumb-sep">/</span>
            <span className="pe-breadcrumb-current">{p.title || '未命名面板'}</span>
          </div>
        </div>
        <div className="pe-toolbar-right">
          {hasUnsaved && (
            <button className="pe-toolbar-btn pe-btn-discard" onClick={handleDiscard} title="丢弃更改">
              丢弃
            </button>
          )}
          <button className="pe-toolbar-btn" onClick={handleRefreshPreview} disabled={queryLoading} title="刷新预览数据">
            {queryLoading ? (
              <span className="pe-spinner" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M12.5 7a5.5 5.5 0 11-1.63-3.9l-.87.87A4.25 4.25 0 1011.75 7H12.5zm-.5-5h1v3h-3V4h1.72A5.48 5.48 0 007 1.5 5.5 5.5 0 001.5 7h1A4.5 4.5 0 0112 2.72V2z" fillRule="evenodd"/></svg>
            )}
          </button>
          <button className="pe-btn-save" onClick={handleSave}>
            保存
          </button>
        </div>
      </div>

      {/* ── 主体区域：左预览 + 右侧边栏 ── */}
      <div className="pe-body">
        {/* 左侧：可视化预览 */}
        <div className="pe-preview">
          <div className="pe-preview-header">
            <span className="pe-preview-type-badge">
              {currentChartInfo?.icon} {currentChartInfo?.label}
            </span>
            <span className="pe-preview-hint">{currentChartInfo?.hint}</span>
          </div>
          <div className="pe-preview-canvas">
            <ChartPanel
              key={`${panel.id}-${panelType}`}
              type={panelType}
              title={p.title || '预览'}
              data={liveData}
              targets={p.targets || []}
              options={p.options}
              columns={liveColumns}
              menuOpen={false}
              onToggleMenu={() => {}}
              onEdit={() => {}}
              onRemove={() => {}}
              showMenu={false}
            />
          </div>
        </div>

        {/* 右侧：侧边栏 */}
        <div className="pe-sidebar">
          {/* 侧边栏 Tab 切换 */}
          <div className="pe-sidebar-tabs">
            {(['query', 'options', 'share'] as SidebarTab[]).map((t) => (
              <button
                key={t}
                className={`pe-sidebar-tab ${sidebarTab === t ? 'active' : ''}`}
                onClick={() => setSidebarTab(t)}
              >
                {t === 'query' && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M1 1h5v5H1V1zm7 0h5v5H8V1zM1 8h5v5H1V8zm7 0h5v5H8V8z" opacity=".7"/></svg>
                )}
                {t === 'options' && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M7 4.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5zM7 3a4 4 0 100 8 4 4 0 000-8z" opacity=".7"/></svg>
                )}
                {t === 'share' && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M10.5 9a2.5 2.5 0 10-2.17-1.26L5.67 9.5a2.5 2.5 0 100 2l2.66-1.76A2.49 2.49 0 0010.5 9z" opacity=".7"/></svg>
                )}
                {t === 'query' ? '查询' : t === 'options' ? '选项' : '共享'}
              </button>
            ))}
          </div>

          {/* 侧边栏内容 */}
          <div className="pe-sidebar-content">
            {/* ═══ 查询 Tab ═══ */}
            {sidebarTab === 'query' && (
              <>
                <Section title="数据源" defaultOpen={true}>
                  <div className="pe-field">
                    <select value={p.datasource_id || ''} onChange={(e) => update({ datasource_id: e.target.value || undefined, datasource: undefined } as any)} className="pe-select">
                      <option value="">选择数据源...</option>
                      {datasources.map((ds) => (
                        <option key={ds.id} value={ds.id}>{ds.name} ({ds.type === 'mysql' ? 'MySQL' : 'HTTP'})</option>
                      ))}
                    </select>
                  </div>
                </Section>

                <Section title="SQL 查询" defaultOpen={true} badge={p.targets.length > 1 ? `${p.targets.length}` : undefined}>
                  {p.targets.map((target, ti) => (
                    <div key={ti} className="pe-query-block">
                      <div className="pe-query-header">
                        <span className="pe-query-ref">{target.refId}</span>
                        <span className="pe-query-label">查询</span>
                        <div style={{ flex: 1 }} />
                        {p.targets.length > 1 && (
                          <button className="pe-query-remove" onClick={() => removeTarget(ti)} title="移除查询">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2 2l8 8m0-8l-8 8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                          </button>
                        )}
                      </div>

                      {isMultiQuery && (
                        <div className="pe-field" style={{ marginBottom: 8 }}>
                          <label className="pe-label-sm">图例名称</label>
                          <input
                            value={target.metricName || ''}
                            onChange={(e) => updateTarget(ti, { metricName: e.target.value })}
                            placeholder="如：北京机房、上海机房"
                            className="pe-input-sm"
                          />
                        </div>
                      )}

                      <textarea
                        value={target.rawSql || ''}
                        onChange={(e) => updateTarget(ti, { rawSql: e.target.value })}
                        placeholder="SELECT market, date, weekday FROM calendar LIMIT 100"
                        className="pe-sql-editor"
                        spellCheck={false}
                        rows={4}
                      />

                      <div className="pe-alias-section">
                        <div className="pe-alias-header">
                          <span className="pe-label-sm">列别名映射</span>
                          <button className="pe-link-btn" onClick={() => addAliasPair(ti)}>+ 添加</button>
                        </div>
                        {target.aliasMap && Object.keys(target.aliasMap).length > 0 ? (
                          <div className="pe-alias-list">
                            {Object.entries(target.aliasMap).map(([col, alias], ai) => (
                              <div key={ai} className="pe-alias-row">
                                <input value={col} onChange={(e) => {
                                  const am = { ...(target.aliasMap || {}) }; delete am[col]
                                  am[e.target.value] = alias || e.target.value
                                  updateTarget(ti, { aliasMap: am })
                                }} placeholder="列名" className="pe-input-xs" />
                                <span className="pe-alias-arrow">→</span>
                                <input value={alias} onChange={(e) => setAlias(ti, col, e.target.value)}
                                  placeholder="别名" className="pe-input-xs" />
                                <button className="pe-alias-remove" onClick={() => setAlias(ti, col, '')}>
                                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M1 1l8 8m0-8l-8 8" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/></svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="pe-hint-text">暂未配置别名</span>
                        )}
                      </div>
                    </div>
                  ))}

                  <button className="pe-add-query-btn" onClick={addTarget}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                    添加查询
                  </button>
                  {isMultiQuery && (
                    <div className="pe-hint-block">
                      折线图和柱状图支持多条查询，每条查询作为图表中的一个数据系列。
                    </div>
                  )}
                </Section>
              </>
            )}

            {/* ═══ 选项 Tab ═══ */}
            {sidebarTab === 'options' && (
              <>
                <Section title="面板标题" defaultOpen={true}>
                  <div className="pe-field">
                    <input value={p.title} onChange={(e) => update({ title: e.target.value })} placeholder="面板标题" className="pe-input" />
                  </div>
                </Section>

                <Section title="可视化类型" defaultOpen={true}>
                  <div className="pe-chart-type-grid">
                    {CHART_TYPES.map((ct) => (
                      <button
                        key={ct.value}
                        className={`pe-chart-type-card ${p.type === ct.value ? 'active' : ''}`}
                        onClick={() => update({ type: ct.value as PanelDef['type'] })}
                        title={ct.hint}
                      >
                        <span className="pe-chart-type-icon">{ct.icon}</span>
                        <span className="pe-chart-type-label">{ct.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="pe-hint-block" style={{ marginTop: 8 }}>
                    {currentChartInfo?.hint}
                  </div>
                </Section>

                <Section title="布局" defaultOpen={false}>
                  <div className="pe-grid-fields">
                    <div className="pe-field">
                      <label className="pe-label-sm">X</label>
                      <input type="number" value={p.gridPos?.x ?? 0} onChange={(e) => updateGrid('x', Number(e.target.value))} className="pe-input-xs" />
                    </div>
                    <div className="pe-field">
                      <label className="pe-label-sm">Y</label>
                      <input type="number" value={p.gridPos?.y ?? 0} onChange={(e) => updateGrid('y', Number(e.target.value))} className="pe-input-xs" />
                    </div>
                    <div className="pe-field">
                      <label className="pe-label-sm">宽</label>
                      <input type="number" value={p.gridPos?.w ?? 24} onChange={(e) => updateGrid('w', Number(e.target.value))} className="pe-input-xs" min={1} max={24} />
                    </div>
                    <div className="pe-field">
                      <label className="pe-label-sm">高</label>
                      <input type="number" value={p.gridPos?.h ?? 8} onChange={(e) => updateGrid('h', Number(e.target.value))} className="pe-input-xs" min={1} />
                    </div>
                  </div>
                  <div className="pe-hint-text" style={{ marginTop: 4 }}>24 栅格布局系统</div>
                </Section>

                {p.type === 'table' && (
                  <Section title="表格选项" defaultOpen={true}>
                    <label className="pe-toggle">
                      <input
                        type="checkbox"
                        checked={!!p.options?.enableColumnFilter}
                        onChange={(e) => update({ options: { ...p.options, enableColumnFilter: e.target.checked } })}
                      />
                      <span className="pe-toggle-slider" />
                      <span className="pe-toggle-label">启用列筛选</span>
                    </label>
                    <div className="pe-hint-text" style={{ marginTop: 4, marginLeft: 0 }}>
                      开启后，表格每列表头旁会出现筛选按钮，点击可按该列值过滤行。
                    </div>
                    <label className="pe-toggle" style={{ marginTop: 12 }}>
                      <input
                        type="checkbox"
                        checked={!!p.options?.enableCellMerge}
                        onChange={(e) => {
                          const checked = e.target.checked
                          update({ options: { ...p.options, enableCellMerge: checked, mergeColumns: checked ? (p.options?.mergeColumns || '') : undefined } })
                        }}
                      />
                      <span className="pe-toggle-slider" />
                      <span className="pe-toggle-label">合并单元格</span>
                    </label>
                    <div className="pe-hint-text" style={{ marginTop: 4, marginLeft: 0 }}>
                      同一列中连续相同的值自动合并为一个单元格（类似 Excel 合并）。
                    </div>
                    {p.options?.enableCellMerge && (
                      <div style={{ marginTop: 8 }}>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>选择合并列</label>
                        {liveColumns.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {liveColumns.map((col) => {
                              const selected = ((p.options?.mergeColumns as string) || '').split(',').map((s: string) => s.trim()).filter(Boolean)
                              const checked = selected.includes(col)
                              return (
                                <label key={col} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const next = checked
                                        ? selected.filter((s: string) => s !== col)
                                        : [...selected, col]
                                      update({ options: { ...p.options, mergeColumns: next.join(',') } })
                                    }}
                                  />
                                  {col}
                                </label>
                              )
                            })}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            暂无列数据，请先点击「刷新」获取预览数据。
                          </div>
                        )}
                        <div className="pe-hint-text" style={{ marginTop: 6, marginLeft: 0 }}>
                          仅对勾选的列进行合并，未勾选则不合并。
                        </div>
                      </div>
                    )}

                    {/* 条件告警 */}
                    <label className="pe-toggle" style={{ marginTop: 12 }}>
                      <input
                        type="checkbox"
                        checked={!!p.options?.enableCellAlert}
                        onChange={(e) => {
                          const checked = e.target.checked
                          update({ options: { ...p.options, enableCellAlert: checked, cellAlerts: checked ? (p.options?.cellAlerts || []) : undefined, alertMode: checked ? (p.options?.alertMode || 'absolute') : undefined } })
                        }}
                      />
                      <span className="pe-toggle-slider" />
                      <span className="pe-toggle-label">条件告警</span>
                    </label>
                    <div className="pe-hint-text" style={{ marginTop: 4, marginLeft: 0 }}>
                      当单元格数值满足条件时，以指定颜色高亮显示。
                    </div>
                    {p.options?.enableCellAlert && (
                      <div style={{ marginTop: 10 }}>
                        {/* 模式选择 */}
                        <div style={{ marginBottom: 8 }}>
                          <label style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 8 }}>比较模式</label>
                          <select
                            value={(p.options?.alertMode as string) || 'absolute'}
                            onChange={(e) => update({ options: { ...p.options, alertMode: e.target.value } })}
                            style={{ fontSize: 11, padding: '3px 6px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 3 }}
                          >
                            <option value="absolute">绝对值</option>
                            <option value="percentage">百分比（该列最大值=100%）</option>
                          </select>
                        </div>

                        {/* 规则列表 */}
                        {((p.options?.cellAlerts as any[]) || []).map((rule: any, idx: number) => (
                          <div key={idx} style={{
                            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
                            padding: '6px 8px', background: 'var(--bg-input)', borderRadius: 4, flexWrap: 'wrap',
                          }}>
                            {/* 列选择 */}
                            <select
                              value={rule.column || ''}
                              onChange={(e) => {
                                const alerts = [...((p.options?.cellAlerts as any[]) || [])]
                                alerts[idx] = { ...alerts[idx], column: e.target.value }
                                update({ options: { ...p.options, cellAlerts: alerts } })
                              }}
                              style={{ fontSize: 11, padding: '3px 6px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 3 }}
                            >
                              <option value="">选择列</option>
                              {liveColumns.map((col) => (
                                <option key={col} value={col}>{col}</option>
                              ))}
                            </select>
                            {/* 操作符 */}
                            <select
                              value={rule.op || '>'}
                              onChange={(e) => {
                                const alerts = [...((p.options?.cellAlerts as any[]) || [])]
                                alerts[idx] = { ...alerts[idx], op: e.target.value }
                                update({ options: { ...p.options, cellAlerts: alerts } })
                              }}
                              style={{ fontSize: 11, padding: '3px 6px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 3 }}
                            >
                              <option value=">">&gt;</option>
                              <option value=">=">&gt;=</option>
                              <option value="<">&lt;</option>
                              <option value="<=">&lt;=</option>
                              <option value="=">=</option>
                              <option value="!=">!=</option>
                            </select>
                            {/* 阈值 */}
                            <input
                              type="number"
                              value={rule.value ?? ''}
                              onChange={(e) => {
                                const alerts = [...((p.options?.cellAlerts as any[]) || [])]
                                alerts[idx] = { ...alerts[idx], value: e.target.value === '' ? '' : Number(e.target.value) }
                                update({ options: { ...p.options, cellAlerts: alerts } })
                              }}
                              placeholder="阈值"
                              style={{ width: 60, fontSize: 11, padding: '3px 6px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 3 }}
                            />
                            {/* 颜色选择 */}
                            <input
                              type="color"
                              value={rule.color || '#ffcc00'}
                              onChange={(e) => {
                                const alerts = [...((p.options?.cellAlerts as any[]) || [])]
                                alerts[idx] = { ...alerts[idx], color: e.target.value }
                                update({ options: { ...p.options, cellAlerts: alerts } })
                              }}
                              title="选择颜色"
                              style={{ width: 24, height: 24, border: 'none', borderRadius: 3, cursor: 'pointer', padding: 0, background: 'transparent' }}
                            />
                            {/* 删除 */}
                            <button
                              onClick={() => {
                                const alerts = ((p.options?.cellAlerts as any[]) || []).filter((_: any, i: number) => i !== idx)
                                update({ options: { ...p.options, cellAlerts: alerts } })
                              }}
                              title="删除规则"
                              style={{ fontSize: 11, padding: '2px 6px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: 3, cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}

                        {/* 添加规则 */}
                        <button
                          onClick={() => {
                            const alerts = [...((p.options?.cellAlerts as any[]) || []), { column: '', op: '>', value: 1, color: '#ffcc00' }]
                            update({ options: { ...p.options, cellAlerts: alerts } })
                          }}
                          style={{
                            fontSize: 11, padding: '4px 12px', marginTop: 4,
                            background: 'var(--bg-input)', color: 'var(--text-primary)',
                            border: '1px dashed var(--border-color)', borderRadius: 4, cursor: 'pointer',
                          }}
                        >
                          + 添加告警规则
                        </button>
                      </div>
                    )}
                  </Section>
                )}

                {isMultiQuery && (p.targets || []).length > 1 && (
                  <Section title="多查询提示" defaultOpen={false}>
                    <div className="pe-hint-block">
                      多个查询分别对应图表中的不同数据系列，请为每个查询设置图例名称。
                    </div>
                  </Section>
                )}
              </>
            )}

            {/* ═══ 共享 Tab ═══ */}
            {sidebarTab === 'share' && (
              <>
                <Section title="创建快照" defaultOpen={true}>
                  <p className="pe-section-desc">
                    创建快照后，可复制链接分享给其他人查看当前的报表状态和数据。
                  </p>
                  <div className="pe-field">
                    <input value={snapName} onChange={(e) => setSnapName(e.target.value)}
                      placeholder="快照名称（可选）" className="pe-input" />
                  </div>
                  <button className="pe-btn-primary-sm" onClick={handleCreateSnapshot}>
                    创建快照
                  </button>
                </Section>

                <Section title="已有快照" defaultOpen={true} badge={snapshots.length > 0 ? `${snapshots.length}` : undefined}>
                  {snapLoading ? (
                    <div className="pe-empty-state">加载中...</div>
                  ) : snapshots.length === 0 ? (
                    <div className="pe-empty-state">暂无快照，点击上方"创建快照"保存当前状态</div>
                  ) : (
                    <div className="pe-snapshot-list">
                      {snapshots.map((snap) => (
                        <div key={snap.snapshot_key} className="pe-snapshot-item">
                          <div className="pe-snapshot-info">
                            <div className="pe-snapshot-name">{snap.name || '未命名快照'}</div>
                            <div className="pe-snapshot-link" title={`${shareLink}${snap.snapshot_key}`}>
                              {shareLink}{snap.snapshot_key}
                            </div>
                          </div>
                          <div className="pe-snapshot-actions">
                            <button className="pe-icon-btn" title="查看快照"
                              onClick={() => window.open(`/snapshot/${snap.snapshot_key}`, '_blank')}>
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M7 3a4 4 0 100 8 4 4 0 000-8zm0 1a3 3 0 110 6 3 3 0 010-6z" opacity=".7"/><path d="M7 1C3.5 1 .5 3.5 0 7c.5 3.5 3.5 6 7 6s6.5-2.5 7-6c-.5-3.5-3.5-6-7-6zm0 1.5C10 2.5 12.5 4.5 13 7c-.5 2.5-3 4.5-6 4.5S1.5 9.5 1 7c.5-2.5 3-4.5 6-4.5z" opacity=".7"/></svg>
                            </button>
                            <button className="pe-icon-btn" title="复制链接"
                              onClick={() => { navigator.clipboard.writeText(`${shareLink}${snap.snapshot_key}`); setCopiedKey(snap.snapshot_key); setTimeout(() => setCopiedKey(null), 2000) }}>
                              {copiedKey === snap.snapshot_key ? (
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="var(--green)"><path d="M3 7l3 3 5-6" stroke="var(--green)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M4 1a1 1 0 00-1 1v1H2a1 1 0 00-1 1v8a1 1 0 001 1h7a1 1 0 001-1v-1h1a1 1 0 001-1V2a1 1 0 00-1-1H4zm5 10H2V4h7v7zm2-2h-1V4a1 1 0 00-1-1H4V2h7v7z" opacity=".7"/></svg>
                              )}
                            </button>
                            <button className="pe-icon-btn pe-icon-btn-danger" title="删除快照"
                              onClick={() => handleDeleteSnapshot(snap.snapshot_key)}>
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M4 3V2a1 1 0 011-1h4a1 1 0 011 1v1h2a.5.5 0 010 1h-.5l-.5 7.5a1 1 0 01-1 .5H4a1 1 0 01-1-.5L2.5 4H2a.5.5 0 010-1h2zm1-1v1h4V2H5z" opacity=".7"/></svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function clonePanel(p: PanelDef): PanelDef {
  return JSON.parse(JSON.stringify(p))
}
