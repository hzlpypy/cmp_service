// API layer: communicates with the Go backend at http://127.0.0.1:3011

const BASE = ''

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const json = await res.json()
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
  enabled: boolean
  created_at: string
  updated_at: string
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
}

export interface TargetDef {
  refId: string
  /** 用户自定义 SQL 语句（如 SELECT date FROM calendar） */
  rawSql?: string
  /** 列名别名映射，如 {"date": "日期", "market": "市场"} */
  aliasMap?: Record<string, string>
  /** [兼容] 自定义表名，rawSql 为空时生效 */
  table?: string
  /** [兼容] 要查询的字段，逗号分隔 */
  fields?: string
  category: string
  metricName: string
}

export interface DashboardDataRes {
  dashboard_id: string
  dashboard_title: string
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
  id: string
  created_at: string
  metric_category: string
  metric_name: string
  node_type: string
  current_value: string
  historical_peak: string
  mom_change: string
  yoy_change: string
  unit: string
}

// ---- Folders API ----

export async function listFolders(): Promise<{ list: FolderRes[]; total: number }> {
  return request('/api/v1/folders/list')
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

export async function getDashboardData(id: string, from?: string, to?: string, dashboardJson?: DashboardJSON): Promise<DashboardDataRes> {
  const body: any = { id }
  if (from) body.from = from
  if (to) body.to = to
  if (dashboardJson) body.dashboard_json = dashboardJson
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
}): Promise<DatasourceRes> {
  return request('/api/v1/datasources/create', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateDatasource(id: string, data: Record<string, unknown>): Promise<DatasourceRes> {
  return request('/api/v1/datasources/update', { method: 'POST', body: JSON.stringify({ id, ...data }) })
}

export async function deleteDatasource(id: string): Promise<void> {
  return request('/api/v1/datasources/delete', { method: 'POST', body: JSON.stringify({ id }) })
}

export async function testDatasource(id: string): Promise<string> {
  return request('/api/v1/datasources/test', { method: 'POST', body: JSON.stringify({ id }) })
}

// ---- Snapshots API ----

export interface SnapshotRes {
  id: string
  dashboard_id: string
  panel_id: string
  snapshot_key: string
  name: string
  dashboard_json: DashboardJSON
  panels_data?: PanelDataRes[]
  created_at: string
  expires_at?: string
}

export interface SnapshotCreateReq {
  dashboard_id: string
  panel_id?: string
  name?: string
  dashboard_json: DashboardJSON
  panels_data?: PanelDataRes[]
}

export async function createSnapshot(req: SnapshotCreateReq): Promise<SnapshotRes> {
  return request('/api/v1/snapshots/create', { method: 'POST', body: JSON.stringify(req) })
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
