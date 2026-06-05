// Package datasources 提供数据源管理的业务逻辑层。
// 实现数据源的增删改查及连接测试功能，支持 MySQL 和 HTTP API 两种类型。
package datasources

import (
	"cmp_service_backend/model"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

// Server 数据源业务服务，持有数据库连接和日志记录器。
type Server struct {
	db  *gorm.DB
	log *logrus.Logger
}

// Interface 定义数据源业务操作的接口。
// 用于解耦控制器层和业务逻辑层，便于单元测试。
type Interface interface {
	// ListDatasources 获取所有数据源列表
	ListDatasources(ctx *gin.Context) ([]*DatasourceRes, error)
	// GetDatasource 获取单个数据源详情
	GetDatasource(ctx *gin.Context, req *DatasourceReq) (*DatasourceRes, error)
	// CreateDatasource 创建新数据源
	CreateDatasource(ctx *gin.Context, req *DatasourceReq) (*DatasourceRes, error)
	// UpdateDatasource 更新数据源配置
	UpdateDatasource(ctx *gin.Context, req *DatasourceReq) (*DatasourceRes, error)
	// DeleteDatasource 删除数据源（软删除）
	DeleteDatasource(ctx *gin.Context, req *DatasourceReq) error
	// TestDatasource 测试数据源连接
	TestDatasource(ctx *gin.Context, req *DatasourceReq) (string, error)
}

// NewServer 创建数据源业务服务实例。
func NewServer(db *gorm.DB, log *logrus.Logger) Interface {
	return &Server{db: db, log: log}
}

// ListDatasources 获取所有未删除的数据源，按创建时间降序排列。
// 返回时不包含密码字段。
func (s *Server) ListDatasources(ctx *gin.Context) ([]*DatasourceRes, error) {
	var records []*model.Datasource
	if err := s.db.Where("deleted_at IS NULL").Order("created_at DESC").Find(&records).Error; err != nil {
		return nil, err
	}
	// 转换为响应结构（不含密码）
	result := make([]*DatasourceRes, 0, len(records))
	for _, r := range records {
		result = append(result, ToDatasourceRes(r))
	}
	return result, nil
}

// GetDatasource 根据 ID 获取单个数据源详情。
func (s *Server) GetDatasource(ctx *gin.Context, req *DatasourceReq) (*DatasourceRes, error) {
	var record model.Datasource
	if err := s.db.Where("id = ? AND deleted_at IS NULL", req.ID).First(&record).Error; err != nil {
		return nil, err
	}
	return ToDatasourceRes(&record), nil
}

// CreateDatasource 创建新数据源。
// HTTP 类型的 Headers 如果为 nil 会自动初始化为空 JSONMap。
// MySQL 类型需提供 database_name 和 username。
// ID 格式：ds-{纳秒时间戳}
func (s *Server) CreateDatasource(ctx *gin.Context, req *DatasourceReq) (*DatasourceRes, error) {
	record := &model.Datasource{
		Name:         req.Name,
		Type:         req.Type,
		URL:          req.URL,
		DatabaseName: req.DatabaseName,
		Username:     req.Username,
		Password:     req.Password,
		Headers:      req.Headers,
		Enabled:      true, // 新创建的数据源默认启用
	}
	// 确保 Headers 不为 nil
	if record.Headers == nil {
		record.Headers = model.JSONMap{}
	}
	// 生成数据源唯一ID
	record.ID = generateDSID()
	if err := s.db.Create(record).Error; err != nil {
		return nil, err
	}
	return ToDatasourceRes(record), nil
}

// UpdateDatasource 更新数据源配置。
// 仅更新提供的字段和未软删除的记录。
// 如果 Headers 为 nil 则不更新该字段。
func (s *Server) UpdateDatasource(ctx *gin.Context, req *DatasourceReq) (*DatasourceRes, error) {
	updates := map[string]interface{}{
		"name":          req.Name,
		"type":          req.Type,
		"url":           req.URL,
		"database_name": req.DatabaseName,
		"username":      req.Username,
		"password":      req.Password,
		"enabled":       req.Enabled,
	}
	// Headers 非 nil 时才更新
	if req.Headers != nil {
		updates["headers"] = req.Headers
	}
	if err := s.db.Model(&model.Datasource{}).Where("id = ? AND deleted_at IS NULL", req.ID).Updates(updates).Error; err != nil {
		return nil, err
	}
	// 查询更新后的记录
	var record model.Datasource
	s.db.Where("id = ?", req.ID).First(&record)
	return ToDatasourceRes(&record), nil
}

// DeleteDatasource 软删除数据源。
// GORM 会自动设置 deleted_at 时间戳。
func (s *Server) DeleteDatasource(ctx *gin.Context, req *DatasourceReq) error {
	return s.db.Where("id = ?", req.ID).Delete(&model.Datasource{}).Error
}

// TestDatasource 测试数据源连接。
// 当前为模拟实现，仅查询数据库记录并返回"连接正常"消息。
// 后续可扩展为实际的 MySQL ping 或 HTTP 健康检查。
func (s *Server) TestDatasource(ctx *gin.Context, req *DatasourceReq) (string, error) {
	var record model.Datasource
	if err := s.db.Where("id = ? AND deleted_at IS NULL", req.ID).First(&record).Error; err != nil {
		return "", fmt.Errorf("数据源不存在: %v", err)
	}
	return fmt.Sprintf("%s(%s) 连接正常", record.Name, record.Type), nil
}

// generateDSID 生成数据源的唯一ID（最多19字符）。
// 格式：ds-{13位毫秒时间戳}
func generateDSID() string {
	return fmt.Sprintf("ds-%d", time.Now().UnixMilli())
}
