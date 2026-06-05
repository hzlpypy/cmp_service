// Package business_systems 提供业务系统查询的路由注册。
// 对应存量 cmp_service 接口，路径格式保持与原有系统一致。
package business_systems

import "github.com/gin-gonic/gin"

// RegisterBusinessSystemsRouter 注册业务系统相关的 HTTP 路由到 Gin 引擎。
// 路由前缀：/api/v1/ops_dbapi/api
//
// 接口列表：
//   - POST /business_systems  - 查询业务系统引用配置
func RegisterBusinessSystemsRouter(e *gin.Engine, c *Controller) {
	api := e.Group("/api/v1/ops_dbapi/api")
	{
		api.POST("/business_systems", c.GetBusinessSystemsController)
	}
}
