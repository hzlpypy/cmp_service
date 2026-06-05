// Package datasources 提供数据源管理的 HTTP 控制器层。
// 负责请求参数绑定、调用业务逻辑层、返回统一格式的 JSON 响应。
package datasources

import "github.com/gin-gonic/gin"

// Controller 数据源控制器，嵌入业务接口 Interface。
// 通过组合模式将 HTTP 层与业务逻辑层解耦。
type Controller struct{ Interface }

// NewController 创建数据源控制器实例。
// 参数 svc 为实现了 Interface 接口的业务服务。
func NewController(svc Interface) *Controller { return &Controller{Interface: svc} }

// ListDatasourcesController 获取数据源列表。
// GET /api/v1/datasources/list
// 无需请求参数，返回所有未删除的数据源。
func (cont *Controller) ListDatasourcesController(ctx *gin.Context) {
	resp, err := cont.ListDatasources(ctx)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// GetDatasourceController 获取单个数据源详情。
// POST /api/v1/datasources/get
// 请求体包含 DatasourceReq（需提供 id）。
func (cont *Controller) GetDatasourceController(ctx *gin.Context) {
	var req DatasourceReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	resp, err := cont.GetDatasource(ctx, &req)
	if err != nil {
		ctx.JSON(404, gin.H{"errorCode": "40400", "errorMessage": "Datasource not found", "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// CreateDatasourceController 创建新数据源。
// POST /api/v1/datasources/create
// 请求体包含 DatasourceReq（需提供 name、type、url）。
func (cont *Controller) CreateDatasourceController(ctx *gin.Context) {
	var req DatasourceReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	resp, err := cont.CreateDatasource(ctx, &req)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(201, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// UpdateDatasourceController 更新数据源配置。
// POST /api/v1/datasources/update
// 请求体包含 DatasourceReq（需提供 id 和要更新的字段）。
func (cont *Controller) UpdateDatasourceController(ctx *gin.Context) {
	var req DatasourceReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	resp, err := cont.UpdateDatasource(ctx, &req)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// DeleteDatasourceController 删除数据源（GORM 软删除）。
// POST /api/v1/datasources/delete
// 请求体包含 DatasourceReq（需提供 id）。
func (cont *Controller) DeleteDatasourceController(ctx *gin.Context) {
	var req DatasourceReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	if err := cont.DeleteDatasource(ctx, &req); err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true})
}

// TestDatasourceController 测试数据源连接。
// POST /api/v1/datasources/test
// 请求体包含 DatasourceReq（需提供 id），返回连接测试结果消息。
func (cont *Controller) TestDatasourceController(ctx *gin.Context) {
	var req DatasourceReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	msg, err := cont.TestDatasource(ctx, &req)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": msg, "success": true})
}
