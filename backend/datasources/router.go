// Package datasources 提供数据源管理的路由注册。
// 数据源是报表平台获取外部数据的基础配置，支持 MySQL 和 HTTP API 两种类型。
package datasources

import "github.com/gin-gonic/gin"

// RegisterDatasourcesRouter 注册数据源相关的 HTTP 路由到 Gin 引擎。
// 路由前缀：/api/v1/datasources
//
// 接口列表：
//   - GET  /list    - 获取数据源列表
//   - POST /get     - 获取数据源详情
//   - POST /create  - 创建数据源
//   - POST /update  - 更新数据源
//   - POST /delete  - 删除数据源（软删除）
//   - POST /test    - 测试数据源连接
func RegisterDatasourcesRouter(e *gin.Engine, c *Controller) {
	api := e.Group("/api/v1/datasources")
	{
		api.GET("/list", c.ListDatasourcesController)
		api.POST("/get", c.GetDatasourceController)
		api.POST("/create", c.CreateDatasourceController)
		api.POST("/update", c.UpdateDatasourceController)
		api.POST("/delete", c.DeleteDatasourceController)
		api.POST("/test", c.TestDatasourceController)
	}
}
