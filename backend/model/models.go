// Package model 定义数据库表结构对应的模型（GORM实体）。
// 包含存量表（网络指标、业务系统）以及报表平台新表（文件夹、数据源、仪表板、面板）。
package model

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// Base 是所有表的公共字段，提供 ID、创建时间、更新时间、软删除支持。
// 其他模型通过嵌入 Base 来继承这些字段。
type Base struct {
	// ID 主键，使用雪花/自定义算法生成的字符串ID
	ID string `gorm:"type:varchar(19);primary_key;not null" json:"id"`
	// CreatedAt 记录创建时间
	CreatedAt time.Time `gorm:"type:datetime(3)" json:"created_at"`
	// UpdatedAt 记录最后更新时间
	UpdatedAt time.Time `gorm:"type:datetime(3)" json:"updated_at"`
	// DeletedAt 软删除标记（GORM 自动处理）
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// ============================================================
// 存量表（来自原有 cmp_service 库）
// ============================================================

// NetWorkMetrics 网络指标数据表，存储各类网络链路的监控指标。
// 对应数据库表：network_metrics（存量表名，可能略有差异）。
type NetWorkMetrics struct {
	Base
	// Node 节点类型标识
	Node string `gorm:"type:varchar(64);not null" json:"node"`
	// Category 指标分类（如：带宽、延迟、丢包率）
	Category string `gorm:"column:category;type:varchar(124);not null" json:"metric_category"`
	// Metrics 指标名称
	Metrics string `gorm:"column:metrics;type:varchar(124);not null" json:"metric_name"`
	// Unit 指标单位（如：Mbps、ms、%）
	Unit string `gorm:"type:varchar(6);not null" json:"unit"`
	// CurrentValueSourceId 当前值的来源ID
	CurrentValueSourceId string `gorm:"type:varchar(128);not null" json:"current_value_source_id"`
	// CurrentValue 当前值
	CurrentValue string `gorm:"type:varchar(12);not null" json:"current_value"`
	// HistoricalPeakSourceId 历史峰值的来源ID
	HistoricalPeakSourceId string `gorm:"column:historical_peak_source_id;type:varchar(128);not null" json:"historical_peak_source_id"`
	// HistoricalPeak 历史峰值
	HistoricalPeak string `gorm:"type:varchar(12);not null" json:"historical_peak"`
	// WowChange 周同比变化（Week over Week）
	WowChange string `gorm:"column:wow_change;type:varchar(12)" json:"yoy_change"`
	// DodChange 日环比变化（Day over Day）
	DodChange string `gorm:"column:dod_change;type:varchar(12)" json:"mom_change"`
	// HistoryPeakSourceId 历史峰值来源ID（另一个来源维度）
	HistoryPeakSourceId string `gorm:"column:history_peak_source_id;type:varchar(128);not null" json:"history_peak_source_id"`
}

// BusinessSystems 业务系统表，存储业务系统的引用配置信息。
// 对应数据库表：business_systems（存量表名）。
type BusinessSystems struct {
	// References 业务系统引用数据（JSON格式）
	References string `gorm:"type:json" json:"references"`
}

// ============================================================
// 报表平台新表（Grafana 风格仪表板系统）
// ============================================================

// JSONMap 是自定义的 JSON 字段类型，用于在 GORM 中存储和读取 JSON 数据。
// 实现了 sql.Scanner 和 driver.Valuer 接口，支持与 MySQL JSON 类型的双向转换。
type JSONMap map[string]interface{}
type JSONArray []map[string]interface{}

// Value 实现 driver.Valuer 接口，将 Go map 序列化为 JSON 字符串写入数据库。
func (j JSONMap) Value() (driver.Value, error) {
	if j == nil {
		return "{}", nil
	}
	b, err := json.Marshal(j)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

// Scan 实现 sql.Scanner 接口，从数据库读取 JSON 字符串并反序列化为 Go map。
func (j *JSONMap) Scan(value interface{}) error {
	if value == nil {
		*j = JSONMap{}
		return nil
	}
	var bytes []byte
	switch v := value.(type) {
	case []byte:
		bytes = v
	case string:
		bytes = []byte(v)
	default:
		return errors.New(fmt.Sprint("failed to unmarshal JSONMap value:", value))
	}
	return json.Unmarshal(bytes, j)
}

// Value 实现 driver.Valuer 接口，将 JSONArray 序列化为 JSON 字符串。
func (j JSONArray) Value() (driver.Value, error) {
	if j == nil {
		return "[]", nil
	}
	b, err := json.Marshal(j)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

// Scan 实现 sql.Scanner 接口，从数据库读取 JSON 字符串并反序列化为 JSONArray。
func (j *JSONArray) Scan(value interface{}) error {
	if value == nil {
		*j = JSONArray{}
		return nil
	}
	var bytes []byte
	switch v := value.(type) {
	case []byte:
		bytes = v
	case string:
		bytes = []byte(v)
	default:
		return errors.New(fmt.Sprint("failed to unmarshal JSONArray value:", value))
	}
	// 先尝试数组，再尝试对象（兼容旧数据），都不行返回空数组
	err := json.Unmarshal(bytes, j)
	if err != nil {
		// 兼容旧格式：panels_data 可能以 {} 存储，当作空数组
		var m map[string]interface{}
		if json.Unmarshal(bytes, &m) == nil {
			*j = JSONArray{}
			return nil
		}
		return err
	}
	return nil
}

// Folder 文件夹表，用于组织仪表板的层级结构。
// 对应数据库表：folders
type Folder struct {
	Base
	// UID 文件夹的唯一标识（短标识符，用于URL等场景）
	UID string `gorm:"column:uid;type:varchar(64);not null" json:"uid"`
	// Title 文件夹显示名称
	Title string `gorm:"type:varchar(128);not null" json:"title"`
}

// TableName 指定文件夹表名。
func (Folder) TableName() string { return "folders" }

// Datasource 数据源配置表，存储外部数据源的连接信息。
// 支持 MySQL 和 HTTP API 两种类型。
// 对应数据库表：datasources
type Datasource struct {
	Base
	// Name 数据源名称（用户自定义）
	Name string `gorm:"type:varchar(128);not null" json:"name"`
	// Type 数据源类型：mysql 或 http
	Type string `gorm:"type:varchar(16);not null" json:"type"`
	// URL 连接地址（MySQL为host:port，HTTP为完整URL）
	URL string `gorm:"type:varchar(512);not null" json:"url"`
	// DatabaseName 数据库名（仅MySQL类型使用）
	DatabaseName string `gorm:"column:database_name;type:varchar(64);default:''" json:"database_name"`
	// Username 数据库用户名（仅MySQL类型使用）
	Username string `gorm:"column:username;type:varchar(64);default:''" json:"username"`
	// Password 数据库密码（仅MySQL类型使用，存储时应加密）
	Password string `gorm:"type:varchar(256);default:''" json:"password"`
	// Headers HTTP请求头（仅HTTP类型使用，JSON格式）
	Headers JSONMap `gorm:"type:json" json:"headers"`
	// Enabled 是否启用该数据源
	Enabled bool `gorm:"type:tinyint(1);default:1" json:"enabled"`
}

// TableName 指定数据源表名。
func (Datasource) TableName() string { return "datasources" }

// Dashboard 仪表板表，代表一个可视化报表面板集合。
// 每个仪表板归属于一个文件夹，其完整定义（含面板、布局、数据源）存储在 DashboardJSON 字段中。
// 对应数据库表：dashboards
type Dashboard struct {
	Base
	// Title 仪表板标题
	Title string `gorm:"type:varchar(256);not null" json:"title"`
	// FolderID 所属文件夹ID（外键关联 folders 表）
	FolderID string `gorm:"column:folder_id;type:varchar(19);not null" json:"folder_id"`
	// DashboardJSON 仪表板完整JSON定义（Grafana风格），包含 panels、layout、datasource 等
	DashboardJSON JSONMap `gorm:"column:dashboard_json;type:json" json:"dashboard_json"`
	// Folder 关联的文件夹对象（GORM Preload 加载）
	Folder *Folder `gorm:"foreignKey:FolderID" json:"folder,omitempty"`
	// Panels 仪表板下包含的面板列表（GORM Preload 加载，仅加载未软删除的面板）
	Panels []Panel `gorm:"foreignKey:DashboardID" json:"panels,omitempty"`
}

// TableName 指定仪表板表名。
func (Dashboard) TableName() string { return "dashboards" }

// Panel 面板表，代表仪表板中的一个可视化图表。
// 每个面板包含图表类型、布局位置、数据源配置和图表选项。
// 对应数据库表：panels
type Panel struct {
	Base
	// DashboardID 所属仪表板ID（外键关联 dashboards 表）
	DashboardID string `gorm:"column:dashboard_id;type:varchar(19);not null" json:"dashboard_id"`
	// Title 面板标题
	Title string `gorm:"type:varchar(256);not null" json:"title"`
	// Type 图表类型：bar（柱状图）、line（折线图）、pie（饼图）、gauge（仪表盘）、table（表格）
	Type string `gorm:"type:varchar(16);not null" json:"type"`
	// GridPosX 面板在网格布局中的X坐标（列起始位置）
	GridPosX int `gorm:"column:grid_pos_x;not null;default:0" json:"grid_pos_x"`
	// GridPosY 面板在网格布局中的Y坐标（行起始位置）
	GridPosY int `gorm:"column:grid_pos_y;not null;default:0" json:"grid_pos_y"`
	// GridPosW 面板在网格布局中的宽度（列跨度，默认12）
	GridPosW int `gorm:"column:grid_pos_w;not null;default:12" json:"grid_pos_w"`
	// GridPosH 面板在网格布局中的高度（行跨度，默认7）
	GridPosH int `gorm:"column:grid_pos_h;not null;default:7" json:"grid_pos_h"`
	// Datasource 面板绑定的数据源配置（JSON格式，包含数据源ID和查询参数）
	Datasource JSONMap `gorm:"type:json" json:"datasource"`
	// Options 面板的图表选项（JSON格式，包含颜色、图例、阈值等配置）
	Options JSONMap `gorm:"type:json" json:"options"`
	// SortOrder 面板在仪表板中的排序序号
	SortOrder int `gorm:"column:sort_order;not null;default:0" json:"sort_order"`
}

// TableName 指定面板表名。
func (Panel) TableName() string { return "panels" }

// Snapshot 快照表，存储仪表板或面板的即时快照，用于共享链接。
type Snapshot struct {
	Base
	DashboardID   string    `gorm:"column:dashboard_id;type:varchar(64);not null" json:"dashboard_id"`
	PanelID       string    `gorm:"column:panel_id;type:varchar(64);default:''" json:"panel_id"`
	Key           string    `gorm:"column:snapshot_key;type:varchar(64);uniqueIndex;not null" json:"snapshot_key"`
	Name          string    `gorm:"type:varchar(256);default:''" json:"name"`
	DashboardJSON JSONMap   `gorm:"column:dashboard_json;type:json" json:"dashboard_json"`
	PanelsData    JSONArray  `gorm:"column:panels_data;type:json" json:"panels_data"`
	ExpiresAt     *time.Time `gorm:"column:expires_at" json:"expires_at,omitempty"`
}

// TableName 指定快照表名。
func (Snapshot) TableName() string { return "snapshots" }
