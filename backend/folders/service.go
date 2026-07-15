// Package folders 提供文件夹管理的业务逻辑层。
// 实现文件夹的增删改查操作，包括与仪表板的关联查询。
package folders

import (
	"cmp_service_backend/model"
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

// Server 文件夹业务服务，持有数据库连接和日志记录器。
type Server struct {
	db  *gorm.DB
	log *logrus.Logger
}

// Interface 定义文件夹业务操作的接口。
// 用于解耦控制器层和业务逻辑层，便于单元测试。
type Interface interface {
	// ListFolders 获取所有文件夹列表（含子仪表板），支持按标题搜索
	ListFolders(ctx *gin.Context, req *FolderListReq) (*FolderListRes, error)
	// GetFolder 获取单个文件夹详情
	GetFolder(ctx *gin.Context, req *FolderReq) (*FolderRes, error)
	// CreateFolder 创建新文件夹
	CreateFolder(ctx *gin.Context, req *FolderReq) (*FolderRes, error)
	// UpdateFolder 更新文件夹信息
	UpdateFolder(ctx *gin.Context, req *FolderReq) (*FolderRes, error)
	// DeleteFolder 删除文件夹（软删除）
	DeleteFolder(ctx *gin.Context, req *FolderReq) error
}

// NewServer 创建文件夹业务服务实例。
func NewServer(db *gorm.DB, log *logrus.Logger) Interface {
	return &Server{db: db, log: log}
}

// ListFolders 获取所有未删除的文件夹，按创建时间升序排列。
// 每个文件夹会附带其下所有未删除的仪表板列表。
// 如果提供了 title 参数，则返回匹配的文件夹和仪表板作为搜索结果。
func (s *Server) ListFolders(ctx *gin.Context, req *FolderListReq) (*FolderListRes, error) {
	// 搜索模式：返回匹配的文件夹和仪表板
	if req.Title != "" {
		var folders []*model.Folder
		// 查询所有文件夹（用于后续查询）
		if err := s.db.Where("deleted_at IS NULL").Order("created_at ASC").Find(&folders).Error; err != nil {
			return nil, err
		}

		resList := make([]*FolderRes, 0, len(folders))
		for _, f := range folders {
			var dashboards []model.Dashboard
			// 搜索文件夹下的仪表板（模糊匹配标题）
			s.db.Where("folder_id = ? AND deleted_at IS NULL AND title LIKE ?", f.ID, "%"+req.Title+"%").
				Order("created_at ASC").Find(&dashboards)

			// 如果文件夹标题匹配或包含仪表板匹配，则添加到结果
			if len(dashboards) > 0 || strings.Contains(f.Title, req.Title) {
				resList = append(resList, ToFolderRes(f, dashboards))
			}
		}
		return &FolderListRes{List: resList, Total: len(resList)}, nil
	}

	// 默认模式：返回所有文件夹及其仪表板
	var folders []*model.Folder
	if err := s.db.Where("deleted_at IS NULL").Order("created_at ASC").Find(&folders).Error; err != nil {
		return nil, err
	}
	resList := make([]*FolderRes, 0, len(folders))
	for _, f := range folders {
		var dashboards []model.Dashboard
		s.db.Where("folder_id = ? AND deleted_at IS NULL", f.ID).Order("created_at ASC").Find(&dashboards)
		resList = append(resList, ToFolderRes(f, dashboards))
	}
	return &FolderListRes{List: resList, Total: len(resList)}, nil
}

// GetFolder 根据 ID 获取单个文件夹，包含其下的仪表板列表。
func (s *Server) GetFolder(ctx *gin.Context, req *FolderReq) (*FolderRes, error) {
	var record model.Folder
	// 查询指定文件夹（仅未删除的）
	if err := s.db.Where("id = ? AND deleted_at IS NULL", req.ID).First(&record).Error; err != nil {
		return nil, err
	}
	// 查询该文件夹下的仪表板
	var dashboards []model.Dashboard
	s.db.Where("folder_id = ? AND deleted_at IS NULL", record.ID).Find(&dashboards)
	return ToFolderRes(&record, dashboards), nil
}

// CreateFolder 创建新文件夹。
// 如果未提供 UID，则默认使用 Title 作为 UID。
// ID 通过 generateID() 生成带前缀的唯一标识符。
func (s *Server) CreateFolder(ctx *gin.Context, req *FolderReq) (*FolderRes, error) {
	record := &model.Folder{
		UID:   req.UID,
		Title: req.Title,
	}
	// UID 为空时默认使用 Title
	if record.UID == "" {
		record.UID = req.Title
	}
	// 生成文件夹唯一ID（格式：f-{纳秒时间戳}）
	record.ID = generateID()
	if err := s.db.Create(record).Error; err != nil {
		return nil, err
	}
	return ToFolderRes(record, nil), nil
}

// UpdateFolder 更新文件夹的 title 和 uid。
// 仅更新未软删除的记录。
func (s *Server) UpdateFolder(ctx *gin.Context, req *FolderReq) (*FolderRes, error) {
	updates := map[string]interface{}{
		"title": req.Title,
		"uid":   req.UID,
	}
	if err := s.db.Model(&model.Folder{}).Where("id = ? AND deleted_at IS NULL", req.ID).Updates(updates).Error; err != nil {
		return nil, err
	}
	// 查询更新后的记录并返回
	var record model.Folder
	s.db.Where("id = ?", req.ID).First(&record)
	var dashboards []model.Dashboard
	s.db.Where("folder_id = ? AND deleted_at IS NULL", record.ID).Find(&dashboards)
	return ToFolderRes(&record, dashboards), nil
}

// DeleteFolder 软删除文件夹。
// GORM 会自动设置 deleted_at 时间戳，而非物理删除。
func (s *Server) DeleteFolder(ctx *gin.Context, req *FolderReq) error {
	return s.db.Where("id = ?", req.ID).Delete(&model.Folder{}).Error
}

// generateID 生成文件夹的唯一ID（最多19字符）。
// 格式：f-{13位毫秒时间戳}
func generateID() string {
	return fmt.Sprintf("f-%d", time.Now().UnixMilli())
}
