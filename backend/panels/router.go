// Package panels 提供面板管理的路由注册。
// 面板是仪表板中的可视化图表单元，支持柱状图、折线图、饼图、仪表盘、表格等多种图表类型。
package panels

import "github.com/gin-gonic/gin"

// RegisterPanelsRouter 注册面板相关的 HTTP 路由到 Gin 引擎。
// 路由前缀：/api/v1/panels
//
// 接口列表：
//   - POST /create  - 创建面板
//   - POST /update  - 更新面板（修改图表类型、布局位置等）
//   - POST /delete  - 删除面板（软删除）
func RegisterPanelsRouter(e *gin.Engine, c *Controller) {
	api := e.Group("/api/v1/panels")
	{
		api.POST("/create", c.CreatePanelController)
		api.POST("/update", c.UpdatePanelController)
		api.POST("/delete", c.DeletePanelController)
	}
}
