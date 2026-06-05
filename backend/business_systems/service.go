// Package business_systems 提供业务系统查询功能（存量接口）。
// 查询业务系统的引用配置信息。
package business_systems

import (
	"cmp_service_backend/model"
	"encoding/json"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

// Server 业务系统服务，持有数据库连接和日志记录器。
type Server struct {
	db  *gorm.DB
	log *logrus.Logger
}

// Interface 定义业务系统操作的接口。
// 用于解耦控制器层和业务逻辑层，便于单元测试。
type Interface interface {
	// GetBusinessSystems 获取业务系统引用数据
	GetBusinessSystems(ctx *gin.Context, req *BusinessSystemsReq) (*BusinessSystemsRes, error)
}

// NewServer 创建业务系统服务实例。
func NewServer(db *gorm.DB, log *logrus.Logger) Interface {
	return &Server{db: db, log: log}
}

// GetBusinessSystems 获取业务系统的引用配置数据。
// 从数据库中读取第一条记录，将其 references 字段（JSON字符串）反序列化为结构化对象返回。
// 如果 JSON 解析失败，则返回原始字符串。
func (s *Server) GetBusinessSystems(ctx *gin.Context, req *BusinessSystemsReq) (*BusinessSystemsRes, error) {
	var record model.BusinessSystems
	// 查询第一条业务系统记录
	if err := s.db.Model(&model.BusinessSystems{}).First(&record).Error; err != nil {
		return nil, err
	}
	// 尝试将 references JSON 字符串反序列化为结构化对象
	var references interface{}
	if record.References != "" {
		if err := json.Unmarshal([]byte(record.References), &references); err != nil {
			// 解析失败时返回原始字符串
			references = record.References
		}
	}
	return &BusinessSystemsRes{
		References: references,
	}, nil
}
