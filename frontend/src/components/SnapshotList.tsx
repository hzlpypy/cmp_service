import { useState, useEffect } from 'react'
import {
  Button,
  Tag,
  Spin,
  message,
  Space,
  Typography,
  Tooltip,
  Modal,
} from 'antd'
import {
  ReloadOutlined,
  EyeOutlined,
  CopyOutlined,
  DeleteOutlined,
  DashboardOutlined,
  AppstoreOutlined,
  CalendarOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import * as api from '../api'

const { Text, Title } = Typography

export default function SnapshotList() {
  const [snaps, setSnaps] = useState<api.SnapshotRes[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      setSnaps(await api.listSnapshots(''))
    } catch (e: any) {
      message.error('加载快照失败: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const shareLink = `${window.location.origin}/snapshot/`

  const handleDelete = async (key: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该快照吗？此操作不可撤销。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.deleteSnapshot(key)
          setSnaps((prev) => prev.filter((s) => s.snapshot_key !== key))
          message.success('删除成功')
        } catch (e: any) {
          message.error('删除失败: ' + (e.message || '未知错误'))
        }
      },
    })
  }

  const handleCopy = (key: string) => {
    navigator.clipboard.writeText(`${shareLink}${key}`)
    message.success('链接已复制')
  }

  return (
    <div className="snap-page">
      {/* Header */}
      <div className="snap-header">
        <Title level={4} style={{ margin: 0, color: '#1d2129' }}>
          快照列表
        </Title>
        <Button size="small" icon={<ReloadOutlined />} onClick={load}>
          刷新
        </Button>
      </div>

      {/* 列表 */}
      <Spin spinning={loading}>
        <div className="snap-list">
          {snaps.length === 0 ? (
            <div className="snap-empty">
              <Text style={{ color: '#86909c', fontSize: 14 }}>暂无快照</Text>
              <Text style={{ color: '#86909c', fontSize: 12, marginTop: 8 }}>
                在仪表板编辑面板中切换到「共享」Tab 创建快照
              </Text>
            </div>
          ) : (
            snaps.map((snap) => {
              const isDashboard = !snap.panel_id
              const dj = snap.dashboard_json || {}
              const panels = dj.panels || []
              const panel = panels.find((p: any) => p.id === snap.panel_id)

              return (
                <div key={snap.snapshot_key} className="snap-row">
                  {/* 左侧：红色边框条 */}
                  <div className="snap-row-bar" />

                  {/* 中间：信息 */}
                  <div className="snap-row-content">
                    <div className="snap-row-header">
                      <Text strong style={{ fontSize: 14, color: '#1d2129' }}>
                        {snap.name || '未命名快照'}
                      </Text>
                      <Tag
                        color={isDashboard ? '#5794f2' : '#ff9830'}
                        style={{ marginLeft: 8, borderRadius: 10 }}
                      >
                        {isDashboard ? '仪表板' : '单面板'}
                      </Tag>
                    </div>

                    <div className="snap-row-meta">
                      <Space size={4}>
                        {isDashboard ? (
                          <DashboardOutlined style={{ fontSize: 14, color: '#86909c' }} />
                        ) : (
                          <AppstoreOutlined style={{ fontSize: 14, color: '#86909c' }} />
                        )}
                        <Text style={{ fontSize: 12, color: '#4e5969' }}>
                          {snap.dashboard_title || '未知仪表板'}
                        </Text>
                        {!isDashboard && panel && (
                          <>
                            <Text style={{ fontSize: 12, color: '#86909c' }}>/</Text>
                            <Text style={{ fontSize: 12, color: '#4e5969' }}>{panel.title}</Text>
                          </>
                        )}
                        {isDashboard && panels.length > 0 && (
                          <Text style={{ fontSize: 11, color: '#86909c' }}>
                            ({panels.length} 个面板)
                          </Text>
                        )}
                      </Space>
                    </div>

                    <div className="snap-row-link">
                      <LinkOutlined style={{ fontSize: 12, color: '#86909c' }} />
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: 'SF Mono, Fira Code, monospace',
                          color: '#4e5969',
                          marginLeft: 4,
                        }}
                      >
                        {shareLink}{snap.snapshot_key}
                      </Text>
                    </div>

                    {snap.created_at && (
                      <div className="snap-row-time">
                        <CalendarOutlined style={{ fontSize: 12, color: '#86909c' }} />
                        <Text style={{ fontSize: 12, color: '#86909c', marginLeft: 4 }}>
                          {new Date(snap.created_at).toLocaleString('zh-CN')}
                        </Text>
                      </div>
                    )}
                  </div>

                  {/* 右侧：操作按钮 */}
                  <div className="snap-row-actions">
                    <Tooltip title="查看">
                      <Button
                        type="text"
                        size="small"
                        icon={<EyeOutlined style={{ color: '#4e5969' }} />}
                        onClick={() => window.open(`/snapshot/${snap.snapshot_key}`, '_blank')}
                      />
                    </Tooltip>
                    <Tooltip title="复制链接">
                      <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined style={{ color: '#4e5969' }} />}
                        onClick={() => handleCopy(snap.snapshot_key)}
                      />
                    </Tooltip>
                    <Tooltip title="删除">
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(snap.snapshot_key)}
                      />
                    </Tooltip>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Spin>

      {/* 内联样式 */}
      <style>{`
        .snap-page {
          padding: 24px 32px;
          background: #f7f8fa;
          min-height: 100vh;
        }

        .snap-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .snap-list {
          background: #fff;
          border: 1px solid #e5e6eb;
          border-radius: 8px;
          overflow: hidden;
        }

        .snap-empty {
          padding: 48px 24px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .snap-row {
          display: flex;
          align-items: flex-start;
          padding: 14px 16px 14px 0;
          border-bottom: 1px solid #f0f0f0;
          transition: background 0.15s;
        }

        .snap-row:last-child {
          border-bottom: none;
        }

        .snap-row:hover {
          background: #f7f8fa;
        }

        .snap-row-bar {
          width: 3px;
          height: 100%;
          min-height: 60px;
          background: #e53935;
          border-radius: 0 2px 2px 0;
          margin-right: 16px;
        }

        .snap-row-content {
          flex: 1;
          min-width: 0;
        }

        .snap-row-header {
          display: flex;
          align-items: center;
          margin-bottom: 6px;
        }

        .snap-row-meta {
          margin-bottom: 6px;
        }

        .snap-row-link {
          display: flex;
          align-items: center;
          margin-bottom: 4px;
        }

        .snap-row-time {
          display: flex;
          align-items: center;
        }

        .snap-row-actions {
          display: flex;
          align-items: center;
          gap: 4px;
          opacity: 0;
          transition: opacity 0.15s;
        }

        .snap-row:hover .snap-row-actions {
          opacity: 1;
        }
      `}</style>
    </div>
  )
}