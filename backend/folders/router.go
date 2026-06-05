// Package folders 提供文件夹管理的路由注册。
// 文件夹用于组织仪表板的层级结构，类似于 Grafana 中的 Folder 概念。
package folders

import "github.com/gin-gonic/gin"

// RegisterFoldersRouter 注册文件夹相关的 HTTP 路由到 Gin 引擎。
// 路由前缀：/api/v1/folders
//
// 接口列表：
//   - GET  /list    - 获取文件夹列表（含子仪表板）
//   - POST /get     - 获取单个文件夹详情
//   - POST /create  - 创建文件夹
//   - POST /update  - 更新文件夹
//   - POST /delete  - 删除文件夹（软删除）
func RegisterFoldersRouter(e *gin.Engine, c *Controller) {
	api := e.Group("/api/v1/folders")
	{
		api.GET("/list", c.ListFoldersController)
		api.POST("/get", c.GetFolderController)
		api.POST("/create", c.CreateFolderController)
		api.POST("/update", c.UpdateFolderController)
		api.POST("/delete", c.DeleteFolderController)
	}
}
