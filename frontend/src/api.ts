// API layer: communicates with the Go backend at http://127.0.0.1:3011

const BASE = ''

// getSystemVars 根据时间范围计算出系统变量值（Grafana 兼容格式）。
// __from / __to 为原始 ISO 字符串，后端 ReplaceVariables 自动加引号。
// __fromUnix / __toUnix / __fromMs / __toMs 不加引号（数字）。
export function getSystemVars(from?: string, to?: string): Record<string, string> {
  const vars: Record<string, string> = {}
  if (from) {
    vars['__from'] = from
    const fromMs = new Date(from).getTime()
    if (!isNaN(fromMs)) {
      vars['__fromUnix'] = String(Math.floor(fromMs / 1000))
      vars['__fromMs'] = String(fromMs)
    }
  }
  if (to) {
    vars['__to'] = to
    const toMs = new Date(to).getTime()
    if (!isNaN(toMs)) {
      vars['__toUnix'] = String(Math.floor(toMs / 1000))
      vars['__toMs'] = String(toMs)
    }
  }
  return vars
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  // 检查响应是否为空
  const text = await res.text()
  if (!text) {
    throw new Error(`服务器返回空响应 (HTTP ${res.status})`)
  }
  let json: any
  try {
    json = JSON.parse(text)
  } catch (e) {
    throw new Error(`服务器返回非 JSON 响应: ${text.slice(0, 200)}`)
  }
  if (!json.success && json.errorCode !== '00000') {
    throw new Error(json.errorMessage || 'Unknown error')
  }
  return json.data
}

// ---- Types ----

export interface FolderRes {
  id: string
  uid: string
  title: string
  dashboards: DashboardBriefRes[]
  created_at: string
  updated_at: string
}

export interface DashboardBriefRes {
  id: string
  title: string
  folder_id: string
  created_at: string
  updated_at: string
}

export interface DashboardRes {
  id: string
  title: string
  folder_id: string
  folder_name: string
  dashboard_json: DashboardJSON
  panels: PanelBriefRes[]
  created_at: string
  updated_at: string
}

export interface PanelBriefRes {
  id: string
  title: string
  type: string
  grid_pos_x: number
  grid_pos_y: number
  grid_pos_w: number
  grid_pos_h: number
  datasource: Record<string, unknown>
  options: Record<string, unknown>
  sort_order: number
}

export interface DatasourceRes {
  id: string
  name: string
  type: string
  url: string
  database_name: string
  username: string
  headers: Record<string, unknown>
  config: HTTPDatasourceConfig
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface HTTPDatasourceConfig {
  // 数据源层仅配置认证信息
  auth_type?: 'none' | 'basic' | 'bearer' | 'api_key'
  auth_token?: string
  auth_username?: string
  auth_password?: string
  timeout?: number
}

// DashboardJSON is the complete dashboard definition (Grafana-style)
export interface DashboardJSON {
  title: string
  panels: PanelDef[]
}

export interface PanelDef {
  id: string
  title: string
  type: 'bar' | 'line' | 'pie' | 'gauge' | 'table'
  gridPos: { x: number; y: number; w: number; h: number }
  datasource_id?: string
  targets: TargetDef[]
  options: Record<string, unknown>
  /** Data Links 配置（仿照 Grafana） */
  dataLinks?: DataLinkDef[]
}

/** Data Link 定义（针对特定字段） */
export interface DataLinkDef {
  /** 针对哪个字段（列名） */
  field: string
  /** 链接标题（可选，默认使用字段值） */
  title: string
  /** 链接 URL，支持变量替换 */
  url: string
  /** 链接打开方式：_blank（新标签页）或 _self（当前页） */
  target?: '_blank' | '_self'
}

export interface TargetDef {
  refId: string
  /** 用户自定义 SQL 语句（如 SELECT date FROM calendar） - MySQL数据源 */
  rawSql?: string
  /** 列名别名映射，如 {"date": "日期", "market": "市场"} */
  aliasMap?: Record<string, string>
  /** [兼容] 自定义表名，rawSql 为空时生效 */
  table?: string
  /** [兼容] 要查询的字段，逗号分隔 */
  fields?: string
  category: string
  metricName: string
  /** HTTP API路径 - HTTP数据源使用，会与数据源Base URL拼接 */
  http_path?: string
  /** HTTP请求方法 - HTTP数据源使用 */
  http_method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  /** HTTP请求体类型 - HTTP数据源使用：raw, form-data, x-www-form-urlencoded, graphql */
  http_body_type?: 'raw' | 'form-data' | 'x-www-form-urlencoded' | 'graphql'
  /** HTTP请求体 - HTTP数据源使用，raw/graphql类型使用 */
  http_body?: string
  /** HTTP表单数据 - HTTP数据源使用，form-data/x-www-form-urlencoded类型使用 */
  http_form_data?: Array<{ key: string; value: string }>
  /** HTTP自定义Headers - HTTP数据源使用，JSON对象 */
  http_headers?: Record<string, unknown>
  /** HTTP数据格式 - HTTP数据源使用 */
  http_data_format?: 'json' | 'xml' | 'csv'
  /** HTTP数据提取路径 - HTTP数据源使用，JSONPath表达式 */
  http_data_path?: string
}

export interface DashboardDataRes {
  dashboard_id: string
  dashboard_title?: string
  dashboard_json: DashboardJSON
  panels_data: PanelDataRes[]
}

export interface PanelDataRes {
  panel_id: string
  panel_title: string
  panel_type: string
  datasource_id: string
  columns?: string[]
  target: MetricRow[][]
}

export interface MetricRow {
  id?: string
  created_at?: string
  metric_category?: string
  metric_name?: string
  node_type?: string
  current_value?: string
  historical_peak?: string
  mom_change?: string
  yoy_change?: string
  unit?: string
  [key: string]: any  // 索引签名，支持动态列访问
}

// ---- Folders API ----

export async function listFolders(title?: string): Promise<{ list: FolderRes[]; total: number }> {
  const url = title ? `/api/v1/folders/list?title=${encodeURIComponent(title)}` : '/api/v1/folders/list'
  return request(url)
}

export async function getFolder(id: string): Promise<FolderRes> {
  return request('/api/v1/folders/get', { method: 'POST', body: JSON.stringify({ id }) })
}

export async function createFolder(title: string, uid?: string): Promise<FolderRes> {
  return request('/api/v1/folders/create', { method: 'POST', body: JSON.stringify({ uid: uid || title, title }) })
}

export async function updateFolder(id: string, title: string, uid?: string): Promise<FolderRes> {
  return request('/api/v1/folders/update', { method: 'POST', body: JSON.stringify({ id, title, uid: uid || title }) })
}

export async function deleteFolder(id: string): Promise<void> {
  return request('/api/v1/folders/delete', { method: 'POST', body: JSON.stringify({ id }) })
}

// ---- Dashboards API ----

export async function listDashboards(folderId?: string): Promise<DashboardRes[]> {
  return request('/api/v1/dashboards/list', {
    method: 'POST',
    body: JSON.stringify(folderId ? { folder_id: folderId } : {}),
  })
}

export async function getDashboard(id: string): Promise<DashboardRes> {
  return request('/api/v1/dashboards/get', { method: 'POST', body: JSON.stringify({ id }) })
}

export async function createDashboard(title: string, folderId: string, dashboardJson?: DashboardJSON): Promise<DashboardRes> {
  return request('/api/v1/dashboards/create', {
    method: 'POST',
    body: JSON.stringify({ title, folder_id: folderId, dashboard_json: dashboardJson || {} }),
  })
}

export async function updateDashboard(id: string, title: string, folderId: string, dashboardJson?: DashboardJSON): Promise<DashboardRes> {
  return request('/api/v1/dashboards/update', {
    method: 'POST',
    body: JSON.stringify({ id, title, folder_id: folderId, dashboard_json: dashboardJson }),
  })
}

export async function deleteDashboard(id: string): Promise<void> {
  return request('/api/v1/dashboards/delete', { method: 'POST', body: JSON.stringify({ id }) })
}

export async function getDashboardData(id: string, from?: string, to?: string, dashboardJson?: DashboardJSON, variables?: Record<string, string | string[]>): Promise<DashboardDataRes> {
  const body: any = { id }
  if (from) body.from = from
  if (to) body.to = to
  if (dashboardJson) body.dashboard_json = dashboardJson
  if (variables && Object.keys(variables).length > 0) body.variables = variables
  return request('/api/v1/dashboards/data', { method: 'POST', body: JSON.stringify(body) })
}

// ---- Datasources API ----

export async function listDatasources(): Promise<DatasourceRes[]> {
  return request('/api/v1/datasources/list')
}

export async function getDatasource(id: string): Promise<DatasourceRes> {
  return request('/api/v1/datasources/get', { method: 'POST', body: JSON.stringify({ id }) })
}

export async function createDatasource(data: {
  name: string
  type: string
  url: string
  database_name?: string
  username?: string
  password?: string
  headers?: Record<string, unknown>
  config?: HTTPDatasourceConfig
}): Promise<DatasourceRes> {
  return request('/api/v1/datasources/create', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateDatasource(id: string, data: Record<string, unknown>): Promise<DatasourceRes> {
  return request('/api/v1/datasources/update', { method: 'POST', body: JSON.stringify({ id, ...data }) })
}

export async function deleteDatasource(id: string): Promise<void> {
  return request('/api/v1/datasources/delete', { method: 'POST', body: JSON.stringify({ id }) })
}

export async function testDatasource(data: { id?: string; name?: string; type?: string; url?: string; database_name?: string; username?: string; password?: string }): Promise<string> {
  return request('/api/v1/datasources/test', { method: 'POST', body: JSON.stringify(data) })
}

// ---- Snapshots API ----

export interface SnapshotRes {
  id: string
  dashboard_id: string
  dashboard_title?: string  // 仪表板标题
  panel_id: string
  snapshot_key: string
  name: string
  dashboard_json: DashboardJSON
  panels_data?: PanelDataRes[]
  ai_insights?: { score?: number; conclusion?: string; risks?: string[]; evaluation?: string; plan?: string }
  created_at: string
  expires_at?: string
}

export interface SnapshotCreateReq {
  dashboard_id: string
  panel_id?: string
  name?: string
  dashboard_json: DashboardJSON
  panels_data?: PanelDataRes[]
  ai_insights?: { score?: number; conclusion?: string; risks?: string[]; evaluation?: string; plan?: string }
}

export interface SnapshotUpdateReq {
  snapshot_key: string
  name?: string
  ai_insights?: { score?: number; conclusion?: string; risks?: string[]; evaluation?: string; plan?: string }
}

export async function createSnapshot(req: SnapshotCreateReq): Promise<SnapshotRes> {
  return request('/api/v1/snapshots/create', { method: 'POST', body: JSON.stringify(req) })
}

export async function updateSnapshot(req: SnapshotUpdateReq): Promise<SnapshotRes> {
  return request('/api/v1/snapshots/update', { method: 'POST', body: JSON.stringify(req) })
}

export async function getSnapshot(key: string): Promise<SnapshotRes> {
  const res = await fetch(`/api/v1/snapshots/${key}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.errorMessage || 'Unknown error')
  return json.data
}

export async function listSnapshots(dashboardId: string, panelId?: string): Promise<SnapshotRes[]> {
  return request('/api/v1/snapshots/list', { method: 'POST', body: JSON.stringify({ dashboard_id: dashboardId, panel_id: panelId || '' }) })
}

export async function deleteSnapshot(key: string): Promise<void> {
  return request('/api/v1/snapshots/delete', { method: 'POST', body: JSON.stringify({ snapshot_key: key }) })
}

// ---- Snapshot Schedules API ----

export interface SnapshotScheduleRes {
  id: string
  dashboard_id: string
  name: string
  cron_expr: string
  enabled: boolean
  last_run_at?: string
  next_run_at?: string
  created_at: string
}

export async function createSnapshotSchedule(req: { dashboard_id: string; name: string; cron_expr: string }): Promise<SnapshotScheduleRes> {
  return request('/api/v1/snapshot-schedules/create', { method: 'POST', body: JSON.stringify(req) })
}

export async function listSnapshotSchedules(dashboardId: string): Promise<SnapshotScheduleRes[]> {
  return request('/api/v1/snapshot-schedules/list', { method: 'POST', body: JSON.stringify({ dashboard_id: dashboardId }) })
}

export async function updateSnapshotSchedule(req: { id: string; name?: string; cron_expr?: string }): Promise<SnapshotScheduleRes> {
  return request('/api/v1/snapshot-schedules/update', { method: 'POST', body: JSON.stringify(req) })
}

export async function deleteSnapshotSchedule(id: string): Promise<void> {
  return request('/api/v1/snapshot-schedules/delete', { method: 'POST', body: JSON.stringify({ id }) })
}

export async function toggleSnapshotSchedule(id: string, enabled: boolean): Promise<SnapshotScheduleRes> {
  return request('/api/v1/snapshot-schedules/toggle', { method: 'POST', body: JSON.stringify({ id, enabled }) })
}

// ---- Variables API ----

export interface VariableOption {
  text: string
  value: string
  selected?: boolean
}

export interface VariableRes {
  id: string
  dashboard_id: string
  name: string
  type: 'custom' | 'query' | 'textbox' | 'constant' | 'datasource' | 'interval'
  label: string
  description: string
  options: VariableOption[]
  query: string
  datasource_id: string
  default: string
  current: { text: string; value: string } | { text: string; value: string[] }
  multi: boolean
  include_all: boolean
  all_value: string
  depends_on: string
  auto_refresh: boolean
  sort_order: number
  hide: boolean
  created_at: string
  updated_at: string
}

export async function listVariables(dashboardId: string): Promise<VariableRes[]> {
  return request('/api/v1/variables/list', { method: 'POST', body: JSON.stringify({ dashboard_id: dashboardId }) })
}

export async function getVariable(id: string): Promise<VariableRes> {
  return request('/api/v1/variables/get', { method: 'POST', body: JSON.stringify({ id }) })
}

export async function createVariable(data: Partial<VariableRes>): Promise<VariableRes> {
  return request('/api/v1/variables/create', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateVariable(id: string, data: Partial<VariableRes>): Promise<VariableRes> {
  return request('/api/v1/variables/update', { method: 'POST', body: JSON.stringify({ id, ...data }) })
}

export async function deleteVariable(id: string): Promise<void> {
  return request('/api/v1/variables/delete', { method: 'POST', body: JSON.stringify({ id }) })
}

export async function getVariableValues(id: string, query?: string, datasource_id?: string, variables?: Record<string, string | string[]>): Promise<VariableOption[]> {
  const body: any = { id }
  if (query) body.query = query
  if (datasource_id) body.datasource_id = datasource_id
  if (variables && Object.keys(variables).length > 0) body.variables = variables
  const res = await request<{ values: VariableOption[] }>('/api/v1/variables/values', { method: 'POST', body: JSON.stringify(body) })
  return res.values
}

// ---- Panels API ----

export async function getPanelData(dashboard_id: string, panel_id: string, from?: string, to?: string, variables?: Record<string, string | string[]>): Promise<PanelDataRes> {
  const body: any = { dashboard_id, panel_id }
  if (from) body.from = from
  if (to) body.to = to
  if (variables && Object.keys(variables).length > 0) body.variables = variables
  return request('/api/v1/panels/data', { method: 'POST', body: JSON.stringify(body) })
}

// QueryInspector 查询检查器
export interface QueryInspectReq {
  raw_sql: string
  dashboard_id: string
  datasource_id?: string
  variables?: Record<string, string | string[]>
  from?: string
  to?: string
  /** HTTP API路径 - HTTP数据源使用 */
  http_path?: string
  /** HTTP请求方法 - HTTP数据源使用 */
  http_method?: string
  /** HTTP请求体类型 - HTTP数据源使用 */
  http_body_type?: 'raw' | 'form-data' | 'x-www-form-urlencoded' | 'graphql'
  /** HTTP请求体 - HTTP数据源使用 */
  http_body?: string
  /** HTTP表单数据 - HTTP数据源使用 */
  http_form_data?: Array<{ key: string; value: string }>
  /** HTTP自定义Headers - HTTP数据源使用 */
  http_headers?: Record<string, unknown>
  /** HTTP数据格式 - HTTP数据源使用 */
  http_data_format?: string
  /** HTTP数据提取路径 - HTTP数据源使用 */
  http_data_path?: string
}

export interface HTTPRequestInfo {
  method: string
  url: string
  headers: Record<string, string>
  body_type: string
  body?: string
  form_data?: Array<{ key: string; value: string }>
  curl_command: string
}

export interface QueryInspectRes {
  processed_sql: string
  columns: string[]
  rows: Record<string, unknown>[]
  row_count: number
  error?: string
  request_info?: HTTPRequestInfo
}

export async function queryInspect(data: QueryInspectReq): Promise<QueryInspectRes> {
  return request('/api/v1/panels/inspect', { method: 'POST', body: JSON.stringify(data) })
}

// ---- Files API ----

export interface UploadFileRes {
  file_path: string
  file_name: string
}

export async function uploadFile(file: File): Promise<UploadFileRes> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/v1/file/upload', {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(errText || '上传失败')
  }
  const data = await res.json()
  if (!data.success) {
    throw new Error(data.errorMessage || '上传失败')
  }
  return data.data as UploadFileRes
}

// ---- Versions API ----

export interface VersionBriefRes {
  id: string
  version: number
  title: string
  message: string
  created_by: string
  created_at: string
  /** 是否为当前生效版本 */
  is_current?: boolean
}

export interface VersionRes {
  id: string
  dashboard_id: string
  version: number
  title: string
  dashboard_json: DashboardJSON
  message: string
  created_by: string
  created_at: string
}

export interface VersionDiffRes {
  dashboard_id: string
  version_from: number
  version_to: number
  title_from: string
  title_to: string
  created_at_from: string
  created_at_to: string
  diff_json: {
    title_changed?: { from: string; to: string }
    panels?: {
      from_count: number
      to_count: number
      added: Array<{ id: string; title: string }>
      removed: Array<{ id: string; title: string }>
      modified: Array<{ id: string; title: string }>
      added_count: number
      removed_count: number
      modified_count: number
    }
  }
  json_from: Record<string, unknown>
  json_to: Record<string, unknown>
}

export async function listVersions(dashboardId: string): Promise<VersionBriefRes[]> {
  return request('/api/v1/dashboards/versions/list', { method: 'POST', body: JSON.stringify({ dashboard_id: dashboardId }) })
}

export async function getVersion(dashboardId: string, version?: number): Promise<VersionRes> {
  const body: any = { dashboard_id: dashboardId }
  if (version) body.version = version
  return request('/api/v1/dashboards/versions/get', { method: 'POST', body: JSON.stringify(body) })
}

export async function restoreVersion(dashboardId: string, version: number, message?: string): Promise<DashboardRes> {
  const body: any = { dashboard_id: dashboardId, version }
  if (message) body.message = message
  return request('/api/v1/dashboards/versions/restore', { method: 'POST', body: JSON.stringify(body) })
}

export async function compareVersions(dashboardId: string, versionFrom: number, versionTo: number): Promise<VersionDiffRes> {
  return request('/api/v1/dashboards/versions/compare', {
    method: 'POST',
    body: JSON.stringify({ dashboard_id: dashboardId, version_from: versionFrom, version_to: versionTo }),
  })
}

export async function deleteVersion(dashboardId: string, version: number): Promise<void> {
  return request('/api/v1/dashboards/versions/delete', { method: 'POST', body: JSON.stringify({ dashboard_id: dashboardId, version }) })
}
