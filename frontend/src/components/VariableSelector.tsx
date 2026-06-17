import { useState, useRef, useEffect } from 'react'
import type { VariableRes, VariableOption } from '../api'

interface VariableSelectorProps {
  variables: VariableRes[]
  onChange: (variableId: string, value: string | string[]) => void
}

export default function VariableSelector({ variables, onChange }: VariableSelectorProps) {
  if (variables.length === 0) return null

  return (
    <div className="variable-selector-bar">
      {variables.map((variable) => (
        <VariableDropdown
          key={variable.id}
          variable={variable}
          onChange={(value) => onChange(variable.id, value)}
        />
      ))}
    </div>
  )
}

interface VariableDropdownProps {
  variable: VariableRes
  onChange: (value: string | string[]) => void
}

function VariableDropdown({ variable, onChange }: VariableDropdownProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const label = variable.label || variable.name
  const isMulti = variable.multi
  const currentValue = variable.current?.value
  const currentText = variable.current?.text

  // 获取选中的值列表
  const selectedValues: string[] = isMulti
    ? (Array.isArray(currentValue) ? currentValue : [])
    : (typeof currentValue === 'string' ? [currentValue] : [])

  // 过滤选项
  const filteredOptions = (variable.options || []).filter((opt) =>
    opt.text.toLowerCase().includes(search.toLowerCase())
  )

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 单选
  const handleSingleSelect = (opt: VariableOption) => {
    onChange(opt.value)
    setOpen(false)
    setSearch('')
  }

  // 多选
  const handleMultiToggle = (opt: VariableOption) => {
    let newValues: string[]
    if (selectedValues.includes(opt.value)) {
      newValues = selectedValues.filter((v) => v !== opt.value)
    } else {
      newValues = [...selectedValues, opt.value]
    }
    onChange(newValues)
  }

  // 全选/取消全选
  const handleSelectAll = () => {
    const allOption = variable.options.find((o) => o.value === '$__all')
    if (allOption) {
      if (selectedValues.includes('$__all')) {
        onChange([])
      } else {
        onChange(['$__all'])
      }
    } else {
      if (selectedValues.length === variable.options.length) {
        onChange([])
      } else {
        onChange(variable.options.map((o) => o.value))
      }
    }
  }

  // 显示当前值
  const displayValue = isMulti
    ? (Array.isArray(currentText) ? currentText.join(' + ') : currentText || '选择值')
    : (currentText || '选择值')

  return (
    <div className="variable-dropdown" ref={ref}>
      <div className="variable-label">{label}</div>
      <div
        className={`variable-select-box ${open ? 'open' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <span className="variable-current-value">{displayValue}</span>
        <span className="variable-arrow">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="variable-dropdown-menu">
          {/* 搜索框 */}
          <div className="variable-search-wrapper">
            <input
              type="text"
              className="variable-search-input"
              placeholder="搜索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {/* 选项列表 */}
          <div className="variable-options-list">
            {/* 多选时显示全选 */}
            {isMulti && (
              <div
                className="variable-option variable-option-all"
                onClick={handleSelectAll}
              >
                <span className="variable-checkbox">
                  {selectedValues.length === variable.options.length ||
                   selectedValues.includes('$__all') ? '☑' : '☐'}
                </span>
                <span>全部</span>
              </div>
            )}

            {filteredOptions.map((opt) => (
              <div
                key={opt.value}
                className={`variable-option ${
                  selectedValues.includes(opt.value) ? 'selected' : ''
                }`}
                onClick={() => isMulti ? handleMultiToggle(opt) : handleSingleSelect(opt)}
              >
                {isMulti && (
                  <span className="variable-checkbox">
                    {selectedValues.includes(opt.value) ? '☑' : '☐'}
                  </span>
                )}
                <span>{opt.text}</span>
              </div>
            ))}

            {filteredOptions.length === 0 && (
              <div className="variable-option-empty">无匹配选项</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
