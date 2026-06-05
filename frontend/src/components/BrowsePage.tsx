import { useState, useEffect } from 'react'
import * as api from '../api'
import type { FolderRes } from '../api'
import { sampleDashboards } from '../mock/dashboardSamples'

interface BrowsePageProps {
  onOpenDashboard: (id: string) => void
}

const SVG_ICONS: Record<string, JSX.Element> = {
  folder: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="#fc9908">
      <path d="M1.5 3a.5.5 0 0 1 .5-.5h4.25l1.5 1.5H14a.5.5 0 0 1 .5.5v.5H1.5V3z" />
      <path d="M1.5 5h13v7.5a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5V5z" opacity="0.6" />
    </svg>
  ),
  dash: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" opacity="0.8">
      <rect x="1" y="1" width="5" height="14" rx="1" />
      <rect x="8" y="6" width="7" height="9" rx="1" />
      <rect x="8" y="2" width="3" height="3" rx="0.5" />
    </svg>
  ),
}

export default function BrowsePage({ onOpenDashboard }: BrowsePageProps) {
  const [folders, setFolders] = useState<FolderRes[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [searchText, setSearchText] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [showNewDashboard, setShowNewDashboard] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newDashboardTitle, setNewDashboardTitle] = useState('')
  const [selectedFolderId, setSelectedFolderId] = useState('')
  const [selectedSample, setSelectedSample] = useState('bar')
  const [showJsonEdit, setShowJsonEdit] = useState(false)
  const [editingDashboard, setEditingDashboard] = useState<any>(null)
  const [jsonEditText, setJsonEditText] = useState('')

  const loadFolders = async () => {
    try {
      const res = await api.listFolders()
      setFolders(res.list)
      if (expandedFolders.size === 0) {
        setExpandedFolders(new Set(res.list.map((f) => f.id)))
      }
    } catch (e: any) {
      console.error('加载文件夹失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadFolders() }, [])

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ---- 文件夹 CRUD ----
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await api.createFolder(newFolderName.trim())
      setNewFolderName('')
      setShowNewFolder(false)
      loadFolders()
    } catch (e: any) { alert('创建文件夹失败: ' + e.message) }
  }

  const handleDeleteFolder = async (id: string) => {
    if (!confirm('确定删除该文件夹及其下所有仪表板?')) return
    try {
      await api.deleteFolder(id)
      loadFolders()
    } catch (e: any) { alert('删除失败: ' + e.message) }
  }

  // ---- 仪表板 CRUD ----
  const handleCreateDashboard = async () => {
    if (!newDashboardTitle.trim() || !selectedFolderId) return
    const sampleDef = sampleDashboards.find((s) => s.key === selectedSample)
    try {
      const db = await api.createDashboard(
        newDashboardTitle.trim(),
        selectedFolderId,
        sampleDef?.json || { title: newDashboardTitle.trim(), panels: [] },
      )
      setNewDashboardTitle('')
      setShowNewDashboard(false)
      loadFolders()
      onOpenDashboard(db.id)
    } catch (e: any) { alert('创建仪表板失败: ' + e.message) }
  }

  const handleDeleteDashboard = async (id: string) => {
    if (!confirm('确定删除此仪表板?')) return
    try {
      await api.deleteDashboard(id)
      loadFolders()
    } catch (e: any) { alert('删除失败: ' + e.message) }
  }

  const handleEditDashboardJson = async (dashboardId: string) => {
    try {
      const db = await api.getDashboard(dashboardId)
      setEditingDashboard(db)
      setJsonEditText(JSON.stringify(db.dashboard_json, null, 2))
      setShowJsonEdit(true)
    } catch (e: any) { alert('加载仪表板失败: ' + e.message) }
  }

  const handleSaveDashboardJson = async () => {
    if (!editingDashboard) return
    try {
      const newJson = JSON.parse(jsonEditText)
      await api.updateDashboard(editingDashboard.id, editingDashboard.title, editingDashboard.folder_id, newJson)
      setShowJsonEdit(false)
      loadFolders()
    } catch (e: any) { alert('保存失败: ' + e.message) }
  }

  // 筛选
  const allDashboards = folders.flatMap((f) =>
    (f.dashboards || []).map((d) => ({ ...d, folderTitle: f.title, folderId: f.id }))
  )
  const filteredDashboards = searchText
    ? allDashboards.filter((d) => d.title.toLowerCase().includes(searchText.toLowerCase()))
    : []

  if (loading) return <div className="browse-page"><div className="empty-state">加载中...</div></div>

  return (
    <div className="browse-page">
      <div className="browse-header">
        <h1 className="browse-title">仪表板</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="search-wrap">
            <span className="search-icon">&#x1F50D;</span>
            <input
              className="browse-search"
              placeholder="按名称搜索仪表板..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <button className="btn-sm" onClick={() => setShowNewFolder(true)}>+ 新建文件夹</button>
          <button className="btn-sm" onClick={() => setShowNewDashboard(true)}>+ 新建仪表板</button>
        </div>
      </div>

      {/* ---- New Folder Modal ---- */}
      {showNewFolder && (
        <div className="modal-overlay" onClick={() => setShowNewFolder(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>新建文件夹</h2>
              <button className="modal-close" onClick={() => setShowNewFolder(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>文件夹名称</label>
                <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="输入文件夹名称" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowNewFolder(false)}>取消</button>
              <button className="btn-primary" onClick={handleCreateFolder}>创建</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- New Dashboard Modal ---- */}
      {showNewDashboard && (
        <div className="modal-overlay" onClick={() => setShowNewDashboard(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>新建仪表板</h2>
              <button className="modal-close" onClick={() => setShowNewDashboard(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>仪表板名称</label>
                <input value={newDashboardTitle} onChange={(e) => setNewDashboardTitle(e.target.value)} placeholder="输入仪表板名称" autoFocus />
              </div>
              <div className="form-group">
                <label>所属文件夹</label>
                <select value={selectedFolderId} onChange={(e) => setSelectedFolderId(e.target.value)}>
                  <option value="">请选择文件夹</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.title}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>图表模板</label>
                <select value={selectedSample} onChange={(e) => setSelectedSample(e.target.value)}>
                  {sampleDashboards.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowNewDashboard(false)}>取消</button>
              <button className="btn-primary" onClick={handleCreateDashboard}>创建</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Edit JSON Modal ---- */}
      {showJsonEdit && editingDashboard && (
        <div className="modal-overlay" onClick={() => setShowJsonEdit(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 700, maxHeight: '85vh' }}>
            <div className="modal-header">
              <h2>编辑仪表板JSON - {editingDashboard.title}</h2>
              <button className="modal-close" onClick={() => setShowJsonEdit(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <textarea
                value={jsonEditText}
                onChange={(e) => setJsonEditText(e.target.value)}
                style={{
                  width: '100%', minHeight: 400,
                  background: 'var(--bg-input)', color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)', borderRadius: 4,
                  padding: 12, fontFamily: 'monospace', fontSize: 12,
                  resize: 'vertical', outline: 'none',
                }}
              />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowJsonEdit(false)}>取消</button>
              <button className="btn-primary" onClick={handleSaveDashboardJson}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Search Results ---- */}
      {searchText && (
        <div>
          {filteredDashboards.length === 0 ? (
            <div className="empty-state">未找到匹配的仪表板</div>
          ) : (
            <div className="dashboard-card-grid">
              {filteredDashboards.map((db) => (
                <div key={db.id} className="dashboard-card" onClick={() => onOpenDashboard(db.id)}>
                  <div className="dashboard-card-top">
                    <div className="dashboard-card-icon">{SVG_ICONS.dash}</div>
                    <div className="dashboard-card-info">
                      <div className="dashboard-card-name">{db.title}</div>
                      <div className="dashboard-card-folder">{db.folderTitle}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- Folder Tree ---- */}
      {!searchText && folders.map((folder) => {
        const dashboards = folder.dashboards || []
        const isExpanded = expandedFolders.has(folder.id)
        return (
          <div key={folder.id} className="folder-group">
            <div className="folder-header" onClick={() => toggleFolder(folder.id)}>
              <span className="folder-arrow">{isExpanded ? '▼' : '▶'}</span>
              <span className="folder-icon">{SVG_ICONS.folder}</span>
              <span className="folder-title">{folder.title}</span>
              <span className="folder-count">{dashboards.length} 个仪表板</span>
              <div className="folder-actions">
                <button className="folder-action-btn" onClick={(e) => {
                  e.stopPropagation()
                  setSelectedFolderId(folder.id)
                  setShowNewDashboard(true)
                }}>+ 新建</button>
                <button className="folder-action-btn" onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteFolder(folder.id)
                }} style={{ color: 'var(--red)' }}>删除</button>
              </div>
            </div>
            {isExpanded && (
              <div className="dashboard-list">
                {dashboards.length > 0 ? (
                  <div className="dashboard-card-grid">
                    {dashboards.map((db) => (
                      <div key={db.id} className="dashboard-card" onClick={() => onOpenDashboard(db.id)}>
                        <div className="dashboard-card-top">
                          <div className="dashboard-card-icon">{SVG_ICONS.dash}</div>
                          <div className="dashboard-card-info">
                            <div className="dashboard-card-name">{db.title}</div>
                          </div>
                        </div>
                        <div className="dashboard-card-actions-inline" style={{ marginTop: 8, display: 'flex', gap: 4 }}>
                          <button className="btn-sm" onClick={(e) => { e.stopPropagation(); handleEditDashboardJson(db.id) }} style={{ fontSize: 10 }}>编辑JSON</button>
                          <button className="btn-sm" onClick={(e) => { e.stopPropagation(); handleDeleteDashboard(db.id) }} style={{ fontSize: 10, color: 'var(--red)', borderColor: 'transparent' }}>删除</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state" style={{ padding: 24 }}>此文件夹中没有仪表板</div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
