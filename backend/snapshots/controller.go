package snapshots

import "github.com/gin-gonic/gin"

// Controller for snapshot HTTP handlers.
type Controller struct{ Interface }

// NewController creates a snapshot controller.
func NewController(svc Interface) *Controller {
	return &Controller{Interface: svc}
}

// CreateController POST /api/v1/snapshots/create
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

// GetController GET /api/v1/snapshots/:key
func (c *Controller) GetController(ctx *gin.Context) {
	key := ctx.Param("key")
	resp, err := c.Get(ctx, key)
	if err != nil {
		ctx.JSON(404, gin.H{"errorCode": "40400", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// ListController POST /api/v1/snapshots/list
func (c *Controller) ListController(ctx *gin.Context) {
	var req struct {
		DashboardID string `json:"dashboard_id"`
		PanelID     string `json:"panel_id"`
	}
	ctx.ShouldBindJSON(&req)
	resp, err := c.List(ctx, req.DashboardID, req.PanelID)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// DeleteController POST /api/v1/snapshots/delete
func (c *Controller) DeleteController(ctx *gin.Context) {
	var req struct {
		Key string `json:"snapshot_key" binding:"required"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	if err := c.Delete(ctx, req.Key); err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true})
}