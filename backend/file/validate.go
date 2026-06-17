package file

import (
	"github.com/gin-gonic/gin"
)

// validateUploadFileReq 验证文件上传请求参数：从multipart表单获取file字段
func (c *Controller) validateUploadFileReq(ctx *gin.Context) (*UploadFileReq, error) {
	file, err := ctx.FormFile("file")
	if err != nil {
		return nil, err
	}

	req := &UploadFileReq{
		File:     file,
		Filename: file.Filename,
	}

	return req, nil
}