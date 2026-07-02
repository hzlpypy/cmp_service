import { useState, useEffect, useMemo } from 'react'
import * as api from '../api'

interface VersionHistoryProps {
  dashboardId: string
  onClose: () => void
  onRestore: () => void
}

// JSON diff 行类型
type DiffLineType = 'added' | 'removed' | 'unchanged'

interface DiffLine {
  type: DiffLineType
  content: string
  lineNumFrom?: number
  lineNumTo?: number
}

// 计算两个 JSON 的差异行
function computeJsonDiff(jsonFrom: Record<string, unknown>, jsonTo: Record<string, unknown>): DiffLine[] {
  const linesFrom = JSON.stringify(jsonFrom, null, 2).split('\n')
  const linesTo = JSON.stringify(jsonTo, null, 2).split('\n')

  // 使用 LCS 算法计算差异
  const lcs = computeLCS(linesFrom, linesTo)
  const diff: DiffLine[] = []

  let i = 0, j = 0, k = 0
  let lineNumFrom = 1, lineNumTo = 1

  while (i < linesFrom.length || j < linesTo.length) {
    if (k < lcs.length && i < linesFrom.length && linesFrom[i] === lcs[k] && j < linesTo.length && linesTo[j] === lcs[k]) {
      // 匹配行
      diff.push({ type: 'unchanged', content: linesFrom[i], lineNumFrom, lineNumTo })
      i++; j++; k++
      lineNumFrom++; lineNumTo++
    } else if (i < linesFrom.length && (k >= lcs.length || linesFrom[i] !== lcs[k])) {
      // 删除行
      diff.push({ type: 'removed', content: linesFrom[i], lineNumFrom })
      i++
      lineNumFrom++
    } else if (j < linesTo.length && (k >= lcs.length || linesTo[j] !== lcs[k])) {
      // 新增行
      diff.push({ type: 'added', content: linesTo[j], lineNumTo })
      j++
      lineNumTo++
    }
  }

  return diff
}

// LCS 算法
function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length, n = b.length
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // 回溯获取 LCS
  const lcs: string[] = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1])
      i--; j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  return lcs
}

export default function VersionHistory({ dashboardId, onClose, onRestore }: VersionHistoryProps) {
  const [versions, setVersions] = useState<api.VersionBriefRes[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVersion, setSelectedVersion] = useState<api.VersionRes | null>(null)
  const [selectedForCompare, setSelectedForCompare] = useState<number[]>([])
  const [diff, setDiff] = useState<api.VersionDiffRes | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showJsonDiff, setShowJsonDiff] = useState(false)

  // 计算 JSON diff
  const jsonDiffLines = useMemo(() => {
    if (!diff) return []
    return computeJsonDiff(diff.json_from, diff.json_to)
  }, [diff])

  // 统计变更行数
  const diffStats = useMemo(() => {
    const added = jsonDiffLines.filter(l => l.type === 'added').length
    const removed = jsonDiffLines.filter(l => l.type === 'removed').length
    return { added, removed }
  }, [jsonDiffLines])

  useEffect(() => {
    loadVersions()
  }, [dashboardId])

  const loadVersions = async () => {
    setLoading(true)
    try {
      const list = await api.listVersions(dashboardId)
      setVersions(list)
    } catch (e) {
      console.error('加载版本列表失败', e)
    } finally {
      setLoading(false)
    }
  }

  const handleViewVersion = async (version: number) => {
    try {
      const v = await api.getVersion(dashboardId, version)
      setSelectedVersion(v)
      setDiff(null)
    } catch (e) {
      alert('获取版本详情失败')
    }
  }

  const toggleSelectForCompare = (version: number) => {
    setSelectedForCompare(prev => {
      if (prev.includes(version)) {
        return prev.filter(v => v !== version)
      }
      if (prev.length >= 2) {
        return [prev[1], version]
      }
      return [...prev, version]
    })
    setDiff(null)
    setShowJsonDiff(false)
  }

  const handleCompare = async () => {
    if (selectedForCompare.length !== 2) {
      alert('请选择两个版本进行对比')
      return
    }
    const [v1, v2] = selectedForCompare
    try {
      const result = await api.compareVersions(dashboardId, Math.min(v1, v2), Math.max(v1, v2))
      setDiff(result)
      setSelectedVersion(null)
      setShowJsonDiff(false)
    } catch (e) {
      alert('对比失败')
    }
  }

  const handleRestore = async (version: number) => {
    if (!confirm(`确定要切换到版本 ${version} 吗？`)) return
    setRestoring(true)
    try {
      await api.restoreVersion(dashboardId, version)
      alert('切换成功')
      onRestore()
      loadVersions()
    } catch (e: any) {
      alert('切换失败: ' + e.message)
    } finally {
      setRestoring(false)
    }
  }

  const handleDelete = async (version: number) => {
    if (!confirm(`确定要删除版本 ${version} 吗？此操作不可恢复。`)) return
    setDeleting(true)
    try {
      await api.deleteVersion(dashboardId, version)
      alert('删除成功')
      loadVersions()
      if (selectedVersion?.version === version) {
        setSelectedVersion(null)
      }
      setSelectedForCompare(prev => prev.filter(v => v !== version))
      setDiff(null)
    } catch (e: any) {
      alert('删除失败: ' + e.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 1000, maxHeight: '90vh' }}>
        <div className="modal-header">
          <h2>版本历史</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflow: 'auto', display: 'flex', gap: 16 }}>
          {/* 左侧：版本列表 */}
          <div style={{ flex: '0 0 280px', borderRight: '1px solid var(--border-color)', paddingRight: 16 }}>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 500 }}>版本列表 ({versions.length})</span>
              {selectedForCompare.length === 2 && (
                <button className="btn-sm btn-primary" onClick={handleCompare}>对比</button>
              )}
            </div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 20 }}>加载中...</div>
            ) : versions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>暂无版本记录</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {versions.map((v) => {
                  const isSelectedForView = selectedVersion?.version === v.version
                  const isSelectedForCompare = selectedForCompare.includes(v.version)
                  return (
                    <div
                      key={v.id}
                      style={{
                        padding: '10px 12px',
                        border: `2px solid ${isSelectedForCompare ? 'var(--primary)' : v.is_current ? 'var(--primary)' : 'var(--border-color)'}`,
                        borderRadius: 6,
                        cursor: 'pointer',
                        background: isSelectedForView ? 'var(--bg-input)' : isSelectedForCompare ? 'rgba(var(--primary-rgb), 0.1)' : v.is_current ? 'rgba(var(--primary-rgb), 0.05)' : 'transparent',
                      }}
                      onClick={() => handleViewVersion(v.version)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={isSelectedForCompare}
                            onChange={() => toggleSelectForCompare(v.version)}
                            onClick={(e) => e.stopPropagation()}
                            title="选择用于对比"
                          />
                          <span style={{ fontWeight: 500 }}>V{v.version}</span>
                          {v.is_current && (
                            <span style={{
                              fontSize: 10, padding: '1px 6px', borderRadius: 10,
                              background: 'var(--primary)', color: '#fff', fontWeight: 500,
                            }}>当前</span>
                          )}
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(v.created_at).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-secondary)' }}>{v.title}</div>
                      {v.message && <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>{v.message}</div>}
                      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                        <button
                          className="btn-sm"
                          onClick={(e) => { e.stopPropagation(); handleRestore(v.version) }}
                          disabled={restoring}
                        >
                          切换
                        </button>
                        <button
                          className="btn-sm"
                          style={{ color: 'var(--danger)' }}
                          onClick={(e) => { e.stopPropagation(); handleDelete(v.version) }}
                          disabled={deleting}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 右侧：版本详情/对比结果 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {diff ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontWeight: 500 }}>版本对比</span>
                  <button className="btn-sm" onClick={() => setDiff(null)}>关闭对比</button>
                </div>

                {/* 版本信息 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div style={{ padding: 12, background: 'var(--bg-input)', borderRadius: 6, border: '2px solid var(--primary)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>V{diff.version_from}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{diff.title_from}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {new Date(diff.created_at_from).toLocaleString('zh-CN')}
                    </div>
                  </div>
                  <div style={{ padding: 12, background: 'var(--bg-input)', borderRadius: 6, border: '2px solid var(--success)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>V{diff.version_to}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{diff.title_to}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {new Date(diff.created_at_to).toLocaleString('zh-CN')}
                    </div>
                  </div>
                </div>

                {/* 变更统计 */}
                <div style={{ padding: 12, background: 'var(--bg-card)', borderRadius: 6, marginBottom: 16 }}>
                  <div style={{ fontWeight: 500, marginBottom: 8 }}>报表变更统计</div>
                  <div style={{ display: 'flex', gap: 24 }}>
                    <div>
                      <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: 18 }}>
                        +{diff.diff_json.panels?.added_count || 0}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>新增</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--danger)', fontWeight: 600, fontSize: 18 }}>
                        -{diff.diff_json.panels?.removed_count || 0}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>删除</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--warning)', fontWeight: 600, fontSize: 18 }}>
                        ~{diff.diff_json.panels?.modified_count || 0}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>修改</span>
                    </div>
                  </div>

                  {/* 详细变更列表 */}
                  {diff.diff_json.panels && (
                    <div style={{ marginTop: 12, fontSize: 12 }}>
                      {diff.diff_json.panels.added && diff.diff_json.panels.added.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <span style={{ color: 'var(--success)' }}>新增报表：</span>
                          {diff.diff_json.panels.added.map(p => p.title).join('、')}
                        </div>
                      )}
                      {diff.diff_json.panels.removed && diff.diff_json.panels.removed.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <span style={{ color: 'var(--danger)' }}>删除报表：</span>
                          {diff.diff_json.panels.removed.map(p => p.title).join('、')}
                        </div>
                      )}
                      {diff.diff_json.panels.modified && diff.diff_json.panels.modified.length > 0 && (
                        <div>
                          <span style={{ color: 'var(--warning)' }}>修改报表：</span>
                          {diff.diff_json.panels.modified.map(p => p.title).join('、')}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* JSON 差异（可折叠） */}
                <div style={{ marginBottom: 8 }}>
                  <button
                    className="btn-sm"
                    onClick={() => setShowJsonDiff(!showJsonDiff)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <span>{showJsonDiff ? '▼' : '▶'}</span>
                    <span>JSON 差异</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      ({diffStats.added} 行新增, {diffStats.removed} 行删除)
                    </span>
                  </button>
                </div>

                {showJsonDiff && (
                  <div style={{
                    background: '#1e1e2e',
                    borderRadius: 6,
                    overflow: 'auto',
                    maxHeight: 400,
                    fontSize: 11,
                    lineHeight: 1.5,
                  }}>
                    <div style={{ display: 'flex', fontFamily: 'monospace' }}>
                      {/* 左侧：行号 + 内容 */}
                      <div style={{ flex: 1, overflow: 'auto' }}>
                        {jsonDiffLines.map((line, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              background: line.type === 'removed' ? 'rgba(255, 0, 0, 0.15)' : line.type === 'added' ? 'rgba(0, 255, 0, 0.15)' : 'transparent',
                            }}
                          >
                            {/* 行号 */}
                            <div style={{
                              width: 40,
                              padding: '0 8px',
                              color: 'var(--text-muted)',
                              textAlign: 'right',
                              borderRight: '1px solid #333',
                              background: '#282828',
                              userSelect: 'none',
                            }}>
                              {line.type === 'removed' ? line.lineNumFrom : line.type === 'added' ? '' : line.lineNumFrom}
                            </div>
                            {/* 标记 */}
                            <div style={{
                              width: 20,
                              textAlign: 'center',
                              color: line.type === 'removed' ? '#ff6b6b' : line.type === 'added' ? '#51cf66' : 'var(--text-muted)',
                              background: '#282828',
                              userSelect: 'none',
                            }}>
                              {line.type === 'removed' ? '-' : line.type === 'added' ? '+' : ' '}
                            </div>
                            {/* 内容 */}
                            <div style={{
                              padding: '0 8px',
                              color: '#cdd6f4',
                              whiteSpace: 'pre',
                              minWidth: 0,
                            }}>
                              {line.content}
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* 右侧：行号 */}
                      <div style={{ width: 40, background: '#282828', borderLeft: '1px solid #333' }}>
                        {jsonDiffLines.map((line, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: '0 8px',
                              color: 'var(--text-muted)',
                              textAlign: 'right',
                              height: 18,
                              lineHeight: '18px',
                              background: line.type === 'added' ? 'rgba(0, 255, 0, 0.15)' : 'transparent',
                            }}
                          >
                            {line.type === 'added' ? line.lineNumTo : line.type === 'removed' ? '' : line.lineNumTo}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : selectedVersion ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontWeight: 500 }}>版本 V{selectedVersion.version} 详情</span>
                  <button className="btn-sm" onClick={() => setSelectedVersion(null)}>关闭详情</button>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <strong>标题:</strong> {selectedVersion.title}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <strong>创建时间:</strong> {new Date(selectedVersion.created_at).toLocaleString('zh-CN')}
                </div>
                {selectedVersion.message && (
                  <div style={{ marginBottom: 12 }}>
                    <strong>说明:</strong> {selectedVersion.message}
                  </div>
                )}
                <div style={{ marginBottom: 8 }}>
                  <strong>JSON 定义:</strong>
                </div>
                <pre style={{
                  background: '#1e1e2e',
                  color: '#cdd6f4',
                  padding: 12,
                  borderRadius: 6,
                  overflow: 'auto',
                  maxHeight: 400,
                  fontSize: 11,
                  lineHeight: 1.5,
                }}>
                  {JSON.stringify(selectedVersion.dashboard_json, null, 2)}
                </pre>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                <p>点击左侧版本查看详情</p>
                <p>勾选两个版本后点击"对比"进行对比</p>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <div style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)' }}>
            每次保存仪表板时会自动创建版本记录
          </div>
          <button className="btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}