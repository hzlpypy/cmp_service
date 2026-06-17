package file

import "mime/multipart"

// UploadFileReq 文件上传请求参数
type UploadFileReq struct {
	File     *multipart.FileHeader // 上传的文件
	Filename string               // 文件名
}

// UploadFileRes 文件上传响应
type UploadFileRes struct {
	FilePath string `json:"file_path"` // 文件保存的绝对路径
	FileName string `json:"file_name"` // 文件名
}