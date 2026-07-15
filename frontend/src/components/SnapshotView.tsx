import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Button,
  Tag,
  Spin,
  message,
  Space,
  Typography,
  Card,
} from 'antd'
import {
  StarOutlined,
  SaveOutlined,
  CloseOutlined,
  ArrowLeftOutlined,
  CalendarOutlined,
  DashboardOutlined,
  EditOutlined,
  CheckOutlined,
} from '@ant-design/icons'
import * as api from '../api'
import type { SnapshotRes } from '../api'
import ChartPanel from './ChartPanel'
import GridLayout from './GridLayout'
import { AIInsightsPanel, checkHasReportContent, EditableBullets } from './AIInsightsSection'

const { Text, Title } = Typography

interface SnapshotViewProps {
  snapshotKey: string
  onClose: () => void
}

export default function SnapshotView({ snapshotKey, onClose }: SnapshotViewProps) {
  const [snap, setSnap] = useState<SnapshotRes | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showAIInsights, setShowAIInsights] = useState(false)
  const [aiTrigger, setAITrigger] = useState(0)
  const [aiData, setAiData] = useState<{
    score: number
    conclusion: string
    risks: string[]
    evaluation: string
    plan: string
  } | null>(null)
  const [isEditingPlan, setIsEditingPlan] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    // 重置所有状态
    setShowAIInsights(false)
    setAiData(null)
    setAITrigger(0)

    api
      .getSnapshot(snapshotKey)
      .then((data) => {
        setSnap(data)
        // 如果有任何 AI 洞察数据，自动显示
        if (data?.ai_insights) {
          const hasContent =
            data.ai_insights.conclusion ||
            (data.ai_insights.risks && data.ai_insights.risks.length > 0) ||
            data.ai_insights.evaluation ||
            data.ai_insights.plan

          if (hasContent) {
            setShowAIInsights(true)
            setAiData({
              score: data.ai_insights.score || 75,
              conclusion: data.ai_insights.conclusion || '',
              risks: data.ai_insights.risks || [],
              evaluation: data.ai_insights.evaluation || '',
              plan: data.ai_insights.plan || '',
            })
          }
        }
      })
      .catch((e) => setError(e.message || '加载快照失败'))
      .finally(() => setLoading(false))
  }, [snapshotKey])

  const handleSaveAIInsights = useCallback(async () => {
    if (!snap || !aiData) return
    setSaving(true)
    try {
      await api.updateSnapshot({
        snapshot_key: snap.snapshot_key,
        ai_insights: aiData,
      })
      setSnap((prev) =>
        prev
          ? {
              ...prev,
              ai_insights: {
                score: aiData.score,
                conclusion: aiData.conclusion,
                risks: aiData.risks,
                evaluation: aiData.evaluation,
                plan: aiData.plan,
              },
            }
          : prev
      )
      message.success('保存成功')
    } catch (e: any) {
      message.error('保存失败: ' + (e.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }, [snap, aiData])

  const handleAIInsightsClick = useCallback(() => {
    setShowAIInsights(true)
    setAITrigger((prev) => prev + 1)
  }, [])

  // === hooks must be before any early return ===
  const displayPanels = useMemo(() => {
    if (!snap) return []
    const dj = snap.dashboard_json || { title: '快照', panels: [] }
    const panels: any[] = dj.panels || []
    return snap.panel_id ? panels.filter((p: any) => p.id === snap.panel_id) : panels
  }, [snap])

  const panelsData = useMemo(() =>
    snap?.panels_data?.map((pd: any) => ({
      id: pd.panel_id,
      title: pd.panel_title || displayPanels.find((p: any) => p.id === pd.panel_id)?.title || '',
      type: pd.panel_type || displayPanels.find((p: any) => p.id === pd.panel_id)?.type || 'table',
      data: pd.target || [],
      columns: pd.columns || [],
    })) || []
  , [snap?.panels_data, displayPanels])

  const panelsConfig = useMemo(() => displayPanels.map((p: any) => ({
    id: p.id,
    title: p.title,
    type: p.type,
    targets: (p.targets || []).map((t: any) => ({ refId: t.refId, rawSql: t.rawSql || '' })),
  })), [displayPanels])

  const aiInsights = useMemo(() => snap?.ai_insights
    ? {
        score: snap.ai_insights.score || 75,
        conclusion: snap.ai_insights.conclusion || '',
        risks: snap.ai_insights.risks || [],
        evaluation: snap.ai_insights.evaluation || '',
        plan: snap.ai_insights.plan || '',
      }
    : undefined
  , [snap?.ai_insights])

  if (loading) {
    return (
      <div className="snapshot-page">
        <div className="snapshot-loading">
          <Spin size="large" />
          <Text style={{ color: '#86909c', marginTop: 16 }}>加载快照中...</Text>
        </div>
      </div>
    )
  }

  if (error || !snap) {
    return (
      <div className="snapshot-page">
        <div className="snapshot-error">
          <Text style={{ fontSize: 16, color: '#86909c' }}>{error || '快照不存在'}</Text>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onClose} style={{ marginTop: 16 }}>
            返回首页
          </Button>
        </div>
      </div>
    )
  }

  const dj = snap.dashboard_json || { title: '快照', panels: [] }
  const isSinglePanel = !!snap.panel_id

  const dataMap = new Map<string, any[][]>()
  const columnMap = new Map<string, string[]>()
  if (snap.panels_data) {
    snap.panels_data.forEach((pd: any) => {
      dataMap.set(pd.panel_id, pd.target || [])
      columnMap.set(pd.panel_id, pd.columns || [])
    })
  }

  const displayTitle = isSinglePanel
    ? displayPanels[0]?.title || snap.name || '快照'
    : dj.title || snap.name || '快照'
  const hasReportContent = checkHasReportContent(panelsData)

  return (
    <div className="snapshot-page">
      {/* Header */}
      <div className="snapshot-header">
        <div className="snapshot-header-left">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={onClose}
            style={{ marginRight: 12 }}
          />
          <Title level={4} style={{ margin: 0, color: '#1d2129' }}>
            {displayTitle}
          </Title>
          <Tag color="#e53935" style={{ marginLeft: 8, borderRadius: 10 }}>
            快照
          </Tag>
          {snap.name && (
            <Text style={{ fontSize: 12, color: '#86909c', marginLeft: 8 }}>{snap.name}</Text>
          )}
          {!isSinglePanel && (
            <Space size={4} style={{ marginLeft: 12 }}>
              <DashboardOutlined style={{ fontSize: 14, color: '#86909c' }} />
              <Text style={{ fontSize: 12, color: '#86909c' }}>{displayPanels.length} 个面板</Text>
            </Space>
          )}
        </div>
        <div className="snapshot-header-right">
          <Button
            size="small"
            icon={<StarOutlined />}
            onClick={handleAIInsightsClick}
            disabled={!hasReportContent}
          >
            AI 洞察
          </Button>
          {showAIInsights && aiData && (
            <Button
              type="primary"
              size="small"
              icon={<SaveOutlined />}
              onClick={handleSaveAIInsights}
              loading={saving}
            >
              {saving ? '保存中...' : '保存'}
            </Button>
          )}
          {showAIInsights && (
            <Button
              size="small"
              icon={<CloseOutlined />}
              onClick={() => setShowAIInsights(false)}
            >
              关闭
            </Button>
          )}
          <Space size={4} style={{ marginLeft: 12 }}>
            <CalendarOutlined style={{ fontSize: 14, color: '#86909c' }} />
            <Text style={{ fontSize: 12, color: '#86909c' }}>
              创建于 {snap.created_at ? new Date(snap.created_at).toLocaleString('zh-CN') : '-'}
            </Text>
          </Space>
        </div>
      </div>

      {/* Body */}
      <div className="snapshot-body">
        {isSinglePanel ? (
          <>
            {/* AI 洞察区域 */}
            {showAIInsights && (
              <div className="snapshot-ai-section">
                <div className="snapshot-ai-card">
                  <div className="snapshot-ai-header">
                    <Text strong style={{ fontSize: 14, color: '#1d2129' }}>
                      AI 洞察
                    </Text>
                  </div>
                  <div className="snapshot-ai-content">
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
                </div>
              </div>
            )}
            {/* 单面板内容 */}
            <div className="snapshot-panel-single">
              {displayPanels.map((panel: any) => {
                const panelData = dataMap.get(panel.id) || []
                return (
                  <ChartPanel
                    key={panel.id}
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
              })}
              {displayPanels.length === 0 && (
                <div className="snapshot-empty">
                  <Text style={{ color: '#86909c' }}>此快照中无面板数据</Text>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* AI 洞察区域 */}
            {showAIInsights && (
              <div className="snapshot-ai-section">
                <div className="snapshot-ai-card">
                  <div className="snapshot-ai-header">
                    <Text strong style={{ fontSize: 14, color: '#1d2129' }}>
                      AI 洞察
                    </Text>
                  </div>
                  <div className="snapshot-ai-content">
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
                </div>
              </div>
            )}
            {/* 多面板内容 */}
            <div className="snapshot-panel-grid">
              {displayPanels.length > 0 ? (
                <GridLayout
                  panels={displayPanels}
                  onChange={() => {}}
                  rowHeight={30}
                  cols={24}
                  gap={8}
                  editable={false}
                >
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
                <div className="snapshot-empty">
                  <Text style={{ color: '#86909c' }}>此快照中无面板数据</Text>
                </div>
              )}
            </div>
            {/* 评估与计划 */}
            {showAIInsights && aiData && (
              <Card
                className="snapshot-plan-card"
                title={
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>评估与计划</span>
                    <Button
                      size="small"
                      type="text"
                      icon={isEditingPlan ? <CheckOutlined /> : <EditOutlined />}
                      onClick={() => setIsEditingPlan(!isEditingPlan)}
                      disabled={!aiData.evaluation}
                    >
                      {isEditingPlan ? '完成' : '编辑'}
                    </Button>
                  </div>
                }
              >
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1, background: '#f7f8fa', borderRadius: 6, padding: 12 }}>
                    <Text style={{ fontSize: 13, fontWeight: 600, color: '#3b82f6', marginBottom: 8, display: 'block' }}>
                      核心评估
                    </Text>
                    <EditableBullets
                      content={aiData.evaluation || ''}
                      loading={false}
                      waiting={false}
                      isEditing={isEditingPlan}
                      onChange={(v: string) =>
                        setAiData((prev) =>
                          prev
                            ? {
                                ...prev,
                                evaluation: v,
                              }
                            : prev
                        )
                      }
                    />
                  </div>
                  <div style={{ width: 1, background: '#e5e6eb' }} />
                  <div style={{ flex: 1, background: '#f7f8fa', borderRadius: 6, padding: 12 }}>
                    <Text style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b', marginBottom: 8, display: 'block' }}>
                      下一步计划
                    </Text>
                    <EditableBullets
                      content={aiData.plan || ''}
                      loading={false}
                      waiting={false}
                      isEditing={isEditingPlan}
                      onChange={(v: string) =>
                        setAiData((prev) =>
                          prev
                            ? {
                                ...prev,
                                plan: v,
                              }
                            : prev
                        )
                      }
                    />
                  </div>
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      {/* 内联样式 */}
      <style>{`
        .snapshot-page {
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: #f7f8fa;
        }

        .snapshot-loading,
        .snapshot-error {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          height: 100%;
        }

        .snapshot-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: #fff;
          border-bottom: 1px solid #e5e6eb;
          flex-shrink: 0;
        }

        .snapshot-header-left {
          display: flex;
          align-items: center;
        }

        .snapshot-header-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .snapshot-body {
          flex: 1;
          overflow: auto;
          padding: 16px 20px 32px;
        }

        .snapshot-ai-section {
          margin-bottom: 16px;
        }

        .snapshot-ai-card {
          background: #fff;
          border: 1px solid #e5e6eb;
          border-radius: 8px;
          overflow: hidden;
        }

        .snapshot-ai-header {
          padding: 12px 16px;
          border-bottom: 1px solid #e5e6eb;
        }

        .snapshot-ai-content {
          padding: 16px;
        }

        .snapshot-panel-single {
          background: #fff;
          border: 1px solid #e5e6eb;
          border-radius: 8px;
          padding: 16px;
          min-height: 300px;
        }

        .snapshot-panel-grid {
          background: #fff;
          border: 1px solid #e5e6eb;
          border-radius: 8px;
          padding: 16px;
        }

        .snapshot-empty {
          text-align: center;
          padding: 60px 24px;
        }

        .snapshot-plan-card {
          margin-top: 16px;
          border: 1px solid #e5e6eb;
          border-radius: 8px;
        }

        .snapshot-plan-card .ant-card-head {
          border-bottom: 1px solid #e5e6eb;
        }

        .snapshot-plan-card .ant-card-head-title {
          font-weight: 600;
          color: #1d2129;
        }
      `}</style>
    </div>
  )
}