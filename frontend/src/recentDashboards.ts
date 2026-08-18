// 最近访问的仪表板记录（localStorage 持久化，供首页展示）
export interface RecentDashboard {
  id: string
  title: string
  visitedAt: number
}

const KEY = 'cmp_recent_dashboards'

export function getRecentDashboards(): RecentDashboard[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

/** 记录一次仪表板访问：去重后插入头部，最多保留 8 条 */
export function recordRecentDashboard(id: string, title: string) {
  try {
    const list = getRecentDashboards().filter((d) => d.id !== id)
    list.unshift({ id, title, visitedAt: Date.now() })
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 8)))
  } catch {
    // 存储失败静默处理
  }
}
