import { useRef, useEffect, useMemo, useState } from 'react'
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
  /** 是否显示右上角菜单按钮，默认 true */
  showMenu?: boolean
  /** 面板选项，如 { enableColumnFilter: true } */
  options?: Record<string, unknown>
  /** 面板 key（用于强制重新挂载） */
  panelKey?: string
  /** 后端返回的列名顺序，用于保持表头与 SQL 查询一致 */
  columns?: string[]
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

export default function ChartPanel({ type, title, data, targets, menuOpen, onToggleMenu, onEdit, onRemove, showMenu = true, options, panelKey, columns }: ChartPanelProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef = useRef<echarts.ECharts | null>(null)
  const [chartError, setChartError] = useState<string | null>(null)

  // 合并所有 target 数据为扁平数组（用于表格和列探测）
  const allData = useMemo(() => {
    try { return data.flat() } catch { return [] }
  }, [data])

  const { nameCol, valueCols } = useMemo(() => {
    // 用第一个 target 的数据探测列结构
    return detectColumns(data[0] || [], type)
  }, [data, type])

  useEffect(() => {
    if (!chartRef.current || type === 'table') return

    try {
      setChartError(null)

      // 如果已有实例，先 dispose
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose()
        chartInstanceRef.current = null
      }

      // 确保容器有尺寸
      const el = chartRef.current
      if (el.offsetWidth === 0 || el.offsetHeight === 0) return

      const chart = echarts.init(el, undefined, { renderer: 'canvas' })
      chartInstanceRef.current = chart

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
            const seriesBaseName = tdef?.metricName || tdef?.refId || (tValCols[0] || `查询${ti + 1}`)

            tValCols.forEach((col, ci) => {
              series.push({
                name: tValCols.length > 1 ? `${seriesBaseName}-${col}` : seriesBaseName,
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
      const handleResize = () => {
        try { chart.resize() } catch {}
      }
      window.addEventListener('resize', handleResize)
      return () => {
        window.removeEventListener('resize', handleResize)
        try {
          chart.dispose()
          chartInstanceRef.current = null
        } catch {}
      }
    } catch (err: any) {
      console.error('ChartPanel init error:', err)
      setChartError(err.message || '图表初始化失败')
      // 清理可能的残留实例
      try {
        if (chartInstanceRef.current) {
          chartInstanceRef.current.dispose()
          chartInstanceRef.current = null
        }
      } catch {}
    }
  }, [type, data, nameCol, valueCols, targets])

  // 表格：合并所有 target 数据
  // 优先使用后端返回的列顺序（columns），保证与 SQL 查询一致
  const tableHeaders = useMemo(() => {
    if (allData.length === 0) return []
    if (columns && columns.length > 0) return columns
    return Object.keys(allData[0])
  }, [allData, columns])

  // 表格排序与列筛选
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  // 每列筛选条件: 操作符 + 值
  interface ColFilter { op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'contains'; value: string }
  const [colFilters, setColFilters] = useState<Record<string, ColFilter>>({})
  // 当前打开筛选弹窗的列
  const [filterOpenCol, setFilterOpenCol] = useState<string | null>(null)

  const enableColFilter = options?.enableColumnFilter === true && type === 'table'

  // 条件告警
  interface CellAlertRule { column: string; op: '>' | '>=' | '<' | '<=' | '=' | '!='; value: number; color: string }
  const cellAlertRules: CellAlertRule[] = (() => {
    if (type !== 'table') return []
    const raw = options?.cellAlerts
    if (!Array.isArray(raw)) return []
    return raw.filter((r: any) => r && typeof r.column === 'string' && typeof r.op === 'string' && typeof r.value === 'number' && typeof r.color === 'string')
  })()
  const alertMode = (options?.alertMode === 'percentage' ? 'percentage' : 'absolute') as 'absolute' | 'percentage'
  // 百分比模式下预计算每列最大值
  const columnMax = useMemo(() => {
    if (alertMode !== 'percentage' || cellAlertRules.length === 0) return {} as Record<string, number>
    const max: Record<string, number> = {}
    for (const rule of cellAlertRules) {
      if (max[rule.column] !== undefined) continue
      let m = -Infinity
      for (const row of allData) {
        const v = parseFloat(String(row[rule.column] ?? ''))
        if (!isNaN(v) && v > m) m = v
      }
      max[rule.column] = isFinite(m) ? m : 0
    }
    return max
  }, [alertMode, cellAlertRules, allData])
  // 获取某单元格的告警颜色（规则列表中的最后匹配项优先）
  const getCellAlertColor = (col: string, cellValue: unknown): string | undefined => {
    if (cellAlertRules.length === 0) return undefined
    const cellNum = parseFloat(String(cellValue ?? ''))
    if (isNaN(cellNum)) return undefined
    let matchColor: string | undefined
    for (const rule of cellAlertRules) {
      if (rule.column !== col) continue
      let compareVal = cellNum
      if (alertMode === 'percentage' && columnMax[col] && columnMax[col] > 0) {
        compareVal = (cellNum / columnMax[col]) * 100
      }
      let matched = false
      switch (rule.op) {
        case '>': matched = compareVal > rule.value; break
        case '>=': matched = compareVal >= rule.value; break
        case '<': matched = compareVal < rule.value; break
        case '<=': matched = compareVal <= rule.value; break
        case '=': matched = compareVal === rule.value; break
        case '!=': matched = compareVal !== rule.value; break
      }
      if (matched) matchColor = rule.color
    }
    return matchColor
  }
  const enableCellMerge = options?.enableCellMerge === true && type === 'table'
  const mergeColumns = useMemo(() => {
    if (!enableCellMerge) return new Set<string>()
    const raw = options?.mergeColumns
    if (typeof raw === 'string' && raw.trim()) {
      return new Set(raw.split(',').map((s: string) => s.trim()).filter(Boolean))
    }
    return new Set<string>()
  }, [enableCellMerge, options?.mergeColumns])

  const filteredSortedData = useMemo(() => {
    let rows = allData

    // 每列筛选：逐列过滤
    if (enableColFilter) {
      Object.entries(colFilters).forEach(([col, f]) => {
        if (!f.value.trim()) return
        const val = f.value.trim()
        const op = f.op
        rows = rows.filter((row) => {
          const cellVal = row[col]
          if (cellVal == null) return false
          const cellStr = String(cellVal)
          switch (op) {
            case '=': return cellStr.toLowerCase() === val.toLowerCase()
            case '!=': return cellStr.toLowerCase() !== val.toLowerCase()
            case 'contains': return cellStr.toLowerCase().includes(val.toLowerCase())
            case '>': case '>=': case '<': case '<=': {
              const nCell = parseFloat(cellStr)
              const nVal = parseFloat(val)
              if (isNaN(nCell) || isNaN(nVal)) return false
              switch (op) {
                case '>': return nCell > nVal
                case '>=': return nCell >= nVal
                case '<': return nCell < nVal
                case '<=': return nCell <= nVal
              }
              return false
            }
            default: return true
          }
        })
      })
    }

    // 排序
    if (sortColumn) {
      rows = [...rows].sort((a, b) => {
        const va = a[sortColumn]
        const vb = b[sortColumn]
        const na = parseFloat(va as string)
        const nb = parseFloat(vb as string)
        if (!isNaN(na) && !isNaN(nb)) {
          return sortDir === 'asc' ? na - nb : nb - na
        }
        const sa = va != null ? String(va) : ''
        const sb = vb != null ? String(vb) : ''
        const cmp = sa.localeCompare(sb, 'zh-CN')
        return sortDir === 'asc' ? cmp : -cmp
      })
    }

    return rows
  }, [allData, colFilters, sortColumn, sortDir, tableHeaders, enableColFilter])

  // 预计算单元格合并信息：层级合并（类似 Excel）
  // 后续列的合并范围限制在前面列的合并范围内，不会跨组
  const cellMergeInfo = useMemo(() => {
    if (!enableCellMerge || filteredSortedData.length === 0 || mergeColumns.size === 0) return null
    const info: { rowSpan: number; skip: boolean }[][] = filteredSortedData.map(() =>
      tableHeaders.map(() => ({ rowSpan: 1, skip: false }))
    )

    // 先收集所有参与合并的列索引（按表头顺序）
    const mergeColIndices: number[] = []
    for (let ci = 0; ci < tableHeaders.length; ci++) {
      if (mergeColumns.has(tableHeaders[ci])) {
        mergeColIndices.push(ci)
      }
    }
    if (mergeColIndices.length === 0) return info

    // 对每个合并列，在当前列及之前所有合并列的值都相同的范围内查找连续相同行
    for (let colRank = 0; colRank < mergeColIndices.length; colRank++) {
      const ci = mergeColIndices[colRank]
      // 当前列之前的所有合并列索引（用于约束范围）
      const prevMergeIndices = mergeColIndices.slice(0, colRank)

      let i = 0
      while (i < filteredSortedData.length) {
        let j = i + 1
        while (j < filteredSortedData.length) {
          // 当前列值不同则停止
          const curCol = tableHeaders[ci]
          if (String(filteredSortedData[j][curCol] ?? '') !== String(filteredSortedData[i][curCol] ?? '')) break
          // 前面任一合并列的值不同也停止（保证不跨组）
          let crossGroup = false
          for (const pc of prevMergeIndices) {
            const prevCol = tableHeaders[pc]
            if (String(filteredSortedData[j][prevCol] ?? '') !== String(filteredSortedData[i][prevCol] ?? '')) {
              crossGroup = true
              break
            }
          }
          if (crossGroup) break
          j++
        }
        const span = j - i
        if (span > 1) {
          info[i][ci].rowSpan = span
          for (let k = i + 1; k < j; k++) {
            info[k][ci].skip = true
          }
        }
        i = j
      }
    }
    return info
  }, [enableCellMerge, filteredSortedData, tableHeaders, mergeColumns])

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDir('asc')
    }
  }

  const setColFilter = (col: string, f: ColFilter) => {
    setColFilters((prev) => ({ ...prev, [col]: f }))
  }

  const hasAnyFilter = Object.values(colFilters).some((v) => v.value.trim())

  return (
    <div className="chart-panel">
      <div className="panel-title">
        <span className="panel-title-dot" />
        {title}
        <div style={{ flex: 1 }} />
        {showMenu && (
        <span
          style={{ cursor: 'pointer', padding: '2px 6px', borderRadius: 2, fontSize: 16, color: 'var(--text-muted)' }}
          onClick={(e) => { e.stopPropagation(); onToggleMenu() }}
        >
          &#x22EE;
        </span>
        )}
      </div>

      {showMenu && menuOpen && (
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
                {tableHeaders.map((h) => (
                  <th
                    key={h}
                    style={{ position: 'relative', userSelect: 'none' }}
                  >
                    <span
                      onClick={() => handleSort(h)}
                      style={{ cursor: 'pointer' }}
                      title={`点击按 ${h} 排序`}
                    >
                      {h}
                      {sortColumn === h && (
                        <span style={{ marginLeft: 4, fontSize: 10 }}>
                          {sortDir === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </span>
                    {enableColFilter && (
                      <>
                        <span
                          onClick={(e) => { e.stopPropagation(); setFilterOpenCol(filterOpenCol === h ? null : h) }}
                          style={{
                            cursor: 'pointer', marginLeft: 6, display: 'inline-flex', alignItems: 'center',
                            color: colFilters[h]?.value ? 'var(--primary)' : 'var(--text-muted)',
                            padding: '1px 3px', borderRadius: 2,
                          }}
                          title="列筛选"
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M1.5 1.5A.5.5 0 012 1h12a.5.5 0 01.5.5v2a.5.5 0 01-.128.334L10 8.692V13.5a.5.5 0 01-.342.474l-3 1A.5.5 0 016 14.5V8.692L1.628 3.834A.5.5 0 011.5 3.5v-2z"/>
                          </svg>
                        </span>
                        {filterOpenCol === h && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              position: 'absolute', top: '100%', left: 0, zIndex: 10,
                              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                              borderRadius: 4, padding: 6, minWidth: 200, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                              display: 'flex', flexDirection: 'column', gap: 4,
                            }}
                          >
                            {/* 操作符选择 */}
                            <select
                              value={colFilters[h]?.op || 'contains'}
                              onChange={(e) => {
                                e.stopPropagation()
                                const op = e.target.value as ColFilter['op']
                                const curVal = colFilters[h]?.value || ''
                                setColFilter(h, { op, value: curVal })
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              style={{
                                width: '100%', fontSize: 11, padding: '4px 6px',
                                background: 'var(--bg-input)', color: 'var(--text-primary)',
                                border: '1px solid var(--border-color)', borderRadius: 3, outline: 'none',
                              }}
                            >
                              <option value="=">=</option>
                              <option value="!=">!=</option>
                              <option value=">">&gt;</option>
                              <option value=">=">&gt;=</option>
                              <option value="<">&lt;</option>
                              <option value="<=">&lt;=</option>
                              <option value="contains">包含</option>
                            </select>
                            {/* 筛选值输入 */}
                            <input
                              type="text"
                              value={colFilters[h]?.value || ''}
                              onChange={(e) => {
                                const op = colFilters[h]?.op || 'contains'
                                setColFilter(h, { op, value: e.target.value })
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              placeholder={`筛选 ${h}...`}
                              autoFocus
                              style={{
                                width: '100%', fontSize: 11, padding: '4px 8px',
                                background: 'var(--bg-input)', color: 'var(--text-primary)',
                                border: '1px solid var(--border-color)', borderRadius: 3, outline: 'none',
                                boxSizing: 'border-box',
                              }}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredSortedData.map((m, i) => (
                <tr key={i}>
                  {tableHeaders.map((h, ci) => {
                    if (cellMergeInfo && cellMergeInfo[i][ci].skip) return null
                    const rowSpan = cellMergeInfo ? cellMergeInfo[i][ci].rowSpan : 1
                    const alertColor = getCellAlertColor(h, m[h])
                    return (
                      <td key={h} rowSpan={rowSpan > 1 ? rowSpan : undefined}
                        style={alertColor ? { color: alertColor, fontWeight: 600 } : undefined}
                      >
                        {m[h] != null ? String(m[h]) : ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {filteredSortedData.length === 0 && (
                <tr><td colSpan={tableHeaders.length || 1} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>
                  {hasAnyFilter ? '无匹配结果' : '暂无数据'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={chartRef} style={{ width: '100%', flex: 1, minHeight: 0 }}>
          {chartError && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: 'var(--text-muted)', fontSize: 12,
              padding: 16, textAlign: 'center',
            }}>
              <div>
                <div style={{ marginBottom: 8, color: 'var(--red)', fontSize: 20 }}>!</div>
                <div>图表渲染失败</div>
                <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>{chartError}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
