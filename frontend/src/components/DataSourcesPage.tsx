import { useState, useEffect } from 'react'
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Tag,
  Space,
  Typography,
  Spin,
  message,
  InputNumber,
  Tooltip,
} from 'antd'
import {
  DatabaseOutlined,
  ApiOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import * as api from '../api'
import type { DatasourceRes } from '../api'

const { Text } = Typography

export default function DataSourcesPage() {
  const [dataSources, setDataSources] = useState<DatasourceRes[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [testingForm, setTestingForm] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [form] = Form.useForm()

  const loadList = async () => {
    try {
      setLoading(true)
      const list = await api.listDatasources()
      setDataSources(list)
    } catch (e: any) {
      message.error('加载数据源失败: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadList()
  }, [])

  const resetForm = () => {
    form.resetFields()
    setEditId(null)
    setShowModal(false)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      const submitData: any = {
        name: values.name,
        type: values.type,
        url: values.url,
        enabled: values.enabled ?? true,
      }

      if (values.type === 'mysql') {
        submitData.database_name = values.database_name
        submitData.username = values.username
        submitData.password = values.password
      } else if (values.type === 'http') {
        const headers: Record<string, string> = {}
        if (values.headers && Array.isArray(values.headers)) {
          values.headers.forEach((pair: { key: string; value: string }) => {
            if (pair.key.trim() && pair.value.trim()) {
              headers[pair.key.trim()] = pair.value.trim()
            }
          })
        }
        if (Object.keys(headers).length > 0) submitData.headers = headers

        const config: any = {}
        if (values.auth_type && values.auth_type !== 'none') {
          config.auth_type = values.auth_type
          if (values.auth_type === 'bearer' || values.auth_type === 'api_key') {
            if (values.auth_token) config.auth_token = values.auth_token
          } else if (values.auth_type === 'basic') {
            if (values.auth_username) config.auth_username = values.auth_username
            if (values.auth_password) config.auth_password = values.auth_password
          }
        }
        if (values.timeout) config.timeout = values.timeout
        if (Object.keys(config).length > 0) submitData.config = config
      }

      if (editId) {
        await api.updateDatasource(editId, submitData)
        message.success('数据源更新成功')
      } else {
        await api.createDatasource(submitData)
        message.success('数据源创建成功')
      }
      resetForm()
      loadList()
    } catch (e: any) {
      if (e.errorFields) {
        message.error('请填写必填字段')
      } else {
        message.error('保存失败: ' + e.message)
      }
    }
  }

  const handleEdit = (ds: DatasourceRes) => {
    const headers: Array<{ key: string; value: string }> = []
    if (ds.headers && typeof ds.headers === 'object') {
      Object.entries(ds.headers).forEach(([key, value]) => {
        headers.push({ key, value: String(value) })
      })
    }

    form.setFieldsValue({
      name: ds.name,
      type: ds.type,
      url: ds.url,
      database_name: ds.database_name || '',
      username: ds.username || '',
      password: '',
      enabled: ds.enabled,
      auth_type: ds.config?.auth_type || 'none',
      auth_token: ds.config?.auth_token || '',
      auth_username: ds.config?.auth_username || '',
      auth_password: '',
      timeout: ds.config?.timeout || 10,
      headers,
    })
    setEditId(ds.id)
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除此数据源吗？此操作不可撤销。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.deleteDatasource(id)
          message.success('删除成功')
          loadList()
        } catch (e: any) {
          message.error('删除失败: ' + e.message)
        }
      },
    })
  }

  const handleTestForm = async () => {
    setTestingForm(true)
    try {
      const values = await form.validateFields()
      const testData: any = {
        id: editId || undefined,
        name: values.name,
        type: values.type,
        url: values.url,
      }
      if (values.type === 'mysql') {
        testData.database_name = values.database_name
        testData.username = values.username
        testData.password = values.password
      }
      const msg = await api.testDatasource(testData)
      message.success(msg)
    } catch (e: any) {
      message.error('测试失败: ' + e.message)
    } finally {
      setTestingForm(false)
    }
  }

  const filteredDataSources = dataSources.filter(
    (ds) =>
      ds.name.toLowerCase().includes(searchText.toLowerCase()) ||
      ds.url.toLowerCase().includes(searchText.toLowerCase())
  )

  const getDataSourceIcon = (type: string) => {
    return type === 'mysql' ? (
      <DatabaseOutlined style={{ fontSize: 18, color: '#e53935' }} />
    ) : (
      <ApiOutlined style={{ fontSize: 18, color: '#3871dc' }} />
    )
  }

  return (
    <div className="ds-page">
      {/* 页面头部 */}
      <div className="ds-header">
        <h1 className="ds-title">数据源</h1>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            resetForm()
            setShowModal(true)
          }}
        >
          添加数据源
        </Button>
      </div>

      {/* 搜索栏 */}
      <div className="ds-toolbar">
        <Input
          placeholder="搜索数据源..."
          prefix={<SearchOutlined style={{ color: '#86909c' }} />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="ds-search"
          allowClear
        />
      </div>

      {/* 数据源列表 */}
      <Spin spinning={loading}>
        <div className="ds-list">
          {filteredDataSources.length === 0 ? (
            <div className="ds-empty">
              <Text style={{ color: '#86909c' }}>
                {searchText ? '未找到匹配的数据源' : '暂无数据源，点击"添加数据源"开始配置'}
              </Text>
            </div>
          ) : (
            filteredDataSources.map((ds) => (
              <div
                key={ds.id}
                className="ds-row"
                onClick={() => handleEdit(ds)}
              >
                {/* 左侧：图标 + 名称 */}
                <div className="ds-row-left">
                  <div className="ds-row-icon">
                    {getDataSourceIcon(ds.type)}
                  </div>
                  <div className="ds-row-info">
                    <span className="ds-row-name">{ds.name}</span>
                    <Tag
                      color={ds.type === 'mysql' ? '#e53935' : '#3871dc'}
                      style={{ marginLeft: 8, borderRadius: 2 }}
                    >
                      {ds.type === 'mysql' ? 'MySQL' : 'HTTP API'}
                    </Tag>
                  </div>
                </div>

                {/* 中间：URL */}
                <div className="ds-row-center">
                  <Text
                    style={{
                      fontFamily: 'SF Mono, Fira Code, monospace',
                      fontSize: 12,
                      color: '#4e5969',
                    }}
                  >
                    {ds.url}
                  </Text>
                  {ds.type === 'mysql' && ds.database_name && (
                    <Text
                      style={{
                        fontFamily: 'SF Mono, Fira Code, monospace',
                        fontSize: 12,
                        color: '#86909c',
                        marginLeft: 12,
                      }}
                    >
                      / {ds.database_name}
                    </Text>
                  )}
                </div>

                {/* 右侧：状态 + 操作 */}
                <div className="ds-row-right">
                  <Tooltip title={ds.enabled ? '已启用' : '已禁用'}>
                    {ds.enabled ? (
                      <CheckCircleOutlined style={{ color: '#55bd6a', fontSize: 14 }} />
                    ) : (
                      <CloseCircleOutlined style={{ color: '#86909c', fontSize: 14 }} />
                    )}
                  </Tooltip>
                  <Space size={4} className="ds-row-actions">
                    <Tooltip title="编辑">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined style={{ color: '#4e5969' }} />}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEdit(ds)
                        }}
                      />
                    </Tooltip>
                    <Tooltip title="删除">
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(ds.id)
                        }}
                      />
                    </Tooltip>
                  </Space>
                </div>
              </div>
            ))
          )}
        </div>
      </Spin>

      {/* 添加/编辑模态框 */}
      <Modal
        title={editId ? '编辑数据源' : '添加数据源'}
        open={showModal}
        onCancel={resetForm}
        footer={null}
        width={560}
        style={{ top: 20 }}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            type: 'mysql',
            enabled: true,
            auth_type: 'none',
            timeout: 10,
            headers: [],
          }}
        >
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入数据源名称' }]}
          >
            <Input placeholder="数据源名称" autoFocus />
          </Form.Item>

          <Form.Item
            name="type"
            label="类型"
            rules={[{ required: true, message: '请选择数据源类型' }]}
          >
            <Select>
              <Select.Option value="mysql">MySQL</Select.Option>
              <Select.Option value="http">HTTP API</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="url"
            label="URL"
            rules={[{ required: true, message: '请输入URL' }]}
          >
            <Input
              placeholder={form.getFieldValue('type') === 'mysql' ? 'host:port' : 'http://host:port/api'}
            />
          </Form.Item>

          <Form.Item name="enabled" label="启用状态">
            <Select>
              <Select.Option value={true}>启用</Select.Option>
              <Select.Option value={false}>禁用</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.type !== currentValues.type}>
            {({ getFieldValue }) => {
              if (getFieldValue('type') === 'mysql') {
                return (
                  <>
                    <Form.Item
                      name="database_name"
                      label="数据库"
                      rules={[{ required: true, message: '请输入数据库名' }]}
                    >
                      <Input placeholder="数据库名" />
                    </Form.Item>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <Form.Item
                        name="username"
                        label="用户名"
                        rules={[{ required: true, message: '请输入用户名' }]}
                        style={{ flex: 1 }}
                      >
                        <Input placeholder="用户名" />
                      </Form.Item>
                      <Form.Item
                        name="password"
                        label="密码"
                        rules={[{ required: true, message: '请输入密码' }]}
                        style={{ flex: 1 }}
                      >
                        <Input.Password placeholder="密码" />
                      </Form.Item>
                    </div>
                  </>
                )
              }

              return (
                <>
                  <Form.Item name="auth_type" label="认证方式">
                    <Select>
                      <Select.Option value="none">无认证</Select.Option>
                      <Select.Option value="bearer">Bearer Token</Select.Option>
                      <Select.Option value="api_key">API Key</Select.Option>
                      <Select.Option value="basic">Basic Auth</Select.Option>
                    </Select>
                  </Form.Item>

                  <Form.Item
                    noStyle
                    shouldUpdate={(prevValues, currentValues) => prevValues.auth_type !== currentValues.auth_type}
                  >
                    {({ getFieldValue }) => {
                      const authType = getFieldValue('auth_type')
                      if (authType === 'bearer') {
                        return (
                          <Form.Item
                            name="auth_token"
                            label="Bearer Token"
                            rules={[{ required: true, message: '请输入Token' }]}
                          >
                            <Input.Password placeholder="输入Token" />
                          </Form.Item>
                        )
                      }
                      if (authType === 'api_key') {
                        return (
                          <Form.Item
                            name="auth_token"
                            label="API Key"
                            rules={[{ required: true, message: '请输入API Key' }]}
                          >
                            <Input.Password placeholder="输入API Key" />
                          </Form.Item>
                        )
                      }
                      if (authType === 'basic') {
                        return (
                          <div style={{ display: 'flex', gap: 16 }}>
                            <Form.Item
                              name="auth_username"
                              label="用户名"
                              rules={[{ required: true, message: '请输入用户名' }]}
                              style={{ flex: 1 }}
                            >
                              <Input placeholder="用户名" />
                            </Form.Item>
                            <Form.Item
                              name="auth_password"
                              label="密码"
                              rules={[{ required: true, message: '请输入密码' }]}
                              style={{ flex: 1 }}
                            >
                              <Input.Password placeholder="密码" />
                            </Form.Item>
                          </div>
                        )
                      }
                      return null
                    }}
                  </Form.Item>

                  <Form.Item name="timeout" label="超时时间(秒)">
                    <InputNumber min={1} max={60} style={{ width: '100%' }} />
                  </Form.Item>

                  <Form.Item name="headers" label="自定义Headers">
                    <Form.List name="headers">
                      {(fields, { add, remove }) => (
                        <>
                          {fields.map(({ key, name, ...restField }) => (
                            <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                              <Form.Item
                                {...restField}
                                name={[name, 'key']}
                                style={{ flex: 1, marginBottom: 0 }}
                              >
                                <Input placeholder="Header名称" size="small" />
                              </Form.Item>
                              <Form.Item
                                {...restField}
                                name={[name, 'value']}
                                style={{ flex: 1, marginBottom: 0 }}
                              >
                                <Input placeholder="Header值" size="small" />
                              </Form.Item>
                              <Button
                                type="text"
                                danger
                                onClick={() => remove(name)}
                                size="small"
                              >
                                删除
                              </Button>
                            </div>
                          ))}
                          <Button type="dashed" onClick={() => add({ key: '', value: '' })} size="small">
                            + 添加Header
                          </Button>
                        </>
                      )}
                    </Form.List>
                  </Form.Item>

                  <Text type="secondary" style={{ fontSize: 12, color: '#86909c' }}>
                    Base URL为API基础地址，具体查询路径在面板编辑时配置。
                  </Text>
                </>
              )
            }}
          </Form.Item>
        </Form>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            marginTop: 24,
            paddingTop: 16,
            borderTop: '1px solid #e5e6eb',
          }}
        >
          <Button onClick={resetForm}>取消</Button>
          <Button onClick={handleTestForm} loading={testingForm}>
            {testingForm ? '测试中...' : '测试连接'}
          </Button>
          <Button type="primary" onClick={handleSave}>
            {editId ? '保存修改' : '保存'}
          </Button>
        </div>
      </Modal>

      {/* 内联样式 */}
      <style>{`
        .ds-page {
          padding: 24px 32px;
          background: #f7f8fa;
          min-height: 100vh;
        }

        .ds-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .ds-title {
          font-size: 20px;
          font-weight: 600;
          color: #1d2129;
          margin: 0;
        }

        .ds-toolbar {
          margin-bottom: 12px;
        }

        .ds-search {
          width: 280px;
          background: #fff;
          border-radius: 6px;
        }

        .ds-search input {
          background: transparent;
        }

        .ds-list {
          background: #fff;
          border: 1px solid #e5e6eb;
          border-radius: 8px;
          overflow: hidden;
        }

        .ds-empty {
          padding: 48px 24px;
          text-align: center;
          color: #86909c;
        }

        .ds-row {
          display: flex;
          align-items: center;
          padding: 14px 16px;
          border-bottom: 1px solid #f0f0f0;
          cursor: pointer;
          transition: background 0.15s;
        }

        .ds-row:last-child {
          border-bottom: none;
        }

        .ds-row:hover {
          background: #f7f8fa;
        }

        .ds-row-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 200px;
        }

        .ds-row-icon {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          background: rgba(229, 57, 53, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .ds-row-icon.http-icon {
          background: rgba(56, 113, 220, 0.08);
        }

        .ds-row-info {
          display: flex;
          align-items: center;
        }

        .ds-row-name {
          font-size: 14px;
          font-weight: 500;
          color: #1d2129;
        }

        .ds-row-center {
          flex: 1;
          display: flex;
          align-items: center;
          min-width: 0;
          padding: 0 16px;
        }

        .ds-row-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .ds-row-actions {
          opacity: 0;
          transition: opacity 0.15s;
        }

        .ds-row:hover .ds-row-actions {
          opacity: 1;
        }
      `}</style>
    </div>
  )
}