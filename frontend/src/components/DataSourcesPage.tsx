import { useState, useEffect } from 'react'
import * as api from '../api'
import type { DatasourceRes, HTTPDatasourceConfig } from '../api'

export default function DataSourcesPage() {
  const [dataSources, setDataSources] = useState<DatasourceRes[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [testingForm, setTestingForm] = useState(false)
  const [headersPairs, setHeadersPairs] = useState<Array<{key: string, value: string}>>([]) // HTTP Headers key-value列表
  const [form, setForm] = useState({
    name: '',
    type: 'mysql' as 'mysql' | 'http',
    url: '',
    database_name: '',
    username: '',
    password: '',
    enabled: true,
    headers: {} as Record<string, unknown>,
    config: {
      auth_type: 'none' as 'none' | 'basic' | 'bearer' | 'api_key',
      auth_token: '',
      auth_username: '',
      auth_password: '',
      timeout: 10,
    } as HTTPDatasourceConfig,
  })

  const loadList = async () => {
    try {
      const list = await api.listDatasources()
      setDataSources(list)
    } catch (e: any) {
      console.error('加载数据源失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadList() }, [])

  const resetForm = () => {
    setForm({
      name: '',
      type: 'mysql',
      url: '',
      database_name: '',
      username: '',
      password: '',
      enabled: true,
      headers: {},
      config: {
        auth_type: 'none',
        auth_token: '',
        auth_username: '',
        auth_password: '',
        timeout: 10,
      },
    })
    setHeadersPairs([])
    setEditId(null)
    setShowForm(false)
  }

  const handleSave = async () => {
    if (!form.name || !form.url) return
    try {
      // 将headersPairs转换为headers对象
      const headers: Record<string, string> = {}
      if (form.type === 'http') {
        headersPairs.forEach(pair => {
          if (pair.key.trim() && pair.value.trim()) {
            headers[pair.key.trim()] = pair.value.trim()
          }
        })
      }

      // 构建提交数据，根据类型过滤无用字段
      const submitData: any = {
        name: form.name,
        type: form.type,
        url: form.url,
        enabled: form.enabled,
      }

      if (form.type === 'mysql') {
        submitData.database_name = form.database_name
        submitData.username = form.username
        submitData.password = form.password
      } else if (form.type === 'http') {
        if (Object.keys(headers).length > 0) submitData.headers = headers
        // 只保存认证配置
        const config: any = {}
        if (form.config?.auth_type && form.config.auth_type !== 'none') {
          config.auth_type = form.config.auth_type
          if (form.config.auth_type === 'bearer' || form.config.auth_type === 'api_key') {
            if (form.config.auth_token) config.auth_token = form.config.auth_token
          } else if (form.config.auth_type === 'basic') {
            if (form.config.auth_username) config.auth_username = form.config.auth_username
            if (form.config.auth_password) config.auth_password = form.config.auth_password
          }
        }
        if (form.config?.timeout) config.timeout = form.config.timeout
        if (Object.keys(config).length > 0) submitData.config = config
      }

      if (editId) {
        await api.updateDatasource(editId, submitData)
      } else {
        await api.createDatasource(submitData)
      }
      resetForm()
      loadList()
    } catch (e: any) { alert('保存失败: ' + e.message) }
  }

  const handleEdit = (ds: DatasourceRes) => {
    setForm({
      name: ds.name,
      type: ds.type as 'mysql' | 'http',
      url: ds.url,
      database_name: ds.database_name || '',
      username: ds.username || '',
      password: '',
      enabled: ds.enabled,
      headers: ds.headers || {},
      config: ds.config || {
        auth_type: 'none',
        auth_token: '',
        auth_username: '',
        auth_password: '',
        timeout: 10,
      },
    })
    // 将headers对象转换为key-value数组
    const pairs: Array<{key: string, value: string}> = []
    if (ds.headers && typeof ds.headers === 'object') {
      Object.entries(ds.headers).forEach(([key, value]) => {
        pairs.push({ key, value: String(value) })
      })
    }
    setHeadersPairs(pairs)
    setEditId(ds.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此数据源?')) return
    try {
      await api.deleteDatasource(id)
      loadList()
    } catch (e: any) { alert('删除失败: ' + e.message) }
  }

  const handleTestForm = async () => {
    setTestingForm(true)
    try {
      const testData: any = {
        id: editId || undefined,
        name: form.name,
        type: form.type,
        url: form.url,
      }
      if (form.type === 'mysql') {
        testData.database_name = form.database_name
        testData.username = form.username
        testData.password = form.password
      }
      const msg = await api.testDatasource(testData)
      alert(msg)
    } catch (e: any) { alert('测试失败: ' + e.message) }
    finally { setTestingForm(false) }
  }

  if (loading) return <div className="browse-page"><div className="empty-state">加载中...</div></div>

  return (
    <div className="browse-page">
      <div className="page-toolbar">
        <h1 className="browse-title">数据源</h1>
        <button className="btn-primary" onClick={() => { resetForm(); setShowForm(true) }}>
          + 添加数据源
        </button>
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editId ? '编辑数据源' : '添加数据源'}</h2>
              <button className="modal-close" onClick={resetForm}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>名称</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="数据源名称" autoFocus />
              </div>
              <div className="form-group">
                <label>类型</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'mysql' | 'http' })}>
                  <option value="mysql">MySQL</option>
                  <option value="http">HTTP API</option>
                </select>
              </div>
              <div className="form-group">
                <label>URL</label>
                <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder={form.type === 'mysql' ? 'host:port' : 'http://host:port/api'} />
              </div>
              {form.type === 'mysql' && (
                <>
                  <div className="form-group">
                    <label>数据库</label>
                    <input value={form.database_name} onChange={(e) => setForm({ ...form, database_name: e.target.value })} placeholder="数据库名" />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>用户名</label>
                      <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="用户名" />
                    </div>
                    <div className="form-group">
                      <label>密码</label>
                      <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="密码" />
                    </div>
                  </div>
                </>
              )}
              {form.type === 'http' && (
                <>
                  <div className="form-group">
                    <label>认证方式</label>
                    <select value={form.config?.auth_type || 'none'} onChange={(e) => setForm({ ...form, config: { ...form.config!, auth_type: e.target.value as any } })}>
                      <option value="none">无认证</option>
                      <option value="bearer">Bearer Token</option>
                      <option value="api_key">API Key</option>
                      <option value="basic">Basic Auth</option>
                    </select>
                  </div>
                  {form.config?.auth_type === 'bearer' && (
                    <div className="form-group">
                      <label>Bearer Token</label>
                      <input type="password" value={form.config?.auth_token || ''} onChange={(e) => setForm({ ...form, config: { ...form.config!, auth_token: e.target.value } })}
                        placeholder="输入Token" />
                    </div>
                  )}
                  {form.config?.auth_type === 'api_key' && (
                    <div className="form-group">
                      <label>API Key</label>
                      <input type="password" value={form.config?.auth_token || ''} onChange={(e) => setForm({ ...form, config: { ...form.config!, auth_token: e.target.value } })}
                        placeholder="输入API Key" />
                    </div>
                  )}
                  {form.config?.auth_type === 'basic' && (
                    <div className="form-row">
                      <div className="form-group">
                        <label>用户名</label>
                        <input value={form.config?.auth_username || ''} onChange={(e) => setForm({ ...form, config: { ...form.config!, auth_username: e.target.value } })}
                          placeholder="用户名" />
                      </div>
                      <div className="form-group">
                        <label>密码</label>
                        <input type="password" value={form.config?.auth_password || ''} onChange={(e) => setForm({ ...form, config: { ...form.config!, auth_password: e.target.value } })}
                          placeholder="密码" />
                      </div>
                    </div>
                  )}
                  <div className="form-group">
                    <label>超时时间(秒)</label>
                    <input type="number" value={form.config?.timeout || 10} onChange={(e) => setForm({ ...form, config: { ...form.config!, timeout: parseInt(e.target.value) || 10 } })}
                      min={1} max={60} />
                  </div>
                  <div className="form-group">
                    <label>自定义Headers</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {headersPairs.map((pair, index) => (
                        <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            value={pair.key}
                            onChange={(e) => {
                              const newPairs = [...headersPairs]
                              newPairs[index].key = e.target.value
                              setHeadersPairs(newPairs)
                            }}
                            placeholder="Header名称"
                            style={{ flex: 1, fontSize: 12 }}
                          />
                          <input
                            value={pair.value}
                            onChange={(e) => {
                              const newPairs = [...headersPairs]
                              newPairs[index].value = e.target.value
                              setHeadersPairs(newPairs)
                            }}
                            placeholder="Header值"
                            style={{ flex: 1, fontSize: 12 }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newPairs = headersPairs.filter((_, i) => i !== index)
                              setHeadersPairs(newPairs)
                            }}
                            style={{ padding: '4px 8px', fontSize: 12, color: '#666', border: '1px solid #ddd', borderRadius: 3, cursor: 'pointer' }}
                          >
                            删除
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setHeadersPairs([...headersPairs, { key: '', value: '' }])}
                        style={{ padding: '6px 12px', fontSize: 12, color: '#1976d2', border: '1px solid #1976d2', borderRadius: 3, cursor: 'pointer', background: 'white' }}
                      >
                        + 添加Header
                      </button>
                    </div>
                    <div className="pe-hint-text" style={{ marginTop: 4 }}>
                      HTTP请求头，每个请求都会带上这些Headers。可被面板查询配置覆盖。
                    </div>
                  </div>
                  <div className="pe-hint-text" style={{ marginTop: 8, marginLeft: 0 }}>
                    Base URL为API基础地址，具体查询路径在面板编辑时配置。
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={resetForm}>取消</button>
              <button className="btn-secondary" onClick={handleTestForm} disabled={testingForm}>
                {testingForm ? '测试中...' : '测试连接'}
              </button>
              <button className="btn-primary" onClick={handleSave}>{editId ? '保存修改' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="ds-cards">
        {dataSources.map((ds) => (
          <div key={ds.id} className="ds-card">
            <div className="ds-card-header">
              <div className={`ds-card-icon ${ds.type}`}>
                {ds.type === 'mysql' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C7.58 3 4 4.79 4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7c0-2.21-3.58-4-8-4zm0 2.5c3.04 0 5.5 1.12 5.5 2.5s-2.46 2.5-5.5 2.5S6.5 9.38 6.5 8 8.96 5.5 12 5.5zm0 10c-3.04 0-5.5-1.12-5.5-2.5v-2.1c1.36 1.1 3.38 1.6 5.5 1.6s4.14-.5 5.5-1.6v2.1c0 1.38-2.46 2.5-5.5 2.5zm0-4.5c-3.04 0-5.5-1.12-5.5-2.5V8.4c1.36 1.1 3.38 1.6 5.5 1.6s4.14-.5 5.5-1.6v2.1c0 1.38-2.46 2.5-5.5 2.5z" /></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10M12 2a15.3 15.3 0 00-4 10 15.3 15.3 0 004 10" /></svg>
                )}
              </div>
              <div>
                <div className="ds-card-name">{ds.name}</div>
                <div className="ds-card-type">{ds.type === 'mysql' ? 'MySQL' : 'HTTP API'}</div>
              </div>
            </div>
            <div className="ds-card-meta">
              <div className="ds-meta-item">
                <span className="ds-meta-label">URL</span>
                <span className="ds-meta-value">{ds.url}</span>
              </div>
              {ds.type === 'mysql' && ds.database_name && (
                <div className="ds-meta-item">
                  <span className="ds-meta-label">DB</span>
                  <span className="ds-meta-value">{ds.database_name}</span>
                </div>
              )}
              {ds.username && (
                <div className="ds-meta-item">
                  <span className="ds-meta-label">用户</span>
                  <span className="ds-meta-value">{ds.username}</span>
                </div>
              )}
            </div>
            <div className="ds-card-footer">
              <span className={`ds-card-status ${ds.enabled ? 'enabled' : 'disabled'}`}>
                {ds.enabled ? '已启用' : '已禁用'}
              </span>
              <div className="ds-card-actions">
                <button className="btn-sm" onClick={() => handleEdit(ds)}>编辑</button>
                <button className="btn-sm" onClick={() => handleDelete(ds.id)} style={{ color: 'var(--red)', borderColor: 'transparent' }}>删除</button>
              </div>
            </div>
          </div>
        ))}

        {dataSources.length === 0 && (
          <div className="empty-state" style={{ gridColumn: '1/-1' }}>
            暂无数据源，点击"添加数据源"开始配置
          </div>
        )}
      </div>
    </div>
  )
}
