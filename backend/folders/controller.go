// Package folders 提供文件夹管理的 HTTP 控制器层。
// 负责请求参数绑定、调用业务逻辑层、返回统一格式的 JSON 响应。
package folders

import "github.com/gin-gonic/gin"

// Controller 文件夹控制器，嵌入业务接口 Interface。
// 通过组合模式将 HTTP 层与业务逻辑层解耦。
type Controller struct{ Interface }

// NewController 创建文件夹控制器实例。
// 参数 svc 为实现了 Interface 接口的业务服务。
func NewController(svc Interface) *Controller { return &Controller{Interface: svc} }

// ListFoldersController 获取文件夹列表（含子仪表板）。
// GET /api/v1/folders/list
// 无需请求参数，返回所有未删除的文件夹及其下的仪表板列表。
func (cont *Controller) ListFoldersController(ctx *gin.Context) {
	resp, err := cont.ListFolders(ctx)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// GetFolderController 获取单个文件夹详情。
// POST /api/v1/folders/get
// 请求体包含 FolderReq（需提供 id）。
func (cont *Controller) GetFolderController(ctx *gin.Context) {
	var req FolderReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	resp, err := cont.GetFolder(ctx, &req)
	if err != nil {
		ctx.JSON(404, gin.H{"errorCode": "40400", "errorMessage": "Folder not found", "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// CreateFolderController 创建新文件夹。
// POST /api/v1/folders/create
// 请求体包含 FolderReq（需提供 title，uid 可选）。
func (cont *Controller) CreateFolderController(ctx *gin.Context) {
	var req FolderReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	resp, err := cont.CreateFolder(ctx, &req)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(201, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// UpdateFolderController 更新文件夹信息。
// POST /api/v1/folders/update
// 请求体包含 FolderReq（需提供 id 和要更新的 title）。
func (cont *Controller) UpdateFolderController(ctx *gin.Context) {
	var req FolderReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	resp, err := cont.UpdateFolder(ctx, &req)
	if err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": resp})
}

// DeleteFolderController 删除文件夹（GORM 软删除）。
// POST /api/v1/folders/delete
// 请求体包含 FolderReq（需提供 id）。
func (cont *Controller) DeleteFolderController(ctx *gin.Context) {
	var req FolderReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(400, gin.H{"errorCode": "40001", "errorMessage": "Invalid request: " + err.Error(), "success": false})
		return
	}
	if err := cont.DeleteFolder(ctx, &req); err != nil {
		ctx.JSON(500, gin.H{"errorCode": "50000", "errorMessage": err.Error(), "success": false})
		return
	}
	ctx.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true})
}
