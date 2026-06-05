// Package business_systems 提供业务系统查询的 HTTP 控制器层。
// 负责请求参数绑定、调用业务逻辑层、返回统一格式的 JSON 响应。
package business_systems

import (
	"github.com/gin-gonic/gin"
)

// Controller 业务系统控制器，嵌入业务接口 Interface。
// 通过组合模式将 HTTP 层与业务逻辑层解耦。
type Controller struct {
	Interface
}

// NewController 创建业务系统控制器实例。
// 参数 svc 为实现了 Interface 接口的业务服务。
func NewController(svc Interface) *Controller {
	return &Controller{Interface: svc}
}

// GetBusinessSystemsController 获取业务系统引用配置数据。
// POST /api/v1/ops_dbapi/api/business_systems
// 请求体包含 BusinessSystemsReq。
// 返回业务系统的 references 引用数据（JSON格式）。
func (cont *Controller) GetBusinessSystemsController(ctx *gin.Context) {
	var req BusinessSystemsReq
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
	resp, err := cont.GetBusinessSystems(ctx, &req)
	if err != nil {
		ctx.JSON(500, gin.H{
			"errorCode":    "50000",
			"errorMessage": "Failed to get business systems: " + err.Error(),
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
