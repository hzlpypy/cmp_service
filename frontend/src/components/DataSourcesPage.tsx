import { useState, useEffect } from 'react'
import * as api from '../api'
import type { DatasourceRes } from '../api'

export default function DataSourcesPage() {
  const [dataSources, setDataSources] = useState<DatasourceRes[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    type: 'mysql' as 'mysql' | 'http',
    url: '',
    database_name: '',
    username: '',
    password: '',
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
    setForm({ name: '', type: 'mysql', url: '', database_name: '', username: '', password: '' })
    setEditId(null)
    setShowForm(false)
  }

  const handleSave = async () => {
    if (!form.name || !form.url) return
    try {
      if (editId) {
        await api.updateDatasource(editId, {
          name: form.name, type: form.type, url: form.url,
          database_name: form.database_name, username: form.username, password: form.password,
        })
      } else {
        await api.createDatasource({
          name: form.name, type: form.type, url: form.url,
          database_name: form.database_name, username: form.username, password: form.password,
        })
      }
      resetForm()
      loadList()
    } catch (e: any) { alert('保存失败: ' + e.message) }
  }

  const handleEdit = (ds: DatasourceRes) => {
    setForm({ name: ds.name, type: ds.type as 'mysql' | 'http', url: ds.url, database_name: ds.database_name || '', username: ds.username || '', password: '' })
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

  const handleTest = async (id: string) => {
    setTestingId(id)
    try {
      const msg = await api.testDatasource(id)
      alert(msg)
    } catch (e: any) { alert('测试失败: ' + e.message) }
    finally { setTestingId(null) }
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
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={resetForm}>取消</button>
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
                <button className="btn-sm" onClick={() => handleTest(ds.id)} disabled={testingId === ds.id}>
                  {testingId === ds.id ? '测试中...' : '测试连接'}
                </button>
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
