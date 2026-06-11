import { useState } from 'react'
import DashboardView from './components/DashboardView'
import BrowsePage from './components/BrowsePage'
import DataSourcesPage from './components/DataSourcesPage'
import SnapshotView from './components/SnapshotView'
import SnapshotList from './components/SnapshotList'
import PanelEditPage from './components/PanelEditPage'
import type { PanelDef, DatasourceRes, PanelDataRes } from './api'
import './App.css'

type Page = 'browse' | 'snapshots' | 'datasources'

interface EditingPanelCtx {
  panel: PanelDef
  dashboardId: string
  datasources: DatasourceRes[]
  draftJson: any
  panelsData?: PanelDataRes[]
  onSave: (updated: PanelDef) => void
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('browse')
  const [selectedDashboardId, setSelectedDashboardId] = useState<string | null>(null)
  const [snapshotKey, setSnapshotKey] = useState<string | null>(null)
  const [editingPanel, setEditingPanel] = useState<EditingPanelCtx | null>(null)
  const [snapshotListKey, setSnapshotListKey] = useState(0)
  const isInSnapshot = window.location.pathname.startsWith('/snapshot/') || snapshotKey !== null

  if (!snapshotKey && window.location.pathname.startsWith('/snapshot/')) {
    const key = window.location.pathname.split('/snapshot/')[1]
    if (key) { setSnapshotKey(key); return null }
  }

  const isInDashboard = selectedDashboardId !== null

  const handleOpenDashboard = (id: string) => setSelectedDashboardId(id)
  const handleBack = () => setSelectedDashboardId(null)
  const handleCloseSnapshot = () => {
    setSnapshotKey(null)
    window.history.pushState({}, '', '/')
  }

  return (
    <div className="app">
      {!isInSnapshot && !editingPanel && (
      <aside className="sidebar">
        <div
          className="sidebar-logo"
          onClick={() => { setCurrentPage('browse'); setSelectedDashboardId(null) }}
        >
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="#fc9908" />
            <path d="M8 13.5l5 5L20 9" stroke="#111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <nav className="sidebar-nav">
          <div
            className={`nav-item ${currentPage === 'browse' && !isInDashboard ? 'active' : ''}`}
            onClick={() => { setCurrentPage('browse'); setSelectedDashboardId(null) }}
            title="仪表板"
          >
            <span className="nav-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><rect x="2" y="2" width="7" height="16" rx="1" /><rect x="11" y="8" width="7" height="10" rx="1" /></svg>
            </span>
            <span className="nav-label">仪表板</span>
          </div>
          <div
            className={`nav-item ${currentPage === 'snapshots' && !isInDashboard ? 'active' : ''}`}
            onClick={() => { setCurrentPage('snapshots'); setSelectedDashboardId(null); setSnapshotListKey(k => k + 1) }}
            title="快照"
          >
            <span className="nav-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M5 2a1 1 0 00-1 1v14a1 1 0 001 1h10a1 1 0 001-1V7l-5-5H5z" /><path d="M13 2v5h5" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="10" cy="11" r="3" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
            </span>
            <span className="nav-label">快照</span>
          </div>
          <div
            className={`nav-item ${currentPage === 'datasources' && !isInDashboard ? 'active' : ''}`}
            onClick={() => { setCurrentPage('datasources'); setSelectedDashboardId(null) }}
            title="数据源"
          >
            <span className="nav-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><ellipse cx="10" cy="5" rx="8" ry="3" /><path d="M2 5v5c0 1.66 3.58 3 8 3s8-1.34 8-3V5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M2 10v5c0 1.66 3.58 3 8 3s8-1.34 8-3v-5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
            </span>
            <span className="nav-label">数据源</span>
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="nav-item" title="用户">
            <span className="nav-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><circle cx="10" cy="6" r="4" /><path d="M2 18c0-4.418 3.582-8 8-8s8 3.582 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
            </span>
          </div>
        </div>
      </aside>
      )}

      <div className="main-wrapper">
        <main className="main-content" style={{ padding: (isInSnapshot || editingPanel) ? 0 : undefined }}>
          {isInSnapshot ? (
            <SnapshotView snapshotKey={snapshotKey!} onClose={handleCloseSnapshot} />
          ) : isInDashboard ? (
            <>
              <div style={{ display: editingPanel ? 'none' : undefined, height: '100%' }}>
                <DashboardView
                  dashboardId={selectedDashboardId!}
                  onBack={handleBack}
                  onEditPanel={(ctx) => setEditingPanel(ctx)}
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
          ) : currentPage === 'browse' ? (
            <BrowsePage onOpenDashboard={handleOpenDashboard} />
          ) : currentPage === 'snapshots' ? (
            <SnapshotList key={snapshotListKey} />
          ) : (
            <DataSourcesPage />
          )}
        </main>
      </div>
    </div>
  )
}

export default App
