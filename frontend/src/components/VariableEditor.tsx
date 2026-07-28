import { useState, useEffect } from 'react'
import { Modal, message, Input, Select as AntSelect } from 'antd'
import * as api from '../api'
import type { VariableRes, DatasourceRes, VariableOption } from '../api'

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
    include_all: true,
    depends_on: '',
    auto_refresh: true,
    hide: false,
    options: [],
  })

  // 自定义选项文本
  const [customOptionsText, setCustomOptionsText] = useState('')

  // 查询预览值
  const [previewValues, setPreviewValues] = useState<VariableOption[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewExpanded, setPreviewExpanded] = useState(false)
  const PREVIEW_LIMIT = 8 // 默认展示的条数

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
      include_all: true,
      depends_on: '',
      auto_refresh: true,
      hide: false,
      options: [],
    })
    setCustomOptionsText('')
    setEditingId(null)
    setShowForm(false)
    setPreviewValues([])
    setPreviewExpanded(false)
  }

  /** 加载变量的查询预览值 */
  const loadPreviewValues = async () => {
    if (!editingId || form.type !== 'query') {
      setPreviewValues([])
      return
    }
    setPreviewLoading(true)
    try {
      const values = await api.getVariableValues(editingId, form.query, form.datasource_id)
      setPreviewValues(values || [])
    } catch {
      setPreviewValues([])
    } finally {
      setPreviewLoading(false)
    }
  }

  // 编辑查询类型变量时自动加载预览值
  useEffect(() => {
    if (showForm && editingId && form.type === 'query') {
      loadPreviewValues()
    } else {
      setPreviewValues([])
      setPreviewExpanded(false)
    }
  }, [showForm, editingId, form.type])

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
      depends_on: variable.depends_on || '',
      auto_refresh: variable.auto_refresh !== false,
      hide: variable.hide || false,
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
    Modal.confirm({
      title: '确认删除',
      content: '确定删除该变量？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.deleteVariable(id)
          setVariables((prev) => prev.filter((v) => v.id !== id))
          message.success('删除成功')
        } catch (e: any) {
          message.error('删除失败: ' + (e.message || '未知错误'))
        }
      },
    })
  }

  const handleSave = async () => {
    if (!form.name?.trim()) {
      message.warning('请输入变量名称')
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
        message.success('更新成功')
      } else {
        const created = await api.createVariable(data)
        setVariables((prev) => [...prev, created])
        message.success('创建成功')
      }
      resetForm()
    } catch (e: any) {
      message.error('保存失败: ' + (e.message || '未知错误'))
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
                <AntSelect
                  style={{ width: '100%' }}
                  value={form.type || 'custom'}
                  onChange={(val) => updateForm('type', val as VariableRes['type'])}
                  options={VARIABLE_TYPES.map((t) => ({
                    label: t.label,
                    value: t.value,
                  }))}
                  getPopupContainer={(trigger) => trigger.parentElement || document.body}
                />
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
                    <AntSelect
                      style={{ width: '100%' }}
                      value={form.datasource_id || undefined}
                      onChange={(val) => updateForm('datasource_id', val || '')}
                      allowClear
                      placeholder="选择数据源"
                      options={datasources.map((ds) => ({
                        label: ds.name,
                        value: ds.id,
                      }))}
                      getPopupContainer={(trigger) => trigger.parentElement || document.body}
                    />
                  </div>
                  <div className="form-group">
                    <label>查询语句</label>
                    <Input.TextArea
                      value={form.query || ''}
                      onChange={(e) => updateForm('query', e.target.value)}
                      placeholder="SELECT DISTINCT server_name FROM servers"
                      rows={4}
                      style={{ fontFamily: 'monospace', fontSize: 12 }}
                    />
                  </div>

                  {/* 预览值区域 */}
                  {editingId && (
                    <div className="form-group">
                      <label>
                        预览值
                        <button
                          className="preview-refresh-btn"
                          onClick={loadPreviewValues}
                          disabled={previewLoading}
                          title="刷新预览"
                          style={{
                            marginLeft: 8,
                            padding: '1px 6px',
                            fontSize: 11,
                            cursor: 'pointer',
                            background: 'transparent',
                            border: '1px solid var(--border-color)',
                            borderRadius: 3,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {previewLoading ? '加载中...' : '刷新'}
                        </button>
                      </label>
                      {previewLoading ? (
                        <div className="preview-loading">正在获取值...</div>
                      ) : previewValues.length > 0 ? (
                        <div className="preview-values-container">
                          <div className="preview-values-list">
                            {(previewExpanded ? previewValues : previewValues.slice(0, PREVIEW_LIMIT)).map((opt, idx) => (
                              <span key={idx} className="preview-value-tag">
                                {opt.text}
                              </span>
                            ))}
                          </div>
                          {previewValues.length > PREVIEW_LIMIT && (
                            <button
                              className="preview-toggle-btn"
                              onClick={() => setPreviewExpanded(!previewExpanded)}
                            >
                              {previewExpanded
                                ? `收起（共 ${previewValues.length} 个值）`
                                : `展示全部 ${previewValues.length} 个值`
                              }
                            </button>
                          )}
                          <div className="preview-values-count">
                            共 {previewValues.length} 个值
                          </div>
                        </div>
                      ) : (
                        <div className="preview-empty">暂无数据，请检查查询语句或点击刷新</div>
                      )}
                    </div>
                  )}
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

              {/* 多选 / 全部 / 依赖 配置 */}
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

                  <div className="form-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.include_all !== false}
                        onChange={(e) => updateForm('include_all', e.target.checked)}
                      />
                      <span>包含"全部"选项（默认开启，选择"全部"时将使用所有查询到的值）</span>
                    </label>
                  </div>

                  {/* 变量依赖配置（仅 query 类型） */}
                  {form.type === 'query' && (
                    <>
                      <div className="form-group">
                        <label>依赖变量</label>
                        <AntSelect
                          style={{ width: '100%' }}
                          value={form.depends_on || undefined}
                          onChange={(val) => updateForm('depends_on', val || '')}
                          allowClear
                          placeholder="无依赖（独立变量）"
                          options={variables
                            .filter((v) => v.id !== editingId)
                            .map((v) => ({
                              label: `${v.label || v.name} (${v.name})`,
                              value: v.name,
                            }))}
                          getPopupContainer={(trigger) => trigger.parentElement || document.body}
                        />
                        <div className="form-hint">
                          选择上游变量后，当上游变量值变化时，此变量的选项将自动刷新并全选
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={form.auto_refresh !== false}
                            onChange={(e) => updateForm('auto_refresh', e.target.checked)}
                          />
                          <span>上游变化时自动刷新并全选</span>
                        </label>
                        <div className="form-hint">
                          取消后，即使上游变量变化也不会自动刷新（用户手动选择的值会被保留）
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.hide || false}
                    onChange={(e) => updateForm('hide', e.target.checked)}
                  />
                  <span>隐藏变量选择器（变量值仍然生效）</span>
                </label>
              </div>
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
