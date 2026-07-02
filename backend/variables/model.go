// Package variables 提供仪表板变量管理功能的数据模型定义。
// 包含请求/响应结构体以及模型转换函数。
package variables

import "cmp_service_backend/model"

// VariableReq 变量操作请求参数。
// 用于创建、更新变量。
type VariableReq struct {
	// ID 变量主键ID（更新/删除时必填）
	ID string `json:"id"`
	// DashboardID 所属仪表板ID（必填）
	DashboardID string `json:"dashboard_id" binding:"required"`
	// Name 变量名（用于 $varname 引用）
	Name string `json:"name" binding:"required"`
	// Type 变量类型：custom、query、textbox、constant、datasource、interval
	Type string `json:"type"`
	// Label 显示名称（下拉框标签）
	Label string `json:"label"`
	// Description 变量描述
	Description string `json:"description"`
	// Options 选项列表（用于 custom 类型）
	Options []VariableOption `json:"options"`
	// Query 查询语句（用于 query 类型）
	Query string `json:"query"`
	// DatasourceID 数据源ID（用于 query 类型）
	DatasourceID string `json:"datasource_id"`
	// Default 默认值
	Default string `json:"default"`
	// Current 当前选中的值
	Current map[string]interface{} `json:"current"`
	// Multi 是否支持多选
	Multi bool `json:"multi"`
	// IncludeAll 是否包含"全部"选项
	IncludeAll bool `json:"include_all"`
	// AllValue "全部"选项的值
	AllValue string `json:"all_value"`
	// SortOrder 排序序号
	SortOrder int `json:"sort_order"`
}

// VariableOption 变量选项结构。
// 用于 custom 类型变量的选项列表。
type VariableOption struct {
	// Text 显示文本
	Text string `json:"text"`
	// Value 实际值
	Value string `json:"value"`
	// Selected 是否默认选中
	Selected bool `json:"selected"`
}

// VariableRes 变量详情响应结构。
type VariableRes struct {
	// ID 变量主键ID
	ID string `json:"id"`
	// DashboardID 所属仪表板ID
	DashboardID string `json:"dashboard_id"`
	// Name 变量名
	Name string `json:"name"`
	// Type 变量类型
	Type string `json:"type"`
	// Label 显示名称
	Label string `json:"label"`
	// Description 变量描述
	Description string `json:"description"`
	// Options 选项列表
	Options []VariableOption `json:"options"`
	// Query 查询语句
	Query string `json:"query"`
	// DatasourceID 数据源ID
	DatasourceID string `json:"datasource_id"`
	// Default 默认值
	Default string `json:"default"`
	// Current 当前选中的值
	Current map[string]interface{} `json:"current"`
	// Multi 是否支持多选
	Multi bool `json:"multi"`
	// IncludeAll 是否包含"全部"选项
	IncludeAll bool `json:"include_all"`
	// AllValue "全部"选项的值
	AllValue string `json:"all_value"`
	// SortOrder 排序序号
	SortOrder int `json:"sort_order"`
	// CreatedAt 创建时间
	CreatedAt string `json:"created_at"`
	// UpdatedAt 更新时间
	UpdatedAt string `json:"updated_at"`
}

// VariableDeleteReq 变量删除请求参数。
// 删除操作只需要 ID 即可。
type VariableDeleteReq struct {
	// ID 变量主键ID（必填）
	ID string `json:"id" binding:"required"`
}

// VariableListReq 变量列表查询请求参数。
type VariableListReq struct {
	// DashboardID 仪表板ID（必填，按仪表板过滤变量）
	DashboardID string `json:"dashboard_id" binding:"required"`
}

// VariableValuesReq 获取变量可选值请求。
// 用于 query 类型变量动态查询可选值列表。
type VariableValuesReq struct {
	// ID 变量ID（可选，如果提供则从数据库加载变量配置）
	ID string `json:"id"`
	// DashboardID 仪表板ID（与 ID 配合使用）
	DashboardID string `json:"dashboard_id"`
	// Query 查询语句（可选，直接指定查询）
	Query string `json:"query"`
	// DatasourceID 数据源ID（用于执行查询）
	DatasourceID string `json:"datasource_id"`
}

// VariableValuesRes 变量可选值响应。
type VariableValuesRes struct {
	// Values 可选值列表
	Values []VariableOption `json:"values"`
}

// ToVariableRes 将 GORM 模型 Variable 转换为 API 响应结构。
func ToVariableRes(m *model.Variable) *VariableRes {
	// 转换 Options
	options := make([]VariableOption, 0)
	if m.Options != nil {
		for _, opt := range m.Options {
			options = append(options, VariableOption{
				Text:     getStringFromMap(opt, "text"),
				Value:    getStringFromMap(opt, "value"),
				Selected: getBoolFromMap(opt, "selected"),
			})
		}
	}

	return &VariableRes{
		ID:           m.ID,
		DashboardID:  m.DashboardID,
		Name:         m.Name,
		Type:         m.Type,
		Label:        m.Label,
		Description:  m.Description,
		Options:      options,
		Query:        m.Query,
		DatasourceID: m.DatasourceID,
		Default:      m.Default,
		Current:      m.Current,
		Multi:        m.Multi,
		IncludeAll:   m.IncludeAll,
		AllValue:     m.AllValue,
		SortOrder:    m.SortOrder,
		CreatedAt:    m.CreatedAt.Format("2006-01-02T15:04:05+08:00"),
		UpdatedAt:    m.UpdatedAt.Format("2006-01-02T15:04:05+08:00"),
	}
}

// getStringFromMap 从 map 中安全获取字符串值。
func getStringFromMap(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// getBoolFromMap 从 map 中安全获取布尔值。
func getBoolFromMap(m map[string]interface{}, key string) bool {
	if v, ok := m[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return false
}
