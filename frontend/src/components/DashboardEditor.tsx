import { useState, useEffect, useCallback } from 'react'
import type { DashboardJSON, PanelDef, TargetDef, DatasourceRes } from '../api'
import * as api from '../api'

interface DashboardEditorProps {
  title: string
  json: DashboardJSON
  onSave: (updated: DashboardJSON) => Promise<void>
  onClose: () => void
}

type EditorTab = 'visual' | 'json'

const CHART_TYPES: { value: PanelDef['type']; label: string; hint: string }[] = [
  { value: 'table', label: '表格', hint: 'SQL 返回多行多列即展示为表格' },
  { value: 'bar', label: '柱状图', hint: 'SQL 第一列作为X轴(分类)，数值列作为Y轴(柱高)' },
  { value: 'line', label: '折线图', hint: 'SQL 第一列作为X轴，数值列作为Y轴(折线)' },
  { value: 'pie', label: '饼图', hint: 'SQL 第一列作为扇形名称，数值列作为扇形大小' },
  { value: 'gauge', label: '仪表盘', hint: 'SQL 第一行的第一列数值作为仪表值' },
]

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function cloneJson(json: DashboardJSON): DashboardJSON {
  return JSON.parse(JSON.stringify(json))
}

/** 获取选中图表类型的提示文本 */
function getChartHint(type: string): string {
  return CHART_TYPES.find((c) => c.value === type)?.hint || ''
}

export default function DashboardEditor({ title, json, onSave, onClose }: DashboardEditorProps) {
  const [tab, setTab] = useState<EditorTab>('visual')
  const [panels, setPanels] = useState<PanelDef[]>([])
  const [jsonText, setJsonText] = useState('')
  const [saving, setSaving] = useState(false)
  const [datasources, setDatasources] = useState<DatasourceRes[]>([])

  useEffect(() => { api.listDatasources().then(setDatasources).catch(() => {}) }, [])

  useEffect(() => {
    const cloned = cloneJson(json)
    setPanels(cloned.panels || [])
    setJsonText(JSON.stringify(cloned, null, 2))
  }, [json])

  // ---- Panel helpers ----
  const updatePanel = useCallback((idx: number, patch: Partial<PanelDef>) => {
    setPanels((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }, [])

  const updateGrid = useCallback((idx: number, field: 'x' | 'y' | 'w' | 'h', value: number) => {
    setPanels((prev) => prev.map((p, i) => i === idx ? { ...p, gridPos: { ...p.gridPos, [field]: value || 0 } } : p))
  }, [])

  const updateTarget = useCallback((panelIdx: number, targetIdx: number, patch: Partial<TargetDef>) => {
    setPanels((prev) => prev.map((p, i) =>
      i === panelIdx ? { ...p, targets: p.targets.map((t, j) => j === targetIdx ? { ...t, ...patch } : t) } : p
    ))
  }, [])

  const addTarget = useCallback((panelIdx: number) => {
    setPanels((prev) => prev.map((p, i) =>
      i === panelIdx ? { ...p, targets: [...p.targets, { refId: String.fromCharCode(65 + p.targets.length), rawSql: '', aliasMap: {}, category: '', metricName: '' }] } : p
    ))
  }, [])

  const removeTarget = useCallback((panelIdx: number, targetIdx: number) => {
    setPanels((prev) => prev.map((p, i) =>
      i === panelIdx ? { ...p, targets: p.targets.filter((_, j) => j !== targetIdx) } : p
    ))
  }, [])

  // ---- Alias helpers ----
  const setAlias = useCallback((panelIdx: number, targetIdx: number, col: string, alias: string) => {
    setPanels((prev) => prev.map((p, i) => {
      if (i !== panelIdx) return p
      const target = { ...p.targets[targetIdx] }
      const am = { ...(target.aliasMap || {}) }
      if (alias) am[col] = alias
      else delete am[col]
      target.aliasMap = am
      return { ...p, targets: p.targets.map((t, j) => j === targetIdx ? target : t) }
    }))
  }, [])

  const addAliasPair = useCallback((panelIdx: number, targetIdx: number) => {
    setPanels((prev) => prev.map((p, i) => {
      if (i !== panelIdx) return p
      const target = { ...p.targets[targetIdx] }
      const am = { ...(target.aliasMap || {}), '': '' }
      target.aliasMap = am
      return { ...p, targets: p.targets.map((t, j) => j === targetIdx ? target : t) }
    }))
  }, [])

  const addPanel = useCallback(() => {
    setPanels((prev) => [...prev, {
      id: uid('panel'),
      title: '新面板',
      type: 'table',
      gridPos: { x: 0, y: prev.length * 8, w: 24, h: 14 },
      datasource_id: datasources.length > 0 ? datasources[0].id : undefined,
      targets: [{ refId: 'A', rawSql: 'SELECT 1', aliasMap: {}, category: '', metricName: '' }],
      options: {},
    }])
  }, [datasources])

  const removePanel = useCallback((idx: number) => setPanels((prev) => prev.filter((_, i) => i !== idx)), [])

  const switchToJson = useCallback(() => {
    setJsonText(JSON.stringify({ title, panels }, null, 2))
    setTab('json')
  }, [title, panels])

  const switchToVisual = useCallback(() => {
    try {
      const p = JSON.parse(jsonText) as DashboardJSON
      setPanels(p.panels || [])
      setTab('visual')
    } catch { alert('JSON 格式错误，请修正后再切换') }
  }, [jsonText])

  const handleSave = async () => {
    setSaving(true)
    try {
      let final: DashboardJSON
      if (tab === 'visual') { final = { title, panels } }
      else { final = JSON.parse(jsonText) }
      await onSave(final)
    } catch (e: any) { alert('保存失败: ' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 860, maxHeight: '92vh' }}>
        <div className="modal-header">
          <h2>编辑仪表板 - {title}</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="editor-tabs">
              <button className={`editor-tab ${tab === 'visual' ? 'active' : ''}`} onClick={() => tab === 'json' ? switchToVisual() : null}>界面编辑</button>
              <button className={`editor-tab ${tab === 'json' ? 'active' : ''}`} onClick={() => tab === 'visual' ? switchToJson() : null}>JSON编辑</button>
            </div>
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>
        </div>

        <div className="modal-body" style={{ maxHeight: '64vh', overflow: 'auto' }}>
          {tab === 'visual' ? (
            <div className="editor-visual">
              {panels.length === 0 && <div className="empty-state" style={{ padding: 32 }}>暂无面板，点击下方按钮添加</div>}

              {panels.map((panel, pi) => {
                const ds = datasources.find((d) => d.id === panel.datasource_id)
                const isMysql = !ds || ds.type === 'mysql'
                return (
                <div key={panel.id} className="editor-panel-card">
                  <div className="editor-panel-card-header">
                    <span>面板 {pi + 1}</span>
                    <button className="btn-sm" onClick={() => removePanel(pi)} style={{ color: 'var(--red)', borderColor: 'transparent', fontSize: 11 }}>删除面板</button>
                  </div>

                  {/* 数据源 + 类型 */}
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>数据源</label>
                      <select value={panel.datasource_id || ''} onChange={(e) => updatePanel(pi, { datasource_id: e.target.value || undefined })}>
                        {datasources.map((d) => (<option key={d.id} value={d.id}>{d.name} ({d.type === 'mysql' ? 'MySQL' : 'HTTP'})</option>))}
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>标题</label>
                      <input value={panel.title} onChange={(e) => updatePanel(pi, { title: e.target.value })} placeholder="面板标题" />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>图表类型</label>
                      <select value={panel.type} onChange={(e) => updatePanel(pi, { type: e.target.value as PanelDef['type'] })}>
                        {CHART_TYPES.map((ct) => (<option key={ct.value} value={ct.value}>{ct.label}</option>))}
                      </select>
                    </div>
                  </div>

                  {/* 图表类型提示 */}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5, background: 'var(--bg-input)', padding: '4px 8px', borderRadius: 3 }}>
                    {getChartHint(panel.type)}
                  </div>

                  {/* 布局 */}
                  <div className="form-group">
                    <label>布局 (X / Y / 宽 / 高 - 24格栅格)</label>
                    <div className="form-row" style={{ gap: 6 }}>
                      <input type="number" value={panel.gridPos.x} onChange={(e) => updateGrid(pi, 'x', Number(e.target.value))} style={{ width: 56 }} title="X" />
                      <input type="number" value={panel.gridPos.y} onChange={(e) => updateGrid(pi, 'y', Number(e.target.value))} style={{ width: 56 }} title="Y" />
                      <input type="number" value={panel.gridPos.w} onChange={(e) => updateGrid(pi, 'w', Number(e.target.value))} style={{ width: 56 }} title="宽" min={1} max={24} />
                      <input type="number" value={panel.gridPos.h} onChange={(e) => updateGrid(pi, 'h', Number(e.target.value))} style={{ width: 56 }} title="高" min={1} />
                    </div>
                  </div>

                  {/* SQL 查询区 */}
                  {panel.targets.map((target, ti) => (
                    <div key={ti} className="editor-target-block">
                      <div className="editor-target-block-header">
                        <span className="editor-target-ref">{target.refId}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {isMysql ? 'MySQL 查询' : '数据查询'}
                        </span>
                        {panel.targets.length > 1 && (
                          <button className="btn-sm" onClick={() => removeTarget(pi, ti)} style={{ marginLeft: 'auto', color: 'var(--red)', borderColor: 'transparent', fontSize: 16, padding: '0 6px' }}>&times;</button>
                        )}
                      </div>

                      {/* SQL Textarea */}
                      <textarea
                        value={target.rawSql || ''}
                        onChange={(e) => updateTarget(pi, ti, { rawSql: e.target.value })}
                        placeholder={panel.type === 'table'
                          ? 'SELECT market, date, weekday FROM calendar LIMIT 100'
                          : panel.type === 'bar' || panel.type === 'line'
                            ? 'SELECT metric_name AS name, current_value AS value FROM net_work_metrics LIMIT 20'
                            : panel.type === 'pie'
                              ? 'SELECT metric_name AS name, current_value AS value FROM net_work_metrics LIMIT 10'
                              : 'SELECT current_value FROM net_work_metrics LIMIT 1'}
                        style={{
                          width: '100%', minHeight: 80, fontFamily: 'monospace', fontSize: 12,
                          background: '#1e1e2e', color: '#cdd6f4', border: '1px solid var(--border-color)',
                          borderRadius: 4, padding: 10, resize: 'vertical', outline: 'none',
                          lineHeight: 1.6, tabSize: 2,
                        }}
                        spellCheck={false}
                      />

                      {/* 别名映射 */}
                      <div style={{ marginTop: 6 }}>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>列别名映射（数据库列名 → 显示名称）</span>
                          <button className="btn-sm" onClick={() => addAliasPair(pi, ti)} style={{ fontSize: 10 }}>+ 添加别名</button>
                        </label>
                        {target.aliasMap && Object.keys(target.aliasMap).length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                            {Object.entries(target.aliasMap).map(([col, alias], ai) => (
                              <div key={ai} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <input
                                  value={col}
                                  onChange={(e) => {
                                    const newCol = e.target.value
                                    const am = { ...(target.aliasMap || {}) }
                                    delete am[col]
                                    am[newCol] = alias || newCol
                                    setAlias(pi, ti, '', '') // force no-op
                                    // Need to replace the whole entry
                                    updateTarget(pi, ti, { aliasMap: am })
                                  }}
                                  placeholder="列名"
                                  style={{ flex: 1, fontSize: 11, padding: '3px 6px' }}
                                />
                                <span style={{ color: 'var(--text-muted)' }}>→</span>
                                <input
                                  value={alias}
                                  onChange={(e) => setAlias(pi, ti, col, e.target.value)}
                                  placeholder="显示别名"
                                  style={{ flex: 1, fontSize: 11, padding: '3px 6px' }}
                                />
                                <button className="btn-sm" onClick={() => setAlias(pi, ti, col, '')}
                                  style={{ color: 'var(--red)', borderColor: 'transparent', fontSize: 14, padding: '0 4px', lineHeight: 1 }}>
                                  &times;
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>暂未配置别名</div>
                        )}
                      </div>
                    </div>
                  ))}

                  <button className="btn-sm" onClick={() => addTarget(pi)} style={{ marginTop: 4 }}>+ 添加查询</button>
                </div>
              )})}

              <button className="btn-secondary" onClick={addPanel} style={{ width: '100%', marginTop: 8, padding: '12px', borderStyle: 'dashed' }}>+ 添加面板</button>
            </div>
          ) : (
            <div>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                style={{ width: '100%', minHeight: 420, background: '#1e1e2e', color: '#cdd6f4',
                  border: '1px solid var(--border-color)', borderRadius: 4, padding: 12,
                  fontFamily: 'monospace', fontSize: 12, resize: 'vertical', outline: 'none', lineHeight: 1.6 }}
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)' }}>
            {tab === 'visual' ? `${panels.length} 个面板` : '直接编辑 JSON，切换标签同步到界面编辑器'}
          </div>
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}
