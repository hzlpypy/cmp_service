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
  Input,
  Select,
  DatePicker,
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
  SearchOutlined,
} from '@ant-design/icons'
import * as api from '../api'
import dayjs from 'dayjs'

const { Text, Title } = Typography
const { RangePicker } = DatePicker

export default function SnapshotList() {
  const [snaps, setSnaps] = useState<api.SnapshotRes[]>([])
  const [loading, setLoading] = useState(true)
  
  // 搜索条件（输入状态）
  const [inputName, setInputName] = useState('')
  const [inputDashboard, setInputDashboard] = useState('')
  const [inputDateRange, setInputDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)
  const [inputType, setInputType] = useState<string>('')
  
  // 实际搜索条件（触发搜索后的状态）
  const [searchName, setSearchName] = useState('')
  const [searchDashboard, setSearchDashboard] = useState('')
  const [searchDateRange, setSearchDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)
  const [searchType, setSearchType] = useState<string>('')

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

  // 触发搜索
  const handleSearch = () => {
    setSearchName(inputName)
    setSearchDashboard(inputDashboard)
    setSearchDateRange(inputDateRange)
    setSearchType(inputType)
  }

  // 清空搜索
  const handleClearSearch = () => {
    setInputName('')
    setInputDashboard('')
    setInputDateRange(null)
    setInputType('')
    setSearchName('')
    setSearchDashboard('')
    setSearchDateRange(null)
    setSearchType('')
  }

  // 回车键触发搜索
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  // 搜索过滤逻辑
  const filteredSnaps = snaps.filter((snap) => {
    const isDashboard = !snap.panel_id

    // 名称搜索
    if (searchName.trim()) {
      const name = (snap.name || '未命名快照').toLowerCase()
      if (!name.includes(searchName.toLowerCase())) return false
    }

    // 所属仪表板搜索
    if (searchDashboard.trim()) {
      const dashboardTitle = (snap.dashboard_title || '未知仪表板').toLowerCase()
      if (!dashboardTitle.includes(searchDashboard.toLowerCase())) return false
    }

    // 类型搜索
    if (searchType) {
      const type = isDashboard ? 'dashboard' : 'panel'
      if (type !== searchType) return false
    }

    // 时间范围搜索
    if (searchDateRange && searchDateRange[0] && searchDateRange[1]) {
      if (snap.created_at) {
        const createdTime = dayjs(snap.created_at)
        if (createdTime.isBefore(searchDateRange[0]) || createdTime.isAfter(searchDateRange[1])) {
          return false
        }
      } else {
        return false
      }
    }

    return true
  })

  const shareLink = `${window.location.origin}/capacity_mgt_platform/snapshot/`

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

      {/* 搜索栏 */}
      <div className="snap-search-bar">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            placeholder="搜索名称..."
            prefix={<SearchOutlined style={{ color: '#86909c' }} />}
            value={inputName}
            onChange={(e) => setInputName(e.target.value)}
            onKeyDown={handleKeyPress}
            style={{ width: 200 }}
            allowClear
          />
          <Input
            placeholder="搜索所属仪表板..."
            prefix={<DashboardOutlined style={{ color: '#86909c' }} />}
            value={inputDashboard}
            onChange={(e) => setInputDashboard(e.target.value)}
            onKeyDown={handleKeyPress}
            style={{ width: 200 }}
            allowClear
          />
          <RangePicker
            placeholder={['开始时间', '结束时间']}
            value={inputDateRange as [dayjs.Dayjs, dayjs.Dayjs] | null}
            onChange={(dates) => setInputDateRange(dates)}
            style={{ width: 280 }}
          />
          <Select
            placeholder="选择类型"
            value={inputType || undefined}
            onChange={(value) => setInputType(value || '')}
            style={{ width: 140 }}
            allowClear
            options={[
              { label: '仪表板', value: 'dashboard' },
              { label: '单面板', value: 'panel' },
            ]}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
            搜索
          </Button>
          <Button onClick={handleClearSearch}>清空</Button>
        </div>
      </div>

      {/* 列表 */}
      <Spin spinning={loading}>
        <div className="snap-list">
          {filteredSnaps.length === 0 ? (
            <div className="snap-empty">
              <Text style={{ color: '#86909c', fontSize: 14 }}>
                {searchName || searchDashboard || searchType || searchDateRange ? '没有匹配的快照' : '暂无快照'}
              </Text>
              {!searchName && !searchDashboard && !searchType && !searchDateRange && (
                <Text style={{ color: '#86909c', fontSize: 12, marginTop: 8 }}>
                  在仪表板编辑面板中切换到「共享」Tab 创建快照
                </Text>
              )}
            </div>
          ) : (
            filteredSnaps.map((snap) => {
              const isDashboard = !snap.panel_id
              const panels = snap.dashboard_json?.panels || []
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
                        onClick={() => window.open(`/capacity_mgt_platform/snapshot/${snap.snapshot_key}`, '_blank')}
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
                    {snap.can_edit && (
                      <Tooltip title="删除">
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleDelete(snap.snapshot_key)}
                        />
                      </Tooltip>
                    )}
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