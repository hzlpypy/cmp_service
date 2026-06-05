// Package network_metrics 提供网络指标查询的数据模型定义。
// 包含请求/响应结构体，对应存量 cmp_service 的接口格式。
package network_metrics

// NetworkMetricsReq 网络指标查询请求参数。
// 对应接口：POST /api/v1/ops_dbapi/api/network_metrics
type NetworkMetricsReq struct {
	// Params 查询参数
	Params NetworkMetricsParams `json:"params"`
}

// NetworkMetricsParams 网络指标查询的具体参数。
type NetworkMetricsParams struct {
	// Date 查询日期（YYYY-MM-DD 格式），为空时返回全部数据
	Date string `json:"date"`
}

// NetworkMetricsRes 网络指标查询响应结构。
// 字段名适配前端期望的驼峰格式。
type NetworkMetricsRes struct {
	// ID 指标记录主键ID
	ID string `json:"id"`
	// CreatedAt 创建时间（ISO 8601 格式）
	CreatedAt string `json:"created_at"`
	// MetricCategory 指标分类（如：带宽、延迟、丢包率）
	MetricCategory string `json:"metric_category"`
	// MetricName 指标名称
	MetricName string `json:"metric_name"`
	// CurrentValue 当前值
	CurrentValue string `json:"current_value"`
	// HistoricalPeak 历史峰值
	HistoricalPeak string `json:"historical_peak"`
	// MomChange 日环比变化（Day over Day）
	MomChange string `json:"mom_change"`
	// NodeType 节点类型标识
	NodeType string `json:"node_type"`
	// Unit 指标单位（如：Mbps、ms、%）
	Unit string `json:"unit"`
	// UpdatedAt 最后更新时间（ISO 8601 格式）
	UpdatedAt string `json:"updated_at"`
	// YoyChange 周同比变化（Week over Week）
	YoyChange string `json:"yoy_change"`
}
