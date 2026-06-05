// Package network_metrics 提供网络指标查询的路由注册。
// 对应存量 cmp_service 接口，路径格式保持与原有系统一致。
package network_metrics

import "github.com/gin-gonic/gin"

// RegisterNetworkMetricsRouter 注册网络指标相关的 HTTP 路由到 Gin 引擎。
// 路由前缀：/api/v1/ops_dbapi/api
//
// 接口列表：
//   - POST /network_metrics  - 查询网络指标数据（可选按日期过滤）
func RegisterNetworkMetricsRouter(e *gin.Engine, c *Controller) {
	api := e.Group("/api/v1/ops_dbapi/api")
	{
		api.POST("/network_metrics", c.GetNetworkMetricsController)
	}
}
