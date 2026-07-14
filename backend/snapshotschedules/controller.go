package snapshotschedules

import "github.com/gin-gonic/gin"

// Controller for snapshot schedule HTTP handlers.
type Controller struct{ Interface }

// NewController creates a snapshot schedule controller.
func NewController(svc Interface) *Controller {
	return &Controller{Interface: svc}
}

// CreateController POST /api/v1/snapshot-schedules/create
func (c *Controller) CreateController(ctx *gin.Context) {
	var req CreateReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	resp, err := c.Create(ctx, &req)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(201, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// ListController POST /api/v1/snapshot-schedules/list
func (c *Controller) ListController(ctx *gin.Context) {
	var req struct {
		DashboardID string `json:"dashboard_id"`
	}
	ctx.ShouldBindJSON(&req)
	resp, err := c.List(ctx, req.DashboardID)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// UpdateController POST /api/v1/snapshot-schedules/update
func (c *Controller) UpdateController(ctx *gin.Context) {
	var req UpdateReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	resp, err := c.Update(ctx, &req)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// DeleteController POST /api/v1/snapshot-schedules/delete
func (c *Controller) DeleteController(ctx *gin.Context) {
	var req struct {
		ID string `json:"id" binding:"required"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	if err := c.Delete(ctx, req.ID); err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true})
}

// ToggleController POST /api/v1/snapshot-schedules/toggle
func (c *Controller) ToggleController(ctx *gin.Context) {
	var req struct {
		ID      string `json:"id" binding:"required"`
		Enabled bool   `json:"enabled"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	resp, err := c.Toggle(ctx, req.ID, req.Enabled)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}
