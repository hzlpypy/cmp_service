import { useState, useEffect } from 'react'
import * as api from '../api'

export default function SnapshotList() {
  const [snaps, setSnaps] = useState<api.SnapshotRes[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try { setSnaps(await api.listSnapshots('')) }
    catch (e: any) { console.error('加载快照失败:', e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const shareLink = `${window.location.origin}/snapshot/`

  const handleDelete = async (key: string) => {
    if (!confirm('确认删除该快照？')) return
    try {
      await api.deleteSnapshot(key)
      setSnaps((prev) => prev.filter((s) => s.snapshot_key !== key))
    } catch (e: any) { alert('删除失败: ' + (e.message || '未知错误')) }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>快照列表</h2>
        <button className="btn-secondary" onClick={load} style={{ fontSize: 12 }}>刷新</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>加载中...</div>
      ) : snaps.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>暂无快照</div>
          <div style={{ fontSize: 12 }}>在仪表盘编辑面板中切换到「共享」Tab 创建快照</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {snaps.map((snap) => {
            const isDashboard = !snap.panel_id
            const dj = snap.dashboard_json || {}
            const panels = dj.panels || []
            const panel = panels.find((p: any) => p.id === snap.panel_id)
            return (
              <div key={snap.snapshot_key} style={{
                border: '1px solid var(--border-color)', borderRadius: 8, padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {snap.name || '未命名快照'}
                    </span>
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 8, whiteSpace: 'nowrap',
                      background: isDashboard ? 'rgba(87,148,242,0.15)' : 'rgba(255,152,48,0.15)',
                      color: isDashboard ? '#5794f2' : '#ff9830',
                    }}>
                      {isDashboard ? '仪表盘' : '单面板'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                    {dj.title || '未知仪表盘'}
                    {!isDashboard && panel ? ` > ${panel.title}` : ''}
                    {isDashboard && panels.length > 0 ? `（${panels.length} 个面板）` : ''}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {shareLink}{snap.snapshot_key}
                  </div>
                </div>
                <button className="btn-sm btn-primary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                  onClick={() => window.open(`/snapshot/${snap.snapshot_key}`, '_blank')}>
                  查看
                </button>
                <button className="btn-sm" style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                  onClick={() => { navigator.clipboard.writeText(`${shareLink}${snap.snapshot_key}`); setCopiedKey(snap.snapshot_key); setTimeout(() => setCopiedKey(null), 2000) }}>
                  {copiedKey === snap.snapshot_key ? '已复制' : '复制链接'}
                </button>
                <button className="btn-sm" style={{ fontSize: 11, color: 'var(--red)', borderColor: 'transparent' }}
                  onClick={() => handleDelete(snap.snapshot_key)}>
                  删除
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}