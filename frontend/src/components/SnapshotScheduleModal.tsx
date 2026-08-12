import { useState, useEffect } from 'react'
import {
  Modal,
  Button,
  Table,
  Space,
  Switch,
  Input,
  Select,
  TimePicker,
  message,
  Tooltip,
  Typography,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import * as api from '../api'
import type { SnapshotScheduleRes } from '../api'
import dayjs from 'dayjs'

const { Text } = Typography

interface SnapshotScheduleModalProps {
  open: boolean
  dashboardId: string
  dashboardTitle: string
  onClose: () => void
}

// 预设时间选项
const PRESET_TIMES = [
  { label: '每天 08:00', value: '0 8 * * *' },
  { label: '每天 12:00', value: '0 12 * * *' },
  { label: '每天 18:00', value: '0 18 * * *' },
  { label: '每天 22:00', value: '0 22 * * *' },
  { label: '工作日 08:00', value: '0 8 * * 1-5' },
  { label: '工作日 18:00', value: '0 18 * * 1-5' },
  { label: '自定义', value: 'custom' },
]

// cron 表达式转可读文本
function cronToText(expr: string): string {
  const parts = expr.split(' ')
  if (parts.length !== 5) return expr

  const [min, hour, day, month, weekday] = parts

  // 简单转换
  const timeStr = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`

  if (day === '*' && month === '*' && weekday === '*') {
    return `每天 ${timeStr}`
  }
  if (day === '*' && month === '*' && weekday === '1-5') {
    return `工作日 ${timeStr}`
  }
  if (day === '*' && month === '*' && weekday !== '*') {
    const dayNames = ['日', '一', '二', '三', '四', '五', '六']
    if (weekday.includes('-')) {
      const [start, end] = weekday.split('-')
      return `周${dayNames[parseInt(start)]}至周${dayNames[parseInt(end)]} ${timeStr}`
    }
    return `每周${dayNames[parseInt(weekday)]} ${timeStr}`
  }
  return expr
}

export default function SnapshotScheduleModal({ open, dashboardId, dashboardTitle, onClose }: SnapshotScheduleModalProps) {
  const [schedules, setSchedules] = useState<SnapshotScheduleRes[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formPreset, setFormPreset] = useState('0 8 * * *')
  const [formCustomCron, setFormCustomCron] = useState('')
  const [formTime, setFormTime] = useState<dayjs.Dayjs | null>(dayjs('08:00', 'HH:mm'))

  const loadSchedules = async () => {
    setLoading(true)
    try {
      const list = await api.listSnapshotSchedules(dashboardId)
      setSchedules(list || [])
    } catch (e: any) {
      message.error('加载定时任务失败: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) loadSchedules()
  }, [open, dashboardId])

  const resetForm = () => {
    setEditingId(null)
    setFormName('')
    setFormPreset('0 8 * * *')
    setFormCustomCron('')
    setFormTime(dayjs('08:00', 'HH:mm'))
    setShowForm(false)
  }

  const handleSave = async () => {
    let cronExpr = formPreset
    if (formPreset === 'custom') {
      cronExpr = formCustomCron.trim()
      if (!cronExpr) {
        message.warning('请输入自定义 cron 表达式')
        return
      }
    } else if (formPreset === '0 8 * * *' || formPreset === '0 12 * * *' || formPreset === '0 18 * * *' || formPreset === '0 22 * * *' || formPreset === '0 8 * * 1-5' || formPreset === '0 18 * * 1-5') {
      // 使用预设的 cron 表达式
      cronExpr = formPreset
    }

    try {
      if (editingId) {
        await api.updateSnapshotSchedule({ id: editingId, name: formName, cron_expr: cronExpr })
        message.success('更新成功')
      } else {
        await api.createSnapshotSchedule({ dashboard_id: dashboardId, name: formName, cron_expr: cronExpr })
        message.success('创建成功')
      }
      resetForm()
      loadSchedules()
    } catch (e: any) {
      message.error('保存失败: ' + e.message)
    }
  }

  const handleEdit = (record: SnapshotScheduleRes) => {
    setEditingId(record.id)
    setFormName(record.name)
    // 尝试匹配预设
    const preset = PRESET_TIMES.find(p => p.value === record.cron_expr)
    if (preset) {
      setFormPreset(preset.value)
    } else {
      setFormPreset('custom')
      setFormCustomCron(record.cron_expr)
    }
    // 解析时间
    const parts = record.cron_expr.split(' ')
    if (parts.length === 5) {
      const timeStr = `${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')}`
      setFormTime(dayjs(timeStr, 'HH:mm'))
    }
    setShowForm(true)
  }

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定删除该定时任务？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.deleteSnapshotSchedule(id)
          message.success('删除成功')
          loadSchedules()
        } catch (e: any) {
          message.error('删除失败: ' + e.message)
        }
      },
    })
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await api.toggleSnapshotSchedule(id, enabled)
      message.success(enabled ? '已启用' : '已禁用')
      loadSchedules()
    } catch (e: any) {
      message.error('操作失败: ' + e.message)
    }
  }

  const columns: ColumnsType<SnapshotScheduleRes> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => name || <Text type="secondary">未命名</Text>,
    },
    {
      title: '创建人',
      dataIndex: 'owner_name',
      key: 'owner_name',
      width: 100,
      render: (name: string) => name || <Text type="secondary">-</Text>,
    },
    {
      title: '执行时间',
      dataIndex: 'cron_expr',
      key: 'cron_expr',
      render: (expr: string) => (
        <Space>
          <ClockCircleOutlined style={{ color: '#86909c' }} />
          <Text>{cronToText(expr)}</Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (enabled: boolean, record) => (
        <Switch
          checked={enabled}
          onChange={(checked) => handleToggle(record.id, checked)}
          checkedChildren={<CheckCircleOutlined />}
          unCheckedChildren={<StopOutlined />}
          style={{ backgroundColor: enabled ? '#e24d4d' : undefined }}
        />
      ),
    },
    {
      title: '上次执行',
      dataIndex: 'last_run_at',
      key: 'last_run_at',
      width: 120,
      render: (time: string) => time ? (
        <Text style={{ fontSize: 12, color: '#86909c' }}>
          {dayjs(time).format('MM/DD HH:mm')}
        </Text>
      ) : <Text type="secondary">-</Text>,
    },
    {
      title: '下次执行',
      dataIndex: 'next_run_at',
      key: 'next_run_at',
      width: 120,
      render: (time: string) => time ? (
        <Text style={{ fontSize: 12, color: '#86909c' }}>
          {dayjs(time).format('MM/DD HH:mm')}
        </Text>
      ) : <Text type="secondary">-</Text>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record.id)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <Modal
      title={
        <Space>
          <ClockCircleOutlined />
          <span>定时快照 - {dashboardTitle}</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={920}
    >
      <div style={{ marginBottom: 16 }}>
        <Button
          danger
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => { resetForm(); setShowForm(true) }}
        >
          添加定时任务
        </Button>
      </div>

      {showForm && (
        <div style={{
          background: '#f7f8fa',
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
          border: '1px solid #e5e6eb',
        }}>
          <div style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: '#86909c', marginBottom: 4, display: 'block' }}>
              任务名称（可选）
            </Text>
            <Input
              placeholder="如：每日早报快照"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              style={{ maxWidth: 300 }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: '#86909c', marginBottom: 4, display: 'block' }}>
              执行时间
            </Text>
            <Space wrap>
              <Select
                value={formPreset}
                onChange={(v) => {
                  setFormPreset(v)
                  if (v !== 'custom') {
                    // 解析预设时间
                    const preset = PRESET_TIMES.find(p => p.value === v)
                    if (preset) {
                      const parts = preset.value.split(' ')
                      const timeStr = `${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')}`
                      setFormTime(dayjs(timeStr, 'HH:mm'))
                    }
                  }
                }}
                style={{ width: 180 }}
              >
                {PRESET_TIMES.map(p => (
                  <Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>
                ))}
              </Select>

              {formPreset !== 'custom' && formPreset !== '0 8 * * *' && formPreset !== '0 12 * * *' && formPreset !== '0 18 * * *' && formPreset !== '0 22 * * *' && formPreset !== '0 8 * * 1-5' && formPreset !== '0 18 * * 1-5' && (
                <TimePicker
                  value={formTime}
                  onChange={(t) => setFormTime(t)}
                  format="HH:mm"
                  minuteStep={15}
                />
              )}

              {formPreset === 'custom' && (
                <Input
                  placeholder="cron 表达式，如 0 8 * * *"
                  value={formCustomCron}
                  onChange={(e) => setFormCustomCron(e.target.value)}
                  style={{ width: 200 }}
                />
              )}
            </Space>
          </div>

          <Space>
            <Button danger type="primary" onClick={handleSave}>
              {editingId ? '更新' : '创建'}
            </Button>
            <Button onClick={resetForm}>取消</Button>
          </Space>
        </div>
      )}

      <Table
        columns={columns}
        dataSource={schedules}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={false}
        locale={{ emptyText: '暂无定时任务，点击"添加定时任务"开始配置' }}
      />
    </Modal>
  )
}
