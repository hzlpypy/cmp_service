// Package identity 提供当前请求用户的身份上下文解析与实例级权限判断。
//
// 背景：本平台是大系统的一个子平台，用户/部门/团队数据存放在外部用户权限库，
// 本平台不建表、不同步，仅通过身份头（或外部权限服务 API）获取用户身份。
// 当前阶段使用 MockProvider 模拟外部权限服务，后续可平滑替换为 HeaderProvider / ExternalAPIProvider。
package identity

import (
	"cmp_service_backend/model"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

// 角色常量
const (
	RoleAdmin      = "admin"       // 平台管理员：全部可见可管
	RoleManager    = "manager"     // 部长：本部门下所有团队
	RoleTeamLeader = "team_leader" // 团队长：本团队所有成员
	RoleMember     = "member"      // 普通成员：自己 + 分享
)

// DefaultUserID 默认身份（开发模式；生产环境由网关注入 X-User-Id）
const DefaultUserID = "u-1001"

const ctxKey = "user_context"

// UserContext 当前请求用户的身份上下文。
type UserContext struct {
	UserID      string   `json:"user_id"`
	DisplayName string   `json:"display_name"`
	Role        string   `json:"role"`
	DeptID      string   `json:"dept_id"`
	TeamIDs     []string `json:"team_ids"`
	// GroupIDs 用户所在的平台内部用户组ID（区别于外部团队，见 UserGroup 模型）
	GroupIDs []string `json:"group_ids,omitempty"`
}

// ============================================================
// Mock 外部权限服务数据（模拟外部用户权限库，开发阶段用）
// ============================================================

type mockUser struct {
	ID, Name, Role, DeptID, TeamID string
}

type mockTeam struct {
	ID, Name, DeptID string
}

var mockUsers = []mockUser{
	{ID: "u-1001", Name: "黄知林", Role: RoleMember, DeptID: "d-1", TeamID: "t-1"},
	{ID: "u-1002", Name: "张三", Role: RoleTeamLeader, DeptID: "d-1", TeamID: "t-1"},
	{ID: "u-1003", Name: "李四", Role: RoleMember, DeptID: "d-1", TeamID: "t-1"},
	{ID: "u-1004", Name: "王五", Role: RoleMember, DeptID: "d-1", TeamID: "t-2"},
	{ID: "u-1005", Name: "赵六", Role: RoleManager, DeptID: "d-1", TeamID: "t-2"},
	{ID: "u-2001", Name: "孙七", Role: RoleAdmin, DeptID: "", TeamID: ""},
}

var mockTeams = []mockTeam{
	{ID: "t-1", Name: "平台研发一组", DeptID: "d-1"},
	{ID: "t-2", Name: "平台研发二组", DeptID: "d-1"},
}

// ============================================================
// Provider
// ============================================================

// Provider 身份提供者：解析当前用户身份，并提供实例级权限判断。
type Provider struct {
	log *logrus.Logger
	db  *gorm.DB

	mu    sync.Mutex
	cache map[string]*cacheEntry // user_id -> 缓存
}

type cacheEntry struct {
	uc  *UserContext
	exp time.Time
}

// NewProvider 创建身份提供者实例。
func NewProvider(db *gorm.DB, log *logrus.Logger) *Provider {
	return &Provider{db: db, log: log, cache: make(map[string]*cacheEntry)}
}

// Middleware 身份中间件：解析 X-User-Id，将 UserContext 注入 gin context。
func (p *Provider) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetHeader("X-User-Id")
		if userID == "" {
			// 开发兜底：使用默认身份
			userID = DefaultUserID
		}
		uc := p.Resolve(userID)
		c.Set(ctxKey, uc)
		c.Next()
	}
}

// Resolve 解析用户ID为身份上下文（带 5 分钟内存缓存）。
func (p *Provider) Resolve(userID string) *UserContext {
	if userID == "" {
		userID = DefaultUserID
	}
	// 缓存命中
	p.mu.Lock()
	if e, ok := p.cache[userID]; ok && time.Now().Before(e.exp) {
		p.mu.Unlock()
		return e.uc
	}
	p.mu.Unlock()

	// 查询 mock 用户
	var u *mockUser
	for i := range mockUsers {
		if mockUsers[i].ID == userID {
			u = &mockUsers[i]
			break
		}
	}
	if u == nil {
		u = &mockUsers[0] // 未知用户回退默认
	}

	uc := &UserContext{
		UserID:      u.ID,
		DisplayName: u.Name,
		Role:        u.Role,
		DeptID:      u.DeptID,
	}
	if u.TeamID != "" {
		uc.TeamIDs = []string{u.TeamID}
	}
	// 加载用户所在的平台内部用户组（本平台 user_groups 表）
	uc.GroupIDs = p.userGroupIDs(u.ID)

	p.mu.Lock()
	p.cache[userID] = &cacheEntry{uc: uc, exp: time.Now().Add(5 * time.Minute)}
	p.mu.Unlock()
	return uc
}

// userGroupIDs 查询用户所在的平台内部用户组ID集合。
func (p *Provider) userGroupIDs(userID string) []string {
	var ids []string
	p.db.Model(&model.UserGroupMember{}).
		Where("user_id = ? AND deleted_at IS NULL", userID).
		Pluck("group_id", &ids)
	return ids
}

// Invalidate 清除指定用户的缓存（外部组织变更时调用）。
func (p *Provider) Invalidate(userID string) {
	p.mu.Lock()
	delete(p.cache, userID)
	p.mu.Unlock()
}

// FromContext 从 gin context 获取当前用户身份。
func FromContext(c *gin.Context) *UserContext {
	if v, ok := c.Get(ctxKey); ok {
		if uc, ok := v.(*UserContext); ok {
			return uc
		}
	}
	return nil
}

// IsAdmin 判断当前用户是否为管理员。
func (uc *UserContext) IsAdmin() bool {
	return uc != nil && uc.Role == RoleAdmin
}

// VisibleUserIDs 返回该用户可查看其资源的所有用户ID集合。
// 规则：
//   - admin：返回 nil（表示不限制）
//   - manager（部长）：本部门下所有用户
//   - team_leader（团队长）：本团队所有用户
//   - member：仅自己
//
// 组织数据来自 mock（后续替换为外部权限服务 API）。
func (p *Provider) VisibleUserIDs(uc *UserContext) []string {
	if uc == nil {
		return nil
	}
	switch uc.Role {
	case RoleAdmin:
		return nil
	case RoleManager:
		var ids []string
		for _, u := range mockUsers {
			if u.Role != RoleAdmin && u.DeptID == uc.DeptID {
				ids = append(ids, u.ID)
			}
		}
		return ids
	case RoleTeamLeader:
		var ids []string
		if len(uc.TeamIDs) == 0 {
			return []string{uc.UserID}
		}
		for _, u := range mockUsers {
			if u.Role != RoleAdmin && u.TeamID == uc.TeamIDs[0] {
				ids = append(ids, u.ID)
			}
		}
		return ids
	default: // member
		return []string{uc.UserID}
	}
}

// ============================================================
// 实例级权限判断
// ============================================================

// shareCondSQL 构建"分享给本人 / 我团队 / 我所在用户组"的 SQL 条件片段与参数。
// canEdit=true 时附加 can_edit = 1 条件（用于判断可编辑分享）。
func (p *Provider) shareCondSQL(uc *UserContext, canEdit bool) (string, []interface{}) {
	clauses := []string{"share_to_type = 'user' AND share_to_id = ?"}
	args := []interface{}{uc.UserID}
	if len(uc.TeamIDs) > 0 {
		clauses = append(clauses, "share_to_type = 'team' AND share_to_id IN ?")
		args = append(args, uc.TeamIDs)
	}
	if len(uc.GroupIDs) > 0 {
		clauses = append(clauses, "share_to_type = 'group' AND share_to_id IN ?")
		args = append(args, uc.GroupIDs)
	}
	cond := "(" + strings.Join(clauses, " OR ") + ")"
	if canEdit {
		cond = "can_edit = 1 AND " + cond
	}
	return cond, args
}

// CanViewResource 判断当前用户是否可查看某资源（仪表板/快照）。
func (p *Provider) CanViewResource(c *gin.Context, resType, resID, ownerID string) bool {
	uc := FromContext(c)
	if uc == nil {
		return false
	}
	if uc.IsAdmin() {
		return true
	}
	// 可见用户集合内（自己的 + 团队/部门成员）
	visible := p.VisibleUserIDs(uc)
	for _, v := range visible {
		if v == ownerID {
			return true
		}
	}
	// 分享给我的 / 分享给我团队的
	return p.isSharedToMe(uc, resType, resID)
}

// CanManageResource 判断当前用户是否有编辑/删除/分享某资源的权限。
// 规则：admin 或 资源拥有者 或 分享给本人/我团队且 can_edit=1。
func (p *Provider) CanManageResource(c *gin.Context, resType, resID, ownerID string) bool {
	uc := FromContext(c)
	if uc == nil {
		return false
	}
	if uc.IsAdmin() {
		return true
	}
	if ownerID == uc.UserID {
		return true
	}
	// 分享给本人/我团队/我所在用户组且可编辑
	cond, args := p.shareCondSQL(uc, true)
	params := append([]interface{}{resType, resID}, args...)
	q := p.db.Model(&model.ResourceShare{}).
		Where("resource_type = ? AND resource_id = ? AND deleted_at IS NULL AND "+cond, params...)
	var cnt int64
	q.Count(&cnt)
	return cnt > 0
}

// CanDeleteResource 判断当前用户是否可删除某资源。
// 删除权限比编辑更严格：仅 admin 或资源拥有者可删除，分享（即使可编辑）不可删除。
func (p *Provider) CanDeleteResource(c *gin.Context, resType, resID, ownerID string) bool {
	uc := FromContext(c)
	if uc == nil {
		return false
	}
	return uc.IsAdmin() || ownerID == uc.UserID
}

// isSharedToMe 判断资源是否分享给当前用户、其团队或其用户组。
func (p *Provider) isSharedToMe(uc *UserContext, resType, resID string) bool {
	cond, args := p.shareCondSQL(uc, false)
	params := append([]interface{}{resType, resID}, args...)
	var cnt int64
	p.db.Model(&model.ResourceShare{}).
		Where("resource_type = ? AND resource_id = ? AND deleted_at IS NULL AND "+cond, params...).
		Count(&cnt)
	return cnt > 0
}

// IsSharedToMe 判断资源是否分享给当前用户或其团队（供列表 source 分组使用）。
func (p *Provider) IsSharedToMe(c *gin.Context, resType, resID string) bool {
	uc := FromContext(c)
	if uc == nil {
		return false
	}
	return p.isSharedToMe(uc, resType, resID)
}

// EditableShareIDs 返回分享给当前用户、其团队或其用户组且可编辑的资源ID集合（批量判断列表 can_edit）。
func (p *Provider) EditableShareIDs(c *gin.Context, resType string) map[string]bool {
	uc := FromContext(c)
	result := map[string]bool{}
	if uc == nil {
		return result
	}
	cond, args := p.shareCondSQL(uc, true)
	var ids []string
	p.db.Model(&model.ResourceShare{}).
		Where("resource_type = ? AND deleted_at IS NULL AND "+cond, append([]interface{}{resType}, args...)...).
		Pluck("resource_id", &ids)
	for _, id := range ids {
		result[id] = true
	}
	return result
}

// SharedResourceIDs 返回分享给当前用户（或其团队/用户组）的所有资源ID集合。
// 用于列表批量判断 source 分组，避免 N+1 查询。
func (p *Provider) SharedResourceIDs(c *gin.Context, resType string) map[string]bool {
	uc := FromContext(c)
	result := map[string]bool{}
	if uc == nil {
		return result
	}
	cond, args := p.shareCondSQL(uc, false)
	var ids []string
	p.db.Model(&model.ResourceShare{}).
		Where("resource_type = ? AND deleted_at IS NULL AND "+cond, append([]interface{}{resType}, args...)...).
		Pluck("resource_id", &ids)
	for _, id := range ids {
		result[id] = true
	}
	return result
}

// VisibleScope 返回可见性过滤的 GORM Scope。
// 用于列表查询：owner_id IN (可见用户集合) OR 分享可见。
// 注意：整个可见性表达式必须用括号包裹，否则与调用方后续的
// Where（如 folder_id = ?）组合时，SQL 的 AND 优先级高于 OR，
// 会导致分享分支脱离 folder_id 约束、出现在所有文件夹下。
// admin 不过滤。
func (p *Provider) VisibleScope(c *gin.Context, resType string) func(db *gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		uc := FromContext(c)
		if uc == nil || uc.IsAdmin() {
			return db
		}
		visible := p.VisibleUserIDs(uc)
		// 分享条件统一支持 user/team/group
		cond, args := p.shareCondSQL(uc, false)
		whereSQL := "(owner_id IN ? OR id IN (SELECT resource_id FROM resource_shares WHERE resource_type = ? AND deleted_at IS NULL AND " + cond + "))"
		params := []interface{}{visible, resType}
		params = append(params, args...)
		return db.Where(whereSQL, params...)
	}
}

// ============================================================
// 用户/团队查询（分享弹窗用；转发外部权限服务，当前为 mock）
// ============================================================

// SearchUsers 按关键字搜索用户。
func (p *Provider) SearchUsers(keyword string) []UserContext {
	result := make([]UserContext, 0, len(mockUsers))
	kw := strings.ToLower(strings.TrimSpace(keyword))
	for _, u := range mockUsers {
		if kw == "" || strings.Contains(strings.ToLower(u.Name), kw) || strings.Contains(strings.ToLower(u.ID), kw) {
			result = append(result, UserContext{
				UserID:      u.ID,
				DisplayName: u.Name,
				Role:        u.Role,
				DeptID:      u.DeptID,
			})
		}
	}
	return result
}

// TeamInfo 团队信息（分享弹窗用）。
type TeamInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// ListTeams 返回团队列表。
func (p *Provider) ListTeams() []TeamInfo {
	result := make([]TeamInfo, 0, len(mockTeams))
	for _, t := range mockTeams {
		result = append(result, TeamInfo{ID: t.ID, Name: t.Name})
	}
	return result
}

// LookupUser 按用户ID查询用户信息（用于解析资源创建者归属）。
// 转发外部权限服务，当前为 mock；未找到返回 nil。
func (p *Provider) LookupUser(userID string) *UserContext {
	if userID == "" {
		return nil
	}
	for _, u := range mockUsers {
		if u.ID == userID {
			return &UserContext{
				UserID:      u.ID,
				DisplayName: u.Name,
				Role:        u.Role,
				DeptID:      u.DeptID,
				TeamIDs:     []string{u.TeamID},
			}
		}
	}
	return nil
}

// LookupTeam 按团队ID查询团队名称。
// 转发外部权限服务，当前为 mock；未找到返回 false。
func (p *Provider) LookupTeam(teamID string) (string, bool) {
	if teamID == "" {
		return "", false
	}
	for _, t := range mockTeams {
		if t.ID == teamID {
			return t.Name, true
		}
	}
	return "", false
}

// ============================================================
// 身份相关路由
// ============================================================

// RegisterIdentityRouter 注册身份相关路由。
//   - POST /api/v1/users/search  用户搜索（分享弹窗）
//   - POST /api/v1/teams/list    团队列表（分享弹窗）
func RegisterIdentityRouter(e *gin.Engine, p *Provider) {
	api := e.Group("/api/v1")
	{
		api.POST("/users/search", func(c *gin.Context) {
			var req struct {
				Q string `json:"q"`
			}
			c.ShouldBindJSON(&req)
			c.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": gin.H{
				"list": p.SearchUsers(req.Q),
			}})
		})
		api.POST("/teams/list", func(c *gin.Context) {
			c.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": gin.H{
				"list": p.ListTeams(),
			}})
		})
	}
}

// DebugString 返回当前 mock 身份信息的调试字符串。
func (p *Provider) DebugString(userID string) string {
	uc := p.Resolve(userID)
	return fmt.Sprintf("user=%s(%s) role=%s dept=%s teams=%v",
		uc.UserID, uc.DisplayName, uc.Role, uc.DeptID, uc.TeamIDs)
}

// ============================================================
// 用户组管理（平台内部维护的分享目标实体）
// ============================================================

// GroupInfo 用户组信息（列表/分享弹窗用）。
type GroupInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	OwnerID     string `json:"owner_id,omitempty"`
	OwnerName   string `json:"owner_name,omitempty"`
	MemberCount int    `json:"member_count"`
}

// canManageGroup 判断当前用户是否可管理指定用户组（创建者或 admin）。
func (p *Provider) canManageGroup(c *gin.Context, groupID string) bool {
	uc := FromContext(c)
	if uc == nil {
		return false
	}
	if uc.IsAdmin() {
		return true
	}
	var g model.UserGroup
	if err := p.db.Where("id = ? AND deleted_at IS NULL", groupID).First(&g).Error; err != nil {
		return false
	}
	return g.OwnerID == uc.UserID
}

// ListGroups 返回当前用户可管理的用户组列表（创建者可见自己的组，admin 全部）。
func (p *Provider) ListGroups(c *gin.Context) []GroupInfo {
	uc := FromContext(c)
	if uc == nil {
		return nil
	}
	q := p.db.Model(&model.UserGroup{}).Where("deleted_at IS NULL")
	if !uc.IsAdmin() {
		q = q.Where("owner_id = ?", uc.UserID)
	}
	var groups []model.UserGroup
	q.Order("created_at DESC").Find(&groups)
	result := make([]GroupInfo, 0, len(groups))
	for _, g := range groups {
		var cnt int64
		p.db.Model(&model.UserGroupMember{}).
			Where("group_id = ? AND deleted_at IS NULL", g.ID).Count(&cnt)
		info := GroupInfo{ID: g.ID, Name: g.Name, OwnerID: g.OwnerID, MemberCount: int(cnt)}
		if owner := p.Resolve(g.OwnerID); owner != nil {
			info.OwnerName = owner.DisplayName
		}
		result = append(result, info)
	}
	return result
}

// CreateGroup 创建用户组（创建者自动成为成员）。
func (p *Provider) CreateGroup(c *gin.Context, name string) (*GroupInfo, error) {
	uc := FromContext(c)
	if uc == nil {
		return nil, errors.New("未登录")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("用户组名称不能为空")
	}
	g := model.UserGroup{
		Base:    model.Base{ID: fmt.Sprintf("g-%d", time.Now().UnixMilli())},
		OwnerID: uc.UserID,
		Name:    name,
	}
	if err := p.db.Create(&g).Error; err != nil {
		return nil, err
	}
	// 创建者默认加入组
	m := model.UserGroupMember{GroupID: g.ID, UserID: uc.UserID}
	p.db.Create(&m)
	return &GroupInfo{ID: g.ID, Name: g.Name, OwnerID: g.OwnerID, MemberCount: 1}, nil
}

// UpdateGroup 重命名用户组。
func (p *Provider) UpdateGroup(c *gin.Context, groupID, name string) error {
	if !p.canManageGroup(c, groupID) {
		return errors.New("无权限管理该用户组")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("用户组名称不能为空")
	}
	return p.db.Model(&model.UserGroup{}).
		Where("id = ?", groupID).
		Update("name", name).Error
}

// DeleteGroup 删除用户组（级联软删成员与相关分享记录）。
func (p *Provider) DeleteGroup(c *gin.Context, groupID string) error {
	if !p.canManageGroup(c, groupID) {
		return errors.New("无权限管理该用户组")
	}
	return p.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id = ?", groupID).Delete(&model.UserGroup{}).Error; err != nil {
			return err
		}
		if err := tx.Where("group_id = ?", groupID).Delete(&model.UserGroupMember{}).Error; err != nil {
			return err
		}
		return tx.Where("share_to_type = 'group' AND share_to_id = ?", groupID).
			Delete(&model.ResourceShare{}).Error
	})
}

// GroupMemberInfo 组成员信息。
type GroupMemberInfo struct {
	UserID      string `json:"user_id"`
	DisplayName string `json:"display_name"`
}

// ListGroupMembers 返回用户组成员列表。
func (p *Provider) ListGroupMembers(c *gin.Context, groupID string) ([]GroupMemberInfo, error) {
	if !p.canManageGroup(c, groupID) {
		return nil, errors.New("无权限查看该用户组成员")
	}
	var members []model.UserGroupMember
	if err := p.db.Where("group_id = ? AND deleted_at IS NULL", groupID).
		Order("created_at ASC").Find(&members).Error; err != nil {
		return nil, err
	}
	result := make([]GroupMemberInfo, 0, len(members))
	for _, m := range members {
		info := GroupMemberInfo{UserID: m.UserID}
		if uc := p.Resolve(m.UserID); uc != nil {
			info.DisplayName = uc.DisplayName
		}
		result = append(result, info)
	}
	return result, nil
}

// AddGroupMember 批量添加成员（自动去重）。
func (p *Provider) AddGroupMember(c *gin.Context, groupID string, userIDs []string) error {
	if !p.canManageGroup(c, groupID) {
		return errors.New("无权限管理该用户组")
	}
	for _, uid := range userIDs {
		uid = strings.TrimSpace(uid)
		if uid == "" {
			continue
		}
		var cnt int64
		p.db.Model(&model.UserGroupMember{}).
			Where("group_id = ? AND user_id = ? AND deleted_at IS NULL", groupID, uid).Count(&cnt)
		if cnt > 0 {
			continue
		}
		m := model.UserGroupMember{GroupID: groupID, UserID: uid}
		if err := p.db.Create(&m).Error; err != nil {
			return err
		}
		// 成员身份变化后清除其身份缓存
		p.Invalidate(uid)
	}
	return nil
}

// RemoveGroupMember 移除成员。
func (p *Provider) RemoveGroupMember(c *gin.Context, groupID, userID string) error {
	if !p.canManageGroup(c, groupID) {
		return errors.New("无权限管理该用户组")
	}
	if err := p.db.Where("group_id = ? AND user_id = ?", groupID, userID).
		Delete(&model.UserGroupMember{}).Error; err != nil {
		return err
	}
	p.Invalidate(userID)
	return nil
}

// RegisterGroupRouter 注册用户组管理路由。
//   - POST /api/v1/groups/list          用户组列表
//   - POST /api/v1/groups/create        创建用户组
//   - POST /api/v1/groups/update        重命名用户组
//   - POST /api/v1/groups/delete        删除用户组
//   - POST /api/v1/groups/members       组成员列表
//   - POST /api/v1/groups/members/add   添加成员
//   - POST /api/v1/groups/members/remove 移除成员
func RegisterGroupRouter(e *gin.Engine, p *Provider) {
	api := e.Group("/api/v1")
	{
		api.POST("/groups/list", func(c *gin.Context) {
			c.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": gin.H{
				"list": p.ListGroups(c),
			}})
		})
		api.POST("/groups/create", func(c *gin.Context) {
			var req struct {
				Name string `json:"name"`
			}
			c.ShouldBindJSON(&req)
			info, err := p.CreateGroup(c, req.Name)
			if err != nil {
				c.JSON(200, gin.H{"errorCode": "40001", "errorMessage": err.Error(), "success": false})
				return
			}
			c.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": info})
		})
		api.POST("/groups/update", func(c *gin.Context) {
			var req struct {
				ID   string `json:"id"`
				Name string `json:"name"`
			}
			c.ShouldBindJSON(&req)
			if err := p.UpdateGroup(c, req.ID, req.Name); err != nil {
				c.JSON(200, gin.H{"errorCode": "40001", "errorMessage": err.Error(), "success": false})
				return
			}
			c.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true})
		})
		api.POST("/groups/delete", func(c *gin.Context) {
			var req struct {
				ID string `json:"id"`
			}
			c.ShouldBindJSON(&req)
			if err := p.DeleteGroup(c, req.ID); err != nil {
				c.JSON(200, gin.H{"errorCode": "40001", "errorMessage": err.Error(), "success": false})
				return
			}
			c.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true})
		})
		api.POST("/groups/members", func(c *gin.Context) {
			var req struct {
				GroupID string `json:"group_id"`
			}
			c.ShouldBindJSON(&req)
			list, err := p.ListGroupMembers(c, req.GroupID)
			if err != nil {
				c.JSON(200, gin.H{"errorCode": "40001", "errorMessage": err.Error(), "success": false})
				return
			}
			c.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true, "data": gin.H{
				"list": list,
			}})
		})
		api.POST("/groups/members/add", func(c *gin.Context) {
			var req struct {
				GroupID string   `json:"group_id"`
				UserIDs []string `json:"user_ids"`
			}
			c.ShouldBindJSON(&req)
			if err := p.AddGroupMember(c, req.GroupID, req.UserIDs); err != nil {
				c.JSON(200, gin.H{"errorCode": "40001", "errorMessage": err.Error(), "success": false})
				return
			}
			c.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true})
		})
		api.POST("/groups/members/remove", func(c *gin.Context) {
			var req struct {
				GroupID string `json:"group_id"`
				UserID  string `json:"user_id"`
			}
			c.ShouldBindJSON(&req)
			if err := p.RemoveGroupMember(c, req.GroupID, req.UserID); err != nil {
				c.JSON(200, gin.H{"errorCode": "40001", "errorMessage": err.Error(), "success": false})
				return
			}
			c.JSON(200, gin.H{"errorCode": "00000", "errorMessage": "", "success": true})
		})
	}
}
