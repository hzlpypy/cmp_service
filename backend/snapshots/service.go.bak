package snapshots

import (
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
	db  *gorm.DB
	log *logrus.Logger
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
func NewServer(db *gorm.DB, log *logrus.Logger) Interface {
	return &Server{db: db, log: log}
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
	ID            string                   `json:"id"`
	DashboardID   string                   `json:"dashboard_id"`
	PanelID       string                   `json:"panel_id"`
	Key           string                   `json:"snapshot_key"`
	Name          string                   `json:"name"`
	DashboardJSON map[string]interface{}   `json:"dashboard_json"`
	PanelsData    []map[string]interface{} `json:"panels_data,omitempty"`
	AIInsights    map[string]interface{}   `json:"ai_insights,omitempty"` // AI 洞察内容
	CreatedAt     string                   `json:"created_at"`
	ExpiresAt     string                   `json:"expires_at,omitempty"`
}

func generateKey() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// Create creates a new snapshot.
func (s *Server) Create(ctx *gin.Context, req *CreateReq) (*SnapshotRes, error) {
	key := generateKey()
	snap := model.Snapshot{
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
	return toRes(&snap), nil
}

// Get retrieves a snapshot by public key.
func (s *Server) Get(ctx *gin.Context, key string) (*SnapshotRes, error) {
	var snap model.Snapshot
	if err := s.db.Where("snapshot_key = ? AND deleted_at IS NULL", key).First(&snap).Error; err != nil {
		return nil, fmt.Errorf("snapshot not found")
	}
	return toRes(&snap), nil
}

// List returns snapshots for a dashboard or panel.
func (s *Server) List(ctx *gin.Context, dashboardID, panelID string) ([]*SnapshotRes, error) {
	var snaps []model.Snapshot
	h := ctx.Request.Header
	for k, vs := range h {
		for _, v := range vs {
			println(fmt.Sprintf("k=%s, v=%s", k, v))
		}
	}
	q := s.db.Where("deleted_at IS NULL")
	if dashboardID != "" {
		q = q.Where("dashboard_id = ?", dashboardID)
	}
	if panelID != "" {
		q = q.Where("panel_id = ?", panelID)
	}
	// 列表查询不加载 dashboard_json 和 panels_data，避免排序内存溢出
	if err := q.Select("id, dashboard_id, panel_id, snapshot_key, name, created_at, updated_at, deleted_at").
		Order("created_at DESC").Find(&snaps).Error; err != nil {
		return nil, fmt.Errorf("list snapshots failed: %v", err)
	}
	res := make([]*SnapshotRes, 0, len(snaps))
	for i := range snaps {
		res = append(res, toRes(&snaps[i]))
	}
	return res, nil
}

// Delete soft-deletes a snapshot.
func (s *Server) Delete(ctx *gin.Context, key string) error {
	if err := s.db.Where("snapshot_key = ?", key).Delete(&model.Snapshot{}).Error; err != nil {
		return fmt.Errorf("delete snapshot failed: %v", err)
	}
	return nil
}

// Update updates a snapshot (mainly for AI insights).
func (s *Server) Update(ctx *gin.Context, req *UpdateReq) (*SnapshotRes, error) {
	var snap model.Snapshot
	if err := s.db.Where("snapshot_key = ? AND deleted_at IS NULL", req.Key).First(&snap).Error; err != nil {
		return nil, fmt.Errorf("snapshot not found")
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
	return toRes(&snap), nil
}

func toRes(m *model.Snapshot) *SnapshotRes {
	r := &SnapshotRes{
		ID:            m.ID,
		DashboardID:   m.DashboardID,
		PanelID:       m.PanelID,
		Key:           m.Key,
		Name:          m.Name,
		DashboardJSON: m.DashboardJSON,
		PanelsData:    m.PanelsData,
		AIInsights:    m.AIInsights,
		CreatedAt:     m.CreatedAt.Format("2006-01-02T15:04:05+08:00"),
	}
	return r
}
