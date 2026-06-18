// Package variables 提供仪表盘变量管理的路由注册。
// 定义所有变量相关的 API 端点。
package variables

import "github.com/gin-gonic/gin"

// RegisterVariablesRouter 注册变量管理相关路由。
// 所有路由前缀：/api/v1/variables
func RegisterVariablesRouter(e *gin.Engine, ctrl *Controller) {
	group := e.Group("/api/v1/variables")
	{
		// POST /api/v1/variables/list - 获取仪表盘的变量列表
		group.POST("/list", ctrl.ListVariables)
		// POST /api/v1/variables/get - 获取单个变量详情
		group.POST("/get", ctrl.GetVariable)
		// POST /api/v1/variables/create - 创建变量
		group.POST("/create", ctrl.CreateVariable)
		// POST /api/v1/variables/update - 更新变量
		group.POST("/update", ctrl.UpdateVariable)
		// POST /api/v1/variables/delete - 删除变量
		group.POST("/delete", ctrl.DeleteVariable)
		// POST /api/v1/variables/values - 获取变量的可选值
		group.POST("/values", ctrl.GetVariableValues)
	}
}
