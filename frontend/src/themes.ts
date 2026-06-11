// 主题配色方案定义
export interface ThemeColors {
  name: string
  label: string
  // 背景色
  bgPrimary: string
  bgSecondary: string
  bgPanel: string
  bgInput: string
  bgHover: string
  // 边框色
  borderColor: string
  borderLight: string
  // 文字色
  textPrimary: string
  textSecondary: string
  textMuted: string
  // 主题色
  accent: string
  accentHover: string
  // 其他颜色
  sidebarBg?: string
}

export const themes: Record<string, ThemeColors> = {
  // 默认深色主题（现有配色）
  dark: {
    name: 'dark',
    label: '深色默认',
    bgPrimary: '#111217',
    bgSecondary: '#181b1f',
    bgPanel: '#22252b',
    bgInput: '#2b2e35',
    bgHover: '#31343c',
    borderColor: '#33363d',
    borderLight: '#2c2f36',
    textPrimary: '#d8d9da',
    textSecondary: '#a0a3a8',
    textMuted: '#6e7178',
    accent: '#3871dc',
    accentHover: '#5185e8',
    sidebarBg: '#0e0f12',
  },
  // Grafana 深蓝主题
  grafana: {
    name: 'grafana',
    label: 'Grafana 蓝',
    bgPrimary: '#0b0c0e',
    bgSecondary: '#141619',
    bgPanel: '#1a1d21',
    bgInput: '#24272c',
    bgHover: '#2d3036',
    borderColor: '#3d4048',
    borderLight: '#2a2d33',
    textPrimary: '#e3e4e5',
    textSecondary: '#b0b2b5',
    textMuted: '#7a7c80',
    accent: '#3274d9',
    accentHover: '#4a87e2',
    sidebarBg: '#0a0b0d',
  },
  // 暖色深色主题
  warmDark: {
    name: 'warmDark',
    label: '暖色深色',
    bgPrimary: '#1a1512',
    bgSecondary: '#231e1a',
    bgPanel: '#2d2722',
    bgInput: '#38302a',
    bgHover: '#433a33',
    borderColor: '#4d433d',
    borderLight: '#3a322c',
    textPrimary: '#e8e0d8',
    textSecondary: '#b8a898',
    textMuted: '#7a6858',
    accent: '#d97a3a',
    accentHover: '#e89050',
    sidebarBg: '#151210',
  },
  // 紫色深色主题
  purpleDark: {
    name: 'purpleDark',
    label: '紫色深色',
    bgPrimary: '#12101a',
    bgSecondary: '#1a1625',
    bgPanel: '#241e30',
    bgInput: '#2e2638',
    bgHover: '#382e42',
    borderColor: '#443850',
    borderLight: '#302840',
    textPrimary: '#e0d8f0',
    textSecondary: '#b0a0c8',
    textMuted: '#7868a0',
    accent: '#8b5cf6',
    accentHover: '#a78bfa',
    sidebarBg: '#0e0c15',
  },
  // 绿色深色主题
  greenDark: {
    name: 'greenDark',
    label: '绿色深色',
    bgPrimary: '#0f1512',
    bgSecondary: '#161d1a',
    bgPanel: '#1e2622',
    bgInput: '#262e2a',
    bgHover: '#2e3632',
    borderColor: '#3a4238',
    borderLight: '#2a3228',
    textPrimary: '#d8e8d0',
    textSecondary: '#a8c8a0',
    textMuted: '#68a860',
    accent: '#22c55e',
    accentHover: '#4ade80',
    sidebarBg: '#0a100e',
  },
  // 浅色主题
  light: {
    name: 'light',
    label: '浅色默认',
    bgPrimary: '#f5f5f5',
    bgSecondary: '#e8e8e8',
    bgPanel: '#ffffff',
    bgInput: '#f0f0f0',
    bgHover: '#e0e0e0',
    borderColor: '#d0d0d0',
    borderLight: '#e0e0e0',
    textPrimary: '#1a1a1a',
    textSecondary: '#4a4a4a',
    textMuted: '#8a8a8a',
    accent: '#3871dc',
    accentHover: '#5185e8',
    sidebarBg: '#e5e5e5',
  },
  // 浅蓝主题
  lightBlue: {
    name: 'lightBlue',
    label: '浅蓝主题',
    bgPrimary: '#f0f5fa',
    bgSecondary: '#e0e8f0',
    bgPanel: '#ffffff',
    bgInput: '#f5f8fc',
    bgHover: '#e8eef5',
    borderColor: '#c8d8e8',
    borderLight: '#d8e4f0',
    textPrimary: '#1a2840',
    textSecondary: '#3a5070',
    textMuted: '#6a80a0',
    accent: '#2563eb',
    accentHover: '#3b82f6',
    sidebarBg: '#d8e4f0',
  },
  // 浅绿主题
  lightGreen: {
    name: 'lightGreen',
    label: '浅绿主题',
    bgPrimary: '#f0f5f0',
    bgSecondary: '#e0e8e0',
    bgPanel: '#ffffff',
    bgInput: '#f5f8f5',
    bgHover: '#e8eee8',
    borderColor: '#c8d8c8',
    borderLight: '#d8e4d8',
    textPrimary: '#1a2818',
    textSecondary: '#3a5038',
    textMuted: '#6a8068',
    accent: '#16a34a',
    accentHover: '#22c55e',
    sidebarBg: '#d8e4d8',
  },
  // 高对比度深色
  highContrastDark: {
    name: 'highContrastDark',
    label: '高对比深色',
    bgPrimary: '#000000',
    bgSecondary: '#0a0a0a',
    bgPanel: '#141414',
    bgInput: '#1a1a1a',
    bgHover: '#222222',
    borderColor: '#3a3a3a',
    borderLight: '#2a2a2a',
    textPrimary: '#ffffff',
    textSecondary: '#e0e0e0',
    textMuted: '#a0a0a0',
    accent: '#ff8c00',
    accentHover: '#ffa500',
    sidebarBg: '#050505',
  },
}

// 应用主题到 CSS 变量
export function applyTheme(themeName: string) {
  const theme = themes[themeName]
  if (!theme) return

  const root = document.documentElement
  root.style.setProperty('--bg-primary', theme.bgPrimary)
  root.style.setProperty('--bg-secondary', theme.bgSecondary)
  root.style.setProperty('--bg-panel', theme.bgPanel)
  root.style.setProperty('--bg-input', theme.bgInput)
  root.style.setProperty('--bg-hover', theme.bgHover)
  root.style.setProperty('--bg-card', theme.bgPanel) // alias
  root.style.setProperty('--border-color', theme.borderColor)
  root.style.setProperty('--border-light', theme.borderLight)
  root.style.setProperty('--text-primary', theme.textPrimary)
  root.style.setProperty('--text-secondary', theme.textSecondary)
  root.style.setProperty('--text-muted', theme.textMuted)
  root.style.setProperty('--accent', theme.accent)
  root.style.setProperty('--accent-hover', theme.accentHover)
  root.style.setProperty('--primary', theme.accent) // alias

  // 保存到 localStorage
  localStorage.setItem('theme', themeName)
}

// 获取当前主题名称
export function getCurrentTheme(): string {
  return localStorage.getItem('theme') || 'dark'
}

// 初始化主题（应用启动时调用）
export function initTheme() {
  const themeName = getCurrentTheme()
  applyTheme(themeName)
}