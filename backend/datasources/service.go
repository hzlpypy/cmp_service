// Package datasources 提供数据源管理的业务逻辑层。
// 实现数据源的增删改查及连接测试功能，支持 MySQL 和 HTTP API 两种类型。
package datasources

import (
	"cmp_service_backend/identity"
	"cmp_service_backend/model"
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/go-sql-driver/mysql"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

// Server 数据源业务服务，持有数据库连接和日志记录器。
type Server struct {
	db       *gorm.DB
	log      *logrus.Logger
	identity *identity.Provider
}

// Interface 定义数据源业务操作的接口。
// 用于解耦控制器层和业务逻辑层，便于单元测试。
type Interface interface {
	// ListDatasources 获取所有数据源列表
	ListDatasources(ctx *gin.Context) ([]*DatasourceRes, error)
	// GetDatasource 获取单个数据源详情
	GetDatasource(ctx *gin.Context, req *DatasourceReq) (*DatasourceRes, error)
	// CreateDatasource 创建新数据源
	CreateDatasource(ctx *gin.Context, req *DatasourceReq) (*DatasourceRes, error)
	// UpdateDatasource 更新数据源配置
	UpdateDatasource(ctx *gin.Context, req *DatasourceReq) (*DatasourceRes, error)
	// DeleteDatasource 删除数据源（软删除）
	DeleteDatasource(ctx *gin.Context, req *DatasourceReq) error
	// TestDatasource 测试数据源连接
	TestDatasource(ctx *gin.Context, req *DatasourceReq) (string, error)
}

// NewServer 创建数据源业务服务实例。
func NewServer(db *gorm.DB, log *logrus.Logger, identityProvider *identity.Provider) Interface {
	return &Server{db: db, log: log, identity: identityProvider}
}

// canAccessDatasource 判断当前用户是否能访问该数据源（查看/修改/删除）。
// 规则：admin 全量；其他用户仅能访问自己创建的数据源。
func (s *Server) canAccessDatasource(ctx *gin.Context, record *model.Datasource) bool {
	uc := identity.FromContext(ctx)
	if uc == nil {
		return false
	}
	if uc.IsAdmin() {
		return true
	}
	return record.OwnerID == uc.UserID
}

// ListDatasources 获取当前用户可见的数据源，按创建时间降序排列。
// 权限：admin 可查看全部；其他用户仅查看自己创建的数据源。
// 返回时不包含密码字段。
func (s *Server) ListDatasources(ctx *gin.Context) ([]*DatasourceRes, error) {
	query := s.db.Where("deleted_at IS NULL")
	if uc := identity.FromContext(ctx); uc != nil && !uc.IsAdmin() {
		query = query.Where("owner_id = ?", uc.UserID)
	}
	var records []*model.Datasource
	if err := query.Order("created_at DESC").Find(&records).Error; err != nil {
		return nil, err
	}
	// 转换为响应结构（不含密码）
	result := make([]*DatasourceRes, 0, len(records))
	for _, r := range records {
		result = append(result, ToDatasourceRes(r))
	}
	return result, nil
}

// GetDatasource 根据 ID 获取单个数据源详情。
// 权限：仅创建者本人或 admin 可查看。
func (s *Server) GetDatasource(ctx *gin.Context, req *DatasourceReq) (*DatasourceRes, error) {
	var record model.Datasource
	if err := s.db.Where("id = ? AND deleted_at IS NULL", req.ID).First(&record).Error; err != nil {
		return nil, err
	}
	if !s.canAccessDatasource(ctx, &record) {
		return nil, fmt.Errorf("数据源不存在或无权限访问")
	}
	return ToDatasourceRes(&record), nil
}

// CreateDatasource 创建新数据源。
// HTTP 类型的 Headers 如果为 nil 会自动初始化为空 JSONMap。
// MySQL 类型需提供 database_name 和 username。
// ID 格式：ds-{纳秒时间戳}
func (s *Server) CreateDatasource(ctx *gin.Context, req *DatasourceReq) (*DatasourceRes, error) {
	// 记录创建者
	ownerID := ""
	if uc := identity.FromContext(ctx); uc != nil {
		ownerID = uc.UserID
	}
	record := &model.Datasource{
		OwnerID:      ownerID,
		Name:         req.Name,
		Type:         req.Type,
		URL:          req.URL,
		DatabaseName: req.DatabaseName,
		Username:     req.Username,
		Password:     req.Password,
		Headers:      req.Headers,
		Config:       req.Config,
		Enabled:      true, // 新创建的数据源默认启用
	}
	// 确保 Headers 不为 nil
	if record.Headers == nil {
		record.Headers = model.JSONMap{}
	}
	// 确保 Config 不为 nil
	if record.Config == nil {
		record.Config = model.JSONMap{}
	}
	// 生成数据源唯一ID
	record.ID = generateDSID()
	if err := s.db.Create(record).Error; err != nil {
		return nil, err
	}
	return ToDatasourceRes(record), nil
}

// UpdateDatasource 更新数据源配置。
// 仅更新提供的字段和未软删除的记录。
// 如果 Headers 或 Config 为 nil 则不更新该字段。
// 权限：仅创建者本人或 admin 可修改。
func (s *Server) UpdateDatasource(ctx *gin.Context, req *DatasourceReq) (*DatasourceRes, error) {
	var current model.Datasource
	if err := s.db.Where("id = ? AND deleted_at IS NULL", req.ID).First(&current).Error; err != nil {
		return nil, err
	}
	if !s.canAccessDatasource(ctx, &current) {
		return nil, fmt.Errorf("无权限修改该数据源")
	}
	updates := map[string]interface{}{
		"name":          req.Name,
		"type":          req.Type,
		"url":           req.URL,
		"database_name": req.DatabaseName,
		"username":      req.Username,
		"password":      req.Password,
		"enabled":       req.Enabled,
	}
	// Headers 非 nil 时才更新
	if req.Headers != nil {
		updates["headers"] = req.Headers
	}
	// Config 非 nil 时才更新
	if req.Config != nil {
		updates["config"] = req.Config
	}
	if err := s.db.Model(&model.Datasource{}).Where("id = ? AND deleted_at IS NULL", req.ID).Updates(updates).Error; err != nil {
		return nil, err
	}
	// 查询更新后的记录
	var record model.Datasource
	s.db.Where("id = ?", req.ID).First(&record)
	return ToDatasourceRes(&record), nil
}

// DeleteDatasource 软删除数据源。
// GORM 会自动设置 deleted_at 时间戳。
// 权限：仅创建者本人或 admin 可删除。
func (s *Server) DeleteDatasource(ctx *gin.Context, req *DatasourceReq) error {
	var current model.Datasource
	if err := s.db.Where("id = ? AND deleted_at IS NULL", req.ID).First(&current).Error; err != nil {
		return err
	}
	if !s.canAccessDatasource(ctx, &current) {
		return fmt.Errorf("无权限删除该数据源")
	}
	return s.db.Where("id = ?", req.ID).Delete(&model.Datasource{}).Error
}

// TestDatasource 测试数据源连接。
// 如果请求中提供了 ID，则从数据库查询配置作为默认值，请求中的字段会覆盖默认值；
// 如果没有提供 ID，则直接使用请求中的配置进行测试。
func (s *Server) TestDatasource(ctx *gin.Context, req *DatasourceReq) (string, error) {
	var name, dsType, url, databaseName, username, password string

	// 如果有 ID，从数据库获取默认值
	if req.ID != "" {
		var record model.Datasource
		if err := s.db.Where("id = ? AND deleted_at IS NULL", req.ID).First(&record).Error; err != nil {
			return "", fmt.Errorf("数据源不存在: %v", err)
		}
		if !s.canAccessDatasource(ctx, &record) {
			return "", fmt.Errorf("数据源不存在或无权限访问")
		}
		name = record.Name
		dsType = record.Type
		url = record.URL
		databaseName = record.DatabaseName
		username = record.Username
		password = record.Password
	}

	// 请求中的字段覆盖数据库中的值
	if req.Name != "" {
		name = req.Name
	}
	if req.Type != "" {
		dsType = req.Type
	}
	if req.URL != "" {
		url = req.URL
	}
	if req.DatabaseName != "" {
		databaseName = req.DatabaseName
	}
	if req.Username != "" {
		username = req.Username
	}
	if req.Password != "" {
		password = req.Password
	}

	if name == "" {
		name = "未命名数据源"
	}

	switch dsType {
	case "mysql":
		return testMySQLConnection(name, url, databaseName, username, password)
	case "http":
		return testHTTPConnection(name, url)
	default:
		return "", fmt.Errorf("不支持的数据源类型: %s", dsType)
	}
}

// testMySQLConnection 测试 MySQL 数据库连接
func testMySQLConnection(name, url, databaseName, username, password string) (string, error) {
	if url == "" {
		return "", fmt.Errorf("URL 不能为空")
	}
	// 构建 DSN: username:password@tcp(host:port)/database
	dsn := fmt.Sprintf("%s:%s@tcp(%s)/%s?charset=utf8mb4&parseTime=True&loc=Local&timeout=5s",
		username, password, url, databaseName)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return "", fmt.Errorf("连接失败: %v", err)
	}
	defer db.Close()

	// 设置连接超时
	db.SetConnMaxLifetime(5 * time.Second)

	// 测试连接
	if err := db.Ping(); err != nil {
		return "", fmt.Errorf("连接失败: %v", err)
	}

	return fmt.Sprintf("%s(MySQL) 连接成功", name), nil
}

// testHTTPConnection 测试 HTTP API 连接
func testHTTPConnection(name, url string) (string, error) {
	if url == "" {
		return "", fmt.Errorf("URL 不能为空")
	}

	// 确保URL以http://或https://开头
	if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
		url = "http://" + url
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return "", fmt.Errorf("连接失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		return "", fmt.Errorf("服务器错误: HTTP %d", resp.StatusCode)
	}

	return fmt.Sprintf("%s(HTTP) 连接成功", name), nil
}

// generateDSID 生成数据源的唯一ID（最多19字符）。
// 格式：ds-{13位毫秒时间戳}
func generateDSID() string {
	return fmt.Sprintf("ds-%d", time.Now().UnixMilli())
}
