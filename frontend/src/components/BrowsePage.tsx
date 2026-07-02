import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import * as api from '../api'
import type { FolderRes, DashboardBriefRes } from '../api'
import { sampleDashboards } from '../mock/dashboardSamples'

function titleToSlug(title: string): string {
  return encodeURIComponent(title.replace(/\s+/g, '-').toLowerCase())
}

const SVG_ICONS: Record<string, ReactNode> = {
  folder: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e53935" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  dash: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" opacity="0.7">
      <rect x="1" y="1" width="5" height="14" rx="1" />
      <rect x="8" y="6" width="7" height="9" rx="1" />
      <rect x="8" y="2" width="3" height="3" rx="0.5" />
    </svg>
  ),
  chevronDown: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  chevronRight: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  plus: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
}

interface GroupData {
  id: string
  title: string
  folders: FolderRes[]
}

export default function BrowsePage() {
  const navigate = useNavigate()
  const [folders, setFolders] = useState<FolderRes[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['mine']))
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

  const [selectedDashboards, setSelectedDashboards] = useState<Set<string>>(new Set())
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set())

  const [newMenuOpen, setNewMenuOpen] = useState(false)
  const newMenuRef = useRef<HTMLDivElement>(null)

  const [showMoveModal, setShowMoveModal] = useState(false)
  const [targetFolderId, setTargetFolderId] = useState('')
  const [moving, setMoving] = useState(false)

  const loadFolders = async () => {
    try {
      const res = await api.listFolders()
      setFolders(res.list)
      if (expandedFolders.size === 0 && res.list.length > 0) {
        setExpandedFolders(new Set([res.list[0].id]))
      }
    } catch (e: any) {
      console.error('加载文件夹失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadFolders() }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setNewMenuOpen(false)
      }
    }
    if (newMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => { document.removeEventListener('mousedown', handleClickOutside) }
  }, [newMenuOpen])

  const groups: GroupData[] = [
    { id: 'mine', title: '我的仪表板', folders },
    { id: 'shared', title: '分享给我的仪表板', folders: [] },
    { id: 'team', title: '团队仪表板', folders: [] },
  ]

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const getTotalDashboardCount = (folderList: FolderRes[]) => {
    return folderList.reduce((sum, f) => sum + (f.dashboards?.length || 0), 0)
  }

  const handleSelectFolder = (folderId: string, checked: boolean) => {
    setSelectedFolders((prev) => {
      const next = new Set(prev)
      if (checked) next.add(folderId)
      else next.delete(folderId)
      return next
    })
    const folder = folders.find((f) => f.id === folderId)
    if (folder) {
      setSelectedDashboards((prev) => {
        const next = new Set(prev)
        folder.dashboards?.forEach((d) => {
          if (checked) next.add(d.id)
          else next.delete(d.id)
        })
        return next
      })
    }
  }

  const handleSelectDashboard = (dashboardId: string, checked: boolean, folderId: string) => {
    setSelectedDashboards((prev) => {
      const next = new Set(prev)
      if (checked) next.add(dashboardId)
      else next.delete(dashboardId)
      return next
    })
    const folder = folders.find((f) => f.id === folderId)
    if (folder) {
      const allSelected = folder.dashboards?.every((d) =>
        checked ? selectedDashboards.has(d.id) || d.id === dashboardId : selectedDashboards.has(d.id) && d.id !== dashboardId
      )
      setSelectedFolders((prev) => {
        const next = new Set(prev)
        if (allSelected && checked) next.add(folderId)
        else if (!checked) next.delete(folderId)
        return next
      })
    }
  }

  const totalSelected = selectedDashboards.size

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
      setNewMenuOpen(false)
      loadFolders()
      navigate(`/d/${db.id}/${titleToSlug(db.title)}`)
    } catch (e: any) { alert('创建仪表板失败: ' + e.message) }
  }

  const handleDeleteDashboard = async (id: string) => {
    if (!confirm('确定删除此仪表板?')) return
    try {
      await api.deleteDashboard(id)
      loadFolders()
    } catch (e: any) { alert('删除失败: ' + e.message) }
  }

  const handleBatchDelete = async () => {
    if (selectedDashboards.size === 0) return
    if (!confirm(`确定删除选中的 ${selectedDashboards.size} 个仪表板?`)) return
    try {
      const ids = Array.from(selectedDashboards)
      await Promise.all(ids.map((id) => api.deleteDashboard(id)))
      setSelectedDashboards(new Set())
      setSelectedFolders(new Set())
      loadFolders()
    } catch (e: any) { alert('删除失败: ' + e.message) }
  }

  const handleOpenMoveModal = () => {
    if (selectedDashboards.size === 0) return
    setTargetFolderId('')
    setShowMoveModal(true)
  }

  const handleBatchMove = async () => {
    if (!targetFolderId || selectedDashboards.size === 0) return
    setMoving(true)
    try {
      const ids = Array.from(selectedDashboards)
      await Promise.all(ids.map(async (id) => {
        const db = allDashboards.find((d) => d.id === id)
        if (db) {
          await api.updateDashboard(id, db.title, targetFolderId)
        }
      }))
      setSelectedDashboards(new Set())
      setSelectedFolders(new Set())
      setShowMoveModal(false)
      loadFolders()
    } catch (e: any) { alert('移动失败: ' + e.message) }
    finally { setMoving(false) }
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

  const allDashboards = folders.flatMap((f) =>
    (f.dashboards || []).map((d) => ({ ...d, folderTitle: f.title, folderId: f.id }))
  )
  const filteredDashboards = searchText
    ? allDashboards.filter((d) => d.title.toLowerCase().includes(searchText.toLowerCase()))
    : []

  if (loading) return <div className="browse-page"><div className="empty-state">加载中...</div></div>

  return (
    <div className="browse-page">
      <div className="browse-list-header">
        <h1 className="browse-title">仪表板</h1>
      </div>

      <div className="browse-toolbar">
        <div className="toolbar-left">
          <button className="btn-sm btn-toolbar" disabled={totalSelected === 0} onClick={handleOpenMoveModal}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 9l4-4 4 4" />
              <path d="M9 5v14" />
              <path d="M19 15l-4 4-4-4" />
              <path d="M15 19V5" />
            </svg>
            移动
          </button>
          <button className="btn-sm btn-toolbar" disabled={totalSelected === 0} onClick={handleBatchDelete}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            删除
          </button>
          <button className="btn-sm btn-toolbar" disabled={totalSelected === 0}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            分享
          </button>
          <span className="selected-count">已选择 {totalSelected} 项</span>
        </div>
        <div className="toolbar-right" ref={newMenuRef}>
          <div style={{ position: 'relative' }}>
            <button
              className="btn-sm btn-primary-new"
              onClick={() => setNewMenuOpen(!newMenuOpen)}
            >
              <span style={{ position: 'relative', top: '1px' }}>+</span>
              新建
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {newMenuOpen && (
              <div className="new-dropdown-menu">
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setShowNewFolder(true)
                    setNewMenuOpen(false)
                  }}
                >
                  {SVG_ICONS.folder}
                  <span>新建文件夹</span>
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    if (folders.length > 0) setSelectedFolderId(folders[0].id)
                    setShowNewDashboard(true)
                    setNewMenuOpen(false)
                  }}
                >
                  {SVG_ICONS.dash}
                  <span>新建仪表板</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

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

      {showMoveModal && (
        <div className="modal-overlay" onClick={() => setShowMoveModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>移动仪表板</h2>
              <button className="modal-close" onClick={() => setShowMoveModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 13, color: '#4e5969', marginBottom: 12 }}>
                已选择 {selectedDashboards.size} 个仪表板，请选择目标文件夹：
              </div>
              <div className="form-group">
                <label>目标文件夹</label>
                <select value={targetFolderId} onChange={(e) => setTargetFolderId(e.target.value)}>
                  <option value="">请选择文件夹</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.title}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowMoveModal(false)}>取消</button>
              <button className="btn-primary" onClick={handleBatchMove} disabled={!targetFolderId || moving}>
                {moving ? '移动中...' : '确定移动'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {searchText && (
        <div>
          {filteredDashboards.length === 0 ? (
            <div className="empty-state">未找到匹配的仪表板</div>
          ) : (
            <div className="dashboard-list-view">
              {filteredDashboards.map((db) => (
                <div key={db.id} className="list-item dashboard-item">
                  <input
                    type="checkbox"
                    checked={selectedDashboards.has(db.id)}
                    onChange={(e) => handleSelectDashboard(db.id, e.target.checked, db.folderId)}
                  />
                  <span className="item-icon">{SVG_ICONS.dash}</span>
                  <Link
                    to={`/d/${db.id}/${titleToSlug(db.title)}`}
                    className="item-title-link"
                  >
                    {db.title}
                  </Link>
                  <span className="item-folder">{db.folderTitle}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!searchText && groups.map((group) => {
        const isGroupExpanded = expandedGroups.has(group.id)
        const count = getTotalDashboardCount(group.folders)
        return (
          <div key={group.id} className="list-group">
            <div className="list-group-header" onClick={() => toggleGroup(group.id)}>
              <span className="group-chevron">
                {isGroupExpanded ? SVG_ICONS.chevronDown : SVG_ICONS.chevronRight}
              </span>
              <span className="group-title">{group.title}</span>
              <span className="group-count">{count} 个仪表板</span>
            </div>
            {isGroupExpanded && (
              <div className="list-group-content">
                {group.folders.length === 0 ? (
                  <div className="empty-group-tip">暂无内容</div>
                ) : (
                  group.folders.map((folder) => {
                    const isFolderExpanded = expandedFolders.has(folder.id)
                    const dashboards = folder.dashboards || []
                    const folderChecked = selectedFolders.has(folder.id)
                    const folderIndeterminate = !folderChecked && dashboards.some((d) => selectedDashboards.has(d.id))
                    return (
                      <div key={folder.id} className="folder-list-item">
                        <div className="list-item folder-item" onClick={() => toggleFolder(folder.id)}>
                          <input
                            type="checkbox"
                            checked={folderChecked}
                            ref={(el) => { if (el) el.indeterminate = folderIndeterminate }}
                            onChange={(e) => handleSelectFolder(folder.id, e.target.checked)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="folder-toggle">
                            {isFolderExpanded ? SVG_ICONS.chevronDown : SVG_ICONS.chevronRight}
                          </span>
                          <span className="item-icon">{SVG_ICONS.folder}</span>
                          <span className="item-title">{folder.title}</span>
                        </div>
                        {isFolderExpanded && dashboards.length > 0 && (
                          <div className="dashboard-sublist">
                            {dashboards.map((db) => (
                              <div key={db.id} className="list-item dashboard-item sub-item">
                                <input
                                  type="checkbox"
                                  checked={selectedDashboards.has(db.id)}
                                  onChange={(e) => handleSelectDashboard(db.id, e.target.checked, folder.id)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <Link
                                  to={`/d/${db.id}/${titleToSlug(db.title)}`}
                                  className="item-title-link"
                                >
                                  {db.title}
                                </Link>
                                <div className="dashboard-item-actions">
                                  <button className="btn-sm" onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleEditDashboardJson(db.id) }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="16 18 22 12 16 6" />
                                      <polyline points="8 6 2 12 8 18" />
                                    </svg>
                                    编辑JSON
                                  </button>
                                  <button className="btn-sm btn-danger-text" onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDeleteDashboard(db.id) }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                    删除
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
