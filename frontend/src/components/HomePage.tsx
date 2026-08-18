// HomePage 首页（参照 Grafana Home）：欢迎横幅 + 全局搜索 + 快速操作 + 数据概览 + 最近访问。
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Input, Button, Row, Col, Statistic, Empty, Modal, Select, message, List, Tag } from 'antd'
import {
  PlusOutlined,
  ImportOutlined,
  DatabaseOutlined,
  CameraOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  FolderOutlined,
  TeamOutlined,
  ShareAltOutlined,
} from '@ant-design/icons'
import * as api from '../api'
import type { FolderRes, DashboardBriefRes } from '../api'
import ImportDashboardModal from './ImportDashboardModal'
import { sampleDashboards } from '../mock/dashboardSamples'
import { getRecentDashboards } from '../recentDashboards'

function titleToSlug(title: string): string {
  return encodeURIComponent(title.replace(/\s+/g, '-').toLowerCase())
}

interface HomePageProps {
  currentUserName: string
  currentUserRole: string
  onNavigate: (page: 'browse' | 'snapshots' | 'datasources') => void
}

export default function HomePage({ currentUserName, currentUserRole, onNavigate }: HomePageProps) {
  const navigate = useNavigate()
  const [folders, setFolders] = useState<FolderRes[]>([])
  const [searchText, setSearchText] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newFolderId, setNewFolderId] = useState('')
  const [newSample, setNewSample] = useState('bar')
  const [creating, setCreating] = useState(false)

  // 最近访问（仅在挂载时读取一次）
  const [recent] = useState(() => getRecentDashboards())

  useEffect(() => {
    api.listFolders().then((r) => {
      setFolders(r.list || [])
    }).catch(() => {
      // 首页统计加载失败静默处理
    })
  }, [])

  // 统计：按 source 分组统计仪表板数量
  const stats = useMemo(() => {
    let mine = 0
    let shared = 0
    let team = 0
    folders.forEach((f) => (f.dashboards || []).forEach((d) => {
      const s = d.source || 'mine'
      if (s === 'shared') shared++
      else if (s === 'team') team++
      else mine++
    }))
    return { mine, shared, team, totalFolders: folders.length }
  }, [folders])

  // 搜索：本地按标题过滤
  const searchResults = useMemo(() => {
    const kw = searchText.trim().toLowerCase()
    if (!kw) return []
    const res: { db: DashboardBriefRes; folderTitle: string }[] = []
    folders.forEach((f) => (f.dashboards || []).forEach((d) => {
      if (d.title.toLowerCase().includes(kw)) res.push({ db: d, folderTitle: f.title })
    }))
    return res.slice(0, 10)
  }, [folders, searchText])

  const hour = new Date().getHours()
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'

  const openDashboard = (id: string, title: string) => {
    navigate(`/capacity_mgt_platform/d/${id}/${titleToSlug(title)}`)
  }

  const handleCreate = async () => {
    if (!newTitle.trim() || !newFolderId) return
    const sampleDef = sampleDashboards.find((s) => s.key === newSample)
    setCreating(true)
    try {
      const db = await api.createDashboard(newTitle.trim(), newFolderId, sampleDef?.json)
      message.success('仪表板创建成功')
      setShowNew(false)
      setNewTitle('')
      openDashboard(db.id, db.title)
    } catch (e: any) {
      message.error('创建失败: ' + (e?.message || String(e)))
    } finally {
      setCreating(false)
    }
  }

  const openNewModal = () => {
    setNewFolderId(folders.length > 0 ? folders[0].id : '')
    setNewSample('bar')
    setShowNew(true)
  }

  // 快速操作卡片
  const quickActions = [
    {
      key: 'new',
      title: '新建仪表板',
      desc: '从模板快速创建监控大盘',
      icon: <PlusOutlined />,
      color: '#3871dc',
      onClick: openNewModal,
    },
    {
      key: 'import',
      title: '导入仪表板',
      desc: '导入 Grafana 或本平台 JSON',
      icon: <ImportOutlined />,
      color: '#7048e8',
      onClick: () => setShowImport(true),
    },
    {
      key: 'datasource',
      title: '新建数据源',
      desc: '接入 MySQL 或 HTTP 数据源',
      icon: <DatabaseOutlined />,
      color: '#55bd6a',
      onClick: () => onNavigate('datasources'),
    },
    {
      key: 'snapshot',
      title: '查看快照',
      desc: '浏览仪表板历史快照',
      icon: <CameraOutlined />,
      color: '#fc9908',
      onClick: () => onNavigate('snapshots'),
    },
  ]

  return (
    <div className="home-page">
      {/* 欢迎横幅 */}
      <div className="home-hero">
        <div>
          <div className="home-hero-greeting">{greeting}，{currentUserName}</div>
          <div className="home-hero-sub">容量管理平台 · 监控你的资源使用率与容量趋势</div>
        </div>
        <div className="home-hero-search">
          <Input.Search
            placeholder="搜索仪表板…"
            allowClear
            size="large"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 360 }}
          />
          {searchText.trim() && (
            <div className="home-search-results">
              {searchResults.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未找到匹配的仪表板" />
              ) : (
                <List
                  size="small"
                  dataSource={searchResults}
                  renderItem={(item) => (
                    <List.Item
                      className="home-search-item"
                      onClick={() => openDashboard(item.db.id, item.db.title)}
                    >
                      <DashboardOutlined style={{ color: '#999' }} />
                      <span className="home-search-title">{item.db.title}</span>
                      <Tag bordered={false} style={{ marginLeft: 'auto' }}>{item.folderTitle}</Tag>
                    </List.Item>
                  )}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* 快速操作 */}
      <div className="home-section">
        <div className="home-section-title">快速开始</div>
        <Row gutter={[16, 16]}>
          {quickActions.map((a) => (
            <Col key={a.key} xs={24} sm={12} lg={6}>
              <Card hoverable className="home-action-card" onClick={a.onClick}>
                <div className="home-action-icon" style={{ background: `${a.color}1a`, color: a.color }}>
                  {a.icon}
                </div>
                <div className="home-action-title">{a.title}</div>
                <div className="home-action-desc">{a.desc}</div>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* 数据概览 */}
      <div className="home-section">
        <div className="home-section-title">数据概览</div>
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={6}>
            <Card className="home-stat-card">
              <Statistic
                title="我的仪表板"
                value={stats.mine}
                prefix={<DashboardOutlined style={{ color: '#3871dc' }} />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card className="home-stat-card">
              <Statistic
                title="分享给我的"
                value={stats.shared}
                prefix={<ShareAltOutlined style={{ color: '#7048e8' }} />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card className="home-stat-card">
              <Statistic
                title="团队仪表板"
                value={stats.team}
                prefix={<TeamOutlined style={{ color: '#55bd6a' }} />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card className="home-stat-card">
              <Statistic
                title="文件夹"
                value={stats.totalFolders}
                prefix={<FolderOutlined style={{ color: '#fc9908' }} />}
              />
            </Card>
          </Col>
        </Row>
      </div>

      {/* 最近访问 */}
      <div className="home-section">
        <div className="home-section-title">
          最近访问
          <Button type="link" size="small" onClick={() => onNavigate('browse')} style={{ marginLeft: 'auto' }}>
            全部仪表板
          </Button>
        </div>
        {recent.length === 0 ? (
          <Card className="home-empty-card">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无访问记录，去创建一个仪表板吧" />
          </Card>
        ) : (
          <Row gutter={[16, 16]}>
            {recent.map((d) => (
              <Col key={d.id} xs={24} sm={12} lg={6}>
                <Card hoverable className="home-recent-card" onClick={() => openDashboard(d.id, d.title)}>
                  <div className="home-recent-icon"><DashboardOutlined /></div>
                  <div className="home-recent-title" title={d.title}>{d.title}</div>
                  <div className="home-recent-time">
                    <ClockCircleOutlined /> {new Date(d.visitedAt).toLocaleString('zh-CN')}
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </div>

      {/* 新建仪表板弹窗 */}
      <Modal
        title="新建仪表板"
        open={showNew}
        onCancel={() => setShowNew(false)}
        onOk={handleCreate}
        okText="创建"
        cancelText="取消"
        confirmLoading={creating}
        okButtonProps={{ disabled: !newTitle.trim() || !newFolderId }}
      >
        <div className="home-modal-field">
          <div className="home-modal-label">仪表板名称</div>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="输入仪表板名称"
            autoFocus
          />
        </div>
        <div className="home-modal-field">
          <div className="home-modal-label">所属文件夹</div>
          <Select
            style={{ width: '100%' }}
            value={newFolderId || undefined}
            onChange={setNewFolderId}
            placeholder="请选择文件夹"
            options={folders.map((f) => ({ value: f.id, label: f.title }))}
          />
        </div>
        <div className="home-modal-field">
          <div className="home-modal-label">图表模板</div>
          <Select
            style={{ width: '100%' }}
            value={newSample}
            onChange={setNewSample}
            options={sampleDashboards.map((s) => ({ value: s.key, label: s.label }))}
          />
        </div>
      </Modal>

      {/* 导入弹窗（复用） */}
      <ImportDashboardModal
        open={showImport}
        folders={folders}
        onClose={() => setShowImport(false)}
        onImported={(id, title) => {
          setShowImport(false)
          openDashboard(id, title)
        }}
      />
    </div>
  )
}
