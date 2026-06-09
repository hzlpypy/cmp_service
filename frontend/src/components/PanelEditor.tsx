import { useState, useEffect } from 'react'
import type { PanelDef, TargetDef, DatasourceRes, DashboardJSON, PanelDataRes } from '../api'
import * as api from '../api'

interface PanelEditorProps {
  panel: PanelDef
  datasources: DatasourceRes[]
  dashboardId: string
  draftJson?: any
  panelsData?: PanelDataRes[]
  onSave: (updated: PanelDef) => void
  onClose: () => void
}

type EditorTab = 'edit' | 'share'

const CHART_TYPES: { value: PanelDef['type']; label: string; hint: string }[] = [
  { value: 'table', label: '表格', hint: 'SQL 返回多行多列即展示为表格' },
  { value: 'bar', label: '柱状图', hint: '第一列作为X轴(分类)，数值列作为Y轴(柱高)' },
  { value: 'line', label: '折线图', hint: '第一列作为X轴，数值列作为Y轴(折线)' },
  { value: 'pie', label: '饼图', hint: '第一列作为扇形名称，数值列作为扇形大小' },
  { value: 'gauge', label: '仪表盘', hint: '第一行第一列数值作为仪表值' },
]

export default function PanelEditor({ panel, datasources, dashboardId, draftJson, panelsData, onSave, onClose }: PanelEditorProps) {
  const [p, setP] = useState<PanelDef>(clonePanel(panel))
  const [tab, setTab] = useState<EditorTab>('edit')

  useEffect(() => { setP(clonePanel(panel)) }, [panel])

  // ---- 快照状态 ----
  const [snapName, setSnapName] = useState('')
  const [snapshots, setSnapshots] = useState<api.SnapshotRes[]>([])
  const [snapLoading, setSnapLoading] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => { if (tab === 'share') { loadSnapshots() } }, [tab])

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
      let latestData: any[][] = []

      // 2. 尝试获取最新的面板查询结果
      try {
        const dr = await api.getDashboardData(dashboardId, undefined, undefined, mergedJson as any)
        const pd = dr.panels_data?.find((d: any) => d.panel_id === panel.id)
        if (pd && pd.target && pd.target.length > 0) {
          latestData = pd.target
        }
      } catch {
        // API 查询失败，使用空数据
      }

      // 3. 确保有数据才创建快照
      const hasData = latestData.length > 0 && latestData.some((series: any) => series.length > 0)
      if (!hasData) {
        alert('暂无预览数据，请先点击工具栏的「刷新」按钮获取数据后再创建快照')
        return
      }

      // 4. 构建 panels_data
      const panelData = {
        panel_id: panel.id,
        panel_title: p.title || panel.title,
        panel_type: p.type,
        datasource_id: p.datasource_id || '',
        target: latestData,
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

  const refLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 640, maxHeight: '90vh' }}>
        <div className="modal-header">
          <h2>编辑面板 - {panel.title}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '0 20px' }}>
          <button onClick={() => setTab('edit')} style={{ padding: '8px 16px', background: 'none', border: 'none', borderBottom: tab === 'edit' ? '2px solid var(--primary)' : '2px solid transparent', color: tab === 'edit' ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: tab === 'edit' ? 600 : 400 }}>编辑</button>
          <button onClick={() => setTab('share')} style={{ padding: '8px 16px', background: 'none', border: 'none', borderBottom: tab === 'share' ? '2px solid var(--primary)' : '2px solid transparent', color: tab === 'share' ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: tab === 'share' ? 600 : 400 }}>共享</button>
        </div>

        {/* 编辑 Tab */}
        {tab === 'edit' && (<>
        <div className="modal-body" style={{ maxHeight: '60vh', overflow: 'auto' }}>
          <div className="form-group">
            <label>数据源</label>
            <select value={p.datasource_id || ''} onChange={(e) => update({ datasource_id: e.target.value || undefined, datasource: undefined } as any)}>
              {datasources.map((ds) => (<option key={ds.id} value={ds.id}>{ds.name} ({ds.type === 'mysql' ? 'MySQL' : 'HTTP'})</option>))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>标题</label>
              <input value={p.title} onChange={(e) => update({ title: e.target.value })} placeholder="面板标题" />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>图表类型</label>
              <select value={p.type} onChange={(e) => update({ type: e.target.value as PanelDef['type'] })}>
                {CHART_TYPES.map((ct) => (<option key={ct.value} value={ct.value}>{ct.label}</option>))}
              </select>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, background: 'var(--bg-input)', padding: '4px 8px', borderRadius: 3 }}>
            {CHART_TYPES.find((c) => c.value === p.type)?.hint}
          </div>

          <div className="form-group">
            <label>布局 (X / Y / 宽 / 高 - 24格栅格)</label>
            <div className="form-row" style={{ gap: 6 }}>
              <input type="number" value={p.gridPos?.x ?? 0} onChange={(e) => updateGrid('x', Number(e.target.value))} style={{ width: 56 }} title="X" />
              <input type="number" value={p.gridPos?.y ?? 0} onChange={(e) => updateGrid('y', Number(e.target.value))} style={{ width: 56 }} title="Y" />
              <input type="number" value={p.gridPos?.w ?? 24} onChange={(e) => updateGrid('w', Number(e.target.value))} style={{ width: 56 }} title="宽" min={1} max={24} />
              <input type="number" value={p.gridPos?.h ?? 8} onChange={(e) => updateGrid('h', Number(e.target.value))} style={{ width: 56 }} title="高" min={1} />
            </div>
          </div>

          {/* 多查询提示 */}
          {isMultiQuery && (p.targets || []).length > 1 && (
            <div style={{ fontSize: 11, color: 'var(--info)', marginBottom: 4, background: 'rgba(137,180,250,0.08)', padding: '4px 8px', borderRadius: 3 }}>
              多个查询分别对应图表中的不同数据系列，请为每个查询设置图例名称。
            </div>
          )}

          {p.targets.map((target, ti) => (
            <div key={ti} className="editor-target-block">
              <div className="editor-target-block-header">
                <span className="editor-target-ref">{target.refId}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>SQL 查询</span>
                {p.targets.length > 1 && (
                  <button className="btn-sm" onClick={() => removeTarget(ti)}
                    style={{ color: 'var(--red)', borderColor: 'transparent', fontSize: 12, padding: '0 6px', marginLeft: 'auto' }}
                    title="移除此查询">&#x1F5D1;</button>
                )}
              </div>

              {/* 图例名称 - 对折线图/柱状图的多个查询尤为重要 */}
              {isMultiQuery && (
                <div style={{ marginBottom: 6 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>图例名称</label>
                  <input
                    value={target.metricName || ''}
                    onChange={(e) => updateTarget(ti, { metricName: e.target.value })}
                    placeholder={p.targets.length > 1 ? `如：北京机房、上海机房` : `图例显示名称（可选）`}
                    style={{ width: '100%', fontSize: 12, padding: '4px 8px' }}
                  />
                </div>
              )}

              <textarea
                value={target.rawSql || ''}
                onChange={(e) => updateTarget(ti, { rawSql: e.target.value })}
                placeholder={'SELECT market, date, weekday FROM calendar LIMIT 100'}
                style={{ width: '100%', minHeight: 80, fontFamily: 'monospace', fontSize: 12,
                  background: '#1e1e2e', color: '#cdd6f4', border: '1px solid var(--border-color)',
                  borderRadius: 4, padding: 10, resize: 'vertical', outline: 'none', lineHeight: 1.6 }}
                spellCheck={false}
              />

              <div style={{ marginTop: 6 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>列别名映射</span>
                  <button className="btn-sm" onClick={() => addAliasPair(ti)} style={{ fontSize: 10 }}>+ 添加</button>
                </label>
                {target.aliasMap && Object.keys(target.aliasMap).length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                    {Object.entries(target.aliasMap).map(([col, alias], ai) => (
                      <div key={ai} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input value={col} onChange={(e) => {
                          const am = { ...(target.aliasMap || {}) }; delete am[col]
                          am[e.target.value] = alias || e.target.value
                          updateTarget(ti, { aliasMap: am })
                        }} placeholder="列名" style={{ flex: 1, fontSize: 11, padding: '3px 6px' }} />
                        <span style={{ color: 'var(--text-muted)' }}>→</span>
                        <input value={alias} onChange={(e) => setAlias(ti, col, e.target.value)}
                          placeholder="显示别名" style={{ flex: 1, fontSize: 11, padding: '3px 6px' }} />
                        <button className="btn-sm" onClick={() => setAlias(ti, col, '')}
                          style={{ color: 'var(--red)', borderColor: 'transparent', fontSize: 14, padding: '0 4px' }}>&times;</button>
                      </div>
                    ))}
                  </div>
                ) : <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>暂未配置别名</div>}
              </div>
            </div>
          ))}

          {/* 添加查询按钮 */}
          <button className="btn-sm" onClick={addTarget}
            style={{ width: '100%', marginTop: 4, padding: '8px 0', borderStyle: 'dashed', color: 'var(--text-muted)' }}>
            + 添加查询
          </button>
          {isMultiQuery && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>
              折线图和柱状图支持多条查询，每条查询作为图表中的一个数据系列。
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={() => onSave(p)}>保存</button>
        </div>
        </>)}

        {/* 共享 Tab */}
        {tab === 'share' && (
        <div className="modal-body" style={{ maxHeight: '60vh', overflow: 'auto', padding: '16px 20px' }}>
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ marginBottom: 8, fontSize: 14 }}>分享链接</h4>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              创建快照后，可复制链接分享给其他人查看当前的报表状态和数据。
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input value={snapName} onChange={(e) => setSnapName(e.target.value)}
                placeholder="快照名称（可选）"
                style={{ flex: 1, fontSize: 12, padding: '6px 10px' }} />
              <button className="btn-primary" onClick={handleCreateSnapshot}
                style={{ fontSize: 12, whiteSpace: 'nowrap' }}>创建快照</button>
            </div>
          </div>

          <div>
            <h4 style={{ marginBottom: 8, fontSize: 14 }}>
              已有快照 {snapshots.length > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({snapshots.length})</span>}
            </h4>
            {snapLoading ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>加载中...</div>
            ) : snapshots.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                暂无快照，点击"创建快照"保存当前状态
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
        )}

      </div>
    </div>
  )
}

function clonePanel(p: PanelDef): PanelDef {
  return JSON.parse(JSON.stringify(p))
}
