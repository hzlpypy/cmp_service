package snapshots

import (
	"cmp_service_backend/identity"
	"cmp_service_backend/model"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

// Server holds the snapshot business service.
type Server struct {
	db       *gorm.DB
	log      *logrus.Logger
	identity *identity.Provider
}

// Interface defines snapshot business operations.
type Interface interface {
	Create(ctx *gin.Context, req *CreateReq) (*SnapshotRes, error)
	Get(ctx *gin.Context, key string) (*SnapshotRes, error)
	List(ctx *gin.Context, dashboardID, panelID string) ([]*SnapshotRes, error)
	Delete(ctx *gin.Context, key string) error
	Update(ctx *gin.Context, req *UpdateReq) (*SnapshotRes, error)
}

// NewServer creates a snapshot service instance.
func NewServer(db *gorm.DB, log *logrus.Logger, identityProvider *identity.Provider) Interface {
	return &Server{db: db, log: log, identity: identityProvider}
}

// CreateReq snapshot create request.
type CreateReq struct {
	DashboardID   string                   `json:"dashboard_id" binding:"required"`
	PanelID       string                   `json:"panel_id"`
	Name          string                   `json:"name"`
	DashboardJSON map[string]interface{}   `json:"dashboard_json"`
	PanelsData    []map[string]interface{} `json:"panels_data"`
	AIInsights    map[string]interface{}   `json:"ai_insights"` // AI 洞察内容
}

// UpdateReq snapshot update request.
type UpdateReq struct {
	Key        string                 `json:"snapshot_key" binding:"required"`
	Name       string                 `json:"name"`
	AIInsights map[string]interface{} `json:"ai_insights"` // AI 洞察内容
}

// SnapshotRes snapshot response.
type SnapshotRes struct {
	ID             string                   `json:"id"`
	OwnerID        string                   `json:"owner_id"`
	CanEdit        bool                     `json:"can_edit"`
	Source         string                   `json:"source"`
	DashboardID    string                   `json:"dashboard_id"`
	DashboardTitle string                   `json:"dashboard_title"` // 仪表板标题
	PanelID        string                   `json:"panel_id"`
	Key            string                   `json:"snapshot_key"`
	Name           string                   `json:"name"`
	DashboardJSON  map[string]interface{}   `json:"dashboard_json"`
	PanelsData     []map[string]interface{} `json:"panels_data,omitempty"`
	AIInsights     map[string]interface{}   `json:"ai_insights,omitempty"` // AI 洞察内容
	CreatedAt      string                   `json:"created_at"`
	ExpiresAt      string                   `json:"expires_at,omitempty"`
}

func generateKey() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// Create creates a new snapshot.
func (s *Server) Create(ctx *gin.Context, req *CreateReq) (*SnapshotRes, error) {
	// 记录创建者
	ownerID := ""
	if uc := identity.FromContext(ctx); uc != nil {
		ownerID = uc.UserID
	}
	key := generateKey()
	snap := model.Snapshot{
		OwnerID:       ownerID,
		DashboardID:   req.DashboardID,
		PanelID:       req.PanelID,
		Key:           key,
		Name:          req.Name,
		DashboardJSON: req.DashboardJSON,
		PanelsData:    req.PanelsData,
		AIInsights:    req.AIInsights,
	}
	snap.ID = fmt.Sprintf("snap-%d", time.Now().UnixMilli())
	if err := s.db.Create(&snap).Error; err != nil {
		return nil, fmt.Errorf("create snapshot failed: %v", err)
	}
	return toRes(&snap, ""), nil
}

// Get retrieves a snapshot by public key.
func (s *Server) Get(ctx *gin.Context, key string) (*SnapshotRes, error) {
	var snap model.Snapshot
	if err := s.db.Where("snapshot_key = ? AND deleted_at IS NULL", key).First(&snap).Error; err != nil {
		return nil, fmt.Errorf("snapshot not found")
	}
	// 查询仪表板标题
	var title string
	s.db.Table("dashboards").Where("id = ?", snap.DashboardID).Select("title").Scan(&title)
	return toRes(&snap, title), nil
}

// List returns snapshots visible to the current user for a dashboard or panel.
// 可见范围：自己的 + 分享给我的/我团队的 + 团队/部门成员的（按角色）。
func (s *Server) List(ctx *gin.Context, dashboardID, panelID string) ([]*SnapshotRes, error) {
	var snaps []model.Snapshot
	q := s.db.Scopes(s.identity.VisibleScope(ctx, "snapshot")).Where("deleted_at IS NULL")
	if dashboardID != "" {
		q = q.Where("dashboard_id = ?", dashboardID)
	}
	if panelID != "" {
		q = q.Where("panel_id = ?", panelID)
	}
	// 列表查询不加载 dashboard_json 和 panels_data，避免排序内存溢出
	if err := q.Select("id, owner_id, dashboard_id, panel_id, snapshot_key, name, created_at, updated_at, deleted_at").
		Order("created_at DESC").Find(&snaps).Error; err != nil {
		return nil, fmt.Errorf("list snapshots failed: %v", err)
	}

	// 批量查询仪表板标题
	dashboardIDs := make([]string, 0, len(snaps))
	for _, snap := range snaps {
		if snap.DashboardID != "" {
			dashboardIDs = append(dashboardIDs, snap.DashboardID)
		}
	}
	titleMap := make(map[string]string)
	if len(dashboardIDs) > 0 {
		var results []struct {
			ID    string
			Title string
		}
		s.db.Table("dashboards").Where("id IN ?", dashboardIDs).Select("id, title").Scan(&results)
		for _, r := range results {
			titleMap[r.ID] = r.Title
		}
	}

	// 批量计算权限字段
	uc := identity.FromContext(ctx)
	me := ""
	if uc != nil {
		me = uc.UserID
	}
	editableShared := s.identity.EditableShareIDs(ctx, "snapshot")
	sharedToMe := s.identity.SharedResourceIDs(ctx, "snapshot")

	res := make([]*SnapshotRes, 0, len(snaps))
	for i := range snaps {
		r := toRes(&snaps[i], titleMap[snaps[i].DashboardID])
		r.CanEdit = uc != nil && (uc.IsAdmin() || snaps[i].OwnerID == me || editableShared[snaps[i].ID])
		// source 分组：mine(我的) / shared(分享给我的) / team(团队/部门可见)
		switch {
		case uc != nil && uc.IsAdmin():
			r.Source = "mine"
		case snaps[i].OwnerID == me:
			r.Source = "mine"
		case sharedToMe[snaps[i].ID]:
			r.Source = "shared"
		default:
			r.Source = "team"
		}
		res = append(res, r)
	}
	return res, nil
}

// Delete soft-deletes a snapshot.
// 权限：仅创建者本人、admin 或分享可编辑者。
func (s *Server) Delete(ctx *gin.Context, key string) error {
	var snap model.Snapshot
	if err := s.db.Where("snapshot_key = ? AND deleted_at IS NULL", key).First(&snap).Error; err != nil {
		return fmt.Errorf("snapshot not found")
	}
	if !s.identity.CanManageResource(ctx, "snapshot", snap.ID, snap.OwnerID) {
		return fmt.Errorf("无权限删除该快照")
	}
	if err := s.db.Where("snapshot_key = ?", key).Delete(&model.Snapshot{}).Error; err != nil {
		return fmt.Errorf("delete snapshot failed: %v", err)
	}
	return nil
}

// Update updates a snapshot (mainly for AI insights).
// 权限：仅创建者本人、admin 或分享可编辑者。
func (s *Server) Update(ctx *gin.Context, req *UpdateReq) (*SnapshotRes, error) {
	var snap model.Snapshot
	if err := s.db.Where("snapshot_key = ? AND deleted_at IS NULL", req.Key).First(&snap).Error; err != nil {
		return nil, fmt.Errorf("snapshot not found")
	}
	if !s.identity.CanManageResource(ctx, "snapshot", snap.ID, snap.OwnerID) {
		return nil, fmt.Errorf("无权限更新该快照")
	}
	// 更新字段
	if req.Name != "" {
		snap.Name = req.Name
	}
	if req.AIInsights != nil {
		snap.AIInsights = req.AIInsights
	}
	if err := s.db.Save(&snap).Error; err != nil {
		return nil, fmt.Errorf("update snapshot failed: %v", err)
	}
	// 查询仪表板标题
	var title string
	s.db.Table("dashboards").Where("id = ?", snap.DashboardID).Select("title").Scan(&title)
	return toRes(&snap, title), nil
}

func toRes(m *model.Snapshot, dashboardTitle string) *SnapshotRes {
	r := &SnapshotRes{
		ID:             m.ID,
		OwnerID:        m.OwnerID,
		DashboardID:    m.DashboardID,
		DashboardTitle: dashboardTitle,
		PanelID:        m.PanelID,
		Key:            m.Key,
		Name:           m.Name,
		DashboardJSON:  m.DashboardJSON,
		PanelsData:     m.PanelsData,
		AIInsights:     m.AIInsights,
		CreatedAt:      m.CreatedAt.Format("2006-01-02T15:04:05+08:00"),
	}
	return r
}