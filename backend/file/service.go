package file

import (
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

// Server 文件上传服务
type Server struct {
	log *logrus.Logger
}

// NewServer 创建文件上传服务实例
func NewServer(log *logrus.Logger) Interface {
	return &Server{
		log: log,
	}
}

// UploadFile 上传文件：将客户端上传的文件保存到本地./client_files目录
func (s *Server) UploadFile(ctx *gin.Context, req *UploadFileReq) (*UploadFileRes, error) {
	clientFilesDir := "./client_files"
	err := os.MkdirAll(clientFilesDir, 0755)
	if err != nil {
		return nil, err
	}

	filePath := filepath.Join(clientFilesDir, req.Filename)
	err = ctx.SaveUploadedFile(req.File, filePath)
	if err != nil {
		return nil, err
	}

	absFilePath, err := filepath.Abs(filePath)
	if err != nil {
		return nil, err
	}

	return &UploadFileRes{
		FilePath: absFilePath,
		FileName: req.Filename,
	}, nil
}