// Package folders 提供文件夹管理功能的数据模型定义。
// 包含请求/响应结构体以及模型转换函数。
package folders

import "cmp_service_backend/model"

// FolderReq 文件夹操作请求参数。
// 用于创建、更新和删除文件夹。
type FolderReq struct {
	// ID 文件夹主键ID（更新/删除时必填）
	ID string `json:"id"`
	// UID 文件夹唯一标识符（用于 URL 路径等场景）
	UID string `json:"uid"`
	// Title 文件夹名称
	Title string `json:"title"`
}

// FolderRes 文件夹详情响应结构。
// 包含文件夹基本信息及其下所有仪表板的简要信息。
type FolderRes struct {
	// ID 文件夹主键ID
	ID string `json:"id"`
	// UID 文件夹唯一标识符
	UID string `json:"uid"`
	// Title 文件夹名称
	Title string `json:"title"`
	// Dashboards 文件夹下的仪表板列表（简要信息）
	Dashboards []DashboardBriefRes `json:"dashboards"`
	// CreatedAt 创建时间（ISO 8601 格式）
	CreatedAt string `json:"created_at"`
	// UpdatedAt 最后更新时间（ISO 8601 格式）
	UpdatedAt string `json:"updated_at"`
}

// DashboardBriefRes 仪表板简要信息。
// 用于文件夹列表中的仪表板预览，不包含面板详情。
type DashboardBriefRes struct {
	// ID 仪表板主键ID
	ID string `json:"id"`
	// OwnerID 创建者用户ID
	OwnerID string `json:"owner_id"`
	// CanEdit 当前用户是否有编辑权限（用于前端只读模式）
	CanEdit bool `json:"can_edit"`
	// CanDelete 当前用户是否有删除权限（仅拥有者/admin，分享编辑者不可删除）
	CanDelete bool `json:"can_delete"`
	// Source 来源分组：mine(我的) / shared(分享给我的) / team(团队/部门可见)
	Source string `json:"source"`
	// OwnerName 创建人姓名（用于团队仪表板分组展示归属）
	OwnerName string `json:"owner_name,omitempty"`
	// TeamName 创建人所属团队名（用于部长视角按团队二级分组）
	TeamName string `json:"team_name,omitempty"`
	// Title 仪表板标题
	Title string `json:"title"`
	// FolderID 所属文件夹ID
	FolderID string `json:"folder_id"`
	// FolderName 所属文件夹名称（搜索结果中使用）
	FolderName string `json:"folder_name,omitempty"`
	// CreatedAt 创建时间
	CreatedAt string `json:"created_at"`
	// UpdatedAt 最后更新时间
	UpdatedAt string `json:"updated_at"`
}

// SearchItemRes 搜索结果项。
// 用于搜索响应，可以是文件夹或仪表板。
type SearchItemRes struct {
	// ID 唯一标识符
	ID string `json:"id"`
	// Title 标题
	Title string `json:"title"`
	// Type 类型：folder（文件夹）或 dashboard（仪表板）
	Type string `json:"type"`
	// FolderName 所属文件夹名称（仅仪表板类型）
	FolderName string `json:"folder_name,omitempty"`
	// FolderID 所属文件夹ID（仅仪表板类型）
	FolderID string `json:"folder_id,omitempty"`
	// CreatedAt 创建时间
	CreatedAt string `json:"created_at"`
	// UpdatedAt 最后更新时间
	UpdatedAt string `json:"updated_at"`
}

// FolderListReq 文件夹列表查询请求参数。
type FolderListReq struct {
	// Title 可选，按仪表板标题模糊搜索
	Title string `json:"title"`
}

// FolderListRes 文件夹列表响应结构。
type FolderListRes struct {
	// List 文件夹列表
	List []*FolderRes `json:"list"`
	// Total 文件夹总数
	Total int `json:"total"`
}

// ToFolderRes 将 GORM 模型 Folder 转换为 API 响应结构。
// 参数：
//   - m：数据库中的 Folder 模型
//   - dashboards：该文件夹下的仪表板列表
//
// 返回格式化后的 FolderRes，时间字段统一格式化为 ISO 8601 东八区时间。
func ToFolderRes(m *model.Folder, dashboards []model.Dashboard) *FolderRes {
	// 转换仪表板列表为简要响应结构
	dbList := make([]DashboardBriefRes, 0, len(dashboards))
	for _, d := range dashboards {
		dbList = append(dbList, DashboardBriefRes{
			ID:        d.ID,
			OwnerID:   d.OwnerID,
			Title:     d.Title,
			FolderID:  d.FolderID,
			CreatedAt: d.CreatedAt.Format("2006-01-02T15:04:05+08:00"),
			UpdatedAt: d.UpdatedAt.Format("2006-01-02T15:04:05+08:00"),
		})
	}
	return &FolderRes{
		ID:         m.ID,
		UID:        m.UID,
		Title:      m.Title,
		Dashboards: dbList,
		CreatedAt:  m.CreatedAt.Format("2006-01-02T15:04:05+08:00"),
		UpdatedAt:  m.UpdatedAt.Format("2006-01-02T15:04:05+08:00"),
	}
}
