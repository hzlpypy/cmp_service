// Package panels 提供面板管理功能的数据模型定义。
// 面板是仪表板中的可视化图表单元，支持柱状图、折线图、饼图、仪表盘、表格等多种类型。
package panels

import "cmp_service_backend/model"

// PanelReq 面板操作请求参数。
// 用于创建和更新面板。
type PanelReq struct {
	// ID 面板主键ID（更新/删除时必填）
	ID string `json:"id"`
	// DashboardID 所属仪表板ID
	DashboardID string `json:"dashboard_id"`
	// Title 面板标题
	Title string `json:"title"`
	// Type 图表类型：bar（柱状图）、line（折线图）、pie（饼图）、gauge（仪表盘）、table（表格）
	Type string `json:"type"`
	// GridPosX 网格布局X坐标（列起始位置）
	GridPosX int `json:"grid_pos_x"`
	// GridPosY 网格布局Y坐标（行起始位置）
	GridPosY int `json:"grid_pos_y"`
	// GridPosW 网格布局宽度（列跨度）
	GridPosW int `json:"grid_pos_w"`
	// GridPosH 网格布局高度（行跨度）
	GridPosH int `json:"grid_pos_h"`
	// Datasource 数据源配置（JSON格式）
	Datasource model.JSONMap `json:"datasource"`
	// Options 图表选项配置（JSON格式，如颜色、图例、阈值等）
	Options model.JSONMap `json:"options"`
	// SortOrder 排序序号
	SortOrder int `json:"sort_order"`
}

// PanelRes 面板详情响应结构。
type PanelRes struct {
	// ID 面板主键ID
	ID string `json:"id"`
	// DashboardID 所属仪表板ID
	DashboardID string `json:"dashboard_id"`
	// Title 面板标题
	Title string `json:"title"`
	// Type 图表类型
	Type string `json:"type"`
	// GridPosX 网格布局X坐标
	GridPosX int `json:"grid_pos_x"`
	// GridPosY 网格布局Y坐标
	GridPosY int `json:"grid_pos_y"`
	// GridPosW 网格布局宽度
	GridPosW int `json:"grid_pos_w"`
	// GridPosH 网格布局高度
	GridPosH int `json:"grid_pos_h"`
	// Datasource 数据源配置
	Datasource interface{} `json:"datasource"`
	// Options 图表选项配置
	Options interface{} `json:"options"`
	// SortOrder 排序序号
	SortOrder int `json:"sort_order"`
	// CreatedAt 创建时间（ISO 8601 格式）
	CreatedAt string `json:"created_at"`
	// UpdatedAt 最后更新时间（ISO 8601 格式）
	UpdatedAt string `json:"updated_at"`
}

// ToPanelRes 将 GORM 模型 Panel 转换为 API 响应结构。
// 时间字段统一格式化为 ISO 8601 东八区时间。
func ToPanelRes(m *model.Panel) *PanelRes {
	return &PanelRes{
		ID:          m.ID,
		DashboardID: m.DashboardID,
		Title:       m.Title,
		Type:        m.Type,
		GridPosX:    m.GridPosX,
		GridPosY:    m.GridPosY,
		GridPosW:    m.GridPosW,
		GridPosH:    m.GridPosH,
		Datasource:  m.Datasource,
		Options:     m.Options,
		SortOrder:   m.SortOrder,
		CreatedAt:   m.CreatedAt.Format("2006-01-02T15:04:05+08:00"),
		UpdatedAt:   m.UpdatedAt.Format("2006-01-02T15:04:05+08:00"),
	}
}
