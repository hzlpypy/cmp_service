import { useState, useRef, useEffect, useCallback } from 'react'

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
  // 拖拽过程中碰撞的面板ID（用于交换）
  const [swapTargetId, setSwapTargetId] = useState<string | null>(null)

  // 计算容器宽度
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth)
      }
    }
    updateWidth()
    // 使用 setTimeout 确保 DOM 已渲染
    setTimeout(updateWidth, 100)
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
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

  // 碰撞检测：检查新位置是否与其他面板冲突，返回碰撞的面板
  const findCollisionPanel = useCallback((panelId: string, newPos: GridPos, currentPanels: PanelItem[]): PanelItem | null => {
    for (const p of currentPanels) {
      if (p.id === panelId) continue
      const pPos = p.gridPos
      // 检查是否重叠
      if (
        newPos.x < pPos.x + pPos.w &&
        newPos.x + newPos.w > pPos.x &&
        newPos.y < pPos.y + pPos.h &&
        newPos.y + newPos.h > pPos.y
      ) {
        return p
      }
    }
    return null
  }, [])

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
    setSwapTargetId(null)
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
    e.preventDefault()
    e.stopPropagation()
  }

  // 拖拽移动（只预览，不实际更新 panels）
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging || !containerRef.current) return

    const panel = panels.find(p => p.id === dragging.panelId)
    if (!panel) return

    if (dragging.type === 'move') {
      // 计算移动距离
      const deltaX = e.clientX - dragging.startX
      const deltaY = e.clientY - dragging.startY
      // 计算新网格位置
      const gridDeltaX = Math.round(deltaX / (cellWidth + gap))
      const gridDeltaY = Math.round(deltaY / (rowHeight + gap))
      let newX = dragging.startPos.x + gridDeltaX
      let newY = dragging.startPos.y + gridDeltaY
      // 边界检查
      newX = Math.max(0, Math.min(cols - panel.gridPos.w, newX))
      newY = Math.max(0, newY)
      
      const newPos = { ...panel.gridPos, x: newX, y: newY }
      
      // 检查是否有碰撞
      const collisionPanel = findCollisionPanel(dragging.panelId, newPos, panels)
      
      if (collisionPanel) {
        // 有碰撞，记录碰撞面板ID，用于拖拽结束时交换
        setSwapTargetId(collisionPanel.id)
        setTempPos(newPos)
      } else {
        // 没有碰撞
        setSwapTargetId(null)
        setTempPos(newPos)
      }
    } else if (dragging.type === 'resize') {
      // 计算调整大小
      const deltaX = e.clientX - dragging.startX
      const deltaY = e.clientY - dragging.startY
      const gridDeltaW = Math.round(deltaX / (cellWidth + gap))
      const gridDeltaH = Math.round(deltaY / (rowHeight + gap))
      let newW = dragging.startPos.w + gridDeltaW
      let newH = dragging.startPos.h + gridDeltaH
      // 边界检查
      newW = Math.max(2, Math.min(cols - panel.gridPos.x, newW))
      newH = Math.max(2, newH)
      setTempPos({ ...panel.gridPos, w: newW, h: newH })
    }
  }, [dragging, panels, cellWidth, rowHeight, gap, cols, findCollisionPanel])

  // 拖拽结束（执行实际的位置更新或交换）
  const handleMouseUp = useCallback(() => {
    if (!dragging) return
    
    const panel = panels.find(p => p.id === dragging.panelId)
    if (!panel) {
      setDragging(null)
      setTempPos(null)
      setSwapTargetId(null)
      return
    }
    
    if (dragging.type === 'move' && tempPos) {
      if (swapTargetId) {
        // 有碰撞，检查交换是否安全
        const originalPos = dragging.startPos
        const swapTargetPanel = panels.find(p => p.id === swapTargetId)
        
        if (swapTargetPanel) {
          // 模拟交换后的状态
          const simulatedPanels = panels.map(p => {
            if (p.id === dragging.panelId) {
              return { ...p, gridPos: tempPos }
            }
            if (p.id === swapTargetId) {
              return { ...p, gridPos: originalPos }
            }
            return p
          })
          
          // 检查交换后的整体布局是否有任何碰撞
          let hasCollision = false
          for (let i = 0; i < simulatedPanels.length; i++) {
            for (let j = i + 1; j < simulatedPanels.length; j++) {
              const a = simulatedPanels[i].gridPos
              const b = simulatedPanels[j].gridPos
              if (
                a.x < b.x + b.w &&
                a.x + a.w > b.x &&
                a.y < b.y + b.h &&
                a.y + a.h > b.y
              ) {
                hasCollision = true
                break
              }
            }
            if (hasCollision) break
          }
          
          if (hasCollision) {
            // 交换后会产生新的碰撞，不允许交换，保持原位置
            console.log('交换会产生新碰撞，不允许')
          } else {
            // 安全交换
            const newPanels = panels.map(p => {
              if (p.id === dragging.panelId) {
                return { ...p, gridPos: tempPos }
              }
              if (p.id === swapTargetId) {
                return { ...p, gridPos: originalPos }
              }
              return p
            })
            onChange(newPanels)
          }
        }
      } else {
        // 没有碰撞，直接移动
        const newPanels = panels.map(p =>
          p.id === dragging.panelId ? { ...p, gridPos: tempPos } : p
        )
        onChange(newPanels)
      }
    } else if (dragging.type === 'resize' && tempPos) {
      // 更新面板大小
      const newPanels = panels.map(p =>
        p.id === dragging.panelId ? { ...p, gridPos: tempPos } : p
      )
      onChange(newPanels)
    }
    
    setDragging(null)
    setTempPos(null)
    setSwapTargetId(null)
  }, [dragging, tempPos, swapTargetId, panels, onChange])

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
  const maxY = panels.reduce((max, p) => Math.max(max, p.gridPos.y + p.gridPos.h), 0)
  const containerHeight = (maxY + 1) * rowHeight + maxY * gap + 20

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
        // 如果正在拖拽此面板，使用临时位置
        const isDraggingThis = dragging?.panelId === panel.id
        const displayPos = isDraggingThis && tempPos ? tempPos : panel.gridPos
        const style = calcStyle(displayPos)
        
        // 如果是碰撞目标面板，显示原始位置（将被交换）
        const isSwapTarget = swapTargetId === panel.id
        
        return (
          <div
            key={panel.id}
            className={`grid-layout-item ${isDraggingThis ? 'dragging' : ''}`}
            style={{
              ...style,
              cursor: editable ? 'move' : 'default',
              zIndex: isDraggingThis ? 100 : (isSwapTarget ? 50 : 1),
              transition: dragging ? 'none' : 'left 0.1s, top 0.1s, width 0.1s, height 0.1s',
              opacity: isSwapTarget ? 0.5 : 1,
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