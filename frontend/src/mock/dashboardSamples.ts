// Sample dashboard JSONs using network_metrics table as data source
// Each dashboard demonstrates a different chart type

import type { DashboardJSON } from '../api'

/** 样例1: 柱状图仪表板 - 各机房带宽使用率对比 */
export const sampleBarDashboard: DashboardJSON = {
  title: '各机房带宽使用率对比',
  panels: [
    {
      id: 'panel-bar-1',
      title: '各机房带宽使用率对比',
      type: 'bar',
      gridPos: { x: 0, y: 0, w: 24, h: 10 },
      targets: [
        {
          refId: 'A',
          category: '资源使用率',
          metricName: '带宽使用率',
        },
      ],
      options: {},
    },
  ],
}

/** 样例2: 折线图仪表板 - 威新机房电信带宽趋势 */
export const sampleLineDashboard: DashboardJSON = {
  title: '威新机房电信带宽趋势',
  panels: [
    {
      id: 'panel-line-1',
      title: '威新机房-电信带宽使用率趋势',
      type: 'line',
      gridPos: { x: 0, y: 0, w: 24, h: 10 },
      targets: [
        {
          refId: 'A',
          category: '资源使用率',
          metricName: '威新机房-带宽使用率（电信）',
        },
        {
          refId: 'B',
          category: '资源使用率',
          metricName: '南方机房-带宽使用率（电信）',
        },
      ],
      options: {},
    },
  ],
}

/** 样例3: 饼图仪表板 - 各机房带宽分布 */
export const samplePieDashboard: DashboardJSON = {
  title: '各机房带宽使用率分布',
  panels: [
    {
      id: 'panel-pie-1',
      title: '各机房带宽使用率分布',
      type: 'pie',
      gridPos: { x: 0, y: 0, w: 12, h: 9 },
      targets: [
        {
          refId: 'A',
          category: '资源使用率',
          metricName: '带宽使用率',
        },
      ],
      options: {},
    },
  ],
}

/** 样例4: 仪表盘 - 单机房使用率 */
export const sampleGaugeDashboard: DashboardJSON = {
  title: '威新机房电信线路使用率',
  panels: [
    {
      id: 'panel-gauge-1',
      title: '威新机房-电信线路使用率',
      type: 'gauge',
      gridPos: { x: 0, y: 0, w: 8, h: 8 },
      targets: [
        {
          refId: 'A',
          category: '资源使用率',
          metricName: '威新机房-带宽使用率（电信）',
        },
      ],
      options: {},
    },
  ],
}

/** 样例5: 表格仪表板 - 网络链路指标明细 */
export const sampleTableDashboard: DashboardJSON = {
  title: '网络链路指标明细',
  panels: [
    {
      id: 'panel-table-1',
      title: '网络链路指标明细',
      type: 'table',
      gridPos: { x: 0, y: 0, w: 24, h: 10 },
      targets: [
        {
          refId: 'A',
          category: '资源使用率',
          metricName: '带宽使用率',
        },
      ],
      options: {},
    },
  ],
}

/** 样例6: 综合仪表板 - 多种图表混合 */
export const sampleMixedDashboard: DashboardJSON = {
  title: '网络监控综合大盘',
  panels: [
    {
      id: 'panel-mixed-bar',
      title: '各机房带宽使用率对比',
      type: 'bar',
      gridPos: { x: 0, y: 0, w: 12, h: 8 },
      targets: [
        { refId: 'A', category: '资源使用率', metricName: '带宽使用率' },
      ],
      options: {},
    },
    {
      id: 'panel-mixed-line',
      title: '威新机房-电信带宽趋势',
      type: 'line',
      gridPos: { x: 12, y: 0, w: 12, h: 8 },
      targets: [
        { refId: 'A', category: '资源使用率', metricName: '威新机房-带宽使用率（电信）' },
      ],
      options: {},
    },
    {
      id: 'panel-mixed-pie',
      title: '各机房带宽分布',
      type: 'pie',
      gridPos: { x: 0, y: 8, w: 8, h: 7 },
      targets: [
        { refId: 'A', category: '资源使用率', metricName: '带宽使用率' },
      ],
      options: {},
    },
    {
      id: 'panel-mixed-gauge',
      title: '威新电信使用率',
      type: 'gauge',
      gridPos: { x: 8, y: 8, w: 4, h: 7 },
      targets: [
        { refId: 'A', category: '资源使用率', metricName: '威新机房-带宽使用率（电信）' },
      ],
      options: {},
    },
    {
      id: 'panel-mixed-table',
      title: '指标明细表',
      type: 'table',
      gridPos: { x: 12, y: 8, w: 12, h: 7 },
      targets: [
        { refId: 'A', category: '资源使用率', metricName: '' },
      ],
      options: {},
    },
  ],
}

export const sampleDashboards: { key: string; label: string; json: DashboardJSON }[] = [
  { key: 'bar', label: '柱状图 - 机房带宽对比', json: sampleBarDashboard },
  { key: 'line', label: '折线图 - 带宽趋势', json: sampleLineDashboard },
  { key: 'pie', label: '饼图 - 带宽分布', json: samplePieDashboard },
  { key: 'gauge', label: '仪表盘 - 使用率', json: sampleGaugeDashboard },
  { key: 'table', label: '表格 - 指标明细', json: sampleTableDashboard },
  { key: 'mixed', label: '综合大盘 - 多图表', json: sampleMixedDashboard },
]
