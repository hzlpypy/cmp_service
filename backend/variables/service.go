// Package variables 提供仪表盘变量管理的业务逻辑层。
// 实现变量的增删改查操作，以及动态获取变量可选值的功能。
package variables

import (
	"cmp_service_backend/model"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

// Server 变量业务服务，持有数据库连接和日志记录器。
type Server struct {
	db  *gorm.DB
	log *logrus.Logger
}

// Interface 定义变量业务操作的接口。
type Interface interface {
	// ListVariables 获取仪表盘的变量列表
	ListVariables(ctx *gin.Context, dashboardID string) ([]*VariableRes, error)
	// GetVariable 获取单个变量详情
	GetVariable(ctx *gin.Context, req *VariableReq) (*VariableRes, error)
	// CreateVariable 创建新变量
	CreateVariable(ctx *gin.Context, req *VariableReq) (*VariableRes, error)
	// UpdateVariable 更新变量
	UpdateVariable(ctx *gin.Context, req *VariableReq) (*VariableRes, error)
	// DeleteVariable 删除变量
	DeleteVariable(ctx *gin.Context, req *VariableReq) error
	// GetVariableValues 获取变量的可选值（用于 query 类型动态查询）
	GetVariableValues(ctx *gin.Context, req *VariableValuesReq) (*VariableValuesRes, error)
}

// NewServer 创建变量业务服务实例。
func NewServer(db *gorm.DB, log *logrus.Logger) Interface {
	return &Server{db: db, log: log}
}

// ListVariables 获取指定仪表盘的所有变量，按 sort_order 排序。
func (s *Server) ListVariables(ctx *gin.Context, dashboardID string) ([]*VariableRes, error) {
	var records []*model.Variable
	if err := s.db.Where("dashboard_id = ? AND deleted_at IS NULL", dashboardID).
		Order("sort_order ASC, created_at ASC").
		Find(&records).Error; err != nil {
		return nil, err
	}

	result := make([]*VariableRes, 0, len(records))
	for _, r := range records {
		result = append(result, ToVariableRes(r))
	}
	return result, nil
}

// GetVariable 根据 ID 获取单个变量详情。
func (s *Server) GetVariable(ctx *gin.Context, req *VariableReq) (*VariableRes, error) {
	var record model.Variable
	if err := s.db.Where("id = ? AND deleted_at IS NULL", req.ID).First(&record).Error; err != nil {
		return nil, err
	}
	return ToVariableRes(&record), nil
}

// CreateVariable 创建新变量。
func (s *Server) CreateVariable(ctx *gin.Context, req *VariableReq) (*VariableRes, error) {
	// 设置默认类型
	if req.Type == "" {
		req.Type = "custom"
	}

	// 转换 Options 为 JSONArray
	options := make(model.JSONArray, 0)
	for _, opt := range req.Options {
		options = append(options, map[string]interface{}{
			"text":     opt.Text,
			"value":    opt.Value,
			"selected": opt.Selected,
		})
	}

	// 转换 Current 为 JSONMap
	current := model.JSONMap{}
	if req.Current != nil {
		current = model.JSONMap(req.Current)
	}

	record := &model.Variable{
		DashboardID:  req.DashboardID,
		Name:         req.Name,
		Type:         req.Type,
		Label:        req.Label,
		Description:  req.Description,
		Options:      options,
		Query:        req.Query,
		DatasourceID: req.DatasourceID,
		Default:      req.Default,
		Current:      current,
		Multi:        req.Multi,
		IncludeAll:   req.IncludeAll,
		AllValue:     req.AllValue,
		SortOrder:    req.SortOrder,
	}

	// 设置默认 AllValue
	if record.AllValue == "" {
		record.AllValue = "*"
	}

	// 生成唯一ID
	record.ID = generateVariableID()

	if err := s.db.Create(record).Error; err != nil {
		return nil, err
	}

	return ToVariableRes(record), nil
}

// UpdateVariable 更新变量配置。
func (s *Server) UpdateVariable(ctx *gin.Context, req *VariableReq) (*VariableRes, error) {
	// 转换 Options 为 JSONArray
	options := make(model.JSONArray, 0)
	for _, opt := range req.Options {
		options = append(options, map[string]interface{}{
			"text":     opt.Text,
			"value":    opt.Value,
			"selected": opt.Selected,
		})
	}

	// 转换 Current 为 JSONMap
	current := model.JSONMap{}
	if req.Current != nil {
		current = model.JSONMap(req.Current)
	}

	updates := map[string]interface{}{
		"name":          req.Name,
		"type":          req.Type,
		"label":         req.Label,
		"description":   req.Description,
		"options":       options,
		"query":         req.Query,
		"datasource_id": req.DatasourceID,
		"default":       req.Default,
		"current":       current,
		"multi":         req.Multi,
		"include_all":   req.IncludeAll,
		"all_value":     req.AllValue,
		"sort_order":    req.SortOrder,
	}

	if err := s.db.Model(&model.Variable{}).
		Where("id = ? AND deleted_at IS NULL", req.ID).
		Updates(updates).Error; err != nil {
		return nil, err
	}

	// 查询更新后的记录
	var record model.Variable
	s.db.Where("id = ?", req.ID).First(&record)
	return ToVariableRes(&record), nil
}

// DeleteVariable 软删除变量。
func (s *Server) DeleteVariable(ctx *gin.Context, req *VariableReq) error {
	return s.db.Where("id = ?", req.ID).Delete(&model.Variable{}).Error
}

// GetVariableValues 获取变量的可选值。
// 对于 query 类型变量，执行查询语句获取动态值列表。
// 对于 custom 类型变量，直接返回预定义的 options。
func (s *Server) GetVariableValues(ctx *gin.Context, req *VariableValuesReq) (*VariableValuesRes, error) {
	var variable *model.Variable

	// 如果提供了变量ID，从数据库加载变量配置
	if req.ID != "" {
		var record model.Variable
		if err := s.db.Where("id = ? AND deleted_at IS NULL", req.ID).First(&record).Error; err != nil {
			return nil, fmt.Errorf("变量不存在: %v", err)
		}
		variable = &record
	}

	// 如果直接提供了查询语句，使用提供的查询
	query := req.Query
	datasourceID := req.DatasourceID

	if variable != nil {
		if query == "" {
			query = variable.Query
		}
		if datasourceID == "" {
			datasourceID = variable.DatasourceID
		}
	}

	// 根据变量类型处理
	if variable != nil && variable.Type == "custom" {
		// custom 类型：直接返回预定义的 options
		values := make([]VariableOption, 0)
		for _, opt := range variable.Options {
			values = append(values, VariableOption{
				Text:     getStringFromMap(opt, "text"),
				Value:    getStringFromMap(opt, "value"),
				Selected: getBoolFromMap(opt, "selected"),
			})
		}
		return &VariableValuesRes{Values: values}, nil
	}

	// query 类型：执行查询获取动态值
	if query == "" {
		return &VariableValuesRes{Values: []VariableOption{}}, nil
	}

	// 执行查询
	values, err := s.executeQuery(query, datasourceID)
	if err != nil {
		s.log.Warnf("执行变量查询失败: %v", err)
		return nil, err
	}

	return &VariableValuesRes{Values: values}, nil
}

// executeQuery 执行查询语句获取变量值列表。
func (s *Server) executeQuery(query string, datasourceID string) ([]VariableOption, error) {
	// 安全检查：只允许 SELECT 开头的语句
	trimmed := strings.TrimSpace(query)
	upper := strings.ToUpper(trimmed)
	if !strings.HasPrefix(upper, "SELECT") {
		return nil, fmt.Errorf("只允许 SELECT 查询")
	}

	// 如果指定了数据源，使用该数据源连接执行查询
	if datasourceID != "" {
		var ds model.Datasource
		if err := s.db.Where("id = ? AND enabled = 1 AND deleted_at IS NULL", datasourceID).First(&ds).Error; err != nil {
			return nil, fmt.Errorf("数据源不可用: %v", err)
		}

		// 目前仅支持 MySQL 类型数据源
		if ds.Type == "mysql" {
			return s.executeMySQLQuery(trimmed, &ds)
		}
	}

	// 默认使用当前数据库连接执行查询
	return s.executeLocalQuery(trimmed)
}

// executeLocalQuery 使用当前数据库连接执行查询。
func (s *Server) executeLocalQuery(query string) ([]VariableOption, error) {
	rows, err := s.db.Raw(query).Rows()
	if err != nil {
		return nil, fmt.Errorf("查询执行失败: %w", err)
	}
	defer rows.Close()

	columns, _ := rows.Columns()
	values := make([]VariableOption, 0)

	for rows.Next() {
		scanValues := make([]interface{}, len(columns))
		scanPtrs := make([]interface{}, len(columns))
		for i := range scanValues {
			scanPtrs[i] = &scanValues[i]
		}

		if err := rows.Scan(scanPtrs...); err != nil {
			continue
		}

		// 取第一列作为值，如果有第二列则作为显示文本
		var text, value string
		if len(scanValues) > 0 {
			value = formatValue(scanValues[0])
			text = value
		}
		if len(scanValues) > 1 {
			text = formatValue(scanValues[1])
		}

		values = append(values, VariableOption{
			Text:  text,
			Value: value,
		})
	}

	return values, nil
}

// executeMySQLQuery 使用指定数据源连接执行查询。
func (s *Server) executeMySQLQuery(query string, ds *model.Datasource) ([]VariableOption, error) {
	// 构建 DSN
	dsn := fmt.Sprintf("%s:%s@tcp(%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		ds.Username, ds.Password, ds.URL, ds.DatabaseName)

	// 打开新连接
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("连接数据源失败: %w", err)
	}
	defer func() {
		sqlDB, _ := db.DB()
		sqlDB.Close()
	}()

	// 执行查询
	return s.executeQueryWithDB(db, query)
}

// executeQueryWithDB 使用指定数据库连接执行查询。
func (s *Server) executeQueryWithDB(db *gorm.DB, query string) ([]VariableOption, error) {
	rows, err := db.Raw(query).Rows()
	if err != nil {
		return nil, fmt.Errorf("查询执行失败: %w", err)
	}
	defer rows.Close()

	columns, _ := rows.Columns()
	values := make([]VariableOption, 0)

	for rows.Next() {
		scanValues := make([]interface{}, len(columns))
		scanPtrs := make([]interface{}, len(columns))
		for i := range scanValues {
			scanPtrs[i] = &scanValues[i]
		}

		if err := rows.Scan(scanPtrs...); err != nil {
			continue
		}

		var text, value string
		if len(scanValues) > 0 {
			value = formatValue(scanValues[0])
			text = value
		}
		if len(scanValues) > 1 {
			text = formatValue(scanValues[1])
		}

		values = append(values, VariableOption{
			Text:  text,
			Value: value,
		})
	}

	return values, nil
}

// formatValue 将数据库值格式化为字符串。
func formatValue(v interface{}) string {
	if v == nil {
		return ""
	}
	switch val := v.(type) {
	case []byte:
		return string(val)
	case string:
		return val
	default:
		return fmt.Sprintf("%v", val)
	}
}

// generateVariableID 生成变量的唯一ID。
func generateVariableID() string {
	return fmt.Sprintf("var-%d", time.Now().UnixMilli())
}

// ============================================================
// 变量替换工具函数（供 dashboards 包使用）
// ============================================================

// VariableValue 表示变量的当前值。
type VariableValue struct {
	Name   string
	Value  string
	Values []string // 多选时的值列表
	Multi  bool
}

// ReplaceVariables 替换 SQL 中的变量引用。
// 支持 $varname 和 ${varname} 两种语法。
// 单选值替换为 'value'，多选值替换为 'value1','value2',...
func ReplaceVariables(sql string, variables []VariableValue) string {
	result := sql

	for _, v := range variables {
		replacement := formatVariableValue(v)

		// 替换 ${varname} 语法
		bracePattern := fmt.Sprintf("\\$\\{%s\\}", regexp.QuoteMeta(v.Name))
		result = regexp.MustCompile(bracePattern).ReplaceAllString(result, replacement)

		// 替换 $varname 语法（使用单词边界，确保不匹配 $varnameX 或 $varname_ 等情况）
		// Go RE2 不支持 (?!...) 负向先行断言，使用 \b 单词边界代替
		dollarPattern := fmt.Sprintf("\\$%s\\b", regexp.QuoteMeta(v.Name))
		result = regexp.MustCompile(dollarPattern).ReplaceAllString(result, replacement)
	}

	return result
}

// formatVariableValue 格式化变量值为 SQL 可用格式。
// 单选：直接返回原始值（用户在 SQL 中用 '$var' 自己加引号）
// 多选：生成 'value1','value2',... 格式，用于 IN ($var) 场景
func formatVariableValue(v VariableValue) string {
	if v.Multi && len(v.Values) > 0 {
		// 多选：生成 'value1','value2',...
		quoted := make([]string, len(v.Values))
		for i, val := range v.Values {
			quoted[i] = fmt.Sprintf("'%s'", escapeSingleQuote(val))
		}
		return strings.Join(quoted, ",")
	}
	// 单选：直接返回原始值，不自动加引号
	// 用户在 SQL 中自己处理引号：WHERE name = '$var' 或 WHERE id = $var
	return escapeSingleQuote(v.Value)
}

// escapeSingleQuote 转义 SQL 中的单引号。
func escapeSingleQuote(s string) string {
	return strings.ReplaceAll(s, "'", "''")
}

// GetVariableValuesFromDB 从数据库获取仪表盘的所有变量及其当前值。
func GetVariableValuesFromDB(db *gorm.DB, dashboardID string) ([]VariableValue, error) {
	var variables []*model.Variable
	if err := db.Where("dashboard_id = ? AND deleted_at IS NULL", dashboardID).
		Order("sort_order ASC").
		Find(&variables).Error; err != nil {
		return nil, err
	}

	result := make([]VariableValue, 0, len(variables))
	for _, v := range variables {
		vv := VariableValue{
			Name:  v.Name,
			Multi: v.Multi,
		}

		// 从 Current 字段获取当前值
		if v.Current != nil {
			if value, ok := v.Current["value"].(string); ok {
				vv.Value = value
			}
			// 处理多选值
			if values, ok := v.Current["value"].([]interface{}); ok {
				vv.Values = make([]string, 0, len(values))
				for _, val := range values {
					if s, ok := val.(string); ok {
						vv.Values = append(vv.Values, s)
					}
				}
			}
		}

		// 如果没有当前值，使用默认值
		if vv.Value == "" && v.Default != "" {
			vv.Value = v.Default
		}

		result = append(result, vv)
	}

	return result, nil
}
