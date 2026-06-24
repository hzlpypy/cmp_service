import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useParams, useNavigate, useLocation } from 'react-router-dom'
import DashboardView from './components/DashboardView'
import BrowsePage from './components/BrowsePage'
import DataSourcesPage from './components/DataSourcesPage'
import SnapshotView from './components/SnapshotView'
import SnapshotList from './components/SnapshotList'
import PanelEditPage from './components/PanelEditPage'
import SettingsPage from './components/SettingsPage'
import type { PanelDef, DatasourceRes, PanelDataRes } from './api'
import { initTheme } from './themes'
import './App.css'

type Page = 'browse' | 'snapshots' | 'datasources' | 'settings'

interface EditingPanelCtx {
  panel: PanelDef
  dashboardId: string
  datasources: DatasourceRes[]
  draftJson: any
  panelsData?: PanelDataRes[]
  onSave: (updated: PanelDef) => void
}

/** Dashboard 页面包装器：从 URL 参数读取 dashboardId */
function DashboardPageWrapper() {
  const { uid } = useParams<{ uid: string }>()
  const navigate = useNavigate()
  const [editingPanel, setEditingPanel] = useState<EditingPanelCtx | null>(null)

  if (!uid) {
    navigate('/', { replace: true })
    return null
  }

  const handleBack = () => navigate('/')
  const handleEditPanel = (ctx: any) => setEditingPanel(ctx)

  return (
    <>
      <div style={{ display: editingPanel ? 'none' : undefined, height: '100%' }}>
        <DashboardView
          dashboardId={uid}
          onBack={handleBack}
          onEditPanel={handleEditPanel}
        />
      </div>
      {editingPanel && (
        <PanelEditPage
          panel={editingPanel.panel}
          datasources={editingPanel.datasources}
          dashboardId={editingPanel.dashboardId}
          draftJson={editingPanel.draftJson}
          panelsData={editingPanel.panelsData}
          onSave={(updated) => {
            editingPanel.onSave(updated)
            setEditingPanel(null)
          }}
          onBack={() => setEditingPanel(null)}
        />
      )}
    </>
  )
}

/** Snapshot 页面包装器：从 URL 参数读取 snapshotKey */
function SnapshotPageWrapper() {
  const { key } = useParams<{ key: string }>()
  const navigate = useNavigate()

  if (!key) {
    navigate('/', { replace: true })
    return null
  }

  const handleClose = () => {
    navigate('/')
  }

  return <SnapshotView snapshotKey={key} onClose={handleClose} />
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('browse')
  const [snapshotListKey, setSnapshotListKey] = useState(0)
  const location = useLocation()

  // 判断当前是否在仪表盘详情页或快照页
  const isInDashboard = location.pathname.startsWith('/d/')
  const isInSnapshot = location.pathname.startsWith('/snapshot/')

  // 初始化主题
  useEffect(() => {
    initTheme()
  }, [])

  return (
    <div className="app">
      {!isInSnapshot && !isInDashboard && (
      <aside className="sidebar">
        <div
          className="sidebar-logo"
          onClick={() => { setCurrentPage('browse') }}
        >
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="#fc9908" />
            <path d="M8 13.5l5 5L20 9" stroke="#111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <nav className="sidebar-nav">
          <div
            className={`nav-item ${currentPage === 'browse' ? 'active' : ''}`}
            onClick={() => setCurrentPage('browse')}
            title="仪表板"
          >
            <span className="nav-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><rect x="2" y="2" width="7" height="16" rx="1" /><rect x="11" y="8" width="7" height="10" rx="1" /></svg>
            </span>
            <span className="nav-label">仪表板</span>
          </div>
          <div
            className={`nav-item ${currentPage === 'snapshots' ? 'active' : ''}`}
            onClick={() => { setCurrentPage('snapshots'); setSnapshotListKey(k => k + 1) }}
            title="快照"
          >
            <span className="nav-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M5 2a1 1 0 00-1 1v14a1 1 0 001 1h10a1 1 0 001-1V7l-5-5H5z" /><path d="M13 2v5h5" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="10" cy="11" r="3" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
            </span>
            <span className="nav-label">快照</span>
          </div>
          <div
            className={`nav-item ${currentPage === 'datasources' ? 'active' : ''}`}
            onClick={() => setCurrentPage('datasources')}
            title="数据源"
          >
            <span className="nav-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><ellipse cx="10" cy="5" rx="8" ry="3" /><path d="M2 5v5c0 1.66 3.58 3 8 3s8-1.34 8-3V5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M2 10v5c0 1.66 3.58 3 8 3s8-1.34 8-3v-5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
            </span>
            <span className="nav-label">数据源</span>
          </div>
        </nav>
        <div className="sidebar-footer">
          <div
            className={`nav-item ${currentPage === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentPage('settings')}
            title="设置"
          >
            <span className="nav-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a1 1 0 011 1v1.07a7.002 7.002 0 015.94 5.93H18a1 1 0 110 2h-1.07a7.002 7.002 0 01-5.93 5.94V18a1 1 0 11-2 0v-1.07a7.002 7.002 0 01-5.94-5.93H2a1 1 0 110-2h1.07a7.002 7.002 0 015.93-5.94V3a1 1 0 011-1zm0 4a4 4 0 100 8 4 4 0 000-8z" /></svg>
            </span>
            <span className="nav-label">设置</span>
          </div>
        </div>
      </aside>
      )}

      <div className="main-wrapper">
        <main className="main-content" style={{ padding: isInSnapshot ? 0 : undefined }}>
          <Routes>
            <Route path="/" element={
              currentPage === 'browse' ? <BrowsePage /> :
              currentPage === 'snapshots' ? <SnapshotList key={snapshotListKey} /> :
              currentPage === 'settings' ? <SettingsPage /> :
              <DataSourcesPage />
            } />
            <Route path="/d/:uid/:slug?" element={<DashboardPageWrapper />} />
            <Route path="/snapshot/:key" element={<SnapshotPageWrapper />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

/** 根组件：包裹 BrowserRouter */
function Root() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  )
}

export default Root
