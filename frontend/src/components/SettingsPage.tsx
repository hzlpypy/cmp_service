import { useState, useEffect } from 'react'
import { themes, applyTheme, getCurrentTheme, type ThemeColors } from '../themes'

interface SettingsPageProps {
  onBack?: () => void
}

export default function SettingsPage({ onBack }: SettingsPageProps) {
  const [currentTheme, setCurrentTheme] = useState(getCurrentTheme())

  const handleThemeChange = (themeName: string) => {
    setCurrentTheme(themeName)
    applyTheme(themeName)
  }

  // 主题分类
  const darkThemes = ['dark', 'grafana', 'warmDark', 'purpleDark', 'greenDark', 'highContrastDark']
  const lightThemes = ['light', 'lightBlue', 'lightGreen']

  return (
    <div className="browse-page">
      <div className="browse-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {onBack && (
            <button className="btn-icon" onClick={onBack} title="返回">
              ←
            </button>
          )}
          <h1 className="browse-title">系统设置</h1>
        </div>
      </div>

      {/* 主题设置 */}
      <div className="folder-group" style={{ marginBottom: 16 }}>
        <div className="folder-header" style={{ cursor: 'default' }}>
          <span className="folder-icon">🎨</span>
          <span className="folder-title">主题配色</span>
          <span className="folder-count">选择平台整体配色方案</span>
        </div>
        <div className="dashboard-list">
          {/* 深色主题 */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, fontWeight: 500 }}>深色主题</h3>
            <div className="theme-grid">
              {darkThemes.map((name) => {
                const t = themes[name]
                return (
                  <ThemeCard
                    key={name}
                    theme={t}
                    selected={currentTheme === name}
                    onClick={() => handleThemeChange(name)}
                  />
                )
              })}
            </div>
          </div>

          {/* 浅色主题 */}
          <div>
            <h3 style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, fontWeight: 500 }}>浅色主题</h3>
            <div className="theme-grid">
              {lightThemes.map((name) => {
                const t = themes[name]
                return (
                  <ThemeCard
                    key={name}
                    theme={t}
                    selected={currentTheme === name}
                    onClick={() => handleThemeChange(name)}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 其他设置预留 */}
      <div className="folder-group">
        <div className="folder-header" style={{ cursor: 'default' }}>
          <span className="folder-icon">⚙️</span>
          <span className="folder-title">其他设置</span>
          <span className="folder-count">更多配置项</span>
        </div>
        <div className="dashboard-list" style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>
          更多系统配置项将在后续版本中添加...
        </div>
      </div>
    </div>
  )
}

// 主题卡片组件
function ThemeCard({ theme, selected, onClick }: { theme: ThemeColors; selected: boolean; onClick: () => void }) {
  return (
    <div
      className={`theme-card ${selected ? 'selected' : ''}`}
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: 12,
        background: selected ? 'var(--bg-hover)' : 'var(--bg-secondary)',
        border: selected ? '2px solid var(--accent)' : '1px solid var(--border-color)',
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'all 0.15s',
        minWidth: 140,
      }}
    >
      {/* 预览色块 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <div style={{ width: 24, height: 24, borderRadius: 3, background: theme.bgPrimary, border: '1px solid ' + theme.borderColor }} />
        <div style={{ width: 24, height: 24, borderRadius: 3, background: theme.bgPanel, border: '1px solid ' + theme.borderColor }} />
        <div style={{ width: 24, height: 24, borderRadius: 3, background: theme.accent }} />
      </div>
      {/* 名称 */}
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{theme.label}</div>
      {selected && (
        <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 4 }}>当前使用</div>
      )}
    </div>
  )
}