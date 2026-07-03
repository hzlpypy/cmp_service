import { useState, useEffect, useCallback } from 'react'
import * as api from '../api'
import type { SnapshotRes } from '../api'
import ChartPanel from './ChartPanel'
import GridLayout from './GridLayout'
import { AIInsightsPanel, checkHasReportContent, EditableBullets } from './AIInsightsSection'

interface SnapshotViewProps {
  snapshotKey: string
  onClose: () => void
}

export default function SnapshotView({ snapshotKey, onClose }: SnapshotViewProps) {
  const [snap, setSnap] = useState<SnapshotRes | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // AI 洞察状态：是否显示、触发次数、数据
  const [showAIInsights, setShowAIInsights] = useState(false)
  const [aiTrigger, setAITrigger] = useState(0)
  const [aiData, setAiData] = useState<{ score: number; conclusion: string; risks: string[]; evaluation: string; plan: string } | null>(null)
  // 编辑状态：评估与计划
  const [isEditingPlan, setIsEditingPlan] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.getSnapshot(snapshotKey)
      .then((data) => {
        setSnap(data)
        // 如果已有 AI 洞察数据，自动显示
        if (data?.ai_insights && (data.ai_insights.conclusion || data.ai_insights.risks?.length > 0)) {
          setShowAIInsights(true)
          setAiData(data.ai_insights)
        }
      })
      .catch((e) => setError(e.message || '加载快照失败'))
      .finally(() => setLoading(false))
  }, [snapshotKey])

  // 保存 AI 洞察到快照
  const handleSaveAIInsights = useCallback(async () => {
    if (!snap || !aiData) return
    setSaving(true)
    try {
      await api.updateSnapshot({
        snapshot_key: snap.snapshot_key,
        ai_insights: aiData
      })
      setSnap(prev => prev ? { ...prev, ai_insights: aiData } : prev)
      alert('保存成功')
    } catch (e: any) {
      alert('保存失败: ' + (e.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }, [snap, aiData])

  // 点击 AI 洞察按钮：显示界面并触发生成
  const handleAIInsightsClick = useCallback(() => {
    setShowAIInsights(true)
    setAITrigger(prev => prev + 1)
  }, [])

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
  const displayPanels = isSinglePanel ? panels.filter((p: any) => p.id === snap.panel_id) : panels

  const dataMap = new Map<string, any[][]>()
  const columnMap = new Map<string, string[]>()
  if (snap.panels_data) {
    snap.panels_data.forEach((pd: any) => {
      dataMap.set(pd.panel_id, pd.target || [])
      columnMap.set(pd.panel_id, pd.columns || [])
    })
  }

  // 构建面板数据给 AI 分析
  const panelsData = snap.panels_data?.map((pd: any) => ({
    id: pd.panel_id,
    title: pd.panel_title || displayPanels.find((p: any) => p.id === pd.panel_id)?.title || '',
    type: pd.panel_type || displayPanels.find((p: any) => p.id === pd.panel_id)?.type || 'table',
    data: pd.target || [],
    columns: pd.columns || []
  })) || []

  const panelsConfig = displayPanels.map((p: any) => ({
    id: p.id,
    title: p.title,
    type: p.type,
    targets: (p.targets || []).map((t: any) => ({ refId: t.refId, rawSql: t.rawSql || '' }))
  }))

  const displayTitle = isSinglePanel ? (displayPanels[0]?.title || snap.name || '快照') : (dj.title || snap.name || '快照')
  const hasReportContent = checkHasReportContent(panelsData)
  const aiInsights = snap.ai_insights || null

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
          <h2 style={{ fontSize: isSinglePanel ? 14 : 16, fontWeight: 600, margin: 0 }}>{displayTitle}</h2>
          <span style={{ fontSize: 10, color: '#e53935', background: 'rgba(229,57,53,0.1)', padding: '2px 8px', borderRadius: 10, fontWeight: 500 }}>快照</span>
          {snap.name && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{snap.name}</span>}
          {!isSinglePanel && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{displayPanels.length} 个面板</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* AI 洞察按钮 */}
          <button
            className="btn-sm"
            onClick={handleAIInsightsClick}
            disabled={!hasReportContent}
            style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L9.5 8.5 3 9.5l4.5 5L6.5 21 12 17.5 17.5 21l-1-6.5L21 9.5l-6.5-1z" />
            </svg>
            AI 洞察
          </button>
          {/* 保存按钮：只有显示 AI 洞察且有数据时才显示 */}
          {showAIInsights && aiData && (
            <button className="btn-primary" onClick={handleSaveAIInsights} disabled={saving} style={{ fontSize: 11 }}>
              {saving ? '保存中...' : '保存 AI 洞察'}
            </button>
          )}
          {/* 关闭 AI 洞察按钮 */}
          {showAIInsights && (
            <button className="btn-sm" onClick={() => setShowAIInsights(false)} style={{ fontSize: 11 }}>
              ✕ 关闭
            </button>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            创建于 {snap.created_at ? new Date(snap.created_at).toLocaleString('zh-CN') : '-'}
          </div>
        </div>
      </div>

      {/* Body */}
      {isSinglePanel ? (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {/* AI 洞察区域：只有点击按钮后才显示 */}
          {showAIInsights && (
            <div style={{ padding: '12px 16px' }}>
              <AIInsightsPanel
                dashboardId={snap.dashboard_id}
                dashboardTitle={displayTitle}
                panelsData={panelsData}
                panelsConfig={panelsConfig}
                trigger={aiTrigger}
                editable={true}
                initialData={aiInsights}
                onDataChange={setAiData}
                showPlan={false}
              />
            </div>
          )}
          {/* 报表内容 */}
          {displayPanels.map((panel: any) => {
            const panelData = dataMap.get(panel.id) || []
            return (
              <div key={panel.id} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', fontSize: 14 }}>此快照中无面板数据</div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div className="dashboard-canvas" style={{ padding: '16px 20px 32px' }}>
            {/* AI 洞察区域：只有点击按钮后才显示 */}
            {showAIInsights && (
              <AIInsightsPanel
                dashboardId={snap.dashboard_id}
                dashboardTitle={displayTitle}
                panelsData={panelsData}
                panelsConfig={panelsConfig}
                trigger={aiTrigger}
                editable={true}
                initialData={aiInsights}
                onDataChange={setAiData}
                showPlan={false}
              />
            )}
            {/* 面板内容 */}
            {displayPanels.length > 0 ? (
              <GridLayout panels={displayPanels} onChange={() => {}} rowHeight={30} cols={24} gap={8} editable={false}>
                {(panel) => {
                  const panelData = dataMap.get(panel.id) || []
                  return (
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
                  )
                }}
              </GridLayout>
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', fontSize: 14 }}>此快照中无面板数据</div>
            )}
            {/* AI 洞察区域：只有点击按钮后才显示 */}
            {showAIInsights && aiData && (
              <div style={{ marginTop: 12 }}>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>📋 评估与计划</span>
                    <button
                      onClick={() => setIsEditingPlan(!isEditingPlan)}
                      disabled={!aiData.evaluation}
                      style={{ fontSize: 11, marginLeft: 'auto', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border-color)', background: !aiData.evaluation ? 'var(--bg-disabled)' : 'var(--bg-button)', color: !aiData.evaluation ? 'var(--text-muted)' : 'var(--text-primary)', cursor: !aiData.evaluation ? 'not-allowed' : 'pointer' }}
                    >
                      {isEditingPlan ? '完成编辑' : '编辑'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ flex: 1, minWidth: 0, background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-card) 100%)', borderRadius: 6, padding: 12, border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6', marginBottom: 8 }}>✅ 核心评估</div>
                      <EditableBullets content={aiData.evaluation || ''} loading={false} waiting={false} isEditing={isEditingPlan} onChange={(v: string) => setAiData(prev => prev ? { ...prev, evaluation: v } : prev)} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0, background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-card) 100%)', borderRadius: 6, padding: 12, border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b', marginBottom: 8 }}>📋 下一步计划</div>
                      <EditableBullets content={aiData.plan || ''} loading={false} waiting={false} isEditing={isEditingPlan} onChange={(v: string) => setAiData(prev => prev ? { ...prev, plan: v } : prev)} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}