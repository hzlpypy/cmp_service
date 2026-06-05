// Package panels 提供面板管理的 HTTP 控制器层。
// 负责请求参数绑定、调用业务逻辑层、返回统一格式的 JSON 响应。
package panels

import "github.com/gin-gonic/gin"

// Controller 面板控制器，嵌入业务接口 Interface。
// 通过组合模式将 HTTP 层与业务逻辑层解耦。
type Controller struct{ Interface }

// NewController 创建面板控制器实例。
// 参数 svc 为实现了 Interface 接口的业务服务。
func NewController(svc Interface) *Controller { return &Controller{Interface: svc} }

// CreatePanelController 创建新面板。
// POST /api/v1/panels/create
// 请求体包含 PanelReq（需提供 dashboard_id 和 title）。
// 图表类型默认为 bar（柱状图），网格尺寸有合理的默认值。
func (cont *Controller) CreatePanelController(ctx *gin.Context) {
	var req PanelReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	resp, err := cont.CreatePanel(ctx, &req)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(201, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// UpdatePanelController 更新面板配置。
// POST /api/v1/panels/update
// 请求体包含 PanelReq（需提供 id 和要更新的字段）。
// 可以修改图表类型、标题、网格布局位置、数据源配置等。
func (cont *Controller) UpdatePanelController(ctx *gin.Context) {
	var req PanelReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	resp, err := cont.UpdatePanel(ctx, &req)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// DeletePanelController 删除面板（GORM 软删除）。
// POST /api/v1/panels/delete
// 请求体包含 PanelReq（需提供 id）。
func (cont *Controller) DeletePanelController(ctx *gin.Context) {
	var req PanelReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	if err := cont.DeletePanel(ctx, &req); err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true})
}
