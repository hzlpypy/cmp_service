// Package dashboards 提供仪表板管理的业务逻辑层。
// 实现仪表板的增删改查操作，包括面板的关联查询和基于 dashboard_json 的数据查询。
package dashboards

import (
	"cmp_service_backend/model"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

// Server 仪表板业务服务，持有数据库连接和日志记录器。
type Server struct {
	db  *gorm.DB
	log *logrus.Logger
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
}

// NewServer 创建仪表板业务服务实例。
func NewServer(db *gorm.DB, log *logrus.Logger) Interface {
	return &Server{db: db, log: log}
}

// ListDashboards 获取所有未删除的仪表板，可选按文件夹ID过滤。
func (s *Server) ListDashboards(ctx *gin.Context, folderID string) ([]*DashboardRes, error) {
	var records []*model.Dashboard
	query := s.db.Where("deleted_at IS NULL")
	if folderID != "" {
		query = query.Where("folder_id = ?", folderID)
	}
	if err := query.Preload("Folder").Preload("Panels", "deleted_at IS NULL").Order("created_at ASC").Find(&records).Error; err != nil {
		return nil, err
	}
	result := make([]*DashboardRes, 0, len(records))
	for _, r := range records {
		result = append(result, ToDashboardRes(r))
	}
	return result, nil
}

// GetDashboard 根据 ID 获取单个仪表板详情。
func (s *Server) GetDashboard(ctx *gin.Context, req *DashboardReq) (*DashboardRes, error) {
	var record model.Dashboard
	if err := s.db.Where("id = ? AND deleted_at IS NULL", req.ID).
		Preload("Folder").
		Preload("Panels", "deleted_at IS NULL").
		First(&record).Error; err != nil {
		return nil, err
	}
	return ToDashboardRes(&record), nil
}

// CreateDashboard 创建新仪表板，同时存储 dashboard_json 完整定义。
// 也会将 dashboard_json 中的面板同步写入 panels 表，保证双存储一致性。
func (s *Server) CreateDashboard(ctx *gin.Context, req *DashboardReq) (*DashboardRes, error) {
	record := &model.Dashboard{
		Title:         req.Title,
		FolderID:      req.FolderID,
		DashboardJSON: req.DashboardJSON,
	}
	if record.DashboardJSON == nil {
		record.DashboardJSON = model.JSONMap{}
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
func (s *Server) UpdateDashboard(ctx *gin.Context, req *DashboardReq) (*DashboardRes, error) {
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
	return ToDashboardRes(&record), nil
}

// DeleteDashboard 软删除仪表板。
func (s *Server) DeleteDashboard(ctx *gin.Context, req *DashboardReq) error {
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
//  2. 遍历每个 panel，解析其 targets 配置
//  3. 根据 targets 查数据并应用时间范围过滤
//  4. 返回每个面板的查询结果
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
		panelData := s.queryPanelData(pMap, req.From, req.To)
		panelsData = append(panelsData, panelData)
	}

	return &DashboardDataRes{
		DashboardID:    dashID,
		DashboardTitle: dashTitle,
		DashboardJSON:  dashJSON,
		PanelsData:     panelsData,
	}, nil
}

// queryPanelData 根据单个面板配置查询 network_metrics 数据。
// 每个 target 查询一组数据，返回按 target 分组的结果。
// 面板可指定 datasource_id，不同面板可使用不同数据源获取数据。
func (s *Server) queryPanelData(panelMap map[string]interface{}, from, to string) PanelData {
	panelID := getStringField(panelMap, "id")
	panelTitle := getStringField(panelMap, "title")
	panelType := getStringField(panelMap, "type")

	// 读取面板指定的数据源ID，用于根据不同的数据源查询数据
	datasourceID := getStringField(panelMap, "datasource_id")

	// 如果面板指定了数据源，打印日志确认
	if datasourceID != "" {
		var d model.Datasource
		if err := s.db.Where("id = ? AND enabled = 1 AND deleted_at IS NULL", datasourceID).First(&d).Error; err == nil {
			s.log.Infof("面板 %s 使用数据源: %s (%s)", panelID, d.Name, d.Type)
		} else {
			s.log.Warnf("面板 %s 指定的数据源 %s 不可用: %v", panelID, datasourceID, err)
		}
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
	for _, tRaw := range targetsList {
		tMap, ok := tRaw.(map[string]interface{})
		if !ok {
			continue
		}

		// 读取 target 配置
		rows, err := s.queryTargetFromMap(tMap, from, to)
		if err != nil {
			s.log.Warnf("查询 panel %s target 数据失败: %v", panelID, err)
			continue
		}
		targetResults = append(targetResults, rows)
	}

	return PanelData{
		PanelID:      panelID,
		PanelTitle:   panelTitle,
		PanelType:    panelType,
		DatasourceID: datasourceID,
		Target:       targetResults,
	}
}

// queryTargetFromMap 根据 target map 执行数据库查询。
// 支持三种模式（按优先级）：
//   - rawSql 模式：执行用户自定义 SQL 语句
//   - table 模式：指定 table + fields 查询（向后兼容）
//   - 默认模式：查询 net_work_metrics 表
func (s *Server) queryTargetFromMap(tMap map[string]interface{}, from, to string) ([]map[string]interface{}, error) {
	rawSQL := getStringField(tMap, "rawSql")

	// 模式1: 用户自定义 SQL
	if rawSQL != "" {
		return s.queryWithRawSQL(rawSQL, tMap)
	}

	// 模式2: 自定义表模式
	table := getStringField(tMap, "table")
	fields := getStringField(tMap, "fields")
	if table != "" {
		return s.queryCustomTable(table, fields, tMap)
	}

	// 模式3: 默认 net_work_metrics
	category := getStringField(tMap, "category")
	metricName := getStringField(tMap, "metricName")
	return s.queryNetworkMetrics(category, metricName, from, to)
}

// queryWithRawSQL 执行用户自定义 SQL 并应用别名映射。
// tMap["aliasMap"] 格式: {"col_name": "别名", ...}，用于将查询返回的列名重命名为中文别名。
func (s *Server) queryWithRawSQL(rawSQL string, tMap map[string]interface{}) ([]map[string]interface{}, error) {
	// 安全检查：只允许 SELECT 开头的语句
	trimmed := strings.TrimSpace(rawSQL)
	upper := strings.ToUpper(trimmed)
	if !strings.HasPrefix(upper, "SELECT") {
		return nil, fmt.Errorf("只允许 SELECT 查询")
	}

	// 执行 SQL
	rows, err := s.db.Raw(trimmed).Rows()
	if err != nil {
		return nil, fmt.Errorf("SQL 执行失败: %w", err)
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
			if b, ok := val.([]byte); ok {
				val = string(b)
			}
			// 应用别名映射
			if alias, ok := aliasMap[col]; ok {
				row[alias] = val
			} else {
				row[col] = val
			}
		}
		result = append(result, row)
	}

	return result, nil
}

// queryCustomTable 通过 raw SQL 查询自定义表，返回指定字段。
// table: 表名
// fields: 逗号分隔的字段列表，如 "market,date,weekday"；为空则查所有字段
func (s *Server) queryCustomTable(table, fields string, _ map[string]interface{}) ([]map[string]interface{}, error) {
	// 构建 SQL，防止 SQL 注入：检查 table 名是否合法（只允许字母数字下划线）
	if !regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`).MatchString(table) {
		return nil, fmt.Errorf("无效的表名: %s", table)
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
	rows, err := s.db.Raw(fmt.Sprintf("SELECT %s FROM %s LIMIT 500", selectClause, table)).Rows()
	if err != nil {
		return nil, fmt.Errorf("查询表 %s 失败: %w", table, err)
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

	return result, nil
}

// queryNetworkMetrics 查询 net_work_metrics 表（默认模式，保持向后兼容）。
func (s *Server) queryNetworkMetrics(category, metricName, from, to string) ([]map[string]interface{}, error) {
	var metrics []model.NetWorkMetrics
	query := s.db.Model(&model.NetWorkMetrics{})

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
		return nil, err
	}

	rows := make([]map[string]interface{}, 0, len(metrics))
	for _, m := range metrics {
		rows = append(rows, map[string]interface{}{
			"id":               m.ID,
			"created_at":       m.CreatedAt.Format("2006-01-02T15:04:05+08:00"),
			"metric_category":  m.Category,
			"metric_name":      m.Metrics,
			"node_type":        m.Node,
			"current_value":    m.CurrentValue,
			"historical_peak":  m.HistoricalPeak,
			"mom_change":       m.DodChange,
			"yoy_change":       m.WowChange,
			"unit":             m.Unit,
		})
	}
	return rows, nil
}

// generateDBID 生成仪表板的唯一ID（最多19字符）。
// 格式：db-{13位毫秒时间戳}
func generateDBID() string {
	return fmt.Sprintf("db-%d", time.Now().UnixMilli())
}
