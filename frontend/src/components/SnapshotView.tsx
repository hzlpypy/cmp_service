import { useState, useEffect } from 'react'
import * as api from '../api'
import type { SnapshotRes } from '../api'
import ChartPanel from './ChartPanel'

interface SnapshotViewProps {
  snapshotKey: string
  onClose: () => void
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

export default function SnapshotView({ snapshotKey, onClose }: SnapshotViewProps) {
  const [snap, setSnap] = useState<SnapshotRes | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.getSnapshot(snapshotKey)
      .then(setSnap)
      .catch((e) => setError(e.message || '加载快照失败'))
      .finally(() => setLoading(false))
  }, [snapshotKey])

  if (loading) {
    return (
      <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span style={{ color: 'var(--text-muted)' }}>加载快照中...</span>
      </div>
    )
  }

  if (error || !snap) {
    return (
      <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 16, color: 'var(--text-muted)' }}>{error || '快照不存在'}</div>
        <button className="btn-primary" onClick={onClose}>返回首页</button>
      </div>
    )
  }

  const dj = snap.dashboard_json || { title: '快照', panels: [] }
  const panels: any[] = dj.panels || []
  const isSinglePanel = !!snap.panel_id
  const displayPanels = isSinglePanel
    ? panels.filter((p: any) => p.id === snap.panel_id)
    : panels

  const dataMap = new Map<string, any[][]>()
  const columnMap = new Map<string, string[]>()
  if (snap.panels_data) {
    snap.panels_data.forEach((pd: any) => {
      dataMap.set(pd.panel_id, pd.target || [])
      columnMap.set(pd.panel_id, pd.columns || [])
    })
  }

  const panelRows = groupPanelsIntoRows(displayPanels)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isSinglePanel ? '8px 16px' : '12px 20px',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-card)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h2 style={{ fontSize: isSinglePanel ? 14 : 16, fontWeight: 600, margin: 0 }}>
            {isSinglePanel ? (displayPanels[0]?.title || snap.name || '快照') : (dj.title || snap.name || '快照')}
          </h2>
          <span style={{
            fontSize: 11, color: 'var(--bg-input)', background: 'var(--text-muted)',
            padding: '2px 8px', borderRadius: 10,
          }}>快照</span>
          {snap.name && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{snap.name}</span>}
          {!isSinglePanel && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{displayPanels.length} 个面板</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            创建于 {snap.created_at ? new Date(snap.created_at).toLocaleString('zh-CN') : '-'}
          </div>
        </div>
      </div>

      {/* Body */}
      {isSinglePanel ? (
        /* 单个报表：铺满全屏 */
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {displayPanels.map((panel: any) => {
            const panelData = dataMap.get(panel.id) || []
            return (
              <div key={panel.id} style={{
                height: '100%', display: 'flex', flexDirection: 'column',
              }}>
                <ChartPanel
                  type={panel.type || 'table'}
                  title={panel.title || '未命名'}
                  data={panelData}
                  targets={panel.targets || []}
                  options={panel.options}
                  menuOpen={false}
                  onToggleMenu={() => {}}
                  onEdit={() => {}}
                  onRemove={() => {}}
                  showMenu={false}
                  columns={columnMap.get(panel.id)}
                />
              </div>
            )
          })}
          {displayPanels.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', fontSize: 14 }}>
              此快照中无面板数据
            </div>
          )}
        </div>
      ) : (
        /* 仪表盘快照：与详情页布局一致 */
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div className="dashboard-canvas" style={{ padding: 16 }}>
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
                        menuOpen={false}
                        onToggleMenu={() => {}}
                        onEdit={() => {}}
                        onRemove={() => {}}
                        showMenu={false}
                        columns={columnMap.get(panel.id)}
                      />
                    </div>
                  )
                })}
              </div>
            ))}
            {displayPanels.length === 0 && (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', fontSize: 14 }}>
                此快照中无面板数据
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
