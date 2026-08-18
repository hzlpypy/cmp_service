// ImportDashboardModal 仪表板导入弹窗（参照 Grafana 导入）：
// 支持上传 .json 文件或粘贴 JSON，解析出仪表板定义后选择名称/文件夹导入。
import { useState, useEffect } from 'react'
import { Modal, Upload, Input, Select, Button, Space, message, Alert } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import * as api from '../api'
import type { DashboardJSON, FolderRes } from '../api'

const { TextArea } = Input

interface ImportDashboardModalProps {
  open: boolean
  folders: FolderRes[]
  onClose: () => void
  /** 导入成功后回调：跳转到新仪表板 */
  onImported: (dashboardId: string, title: string) => void
}

export default function ImportDashboardModal({ open, folders, onClose, onImported }: ImportDashboardModalProps) {
  const [jsonText, setJsonText] = useState('')
  const [name, setName] = useState('')
  const [folderId, setFolderId] = useState<string>('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 解析后的仪表板定义（用于导入前校验和标题回填）
  const [parsed, setParsed] = useState<DashboardJSON | null>(null)

  // 打开弹窗时重置表单，并默认选中第一个文件夹
  useEffect(() => {
    if (open) {
      setJsonText('')
      setName('')
      setFolderId(folders.length > 0 ? folders[0].id : '')
      setError(null)
      setParsed(null)
    }
  }, [open, folders])

  // 解析 JSON 文本：支持 Grafana 导出格式 { dashboard: {...} } 或直接为仪表板定义
  const handleJsonTextChange = (text: string) => {
    setJsonText(text)
    setError(null)
    if (!text.trim()) {
      setParsed(null)
      setName('')
      return
    }
    try {
      const obj = JSON.parse(text)
      const dash = obj?.dashboard && typeof obj.dashboard === 'object' ? obj.dashboard : obj
      if (!dash || typeof dash !== 'object') {
        setParsed(null)
        setError('JSON 中未找到仪表板定义')
        return
      }
      setParsed(dash as DashboardJSON)
      const t = typeof dash.title === 'string' ? dash.title : ''
      setName(t)
    } catch {
      // 解析失败不立即报错，导入时再校验；这里仅清空解析结果
      setParsed(null)
    }
  }

  const uploadProps: UploadProps = {
    accept: '.json,application/json',
    showUploadList: false,
    multiple: false,
    beforeUpload: (file) => {
      const reader = new FileReader()
      reader.onload = () => {
        handleJsonTextChange(String(reader.result || ''))
      }
      reader.readAsText(file)
      return false // 阻止自动上传，仅读取内容
    },
  }

  const handleImport = async () => {
    setError(null)
    let finalJson: DashboardJSON | null = parsed
    // 未解析成功时再尝试解析一次
    if (!finalJson) {
      try {
        const obj = JSON.parse(jsonText)
        const dash = obj?.dashboard && typeof obj.dashboard === 'object' ? obj.dashboard : obj
        finalJson = dash as DashboardJSON
      } catch {
        finalJson = null
      }
    }
    if (!finalJson || typeof finalJson !== 'object') {
      setError('请输入有效的仪表板 JSON')
      return
    }
    if (!Array.isArray(finalJson.panels)) {
      setError('仪表板 JSON 缺少 panels 数组')
      return
    }
    if (!folderId) {
      setError('请先创建并选择一个文件夹')
      return
    }

    const finalName = name.trim() || (typeof finalJson.title === 'string' && finalJson.title.trim()) || '导入的仪表板'
    setImporting(true)
    try {
      const res = await api.importDashboard(finalName, folderId, finalJson)
      message.success('导入成功')
      onImported(res.id, finalName)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      title="导入仪表板"
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      destroyOnHidden
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Upload.Dragger {...uploadProps} style={{ padding: '12px 0' }}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或拖拽 .json 文件到此区域上传</p>
          <p className="ant-upload-hint">支持本平台导出的仪表板 JSON，以及 Grafana 导出格式（含 dashboard 字段）</p>
        </Upload.Dragger>

        <TextArea
          rows={6}
          placeholder={'或直接粘贴仪表板 JSON，例如：\n{ "title": "我的仪表板", "panels": [...] }'}
          value={jsonText}
          onChange={(e) => handleJsonTextChange(e.target.value)}
        />

        {error && <Alert type="error" showIcon message={error} />}

        <Space style={{ width: '100%' }} align="start">
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 4, fontSize: 13 }}>名称</div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="仪表板名称（默认取 JSON 标题）"
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 4, fontSize: 13 }}>文件夹</div>
            <Select
              style={{ width: '100%' }}
              value={folderId || undefined}
              onChange={setFolderId}
              placeholder="选择文件夹"
              options={folders.map((f) => ({ value: f.id, label: f.title }))}
            />
          </div>
        </Space>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={importing} disabled={!jsonText.trim()} onClick={handleImport}>
            导入
          </Button>
        </div>
      </Space>
    </Modal>
  )
}
