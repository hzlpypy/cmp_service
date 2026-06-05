// Package datasources 提供数据源管理功能的数据模型定义。
// 包含请求/响应结构体以及模型转换函数，支持 MySQL 和 HTTP API 两种数据源类型。
package datasources

import "cmp_service_backend/model"

// DatasourceReq 数据源操作请求参数。
// 用于创建、更新和删除数据源。
type DatasourceReq struct {
	// ID 数据源主键ID（更新/删除/测试时必填）
	ID string `json:"id"`
	// Name 数据源名称
	Name string `json:"name"`
	// Type 数据源类型：mysql 或 http
	Type string `json:"type"`
	// URL 连接地址（MySQL为host:port，HTTP为完整URL）
	URL string `json:"url"`
	// DatabaseName 数据库名（仅MySQL类型使用）
	DatabaseName string `json:"database_name"`
	// Username 数据库用户名（仅MySQL类型使用）
	Username string `json:"username"`
	// Password 数据库密码（仅MySQL类型使用）
	Password string `json:"password"`
	// Headers HTTP请求头（仅HTTP类型使用，JSON格式）
	Headers model.JSONMap `json:"headers"`
	// Enabled 是否启用（指针类型，用于区分未传值和传 false）
	Enabled *bool `json:"enabled"`
}

// DatasourceRes 数据源详情响应结构。
// 不返回 Password 字段以确保安全。
type DatasourceRes struct {
	// ID 数据源主键ID
	ID string `json:"id"`
	// Name 数据源名称
	Name string `json:"name"`
	// Type 数据源类型
	Type string `json:"type"`
	// URL 连接地址
	URL string `json:"url"`
	// DatabaseName 数据库名
	DatabaseName string `json:"database_name"`
	// Username 用户名
	Username string `json:"username"`
	// Headers HTTP请求头配置
	Headers model.JSONMap `json:"headers"`
	// Enabled 启用状态
	Enabled bool `json:"enabled"`
	// CreatedAt 创建时间（ISO 8601 格式）
	CreatedAt string `json:"created_at"`
	// UpdatedAt 最后更新时间（ISO 8601 格式）
	UpdatedAt string `json:"updated_at"`
}

// ToDatasourceRes 将 GORM 模型 Datasource 转换为 API 响应结构。
// 注意：不返回密码字段，确保敏感信息不泄露。
func ToDatasourceRes(m *model.Datasource) *DatasourceRes {
	if m.Headers == nil {
		m.Headers = model.JSONMap{}
	}
	return &DatasourceRes{
		ID:           m.ID,
		Name:         m.Name,
		Type:         m.Type,
		URL:          m.URL,
		DatabaseName: m.DatabaseName,
		Username:     m.Username,
		Headers:      m.Headers,
		Enabled:      m.Enabled,
		CreatedAt:    m.CreatedAt.Format("2006-01-02T15:04:05+08:00"),
		UpdatedAt:    m.UpdatedAt.Format("2006-01-02T15:04:05+08:00"),
	}
}
