import { useState } from 'react'
import * as api from '../api'
import type { VariableRes, DatasourceRes } from '../api'

interface QueryInspectorProps {
  dashboardId: string
  datasourceId?: string
  datasources: DatasourceRes[]
  rawSql: string // MySQL数据源使用
  httpPath?: string // HTTP数据源使用
  httpMethod?: string
  httpBody?: string
  httpDataFormat?: string
  httpDataPath?: string
  variables: VariableRes[]
  from?: string
  to?: string
}

export default function QueryInspector({ 
  dashboardId, datasourceId, datasources, rawSql, httpPath, httpMethod, httpBody, httpDataFormat, httpDataPath, variables, from, to 
}: QueryInspectorProps) {
  const [result, setResult] = useState<api.QueryInspectRes | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const handleRefresh = async () => {
    setLoading(true)
    try {
      // 构建变量值映射（用户变量 + 系统变量）
      const varMap: Record<string, string | string[]> = {}
      variables.forEach((v) => {
        if (v.current && (v.current as any).value) {
          varMap[v.name] = (v.current as any).value
        } else if (v.default) {
          varMap[v.name] = v.default
        }
      })
      // 合并系统内置变量（$__from, $__to 等）
      if (from && to) Object.assign(varMap, api.getSystemVars(from, to))

      // 根据数据源类型发送不同的参数
      const selectedDs = datasources.find(ds => ds.id === datasourceId)
      let requestBody: any = {
        dashboard_id: dashboardId,
        datasource_id: datasourceId,
        variables: varMap,
        from,
        to,
      }

      if (selectedDs && selectedDs.type === 'http') {
        // HTTP数据源 - 发送HTTP查询参数
        requestBody.http_path = httpPath || ''
        requestBody.http_method = httpMethod || 'GET'
        requestBody.http_body = httpBody || ''
        requestBody.http_data_format = httpDataFormat || 'json'
        requestBody.http_data_path = httpDataPath || ''
      } else {
        // MySQL数据源 - 发送SQL参数
        requestBody.raw_sql = rawSql
      }

      const res = await api.queryInspect(requestBody)
      setResult(res)
    } catch (e: any) {
      setResult({
        processed_sql: selectedDs && selectedDs.type === 'http' 
          ? (selectedDs.url + (httpPath || '')) 
          : rawSql,
        columns: [],
        rows: [],
        row_count: 0,
        error: e.message || '查询失败',
      })
    } finally {
      setLoading(false)
      setExpanded(true)
    }
  }

  // 判断当前数据源类型
  const selectedDs = datasources.find(ds => ds.id === datasourceId)

  return (
    <div className="query-inspector" style={{ marginTop: 12, borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          Query Inspector
        </span>
        <button
          className="btn-sm btn-primary"
          onClick={handleRefresh}
          disabled={loading}
          style={{ fontSize: 11 }}
        >
          {loading ? '查询中...' : '🔄 刷新'}
        </button>
        {result && (
          <button
            className="btn-sm"
            onClick={() => setExpanded(!expanded)}
            style={{ fontSize: 11 }}
          >
            {expanded ? '收起' : '展开'}
          </button>
        )}
      </div>

      {result && expanded && (
        <div className="inspect-result">
          {/* 执行的查询 */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
              {selectedDs && selectedDs.type === 'http' ? '实际请求的 URL:' : '实际执行的 SQL:'}
            </div>
            <pre style={{
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              padding: '8px 12px',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              maxHeight: 120,
              overflow: 'auto',
              margin: 0,
              border: '1px solid var(--border-color)',
            }}>
              {result.processed_sql}
            </pre>
          </div>

          {/* 错误信息 */}
          {result.error && (
            <div style={{
              background: '#3d1111',
              color: '#e24d4d',
              padding: '8px 12px',
              borderRadius: 4,
              fontSize: 12,
              marginBottom: 12,
              border: '1px solid #5c1a1a',
            }}>
              <strong>错误:</strong> {result.error}
            </div>
          )}

          {/* 查询结果表格 */}
          {!result.error && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                查询结果 ({result.row_count} 行):
              </div>
              <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 4 }}>
                <table className="inspect-table" style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={headerStyle}>#</th>
                      {result.columns.map((col) => (
                        <th key={col} style={headerStyle}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, ri) => (
                      <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'var(--bg-input)' }}>
                        <td style={cellStyle}>{ri + 1}</td>
                        {result.columns.map((col) => (
                          <td key={col} style={cellStyle}>{String(row[col] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const headerStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  padding: '4px 8px',
  textAlign: 'left',
  borderBottom: '2px solid var(--border-color)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

const cellStyle: React.CSSProperties = {
  padding: '3px 8px',
  color: 'var(--text-primary)',
  borderBottom: '1px solid var(--border-color)',
  whiteSpace: 'nowrap',
  maxWidth: 300,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}
