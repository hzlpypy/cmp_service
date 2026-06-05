// Package panels 提供面板管理的业务逻辑层。
// 实现面板的创建、更新、删除操作，支持多种图表类型和网格布局配置。
package panels

import (
	"cmp_service_backend/model"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

// Server 面板业务服务，持有数据库连接和日志记录器。
type Server struct {
	db  *gorm.DB
	log *logrus.Logger
}

// Interface 定义面板业务操作的接口。
// 用于解耦控制器层和业务逻辑层，便于单元测试。
type Interface interface {
	// CreatePanel 创建新面板
	CreatePanel(ctx *gin.Context, req *PanelReq) (*PanelRes, error)
	// UpdatePanel 更新面板配置
	UpdatePanel(ctx *gin.Context, req *PanelReq) (*PanelRes, error)
	// DeletePanel 删除面板（软删除）
	DeletePanel(ctx *gin.Context, req *PanelReq) error
}

// NewServer 创建面板业务服务实例。
func NewServer(db *gorm.DB, log *logrus.Logger) Interface {
	return &Server{db: db, log: log}
}

// CreatePanel 创建新面板。
// 提供合理的默认值：
//   - 图表类型默认为 bar（柱状图）
//   - 网格宽度默认为 12（全宽）
//   - 网格高度默认为 7
//   - Datasource 和 Options 默认为空 JSONMap
//
// ID 格式：panel-{纳秒时间戳}
func (s *Server) CreatePanel(ctx *gin.Context, req *PanelReq) (*PanelRes, error) {
	record := &model.Panel{
		DashboardID: req.DashboardID,
		Title:       req.Title,
		Type:        req.Type,
		GridPosX:    req.GridPosX,
		GridPosY:    req.GridPosY,
		GridPosW:    req.GridPosW,
		GridPosH:    req.GridPosH,
		Datasource:  req.Datasource,
		Options:     req.Options,
		SortOrder:   req.SortOrder,
	}
	// 设置默认值：未指定类型时默认为柱状图
	if record.Type == "" {
		record.Type = "bar"
	}
	// 未指定宽度时默认占满一行（12列）
	if record.GridPosW == 0 {
		record.GridPosW = 12
	}
	// 未指定高度时默认 7 行
	if record.GridPosH == 0 {
		record.GridPosH = 7
	}
	// 确保 JSON 字段初始化为空对象而非 null
	if record.Datasource == nil {
		record.Datasource = model.JSONMap{}
	}
	if record.Options == nil {
		record.Options = model.JSONMap{}
	}
	// 生成面板唯一ID
	record.ID = generatePanelID()
	if err := s.db.Create(record).Error; err != nil {
		return nil, err
	}
	return ToPanelRes(record), nil
}

// UpdatePanel 更新面板的所有可配置字段。
// 仅更新未软删除的记录。
// Datasource 和 Options 为 nil 时不更新对应字段。
func (s *Server) UpdatePanel(ctx *gin.Context, req *PanelReq) (*PanelRes, error) {
	updates := map[string]interface{}{
		"title":      req.Title,
		"type":       req.Type,
		"grid_pos_x": req.GridPosX,
		"grid_pos_y": req.GridPosY,
		"grid_pos_w": req.GridPosW,
		"grid_pos_h": req.GridPosH,
		"sort_order": req.SortOrder,
	}
	// JSON 字段仅在非 nil 时更新，避免覆盖为 null
	if req.Datasource != nil {
		updates["datasource"] = req.Datasource
	}
	if req.Options != nil {
		updates["options"] = req.Options
	}
	if err := s.db.Model(&model.Panel{}).Where("id = ? AND deleted_at IS NULL", req.ID).Updates(updates).Error; err != nil {
		return nil, err
	}
	// 查询更新后的记录
	var record model.Panel
	s.db.Where("id = ?", req.ID).First(&record)
	return ToPanelRes(&record), nil
}

// DeletePanel 软删除面板。
// GORM 会自动设置 deleted_at 时间戳，而非物理删除数据。
func (s *Server) DeletePanel(ctx *gin.Context, req *PanelReq) error {
	return s.db.Where("id = ?", req.ID).Delete(&model.Panel{}).Error
}

// generatePanelID 生成面板的唯一ID（最多19字符）。
// 格式：panel-{13位毫秒时间戳}
func generatePanelID() string {
	return fmt.Sprintf("panel-%d", time.Now().UnixMilli())
}
