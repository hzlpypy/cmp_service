// Package file 文件上传模块，提供客户端文件上传到服务器的功能
package file

import (
	"github.com/gin-gonic/gin"
)

// Controller 文件上传控制器
type Controller struct {
	Interface
}

// Interface 文件上传服务接口定义
type Interface interface {
	UploadFile(ctx *gin.Context, req *UploadFileReq) (*UploadFileRes, error)
}

// NewController 创建文件上传控制器实例
func NewController(svc Interface) *Controller {
	return &Controller{
		Interface: svc,
	}
}

// UploadFileController 文件上传接口：接收multipart表单中的文件并保存到服务器
// POST /api/v1/file/upload
func (cont *Controller) UploadFileController(ctx *gin.Context) {
	req, err := cont.validateUploadFileReq(ctx)
	if err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": err.Error(), "success": false})
		return
	}
	resp, err := cont.Interface.UploadFile(ctx, req)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}