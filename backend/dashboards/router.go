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
//   - POST /versions/list    - 获取版本历史列表
//   - POST /versions/get     - 获取指定版本详情
//   - POST /versions/restore - 还原到指定版本
//   - POST /versions/compare - 对比两个版本差异
//   - POST /versions/delete  - 删除指定版本
func RegisterDashboardsRouter(e *gin.Engine, c *Controller) {
	api := e.Group("/api/v1/dashboards")
	{
		api.POST("/list", c.ListDashboardsController)
		api.POST("/get", c.GetDashboardController)
		api.POST("/create", c.CreateDashboardController)
		api.POST("/import", c.ImportDashboardController)
		api.POST("/update", c.UpdateDashboardController)
		api.POST("/delete", c.DeleteDashboardController)
		api.POST("/data", c.GetDashboardDataController)
		// 版本管理
		api.POST("/versions/list", c.ListVersionsController)
		api.POST("/versions/get", c.GetVersionController)
		api.POST("/versions/restore", c.RestoreVersionController)
		api.POST("/versions/compare", c.CompareVersionsController)
		api.POST("/versions/delete", c.DeleteVersionController)
		// 分享管理
		api.POST("/share", c.ShareResourceController)
		api.POST("/share/remove", c.UnshareResourceController)
		api.POST("/share/list", c.ListSharesController)
	}
	// 面板独立路由：查询单个面板数据
	e.POST("/api/v1/panels/data", c.GetPanelDataController)
	// 查询检查器：返回变量替换后的 SQL 和查询结果
	e.POST("/api/v1/panels/inspect", c.QueryInspectController)
}
