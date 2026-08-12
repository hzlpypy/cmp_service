// Package dashboards 提供仪表板管理的业务逻辑层。
// 实现仪表板的增删改查操作，包括面板的关联查询和基于 dashboard_json 的数据查询。
package dashboards

import (
	"cmp_service_backend/datasources"
	"cmp_service_backend/identity"
	"cmp_service_backend/model"
	"cmp_service_backend/variables"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/go-sql-driver/mysql"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

// convertValue 将数据库查询结果中的值转换为合适的类型。
// - []byte 转换为 string
// - time.Time 转换为毫秒时间戳 (UnixMilli)
func convertValue(val interface{}) interface{} {
	if val == nil {
		return nil
	}
	// []byte -> string
	if b, ok := val.([]byte); ok {
		return string(b)
	}
	// time.Time -> millisecond timestamp
	if t, ok := val.(time.Time); ok {
		return t.UnixMilli()
	}
	return val
}

// buildCurlCommand 根据HTTP请求详情生成等效的curl命令
func buildCurlCommand(info *HTTPRequestInfo) string {
	var parts []string
	parts = append(parts, "curl")

	// 方法
	method := strings.ToUpper(info.Method)
	if method != "" && method != "GET" {
		parts = append(parts, fmt.Sprintf("-X %s", method))
	}

	// Headers
	for k, v := range info.Headers {
		parts = append(parts, fmt.Sprintf("-H '%s: %s'", k, v))
	}

	// Content-Type for form data
	if info.BodyType == "form-data" && len(info.FormData) > 0 {
		// 不需要额外设置，curl -F 会自动处理
	} else if info.BodyType == "x-www-form-urlencoded" && len(info.FormData) > 0 {
		parts = append(parts, "-H 'Content-Type: application/x-www-form-urlencoded'")
	}

	// Body
	switch info.BodyType {
	case "raw":
		if info.Body != "" {
			parts = append(parts, fmt.Sprintf("-d '%s'", info.Body))
		}
	case "graphql":
		if info.Body != "" {
			parts = append(parts, fmt.Sprintf("-d '{\"query\": \"%s\"}'", strings.ReplaceAll(info.Body, "\"", "\\\"")))
		}
	case "form-data":
		for _, fd := range info.FormData {
			parts = append(parts, fmt.Sprintf("-F '%s=%s'", fd["key"], fd["value"]))
		}
	case "x-www-form-urlencoded":
		var pairs []string
		for _, fd := range info.FormData {
			pairs = append(pairs, fmt.Sprintf("%s=%s", fd["key"], fd["value"]))
		}
		if len(pairs) > 0 {
			parts = append(parts, fmt.Sprintf("-d '%s'", strings.Join(pairs, "&")))
		}
	}

	// URL
	parts = append(parts, fmt.Sprintf("'%s'", info.URL))

	return strings.Join(parts, " \\\n  ")
}

// Server 仪表板业务服务，持有数据库连接和日志记录器。
type Server struct {
	db            *gorm.DB
	log           *logrus.Logger
	httpQueryExec *datasources.HTTPQueryExecutor
	dsConnMgr     *datasources.DSConnectionManager
	identity      *identity.Provider
}

// Interface 定义仪表板业务操作的接口。
// 用于解耦控制器层和业务逻辑层，便于单元测试。
type Interface interface {
	// ListDashboards 获取仪表板列表，可按文件夹ID过滤
	ListDashboards(ctx *gin.Context, folderID string) ([]*DashboardRes, error)
	// GetDashboard 获取单个仪表板详情（含面板）
	GetDashboard(ctx *gin.Context, req *DashboardReq) (*DashboardRes, error)
	// CreateDashboard 创建新仪表板（含 dashboard_json）
	CreateDashboard(ctx *gin.Context, req *DashboardReq) (*DashboardRes, error)
	// UpdateDashboard 更新仪表板信息（含 dashboard_json）
	UpdateDashboard(ctx *gin.Context, req *DashboardReq) (*DashboardRes, error)
	// DeleteDashboard 删除仪表板（软删除）
	DeleteDashboard(ctx *gin.Context, req *DashboardReq) error
	// GetDashboardData 根据仪表板JSON中的面板配置查询实际数据
	GetDashboardData(ctx *gin.Context, req *DashboardDataReq) (*DashboardDataRes, error)
	// GetPanelData 根据仪表板ID和面板ID查询单个面板的实际数据
	GetPanelData(ctx *gin.Context, req *PanelDataReq) (*PanelData, error)
	// QueryInspect 查询检查器：返回变量替换后的 SQL 和查询结果
	QueryInspect(ctx *gin.Context, req *QueryInspectReq) (*QueryInspectRes, error)
	// ListVersions 获取仪表板版本历史列表
	ListVersions(ctx *gin.Context, req *VersionListReq) ([]*VersionBriefRes, error)
	// GetVersion 获取指定版本的详细信息
	GetVersion(ctx *gin.Context, req *VersionReq) (*VersionRes, error)
	// RestoreVersion 还原到指定版本
	RestoreVersion(ctx *gin.Context, req *VersionRestoreReq) (*DashboardRes, error)
	// CompareVersions 对比两个版本的差异
	CompareVersions(ctx *gin.Context, req *VersionCompareReq) (*VersionDiffRes, error)
	// DeleteVersion 删除指定版本
	DeleteVersion(ctx *gin.Context, req *VersionReq) error
	// ShareResource 添加/更新分享（仪表板/快照）
	ShareResource(ctx *gin.Context, req *ShareReq) error
	// UnshareResource 取消分享
	UnshareResource(ctx *gin.Context, req *ShareReq) error
	// ListShares 获取资源的分享列表
	ListShares(ctx *gin.Context, req *ShareListReq) ([]ShareRes, error)
}

// NewServer 创建仪表板业务服务实例。
func NewServer(db *gorm.DB, log *logrus.Logger, dsConnMgr *datasources.DSConnectionManager, identityProvider *identity.Provider) Interface {
	return &Server{
		db:            db,
		log:           log,
		httpQueryExec: datasources.NewHTTPQueryExecutor(log),
		dsConnMgr:     dsConnMgr,
		identity:      identityProvider,
	}
}

// getDatasourceDB 根据数据源 ID 获取对应的数据库连接。
// 对于 MySQL 类型数据源，使用连接管理器获取对应数据源的连接池。
// 对于 HTTP 类型数据源，返回 nil。
func (s *Server) getDatasourceDB(datasourceID string) (*gorm.DB, *model.Datasource, error) {
	if datasourceID == "" {
		return s.db, nil, nil
	}

	var ds model.Datasource
	if err := s.db.Where("id = ? AND enabled = 1 AND deleted_at IS NULL", datasourceID).First(&ds).Error; err != nil {
		return nil, nil, fmt.Errorf("数据源 %s 不存在或已禁用: %v", datasourceID, err)
	}

	switch ds.Type {
	case "mysql":
		connDB, err := s.dsConnMgr.GetDB(&ds)
		if err != nil {
			// 降级：连接管理器失败时回退到主库连接
			s.log.Warnf("[getDatasourceDB] 数据源 %s 连接失败，回退到主库: %v", ds.Name, err)
			return s.db, &ds, nil
		}
		return connDB, &ds, nil
	case "http":
		return nil, &ds, nil
	default:
		return nil, nil, fmt.Errorf("不支持的数据源类型: %s", ds.Type)
	}
}

// ListDashboards 获取当前用户可见的所有未删除仪表板，可选按文件夹ID过滤。
// 可见范围：自己的 + 分享给我的/我团队的 + 团队/部门成员的（按角色）。
// 响应中附带 owner_id / can_edit / source，供前端分组展示。
func (s *Server) ListDashboards(ctx *gin.Context, folderID string) ([]*DashboardRes, error) {
	var records []*model.Dashboard
	query := s.db.Scopes(s.identity.VisibleScope(ctx, "dashboard")).Where("deleted_at IS NULL")
	if folderID != "" {
		query = query.Where("folder_id = ?", folderID)
	}
	if err := query.Preload("Folder").Preload("Panels", "deleted_at IS NULL").Order("created_at ASC").Find(&records).Error; err != nil {
		return nil, err
	}

	uc := identity.FromContext(ctx)
	me := ""
	if uc != nil {
		me = uc.UserID
	}
	editableShared := s.identity.EditableShareIDs(ctx, "dashboard")
	sharedToMe := s.identity.SharedResourceIDs(ctx, "dashboard")

	result := make([]*DashboardRes, 0, len(records))
	for _, r := range records {
		res := ToDashboardRes(r)
		res.CanEdit = uc != nil && (uc.IsAdmin() || r.OwnerID == me || editableShared[r.ID])
		res.Source = computeSource(uc, me, r.OwnerID, sharedToMe[r.ID])
		result = append(result, res)
	}
	return result, nil
}

// computeSource 计算仪表板的来源分组。
func computeSource(uc *identity.UserContext, me, ownerID string, isShared bool) string {
	if uc != nil && uc.IsAdmin() {
		return "mine"
	}
	if ownerID == me {
		return "mine"
	}
	if isShared {
		return "shared"
	}
	return "team"
}

// GetDashboard 根据 ID 获取单个仪表板详情。
// 仅返回当前用户可见的仪表板，不可见时返回错误。
func (s *Server) GetDashboard(ctx *gin.Context, req *DashboardReq) (*DashboardRes, error) {
	var record model.Dashboard
	if err := s.db.Where("id = ? AND deleted_at IS NULL", req.ID).
		Preload("Folder").
		Preload("Panels", "deleted_at IS NULL").
		First(&record).Error; err != nil {
		return nil, err
	}
	// 可见性校验
	if !s.identity.CanViewResource(ctx, "dashboard", record.ID, record.OwnerID) {
		return nil, fmt.Errorf("仪表板不存在或无权限访问")
	}
	uc := identity.FromContext(ctx)
	me := ""
	if uc != nil {
		me = uc.UserID
	}
	res := ToDashboardRes(&record)
	res.CanEdit = s.identity.CanManageResource(ctx, "dashboard", record.ID, record.OwnerID)
	res.Source = computeSource(uc, me, record.OwnerID, s.identity.IsSharedToMe(ctx, "dashboard", record.ID))
	return res, nil
}

// CreateDashboard 创建新仪表板，同时存储 dashboard_json 完整定义。
// 也会将 dashboard_json 中的面板同步写入 panels 表，保证双存储一致性。
func (s *Server) CreateDashboard(ctx *gin.Context, req *DashboardReq) (*DashboardRes, error) {
	// 确保 dashboard_json.title 与用户输入的标题一致
	if req.DashboardJSON == nil {
		req.DashboardJSON = model.JSONMap{}
	}
	req.DashboardJSON["title"] = req.Title

	// 记录创建者
	ownerID := ""
	if uc := identity.FromContext(ctx); uc != nil {
		ownerID = uc.UserID
	}

	record := &model.Dashboard{
		OwnerID:       ownerID,
		Title:         req.Title,
		FolderID:      req.FolderID,
		DashboardJSON: req.DashboardJSON,
	}
	record.ID = generateDBID()
	if err := s.db.Create(record).Error; err != nil {
		return nil, err
	}

	// 同步 dashboard_json 中的面板到 panels 表
	s.syncPanelsFromJSON(record)

	// 重新查询以加载关联数据
	s.db.Preload("Folder").Preload("Panels", "deleted_at IS NULL").Where("id = ?", record.ID).First(record)
	return ToDashboardRes(record), nil
}

// UpdateDashboard 更新仪表板的标题、文件夹和 dashboard_json。
// 同步更新 panels 表：先删除旧面板，再根据新 JSON 创建面板。
// 同时创建版本记录。
func (s *Server) UpdateDashboard(ctx *gin.Context, req *DashboardReq) (*DashboardRes, error) {
	// 先获取当前仪表板信息
	var current model.Dashboard
	if err := s.db.Where("id = ? AND deleted_at IS NULL", req.ID).First(&current).Error; err != nil {
		return nil, err
	}
	// 权限校验：仅拥有者、admin、分享可编辑者
	if !s.identity.CanManageResource(ctx, "dashboard", current.ID, current.OwnerID) {
		return nil, fmt.Errorf("无权限编辑该仪表板")
	}

	updates := map[string]interface{}{
		"title":     req.Title,
		"folder_id": req.FolderID,
	}
	if req.DashboardJSON != nil {
		updates["dashboard_json"] = req.DashboardJSON
	}
	if err := s.db.Model(&model.Dashboard{}).Where("id = ? AND deleted_at IS NULL", req.ID).Updates(updates).Error; err != nil {
		return nil, err
	}

	// 同步面板: 删除该仪表板下所有旧面板，根据新 JSON 重新创建
	if req.DashboardJSON != nil {
		var record model.Dashboard
		s.db.Where("id = ?", req.ID).First(&record)
		// 软删除旧面板，再根据 JSON 创建新面板
		s.db.Where("dashboard_id = ?", req.ID).Delete(&model.Panel{})
		s.syncPanelsFromJSON(&record)
	}

	// 查询更新后的记录
	var record model.Dashboard
	s.db.Preload("Folder").Preload("Panels", "deleted_at IS NULL").Where("id = ?", req.ID).First(&record)

	// 创建版本记录（保存更新后的新版本）
	newJSON := record.DashboardJSON
	if req.DashboardJSON != nil {
		newJSON = req.DashboardJSON
	}
	s.createVersionRecord(req.ID, record.Title, newJSON, "")

	return ToDashboardRes(&record), nil
}

// DeleteDashboard 软删除仪表板（仅拥有者或管理员可删除）。
func (s *Server) DeleteDashboard(ctx *gin.Context, req *DashboardReq) error {
	var current model.Dashboard
	if err := s.db.Where("id = ? AND deleted_at IS NULL", req.ID).First(&current).Error; err != nil {
		return err
	}
	if !s.identity.CanManageResource(ctx, "dashboard", current.ID, current.OwnerID) {
		return fmt.Errorf("无权限删除该仪表板")
	}
	return s.db.Where("id = ?", req.ID).Delete(&model.Dashboard{}).Error
}

// syncPanelsFromJSON 将 dashboard_json 中的 panels 数组同步到 panels 表。
// 用于确保 panels 表与 dashboard_json 定义保持一致。
func (s *Server) syncPanelsFromJSON(d *model.Dashboard) {
	panelsRaw, ok := d.DashboardJSON["panels"]
	if !ok {
		return
	}
	panelsList, ok := panelsRaw.([]interface{})
	if !ok {
		return
	}
	for _, pRaw := range panelsList {
		pMap, ok := pRaw.(map[string]interface{})
		if !ok {
			continue
		}
		panel := model.Panel{
			DashboardID: d.ID,
			Title:       getStringField(pMap, "title"),
			Type:        getStringField(pMap, "type"),
			GridPosX:    getGridInt(pMap, "x"),
			GridPosY:    getGridInt(pMap, "y"),
			GridPosW:    getGridInt(pMap, "w"),
			GridPosH:    getGridInt(pMap, "h"),
			SortOrder:   getIntField(pMap, "sort_order"),
			Datasource:  getJSONMapField(pMap, "datasource"),
			Options:     getJSONMapField(pMap, "options"),
		}
		if panel.Title == "" {
			panel.Title = "未命名面板"
		}
		if panel.Type == "" {
			panel.Type = "bar"
		}
		if panel.GridPosW == 0 {
			panel.GridPosW = 12
		}
		if panel.GridPosH == 0 {
			panel.GridPosH = 7
		}
		panel.ID = generatePanelID()
		s.db.Create(&panel)
	}
}

// getStringField 从 map 中安全获取字符串字段。
func getStringField(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// getIntField 从 map 中安全获取整数字段（支持 float64 自动转换）。
func getIntField(m map[string]interface{}, key string) int {
	if v, ok := m[key]; ok {
		switch n := v.(type) {
		case float64:
			return int(n)
		case int:
			return n
		}
	}
	return 0
}

// getGridInt 从 map 的 gridPos 子对象中提取网格坐标。
func getGridInt(m map[string]interface{}, key string) int {
	if gridPos, ok := m["gridPos"].(map[string]interface{}); ok {
		if v, ok := gridPos[key]; ok {
			switch n := v.(type) {
			case float64:
				return int(n)
			case int:
				return n
			}
		}
	}
	return 0
}

// getJSONMapField 从 map 中安全获取 JSONMap 字段。
func getJSONMapField(m map[string]interface{}, key string) model.JSONMap {
	if v, ok := m[key]; ok {
		if jm, ok := v.(map[string]interface{}); ok {
			return model.JSONMap(jm)
		}
	}
	return model.JSONMap{}
}

// generatePanelID 生成面板的唯一ID（最多19字符）。
// 格式：panel-{13位毫秒时间戳}
func generatePanelID() string {
	return fmt.Sprintf("panel-%d", time.Now().UnixMilli())
}

// ============================================================
// 仪表板数据查询: 根据 dashboard_json 中的面板配置查询实际数据
// ============================================================

// GetDashboardData 根据仪表板JSON中的面板配置，查询 network_metrics 表的实际数据。
// 流程：
//  1. 若请求中传入了 dashboard_json 则直接使用（前端草稿模式），否则从数据库加载
//  2. 获取变量值（优先使用请求中的变量，否则从数据库加载）
//  3. 遍历每个 panel，解析其 targets 配置
//  4. 根据 targets 查数据并应用时间范围过滤和变量替换
//  5. 返回每个面板的查询结果
func (s *Server) GetDashboardData(ctx *gin.Context, req *DashboardDataReq) (*DashboardDataRes, error) {
	var dashJSON map[string]interface{}
	var dashTitle string
	var dashID string

	if req.DashboardJSON != nil && len(req.DashboardJSON) > 0 {
		// 前端传入草稿 dashboard_json，直接使用
		dashJSON = req.DashboardJSON
		dashTitle = ""
		dashID = req.ID
	} else {
		// 从数据库加载仪表板
		var dashboard model.Dashboard
		if err := s.db.Where("id = ? AND deleted_at IS NULL", req.ID).First(&dashboard).Error; err != nil {
			return nil, fmt.Errorf("仪表板不存在: %v", err)
		}
		dashJSON = dashboard.DashboardJSON
		dashTitle = dashboard.Title
		dashID = dashboard.ID
	}

	// 获取变量值
	varValues := s.getVariableValues(dashID, req.Variables)

	// 解析 dashboard_json 中的 panels
	panelsRaw, ok := dashJSON["panels"]
	if !ok {
		return &DashboardDataRes{
			DashboardID:    dashID,
			DashboardTitle: dashTitle,
			DashboardJSON:  dashJSON,
			PanelsData:     []PanelData{},
		}, nil
	}
	panelsList, ok := panelsRaw.([]interface{})
	if !ok {
		return nil, fmt.Errorf("dashboard_json 中 panels 格式错误")
	}

	// 逐面板查询数据
	panelsData := make([]PanelData, 0, len(panelsList))
	for _, pRaw := range panelsList {
		pMap, ok := pRaw.(map[string]interface{})
		if !ok {
			continue
		}
		panelData := s.queryPanelDataWithVars(pMap, req.From, req.To, varValues)
		panelsData = append(panelsData, panelData)
	}

	return &DashboardDataRes{
		DashboardID:    dashID,
		DashboardTitle: dashTitle,
		DashboardJSON:  dashJSON,
		PanelsData:     panelsData,
	}, nil
}

// GetPanelData 查询指定仪表板中单个面板的实际数据。
// 与 GetDashboardData 不同，此接口只查询一个面板，减少数据传输量和处理开销。
// 流程：
//  1. 从数据库加载仪表板的 dashboard_json
//  2. 获取变量值
//  3. 遍历 panels 找到匹配 panel_id 的面板
//  4. 只查询该面板的 targets，返回结果
func (s *Server) GetPanelData(ctx *gin.Context, req *PanelDataReq) (*PanelData, error) {
	// 从数据库加载仪表板
	var dashboard model.Dashboard
	if err := s.db.Where("id = ? AND deleted_at IS NULL", req.DashboardID).First(&dashboard).Error; err != nil {
		return nil, fmt.Errorf("仪表板不存在: %v", err)
	}

	// 获取变量值
	varValues := s.getVariableValues(req.DashboardID, req.Variables)

	// 解析 dashboard_json 中的 panels
	dashJSON := dashboard.DashboardJSON
	panelsRaw, ok := dashJSON["panels"]
	if !ok {
		return nil, fmt.Errorf("仪表板中没有面板")
	}

	panelsList, ok := panelsRaw.([]interface{})
	if !ok {
		return nil, fmt.Errorf("panels 格式错误")
	}

	// 查找匹配的面板
	for _, pRaw := range panelsList {
		pMap, ok := pRaw.(map[string]interface{})
		if !ok {
			continue
		}
		if getStringField(pMap, "id") == req.PanelID {
			panelData := s.queryPanelDataWithVars(pMap, req.From, req.To, varValues)
			return &panelData, nil
		}
	}

	return nil, fmt.Errorf("面板 %s 不存在", req.PanelID)
}

// QueryInspect 查询检查器：执行变量替换后的 SQL 并返回实际 SQL 和查询结果。
// 用于前端 Query Inspector 功能，帮助用户调试 SQL 查询和变量替换。
// 支持MySQL和HTTP数据源。
func (s *Server) QueryInspect(ctx *gin.Context, req *QueryInspectReq) (*QueryInspectRes, error) {
	// 获取变量值
	varValues := s.getVariableValues(req.DashboardID, req.Variables)
	s.log.Infof("[QueryInspect] DashboardID=%s, reqVars=%+v, resolved varValues=%+v", req.DashboardID, req.Variables, varValues)

	res := &QueryInspectRes{
		ProcessedSQL: "",
		Columns:      []string{},
		Rows:         []map[string]interface{}{},
	}

	// 获取数据源对应的数据库连接和数据源配置
	db, ds, err := s.getDatasourceDB(req.DatasourceID)
	if err != nil {
		res.Error = fmt.Sprintf("获取数据源连接失败: %v", err)
		return res, nil
	}

	// 根据数据源类型执行查询
	if ds != nil && ds.Type == "http" {
		// HTTP数据源查询
		// 从请求中提取HTTP查询参数
		queryConfig := &datasources.HTTPQueryConfig{
			Method:     req.HTTPMethod,
			Path:       req.HTTPPath,
			BodyType:   req.HTTPBodyType,
			Body:       req.HTTPBody,
			FormData:   req.HTTPFormData,
			Headers:    req.HTTPHeaders,
			DataFormat: req.HTTPDataFormat,
			DataPath:   req.HTTPDataPath,
		}
		if queryConfig.Method == "" {
			queryConfig.Method = "GET"
		}
		if queryConfig.DataFormat == "" {
			queryConfig.DataFormat = "json"
		}

		s.log.Infof("QueryInspect HTTP: BodyType=%s, Body=%s, FormData=%v, Headers=%v", queryConfig.BodyType, queryConfig.Body, queryConfig.FormData, queryConfig.Headers)

		// 解析认证配置（用于构建请求详情）
		authConfig := s.httpQueryExec.ParseAuthConfig(ds.Config)

		// 应用变量替换到URL（与实际查询保持一致）
		fullURL := ds.URL + queryConfig.Path
		url := variables.ReplaceVariables(fullURL, varValues)

		s.log.Infof("QueryInspect HTTP: 原始URL=%s, 变量替换后=%s, From=%s, To=%s", fullURL, url, req.From, req.To)

		// 对于HTTP查询，需要手动替换系统变量（不添加引号）
		// 因为URL参数不需要引号，而ReplaceSystemVariables会添加引号（用于SQL）
		if req.From != "" && req.To != "" {
			// 解析时间
			fromTime, _ := time.Parse(time.RFC3339, req.From)
			toTime, _ := time.Parse(time.RFC3339, req.To)

			s.log.Infof("QueryInspect HTTP: 替换系统变量前URL=%s", url)

			// 替换 $__from（不添加引号）
			url = strings.ReplaceAll(url, "${__from}", req.From)
			url = strings.ReplaceAll(url, "$__from", req.From)

			// 替换 $__to（不添加引号）
			url = strings.ReplaceAll(url, "${__to}", req.To)
			url = strings.ReplaceAll(url, "$__to", req.To)

			// 替换 $__fromUnix（毫秒）
			fromMs := fromTime.UnixMilli()
			url = strings.ReplaceAll(url, "${__fromUnix}", fmt.Sprintf("%d", fromMs))
			url = strings.ReplaceAll(url, "$__fromUnix", fmt.Sprintf("%d", fromMs))

			// 替换 $__toUnix（毫秒）
			toMs := toTime.UnixMilli()
			url = strings.ReplaceAll(url, "${__toUnix}", fmt.Sprintf("%d", toMs))
			url = strings.ReplaceAll(url, "$__toUnix", fmt.Sprintf("%d", toMs))

			// 替换 $__fromMs 和 $__toMs（毫秒）
			url = strings.ReplaceAll(url, "${__fromMs}", fmt.Sprintf("%d", fromMs))
			url = strings.ReplaceAll(url, "$__fromMs", fmt.Sprintf("%d", fromMs))
			url = strings.ReplaceAll(url, "${__toMs}", fmt.Sprintf("%d", toMs))
			url = strings.ReplaceAll(url, "$__toMs", fmt.Sprintf("%d", toMs))

			s.log.Infof("QueryInspect HTTP: 替换系统变量后URL=%s", url)
		} else {
			s.log.Warnf("QueryInspect HTTP: 未提供时间范围(From=%s, To=%s)，跳过系统变量替换", req.From, req.To)
		}

		// 执行HTTP查询
		result := s.httpQueryExec.QueryHTTPDatasource(ds, queryConfig, varValues, req.From, req.To)
		if result.Error != "" {
			res.Error = result.Error
			return res, nil
		}

		// 返回变量替换后的完整URL（包含真实变量值）
		res.ProcessedSQL = url
		res.Columns = result.Columns
		res.Rows = result.Rows
		res.RowCount = len(result.Rows)

		// 构建HTTP请求详情
		reqInfo := &HTTPRequestInfo{
			Method:   queryConfig.Method,
			URL:      url,
			BodyType: queryConfig.BodyType,
			Headers:  make(map[string]string),
		}
		// 合并数据源Headers + 查询Headers
		if ds.Headers != nil {
			for k, v := range ds.Headers {
				if sv, ok := v.(string); ok {
					reqInfo.Headers[k] = sv
				}
			}
		}
		if queryConfig.Headers != nil {
			for k, v := range queryConfig.Headers {
				if sv, ok := v.(string); ok {
					reqInfo.Headers[k] = sv
				}
			}
		}
		// 认证Headers
		if authConfig.AuthType == "bearer" && authConfig.AuthToken != "" {
			reqInfo.Headers["Authorization"] = "Bearer " + authConfig.AuthToken
		} else if authConfig.AuthType == "api_key" && authConfig.AuthToken != "" {
			reqInfo.Headers["X-API-Key"] = authConfig.AuthToken
		}
		// 请求体
		switch queryConfig.BodyType {
		case "raw", "graphql":
			reqInfo.Body = queryConfig.Body
		case "form-data", "x-www-form-urlencoded":
			for _, fd := range queryConfig.FormData {
				if fd.Key != "" {
					reqInfo.FormData = append(reqInfo.FormData, map[string]string{"key": fd.Key, "value": fd.Value})
				}
			}
		}
		// 生成curl命令
		reqInfo.CurlCommand = buildCurlCommand(reqInfo)
		res.RequestInfo = reqInfo
	} else {
		// MySQL数据源查询
		// 使用共享的 SQL 处理逻辑（变量替换、系统变量、时间过滤）
		// Query Inspector 不自动添加时间过滤（chartType 为空）
		processedSQL := ProcessRawSQL(req.RawSQL, varValues, req.From, req.To, "")
		s.log.Infof("[QueryInspect] RawSQL=%s, ProcessedSQL=%s", req.RawSQL, processedSQL)
		res.ProcessedSQL = processedSQL

		// 安全检查：只允许 SELECT 开头
		trimmed := strings.TrimSpace(processedSQL)
		upper := strings.ToUpper(trimmed)
		if !strings.HasPrefix(upper, "SELECT") {
			res.Error = "只允许 SELECT 查询"
			return res, nil
		}

		// 执行 SQL
		rows, err := db.Raw(trimmed).Rows()
		if err != nil {
			res.Error = err.Error()
			return res, nil
		}
		defer rows.Close()

		columns, _ := rows.Columns()
		res.Columns = columns

		for rows.Next() {
			values := make([]interface{}, len(columns))
			valuePtrs := make([]interface{}, len(columns))
			for i := range values {
				valuePtrs[i] = &values[i]
			}
			if err := rows.Scan(valuePtrs...); err != nil {
				continue
			}
			row := make(map[string]interface{}, len(columns))
			for i, col := range columns {
				row[col] = convertValue(values[i])
			}
			res.Rows = append(res.Rows, row)
		}

		res.RowCount = len(res.Rows)
	}

	return res, nil
}

// getVariableValues 获取变量值。
// 优先使用请求中传入的变量值，否则从数据库加载变量的当前值。
// 前端已直接传入所有实际值（不传 *），后端无需展开。
func (s *Server) getVariableValues(dashboardID string, reqVars map[string]interface{}) []variables.VariableValue {
	// 如果请求中传入了变量值，直接使用
	if reqVars != nil && len(reqVars) > 0 {
		result := make([]variables.VariableValue, 0, len(reqVars))
		for name, val := range reqVars {
			vv := variables.VariableValue{Name: name}
			switch v := val.(type) {
			case string:
				vv.Value = v
			case []interface{}:
				vv.Multi = true
				vv.Values = make([]string, 0, len(v))
				for _, item := range v {
					if ss, ok := item.(string); ok {
						vv.Values = append(vv.Values, ss)
					}
				}
				if len(vv.Values) > 0 {
					vv.Value = vv.Values[0]
				}
			case []string:
				vv.Multi = true
				vv.Values = v
				if len(v) > 0 {
					vv.Value = v[0]
				}
			}
			result = append(result, vv)
		}
		return result
	}

	// 从数据库加载变量的当前值
	dbVars, err := variables.GetVariableValuesFromDB(s.db, dashboardID)
	if err != nil {
		s.log.Warnf("加载仪表板变量失败: %v", err)
		return nil
	}
	return dbVars
}

// queryPanelDataWithVars 根据单个面板配置查询数据，支持变量替换。
func (s *Server) queryPanelDataWithVars(panelMap map[string]interface{}, from, to string, varValues []variables.VariableValue) PanelData {
	panelID := getStringField(panelMap, "id")
	panelTitle := getStringField(panelMap, "title")
	panelType := getStringField(panelMap, "type")

	// 读取面板指定的数据源ID
	datasourceID := getStringField(panelMap, "datasource_id")

	// 获取数据源对应的数据库连接和数据源配置
	db, ds, err := s.getDatasourceDB(datasourceID)
	if err != nil {
		s.log.Warnf("面板 %s 获取数据源 %s 失败，使用主数据库: %v", panelID, datasourceID, err)
		db = s.db
		datasourceID = ""
		ds = nil
	}

	if datasourceID != "" {
		s.log.Infof("面板 %s 使用数据源: %s", panelID, datasourceID)
	}

	// 解析 targets 配置
	targetsRaw, ok := panelMap["targets"]
	if !ok {
		return PanelData{PanelID: panelID, PanelTitle: panelTitle, PanelType: panelType, Target: [][]map[string]interface{}{}}
	}
	targetsList, ok := targetsRaw.([]interface{})
	if !ok {
		return PanelData{PanelID: panelID, PanelTitle: panelTitle, PanelType: panelType, Target: [][]map[string]interface{}{}}
	}

	// 为每个 target 查询数据
	targetResults := make([][]map[string]interface{}, 0, len(targetsList))
	var columns []string
	for _, tRaw := range targetsList {
		tMap, ok := tRaw.(map[string]interface{})
		if !ok {
			continue
		}

		// 根据数据源类型决定查询方式
		var cols []string
		var rows []map[string]interface{}
		var queryErr error

		if ds != nil && ds.Type == "http" {
			// HTTP数据源使用HTTP查询器
			// 从数据源获取Base URL和认证，从target获取path、method等参数
			cols, rows, queryErr = s.queryHTTPTarget(ds, tMap, varValues, from, to)
		} else {
			// MySQL数据源或默认数据库使用SQL查询
			cols, rows, queryErr = s.queryTargetWithVars(db, tMap, from, to, panelType, varValues)
		}

		if queryErr != nil {
			s.log.Warnf("查询 panel %s target 数据失败: %v", panelID, queryErr)
			continue
		}
		if columns == nil {
			columns = cols
		}
		targetResults = append(targetResults, rows)
	}

	return PanelData{
		PanelID:      panelID,
		PanelTitle:   panelTitle,
		PanelType:    panelType,
		DatasourceID: datasourceID,
		Columns:      columns,
		Target:       targetResults,
	}
}

// queryTargetWithVars 根据 target map 执行数据库查询，支持变量替换。
func (s *Server) queryTargetWithVars(db *gorm.DB, tMap map[string]interface{}, from, to, chartType string, varValues []variables.VariableValue) ([]string, []map[string]interface{}, error) {
	rawSQL := getStringField(tMap, "rawSql")

	// 模式1: 用户自定义 SQL（支持变量替换和时间范围过滤）
	if rawSQL != "" {
		return s.queryWithRawSQLAndVars(db, rawSQL, tMap, varValues, from, to, chartType)
	}

	// 模式2: 自定义表模式
	table := getStringField(tMap, "table")
	fields := getStringField(tMap, "fields")
	if table != "" {
		return s.queryCustomTable(db, table, fields, tMap)
	}

	// 模式3: 默认 net_work_metrics
	category := getStringField(tMap, "category")
	metricName := getStringField(tMap, "metricName")
	return s.queryNetworkMetrics(db, category, metricName, from, to)
}

// queryHTTPTarget 根据 target map 执行HTTP数据源查询。
// HTTP数据源的查询参数从target配置中获取，URL由数据源Base URL + target path拼接。
func (s *Server) queryHTTPTarget(ds *model.Datasource, tMap map[string]interface{}, varValues []variables.VariableValue, from, to string) ([]string, []map[string]interface{}, error) {
	// 从target配置中提取HTTP查询参数
	queryConfig := &datasources.HTTPQueryConfig{
		Method:     getStringField(tMap, "http_method"),
		Path:       getStringField(tMap, "http_path"),
		BodyType:   getStringField(tMap, "http_body_type"),
		Body:       getStringField(tMap, "http_body"),
		DataFormat: getStringField(tMap, "http_data_format"),
		DataPath:   getStringField(tMap, "http_data_path"),
	}

	// 解析http_headers（可选）
	if headersVal, ok := tMap["http_headers"]; ok {
		if headersMap, ok := headersVal.(map[string]interface{}); ok {
			queryConfig.Headers = headersMap
		}
	}

	// 解析http_form_data（可选，用于form-data和x-www-form-urlencoded）
	if formDataVal, ok := tMap["http_form_data"]; ok {
		if formDataArr, ok := formDataVal.([]interface{}); ok {
			var formData []datasources.FormDataField
			for _, item := range formDataArr {
				if itemMap, ok := item.(map[string]interface{}); ok {
					field := datasources.FormDataField{
						Key:   getStringField(itemMap, "key"),
						Value: getStringField(itemMap, "value"),
					}
					formData = append(formData, field)
				}
			}
			queryConfig.FormData = formData
		}
	}

	// 解析timeout（可选）
	if timeoutVal, ok := tMap["timeout"]; ok {
		switch v := timeoutVal.(type) {
		case float64:
			queryConfig.Timeout = int(v)
		case int:
			queryConfig.Timeout = v
		}
	}

	// 如果method为空，默认为GET
	if queryConfig.Method == "" {
		queryConfig.Method = "GET"
	}

	// 如果data_format为空，默认为json
	if queryConfig.DataFormat == "" {
		queryConfig.DataFormat = "json"
	}

	// 执行HTTP查询
	result := s.httpQueryExec.QueryHTTPDatasource(ds, queryConfig, varValues, from, to)

	// 检查错误
	if result.Error != "" {
		return nil, nil, fmt.Errorf(result.Error)
	}

	// 应用别名映射（如果有）
	aliasMap := make(map[string]string)
	if amRaw, ok := tMap["aliasMap"]; ok {
		if am, ok := amRaw.(map[string]interface{}); ok {
			for k, v := range am {
				if vs, ok := v.(string); ok && vs != "" {
					aliasMap[k] = vs
				}
			}
		}
	}

	// 应用别名映射生成最终列名和行数据
	finalColumns := make([]string, 0, len(result.Columns))
	for _, col := range result.Columns {
		if alias, ok := aliasMap[col]; ok {
			finalColumns = append(finalColumns, alias)
		} else {
			finalColumns = append(finalColumns, col)
		}
	}

	// 应用别名映射到行数据
	finalRows := make([]map[string]interface{}, 0, len(result.Rows))
	for _, row := range result.Rows {
		finalRow := make(map[string]interface{}, len(row))
		for col, val := range row {
			if alias, ok := aliasMap[col]; ok {
				finalRow[alias] = val
			} else {
				finalRow[col] = val
			}
		}
		finalRows = append(finalRows, finalRow)
	}

	return finalColumns, finalRows, nil
}

// ProcessRawSQL 对原始 SQL 进行统一处理：变量替换、系统内置变量、时间过滤宏。
// chartType 为图表类型，仅折线图(line)时自动添加时间列过滤。
func ProcessRawSQL(rawSQL string, varValues []variables.VariableValue, from, to, chartType string) string {
	// 应用变量替换
	processedSQL := variables.ReplaceVariables(rawSQL, varValues)

	// 应用系统内置变量替换（时间范围）- 作为 fallback
	sysVars := variables.ParseSystemVariables(from, to)
	processedSQL = variables.ReplaceSystemVariables(processedSQL, sysVars)

	// 处理末尾分号：先移除，处理完后再添加
	hasTrailingSemicolon := strings.HasSuffix(strings.TrimSpace(processedSQL), ";")
	if hasTrailingSemicolon {
		processedSQL = strings.TrimSuffix(strings.TrimSpace(processedSQL), ";")
	}

	// 应用时间范围过滤宏：$__timeFilter(column) 替换为 column >= 'from' AND column <= 'to'
	if from != "" && to != "" {
		timeFilterRegex := regexp.MustCompile(`\$__timeFilter\(([^)]+)\)`)
		processedSQL = timeFilterRegex.ReplaceAllStringFunc(processedSQL, func(match string) string {
			submatch := timeFilterRegex.FindStringSubmatch(match)
			if len(submatch) > 1 {
				colName := submatch[1]
				return fmt.Sprintf("%s >= '%s' AND %s <= '%s'", colName, from, colName, to)
			}
			return match
		})

		// 仅折线图自动添加时间列过滤，其他图表类型不自动添加
		// 用户 SQL 中已含 $__timeFilter 宏则跳过（已处理）
		if chartType == "line" && !strings.Contains(rawSQL, "$__timeFilter") {
			upperSQL := strings.ToUpper(processedSQL)
			hasWhere := strings.Contains(upperSQL, "WHERE")
			timeColumns := []string{"created_at", "updated_at", "date", "time", "timestamp", "created_time", "record_time"}
			for _, tc := range timeColumns {
				if strings.Contains(processedSQL, tc) {
					timeFilter := fmt.Sprintf("%s >= '%s' AND %s <= '%s'", tc, from, tc, to)
					if hasWhere {
						whereIdx := strings.Index(upperSQL, "WHERE")
						if whereIdx != -1 {
							processedSQL = processedSQL[:whereIdx+5] + " " + timeFilter + " AND" + processedSQL[whereIdx+5:]
						}
					} else {
						orderIdx := strings.Index(upperSQL, "ORDER BY")
						limitIdx := strings.Index(upperSQL, "LIMIT")
						groupIdx := strings.Index(upperSQL, "GROUP BY")
						insertIdx := -1
						if groupIdx != -1 {
							insertIdx = strings.Index(processedSQL, "GROUP")
						} else if orderIdx != -1 {
							insertIdx = strings.Index(processedSQL, "ORDER")
						} else if limitIdx != -1 {
							insertIdx = strings.Index(processedSQL, "LIMIT")
						}
						if insertIdx != -1 {
							processedSQL = processedSQL[:insertIdx] + " WHERE " + timeFilter + " " + processedSQL[insertIdx:]
						} else {
							processedSQL = processedSQL + " WHERE " + timeFilter
						}
					}
					break
				}
			}
		}
	}

	// 恢复末尾分号
	if hasTrailingSemicolon {
		processedSQL = processedSQL + ";"
	}

	return processedSQL
}

// queryWithRawSQLAndVars 执行用户自定义 SQL，支持变量替换、时间范围过滤和别名映射。
func (s *Server) queryWithRawSQLAndVars(db *gorm.DB, rawSQL string, tMap map[string]interface{}, varValues []variables.VariableValue, from, to, chartType string) ([]string, []map[string]interface{}, error) {
	// 使用共享的 SQL 处理逻辑
	processedSQL := ProcessRawSQL(rawSQL, varValues, from, to, chartType)

	// 安全检查：只允许 SELECT 开头的语句
	trimmed := strings.TrimSpace(processedSQL)
	upper := strings.ToUpper(trimmed)
	if !strings.HasPrefix(upper, "SELECT") {
		return nil, nil, fmt.Errorf("只允许 SELECT 查询")
	}

	// 执行 SQL
	rows, err := db.Raw(trimmed).Rows()
	if err != nil {
		return nil, nil, fmt.Errorf("SQL 执行失败: %w", err)
	}
	defer rows.Close()

	columns, _ := rows.Columns()

	// 读取别名映射
	aliasMap := make(map[string]string)
	if amRaw, ok := tMap["aliasMap"]; ok {
		if am, ok := amRaw.(map[string]interface{}); ok {
			for k, v := range am {
				if vs, ok := v.(string); ok && vs != "" {
					aliasMap[k] = vs
				}
			}
		}
	}

	// 应用别名映射生成最终列名
	finalColumns := make([]string, 0, len(columns))
	for _, col := range columns {
		if alias, ok := aliasMap[col]; ok {
			finalColumns = append(finalColumns, alias)
		} else {
			finalColumns = append(finalColumns, col)
		}
	}

	result := make([]map[string]interface{}, 0)
	for rows.Next() {
		values := make([]interface{}, len(columns))
		valuePtrs := make([]interface{}, len(columns))
		for i := range values {
			valuePtrs[i] = &values[i]
		}
		if err := rows.Scan(valuePtrs...); err != nil {
			continue
		}

		row := make(map[string]interface{}, len(columns))
		for i, col := range columns {
			val := convertValue(values[i])
			if alias, ok := aliasMap[col]; ok {
				row[alias] = val
			} else {
				row[col] = val
			}
		}
		result = append(result, row)
	}

	return finalColumns, result, nil
}

// queryWithRawSQL 执行用户自定义 SQL 并应用别名映射。
// tMap["aliasMap"] 格式: {"col_name": "别名", ...}，用于将查询返回的列名重命名为中文别名。
func (s *Server) queryWithRawSQL(db *gorm.DB, rawSQL string, tMap map[string]interface{}) ([]string, []map[string]interface{}, error) {
	// 安全检查：只允许 SELECT 开头的语句
	trimmed := strings.TrimSpace(rawSQL)
	upper := strings.ToUpper(trimmed)
	if !strings.HasPrefix(upper, "SELECT") {
		return nil, nil, fmt.Errorf("只允许 SELECT 查询")
	}

	// 执行 SQL
	rows, err := db.Raw(trimmed).Rows()
	if err != nil {
		return nil, nil, fmt.Errorf("SQL 执行失败: %w", err)
	}
	defer rows.Close()

	columns, _ := rows.Columns()

	// 读取别名映射: aliasMap = {"col_name": "显示别名", ...}
	aliasMap := make(map[string]string)
	if amRaw, ok := tMap["aliasMap"]; ok {
		if am, ok := amRaw.(map[string]interface{}); ok {
			for k, v := range am {
				if vs, ok := v.(string); ok && vs != "" {
					aliasMap[k] = vs
				}
			}
		}
	}

	// 应用别名映射生成最终列名
	finalColumns := make([]string, 0, len(columns))
	for _, col := range columns {
		if alias, ok := aliasMap[col]; ok {
			finalColumns = append(finalColumns, alias)
		} else {
			finalColumns = append(finalColumns, col)
		}
	}

	result := make([]map[string]interface{}, 0)
	for rows.Next() {
		values := make([]interface{}, len(columns))
		valuePtrs := make([]interface{}, len(columns))
		for i := range values {
			valuePtrs[i] = &values[i]
		}
		if err := rows.Scan(valuePtrs...); err != nil {
			continue
		}

		row := make(map[string]interface{}, len(columns))
		for i, col := range columns {
			val := convertValue(values[i])
			// 应用别名映射
			if alias, ok := aliasMap[col]; ok {
				row[alias] = val
			} else {
				row[col] = val
			}
		}
		result = append(result, row)
	}

	return finalColumns, result, nil
}

// queryCustomTable 通过 raw SQL 查询自定义表，返回指定字段。
// table: 表名
// fields: 逗号分隔的字段列表，如 "market,date,weekday"；为空则查所有字段
func (s *Server) queryCustomTable(db *gorm.DB, table, fields string, _ map[string]interface{}) ([]string, []map[string]interface{}, error) {
	// 构建 SQL，防止 SQL 注入：检查 table 名是否合法（只允许字母数字下划线）
	if !regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`).MatchString(table) {
		return nil, nil, fmt.Errorf("无效的表名: %s", table)
	}

	selectClause := "*"
	if fields != "" {
		// 简单校验字段名
		parts := strings.Split(fields, ",")
		validParts := make([]string, 0, len(parts))
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`).MatchString(p) {
				validParts = append(validParts, p)
			}
		}
		if len(validParts) > 0 {
			selectClause = strings.Join(validParts, ", ")
		}
	}

	// 执行查询
	rows, err := db.Raw(fmt.Sprintf("SELECT %s FROM %s LIMIT 500", selectClause, table)).Rows()
	if err != nil {
		return nil, nil, fmt.Errorf("查询表 %s 失败: %w", table, err)
	}
	defer rows.Close()

	// 获取列名
	columns, _ := rows.Columns()

	// 扫描结果
	result := make([]map[string]interface{}, 0)
	for rows.Next() {
		values := make([]interface{}, len(columns))
		valuePtrs := make([]interface{}, len(columns))
		for i := range values {
			valuePtrs[i] = &values[i]
		}

		if err := rows.Scan(valuePtrs...); err != nil {
			continue
		}

		row := make(map[string]interface{}, len(columns))
		for i, col := range columns {
			val := values[i]
			// 处理字节数组（日期等）
			if b, ok := val.([]byte); ok {
				row[col] = string(b)
			} else {
				row[col] = val
			}
		}
		result = append(result, row)
	}

	return columns, result, nil
}

// queryNetworkMetrics 查询 net_work_metrics 表（默认模式，保持向后兼容）。
func (s *Server) queryNetworkMetrics(db *gorm.DB, category, metricName, from, to string) ([]string, []map[string]interface{}, error) {
	var metrics []model.NetWorkMetrics
	query := db.Model(&model.NetWorkMetrics{})

	if category != "" {
		query = query.Where("category LIKE ?", "%"+category+"%")
	}
	if metricName != "" {
		query = query.Where("metrics LIKE ?", "%"+metricName+"%")
	}
	// 时间范围过滤
	if from != "" {
		query = query.Where("created_at >= ?", from)
	}
	if to != "" {
		query = query.Where("created_at <= ?", to)
	}

	if err := query.Order("id ASC").Limit(500).Find(&metrics).Error; err != nil {
		return nil, nil, err
	}

	// 保持一致的列顺序
	columns := []string{"id", "created_at", "metric_category", "metric_name", "node_type", "current_value", "historical_peak", "mom_change", "yoy_change", "unit"}

	rows := make([]map[string]interface{}, 0, len(metrics))
	for _, m := range metrics {
		rows = append(rows, map[string]interface{}{
			"id":              m.ID,
			"created_at":      m.CreatedAt.Format("2006-01-02T15:04:05+08:00"),
			"metric_category": m.Category,
			"metric_name":     m.Metrics,
			"node_type":       m.Node,
			"current_value":   m.CurrentValue,
			"historical_peak": m.HistoricalPeak,
			"mom_change":      m.DodChange,
			"yoy_change":      m.WowChange,
			"unit":            m.Unit,
		})
	}
	return columns, rows, nil
}

// generateDBID 生成仪表板的唯一ID（最多19字符）。
// 格式：db-{13位毫秒时间戳}
func generateDBID() string {
	return fmt.Sprintf("db-%d", time.Now().UnixMilli())
}

// ============================================================
// 版本管理
// ============================================================

// createVersionRecord 创建版本记录。
func (s *Server) createVersionRecord(dashboardID, title string, dashboardJSON model.JSONMap, message string) {
	// 获取当前最大版本号
	var maxVersion int
	s.db.Model(&model.DashboardVersion{}).
		Where("dashboard_id = ?", dashboardID).
		Select("COALESCE(MAX(version), 0)").
		Scan(&maxVersion)

	version := &model.DashboardVersion{
		Base:          model.Base{ID: generateVersionID()},
		DashboardID:   dashboardID,
		Version:       maxVersion + 1,
		Title:         title,
		DashboardJSON: dashboardJSON,
		Message:       message,
	}
	if err := s.db.Create(version).Error; err != nil {
		s.log.Warnf("创建版本记录失败: %v", err)
	}
}

// generateVersionID 生成版本记录的唯一ID。
func generateVersionID() string {
	return fmt.Sprintf("ver-%d", time.Now().UnixMilli())
}

// ListVersions 获取仪表板版本历史列表。
func (s *Server) ListVersions(ctx *gin.Context, req *VersionListReq) ([]*VersionBriefRes, error) {
	var versions []model.DashboardVersion
	if err := s.db.Where("dashboard_id = ?", req.DashboardID).
		Order("version DESC").
		Find(&versions).Error; err != nil {
		return nil, err
	}

	// 获取当前仪表板的 JSON，用于判断哪个版本是当前生效版本
	var dashboard model.Dashboard
	currentJSON, _ := json.Marshal(model.JSONMap{})
	if err := s.db.Where("id = ? AND deleted_at IS NULL", req.DashboardID).First(&dashboard).Error; err == nil {
		currentJSON, _ = json.Marshal(dashboard.DashboardJSON)
	}

	result := make([]*VersionBriefRes, 0, len(versions))
	for _, v := range versions {
		versionJSON, _ := json.Marshal(v.DashboardJSON)
		result = append(result, &VersionBriefRes{
			ID:        v.ID,
			Version:   v.Version,
			Title:     v.Title,
			Message:   v.Message,
			CreatedBy: v.CreatedBy,
			CreatedAt: v.CreatedAt.Format("2006-01-02T15:04:05+08:00"),
			IsCurrent: string(currentJSON) == string(versionJSON),
		})
	}
	return result, nil
}

// GetVersion 获取指定版本的详细信息。
func (s *Server) GetVersion(ctx *gin.Context, req *VersionReq) (*VersionRes, error) {
	var version model.DashboardVersion
	query := s.db.Where("dashboard_id = ?", req.DashboardID)
	if req.Version > 0 {
		query = query.Where("version = ?", req.Version)
	} else {
		// 未指定版本号，返回最新版本
		query = query.Order("version DESC")
	}
	if err := query.First(&version).Error; err != nil {
		return nil, fmt.Errorf("版本不存在")
	}

	return &VersionRes{
		ID:            version.ID,
		DashboardID:   version.DashboardID,
		Version:       version.Version,
		Title:         version.Title,
		DashboardJSON: version.DashboardJSON,
		Message:       version.Message,
		CreatedBy:     version.CreatedBy,
		CreatedAt:     version.CreatedAt.Format("2006-01-02T15:04:05+08:00"),
	}, nil
}

// RestoreVersion 还原到指定版本（直接切换，不创建新版本）。
func (s *Server) RestoreVersion(ctx *gin.Context, req *VersionRestoreReq) (*DashboardRes, error) {
	// 获取指定版本
	var version model.DashboardVersion
	if err := s.db.Where("dashboard_id = ? AND version = ?", req.DashboardID, req.Version).
		First(&version).Error; err != nil {
		return nil, fmt.Errorf("版本不存在")
	}

	// 还原到指定版本
	updates := map[string]interface{}{
		"title":          version.Title,
		"dashboard_json": version.DashboardJSON,
	}
	if err := s.db.Model(&model.Dashboard{}).Where("id = ?", req.DashboardID).Updates(updates).Error; err != nil {
		return nil, err
	}

	// 同步面板
	s.db.Where("dashboard_id = ?", req.DashboardID).Delete(&model.Panel{})
	var dashboard model.Dashboard
	dashboard.ID = req.DashboardID
	dashboard.DashboardJSON = version.DashboardJSON
	s.syncPanelsFromJSON(&dashboard)

	// 查询更新后的记录
	var record model.Dashboard
	s.db.Preload("Folder").Preload("Panels", "deleted_at IS NULL").Where("id = ?", req.DashboardID).First(&record)
	return ToDashboardRes(&record), nil
}

// CompareVersions 对比两个版本的差异。
func (s *Server) CompareVersions(ctx *gin.Context, req *VersionCompareReq) (*VersionDiffRes, error) {
	// 获取两个版本
	var vFrom, vTo model.DashboardVersion
	if err := s.db.Where("dashboard_id = ? AND version = ?", req.DashboardID, req.VersionFrom).First(&vFrom).Error; err != nil {
		return nil, fmt.Errorf("版本 %d 不存在", req.VersionFrom)
	}
	if err := s.db.Where("dashboard_id = ? AND version = ?", req.DashboardID, req.VersionTo).First(&vTo).Error; err != nil {
		return nil, fmt.Errorf("版本 %d 不存在", req.VersionTo)
	}

	// 计算差异
	diff := s.computeDiff(vFrom.DashboardJSON, vTo.DashboardJSON)

	return &VersionDiffRes{
		DashboardID:   req.DashboardID,
		VersionFrom:   req.VersionFrom,
		VersionTo:     req.VersionTo,
		TitleFrom:     vFrom.Title,
		TitleTo:       vTo.Title,
		CreatedAtFrom: vFrom.CreatedAt.Format("2006-01-02T15:04:05+08:00"),
		CreatedAtTo:   vTo.CreatedAt.Format("2006-01-02T15:04:05+08:00"),
		DiffJSON:      diff,
		JSONFrom:      vFrom.DashboardJSON,
		JSONTo:        vTo.DashboardJSON,
	}, nil
}

// computeDiff 计算两个 JSON 之间的差异。
func (s *Server) computeDiff(from, to model.JSONMap) map[string]interface{} {
	diff := make(map[string]interface{})

	// 比较标题
	titleFrom, _ := from["title"].(string)
	titleTo, _ := to["title"].(string)
	if titleFrom != titleTo {
		diff["title_changed"] = map[string]interface{}{
			"from": titleFrom,
			"to":   titleTo,
		}
	}

	// 比较面板
	panelsFrom, _ := from["panels"].([]interface{})
	panelsTo, _ := to["panels"].([]interface{})

	// 提取面板信息：ID -> 面板完整数据
	fromPanelsMap := make(map[string]map[string]interface{})
	for _, p := range panelsFrom {
		if pm, ok := p.(map[string]interface{}); ok {
			id, _ := pm["id"].(string)
			if id != "" {
				fromPanelsMap[id] = pm
			}
		}
	}

	toPanelsMap := make(map[string]map[string]interface{})
	for _, p := range panelsTo {
		if pm, ok := p.(map[string]interface{}); ok {
			id, _ := pm["id"].(string)
			if id != "" {
				toPanelsMap[id] = pm
			}
		}
	}

	// 统计新增、删除、修改
	added := []map[string]interface{}{}
	removed := []map[string]interface{}{}
	modified := []map[string]interface{}{}

	// 查找新增和修改
	for id, toPanel := range toPanelsMap {
		if fromPanel, exists := fromPanelsMap[id]; !exists {
			// 新增
			title, _ := toPanel["title"].(string)
			added = append(added, map[string]interface{}{
				"id":    id,
				"title": title,
			})
		} else {
			// 检查是否修改
			if !s.panelEqual(fromPanel, toPanel) {
				title, _ := toPanel["title"].(string)
				modified = append(modified, map[string]interface{}{
					"id":    id,
					"title": title,
				})
			}
		}
	}

	// 查找删除
	for id, fromPanel := range fromPanelsMap {
		if _, exists := toPanelsMap[id]; !exists {
			title, _ := fromPanel["title"].(string)
			removed = append(removed, map[string]interface{}{
				"id":    id,
				"title": title,
			})
		}
	}

	panelDiff := map[string]interface{}{
		"from_count":     len(panelsFrom),
		"to_count":       len(panelsTo),
		"added":          added,
		"removed":        removed,
		"modified":       modified,
		"added_count":    len(added),
		"removed_count":  len(removed),
		"modified_count": len(modified),
	}
	diff["panels"] = panelDiff

	return diff
}

// panelEqual 比较两个面板是否相等。
func (s *Server) panelEqual(a, b map[string]interface{}) bool {
	// 简单比较：序列化后比较
	// 排除一些可能变化的字段如临时状态
	aCopy := make(map[string]interface{})
	bCopy := make(map[string]interface{})
	for k, v := range a {
		aCopy[k] = v
	}
	for k, v := range b {
		bCopy[k] = v
	}

	aJSON, _ := json.Marshal(aCopy)
	bJSON, _ := json.Marshal(bCopy)
	return string(aJSON) == string(bJSON)
}

// DeleteVersion 删除指定版本。
func (s *Server) DeleteVersion(ctx *gin.Context, req *VersionReq) error {
	if req.Version <= 0 {
		return fmt.Errorf("请指定要删除的版本号")
	}
	return s.db.Where("dashboard_id = ? AND version = ?", req.DashboardID, req.Version).Delete(&model.DashboardVersion{}).Error
}

// ============================================================
// 分享管理（仪表板/快照通用）
// ============================================================

// ShareReq 分享请求。
type ShareReq struct {
	ResourceType string `json:"resource_type" binding:"required"` // dashboard / snapshot
	ResourceID   string `json:"resource_id" binding:"required"`
	ShareToType  string `json:"share_to_type" binding:"required"` // user / team
	ShareToID    string `json:"share_to_id" binding:"required"`
	CanEdit      bool   `json:"can_edit"`
}

// ShareListReq 分享列表请求。
type ShareListReq struct {
	ResourceType string `json:"resource_type" binding:"required"`
	ResourceID   string `json:"resource_id" binding:"required"`
}

// ShareRes 分享记录响应。
type ShareRes struct {
	ID           uint   `json:"id"`
	ResourceType string `json:"resource_type"`
	ResourceID   string `json:"resource_id"`
	ShareToType  string `json:"share_to_type"`
	ShareToID    string `json:"share_to_id"`
	CanEdit      bool   `json:"can_edit"`
	SharedBy     string `json:"shared_by"`
	CreatedAt    string `json:"created_at"`
}

// ShareResource 添加/更新分享。仅资源拥有者或管理员可分享。
func (s *Server) ShareResource(ctx *gin.Context, req *ShareReq) error {
	ownerID := s.getResourceOwner(ctx, req.ResourceType, req.ResourceID)
	if ownerID == "" {
		return fmt.Errorf("资源不存在")
	}
	if !s.identity.CanManageResource(ctx, req.ResourceType, req.ResourceID, ownerID) {
		return fmt.Errorf("无权限分享该资源")
	}
	sharedBy := ""
	if uc := identity.FromContext(ctx); uc != nil {
		sharedBy = uc.UserID
	}

	// upsert：已存在则更新 can_edit，否则创建
	var existing model.ResourceShare
	err := s.db.Where("resource_type = ? AND resource_id = ? AND share_to_type = ? AND share_to_id = ? AND deleted_at IS NULL",
		req.ResourceType, req.ResourceID, req.ShareToType, req.ShareToID).First(&existing).Error
	if err == nil {
		return s.db.Model(&model.ResourceShare{}).Where("id = ?", existing.ID).Update("can_edit", req.CanEdit).Error
	}
	share := model.ResourceShare{
		ResourceType: req.ResourceType,
		ResourceID:   req.ResourceID,
		ShareToType:  req.ShareToType,
		ShareToID:    req.ShareToID,
		CanEdit:      req.CanEdit,
		SharedBy:     sharedBy,
	}
	return s.db.Create(&share).Error
}

// UnshareResource 取消分享。仅资源拥有者或管理员可取消。
func (s *Server) UnshareResource(ctx *gin.Context, req *ShareReq) error {
	ownerID := s.getResourceOwner(ctx, req.ResourceType, req.ResourceID)
	if ownerID == "" {
		return fmt.Errorf("资源不存在")
	}
	if !s.identity.CanManageResource(ctx, req.ResourceType, req.ResourceID, ownerID) {
		return fmt.Errorf("无权限取消分享")
	}
	return s.db.Where("resource_type = ? AND resource_id = ? AND share_to_type = ? AND share_to_id = ?",
		req.ResourceType, req.ResourceID, req.ShareToType, req.ShareToID).
		Delete(&model.ResourceShare{}).Error
}

// ListShares 获取资源的分享列表。
func (s *Server) ListShares(ctx *gin.Context, req *ShareListReq) ([]ShareRes, error) {
	var shares []model.ResourceShare
	if err := s.db.Where("resource_type = ? AND resource_id = ? AND deleted_at IS NULL",
		req.ResourceType, req.ResourceID).Order("created_at ASC").Find(&shares).Error; err != nil {
		return nil, err
	}
	res := make([]ShareRes, 0, len(shares))
	for _, sh := range shares {
		res = append(res, ShareRes{
			ID:           sh.ID,
			ResourceType: sh.ResourceType,
			ResourceID:   sh.ResourceID,
			ShareToType:  sh.ShareToType,
			ShareToID:    sh.ShareToID,
			CanEdit:      sh.CanEdit,
			SharedBy:     sh.SharedBy,
			CreatedAt:    sh.CreatedAt.Format("2006-01-02T15:04:05+08:00"),
		})
	}
	return res, nil
}

// getResourceOwner 获取资源的拥有者用户ID。
func (s *Server) getResourceOwner(ctx *gin.Context, resType, resID string) string {
	switch resType {
	case "dashboard":
		var d model.Dashboard
		if err := s.db.Where("id = ? AND deleted_at IS NULL", resID).First(&d).Error; err == nil {
			return d.OwnerID
		}
	case "snapshot":
		var snap model.Snapshot
		if err := s.db.Where("id = ? AND deleted_at IS NULL", resID).First(&snap).Error; err == nil {
			return snap.OwnerID
		}
	}
	return ""
}
