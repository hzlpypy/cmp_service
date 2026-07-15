package snapshotschedules

import (
	"cmp_service_backend/dashboards"
	"cmp_service_backend/model"
	"cmp_service_backend/snapshots"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

// Interface defines snapshot schedule operations.
type Interface interface {
	Create(ctx *gin.Context, req *CreateReq) (*SnapshotScheduleRes, error)
	List(ctx *gin.Context, dashboardID string) ([]*SnapshotScheduleRes, error)
	Update(ctx *gin.Context, req *UpdateReq) (*SnapshotScheduleRes, error)
	Delete(ctx *gin.Context, id string) error
	Toggle(ctx *gin.Context, id string, enabled bool) (*SnapshotScheduleRes, error)
	StartScheduler()
}

// Server holds the snapshot schedule service.
type Server struct {
	db          *gorm.DB
	log         *logrus.Logger
	dashboardSvc dashboards.Interface
	snapshotSvc  snapshots.Interface
	stopCh      chan struct{}
}

// NewServer creates a snapshot schedule service.
func NewServer(db *gorm.DB, log *logrus.Logger, dashboardSvc dashboards.Interface, snapshotSvc snapshots.Interface) Interface {
	return &Server{
		db:          db,
		log:         log,
		dashboardSvc: dashboardSvc,
		snapshotSvc:  snapshotSvc,
		stopCh:      make(chan struct{}),
	}
}

// CreateReq snapshot schedule create request.
type CreateReq struct {
	DashboardID string `json:"dashboard_id" binding:"required"`
	Name        string `json:"name"`
	CronExpr    string `json:"cron_expr" binding:"required"`
}

// UpdateReq snapshot schedule update request.
type UpdateReq struct {
	ID       string `json:"id" binding:"required"`
	Name     string `json:"name"`
	CronExpr string `json:"cron_expr"`
}

// SnapshotScheduleRes snapshot schedule response.
type SnapshotScheduleRes struct {
	ID          string     `json:"id"`
	DashboardID string     `json:"dashboard_id"`
	Name        string     `json:"name"`
	CronExpr    string     `json:"cron_expr"`
	Enabled     bool       `json:"enabled"`
	LastRunAt   string     `json:"last_run_at,omitempty"`
	NextRunAt   string     `json:"next_run_at,omitempty"`
	CreatedAt   string     `json:"created_at"`
}

func toRes(m *model.SnapshotSchedule) *SnapshotScheduleRes {
	r := &SnapshotScheduleRes{
		ID:          m.ID,
		DashboardID: m.DashboardID,
		Name:        m.Name,
		CronExpr:    m.CronExpr,
		Enabled:     m.Enabled,
		CreatedAt:   m.CreatedAt.Format("2006-01-02T15:04:05+08:00"),
	}
	if m.LastRunAt != nil {
		r.LastRunAt = m.LastRunAt.Format("2006-01-02T15:04:05+08:00")
	}
	if m.NextRunAt != nil {
		r.NextRunAt = m.NextRunAt.Format("2006-01-02T15:04:05+08:00")
	}
	return r
}

// Create creates a new snapshot schedule.
func (s *Server) Create(ctx *gin.Context, req *CreateReq) (*SnapshotScheduleRes, error) {
	// 验证 cron 表达式
	if _, err := parseCronExpr(req.CronExpr); err != nil {
		return nil, fmt.Errorf("无效的 cron 表达式: %v", err)
	}

	schedule := model.SnapshotSchedule{
		DashboardID: req.DashboardID,
		Name:        req.Name,
		CronExpr:    req.CronExpr,
		Enabled:     true,
	}
	schedule.ID = fmt.Sprintf("sched-%d", time.Now().UnixMilli())

	// 计算下次执行时间
	nextRun := nextExecutionTime(req.CronExpr, time.Now())
	schedule.NextRunAt = &nextRun

	if err := s.db.Create(&schedule).Error; err != nil {
		return nil, fmt.Errorf("create snapshot schedule failed: %v", err)
	}
	return toRes(&schedule), nil
}

// List returns snapshot schedules for a dashboard.
func (s *Server) List(ctx *gin.Context, dashboardID string) ([]*SnapshotScheduleRes, error) {
	var schedules []model.SnapshotSchedule
	q := s.db.Where("deleted_at IS NULL")
	if dashboardID != "" {
		q = q.Where("dashboard_id = ?", dashboardID)
	}
	if err := q.Order("created_at DESC").Find(&schedules).Error; err != nil {
		return nil, fmt.Errorf("list snapshot schedules failed: %v", err)
	}

	res := make([]*SnapshotScheduleRes, 0, len(schedules))
	for i := range schedules {
		res = append(res, toRes(&schedules[i]))
	}
	return res, nil
}

// Update updates a snapshot schedule.
func (s *Server) Update(ctx *gin.Context, req *UpdateReq) (*SnapshotScheduleRes, error) {
	var schedule model.SnapshotSchedule
	if err := s.db.Where("id = ? AND deleted_at IS NULL", req.ID).First(&schedule).Error; err != nil {
		return nil, fmt.Errorf("schedule not found")
	}

	if req.Name != "" {
		schedule.Name = req.Name
	}
	if req.CronExpr != "" {
		if _, err := parseCronExpr(req.CronExpr); err != nil {
			return nil, fmt.Errorf("无效的 cron 表达式: %v", err)
		}
		schedule.CronExpr = req.CronExpr
		nextRun := nextExecutionTime(req.CronExpr, time.Now())
		schedule.NextRunAt = &nextRun
	}

	if err := s.db.Save(&schedule).Error; err != nil {
		return nil, fmt.Errorf("update snapshot schedule failed: %v", err)
	}
	return toRes(&schedule), nil
}

// Delete soft-deletes a snapshot schedule.
func (s *Server) Delete(ctx *gin.Context, id string) error {
	if err := s.db.Where("id = ?", id).Delete(&model.SnapshotSchedule{}).Error; err != nil {
		return fmt.Errorf("delete snapshot schedule failed: %v", err)
	}
	return nil
}

// Toggle enables or disables a snapshot schedule.
func (s *Server) Toggle(ctx *gin.Context, id string, enabled bool) (*SnapshotScheduleRes, error) {
	var schedule model.SnapshotSchedule
	if err := s.db.Where("id = ? AND deleted_at IS NULL", id).First(&schedule).Error; err != nil {
		return nil, fmt.Errorf("schedule not found")
	}
	schedule.Enabled = enabled
	if enabled {
		nextRun := nextExecutionTime(schedule.CronExpr, time.Now())
		schedule.NextRunAt = &nextRun
	}
	if err := s.db.Save(&schedule).Error; err != nil {
		return nil, fmt.Errorf("toggle snapshot schedule failed: %v", err)
	}
	return toRes(&schedule), nil
}

// StartScheduler starts the background scheduler that checks and executes schedules.
func (s *Server) StartScheduler() {
	s.log.Info("Snapshot schedule scheduler started")
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				s.checkAndExecute()
			case <-s.stopCh:
				s.log.Info("Snapshot schedule scheduler stopped")
				return
			}
		}
	}()
}

func (s *Server) checkAndExecute() {
	now := time.Now()
	var schedules []model.SnapshotSchedule
	if err := s.db.Where("enabled = ? AND deleted_at IS NULL AND next_run_at IS NOT NULL AND next_run_at <= ?", true, now).Find(&schedules).Error; err != nil {
		s.log.Errorf("Failed to query schedules: %v", err)
		return
	}

	for _, sched := range schedules {
		s.log.Infof("Executing scheduled snapshot for dashboard %s (schedule %s)", sched.DashboardID, sched.ID)
		if err := s.executeSchedule(&sched); err != nil {
			s.log.Errorf("Failed to execute schedule %s: %v", sched.ID, err)
			continue
		}
		// 更新上次执行时间和下次执行时间
		lastRun := now
		nextRun := nextExecutionTime(sched.CronExpr, now)
		s.db.Model(&sched).Updates(map[string]interface{}{
			"last_run_at": lastRun,
			"next_run_at": nextRun,
		})
	}
}

func (s *Server) executeSchedule(sched *model.SnapshotSchedule) error {
	// 查询仪表板信息
	var dashboard model.Dashboard
	if err := s.db.Where("id = ? AND deleted_at IS NULL", sched.DashboardID).First(&dashboard).Error; err != nil {
		return fmt.Errorf("dashboard not found: %v", err)
	}

	// 查询仪表板数据
	ctx := &gin.Context{}
	now := time.Now()
	from := now.Add(-1 * time.Hour).Format(time.RFC3339)
	to := now.Format(time.RFC3339)

	dataRes, err := s.dashboardSvc.GetDashboardData(ctx, &dashboards.DashboardDataReq{
		ID:   sched.DashboardID,
		From: from,
		To:   to,
	})
	if err != nil {
		return fmt.Errorf("get dashboard data failed: %v", err)
	}

	// 构建 panels_data
	panelsData := make([]map[string]interface{}, 0, len(dataRes.PanelsData))
	for _, pd := range dataRes.PanelsData {
		panelsData = append(panelsData, map[string]interface{}{
			"panel_id":    pd.PanelID,
			"panel_title": pd.PanelTitle,
			"panel_type":  pd.PanelType,
			"target":      pd.Target,
			"columns":     pd.Columns,
		})
	}

	// 生成快照名称
	name := sched.Name
	if name == "" {
		name = fmt.Sprintf("%s 定时快照 %s", dashboard.Title, now.Format("2006-01-02 15:04"))
	}

	// 创建快照
	dashJSON, _ := dataRes.DashboardJSON.(map[string]interface{})
	snapReq := &snapshots.CreateReq{
		DashboardID:   sched.DashboardID,
		Name:          name,
		DashboardJSON: dashJSON,
		PanelsData:    panelsData,
	}
	if _, err := s.snapshotSvc.Create(ctx, snapReq); err != nil {
		return fmt.Errorf("create snapshot failed: %v", err)
	}

	s.log.Infof("Scheduled snapshot created for dashboard %s", sched.DashboardID)
	return nil
}

// ============================================================
// Cron 表达式解析（简化版：支持 "分 时 日 月 周" 5 段格式）
// ============================================================

type cronFields struct {
	minutes []int
	hours   []int
	days    []int
	months  []int
	weekdays []int
}

func parseCronExpr(expr string) (*cronFields, error) {
	parts := strings.Fields(expr)
	if len(parts) != 5 {
		return nil, fmt.Errorf("cron 表达式需要 5 个字段（分 时 日 月 周），当前: %s", expr)
	}

	minutes, err := parseCronField(parts[0], 0, 59)
	if err != nil {
		return nil, fmt.Errorf("分钟字段错误: %v", err)
	}
	hours, err := parseCronField(parts[1], 0, 23)
	if err != nil {
		return nil, fmt.Errorf("小时字段错误: %v", err)
	}
	days, err := parseCronField(parts[2], 1, 31)
	if err != nil {
		return nil, fmt.Errorf("日字段错误: %v", err)
	}
	months, err := parseCronField(parts[3], 1, 12)
	if err != nil {
		return nil, fmt.Errorf("月字段错误: %v", err)
	}
	weekdays, err := parseCronField(parts[4], 0, 6)
	if err != nil {
		return nil, fmt.Errorf("周字段错误: %v", err)
	}

	return &cronFields{
		minutes:  minutes,
		hours:    hours,
		days:     days,
		months:   months,
		weekdays: weekdays,
	}, nil
}

func parseCronField(field string, min, max int) ([]int, error) {
	if field == "*" {
		return nil, nil // nil 表示通配
	}

	// 支持逗号分隔的多个值
	parts := strings.Split(field, ",")
	var result []int
	for _, part := range parts {
		// 支持 */n 步长
		if strings.HasPrefix(part, "*/") {
			step, err := strconv.Atoi(part[2:])
			if err != nil || step <= 0 {
				return nil, fmt.Errorf("无效步长: %s", part)
			}
			for i := min; i <= max; i += step {
				result = append(result, i)
			}
			continue
		}
		// 支持范围 a-b
		if strings.Contains(part, "-") {
			rangeParts := strings.SplitN(part, "-", 2)
			start, err := strconv.Atoi(rangeParts[0])
			if err != nil {
				return nil, fmt.Errorf("无效范围: %s", part)
			}
			end, err := strconv.Atoi(rangeParts[1])
			if err != nil {
				return nil, fmt.Errorf("无效范围: %s", part)
			}
			for i := start; i <= end; i++ {
				result = append(result, i)
			}
			continue
		}
		// 单个值
		val, err := strconv.Atoi(part)
		if err != nil {
			return nil, fmt.Errorf("无效值: %s", part)
		}
		if val < min || val > max {
			return nil, fmt.Errorf("值 %d 超出范围 [%d, %d]", val, min, max)
		}
		result = append(result, val)
	}
	return result, nil
}

func matchesField(field []int, value int) bool {
	if field == nil {
		return true // 通配
	}
	for _, v := range field {
		if v == value {
			return true
		}
	}
	return false
}

// nextExecutionTime 计算下次执行时间。
func nextExecutionTime(expr string, from time.Time) time.Time {
	fields, err := parseCronExpr(expr)
	if err != nil {
		return from.Add(24 * time.Hour) // fallback
	}

	// 从下一分钟开始检查
	t := from.Truncate(time.Minute).Add(time.Minute)
	// 最多检查 366 天
	maxTime := from.Add(366 * 24 * time.Hour)

	for t.Before(maxTime) {
		if matchesField(fields.months, int(t.Month())) &&
			matchesField(fields.days, t.Day()) &&
			matchesField(fields.weekdays, int(t.Weekday())) &&
			matchesField(fields.hours, t.Hour()) &&
			matchesField(fields.minutes, t.Minute()) {
			return t
		}
		t = t.Add(time.Minute)
	}
	return from.Add(24 * time.Hour) // fallback
}
