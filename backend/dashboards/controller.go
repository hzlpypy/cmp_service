// Package dashboards 提供仪表板管理的 HTTP 控制器层。
// 负责请求参数绑定、调用业务逻辑层、返回统一格式的 JSON 响应。
package dashboards

import "github.com/gin-gonic/gin"

// Controller 仪表板控制器，嵌入业务接口 Interface。
type Controller struct{ Interface }

// NewController 创建仪表板控制器实例。
func NewController(svc Interface) *Controller { return &Controller{Interface: svc} }

// ListDashboardsController 获取仪表板列表。
// POST /api/v1/dashboards/list
func (cont *Controller) ListDashboardsController(ctx *gin.Context) {
	var req DashboardListReq
	ctx.ShouldBindJSON(&req)
	resp, err := cont.ListDashboards(ctx, req.FolderID)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// GetDashboardController 获取单个仪表板详情（含面板列表和 dashboard_json）。
// POST /api/v1/dashboards/get
func (cont *Controller) GetDashboardController(ctx *gin.Context) {
	var req DashboardReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	resp, err := cont.GetDashboard(ctx, &req)
	if err != nil {
		ctx.JSON(404, gin.H{"errorCode": "40400", "errorMessage": "Dashboard not found", "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// CreateDashboardController 创建新仪表板（含 dashboard_json）。
// POST /api/v1/dashboards/create
func (cont *Controller) CreateDashboardController(ctx *gin.Context) {
	var req DashboardReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	resp, err := cont.CreateDashboard(ctx, &req)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(201, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// UpdateDashboardController 更新仪表板信息（含 dashboard_json）。
// POST /api/v1/dashboards/update
func (cont *Controller) UpdateDashboardController(ctx *gin.Context) {
	var req DashboardReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	resp, err := cont.UpdateDashboard(ctx, &req)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// DeleteDashboardController 删除仪表板（GORM 软删除）。
// POST /api/v1/dashboards/delete
func (cont *Controller) DeleteDashboardController(ctx *gin.Context) {
	var req DashboardReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	if err := cont.DeleteDashboard(ctx, &req); err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true})
}

// GetDashboardDataController 根据仪表板JSON查询实际数据。
// POST /api/v1/dashboards/data
// 后端根据 dashboard_json 中每个面板的 targets 配置，
// 查询 network_metrics 表并返回实际数据。
func (cont *Controller) GetDashboardDataController(ctx *gin.Context) {
	var req DashboardDataReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	resp, err := cont.GetDashboardData(ctx, &req)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// GetPanelDataController 查询指定仪表盘中单个面板的实际数据。
// POST /api/v1/panels/data
func (cont *Controller) GetPanelDataController(ctx *gin.Context) {
	var req PanelDataReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	resp, err := cont.GetPanelData(ctx, &req)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}
