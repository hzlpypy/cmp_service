import { useState, useEffect, useCallback, useRef } from 'react'
import { Select, Tag } from 'antd'
import * as api from '../api'
import type { VariableRes, VariableOption } from '../api'

interface VariableSelectorProps {
  variables: VariableRes[]
  onChange: (variableId: string, value: string | string[], isManual?: boolean) => void
  reloadKey: number
  /** 被用户手动选择过的变量 ID 集合 */
  manuallyTouchedVarIds: Set<string>
}

export default function VariableSelector({
  variables,
  onChange,
  reloadKey,
  manuallyTouchedVarIds,
}: VariableSelectorProps) {
  if (variables.length === 0) return null

  const visibleVars = variables.filter((v) => !v.hide)
  const hiddenVars = variables.filter((v) => v.hide && v.type === 'query')
  if (visibleVars.length === 0) return null

  const variablesMap = buildVariablesMap(variables)

  return (
    <div className="variable-selector-bar" style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '8px 16px',
      background: '#fafafa',
      borderBottom: '1px solid #e8e8e8',
      flexWrap: 'wrap',
    }}>
      {visibleVars.map((variable) => (
        <VariableDropdown
          key={variable.id}
          variable={variable}
          onChange={(value, isManual) => onChange(variable.id, value, isManual)}
          reloadKey={reloadKey}
          variablesMap={variablesMap}
          isManuallyTouched={manuallyTouchedVarIds.has(variable.id)}
        />
      ))}
      {/* 隐藏的 query 类型变量：不显示选择器，但仍然加载选项以保持值同步 */}
      {hiddenVars.length > 0 && (
        <div style={{ display: 'none' }}>
          {hiddenVars.map((variable) => (
            <VariableDropdown
              key={variable.id}
              variable={variable}
              onChange={(value) => onChange(variable.id, value, false)}
              reloadKey={reloadKey}
              variablesMap={variablesMap}
              isManuallyTouched={false}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** 从变量列表中构建 name → value 映射 */
function buildVariablesMap(vars: VariableRes[]): Record<string, string | string[]> {
  const map: Record<string, string | string[]> = {}
  for (const v of vars) {
    if (v.current?.value !== undefined && v.current?.value !== null) {
      map[v.name] = v.current.value as any
    }
  }
  return map
}

interface VariableDropdownProps {
  variable: VariableRes
  onChange: (value: string | string[], isManual?: boolean) => void
  reloadKey: number
  variablesMap: Record<string, string | string[]>
  isManuallyTouched: boolean
}

function VariableDropdown({
  variable,
  onChange,
  reloadKey,
  variablesMap,
  isManuallyTouched,
}: VariableDropdownProps) {
  const [dynamicOptions, setDynamicOptions] = useState<VariableOption[]>([])
  const [optionsLoaded, setOptionsLoaded] = useState(false)
  const [loading, setLoading] = useState(false)

  const label = variable.label || variable.name
  const currentValue = variable.current?.value

  // 获取选中的值列表
  const selectedValues: string[] = Array.isArray(currentValue)
    ? currentValue
    : (typeof currentValue === 'string' && currentValue ? [currentValue] : [])

  // 合并选项
  const allOptions = variable.type === 'query' ? dynamicOptions : (variable.options || [])

  // 判断是否已全选
  const isAllSelected =
    variable.include_all &&
    allOptions.length > 0 &&
    selectedValues.length === allOptions.length

  // 加载 query 类型变量的动态值
  const loadOptions = useCallback(async () => {
    if (variable.type !== 'query') return
    setLoading(true)
    try {
      const values = await api.getVariableValues(
        variable.id,
        variable.query,
        variable.datasource_id,
        variablesMap
      )
      setDynamicOptions(values || [])
      setOptionsLoaded(true)
    } catch {
      setDynamicOptions([])
      setOptionsLoaded(true)
    } finally {
      setLoading(false)
    }
  }, [variable.id, variable.query, variable.datasource_id, variable.type, variablesMap])

  // reloadKey / variable.id 变化时重置选项并自动加载
  useEffect(() => {
    setDynamicOptions([])
    setOptionsLoaded(false)
    if (variable.type === 'query') {
      loadOptions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variable.id, reloadKey])

  // 选项就绪后自动全选（首次加载保留已保存值，上游变化时自动刷新）
  const autoSelectedRef = useRef(false)
  const initialLoadDone = useRef(false)
  useEffect(() => {
    if (!variable.include_all) return
    if (!optionsLoaded && variable.type === 'query') return
    if (isManuallyTouched) return
    if (autoSelectedRef.current) return

    const opts = variable.type !== 'query' ? (variable.options || []) : dynamicOptions
    if (opts.length === 0) return

    const allValues = opts.map((o) => o.value)

    // 首次加载：如果有已保存的值则保留，不覆盖
    if (!initialLoadDone.current) {
      initialLoadDone.current = true
      if (selectedValues.length > 0) {
        autoSelectedRef.current = true
        return
      }
    }

    // 已全选则跳过
    if (
      allValues.length === selectedValues.length &&
      allValues.every((v) => selectedValues.includes(v))
    ) {
      autoSelectedRef.current = true
      return
    }

    autoSelectedRef.current = true
    onChange(allValues, false)
  }, [variable.id, reloadKey, dynamicOptions, variable.type, variable.include_all, optionsLoaded, isManuallyTouched, selectedValues])

  // reloadKey 变化时重置
  useEffect(() => {
    autoSelectedRef.current = false
  }, [reloadKey])

  const selectOptions = allOptions.map((opt) => ({
    label: opt.text,
    value: opt.value,
  }))

  // 单选变量：点击具体选项时只保留最新选中的那一个值
  const handleChange = (values: string[]) => {
    if (!variable.multi && values.length > 1) {
      // 单选模式：只保留最后选中的值（即用户最新点的那个）
      const newValue = values[values.length - 1]
      onChange([newValue], true)
      return
    }
    onChange(values, true)
  }

  // 全选/取消全选
  const handleToggleAll = () => {
    if (isAllSelected) {
      onChange([], true)
    } else {
      onChange(allOptions.map((o) => o.value), true)
    }
  }

  // 自定义下拉渲染：顶部加上"全部"选项
  const dropdownRender = (menu: React.ReactElement) => (
    <div>
      {variable.include_all && allOptions.length > 0 && (
        <div
          style={{
            padding: '5px 12px',
            borderBottom: '1px solid #f0f0f0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: '#1677ff',
            fontWeight: isAllSelected ? 600 : 400,
            fontSize: 13,
          }}
          onMouseDown={(e) => {
            e.preventDefault() // 阻止 Select 关闭
            handleToggleAll()
          }}
        >
          <span>{isAllSelected ? '☑' : '☐'}</span>
          <span>全部</span>
        </div>
      )}
      {menu}
    </div>
  )

  return (
    <div className="variable-dropdown" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <Tag
        color="processing"
        style={{
          margin: 0,
          padding: '1px 8px',
          fontSize: 12,
          lineHeight: '22px',
          borderRadius: 4,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Tag>
      <Select
        style={{ minWidth: 140, maxWidth: 240 }}
        size="small"
        mode="multiple"
        value={isAllSelected ? [] : selectedValues}
        placeholder={
          isAllSelected
            ? `全部 (${allOptions.length})`
            : loading
              ? '加载中...'
              : '选择值'
        }
        options={selectOptions}
        onChange={handleChange}
        loading={loading}
        showSearch
        allowClear
        maxTagCount={isAllSelected ? 0 : 1}
        maxTagPlaceholder={(omittedValues: any[]) =>
          isAllSelected ? null : <span>+{omittedValues.length}...</span>
        }
        filterOption={(input, option) =>
          (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
        }
        popupRender={dropdownRender}
        notFoundContent={<span style={{ color: '#999', fontSize: 12 }}>无匹配选项</span>}
        getPopupContainer={(trigger) => trigger.parentElement || document.body}
      />
    </div>
  )
}
