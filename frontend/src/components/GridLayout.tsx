import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

interface GridPos { x: number; y: number; w: number; h: number }
interface PanelItem { id: string; gridPos: GridPos; [key: string]: any }

interface GridLayoutProps {
  panels: PanelItem[]
  onChange: (panels: PanelItem[]) => void
  rowHeight?: number // 每行高度（像素）
  cols?: number // 网格列数（默认 24）
  gap?: number // 网格间距
  editable?: boolean // 是否可编辑
  children: (panel: PanelItem, style: React.CSSProperties) => React.ReactNode
}

export default function GridLayout({
  panels,
  onChange,
  rowHeight = 60,
  cols = 24,
  gap = 12,
  editable = true,
  children,
}: GridLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [dragging, setDragging] = useState<{ 
    panelId: string; 
    startX: number; 
    startY: number; 
    startPos: GridPos; 
    type: 'move' | 'resize' 
  } | null>(null)
  // 拖拽过程中的临时位置（用于预览）
  const [tempPos, setTempPos] = useState<GridPos | null>(null)
  // 拖拽过程中被推挤面板的临时位置（resize 时 Grafana 风格推挤预览）
  const [pushedPositions, setPushedPositions] = useState<Record<string, GridPos> | null>(null)

  // 计算容器宽度
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth)
      }
    }
    updateWidth()
    
    // 使用 ResizeObserver 监听容器尺寸变化（包括 AI 对话框打开/关闭）
    const resizeObserver = new ResizeObserver(() => {
      updateWidth()
    })
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    
    window.addEventListener('resize', updateWidth)
    
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateWidth)
    }
  }, [])

  // 计算每个单元格宽度（containerWidth 为 0 时使用估算值）
  const cellWidth = containerWidth > 0 ? (containerWidth - gap * (cols - 1)) / cols : 50

  // 计算面板位置样式
  const calcStyle = useCallback((pos: GridPos): React.CSSProperties => {
    const left = pos.x * cellWidth + pos.x * gap
    const top = pos.y * rowHeight + pos.y * gap
    const width = pos.w * cellWidth + (pos.w - 1) * gap
    const height = pos.h * rowHeight + (pos.h - 1) * gap
    return {
      position: 'absolute',
      left: left + 'px',
      top: top + 'px',
      width: width + 'px',
      height: height + 'px',
    }
  }, [cellWidth, rowHeight, gap])

  // 碰撞检测：两矩形是否重叠
  const overlaps = useCallback((a: GridPos, b: GridPos): boolean => {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    )
  }, [])

  // Grafana 风格推挤：把 movingId 面板放到 newPos 后，其余面板被往下推挤直到无碰撞。
  // 返回除 movingId 外所有面板的推挤后位置（不修改原 panels）。
  const computePushedLayout = useCallback((movingId: string, newPos: GridPos, allPanels: PanelItem[]): Record<string, GridPos> => {
    const others = allPanels
      .filter(p => p.id !== movingId)
      .map(p => ({ id: p.id, pos: { ...p.gridPos } }))

    let changed = true
    while (changed) {
      changed = false
      // 1. 被 moving 面板占位，压住的面板往下推
      for (const o of others) {
        if (overlaps(newPos, o.pos)) {
          const pushY = newPos.y + newPos.h
          if (o.pos.y < pushY) { o.pos.y = pushY; changed = true }
        }
      }
      // 2. 面板之间连锁推挤（按 y 从小到大依次处理）
      others.sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x)
      for (let i = 1; i < others.length; i++) {
        for (let j = 0; j < i; j++) {
          if (overlaps(others[j].pos, others[i].pos)) {
            const pushY = others[j].pos.y + others[j].pos.h
            if (others[i].pos.y < pushY) { others[i].pos.y = pushY; changed = true }
          }
        }
      }
    }

    const map: Record<string, GridPos> = {}
    others.forEach(o => { map[o.id] = o.pos })
    return map
  }, [overlaps])

  // 计算与 pos 重叠面积最大的面板（交换目标）
  const findSwapTarget = useCallback((pos: GridPos, allPanels: PanelItem[], movingId: string): string | null => {
    let target: string | null = null
    let maxOverlap = 0
    for (const p of allPanels) {
      if (p.id === movingId) continue
      if (overlaps(pos, p.gridPos)) {
        const ox = Math.min(pos.x + pos.w, p.gridPos.x + p.gridPos.w) - Math.max(pos.x, p.gridPos.x)
        const oy = Math.min(pos.y + pos.h, p.gridPos.y + p.gridPos.h) - Math.max(pos.y, p.gridPos.y)
        const area = ox * oy
        if (area > maxOverlap) { maxOverlap = area; target = p.id }
      }
    }
    return target
  }, [overlaps])

  // 开始拖拽
  const handleDragStart = (panelId: string, e: React.MouseEvent) => {
    if (!editable) return
    const panel = panels.find(p => p.id === panelId)
    if (!panel) return
    setDragging({
      panelId,
      startX: e.clientX,
      startY: e.clientY,
      startPos: panel.gridPos,
      type: 'move',
    })
    setTempPos(null)
    setPushedPositions(null)
    e.preventDefault()
  }

  // 开始调整大小
  const handleResizeStart = (panelId: string, _edge: 'right' | 'bottom' | 'bottom-right', e: React.MouseEvent) => {
    if (!editable) return
    const panel = panels.find(p => p.id === panelId)
    if (!panel) return
    setDragging({
      panelId,
      startX: e.clientX,
      startY: e.clientY,
      startPos: panel.gridPos,
      type: 'resize',
    })
    setTempPos(null)
    setPushedPositions(null)
    e.preventDefault()
    e.stopPropagation()
  }

  // 拖拽移动（只预览，不实际更新 panels，Grafana 风格实时推挤）
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging || !containerRef.current) return

    const panel = panels.find(p => p.id === dragging.panelId)
    if (!panel) return

    let newPos: GridPos

    if (dragging.type === 'move') {
      // 拖动：像素级平滑跟随鼠标（浮点网格位置，不做吸附），交换目标仅用于预览占位
      const deltaX = e.clientX - dragging.startX
      const deltaY = e.clientY - dragging.startY
      let newX = dragging.startPos.x + deltaX / (cellWidth + gap)
      let newY = dragging.startPos.y + deltaY / (rowHeight + gap)
      newX = Math.max(0, Math.min(cols - panel.gridPos.w, newX))
      newY = Math.max(0, newY)
      newPos = { ...panel.gridPos, x: newX, y: newY }
    } else {
      const deltaX = e.clientX - dragging.startX
      const deltaY = e.clientY - dragging.startY
      const gridDeltaW = Math.round(deltaX / (cellWidth + gap))
      const gridDeltaH = Math.round(deltaY / (rowHeight + gap))
      let newW = dragging.startPos.w + gridDeltaW
      let newH = dragging.startPos.h + gridDeltaH
      newW = Math.max(2, Math.min(cols - panel.gridPos.x, newW))
      newH = Math.max(2, newH)
      newPos = { ...panel.gridPos, w: newW, h: newH }
    }

    setTempPos(newPos)
    if (dragging.type === 'move') {
      // 拖动：面板始终跟随鼠标，不预览交换；松手时才计算交换位置
      setPushedPositions(null)
    } else {
      // 拉伸：保持 Grafana 风格推挤
      setPushedPositions(computePushedLayout(dragging.panelId, newPos, panels))
    }
  }, [dragging, panels, cellWidth, rowHeight, gap, cols, computePushedLayout])

  // 拖拽结束（应用推挤后的最终布局）
  const handleMouseUp = useCallback(() => {
    if (!dragging) return

    const panel = panels.find(p => p.id === dragging.panelId)
    if (!panel || !tempPos) {
      setDragging(null)
      setTempPos(null)
      setPushedPositions(null)
      return
    }

    // 拖动结束时吸附到网格
    const snappedPos: GridPos = dragging.type === 'move'
      ? { ...tempPos, x: Math.round(tempPos.x), y: Math.round(tempPos.y) }
      : tempPos

    // 被拖拽面板放置：move 有交换目标时完全占住目标原位置（避免部分重叠）；否则放吸附后的位置
    // move：交换目标面板回到被拖拽面板的原位置；resize：其余面板应用推挤后的位置
    const targetPanel = dragging.type === 'move'
      ? panels.find(p => p.id === findSwapTarget(snappedPos, panels, dragging.panelId))
      : null
    const newPanels = panels.map(p => {
      if (p.id === dragging.panelId) return { ...p, gridPos: targetPanel ? targetPanel.gridPos : snappedPos }
      if (dragging.type === 'move') {
        return targetPanel && targetPanel.id === p.id ? { ...p, gridPos: dragging.startPos } : p
      }
      const pushed = pushedPositions?.[p.id]
      return pushed ? { ...p, gridPos: pushed } : p
    })
    onChange(newPanels)

    setDragging(null)
    setTempPos(null)
    setPushedPositions(null)
  }, [dragging, tempPos, pushedPositions, panels, onChange, findSwapTarget])

  // 绑定全局事件
  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [dragging, handleMouseMove, handleMouseUp])

  // 计算容器高度
  const containerHeight = useMemo(() => {
    const maxY = panels.reduce((max, p) => Math.max(max, p.gridPos.y + p.gridPos.h), 0)
    return (maxY + 1) * rowHeight + maxY * gap + 20
  }, [panels, rowHeight, gap])

  return (
    <div
      ref={containerRef}
      className="grid-layout-container"
      style={{
        position: 'relative',
        minHeight: containerHeight + 'px',
        width: '100%',
      }}
    >
      {panels.map(panel => {
        // 正在拖拽的面板始终跟随鼠标（tempPos）；resize 时被推挤面板使用推挤位置预览
        const isDraggingThis = dragging?.panelId === panel.id
        const displayPos = isDraggingThis
          ? (tempPos ?? panel.gridPos)
          : (pushedPositions?.[panel.id] ?? panel.gridPos)
        const style = calcStyle(displayPos)

        return (
          <div
            key={panel.id}
            className={`grid-layout-item ${isDraggingThis ? 'dragging' : ''}`}
            style={{
              ...style,
              cursor: editable ? 'move' : 'default',
              zIndex: isDraggingThis ? 100 : 1,
              boxShadow: isDraggingThis ? '0 8px 24px rgba(0,0,0,0.18)' : undefined,
              transition: isDraggingThis ? 'none' : 'left 0.3s, top 0.3s, width 0.3s, height 0.3s',
            }}
            onMouseDown={(e) => handleDragStart(panel.id, e)}
          >
            {children(panel, style)}
            {/* 调整大小手柄 */}
            {editable && (
              <>
                {/* 右边缘 */}
                <div
                  className="grid-resize-handle right"
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '20%',
                    bottom: '20%',
                    width: 6,
                    cursor: 'ew-resize',
                    zIndex: 10,
                  }}
                  onMouseDown={(e) => handleResizeStart(panel.id, 'right', e)}
                />
                {/* 底边缘 */}
                <div
                  className="grid-resize-handle bottom"
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: '20%',
                    right: '20%',
                    height: 6,
                    cursor: 'ns-resize',
                    zIndex: 10,
                  }}
                  onMouseDown={(e) => handleResizeStart(panel.id, 'bottom', e)}
                />
                {/* 右下角 */}
                <div
                  className="grid-resize-handle bottom-right"
                  style={{
                    position: 'absolute',
                    right: 0,
                    bottom: 0,
                    width: 12,
                    height: 12,
                    cursor: 'nwse-resize',
                    zIndex: 11,
                  }}
                  onMouseDown={(e) => handleResizeStart(panel.id, 'bottom-right', e)}
                />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}