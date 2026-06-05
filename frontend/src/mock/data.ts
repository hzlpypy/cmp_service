export interface NetworkMetric {
  id: string
  created_at: string
  metric_category: string
  metric_name: string
  current_value: string
  historical_peak: string
  mom_change: string
  node_type: string
  unit: string
  yoy_change: string
}

export interface PanelConfig {
  id: string
  type: 'bar' | 'line' | 'pie' | 'gauge' | 'table'
  title: string
  gridPos: { x: number; y: number; w: number; h: number }
  datasource: { category: string; metricName: string }
  options: Record<string, unknown>
}

export interface Folder {
  id: string
  title: string
  uid: string
}

export interface Dashboard {
  id: string
  title: string
  folderId: string
  folderTitle: string
  panels: PanelConfig[]
}

export interface DataSource {
  id: string
  name: string
  type: 'mysql' | 'http'
  url: string
  database?: string
  user?: string
  password?: string
  headers?: Record<string, string>
  enabled: boolean
  createdAt: string
}

export const mockFolders: Folder[] = [
  { id: 'folder-1', title: '网络监控', uid: 'net-monitor' },
  { id: 'folder-2', title: '业务系统', uid: 'biz-system' },
  { id: 'folder-3', title: '基础设施', uid: 'infra' },
]

export const mockDashboards: Dashboard[] = [
  { id: 'db-1', title: '网络链路带宽监控', folderId: 'folder-1', folderTitle: '网络监控', panels: [] },
  { id: 'db-2', title: '机房流量态势', folderId: 'folder-1', folderTitle: '网络监控', panels: [] },
  { id: 'db-3', title: '统一日志平台运维报表', folderId: 'folder-2', folderTitle: '业务系统', panels: [] },
  { id: 'db-4', title: '交易系统监控大盘', folderId: 'folder-2', folderTitle: '业务系统', panels: [] },
  { id: 'db-5', title: '服务器资源监控', folderId: 'folder-3', folderTitle: '基础设施', panels: [] },
  { id: 'db-6', title: '数据库性能监控', folderId: 'folder-3', folderTitle: '基础设施', panels: [] },
]

export const mockDataSources: DataSource[] = [
  {
    id: 'ds-1',
    name: 'cmp_service MySQL',
    type: 'mysql',
    url: '127.0.0.1:3306',
    database: 'cmp_service',
    user: 'root',
    password: '********',
    enabled: true,
    createdAt: '2026-05-10 10:30:00',
  },
  {
    id: 'ds-2',
    name: '网络指标API',
    type: 'http',
    url: 'http://127.0.0.1:3011/api/v1/ops_dbapi/api',
    headers: { 'Content-Type': 'application/json' },
    enabled: true,
    createdAt: '2026-05-12 14:20:00',
  },
]

export const mockMetrics: NetworkMetric[] = [
  { id: '1', created_at: '2026-05-13T00:00:00+08:00', metric_category: '资源使用率', metric_name: '威新机房-带宽使用率（电信）', current_value: '62.5', historical_peak: '78.3', mom_change: '3.2', node_type: '交易互联网线路', unit: '%', yoy_change: '-1.1' },
  { id: '2', created_at: '2026-05-13T00:00:00+08:00', metric_category: '资源使用率', metric_name: '威新机房-带宽使用率（联通）', current_value: '55.8', historical_peak: '72.1', mom_change: '-2.1', node_type: '交易互联网线路', unit: '%', yoy_change: '0.5' },
  { id: '3', created_at: '2026-05-13T00:00:00+08:00', metric_category: '资源使用率', metric_name: '威新机房-带宽使用率（移动）', current_value: '48.3', historical_peak: '65.7', mom_change: '1.5', node_type: '交易互联网线路', unit: '%', yoy_change: '-0.8' },
  { id: '4', created_at: '2026-05-13T00:00:00+08:00', metric_category: '资源使用率', metric_name: '南方机房-带宽使用率（电信）', current_value: '71.2', historical_peak: '85.4', mom_change: '4.1', node_type: '交易互联网线路', unit: '%', yoy_change: '2.3' },
  { id: '5', created_at: '2026-05-13T00:00:00+08:00', metric_category: '资源使用率', metric_name: '南方机房-带宽使用率（联通）', current_value: '63.7', historical_peak: '79.8', mom_change: '-0.5', node_type: '交易互联网线路', unit: '%', yoy_change: '1.1' },
  { id: '6', created_at: '2026-05-13T00:00:00+08:00', metric_category: '资源使用率', metric_name: '南方机房-带宽使用率（移动）', current_value: '52.4', historical_peak: '68.9', mom_change: '2.8', node_type: '交易互联网线路', unit: '%', yoy_change: '-1.5' },
  { id: '7', created_at: '2026-05-14T00:00:00+08:00', metric_category: '资源使用率', metric_name: '威新机房-带宽使用率（电信）', current_value: '64.1', historical_peak: '78.3', mom_change: '2.6', node_type: '交易互联网线路', unit: '%', yoy_change: '0.3' },
  { id: '8', created_at: '2026-05-14T00:00:00+08:00', metric_category: '资源使用率', metric_name: '威新机房-带宽使用率（联通）', current_value: '53.2', historical_peak: '72.1', mom_change: '-4.7', node_type: '交易互联网线路', unit: '%', yoy_change: '-1.2' },
  { id: '9', created_at: '2026-05-14T00:00:00+08:00', metric_category: '资源使用率', metric_name: '威新机房-带宽使用率（移动）', current_value: '50.1', historical_peak: '65.7', mom_change: '3.7', node_type: '交易互联网线路', unit: '%', yoy_change: '1.8' },
  { id: '10', created_at: '2026-05-14T00:00:00+08:00', metric_category: '资源使用率', metric_name: '南方机房-带宽使用率（电信）', current_value: '69.8', historical_peak: '85.4', mom_change: '-2.0', node_type: '交易互联网线路', unit: '%', yoy_change: '-0.6' },
  { id: '11', created_at: '2026-05-14T00:00:00+08:00', metric_category: '资源使用率', metric_name: '南方机房-带宽使用率（联通）', current_value: '65.3', historical_peak: '79.8', mom_change: '2.5', node_type: '交易互联网线路', unit: '%', yoy_change: '2.8' },
  { id: '12', created_at: '2026-05-14T00:00:00+08:00', metric_category: '资源使用率', metric_name: '南方机房-带宽使用率（移动）', current_value: '54.8', historical_peak: '68.9', mom_change: '4.6', node_type: '交易互联网线路', unit: '%', yoy_change: '3.2' },
  { id: '13', created_at: '2026-05-15T00:00:00+08:00', metric_category: '资源使用率', metric_name: '威新机房-带宽使用率（电信）', current_value: '59.3', historical_peak: '78.3', mom_change: '-7.5', node_type: '交易互联网线路', unit: '%', yoy_change: '-2.1' },
  { id: '14', created_at: '2026-05-15T00:00:00+08:00', metric_category: '资源使用率', metric_name: '威新机房-带宽使用率（联通）', current_value: '57.6', historical_peak: '72.1', mom_change: '8.3', node_type: '交易互联网线路', unit: '%', yoy_change: '1.5' },
  { id: '15', created_at: '2026-05-15T00:00:00+08:00', metric_category: '资源使用率', metric_name: '威新机房-带宽使用率（移动）', current_value: '46.9', historical_peak: '65.7', mom_change: '-6.4', node_type: '交易互联网线路', unit: '%', yoy_change: '-3.2' },
  { id: '16', created_at: '2026-05-15T00:00:00+08:00', metric_category: '资源使用率', metric_name: '南方机房-带宽使用率（电信）', current_value: '73.5', historical_peak: '85.4', mom_change: '5.3', node_type: '交易互联网线路', unit: '%', yoy_change: '4.1' },
  { id: '17', created_at: '2026-05-15T00:00:00+08:00', metric_category: '资源使用率', metric_name: '南方机房-带宽使用率（联通）', current_value: '61.9', historical_peak: '79.8', mom_change: '-5.2', node_type: '交易互联网线路', unit: '%', yoy_change: '-0.9' },
  { id: '18', created_at: '2026-05-15T00:00:00+08:00', metric_category: '资源使用率', metric_name: '南方机房-带宽使用率（移动）', current_value: '51.2', historical_peak: '68.9', mom_change: '-6.6', node_type: '交易互联网线路', unit: '%', yoy_change: '-1.7' },
]

export const mockPanels: PanelConfig[] = [
  { id: 'panel-1', type: 'bar', title: '各机房带宽使用率对比', gridPos: { x: 0, y: 0, w: 12, h: 8 }, datasource: { category: '资源使用率', metricName: '带宽使用率' }, options: {} },
  { id: 'panel-2', type: 'line', title: '威新机房-电信带宽趋势', gridPos: { x: 12, y: 0, w: 12, h: 8 }, datasource: { category: '资源使用率', metricName: '威新机房-带宽使用率（电信）' }, options: {} },
  { id: 'panel-3', type: 'pie', title: '各机房带宽使用率分布', gridPos: { x: 0, y: 8, w: 8, h: 7 }, datasource: { category: '资源使用率', metricName: '带宽使用率' }, options: {} },
  { id: 'panel-4', type: 'gauge', title: '威新机房-电信总体使用率', gridPos: { x: 8, y: 8, w: 4, h: 7 }, datasource: { category: '资源使用率', metricName: '威新机房-带宽使用率（电信）' }, options: {} },
  { id: 'panel-5', type: 'table', title: '网络链路指标明细', gridPos: { x: 12, y: 8, w: 12, h: 7 }, datasource: { category: '资源使用率', metricName: '' }, options: {} },
]