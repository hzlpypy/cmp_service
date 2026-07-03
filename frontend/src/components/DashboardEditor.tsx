import { useState, useEffect, useCallback } from 'react'
import type { DashboardJSON } from '../api'
import VariableEditor from './VariableEditor'

interface DashboardEditorProps {
  title: string
  json: DashboardJSON
  dashboardId: string
  onSave: (updated: DashboardJSON) => Promise<void>
  onClose: () => void
}

type EditorTab = 'visual' | 'json' | 'variables'

function cloneJson(json: DashboardJSON): DashboardJSON {
  return JSON.parse(JSON.stringify(json))
}

export default function DashboardEditor({ title, json, dashboardId, onSave, onClose }: DashboardEditorProps) {
  const [tab, setTab] = useState<EditorTab>('visual')
  const [dashboardTitle, setDashboardTitle] = useState(title)
  const [jsonText, setJsonText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const cloned = cloneJson(json)
    setJsonText(JSON.stringify(cloned, null, 2))
    setDashboardTitle(title)
  }, [json, title])

  const switchToJson = useCallback(() => {
    setJsonText(JSON.stringify({ title: dashboardTitle, panels: json.panels }, null, 2))
    setTab('json')
  }, [dashboardTitle, json.panels])

  const switchToVisual = useCallback(() => {
    try {
      const p = JSON.parse(jsonText) as DashboardJSON
      if (p.title) setDashboardTitle(p.title)
      setTab('visual')
    } catch { alert('JSON 格式错误，请修正后再切换') }
  }, [jsonText])

  const handleSave = async () => {
    setSaving(true)
    try {
      let final: DashboardJSON
      if (tab === 'visual') {
        final = { title: dashboardTitle, panels: json.panels }
      } else {
        final = JSON.parse(jsonText)
      }
      await onSave(final)
    } catch (e: any) { alert('保存失败: ' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 720, maxHeight: '92vh' }}>
        <div className="modal-header">
          <h2>编辑仪表板</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="editor-tabs">
              <button className={`editor-tab ${tab === 'visual' ? 'active' : ''}`} onClick={() => tab !== 'visual' && switchToVisual()}>基本信息</button>
              <button className={`editor-tab ${tab === 'json' ? 'active' : ''}`} onClick={() => tab !== 'json' && switchToJson()}>JSON编辑</button>
              <button className={`editor-tab ${tab === 'variables' ? 'active' : ''}`} onClick={() => setTab('variables')}>变量</button>
            </div>
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>
        </div>

        <div className="modal-body" style={{ maxHeight: '64vh', overflow: 'auto' }}>
          {tab === 'variables' ? (
            <VariableEditor dashboardId={dashboardId} />
          ) : tab === 'visual' ? (
            <div style={{ padding: '8px 0' }}>
              <div className="form-group">
                <label>仪表板名称</label>
                <input
                  value={dashboardTitle}
                  onChange={(e) => setDashboardTitle(e.target.value)}
                  placeholder="输入仪表板名称"
                  style={{ fontSize: 14 }}
                />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 16, padding: 12, background: 'var(--bg-input)', borderRadius: 4, lineHeight: 1.6 }}>
                <div style={{ fontWeight: 500, marginBottom: 6 }}>提示</div>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  <li>编辑报表详情：返回仪表板点击报表右上角菜单 → 编辑</li>
                  <li>调整布局：在仪表板页面直接拖拽报表</li>
                  <li>高级编辑：切换到「JSON编辑」标签页</li>
                </ul>
              </div>
            </div>
          ) : (
            <div>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                style={{ width: '100%', minHeight: 420, background: '#1e1e2e', color: '#cdd6f4',
                  border: '1px solid var(--border-color)', borderRadius: 4, padding: 12,
                  fontFamily: 'monospace', fontSize: 12, resize: 'vertical', outline: 'none', lineHeight: 1.6 }}
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)' }}>
            {tab === 'variables' ? '管理仪表板变量' : tab === 'visual' ? '编辑仪表板基本信息' : '直接编辑 JSON'}
          </div>
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}
