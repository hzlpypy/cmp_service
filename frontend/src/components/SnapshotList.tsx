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
        <button className="btn-sm" onClick={load} title="刷新数据">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          刷新
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>加载中...</div>
      ) : snaps.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>暂无快照</div>
          <div style={{ fontSize: 12 }}>在仪表板编辑面板中切换到「共享」Tab 创建快照</div>
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
                border: '1px solid var(--border-color)', borderLeft: '3px solid #e53935',
                borderRadius: 8, padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--bg-card)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'box-shadow 0.15s, border-color 0.15s',
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
                      {isDashboard ? '仪表板' : '单面板'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" />
                      <rect x="14" y="3" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" />
                    </svg>
                    <span>{dj.title || '未知仪表板'}</span>
                    {!isDashboard && panel && (
                      <>
                        <span style={{ color: 'var(--text-muted)' }}>/</span>
                        <span>{panel.title}</span>
                      </>
                    )}
                    {isDashboard && panels.length > 0 && (
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({panels.length} 个面板)</span>
                    )}
                  </div>
                  <div className="pe-snapshot-link" style={{ marginBottom: 2 }}>
                    {shareLink}{snap.snapshot_key}
                  </div>
                </div>
                <button className="btn-sm" style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                  onClick={() => window.open(`/snapshot/${snap.snapshot_key}`, '_blank')}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  查看
                </button>
                <button className="btn-sm" style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                  onClick={() => { navigator.clipboard.writeText(`${shareLink}${snap.snapshot_key}`); setCopiedKey(snap.snapshot_key); setTimeout(() => setCopiedKey(null), 2000) }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  {copiedKey === snap.snapshot_key ? '已复制' : '复制链接'}
                </button>
                <button className="btn-sm" style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                  onClick={() => handleDelete(snap.snapshot_key)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
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