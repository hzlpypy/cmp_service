// Package dashboards 提供仪表板管理的路由注册。
// 仪表板是报表平台的核心概念，每个仪表板由 dashboard_json 完整定义。
package dashboards

import "github.com/gin-gonic/gin"

// RegisterDashboardsRouter 注册仪表板相关的 HTTP 路由到 Gin 引擎。
// 路由前缀：/api/v1/dashboards
//
// 接口列表：
//   - POST /list    - 获取仪表板列表（可选按文件夹过滤）
//   - POST /get     - 获取仪表板详情（含面板列表和 dashboard_json）
//   - POST /create  - 创建仪表板（含 dashboard_json）
//   - POST /update  - 更新仪表板（修改 dashboard_json 完整定义）
//   - POST /delete  - 删除仪表板（软删除）
//   - POST /data    - 查询仪表板数据（根据 dashboard_json 中的面板配置查询实际数据）
func RegisterDashboardsRouter(e *gin.Engine, c *Controller) {
	api := e.Group("/api/v1/dashboards")
	{
		api.POST("/list", c.ListDashboardsController)
		api.POST("/get", c.GetDashboardController)
		api.POST("/create", c.CreateDashboardController)
		api.POST("/update", c.UpdateDashboardController)
		api.POST("/delete", c.DeleteDashboardController)
		api.POST("/data", c.GetDashboardDataController)
	}
	// 面板独立路由：查询单个面板数据
	e.POST("/api/v1/panels/data", c.GetPanelDataController)
}
