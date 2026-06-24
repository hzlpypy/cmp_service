import { useState, useEffect, useRef, useMemo } from 'react'
import html2canvas from 'html2canvas'
import ChartPanel from './ChartPanel'
import GridLayout from './GridLayout'
import AIChatDialog from './AIChatDialog'
import VariableSelector from './VariableSelector'
import DashboardEditor from './DashboardEditor'
import VersionHistory from './VersionHistory'
import * as api from '../api'
import type { DashboardRes, DashboardDataRes, DashboardJSON, MetricRow, PanelDef, PanelDataRes, DatasourceRes, VariableRes } from '../api'

interface DashboardViewProps {
  dashboardId: string
  onBack: () => void
  onEditPanel?: (ctx: {
    panel: PanelDef
    dashboardId: string
    datasources: DatasourceRes[]
    draftJson: any
    panelsData?: PanelDataRes[]
    variables: VariableRes[]
    timePreset: string
    customFrom: string
    customTo: string
    onSave: (updated: PanelDef) => void
  }) => void
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export default function DashboardView({ dashboardId, onBack, onEditPanel }: DashboardViewProps) {
  const [dashboard, setDashboard] = useState<DashboardRes | null>(null)
  const [dataRes, setDataRes] = useState<DashboardDataRes | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [showJson, setShowJson] = useState(false)
  const [datasources, setDatasources] = useState<DatasourceRes[]>([])
  const [variables, setVariables] = useState<VariableRes[]>([])

  // ---- 本地草稿状态：所有编辑操作仅修改此状态，不调 API ----
  const [draftJson, setDraftJson] = useState<any>(null)
  // 上次保存时的快照，用于判断有无未保存变更
  const [savedJson, setSavedJson] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const hasUnsaved = useMemo(
    () => savedJson !== null && JSON.stringify(draftJson) !== JSON.stringify(savedJson),
    [savedJson, draftJson]
  )

  // AI 对话面板
  const [chatOpen, setChatOpen] = useState(false)

  // 创建仪表盘快照
  const [snapModalOpen, setSnapModalOpen] = useState(false)
  const [snapName, setSnapName] = useState('')
  const [snapping, setSnapping] = useState(false)
  const [snapshots, setSnapshots] = useState<api.SnapshotRes[]>([])
  const [snapLoading, setSnapLoading] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const shareLink = `${window.location.origin}/snapshot/`

  const loadSnapshots = async () => {
    setSnapLoading(true)
    try { setSnapshots(await api.listSnapshots(dashboardId, '')) } catch {}
    finally { setSnapLoading(false) }
  }

  const handleCreateDashboardSnapshot = async () => {
    if (!draftJson || !dataRes) return
    setSnapping(true)
    try {
      const panelDataList: api.PanelDataRes[] = (dataRes.panels_data || []).map((pd) => ({
        panel_id: pd.panel_id,
        panel_title: pd.panel_title,
        panel_type: pd.panel_type,
        datasource_id: pd.datasource_id,
        target: pd.target,
        columns: pd.columns,
      }))
      const snap = await api.createSnapshot({
        dashboard_id: dashboardId,
        panel_id: '',
        name: snapName || `${displayTitle || '仪表盘'} 快照`,
        dashboard_json: draftJson as DashboardJSON,
        panels_data: panelDataList,
      })
      setSnapshots((prev) => [snap, ...prev])
      setSnapName('')
    } catch (e: any) {
      alert('创建快照失败: ' + (e.message || '未知错误'))
    } finally {
      setSnapping(false)
    }
  }

  const handleDeleteSnapshot = async (key: string) => {
    if (!confirm('确认删除该快照？')) return
    try {
      await api.deleteSnapshot(key)
      setSnapshots((prev) => prev.filter((s) => s.snapshot_key !== key))
    } catch (e: any) { alert('删除失败: ' + (e.message || '未知错误')) }
  }

  // 导出为图像
  const canvasRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const handleExportImage = async () => {
    if (!canvasRef.current) return
    setExporting(true)

    // 等待静态布局渲染完成，ECharts 需要足够时间
    await new Promise((r) => requestAnimationFrame(r))
    await new Promise((r) => setTimeout(r, 500))

    // 触发所有 ECharts 图表 resize
    window.dispatchEvent(new Event('resize'))
    await new Promise((r) => setTimeout(r, 300))

    const canvasEl = canvasRef.current
    const wrapperEl = wrapperRef.current

    // 保存原始样式
    const origCanvasStyle = canvasEl.style.cssText
    const origWrapperStyle = wrapperEl?.style.cssText || ''
    // 保存 dashboard-view 根节点的 overflow 样式
    const viewRoot = canvasEl.closest('.dashboard-view') as HTMLElement
    const origRootOverflow = viewRoot?.style.overflow || ''

    try {
      // 临时展开整个仪表盘面板区域，确保所有内容可见
      if (wrapperEl) {
        wrapperEl.style.height = 'auto'
        wrapperEl.style.flex = 'none'
        wrapperEl.style.overflow = 'visible'
      }
      canvasEl.style.height = 'auto'
      canvasEl.style.flex = 'none'
      canvasEl.style.overflow = 'visible'
      canvasEl.style.maxHeight = 'none'
      if (viewRoot) {
        viewRoot.style.overflow = 'visible'
      }

      // 等待一帧让浏览器重新布局
      await new Promise((r) => requestAnimationFrame(r))

      const canvas = await html2canvas(canvasEl, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: canvasEl.scrollWidth,
        windowHeight: canvasEl.scrollHeight,
      })
      const link = document.createElement('a')
      link.download = `${displayTitle || 'dashboard'}_${new Date().toISOString().slice(0, 10)}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (e: any) {
      alert('导出失败: ' + (e.message || e))
    } finally {
      // 恢复原始样式
      canvasEl.style.cssText = origCanvasStyle
      if (wrapperEl) wrapperEl.style.cssText = origWrapperStyle
      if (viewRoot) viewRoot.style.overflow = origRootOverflow
      setExporting(false)
    }
  }

  /** AI 通过 onDraftUpdate 回调传入修改后的 dashboard_json，立即生效 */
  const handleDraftUpdate = (newDashboardJson: any) => {
    if (!newDashboardJson) return
    setDraftJson(newDashboardJson)
    // 立即用新草稿查询面板数据，实现预览
    reloadDataWithDraft(newDashboardJson)
  }

  // 单面板编辑器
  // 仪表盘编辑器（包含变量管理）
  const [showEditor, setShowEditor] = useState(false)
  // 添加面板
  const [showNewPanel, setShowNewPanel] = useState(false)
  // 版本历史
  const [showVersionHistory, setShowVersionHistory] = useState(false)

  // 时间范围选择（从 localStorage 恢复上次的选择）
  type TimePreset = '5m' | '30m' | '1h' | '6h' | '12h' | '24h' | '2d' | '7d' | '30d' | 'today' | 'yesterday' | 'day_before_yesterday' | 'last_week_today' | 'custom'
  const [timePreset, setTimePresetState] = useState<TimePreset>(() => {
    try {
      const saved = localStorage.getItem(`dash_time_${dashboardId}`)
      if (saved) return (JSON.parse(saved).timePreset as TimePreset) || '6h'
    } catch {}
    return '6h'
  })
  const [customFrom, setCustomFrom] = useState(() => {
    try {
      const saved = localStorage.getItem(`dash_time_${dashboardId}`)
      if (saved) return JSON.parse(saved).customFrom || ''
    } catch {}
    return ''
  })
  const [customTo, setCustomTo] = useState(() => {
    try {
      const saved = localStorage.getItem(`dash_time_${dashboardId}`)
      if (saved) return JSON.parse(saved).customTo || ''
    } catch {}
    return ''
  })
  const [timePickerOpen, setTimePickerOpen] = useState(false)
  // 自定义时间的草稿状态：输入时只更新草稿，点击"应用"才提交
  const [draftCustomFrom, setDraftCustomFrom] = useState('')
  const [draftCustomTo, setDraftCustomTo] = useState('')

  // 打开时间选择器时，将草稿初始化为当前已保存值
  useEffect(() => {
    if (timePickerOpen) {
      setDraftCustomFrom(customFrom)
      setDraftCustomTo(customTo)
    }
  }, [timePickerOpen])

  // 持久化时间范围到 localStorage
  const setTimePreset = (preset: TimePreset) => {
    setTimePresetState(preset)
    try {
      localStorage.setItem(`dash_time_${dashboardId}`, JSON.stringify({ timePreset: preset, customFrom, customTo }))
    } catch {}
  }
  // 提交自定义时间（从草稿→正式）并持久化
  const applyCustomTime = () => {
    setCustomFrom(draftCustomFrom)
    setCustomTo(draftCustomTo)
    setTimePresetState('custom')
    try {
      localStorage.setItem(`dash_time_${dashboardId}`, JSON.stringify({ timePreset: 'custom', customFrom: draftCustomFrom, customTo: draftCustomTo }))
    } catch {}
  }

  const getTimeRangeDisplay = (): string => {
    if (timePreset === 'custom') {
      if (customFrom && customTo) {
        return `${customFrom} 至 ${customTo}`
      }
      return '自定义'
    }
    const labels: Record<TimePreset, string> = {
      '5m': '最近5分钟',
      '30m': '最近30分钟',
      '1h': '最近1小时',
      '6h': '最近6小时',
      '12h': '最近12小时',
      '24h': '最近24小时',
      '2d': '最近2天',
      '7d': '最近7天',
      '30d': '最近30天',
      'today': '今天',
      'yesterday': '昨天',
      'day_before_yesterday': '前天',
      'last_week_today': '上周今天',
      'custom': '自定义',
    }
    return labels[timePreset] || '最近6小时'
  }

  const getTimeRange = (): { from: string; to: string } | null => {
    if (timePreset === 'custom') {
      if (!customFrom && !customTo) return null
      return {
        from: customFrom ? new Date(customFrom).toISOString() : '',
        to: customTo ? new Date(customTo).toISOString() : '',
      }
    }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // 绝对时间范围（整天）
    if (timePreset === 'today') {
      return { from: today.toISOString(), to: now.toISOString() }
    }
    if (timePreset === 'yesterday') {
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
      const yesterdayEnd = new Date(today.getTime() - 1)
      return { from: yesterday.toISOString(), to: yesterdayEnd.toISOString() }
    }
    if (timePreset === 'day_before_yesterday') {
      const dayBeforeYesterday = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000)
      const dayBeforeYesterdayEnd = new Date(today.getTime() - 24 * 60 * 60 * 1000 - 1)
      return { from: dayBeforeYesterday.toISOString(), to: dayBeforeYesterdayEnd.toISOString() }
    }
    if (timePreset === 'last_week_today') {
      const lastWeekToday = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      const lastWeekTodayEnd = new Date(lastWeekToday.getTime() + 24 * 60 * 60 * 1000 - 1)
      return { from: lastWeekToday.toISOString(), to: lastWeekTodayEnd.toISOString() }
    }

    // 相对时间范围
    const to = now.toISOString()
    let ms = 0
    switch (timePreset) {
      case '5m': ms = 5 * 60 * 1000; break
      case '30m': ms = 30 * 60 * 1000; break
      case '1h': ms = 60 * 60 * 1000; break
      case '6h': ms = 6 * 60 * 60 * 1000; break
      case '12h': ms = 12 * 60 * 60 * 1000; break
      case '24h': ms = 24 * 60 * 60 * 1000; break
      case '2d': ms = 2 * 24 * 60 * 60 * 1000; break
      case '7d': ms = 7 * 24 * 60 * 60 * 1000; break
      case '30d': ms = 30 * 24 * 60 * 60 * 1000; break
      default: ms = 6 * 60 * 60 * 1000
    }
    const from = new Date(now.getTime() - ms).toISOString()
    return { from, to }
  }

  const handleTimePresetSelect = (preset: TimePreset) => {
    setTimePreset(preset)
    setTimePickerOpen(false)
    // 非自定义预设：立即触发数据刷新
    loadData()
  }

  // 应用自定义时间并关闭下拉、刷新数据
  const handleApplyCustomTime = () => {
    if (!draftCustomFrom || !draftCustomTo) return
    applyCustomTime()
    setTimePickerOpen(false)
    loadData()
  }

  // 点击外部关闭时间选择器
  useEffect(() => {
    if (!timePickerOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // 检查点击是否在时间选择器内部
      if (!target.closest('.time-picker-dropdown') && !target.closest('.time-picker-button')) {
        setTimePickerOpen(false)
      }
    }
    // 延迟添加监听器，避免当前点击事件立即触发关闭
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [timePickerOpen])

  // 加载仪表板详情和数据
  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const tr = getTimeRange()
      // 先加载变量列表，再传变量值查询数据
      const [db, varList, dsList] = await Promise.all([
        api.getDashboard(dashboardId),
        api.listVariables(dashboardId),
        api.listDatasources(),
      ])

      // 构建变量值映射（用户变量 + 系统变量）
      const varMap: Record<string, string | string[]> = {}
      varList.forEach((v) => {
        if (v.current && (v.current as any).value) {
          varMap[v.name] = (v.current as any).value
        } else if (v.default) {
          varMap[v.name] = v.default
        } else if (v.type === 'custom' && v.options?.length > 0) {
          // 自定义类型：使用第一个选项作为默认值
          const firstOpt = v.options.find((o) => o.selected) || v.options[0]
          varMap[v.name] = firstOpt.value
        }
      })
      // 合并系统内置变量（$__from, $__to 等）
      if (tr) Object.assign(varMap, api.getSystemVars(tr.from, tr.to))

      const dbData = await api.getDashboardData(dashboardId, tr?.from, tr?.to, undefined, varMap)
      setDashboard(db)
      setDataRes(dbData)
      setDatasources(dsList)
      setVariables(varList)
      // 初始化本地草稿为当前 dashboard_json 的深拷贝
      const dj = JSON.parse(JSON.stringify(db.dashboard_json || {}))
      setDraftJson(dj)
      setSavedJson(dj)
    } catch (e: any) {
      setError(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  // 用指定草稿 JSON 重新加载数据（面板编辑暂存后立即预览效果）
  const reloadDataWithDraft = async (draft: any) => {
    if (!draft) return
    try {
      const tr = getTimeRange()
      // 构建变量值映射（用户变量 + 系统变量）
      const varMap: Record<string, string | string[]> = {}
      variables.forEach((v) => {
        if (v.current && (v.current as any).value) {
          varMap[v.name] = (v.current as any).value
        } else if (v.default) {
          varMap[v.name] = v.default
        }
      })
      if (tr) Object.assign(varMap, api.getSystemVars(tr.from, tr.to))
      const dbData = await api.getDashboardData(dashboardId, tr?.from, tr?.to, draft as DashboardJSON, varMap)
      setDataRes(dbData)
    } catch (e: any) {
      // 静默失败，不影响草稿编辑
    }
  }

  useEffect(() => { loadData() }, [dashboardId])

  // 使用本地草稿渲染面板（必须在条件返回前，保证 hooks 顺序一致）
  const { dj, panels, displayTitle } = useMemo(() => {
    const d = draftJson || (dashboard?.dashboard_json as any) || {}
    return {
      dj: d,
      panels: (d.panels || []) as any[],
      displayTitle: (d.title || dashboard?.title || '') as string,
    }
  }, [draftJson, dashboard])

  // 建立 panel_id → 图表类型 的映射，用于时间范围过滤
  const panelTypeMap = useMemo(() => {
    const map = new Map<string, string>()
    panels.forEach((p: any) => { if (p.id) map.set(p.id, p.type) })
    return map
  }, [panels])

  const { dataMap, columnMap } = useMemo(() => {
    const dMap = new Map<string, MetricRow[][]>()
    const cMap = new Map<string, string[]>()
    if (dataRes?.panels_data) {
      const tr = getTimeRange()
      const fromMs = tr ? new Date(tr.from).getTime() : 0
      const toMs = tr ? new Date(tr.to).getTime() : Infinity

      dataRes.panels_data.forEach((pd) => {
        const pType = panelTypeMap.get(pd.panel_id)
        const shouldFilter = pType === 'line' && tr

        const filtered = shouldFilter
          ? (pd.target || []).map((rows) => {
              if (rows.length === 0) return rows
              const dateCol = Object.keys(rows[0]).find((k) => {
                const kl = k.toLowerCase()
                return kl.includes('date') || kl.includes('time') || kl.includes('日期') || kl.includes('时间') || kl === 'day'
              })
              if (!dateCol) return rows
              return rows.filter((row: any) => {
                const val = row[dateCol]
                if (!val) return false
                const t = new Date(val).getTime()
                return !isNaN(t) && t >= fromMs && t <= toMs
              })
            })
          : (pd.target || [])

        dMap.set(pd.panel_id, filtered)
        cMap.set(pd.panel_id, pd.columns || [])
      })
    }
    return { dataMap: dMap, columnMap: cMap }
  }, [dataRes, panelTypeMap, timePreset, customFrom, customTo])

  const renderPanelContent = (panel: any, _style: React.CSSProperties) => {
    const panelData = dataMap.get(panel.id) || []
    return (
      <ChartPanel
        type={panel.type || 'table'}
        title={panel.title || '未命名'}
        data={panelData}
        targets={panel.targets || []}
        options={panel.options}
        columns={columnMap.get(panel.id)}
        dataLinks={panel.dataLinks}
        menuOpen={openMenuId === panel.id}
        onToggleMenu={() => toggleMenu(panel.id)}
        onEdit={() => handleEditPanel(panel.id)}
        onRemove={() => handleRemovePanel(panel.id)}
      />
    )
  }

  const toggleMenu = (panelId: string) => {
    setOpenMenuId((prev) => (prev === panelId ? null : panelId))
  }

  // ---- 工具栏：保存仪表板（将草稿持久化到后端） ----
  const handleSaveDashboard = async () => {
    if (!dashboard || !draftJson) return
    setSaving(true)
    try {
      const title = draftJson.title || dashboard.title
      await api.updateDashboard(dashboard.id, title, dashboard.folder_id, draftJson as DashboardJSON)
      // 保存成功后更新快照
      const saved = JSON.parse(JSON.stringify(draftJson))
      setSavedJson(saved)
      // 同步更新 dashboard 的 title（若标题变化）
      if (title !== dashboard.title) {
        setDashboard({ ...dashboard, title, dashboard_json: saved })
      }
      // 不重新加载变量，保留用户当前选择的变量值
      // 只重新加载仪表盘数据（使用当前变量和时间范围）
      const tr = getTimeRange()
      const varMap: Record<string, string | string[]> = {}
      variables.forEach((v) => {
        if (v.current && (v.current as any).value) {
          varMap[v.name] = (v.current as any).value
        } else if (v.default) {
          varMap[v.name] = v.default
        }
      })
      if (tr) Object.assign(varMap, api.getSystemVars(tr.from, tr.to))
      const dbData = await api.getDashboardData(dashboardId, tr?.from, tr?.to, undefined, varMap)
      setDataRes(dbData)
    } catch (e: any) {
      alert('保存失败: ' + (e.message || e))
    } finally {
      setSaving(false)
    }
  }

  // ---- 单面板编辑：导航到全屏编辑页面 ----
  const handleEditPanel = (panelId: string) => {
    setOpenMenuId(null)
    const panels: any[] = draftJson?.panels || []
    const panel = panels.find((p: any) => p.id === panelId)
    if (panel && onEditPanel) {
      onEditPanel({
        panel: panel as PanelDef,
        dashboardId,
        datasources,
        draftJson,
        panelsData: dataRes?.panels_data,
        variables,
        timePreset,
        customFrom,
        customTo,
        onSave: (updated: PanelDef) => {
          // 更新本地草稿
          const newPanels: any[] = [...(draftJson?.panels || [])]
          const idx = newPanels.findIndex((p: any) => p.id === updated.id)
          if (idx >= 0) newPanels[idx] = updated
          const newDraft = { ...draftJson, panels: newPanels }
          setDraftJson(newDraft)
          // 用新草稿 JSON 立即查询面板数据，实现预览
          reloadDataWithDraft(newDraft)
        },
      })
    }
  }

  // ---- 仪表盘编辑器保存 ----
  const handleEditorSave = async (updated: DashboardJSON) => {
    setDraftJson(updated)
    // 重新加载变量列表
    try {
      const varList = await api.listVariables(dashboardId)
      setVariables(varList.sort((a, b) => a.sort_order - b.sort_order))
    } catch {}
  }

  // ---- 添加面板（仅修改本地草稿） ----
  const handleAddPanel = () => {
    setShowNewPanel(false)
    const panels: any[] = [...(draftJson?.panels || [])]
    const ds = datasources[0]
    // 自动计算新面板的 y 位置：放在已有面板最下方
    const maxY = panels.reduce((max, p) => {
      const bottom = (p.gridPos?.y || 0) + (p.gridPos?.h || 8)
      return bottom > max ? bottom : max
    }, 0)
    panels.push({
      id: uid('panel'),
      title: '新面板',
      type: 'table',
      gridPos: { x: 0, y: maxY, w: 24, h: 8 },
      datasource_id: ds?.id,
      targets: [{ refId: 'A', rawSql: 'SELECT 1', aliasMap: {}, category: '', metricName: '' }],
      options: {},
    })
    setDraftJson({ ...draftJson, panels })
  }

  // ---- 删除面板（仅修改本地草稿） ----
  const handleRemovePanel = (panelId: string) => {
    const newPanels = (draftJson?.panels || []).filter((p: any) => p.id !== panelId)
    setDraftJson({ ...draftJson, panels: newPanels })
    setOpenMenuId(null)
  }

  // ---- 处理布局变化（拖拽/调整大小） ----
  const handleLayoutChange = (updatedPanels: any[]) => {
    setDraftJson({ ...draftJson, panels: updatedPanels })
  }

  // ---- 处理变量值变化 ----
  const handleVariableChange = async (variableId: string, value: string | string[]) => {
    // 找到当前变量，更新 current 值
    const currentVar = variables.find((v) => v.id === variableId)
    if (!currentVar) return

    const text = Array.isArray(value)
      ? value.map((val) => currentVar.options.find((o) => o.value === val)?.text || val)
      : (currentVar.options.find((o) => o.value === value)?.text || value)

    const updatedVar = {
      ...currentVar,
      current: { text: text as any, value: value as any },
    }

    // 更新本地变量状态
    const updatedVars = variables.map((v) => v.id === variableId ? updatedVar : v)
    setVariables(updatedVars)

    // 保存变量到后端（传递完整数据）
    try {
      await api.updateVariable(variableId, {
        dashboard_id: dashboardId,
        name: updatedVar.name,
        type: updatedVar.type,
        label: updatedVar.label,
        description: updatedVar.description,
        options: updatedVar.options,
        query: updatedVar.query,
        datasource_id: updatedVar.datasource_id,
        default: updatedVar.default,
        current: updatedVar.current,
        multi: updatedVar.multi,
        include_all: updatedVar.include_all,
        all_value: updatedVar.all_value,
        sort_order: updatedVar.sort_order,
      })
    } catch {}

    // 构建变量值映射传给后端（用户变量 + 系统变量）
    const varMap: Record<string, string | string[]> = {}
    updatedVars.forEach((v) => {
      if (v.current) {
        varMap[v.name] = (v.current as any).value
      } else if (v.default) {
        varMap[v.name] = v.default
      }
    })

    // 用变量值重新加载数据（不调 loadData 以避免覆盖本地变量状态）
    try {
      const tr = getTimeRange()
      if (tr) Object.assign(varMap, api.getSystemVars(tr.from, tr.to))
      const dbData = await api.getDashboardData(dashboardId, tr?.from, tr?.to, undefined, varMap)
      setDataRes(dbData)
    } catch (e: any) {
      console.error('重新加载数据失败:', e)
    }
  }

  if (loading) {
    return (
      <div className="dashboard-view">
        <div className="dashboard-toolbar">
          <div className="toolbar-left"><button className="btn-sm" onClick={onBack}>← 返回</button></div>
        </div>
        <div className="empty-state">加载中...</div>
      </div>
    )
  }

  if (error || !dashboard) {
    return (
      <div className="dashboard-view">
        <div className="dashboard-toolbar">
          <div className="toolbar-left"><button className="btn-sm" onClick={onBack}>← 返回</button></div>
        </div>
        <div className="empty-state" style={{ color: 'var(--red)' }}>{error || '仪表板不存在'}</div>
      </div>
    )
  }

  return (
    <div className="dashboard-view">
      {/* ---- Toolbar ---- */}
      <div className="dashboard-toolbar">
        <div className="toolbar-left">
          <button className="btn-sm" onClick={onBack}>← 返回</button>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{displayTitle}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{panels.length} 个面板</span>
          {hasUnsaved && (
            <span style={{
              fontSize: 11, color: '#f5a623', background: 'rgba(245,166,35,0.12)',
              padding: '1px 6px', borderRadius: 3, fontWeight: 500,
            }}>未保存</span>
          )}
        </div>
        <div className="toolbar-right">
          {/* 时间范围选择器 - 类似 Grafana 风格 */}
          <div style={{ position: 'relative', marginRight: 12 }}>
            <button
              className="btn-sm time-picker-button"
              onClick={() => setTimePickerOpen(!timePickerOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span>🕐</span>
              <span>{getTimeRangeDisplay()}</span>
              <span style={{ fontSize: 10 }}>▼</span>
            </button>
            {timePickerOpen && (
              <div
                className="time-picker-dropdown"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 4,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                  zIndex: 1000,
                  minWidth: 280,
                  padding: 12,
                }}
              >
                {/* 相对时间范围 */}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600 }}>相对时间范围</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  {[
                    { key: '5m', label: '5分钟' },
                    { key: '30m', label: '30分钟' },
                    { key: '1h', label: '1小时' },
                    { key: '6h', label: '6小时' },
                    { key: '12h', label: '12小时' },
                    { key: '24h', label: '24小时' },
                    { key: '2d', label: '2天' },
                    { key: '7d', label: '7天' },
                    { key: '30d', label: '30天' },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => handleTimePresetSelect(opt.key as TimePreset)}
                      style={{
                        padding: '8px 12px',
                        fontSize: 12,
                        background: timePreset === opt.key ? 'var(--primary)' : 'var(--bg-input)',
                        color: timePreset === opt.key ? '#fff' : 'var(--text-primary)',
                        border: '1px solid',
                        borderColor: timePreset === opt.key ? 'var(--primary)' : 'var(--border-color)',
                        borderRadius: 6,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* 分隔线 */}
                <div style={{ height: 1, background: 'var(--border-color)', margin: '12px 0' }} />

                {/* 绝对时间范围 */}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600 }}>绝对时间范围</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {[
                    { key: 'today', label: '今天' },
                    { key: 'yesterday', label: '昨天' },
                    { key: 'day_before_yesterday', label: '前天' },
                    { key: 'last_week_today', label: '上周今天' },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => handleTimePresetSelect(opt.key as TimePreset)}
                      style={{
                        padding: '8px 12px',
                        fontSize: 12,
                        background: timePreset === opt.key ? 'var(--primary)' : 'var(--bg-input)',
                        color: timePreset === opt.key ? '#fff' : 'var(--text-primary)',
                        border: '1px solid',
                        borderColor: timePreset === opt.key ? 'var(--primary)' : 'var(--border-color)',
                        borderRadius: 6,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* 分隔线 */}
                <div style={{ height: 1, background: 'var(--border-color)', margin: '12px 0' }} />

                {/* 自定义时间范围 */}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600 }}>自定义时间范围</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 32 }}>从</span>
                    <input
                      type="datetime-local"
                      value={draftCustomFrom}
                      onChange={(e) => setDraftCustomFrom(e.target.value)}
                      style={{
                        fontSize: 12,
                        padding: '6px 10px',
                        flex: 1,
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 6,
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 32 }}>至</span>
                    <input
                      type="datetime-local"
                      value={draftCustomTo}
                      onChange={(e) => setDraftCustomTo(e.target.value)}
                      style={{
                        fontSize: 12,
                        padding: '6px 10px',
                        flex: 1,
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 6,
                      }}
                    />
                  </div>
                  {/* 应用按钮：只有点击这里才会提交自定义时间并刷新数据 */}
                  <button
                    onClick={handleApplyCustomTime}
                    disabled={!draftCustomFrom || !draftCustomTo}
                    style={{
                      padding: '8px 16px',
                      fontSize: 12,
                      background: draftCustomFrom && draftCustomTo ? 'var(--primary)' : 'var(--bg-input)',
                      color: draftCustomFrom && draftCustomTo ? '#fff' : 'var(--text-muted)',
                      border: '1px solid',
                      borderColor: draftCustomFrom && draftCustomTo ? 'var(--primary)' : 'var(--border-color)',
                      borderRadius: 6,
                      cursor: draftCustomFrom && draftCustomTo ? 'pointer' : 'not-allowed',
                      transition: 'all 0.15s',
                    }}
                  >
                    应用时间范围
                  </button>
                  {/* 显示当前时间范围摘要 */}
                  {timePreset === 'custom' && customFrom && customTo && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 10px', background: 'var(--bg-input)', borderRadius: 6 }}>
                      {new Date(customFrom).toLocaleString('zh-CN')} → {new Date(customTo).toLocaleString('zh-CN')}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <button className="btn-sm" onClick={() => setShowNewPanel(true)}>+ 添加面板</button>
          <button className="btn-sm" onClick={() => setShowEditor(true)} title="编辑仪表盘">&#x270E; 编辑仪表盘</button>
          <button className="btn-sm" onClick={() => setShowJson(true)} title="查看仪表板JSON">{'{ }'} 查看JSON</button>
          <button className="btn-sm" onClick={handleExportImage} disabled={exporting} title="导出仪表板为PNG图像">
            {exporting ? '导出中...' : '📷 导出图像'}
          </button>
          <button className="btn-sm" onClick={() => { setSnapName(''); setSnapModalOpen(true); loadSnapshots() }} title="创建仪表盘快照">
            📸 创建快照
          </button>
          <button className="btn-sm" onClick={() => setShowVersionHistory(true)} title="查看版本历史">
            📜 版本历史
          </button>
          <button className="btn-sm" onClick={loadData} title="刷新数据">&#x1F504; 刷新</button>
          <button className="btn-sm" onClick={() => setChatOpen(!chatOpen)} title="AI 智能助手"
            style={chatOpen ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : undefined}
          >{chatOpen ? '✕ 关闭AI' : '💬 AI 助手'}</button>
          {/* 保存按钮：有未保存变更时高亮 */}
          <button
            className="btn-sm"
            onClick={handleSaveDashboard}
            disabled={saving}
            title="保存仪表板（将所有面板变更持久化）"
            style={hasUnsaved ? {
              background: 'var(--primary)',
              color: '#fff',
              borderColor: 'var(--primary)',
              fontWeight: 600,
            } : undefined}
          >
            {saving ? '保存中...' : hasUnsaved ? '\u{1F4BE} 保存仪表板' : '保存仪表板'}
          </button>
        </div>
      </div>

      {/* ---- 变量选择器 ---- */}
      {variables.length > 0 && (
        <VariableSelector
          variables={variables}
          onChange={handleVariableChange}
        />
      )}

      {/* ---- 仪表盘编辑器（包含变量管理） ---- */}
      {showEditor && (
        <DashboardEditor
          title={displayTitle}
          json={draftJson as DashboardJSON}
          dashboardId={dashboardId}
          onSave={handleEditorSave}
          onClose={() => setShowEditor(false)}
        />
      )}

      {/* ---- 创建快照 Modal ---- */}
      {snapModalOpen && (
        <div className="modal-overlay" onClick={() => setSnapModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
            <div className="modal-header">
              <h2>创建仪表盘快照</h2>
              <button className="modal-close" onClick={() => setSnapModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflow: 'auto' }}>
              <div className="form-group">
                <label>快照名称（可选）</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={snapName} onChange={(e) => setSnapName(e.target.value)} placeholder={`${displayTitle || '仪表盘'} 快照`} autoFocus style={{ flex: 1 }} />
                  <button className="btn-primary" onClick={handleCreateDashboardSnapshot} disabled={snapping} style={{ whiteSpace: 'nowrap' }}>
                    {snapping ? '创建中...' : '创建快照'}
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
                快照将保存当前仪表盘中所有面板的数据和配置。
              </div>

              <div>
                <h4 style={{ marginBottom: 8, fontSize: 14 }}>
                  已有快照 {snapshots.length > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({snapshots.length})</span>}
                </h4>
                {snapLoading ? (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>加载中...</div>
                ) : snapshots.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                    暂无快照，输入名称后点击"创建快照"保存当前状态
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {snapshots.map((snap) => (
                      <div key={snap.snapshot_key} style={{
                        border: '1px solid var(--border-color)', borderRadius: 6, padding: '10px 12px',
                        display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {snap.name || '未命名快照'}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {shareLink}{snap.snapshot_key}
                          </div>
                        </div>
                        <button className="btn-sm"
                          onClick={() => window.open(`/snapshot/${snap.snapshot_key}`, '_blank')}
                          style={{ fontSize: 11, whiteSpace: 'nowrap', padding: '4px 10px' }}>
                          查看
                        </button>
                        <button className="btn-sm"
                          onClick={() => { navigator.clipboard.writeText(`${shareLink}${snap.snapshot_key}`); setCopiedKey(snap.snapshot_key); setTimeout(() => setCopiedKey(null), 2000) }}
                          style={{ fontSize: 11, whiteSpace: 'nowrap', padding: '4px 10px' }}>
                          {copiedKey === snap.snapshot_key ? '已复制' : '复制链接'}
                        </button>
                        <button className="btn-sm"
                          onClick={() => handleDeleteSnapshot(snap.snapshot_key)}
                          style={{ fontSize: 11, color: 'var(--red)', borderColor: 'transparent', padding: '4px 8px' }}>
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSnapModalOpen(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- 版本历史 ---- */}
      {showVersionHistory && (
        <VersionHistory
          dashboardId={dashboardId}
          onClose={() => setShowVersionHistory(false)}
          onRestore={() => {
            loadData()
            setDraftJson(null)
          }}
        />
      )}

      {/* ---- 添加面板确认 ---- */}
      {showNewPanel && (
        <div className="modal-overlay" onClick={() => setShowNewPanel(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
            <div className="modal-header">
              <h2>添加面板</h2>
              <button className="modal-close" onClick={() => setShowNewPanel(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                将在当前仪表板中新增一个空面板，添加后面板以 🖉 标记在编辑状态，点击右上角"保存仪表板"后生效。
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowNewPanel(false)}>取消</button>
              <button className="btn-primary" onClick={handleAddPanel}>添加</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- JSON Viewer ---- */}
      {showJson && (
        <div className="modal-overlay" onClick={() => setShowJson(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 700, maxHeight: '85vh' }}>
            <div className="modal-header">
              <h2>仪表板JSON定义（当前草稿）</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-sm primary" onClick={() => navigator.clipboard.writeText(JSON.stringify(dj, null, 2))}>复制</button>
                <button className="modal-close" onClick={() => setShowJson(false)}>&times;</button>
              </div>
            </div>
            <div className="modal-body">
              <pre style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', padding: 16, borderRadius: 4, overflow: 'auto', maxHeight: '60vh', fontSize: 12, lineHeight: 1.6, fontFamily: 'monospace' }}>
                {JSON.stringify(dj, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ---- Canvas ---- */}
      <div ref={wrapperRef} style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div className="dashboard-canvas" ref={canvasRef} style={{ flex: 1, overflow: 'auto', padding: '16px 20px 32px' }}>
          {panels.length > 0 ? (
            exporting ? (
              /* 导出时使用静态布局（CSS Grid），html2canvas 对绝对定位渲染有问题 */
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(24, 1fr)',
                gap: 8,
                gridAutoRows: 'minmax(30px, auto)',
              }}>
                {panels.map((panel: any) => {
                  const pos = panel.gridPos || { x: 0, y: 0, w: 12, h: 8 }
                  const panelData = dataMap.get(panel.id) || []
                  // 计算面板高度：h 行 * 30px + (h-1) * 8px gap
                  const panelHeight = pos.h * 30 + (pos.h - 1) * 8
                  return (
                    <div key={panel.id} style={{
                      gridColumn: `${pos.x + 1} / span ${pos.w}`,
                      gridRow: `${pos.y + 1} / span ${pos.h}`,
                      background: 'var(--bg-panel)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 3,
                      overflow: 'hidden',
                      height: panelHeight,
                      display: 'flex',
                      flexDirection: 'column',
                    }}>
                      <ChartPanel
                        type={panel.type || 'table'}
                        title={panel.title || '未命名'}
                        data={panelData}
                        targets={panel.targets || []}
                        options={panel.options}
                        columns={columnMap.get(panel.id)}
                        dataLinks={panel.dataLinks}
                        menuOpen={false}
                        onToggleMenu={() => {}}
                        onEdit={() => {}}
                        onRemove={() => {}}
                        showMenu={false}
                      />
                    </div>
                  )
                })}
              </div>
            ) : (
              <GridLayout
                panels={panels}
                onChange={handleLayoutChange}
                rowHeight={30}
                cols={24}
                gap={8}
                editable={true}
              >
                {renderPanelContent}
              </GridLayout>
            )
          ) : (
            <div className="add-panel-zone">
              <span style={{ color: 'var(--text-muted)' }}>此仪表板暂无面板，点击"+ 添加面板"开始创建</span>
            </div>
          )}
        </div>

        {/* AI 聊天侧边栏 */}
        <div style={{
            width: chatOpen ? 380 : 0, flexShrink: 0,
            borderLeft: chatOpen ? '1px solid var(--border-color)' : 'none',
            overflow: 'hidden',
            transition: 'width 0.2s',
          }}>
            <AIChatDialog
              visible={chatOpen}
              dashboardId={dashboardId}
              dashboardTitle={displayTitle}
              panelsSummary={panels.map((p: any) => ({
                id: p.id,
                title: p.title,
                type: p.type,
              }))}
              draftJson={draftJson}
              onDraftUpdate={handleDraftUpdate}
            />
          </div>
      </div>
    </div>
  )
}
