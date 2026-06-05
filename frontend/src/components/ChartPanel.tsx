import { useRef, useEffect, useMemo } from 'react'
import * as echarts from 'echarts'
import type { MetricRow, TargetDef } from '../api'

interface ChartPanelProps {
  type: 'bar' | 'line' | 'pie' | 'gauge' | 'table'
  title: string
  /** 多查询数据：data[i] 是第 i 个 target 的结果行 */
  data: MetricRow[][]
  /** target 定义，用于读取图例名称 (metricName) */
  targets: TargetDef[]
  menuOpen: boolean
  onToggleMenu: () => void
  onEdit: () => void
  onRemove: () => void
}

/**
 * 从数据行中自动探测「名称列」和「数值列」。
 * - 名称列：第一个非空字符串列
 * - 数值列：所有可解析为数字的列
 */
/** 判断列名是否为日期/时间类型 */
function isDateColumn(colName: string): boolean {
  const kl = colName.toLowerCase()
  return kl.includes('date') || kl.includes('time') || kl.includes('日期') || kl.includes('时间') || kl === 'day'
}

function detectColumns(rows: MetricRow[], chartType?: string): { nameCol: string | null; valueCols: string[] } {
  if (rows.length === 0) return { nameCol: null, valueCols: [] }
  const keys = Object.keys(rows[0])
  let nameCol: string | null = null
  const valueCols: string[] = []

  for (const k of keys) {
    const kl = k.toLowerCase()
    // 折线图/柱状图：日期列优先作为 X 轴
    if (!nameCol && isDateColumn(k)) {
      nameCol = k
      continue
    }
    if (!nameCol && (kl.includes('name') || kl.includes('指标') || kl.includes('机房') || kl === '市场' || kl === 'market')) {
      nameCol = k
      continue
    }
    const sample = rows.slice(0, 5)
    const allNumeric = sample.every((r) => {
      const v = r[k]
      if (v === undefined || v === null || v === '') return false
      return !isNaN(parseFloat(v))
    })
    if (allNumeric && sample.some((r) => r[k] !== '' && r[k] !== undefined)) {
      valueCols.push(k)
    }
  }
  if (!nameCol) {
    nameCol = keys.find((k) => !valueCols.includes(k)) || keys[0]
  }
  return { nameCol, valueCols }
}

/** 截取简化名称 */
function shortName(name: string): string {
  return name
    .replace('威新机房-', '威新-')
    .replace('南方机房-', '南方-')
    .replace('带宽使用率（', '')
    .replace('）', '')
}

const SERIES_COLORS = ['#5794f2', '#e24d4d', '#55bd6a', '#ff9830', '#b877d9', '#eca846']

export default function ChartPanel({ type, title, data, targets, menuOpen, onToggleMenu, onEdit, onRemove }: ChartPanelProps) {
  const chartRef = useRef<HTMLDivElement>(null)

  // 合并所有 target 数据为扁平数组（用于表格和列探测）
  const allData = useMemo(() => data.flat(), [data])

  const { nameCol, valueCols } = useMemo(() => {
    // 用第一个 target 的数据探测列结构
    return detectColumns(data[0] || [], type)
  }, [data, type])

  useEffect(() => {
    if (!chartRef.current || type === 'table') return
    const chart = echarts.init(chartRef.current, undefined, { renderer: 'canvas' })

    // X 轴名称：从第一个 target 数据中取
    const firstRows = data[0] || []
    const names = nameCol ? firstRows.map((m) => {
      const v = m[nameCol!] || ''
      return v.length > 15 ? shortName(v) : v
    }) : []

    let option: echarts.EChartsOption

    switch (type) {
      case 'bar':
      case 'line': {
        // 多 target 模式：每个 target 作为一个独立的 series
        const isMultiTarget = data.length > 1
        const series: echarts.SeriesOption[] = []

        data.forEach((targetRows, ti) => {
          const tdef = targets[ti]
          const { valueCols: tValCols } = detectColumns(targetRows, type)
          // series 名称：优先 metricName > refId > valueCol
          const seriesBaseName = tdef?.metricName || tdef?.refId || (tValCols[0] || `查询${ti + 1}`)

          tValCols.forEach((col, ci) => {
            const seriesName = tValCols.length > 1 ? `${seriesBaseName}-${col}` : seriesBaseName
            series.push({
              name: seriesName,
              type: type as 'bar' | 'line',
              data: targetRows.map((m) => parseFloat(m[col]) || 0),
              ...(type === 'bar'
                ? {
                    itemStyle: { color: SERIES_COLORS[(ti * tValCols.length + ci) % SERIES_COLORS.length], borderRadius: [3, 3, 0, 0] },
                    barMaxWidth: 30,
                  }
                : {
                    smooth: true,
                    itemStyle: { color: SERIES_COLORS[(ti * tValCols.length + ci) % SERIES_COLORS.length] },
                    symbol: 'circle', symbolSize: 6,
                  }),
            })
          })
        })

        // legend data
        const legendData = series.map((s) => s.name as string)

        option = {
          backgroundColor: 'transparent',
          tooltip: { trigger: 'axis', ...(type === 'bar' ? { axisPointer: { type: 'shadow' } } : {}), backgroundColor: '#22252b', borderColor: '#33363d', textStyle: { color: '#d8d9da' } },
          legend: (isMultiTarget || valueCols.length > 1 || data.some((r, i) => (targets[i]?.metricName || '').length > 0))
            ? { data: legendData, bottom: 0, textStyle: { color: '#a0a3a8', fontSize: 11 } }
            : undefined,
          grid: { left: '3%', right: '4%', bottom: legendData.length > 1 ? '15%' : '8%', top: '8%', containLabel: true },
          xAxis: { type: 'category', data: names, ...(type === 'line' ? { boundaryGap: false } : {}), axisLabel: { rotate: names.length > 8 ? 30 : 0, fontSize: 10, color: '#a0a3a8' }, axisLine: { lineStyle: { color: '#33363d' } }, axisTick: { show: false } },
          yAxis: { type: 'value', name: valueCols[0] || '', nameTextStyle: { color: '#6e7178' }, axisLabel: { color: '#6e7178' }, splitLine: { lineStyle: { color: '#2c2f36' } } },
          series,
        }
        break
      }

      case 'pie': {
        const primaryValues = valueCols.length > 0
          ? firstRows.map((m) => parseFloat(m[valueCols[0]]) || 0)
          : []
        option = {
          backgroundColor: 'transparent',
          tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)', backgroundColor: '#22252b', borderColor: '#33363d', textStyle: { color: '#d8d9da' } },
          legend: { orient: 'vertical', left: 'left', top: 'middle', textStyle: { color: '#a0a3a8', fontSize: 11 } },
          series: [{
            type: 'pie', radius: ['45%', '70%'], center: ['55%', '50%'],
            data: names.map((n, i) => ({ name: n, value: primaryValues[i] || 0 })),
            emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } },
            label: { color: '#a0a3a8', fontSize: 10 },
          }],
        }
        break
      }

      case 'gauge': {
        const primaryValues = valueCols.length > 0
          ? firstRows.map((m) => parseFloat(m[valueCols[0]]) || 0)
          : []
        const gaugeValue = primaryValues.length > 0 ? primaryValues[0] : 0
        const gaugeName = names.length > 0 ? names[0] : '使用率'
        option = {
          backgroundColor: 'transparent',
          series: [{
            type: 'gauge', min: 0, max: 100, startAngle: 210, endAngle: -30,
            center: ['50%', '60%'], radius: '85%',
            progress: { show: true, width: 14, itemStyle: { color: gaugeValue > 80 ? '#e24d4d' : gaugeValue > 60 ? '#ff9830' : '#55bd6a' } },
            axisLine: { lineStyle: { width: 14, color: [[0.6, '#55bd6a'], [0.8, '#ff9830'], [1, '#e24d4d']] } },
            axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
            detail: { valueAnimation: true, fontSize: 26, offsetCenter: [0, '60%'], formatter: '{value}%', color: '#d8d9da' },
            data: [{ value: gaugeValue, name: shortName(gaugeName) }],
          }],
        }
        break
      }

      default:
        option = {}
    }

    chart.setOption(option)
    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [type, data, nameCol, valueCols, targets])

  // 表格：合并所有 target 数据
  const tableHeaders = useMemo(() => {
    if (allData.length === 0) return []
    return Object.keys(allData[0])
  }, [allData])

  return (
    <div className="chart-panel">
      <div className="panel-title">
        <span className="panel-title-dot" />
        {title}
        <div style={{ flex: 1 }} />
        <span
          style={{ cursor: 'pointer', padding: '2px 6px', borderRadius: 2, fontSize: 16, color: 'var(--text-muted)' }}
          onClick={(e) => { e.stopPropagation(); onToggleMenu() }}
        >
          &#x22EE;
        </span>
      </div>

      {menuOpen && (
        <div className="panel-menu-dropdown" onClick={(e) => e.stopPropagation()}>
          <button className="panel-menu-item" onClick={onEdit}>编辑</button>
          <button className="panel-menu-item danger" onClick={onRemove}>删除</button>
        </div>
      )}

      {type === 'table' ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map((h) => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {allData.map((m, i) => (
                <tr key={i}>
                  {tableHeaders.map((h) => <td key={h}>{m[h] || ''}</td>)}
                </tr>
              ))}
              {allData.length === 0 && (
                <tr><td colSpan={tableHeaders.length || 1} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>暂无数据</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={chartRef} style={{ width: '100%', flex: 1 }} />
      )}
    </div>
  )
}
