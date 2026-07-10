import { useRef, useEffect, useMemo, useState, memo } from 'react'
import * as echarts from 'echarts'
import type { MetricRow, TargetDef, DataLinkDef } from '../api'

/**
 * 判断值是否为毫秒时间戳。
 * 毫秒时间戳范围：1000000000000 (2001-09-09) 到 2000000000000 (2033-05-18)
 */
function isMillisecondTimestamp(val: unknown): boolean {
  if (typeof val !== 'number') return false
  return val > 1000000000000 && val < 2000000000000
}

/**
 * 时间格式配置（参考 Grafana）
 */
interface TimeFormatConfig {
  format: string
  splitType: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'
  interval: number // 建议的刻度间隔（单位取决于 splitType）
}

/**
 * 根据时间范围和数据点数量确定时间格式和刻度间隔（参考 Grafana）
 */
function getTimeFormatConfig(rangeMs: number, dataPoints: number): TimeFormatConfig {
  const SECOND = 1000
  const MINUTE = 60 * SECOND
  const HOUR = 60 * MINUTE
  const DAY = 24 * HOUR
  const WEEK = 7 * DAY
  const MONTH = 30 * DAY
  const YEAR = 365 * DAY

  // 根据时间范围选择基础格式
  if (rangeMs <= 1 * MINUTE) {
    // 1分钟内：秒级精度
    return { format: '{HH}:{mm}:{ss}', splitType: 'second', interval: Math.max(1, Math.ceil(rangeMs / SECOND / 10)) }
  } else if (rangeMs <= 15 * MINUTE) {
    // 15分钟内：秒级精度
    return { format: '{HH}:{mm}:{ss}', splitType: 'second', interval: Math.max(5, Math.ceil(rangeMs / SECOND / 10)) }
  } else if (rangeMs <= 1 * HOUR) {
    // 1小时内：分钟级精度
    return { format: '{HH}:{mm}', splitType: 'minute', interval: Math.max(1, Math.ceil(rangeMs / MINUTE / 10)) }
  } else if (rangeMs <= 6 * HOUR) {
    // 6小时内：分钟级精度
    return { format: '{HH}:{mm}', splitType: 'minute', interval: Math.max(5, Math.ceil(rangeMs / MINUTE / 10)) }
  } else if (rangeMs <= 12 * HOUR) {
    // 12小时内：小时级精度
    return { format: '{HH}:{mm}', splitType: 'hour', interval: 1 }
  } else if (rangeMs <= 1 * DAY) {
    // 24小时内：小时级精度
    return { format: '{HH}:{mm}', splitType: 'hour', interval: Math.max(2, Math.ceil(rangeMs / HOUR / 10)) }
  } else if (rangeMs <= 2 * DAY) {
    // 2天内：小时级精度，显示日期
    return { format: '{MM}/{dd} {HH}:{mm}', splitType: 'hour', interval: Math.max(4, Math.ceil(rangeMs / HOUR / 10)) }
  } else if (rangeMs <= 7 * DAY) {
    // 7天内：小时级精度
    return { format: '{MM}/{dd} {HH}:{mm}', splitType: 'hour', interval: Math.max(6, Math.ceil(rangeMs / HOUR / 10)) }
  } else if (rangeMs <= 30 * DAY) {
    // 30天内：天级精度
    return { format: '{MM}/{dd}', splitType: 'day', interval: Math.max(1, Math.ceil(rangeMs / DAY / 10)) }
  } else if (rangeMs <= 90 * DAY) {
    // 90天内：天级精度
    return { format: '{MM}/{dd}', splitType: 'day', interval: Math.max(3, Math.ceil(rangeMs / DAY / 10)) }
  } else if (rangeMs <= 1 * YEAR) {
    // 1年内：周级精度
    return { format: '{MM}/{dd}', splitType: 'week', interval: Math.max(1, Math.ceil(rangeMs / WEEK / 10)) }
  } else {
    // 超过1年：月级精度
    return { format: '{yyyy}-{MM}', splitType: 'month', interval: Math.max(1, Math.ceil(rangeMs / MONTH / 10)) }
  }
}

/**
 * 将毫秒时间戳转换为指定格式的日期字符串。
 */
function formatTimestamp(ms: number, format?: string): string {
  const date = new Date(ms)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  if (!format) {
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }

  return format
    .replace('{yyyy}', String(year))
    .replace('{MM}', month)
    .replace('{dd}', day)
    .replace('{HH}', hours)
    .replace('{mm}', minutes)
    .replace('{ss}', seconds)
}

/**
 * 格式化值：如果是毫秒时间戳则转换为日期字符串，否则返回原值。
 */
function formatValue(val: unknown): string {
  if (isMillisecondTimestamp(val)) {
    return formatTimestamp(val as number)
  }
  return String(val ?? '')
}

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
  /** Data Links 配置（仿照 Grafana） */
  dataLinks?: DataLinkDef[]
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

  // 第一步：先识别数值列（优先级最高）
  for (const k of keys) {
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

  // 第二步：从非数值列中识别名称列
  const nonValueKeys = keys.filter((k) => !valueCols.includes(k))
  for (const k of nonValueKeys) {
    const kl = k.toLowerCase()
    // 折线图/柱状图：日期列优先作为 X 轴
    if (!nameCol && isDateColumn(k)) {
      nameCol = k
      continue
    }
    // 名称列关键词匹配（精确匹配优先）
    if (!nameCol && (kl.includes('name') || kl.includes('node') || kl.includes('机房') || kl === '市场' || kl === 'market' || kl === '类型' || kl === 'type' || kl === 'category' || kl.includes('设备'))) {
      nameCol = k
      continue
    }
  }

  // 第三步：如果还没找到名称列，取第一个非数值列
  if (!nameCol && nonValueKeys.length > 0) {
    nameCol = nonValueKeys[0]
  }
  // 兜底：如果所有列都是数值列，取第一个列作为名称列
  if (!nameCol) {
    nameCol = keys[0]
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

// 冷色调配色方案，避免红色/黄色引发告警误解
const SERIES_COLORS = ['#5470c6', '#73c0de', '#91cc75', '#55bd6a', '#b877d9', '#9a60b4', '#3ba272', '#5b8ff9']

export default memo(function ChartPanel({ type, title, data, targets, menuOpen, onToggleMenu, onEdit, onRemove, showMenu = true, options, panelKey, columns, dataLinks }: ChartPanelProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef = useRef<echarts.ECharts | null>(null)
  const [chartError, setChartError] = useState<string | null>(null)
  const [linkMenu, setLinkMenu] = useState<{ x: number; y: number; links: DataLinkDef[]; data: Record<string, any> } | null>(null)

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
      
      // 检测是否为时间序列数据（X轴是时间戳）
      const isTimeSeries = nameCol && firstRows.length > 0 && isMillisecondTimestamp(firstRows[0][nameCol!])
      
      // 计算时间范围和格式配置（如果是时间序列）
      let timeFormat = ''
      let timeConfig: TimeFormatConfig | null = null
      if (isTimeSeries && firstRows.length > 1) {
        const timestamps = firstRows.map((m) => m[nameCol!] as number).filter((t) => isMillisecondTimestamp(t))
        if (timestamps.length >= 2) {
          const minTs = Math.min(...timestamps)
          const maxTs = Math.max(...timestamps)
          const rangeMs = maxTs - minTs
          timeConfig = getTimeFormatConfig(rangeMs, timestamps.length)
          timeFormat = timeConfig.format
        }
      }
      
      const names = nameCol ? firstRows.map((m) => {
        const v = m[nameCol!]
        // 如果是毫秒时间戳，根据时间范围转换为对应格式的日期字符串
        if (isMillisecondTimestamp(v)) {
          return formatTimestamp(v as number, timeFormat)
        }
        const str = String(v || '')
        return str.length > 15 ? shortName(str) : str
      }) : []

      let option: echarts.EChartsOption

      switch (type) {
        case 'bar':
        case 'line': {
          // 多 target 模式：每个 target 作为一个独立的 series
          const isMultiTarget = data.length > 1
          const series: echarts.SeriesOption[] = []
          const barOrientation = (options?.barOrientation as string) || 'vertical'
          const isHorizontal = type === 'bar' && barOrientation === 'horizontal'

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
                      itemStyle: { color: SERIES_COLORS[(ti * tValCols.length + ci) % SERIES_COLORS.length], borderRadius: isHorizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] },
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

          // 计算xAxis标签间隔（避免重叠）
          const calculateLabelInterval = (): number => {
            // 根据数据点数量估算可显示的标签数量
            // 假设每个标签需要约50px宽度（含间距）
            const avgLabelWidth = 50
            // 使用实际图表宽度（容器宽度 - 左右边距）
            const chartWidth = el?.offsetWidth || 400
            const usableWidth = chartWidth * 0.85 // 减去左右边距
            const maxLabels = Math.floor(usableWidth / avgLabelWidth)
            if (names.length > maxLabels && maxLabels > 0) {
              return Math.ceil(names.length / maxLabels) - 1
            }
            return 0
          }

          // 计算标签旋转角度
          const calculateRotate = (): number => {
            if (isHorizontal) return 0
            // 时间序列数据：根据数据点数量决定旋转
            if (isTimeSeries) {
              if (names.length > 20) return 45
              if (names.length > 10) return 30
              return 0
            }
            // 非时间序列数据：根据标签文本长度决定旋转
            const avgLabelLen = names.reduce((sum, n) => sum + (n?.length || 0), 0) / names.length
            if (names.length > 15 || avgLabelLen > 8) return 30
            if (names.length > 10 || avgLabelLen > 5) return 15
            return 0
          }

          const labelRotate = calculateRotate()
          const labelInterval = calculateLabelInterval()

          option = {
            backgroundColor: '#ffffff',
            tooltip: { trigger: 'axis', ...(type === 'bar' ? { axisPointer: { type: 'shadow' } } : {}), backgroundColor: '#22252b', borderColor: '#33363d', textStyle: { color: '#d8d9da' } },
            legend: (isMultiTarget || valueCols.length > 1 || data.some((r, i) => (targets[i]?.metricName || '').length > 0))
              ? { data: legendData, bottom: 0, textStyle: { color: '#a0a3a8', fontSize: 11 } }
              : undefined,
            // 根据标签旋转角度调整底部边距，避免标签被截断
            grid: { 
              left: '6%', right: '4%', 
              bottom: legendData.length > 1 ? '15%' : (labelRotate > 30 ? '18%' : labelRotate > 0 ? '12%' : '10%'), 
              top: '12%', 
              containLabel: true 
            },
            // 横向柱状图：交换 xAxis 和 yAxis
            xAxis: isHorizontal
              ? { type: 'value', name: valueCols[0] || '', nameTextStyle: { color: '#6e7178' }, axisLabel: { color: '#6e7178' }, splitLine: { lineStyle: { color: '#2c2f36' } } }
              : {
                  type: 'category',
                  data: names,
                  ...(type === 'line' ? { boundaryGap: false } : {}),
                  axisLabel: {
                    rotate: labelRotate,
                    fontSize: 11,
                    color: '#a0a3a8',
                    interval: labelInterval,
                    // 大量数据时隐藏重叠标签
                    hideOverlap: names.length > 25,
                    // 超长标签截断
                    formatter: (val: string) => {
                      if (val && val.length > 12) {
                        return val.slice(0, 12) + '...'
                      }
                      return val
                    },
                  },
                  axisLine: { lineStyle: { color: '#33363d' } },
                  axisTick: { show: false },
                },
            yAxis: isHorizontal
              ? { type: 'category', data: names, axisLabel: { fontSize: 10, color: '#a0a3a8' }, axisLine: { lineStyle: { color: '#33363d' } }, axisTick: { show: false } }
              : { type: 'value', name: valueCols[0] || '', nameTextStyle: { color: '#6e7178' }, axisLabel: { color: '#6e7178' }, splitLine: { lineStyle: { color: '#2c2f36' } } },
            series,
          }
          break
        }

        case 'pie': {
          const primaryValues = valueCols.length > 0
            ? firstRows.map((m) => parseFloat(m[valueCols[0]]) || 0)
            : []
          // 根据数据量动态调整布局
          const dataCount = names.length
          const isManyData = dataCount > 8
          // 数据多时：使用右侧图例，饼图左移，标签隐藏（通过图例查看）
          // 数据少时：使用左侧图例，饼图右移，标签外部显示
          const pieCenter = isManyData ? ['40%', '50%'] : ['55%', '50%']
          const pieRadius = isManyData ? ['35%', '55%'] : ['45%', '70%']

          option = {
            backgroundColor: 'transparent',
            tooltip: {
              trigger: 'item',
              formatter: '{b}: {c} ({d}%)',
              backgroundColor: '#22252b',
              borderColor: '#33363d',
              textStyle: { color: '#d8d9da' },
              confine: true, // 限制在图表区域内
            },
            legend: isManyData ? {
              type: 'scroll',
              orient: 'vertical',
              right: 10,
              top: 'middle',
              textStyle: { color: '#a0a3a8', fontSize: 11 },
              itemWidth: 12,
              itemHeight: 12,
              itemGap: 6,
              pageIconColor: '#a0a3a8',
              pageIconInactiveColor: '#4e5969',
              pageTextStyle: { color: '#a0a3a8' },
            } : {
              orient: 'vertical',
              left: 10,
              top: 'middle',
              textStyle: { color: '#a0a3a8', fontSize: 11 },
              itemWidth: 12,
              itemHeight: 12,
              itemGap: 6,
            },
            series: [{
              type: 'pie',
              radius: pieRadius,
              center: pieCenter,
              data: names.map((n, i) => ({ name: n, value: primaryValues[i] || 0 })),
              emphasis: {
                itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' },
                label: { show: true, fontWeight: 'bold' }, // 悬浮时显示标签
              },
              label: {
                show: !isManyData, // 数据多时隐藏标签，通过图例查看
                position: 'outer',
                color: '#a0a3a8',
                fontSize: 10,
                formatter: isManyData ? '{b}' : '{b}\n{c} ({d}%)', // 数据多时只显示名称
                alignTo: 'labelLine', // 标签对齐到引导线
                bleedMargin: 5, // 标签出血边距
              },
              labelLine: {
                show: !isManyData,
                length: 10, // 第一段引导线长度
                length2: 15, // 第二段引导线长度
                smooth: false,
                lineStyle: { color: '#4e5969', width: 1 },
              },
              labelLayout: {
                hideOverlap: true, // 自动隐藏重叠的标签
                moveOverlap: 'shiftY', // 垂直方向移动避免重叠
              },
              // 小数据时，鼠标悬浮显示完整信息
              ...(isManyData ? {} : {
                blur: {
                  label: { opacity: 0.3 },
                },
              }),
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
            backgroundColor: '#ffffff',
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

      // 添加点击事件处理（Data Links）
      if (dataLinks && dataLinks.length > 0) {
        chart.on('click', (params: any) => {
          if (!dataLinks || dataLinks.length === 0) return

          // 构建变量替换数据
          const linkData: Record<string, any> = {
            '__value': params.value,
            '__series.name': params.seriesName,
            '__series.index': params.seriesIndex,
            '__data.name': params.name,
            '__data.index': params.dataIndex,
          }

          // 显示链接菜单
          setLinkMenu({
            x: params.event?.event?.clientX || 0,
            y: params.event?.event?.clientY || 0,
            links: dataLinks,
            data: linkData,
          })
        })
      }

      const handleResize = () => {
        try { chart.resize() } catch {}
      }
      window.addEventListener('resize', handleResize)

      // 监听容器大小变化
      const resizeObserver = new ResizeObserver(() => {
        try { chart.resize() } catch {}
      })
      if (el) resizeObserver.observe(el)

      return () => {
        resizeObserver.disconnect()
        window.removeEventListener('resize', handleResize)
        // 移除点击事件
        if (dataLinks && dataLinks.length > 0) {
          chart.off('click')
        }
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
  }, [type, data, nameCol, valueCols, targets, options])

  // 表格：合并所有 target 数据
  // 优先使用后端返回的列顺序（columns），保证与 SQL 查询一致
  const tableHeaders = useMemo(() => {
    if (allData.length === 0) return []
    let headers: string[] = []
    if (columns && columns.length > 0) {
      headers = columns
    } else {
      headers = Object.keys(allData[0])
    }
    // 根据options.hiddenColumns过滤隐藏的列（默认全显示）
    const hiddenColumns = (options?.hiddenColumns as string[] | undefined) || []
    headers = headers.filter(h => !hiddenColumns.includes(h))
    
    // 根据options.columnOrder重新排序（如果用户自定义了顺序）
    const columnOrder = (options?.columnOrder as string[] | undefined) || []
    if (columnOrder.length > 0) {
      // 只排序存在于headers中的列，保持其他列在后面
      const orderedHeaders: string[] = []
      const remainingHeaders: string[] = []
      
      // 先按columnOrder的顺序添加
      for (const orderedCol of columnOrder) {
        if (headers.includes(orderedCol)) {
          orderedHeaders.push(orderedCol)
        }
      }
      
      // 再添加不在columnOrder中的列（保持原始顺序）
      for (const h of headers) {
        if (!orderedHeaders.includes(h)) {
          remainingHeaders.push(h)
        }
      }
      
      headers = [...orderedHeaders, ...remainingHeaders]
    }
    
    return headers
  }, [allData, columns, options?.hiddenColumns, options?.columnOrder])

  // 表格排序与列筛选
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  // 每列筛选条件: 操作符 + 值
  interface ColFilter { op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'contains'; value: string }
  const [colFilters, setColFilters] = useState<Record<string, ColFilter>>({})
  // 当前打开筛选弹窗的列
  const [filterOpenCol, setFilterOpenCol] = useState<string | null>(null)
  // 分页
  const pageSize = typeof options?.pageSize === 'number' && options.pageSize > 0 ? options.pageSize : 5
  const [currentPage, setCurrentPage] = useState(1)

  const enableColFilter = options?.enableColumnFilter === true && type === 'table'

  // 构建 aliasMap 双向映射，供 mergeColumns 和 cellAlerts 共用
  const colAliasMap = useMemo(() => {
    const expanded: Map<string, Set<string>> = new Map()
    for (const t of targets) {
      if (!t.aliasMap) continue
      for (const [rawCol, alias] of Object.entries(t.aliasMap)) {
        if (!alias) continue
        let set = expanded.get(rawCol)
        if (!set) { set = new Set(); expanded.set(rawCol, set) }
        set.add(rawCol)
        set.add(alias)
        set = expanded.get(alias)
        if (!set) { set = new Set(); expanded.set(alias, set) }
        set.add(rawCol)
        set.add(alias)
      }
    }
    return expanded
  }, [targets])

  // 条件告警
  interface CellAlertRule { column: string; op: '>' | '>=' | '<' | '<=' | '=' | '!='; value: number; color: string }
  const cellAlertRules: CellAlertRule[] = useMemo(() => {
    if (type !== 'table') return []
    const raw = options?.cellAlerts
    if (!Array.isArray(raw)) return []
    const valid = raw.filter((r: any) => r && typeof r.column === 'string' && typeof r.op === 'string' && typeof r.value === 'number' && typeof r.color === 'string')
    // 为有 aliasMap 的列生成对应的别名规则，使 raw/alias 列名都能匹配
    const expanded: CellAlertRule[] = []
    for (const r of valid) {
      expanded.push(r)
      const names = colAliasMap.get(r.column as string)
      if (names) {
        for (const n of names) {
          if (n !== (r.column as string)) {
            expanded.push({ ...r, column: n })
          }
        }
      }
    }
    return expanded
  }, [type, options?.cellAlerts, colAliasMap])
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
    if (typeof raw !== 'string' || !raw.trim()) return new Set<string>()
    const names = new Set(raw.split(',').map((s: string) => s.trim()).filter(Boolean))
    // 也加入 aliasMap 的对应列名
    for (const col of [...names]) {
      const expanded = colAliasMap.get(col)
      if (expanded) expanded.forEach((n) => names.add(n))
    }
    return names
  }, [enableCellMerge, options?.mergeColumns, colAliasMap])

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

  // 分页：数据变化时重置到第一页
  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredSortedData.length / pageSize)), [filteredSortedData, pageSize])
  useEffect(() => { setCurrentPage(1) }, [filteredSortedData.length, pageSize])
  // 确保 currentPage 在有效范围内
  const safePage = Math.min(currentPage, totalPages)
  const paginatedData = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredSortedData.slice(start, start + pageSize)
  }, [filteredSortedData, safePage, pageSize])

  // 预计算单元格合并信息：层级合并（类似 Excel）- 仅在分页数据上计算
  // 后续列的合并范围限制在前面列的合并范围内，不会跨组
  const cellMergeInfo = useMemo(() => {
    const data = paginatedData // 在当前页数据上合并，避免跨页边界
    if (!enableCellMerge || data.length === 0 || mergeColumns.size === 0) return null
    const info: { rowSpan: number; skip: boolean }[][] = data.map(() =>
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
      const prevMergeIndices = mergeColIndices.slice(0, colRank)

      let i = 0
      while (i < data.length) {
        let j = i + 1
        while (j < data.length) {
          const curCol = tableHeaders[ci]
          if (String(data[j][curCol] ?? '') !== String(data[i][curCol] ?? '')) break
          let crossGroup = false
          for (const pc of prevMergeIndices) {
            const prevCol = tableHeaders[pc]
            if (String(data[j][prevCol] ?? '') !== String(data[i][prevCol] ?? '')) {
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
  }, [enableCellMerge, paginatedData, tableHeaders, mergeColumns])

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
              {paginatedData.map((m, i) => (
                <tr key={i}>
                  {tableHeaders.map((h, ci) => {
                    if (cellMergeInfo && cellMergeInfo[i][ci].skip) return null
                    const rowSpan = cellMergeInfo ? cellMergeInfo[i][ci].rowSpan : 1
                    const alertColor = getCellAlertColor(h, m[h])

                    // 检查是否有 Data Link 配置
                    const dataLink = (dataLinks || []).find((link) => link.field === h)
                    if (dataLink && dataLink.url) {
                      // 替换 URL 变量
                      let url = dataLink.url
                      url = url.replace(/\$\{__value\}/g, String(m[h] ?? ''))
                      url = url.replace(/\$\{__field\.name\}/g, h)
                      // 替换 ${__row.xxx} 变量
                      url = url.replace(/\$\{__row\.(\w+)\}/g, (_, fieldName) => String(m[fieldName] ?? ''))

                      const linkTitle = dataLink.title || String(m[h] ?? '')
                      return (
                        <td key={h} rowSpan={rowSpan > 1 ? rowSpan : undefined}
                          style={alertColor ? { color: alertColor, fontWeight: 600 } : undefined}
                        >
                          <a
                            href={url}
                            target={dataLink.target || '_blank'}
                            rel="noopener noreferrer"
                            style={{
                              color: alertColor || 'var(--primary)',
                              textDecoration: 'none',
                              cursor: 'pointer',
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {linkTitle}
                          </a>
                        </td>
                      )
                    }

                    return (
                      <td key={h} rowSpan={rowSpan > 1 ? rowSpan : undefined}
                        style={alertColor ? { color: alertColor, fontWeight: 600 } : undefined}
                      >
                        {formatValue(m[h])}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {paginatedData.length === 0 && (
                <tr><td colSpan={tableHeaders.length || 1} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>
                  {hasAnyFilter ? '无匹配结果' : '暂无数据'}
                </td></tr>
              )}
            </tbody>
          </table>
          {/* 分页控件 */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '8px 0', borderTop: '1px solid var(--border-color)',
              fontSize: 12, color: 'var(--text-secondary)',
            }}>
              <button
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '2px 8px', fontSize: 11,
                  background: 'var(--bg-input)', color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)', borderRadius: 3,
                  cursor: safePage <= 1 ? 'default' : 'pointer',
                  opacity: safePage <= 1 ? 0.4 : 1,
                }}
              >上一页</button>
              <span>第 {safePage} / {totalPages} 页</span>
              <button
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  padding: '2px 8px', fontSize: 11,
                  background: 'var(--bg-input)', color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)', borderRadius: 3,
                  cursor: safePage >= totalPages ? 'default' : 'pointer',
                  opacity: safePage >= totalPages ? 0.4 : 1,
                }}
              >下一页</button>
              <span style={{ marginLeft: 4 }}>共 {filteredSortedData.length} 条</span>
            </div>
          )}
        </div>
      ) : (
        <div ref={chartRef} style={{ width: '100%', flex: 1, minHeight: '200px' }}>
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

      {/* Data Links 菜单 */}
      {linkMenu && (
        <div
          style={{
            position: 'fixed',
            left: linkMenu.x,
            top: linkMenu.y,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            zIndex: 9999,
            minWidth: 150,
            padding: 4,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {linkMenu.links.map((link, idx) => {
            // 替换URL中的变量
            let url = link.url
            Object.entries(linkMenu.data).forEach(([key, value]) => {
              url = url.replace(`\${${key}}`, String(value))
            })

            return (
              <button
                key={idx}
                onClick={() => {
                  window.open(url, link.target || '_blank')
                  setLinkMenu(null)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: 12,
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {link.title || link.url}
              </button>
            )
          })}
          <button
            onClick={() => setLinkMenu(null)}
            style={{
              display: 'block',
              width: '100%',
              padding: '6px 12px',
              fontSize: 11,
              background: 'transparent',
              color: 'var(--text-muted)',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              textAlign: 'left',
              marginTop: 4,
            }}
          >
            关闭
          </button>
        </div>
      )}

      {/* 点击其他区域关闭链接菜单 */}
      {linkMenu && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
          onClick={() => setLinkMenu(null)}
        />
      )}
    </div>
  )
})
