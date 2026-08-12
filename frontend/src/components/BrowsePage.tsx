import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Modal, message, Input, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import * as api from '../api'
import type { FolderRes } from '../api'
import ShareModal from './ShareModal'
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
  team: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7048e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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
  // 团队仪表板分组内，按团队名二级展开（部长视角）
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())
  const [searchText, setSearchText] = useState('')
  const [currentFolder, setCurrentFolder] = useState<FolderRes | null>(null) // 当前浏览的文件夹

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

  // 分享弹窗（支持单个或多个仪表板：选中文件夹/多选时批量分享其下仪表板）
  const [shareTarget, setShareTarget] = useState<{ resourceType: 'dashboard' | 'snapshot'; resourceIds: string[]; resourceNames?: string[] } | null>(null)

  const loadFolders = async (searchKeyword?: string, expandFolderId?: string) => {
    try {
      const res = await api.listFolders(searchKeyword)
      setFolders(res.list)
      if (expandFolderId) {
        // 如果指定了要展开的文件夹，展开它
        setExpandedFolders(new Set([expandFolderId]))
        setExpandedGroups(new Set(['mine']))
      } else if (expandedFolders.size === 0 && res.list.length > 0) {
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

  // 按 source 字段将仪表板分到 我的/分享给我的/团队 三个分组。
  // 后端 ListFolders 已返回每个仪表板的 source（mine/shared/team），
  // 兼容旧数据：source 缺失时归入 mine。
  const groupFolders = (source: 'mine' | 'shared' | 'team'): FolderRes[] => {
    return folders
      .map((f) => ({
        ...f,
        dashboards: (f.dashboards || []).filter((d) => (d.source || 'mine') === source),
      }))
      .filter((f) => f.dashboards.length > 0)
  }

  const groups: GroupData[] = [
    { id: 'mine', title: '我的仪表板', folders: groupFolders('mine') },
    { id: 'shared', title: '分享给我的仪表板', folders: groupFolders('shared') },
    { id: 'team', title: '团队仪表板', folders: groupFolders('team') },
  ]

  // 仪表板行渲染（三个分组共用）
  const renderDashboardRow = (db: DashboardBriefRes) => (
    <div key={db.id} className="list-item dashboard-item sub-item">
      <input
        type="checkbox"
        checked={selectedDashboards.has(db.id)}
        onChange={(e) => handleSelectDashboard(db.id, e.target.checked, db.folder_id)}
        onClick={(e) => e.stopPropagation()}
      />
      <Link
        to={`/capacity_mgt_platform/d/${db.id}/${titleToSlug(db.title)}`}
        className="item-title-link"
      >
        {db.title}
      </Link>
      <div className="dashboard-item-actions">
        {db.can_edit !== false && (
          <>
            <button className="btn-sm" onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleEditDashboardJson(db.id) }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              编辑JSON
            </button>
            <button
              className="btn-sm"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setShareTarget({ resourceType: 'dashboard', resourceIds: [db.id], resourceNames: [db.title] })
              }}
              title="分享仪表板"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              分享
            </button>
            <button className="btn-sm btn-danger-text" onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDeleteDashboard(db.id) }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              删除
            </button>
          </>
        )}
      </div>
    </div>
  )

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

  const toggleTeam = (name: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
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

  const totalSelected = selectedFolders.size + selectedDashboards.size

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await api.createFolder(newFolderName.trim())
      setNewFolderName('')
      setShowNewFolder(false)
      loadFolders()
    } catch (e: any) { message.error('创建文件夹失败: ' + e.message) }
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
      navigate(`/capacity_mgt_platform/d/${db.id}/${titleToSlug(db.title)}`)
    } catch (e: any) { message.error('创建仪表板失败: ' + e.message) }
  }

  const handleDeleteDashboard = async (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定删除此仪表板？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.deleteDashboard(id)
          message.success('删除成功')
          loadFolders()
        } catch (e: any) { message.error('删除失败: ' + e.message) }
      },
    })
  }

  const handleBatchDelete = async () => {
    if (selectedFolders.size === 0 && selectedDashboards.size === 0) return

    const folderCount = selectedFolders.size
    const dashboardCount = selectedDashboards.size
    let content = ''
    if (folderCount > 0 && dashboardCount > 0) {
      content = `确定删除选中的 ${folderCount} 个文件夹和 ${dashboardCount} 个仪表板？`
    } else if (folderCount > 0) {
      content = `确定删除选中的 ${folderCount} 个文件夹？`
    } else {
      content = `确定删除选中的 ${dashboardCount} 个仪表板？`
    }

    Modal.confirm({
      title: '确认删除',
      content,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          // 删除选中的文件夹（会自动删除关联的仪表板）
          const folderIds = Array.from(selectedFolders)
          for (const id of folderIds) {
            await api.deleteFolder(id)
          }
          // 删除选中的仪表板
          const dashboardIds = Array.from(selectedDashboards)
          for (const id of dashboardIds) {
            // 只删除不属于已删除文件夹的仪表板
            const belongsToDeletedFolder = folders.some((f) =>
              selectedFolders.has(f.id) && f.dashboards?.some((d) => d.id === id)
            )
            if (!belongsToDeletedFolder) {
              await api.deleteDashboard(id)
            }
          }
          message.success('删除成功')
          setSelectedFolders(new Set())
          setSelectedDashboards(new Set())
          loadFolders()
        } catch (e: any) { message.error('删除失败: ' + e.message) }
      },
    })
  }

  const handleOpenMoveModal = () => {
    if (selectedDashboards.size === 0) return
    setTargetFolderId('')
    setShowMoveModal(true)
  }

  // 打开分享弹窗：将选中的文件夹展开为其下所有仪表板，与选中的仪表板一起去重合并
  const handleOpenShareModal = () => {
    if (totalSelected === 0) return
    const ids: string[] = []
    const names: string[] = []
    const seen = new Set<string>()
    const add = (id: string, title: string) => {
      if (seen.has(id)) return
      seen.add(id)
      ids.push(id)
      names.push(title)
    }
    folders.forEach((f) => {
      if (selectedFolders.has(f.id)) {
        f.dashboards?.forEach((d) => add(d.id, d.title))
      }
    })
    selectedDashboards.forEach((id) => {
      const d = allDashboards.find((x) => x.id === id)
      if (d) add(d.id, d.title)
    })
    setShareTarget({ resourceType: 'dashboard', resourceIds: ids, resourceNames: names })
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
    } catch (e: any) { message.error('移动失败: ' + e.message) }
    finally { setMoving(false) }
  }

  const handleEditDashboardJson = async (dashboardId: string) => {
    try {
      const db = await api.getDashboard(dashboardId)
      setEditingDashboard(db)
      setJsonEditText(JSON.stringify(db.dashboard_json, null, 2))
      setShowJsonEdit(true)
    } catch (e: any) { message.error('加载仪表板失败: ' + e.message) }
  }

  const handleSaveDashboardJson = async () => {
    if (!editingDashboard) return
    try {
      const newJson = JSON.parse(jsonEditText)
      await api.updateDashboard(editingDashboard.id, editingDashboard.title, editingDashboard.folder_id, newJson)
      setShowJsonEdit(false)
      message.success('保存成功')
      loadFolders()
    } catch (e: any) { message.error('保存失败: ' + e.message) }
  }

  const allDashboards = folders.flatMap((f) =>
    (f.dashboards || []).map((d) => ({ ...d, folderTitle: f.title, folderId: f.id }))
  )

  // 构建搜索结果数据（用于 Table 显示）
  const searchResults = searchText ? folders.flatMap((folder) => {
    const items: any[] = []
    // 如果文件夹标题匹配，添加文件夹项
    if (folder.title.toLowerCase().includes(searchText.toLowerCase())) {
      items.push({
        key: `folder-${folder.id}`,
        id: folder.id,
        name: folder.title,
        type: '文件夹',
        location: '',
        itemType: 'folder',
        data: folder,
      })
    }
    // 添加匹配的仪表板项
    folder.dashboards?.forEach((db) => {
      if (db.title.toLowerCase().includes(searchText.toLowerCase())) {
        items.push({
          key: `dashboard-${db.id}`,
          id: db.id,
          name: db.title,
          type: '仪表板',
          location: folder.title,
          itemType: 'dashboard',
          data: db,
          folderId: folder.id,
        })
      }
    })
    return items
  }) : []

  // 表格列定义
  const searchColumns: ColumnsType<any> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: any) => {
        if (record.itemType === 'folder') {
          return (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              onClick={() => {
                // 点击文件夹：清空搜索，调用接口获取文件夹完整内容
                setSearchText('')
                // 调用 getFolder 接口获取文件夹的完整内容
                api.getFolder(record.id).then((folderRes) => {
                  console.log('getFolder 返回数据:', folderRes) // 调试日志
                  setCurrentFolder(folderRes)
                }).catch((err) => {
                  console.error('获取文件夹内容失败:', err)
                  message.error('获取文件夹内容失败')
                })
              }}
            >
              <span>{SVG_ICONS.folder}</span>
              <span className="item-title" style={{ color: '#1890ff' }}>{text}</span>
            </div>
          )
        }
        return (
          <Link to={`/capacity_mgt_platform/d/${record.id}/${titleToSlug(text)}`} className="item-title-link">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{SVG_ICONS.dash}</span>
              <span>{text}</span>
            </div>
          </Link>
        )
      },
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
    },
    {
      title: '位置',
      dataIndex: 'location',
      key: 'location',
      render: (text: string) => text || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: any) => {
        if (record.itemType === 'dashboard') {
          const canEdit = record.data?.can_edit !== false
          return (
            <div style={{ display: 'flex', gap: 8 }}>
              {canEdit && (
                <button
                  className="btn-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleEditDashboardJson(record.id)
                  }}
                >
                  编辑
                </button>
              )}
              {canEdit && (
                <button
                  className="btn-sm btn-danger-text"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteDashboard(record.id)
                  }}
                >
                  删除
                </button>
              )}
            </div>
          )
        }
        return null
      },
    },
  ]

  if (loading) return <div className="browse-page"><div className="empty-state">加载中...</div></div>

  return (
    <div className="browse-page">
      <div className="browse-list-header">
        <h1 className="browse-title">
          {/* 面包屑导航 */}
          <span
            style={{ cursor: currentFolder ? 'pointer' : 'default', color: currentFolder ? '#1890ff' : 'inherit' }}
            onClick={() => {
              if (currentFolder) {
                setCurrentFolder(null)
                setSearchText('')
                loadFolders() // 重新加载所有数据
              }
            }}
          >
            仪表板
          </span>
          {currentFolder && (
            <>
              <span style={{ margin: '0 8px', color: '#999' }}>/</span>
              <span style={{ color: '#333' }}>{currentFolder.title}</span>
            </>
          )}
        </h1>
      </div>

      <div className="browse-toolbar">
        <div className="toolbar-left">
          <Input.Search
            placeholder="搜索仪表板"
            allowClear
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value)
              setCurrentFolder(null) // 搜索时清空当前文件夹
              loadFolders(e.target.value)
            }}
            style={{ width: 280, marginRight: 16 }}
          />
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
          <button
            className="btn-sm btn-toolbar"
            disabled={totalSelected === 0}
            onClick={handleOpenShareModal}
          >
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
        <div className="search-results-container">
          <Table
            columns={searchColumns}
            dataSource={searchResults}
            pagination={false}
            locale={{ emptyText: '未找到匹配的结果' }}
            size="small"
          />
        </div>
      )}

      {/* 显示当前文件夹内容 */}
      {!searchText && currentFolder && (
        <div className="search-results-container">
          <Table
            columns={[
              {
                title: '名称',
                dataIndex: 'title',
                key: 'title',
                render: (text: string, record: any) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{SVG_ICONS.dashboard}</span>
                    <Link to={`/capacity_mgt_platform/d/${record.id}/${titleToSlug(text)}`} className="item-title-link">
                      {text}
                    </Link>
                  </div>
                ),
              },
              {
                title: '类型',
                dataIndex: 'type',
                key: 'type',
                render: () => '仪表板',
              },
              {
                title: '位置',
                dataIndex: 'location',
                key: 'location',
                render: () => currentFolder.title,
              },
              {
                title: '操作',
                key: 'actions',
                render: (_: any, record: any) => (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {record.can_edit !== false && (
                      <>
                        <button className="btn-sm" onClick={(e) => { e.stopPropagation(); handleEditDashboardJson(record.id) }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="16 18 22 12 16 6" />
                            <polyline points="8 6 2 12 8 18" />
                          </svg>
                          编辑JSON
                        </button>
                        <button className="btn-sm btn-danger-text" onClick={(e) => { e.stopPropagation(); handleDeleteDashboard(record.id) }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          删除
                        </button>
                      </>
                    )}
                  </div>
                ),
              },
            ]}
            dataSource={currentFolder.dashboards?.map((db) => ({
              ...db,
              key: db.id,
            })) || []}
            pagination={false}
            rowKey="id"
          />
        </div>
      )}

      {/* 显示全部仪表板列表 */}
      {!searchText && !currentFolder && groups.map((group) => {
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
                ) : group.id === 'team' ? (
                  (() => {
                    // 团队分组：先按团队名聚合，团队内保留文件夹层级（团队 > 文件夹 > 仪表板）
                    const teamMap = new Map<string, FolderRes[]>()
                    group.folders.forEach((f) => {
                      ;(f.dashboards || []).forEach((d) => {
                        const t = d.team_name || '其他'
                        if (!teamMap.has(t)) teamMap.set(t, [])
                        const teamFolders = teamMap.get(t)!
                        let folder = teamFolders.find((x) => x.id === f.id)
                        if (!folder) {
                          folder = { ...f, dashboards: [] }
                          teamFolders.push(folder)
                        }
                        folder.dashboards!.push(d)
                      })
                    })
                    const teams = Array.from(teamMap.entries())
                    return teams.length === 0 ? (
                      <div className="empty-group-tip">暂无内容</div>
                    ) : (
                      teams.map(([teamName, teamFolders]) => {
                        const isTeamExpanded = expandedTeams.has(teamName)
                        return (
                          <div key={teamName} className="folder-list-item">
                            <div className="list-item folder-item" onClick={() => toggleTeam(teamName)}>
                              <span className="folder-toggle">
                                {isTeamExpanded ? SVG_ICONS.chevronDown : SVG_ICONS.chevronRight}
                              </span>
                              <span className="item-icon">{SVG_ICONS.team}</span>
                              <span className="item-title">{teamName}</span>
                              <span className="group-count">
                                {teamFolders.reduce((sum, x) => sum + (x.dashboards?.length || 0), 0)} 个仪表板
                              </span>
                            </div>
                            {isTeamExpanded && (
                              <div>
                                {teamFolders.map((folder) => {
                                  const isFolderExpanded = expandedFolders.has(folder.id)
                                  const dashboards = folder.dashboards || []
                                  return (
                                    <div key={folder.id} className="folder-list-item">
                                      <div className="list-item folder-item" onClick={() => toggleFolder(folder.id)}>
                                        <span className="folder-toggle">
                                          {isFolderExpanded ? SVG_ICONS.chevronDown : SVG_ICONS.chevronRight}
                                        </span>
                                        <span className="item-icon">{SVG_ICONS.folder}</span>
                                        <span className="item-title">{folder.title}</span>
                                      </div>
                                      {isFolderExpanded && dashboards.length > 0 && (
                                        <div className="dashboard-sublist">
                                          {dashboards.map((db) => renderDashboardRow(db))}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })
                    )
                  })()
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
                            {dashboards.map((db) => renderDashboardRow(db))}
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

      {/* 分享弹窗 */}
      {shareTarget && (
        <ShareModal
          open={!!shareTarget}
          resourceType={shareTarget.resourceType}
          resourceIds={shareTarget.resourceIds}
          resourceNames={shareTarget.resourceNames}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  )
}
