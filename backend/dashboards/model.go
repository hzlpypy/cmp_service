// Package dashboards 提供仪表板管理功能的数据模型定义。
// 包含请求/响应结构体、面板简要信息以及模型转换函数。
package dashboards

import "cmp_service_backend/model"

// DashboardReq 仪表板操作请求参数。
// 用于创建、更新仪表板，dashboard_json 为仪表板的完整 JSON 定义。
type DashboardReq struct {
	// ID 仪表板主键ID（更新/删除时必填）
	ID string `json:"id"`
	// Title 仪表板标题
	Title string `json:"title"`
	// FolderID 所属文件夹ID
	FolderID string `json:"folder_id"`
	// DashboardJSON 仪表板完整JSON定义（Grafana风格），含 panels、layout
	DashboardJSON model.JSONMap `json:"dashboard_json"`
}

// DashboardRes 仪表板详情响应结构。
// 包含仪表板基本信息、所属文件夹名称、仪表板JSON定义及面板列表。
type DashboardRes struct {
	// ID 仪表板主键ID
	ID string `json:"id"`
	// Title 仪表板标题
	Title string `json:"title"`
	// FolderID 所属文件夹ID
	FolderID string `json:"folder_id"`
	// FolderName 所属文件夹名称
	FolderName string `json:"folder_name"`
	// DashboardJSON 仪表板完整JSON定义
	DashboardJSON interface{} `json:"dashboard_json"`
	// Panels 仪表板包含的面板列表
	Panels []PanelBriefRes `json:"panels"`
	// CreatedAt 创建时间（ISO 8601 格式）
	CreatedAt string `json:"created_at"`
	// UpdatedAt 最后更新时间（ISO 8601 格式）
	UpdatedAt string `json:"updated_at"`
}

// PanelBriefRes 面板简要信息。
// 用于仪表板详情中展示面板的布局和配置信息。
type PanelBriefRes struct {
	// ID 面板主键ID
	ID string `json:"id"`
	// Title 面板标题
	Title string `json:"title"`
	// Type 图表类型：bar（柱状图）、line（折线图）、pie（饼图）、gauge（仪表盘）、table（表格）
	Type string `json:"type"`
	// GridPosX 网格X坐标
	GridPosX int `json:"grid_pos_x"`
	// GridPosY 网格Y坐标
	GridPosY int `json:"grid_pos_y"`
	// GridPosW 网格宽度
	GridPosW int `json:"grid_pos_w"`
	// GridPosH 网格高度
	GridPosH int `json:"grid_pos_h"`
	// Datasource 数据源配置（JSON）
	Datasource interface{} `json:"datasource"`
	// Options 图表选项配置（JSON）
	Options interface{} `json:"options"`
	// SortOrder 排序序号
	SortOrder int `json:"sort_order"`
}

// DashboardListReq 仪表板列表查询请求参数。
type DashboardListReq struct {
	// FolderID 可选，按文件夹ID过滤
	FolderID string `json:"folder_id"`
}

// DashboardDataReq 仪表板数据查询请求。
// 后端根据仪表板JSON中的面板配置查询实际数据。
type DashboardDataReq struct {
	// ID 仪表板主键ID
	ID string `json:"id"`
	// From 数据起始时间（RFC3339格式，可选，用于时间范围过滤）
	From string `json:"from,omitempty"`
	// To 数据结束时间（RFC3339格式，可选，用于时间范围过滤）
	To string `json:"to,omitempty"`
	// DashboardJSON 可选，前端传入的草稿 dashboard_json。
	// 不为 nil 时直接使用此 JSON 配置查询，不从数据库读取。
	DashboardJSON map[string]interface{} `json:"dashboard_json,omitempty"`
	// Variables 可选，前端传入的变量值映射。
	// key 为变量名，value 为变量值（字符串或字符串数组）
	Variables map[string]interface{} `json:"variables,omitempty"`
}

// PanelDataReq 单个面板数据查询请求。
// 指定仪表盘ID和面板ID，返回该面板的查询结果。
type PanelDataReq struct {
	// DashboardID 仪表盘主键ID（必填）
	DashboardID string `json:"dashboard_id" binding:"required"`
	// PanelID 面板主键ID（必填）
	PanelID string `json:"panel_id" binding:"required"`
	// From 数据起始时间（RFC3339格式，可选）
	From string `json:"from,omitempty"`
	// To 数据结束时间（RFC3339格式，可选）
	To string `json:"to,omitempty"`
	// Variables 可选，前端传入的变量值映射
	Variables map[string]interface{} `json:"variables,omitempty"`
}

// QueryInspectReq 查询检查器请求。
// 用于 Grafana 风格的 Query Inspector 功能，展示实际执行的 SQL 和查询结果。
type QueryInspectReq struct {
	// RawSQL 用户输入的原始 SQL（含 $var 变量引用）
	RawSQL string `json:"raw_sql" binding:"required"`
	// DashboardID 仪表盘 ID，用于获取变量值
	DashboardID string `json:"dashboard_id" binding:"required"`
	// Variables 可选，前端传入的变量值映射（优先级高于数据库中的变量值）
	Variables map[string]interface{} `json:"variables,omitempty"`
	// From 时间范围开始（ISO格式），用于系统变量替换和时间过滤
	From string `json:"from,omitempty"`
	// To 时间范围结束（ISO格式），用于系统变量替换和时间过滤
	To string `json:"to,omitempty"`
}

// QueryInspectRes 查询检查器响应。
type QueryInspectRes struct {
	// ProcessedSQL 变量替换后的实际 SQL 语句
	ProcessedSQL string `json:"processed_sql"`
	// Columns 列名顺序
	Columns []string `json:"columns"`
	// Rows 查询结果行数据
	Rows []map[string]interface{} `json:"rows"`
	// RowCount 返回行数
	RowCount int `json:"row_count"`
	// Error 查询错误信息（如有）
	Error string `json:"error,omitempty"`
}

// PanelData 单个面板的数据查询结果。
type PanelData struct {
	// PanelID 面板ID
	PanelID string `json:"panel_id"`
	// PanelTitle 面板标题
	PanelTitle string `json:"panel_title"`
	// PanelType 面板图表类型
	PanelType string `json:"panel_type"`
	// DatasourceID 面板使用的数据源ID
	DatasourceID string `json:"datasource_id"`
	// Columns 列名顺序（保持 SQL 查询返回的顺序）
	Columns []string `json:"columns"`
	// Target 数据查询结果列表，每个元素对应一个 target
	Target [][]map[string]interface{} `json:"target"`
}

// DashboardDataRes 仪表板数据查询响应。
// 包含每个面板的实际数据查询结果。
type DashboardDataRes struct {
	// DashboardID 仪表板ID
	DashboardID string `json:"dashboard_id"`
	// DashboardTitle 仪表板标题
	DashboardTitle string `json:"dashboard_title"`
	// DashboardJSON 仪表板完整JSON定义
	DashboardJSON interface{} `json:"dashboard_json"`
	// PanelsData 各面板的查询结果数据
	PanelsData []PanelData `json:"panels_data"`
}

// ToDashboardRes 将 GORM 模型 Dashboard 转换为 API 响应结构。
// 参数 m 需包含 Preload 加载的 Folder 和 Panels 关联数据。
// 返回格式化后的 DashboardRes，所有时间字段统一为 ISO 8601 东八区时间。
func ToDashboardRes(m *model.Dashboard) *DashboardRes {
	// 提取文件夹名称
	folderName := ""
	if m.Folder != nil {
		folderName = m.Folder.Title
	}
	// 转换面板列表
	panels := make([]PanelBriefRes, 0, len(m.Panels))
	for _, p := range m.Panels {
		panels = append(panels, PanelBriefRes{
			ID:         p.ID,
			Title:      p.Title,
			Type:       p.Type,
			GridPosX:   p.GridPosX,
			GridPosY:   p.GridPosY,
			GridPosW:   p.GridPosW,
			GridPosH:   p.GridPosH,
			Datasource: p.Datasource,
			Options:    p.Options,
			SortOrder:  p.SortOrder,
		})
	}
	return &DashboardRes{
		ID:            m.ID,
		Title:         m.Title,
		FolderID:      m.FolderID,
		FolderName:    folderName,
		DashboardJSON: m.DashboardJSON,
		Panels:        panels,
		CreatedAt:     m.CreatedAt.Format("2006-01-02T15:04:05+08:00"),
		UpdatedAt:     m.UpdatedAt.Format("2006-01-02T15:04:05+08:00"),
	}
}

// ============================================================
// 版本管理相关类型
// ============================================================

// VersionListReq 版本列表请求参数。
type VersionListReq struct {
	// DashboardID 仪表盘ID
	DashboardID string `json:"dashboard_id" binding:"required"`
}

// VersionReq 单个版本请求参数。
type VersionReq struct {
	// DashboardID 仪表盘ID
	DashboardID string `json:"dashboard_id" binding:"required"`
	// Version 版本号
	Version int `json:"version"`
}

// VersionRestoreReq 版本还原请求参数。
type VersionRestoreReq struct {
	// DashboardID 仪表盘ID
	DashboardID string `json:"dashboard_id" binding:"required"`
	// Version 要还原的版本号
	Version int `json:"version" binding:"required"`
	// Message 还原说明（可选）
	Message string `json:"message"`
}

// VersionCompareReq 版本对比请求参数。
type VersionCompareReq struct {
	// DashboardID 仪表盘ID
	DashboardID string `json:"dashboard_id" binding:"required"`
	// VersionFrom 起始版本号
	VersionFrom int `json:"version_from" binding:"required"`
	// VersionTo 目标版本号
	VersionTo int `json:"version_to" binding:"required"`
}

// VersionRes 版本信息响应。
type VersionRes struct {
	// ID 版本记录ID
	ID string `json:"id"`
	// DashboardID 仪表盘ID
	DashboardID string `json:"dashboard_id"`
	// Version 版本号
	Version int `json:"version"`
	// Title 该版本的仪表盘标题
	Title string `json:"title"`
	// DashboardJSON 该版本的仪表盘完整JSON定义
	DashboardJSON interface{} `json:"dashboard_json"`
	// Message 版本说明
	Message string `json:"message"`
	// CreatedBy 创建者
	CreatedBy string `json:"created_by"`
	// CreatedAt 创建时间
	CreatedAt string `json:"created_at"`
}

// VersionBriefRes 版本简要信息（用于列表）。
type VersionBriefRes struct {
	// ID 版本记录ID
	ID string `json:"id"`
	// Version 版本号
	Version int `json:"version"`
	// Title 该版本的仪表盘标题
	Title string `json:"title"`
	// Message 版本说明
	Message string `json:"message"`
	// CreatedBy 创建者
	CreatedBy string `json:"created_by"`
	// CreatedAt 创建时间
	CreatedAt string `json:"created_at"`
}

// VersionDiffRes 版本差异对比响应。
type VersionDiffRes struct {
	// DashboardID 仪表盘ID
	DashboardID string `json:"dashboard_id"`
	// VersionFrom 起始版本号
	VersionFrom int `json:"version_from"`
	// VersionTo 目标版本号
	VersionTo int `json:"version_to"`
	// TitleFrom 起始版本标题
	TitleFrom string `json:"title_from"`
	// TitleTo 目标版本标题
	TitleTo string `json:"title_to"`
	// CreatedAtFrom 起始版本创建时间
	CreatedAtFrom string `json:"created_at_from"`
	// CreatedAtTo 目标版本创建时间
	CreatedAtTo string `json:"created_at_to"`
	// DiffJSON 差异内容（JSON格式）
	DiffJSON map[string]interface{} `json:"diff_json"`
	// JSONFrom 起始版本JSON
	JSONFrom map[string]interface{} `json:"json_from"`
	// JSONTo 目标版本JSON
	JSONTo map[string]interface{} `json:"json_to"`
}
