// Package business_systems 提供业务系统查询的数据模型定义。
// 包含请求/响应结构体，对应存量 cmp_service 的接口格式。
package business_systems

// BusinessSystemsReq 业务系统查询请求参数。
// 对应接口：POST /api/v1/ops_dbapi/api/business_systems
type BusinessSystemsReq struct {
	// Params 查询参数
	Params BusinessSystemsParams `json:"params"`
}

// BusinessSystemsParams 业务系统查询的具体参数。
type BusinessSystemsParams struct {
	// ID 业务系统ID（当前未在查询中使用）
	ID string `json:"id"`
}

// BusinessSystemsRes 业务系统查询响应结构。
type BusinessSystemsRes struct {
	// References 业务系统引用配置数据（JSON结构）
	References interface{} `json:"references"`
}
