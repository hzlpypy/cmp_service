// Package network_metrics 提供网络指标查询的 HTTP 控制器层。
// 负责请求参数绑定、调用业务逻辑层、返回统一格式的 JSON 响应。
package network_metrics

import (
	"github.com/gin-gonic/gin"
)

// Controller 网络指标控制器，嵌入业务接口 Interface。
// 通过组合模式将 HTTP 层与业务逻辑层解耦。
type Controller struct {
	Interface
}

// NewController 创建网络指标控制器实例。
// 参数 svc 为实现了 Interface 接口的业务服务。
func NewController(svc Interface) *Controller {
	return &Controller{Interface: svc}
}

// GetNetworkMetricsController 获取网络指标数据。
// POST /api/v1/ops_dbapi/api/network_metrics
// 请求体包含 NetworkMetricsReq（可选 params.date 过滤日期）。
// 返回网络链路的监控指标列表，包括当前值、历史峰值、日环比、周同比等。
func (cont *Controller) GetNetworkMetricsController(ctx *gin.Context) {
	var req NetworkMetricsReq
	// 绑定 JSON 请求体
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{
			"errorCode":    "40001",
			"errorMessage": "Invalid request: " + err.Error(),
			"success":      false,
		})
		return
	}
	// 调用业务层获取数据
	resp, err := cont.GetNetworkMetrics(ctx, &req)
	if err != nil {
		ctx.JSON(500, gin.H{
			"errorCode":    "50000",
			"errorMessage": "Failed to get network metrics: " + err.Error(),
			"success":      false,
		})
		return
	}
	// 返回成功响应
	ctx.JSON(200, gin.H{
		"errorCode":    "00000",
		"errorMessage": "",
		"success":      true,
		"data":         resp,
	})
}
