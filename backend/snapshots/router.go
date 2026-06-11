package snapshots

import "github.com/gin-gonic/gin"

// RegisterSnapshotsRouter registers snapshot routes.
func RegisterSnapshotsRouter(e *gin.Engine, c *Controller) {
	api := e.Group("/api/v1/snapshots")
	{
		api.POST("/create", c.CreateController)
		api.POST("/list", c.ListController)
		api.POST("/delete", c.DeleteController)
	}
	e.GET("/api/v1/snapshots/:key", c.GetController)
}