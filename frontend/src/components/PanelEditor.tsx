import { useState, useEffect } from 'react'
import type { PanelDef, TargetDef, DatasourceRes } from '../api'

interface PanelEditorProps {
  /** 当前面板的完整定义 */
  panel: PanelDef
  /** 数据源列表 */
  datasources: DatasourceRes[]
  /** 保存：返回修改后的面板定义 */
  onSave: (updated: PanelDef) => void
  onClose: () => void
}

const CHART_TYPES: { value: PanelDef['type']; label: string; hint: string }[] = [
  { value: 'table', label: '表格', hint: 'SQL 返回多行多列即展示为表格' },
  { value: 'bar', label: '柱状图', hint: '第一列作为X轴(分类)，数值列作为Y轴(柱高)' },
  { value: 'line', label: '折线图', hint: '第一列作为X轴，数值列作为Y轴(折线)' },
  { value: 'pie', label: '饼图', hint: '第一列作为扇形名称，数值列作为扇形大小' },
  { value: 'gauge', label: '仪表盘', hint: '第一行第一列数值作为仪表值' },
]

export default function PanelEditor({ panel, datasources, onSave, onClose }: PanelEditorProps) {
  const [p, setP] = useState<PanelDef>(clonePanel(panel))

  useEffect(() => { setP(clonePanel(panel)) }, [panel])

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
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 620, maxHeight: '90vh' }}>
        <div className="modal-header">
          <h2>编辑面板 - {panel.title}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

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
      </div>
    </div>
  )
}

function clonePanel(p: PanelDef): PanelDef {
  return JSON.parse(JSON.stringify(p))
}
