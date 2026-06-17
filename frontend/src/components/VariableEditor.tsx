import { useState, useEffect } from 'react'
import * as api from '../api'
import type { VariableRes, DatasourceRes } from '../api'

interface VariableEditorProps {
  dashboardId: string
}

const VARIABLE_TYPES = [
  { value: 'custom', label: '自定义', description: '手动定义选项列表' },
  { value: 'query', label: '查询', description: '从数据源查询获取选项' },
  { value: 'textbox', label: '文本框', description: '自由输入文本值' },
  { value: 'constant', label: '常量', description: '隐藏的常量值' },
  { value: 'datasource', label: '数据源', description: '选择数据源' },
  { value: 'interval', label: '时间间隔', description: '时间间隔选择器' },
]

export default function VariableEditor({ dashboardId }: VariableEditorProps) {
  const [variables, setVariables] = useState<VariableRes[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [datasources, setDatasources] = useState<DatasourceRes[]>([])

  // 表单状态
  const [form, setForm] = useState<Partial<VariableRes>>({
    name: '',
    type: 'custom',
    label: '',
    description: '',
    query: '',
    datasource_id: '',
    default: '',
    multi: false,
    include_all: false,
    all_value: '',
    options: [],
  })

  // 自定义选项文本
  const [customOptionsText, setCustomOptionsText] = useState('')

  useEffect(() => {
    loadData()
    api.listDatasources().then(setDatasources).catch(() => {})
  }, [dashboardId])

  const loadData = async () => {
    setLoading(true)
    try {
      const list = await api.listVariables(dashboardId)
      setVariables(list.sort((a, b) => a.sort_order - b.sort_order))
    } catch (e) {
      console.error('加载变量失败', e)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setForm({
      name: '',
      type: 'custom',
      label: '',
      description: '',
      query: '',
      datasource_id: '',
      default: '',
      multi: false,
      include_all: false,
      all_value: '',
      options: [],
    })
    setCustomOptionsText('')
    setEditingId(null)
    setShowForm(false)
  }

  const handleNew = () => {
    resetForm()
    setShowForm(true)
  }

  const handleEdit = (variable: VariableRes) => {
    setForm({
      name: variable.name,
      type: variable.type,
      label: variable.label,
      description: variable.description,
      query: variable.query,
      datasource_id: variable.datasource_id,
      default: variable.default,
      multi: variable.multi,
      include_all: variable.include_all,
      all_value: variable.all_value,
      options: variable.options || [],
    })
    // 解析自定义选项
    if (variable.type === 'custom' && variable.options) {
      setCustomOptionsText(variable.options.map((o) => o.text).join(', '))
    } else {
      setCustomOptionsText('')
    }
    setEditingId(variable.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该变量？')) return
    try {
      await api.deleteVariable(id)
      setVariables((prev) => prev.filter((v) => v.id !== id))
    } catch (e: any) {
      alert('删除失败: ' + (e.message || '未知错误'))
    }
  }

  const handleSave = async () => {
    if (!form.name?.trim()) {
      alert('请输入变量名称')
      return
    }

    setSaving(true)
    try {
      // 解析自定义选项
      let options: api.VariableOption[] = []
      if (form.type === 'custom' && customOptionsText.trim()) {
        options = customOptionsText.split(',').map((s) => s.trim()).filter(Boolean).map((s) => ({
          text: s,
          value: s,
        }))
      }

      const data: Partial<VariableRes> = {
        ...form,
        dashboard_id: dashboardId,
        options,
        sort_order: editingId ? variables.find((v) => v.id === editingId)?.sort_order || 0 : variables.length,
      }

      if (editingId) {
        const updated = await api.updateVariable(editingId, data)
        setVariables((prev) => prev.map((v) => (v.id === editingId ? updated : v)))
      } else {
        const created = await api.createVariable(data)
        setVariables((prev) => [...prev, created])
      }
      resetForm()
    } catch (e: any) {
      alert('保存失败: ' + (e.message || '未知错误'))
    } finally {
      setSaving(false)
    }
  }

  const updateForm = <K extends keyof VariableRes>(key: K, value: VariableRes[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return <div className="variable-editor-loading">加载中...</div>
  }

  return (
    <div className="variable-editor">
      <div className="variable-editor-header">
        <h3>变量管理</h3>
        <button className="btn-sm btn-primary" onClick={handleNew}>+ 添加变量</button>
      </div>

      {/* 变量列表 */}
      <div className="variable-list">
        {variables.length === 0 ? (
          <div className="variable-list-empty">暂无变量，点击上方按钮添加</div>
        ) : (
          variables.map((variable) => (
            <div key={variable.id} className="variable-item">
              <div className="variable-item-info">
                <span className="variable-item-name">{variable.label || variable.name}</span>
                <span className="variable-item-type">{VARIABLE_TYPES.find((t) => t.value === variable.type)?.label || variable.type}</span>
                <span className="variable-item-desc">{variable.description}</span>
              </div>
              <div className="variable-item-actions">
                <button className="btn-sm" onClick={() => handleEdit(variable)}>编辑</button>
                <button className="btn-sm" onClick={() => handleDelete(variable.id)} style={{ color: 'var(--red)' }}>删除</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 编辑表单 */}
      {showForm && (
        <div className="variable-form-overlay" onClick={() => resetForm()}>
          <div className="variable-form" onClick={(e) => e.stopPropagation()}>
            <div className="variable-form-header">
              <h3>{editingId ? '编辑变量' : '添加变量'}</h3>
              <button className="modal-close" onClick={resetForm}>&times;</button>
            </div>

            <div className="variable-form-body">
              {/* 基本信息 */}
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>名称 *</label>
                  <input
                    value={form.name || ''}
                    onChange={(e) => updateForm('name', e.target.value)}
                    placeholder="变量名称（如 server）"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>标签</label>
                  <input
                    value={form.label || ''}
                    onChange={(e) => updateForm('label', e.target.value)}
                    placeholder="显示名称（如 服务器）"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>类型</label>
                <select
                  value={form.type || 'custom'}
                  onChange={(e) => updateForm('type', e.target.value as VariableRes['type'])}
                >
                  {VARIABLE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <div className="form-hint">
                  {VARIABLE_TYPES.find((t) => t.value === form.type)?.description}
                </div>
              </div>

              <div className="form-group">
                <label>描述</label>
                <input
                  value={form.description || ''}
                  onChange={(e) => updateForm('description', e.target.value)}
                  placeholder="变量描述"
                />
              </div>

              {/* 自定义类型配置 */}
              {form.type === 'custom' && (
                <div className="form-group">
                  <label>选项值（逗号分隔）</label>
                  <input
                    value={customOptionsText}
                    onChange={(e) => setCustomOptionsText(e.target.value)}
                    placeholder="选项1, 选项2, 选项3"
                  />
                </div>
              )}

              {/* 查询类型配置 */}
              {form.type === 'query' && (
                <>
                  <div className="form-group">
                    <label>数据源</label>
                    <select
                      value={form.datasource_id || ''}
                      onChange={(e) => updateForm('datasource_id', e.target.value)}
                    >
                      <option value="">选择数据源</option>
                      {datasources.map((ds) => (
                        <option key={ds.id} value={ds.id}>{ds.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>查询语句</label>
                    <textarea
                      value={form.query || ''}
                      onChange={(e) => updateForm('query', e.target.value)}
                      placeholder="SELECT DISTINCT server_name FROM servers"
                      style={{ minHeight: 80, fontFamily: 'monospace', fontSize: 12 }}
                    />
                  </div>
                </>
              )}

              {/* 文本框类型配置 */}
              {form.type === 'textbox' && (
                <div className="form-group">
                  <label>默认值</label>
                  <input
                    value={form.default || ''}
                    onChange={(e) => updateForm('default', e.target.value)}
                    placeholder="默认文本值"
                  />
                </div>
              )}

              {/* 常量类型配置 */}
              {form.type === 'constant' && (
                <div className="form-group">
                  <label>常量值</label>
                  <input
                    value={form.default || ''}
                    onChange={(e) => updateForm('default', e.target.value)}
                    placeholder="常量值"
                  />
                </div>
              )}

              {/* 多选配置 */}
              {(form.type === 'custom' || form.type === 'query') && (
                <>
                  <div className="form-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.multi || false}
                        onChange={(e) => updateForm('multi', e.target.checked)}
                      />
                      <span>允许多选</span>
                    </label>
                  </div>

                  {form.multi && (
                    <div className="form-group">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={form.include_all || false}
                          onChange={(e) => updateForm('include_all', e.target.checked)}
                        />
                        <span>包含"全部"选项</span>
                      </label>
                    </div>
                  )}

                  {form.multi && form.include_all && (
                    <div className="form-group">
                      <label>"全部"选项值</label>
                      <input
                        value={form.all_value || ''}
                        onChange={(e) => updateForm('all_value', e.target.value)}
                        placeholder="默认为通配符 *"
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="variable-form-footer">
              <button className="btn-secondary" onClick={resetForm}>取消</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
