// Package variables 提供仪表盘变量管理的 HTTP 控制器层。
// 负责处理 HTTP 请求，调用业务逻辑层，返回 JSON 响应。
package variables

import (
	"github.com/gin-gonic/gin"
)

// Controller 变量控制器，持有业务服务实例。
type Controller struct {
	svc Interface
}

// NewController 创建变量控制器实例。
func NewController(svc Interface) *Controller {
	return &Controller{svc: svc}
}

// ListVariables 获取仪表盘的变量列表。
// POST /api/v1/variables/list
func (c *Controller) ListVariables(ctx *gin.Context) {
	var req VariableListReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}

	result, err := c.svc.ListVariables(ctx, req.DashboardID)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}

	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": result})
}

// GetVariable 获取单个变量详情。
// POST /api/v1/variables/get
func (c *Controller) GetVariable(ctx *gin.Context) {
	var req VariableReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}

	if req.ID == "" {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "id is required", "success": false})
		return
	}

	result, err := c.svc.GetVariable(ctx, &req)
	if err != nil {
		ctx.JSON(404, gin.H{"errorCode": "40400", "errorMessage": err.Error(), "success": false})
		return
	}

	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": result})
}

// CreateVariable 创建新变量。
// POST /api/v1/variables/create
func (c *Controller) CreateVariable(ctx *gin.Context) {
	var req VariableReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}

	result, err := c.svc.CreateVariable(ctx, &req)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}

	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": result})
}

// UpdateVariable 更新变量。
// POST /api/v1/variables/update
func (c *Controller) UpdateVariable(ctx *gin.Context) {
	var req VariableReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}

	if req.ID == "" {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "id is required", "success": false})
		return
	}

	result, err := c.svc.UpdateVariable(ctx, &req)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}

	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": result})
}

// DeleteVariable 删除变量。
// POST /api/v1/variables/delete
func (c *Controller) DeleteVariable(ctx *gin.Context) {
	var req VariableReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}

	if req.ID == "" {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "id is required", "success": false})
		return
	}

	if err := c.svc.DeleteVariable(ctx, &req); err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}

	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true})
}

// GetVariableValues 获取变量的可选值。
// POST /api/v1/variables/values
func (c *Controller) GetVariableValues(ctx *gin.Context) {
	var req VariableValuesReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}

	result, err := c.svc.GetVariableValues(ctx, &req)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}

	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": result})
}
