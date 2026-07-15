package snapshotschedules

import "github.com/gin-gonic/gin"

// RegisterSnapshotSchedulesRouter registers snapshot schedule routes.
func RegisterSnapshotSchedulesRouter(e *gin.Engine, c *Controller) {
	api := e.Group("/api/v1/snapshot-schedules")
	{
		api.POST("/create", c.CreateController)
		api.POST("/list", c.ListController)
		api.POST("/update", c.UpdateController)
		api.POST("/delete", c.DeleteController)
		api.POST("/toggle", c.ToggleController)
	}
}
