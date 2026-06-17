// Package file 文件上传路由注册
package file

import (
	"github.com/gin-gonic/gin"
)

// RegisterFileRouter 注册文件上传路由到gin引擎
func RegisterFileRouter(e *gin.Engine, c *Controller) {
	e.POST("/api/v1/file/upload", c.UploadFileController) // 上传文件
}