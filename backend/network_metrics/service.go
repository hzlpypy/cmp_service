// Package network_metrics 提供网络指标查询功能（存量接口）。
// 查询各类网络链路的监控指标，支持按日期过滤。
package network_metrics

import (
	"cmp_service_backend/model"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

// Server 网络指标业务服务，持有数据库连接和日志记录器。
type Server struct {
	db  *gorm.DB
	log *logrus.Logger
}

// Interface 定义网络指标业务操作的接口。
// 用于解耦控制器层和业务逻辑层，便于单元测试。
type Interface interface {
	// GetNetworkMetrics 获取网络指标数据
	GetNetworkMetrics(ctx *gin.Context, req *NetworkMetricsReq) ([]*NetworkMetricsRes, error)
}

// NewServer 创建网络指标业务服务实例。
func NewServer(db *gorm.DB, log *logrus.Logger) Interface {
	return &Server{db: db, log: log}
}

// GetNetworkMetrics 获取网络指标数据列表。
// 支持按日期（params.date）过滤，日期为空时返回全部数据。
// 查询的是数据库中的原始表（NetWorkMetrics），字段名映射到前端期望的驼峰格式。
func (s *Server) GetNetworkMetrics(ctx *gin.Context, req *NetworkMetricsReq) ([]*NetworkMetricsRes, error) {
	var records []model.NetWorkMetrics
	query := s.db.Model(&model.NetWorkMetrics{})
	// 按日期过滤（基于 created_at 字段的日期部分）
	if req.Params.Date != "" {
		query = query.Where("DATE(created_at) = ?", req.Params.Date)
	}
	if err := query.Find(&records).Error; err != nil {
		return nil, err
	}
	// 转换为响应结构，字段名适配前端接口
	result := make([]*NetworkMetricsRes, 0, len(records))
	for _, r := range records {
		result = append(result, &NetworkMetricsRes{
			ID:             r.ID,
			CreatedAt:      r.CreatedAt.Format("2006-01-02T15:04:05+08:00"),
			MetricCategory: r.Category,      // 数据库 category -> metric_category
			MetricName:     r.Metrics,       // 数据库 metrics -> metric_name
			CurrentValue:   r.CurrentValue,
			HistoricalPeak: r.HistoricalPeak,
			MomChange:      r.DodChange,    // 数据库 dod_change -> mom_change（日环比）
			NodeType:       r.Node,          // 数据库 node -> node_type
			Unit:           r.Unit,
			UpdatedAt:      r.UpdatedAt.Format("2006-01-02T15:04:05+08:00"),
			YoyChange:      r.WowChange,    // 数据库 wow_change -> yoy_change（周同比）
		})
	}
	return result, nil
}
