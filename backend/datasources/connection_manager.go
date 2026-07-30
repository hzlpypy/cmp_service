// Package datasources 提供数据源管理的业务逻辑层。
package datasources

import (
	"cmp_service_backend/model"
	"fmt"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

// DSConnectionManager 管理所有 MySQL 数据源的数据库连接。
// 启动时初始化所有启用的数据源连接并缓存，按需提供对应数据源的 *gorm.DB。
// 相同 host+port+databaseName 的数据源共享同一个连接池。
type DSConnectionManager struct {
	conns map[string]*gorm.DB // key: DSN (host:port/database)
	mu    sync.RWMutex
}

// NewDSConnectionManager 创建连接管理器并从数据库加载所有启用数据源并建立连接。
// db 是主应用数据库（用于查询数据源配置）。
// l 是日志记录器。
func NewDSConnectionManager(db *gorm.DB, l *logrus.Logger) *DSConnectionManager {
	mgr := &DSConnectionManager{
		conns: make(map[string]*gorm.DB),
	}
	mgr.initialize(db, l)
	return mgr
}

// initialize 加载所有已启用的 MySQL 数据源并建立连接池。
func (m *DSConnectionManager) initialize(db *gorm.DB, l *logrus.Logger) {
	var dss []model.Datasource
	if err := db.Where("type = ? AND enabled = 1 AND deleted_at IS NULL", "mysql").Find(&dss).Error; err != nil {
		l.Errorf("[DSConnectionManager] 加载数据源失败: %v", err)
		return
	}

	for _, ds := range dss {
		key := m.dsKey(&ds)
		if _, ok := m.conns[key]; ok {
			continue // 相同连接已存在
		}

		conn, err := m.createMySQLConn(&ds)
		if err != nil {
			l.Errorf("[DSConnectionManager] 数据源 %s 连接失败: %v", ds.Name, err)
			continue
		}
		m.conns[key] = conn
		l.Infof("[DSConnectionManager] 数据源 %s 连接成功 (host=%s, db=%s)", ds.Name, ds.URL, ds.DatabaseName)
	}
	l.Infof("[DSConnectionManager] 初始化完成，共 %d 个 MySQL 连接池", len(m.conns))
}

// GetDB 根据数据源获取对应的 *gorm.DB 连接。
// 优先从缓存取，缓存未命中则新建连接。
func (m *DSConnectionManager) GetDB(ds *model.Datasource) (*gorm.DB, error) {
	if ds.Type != "mysql" {
		return nil, fmt.Errorf("不支持的数据源类型: %s", ds.Type)
	}

	key := m.dsKey(ds)

	// 先尝试从缓存读取
	m.mu.RLock()
	conn, ok := m.conns[key]
	m.mu.RUnlock()
	if ok {
		return conn, nil
	}

	// 缓存未命中，创建新连接
	m.mu.Lock()
	defer m.mu.Unlock()

	// 双重检查
	if conn, ok = m.conns[key]; ok {
		return conn, nil
	}

	conn, err := m.createMySQLConn(ds)
	if err != nil {
		return nil, err
	}
	m.conns[key] = conn
	return conn, nil
}

// dsKey 生成数据源的唯一缓存键（基于 host:port 和 databaseName）。
func (m *DSConnectionManager) dsKey(ds *model.Datasource) string {
	return fmt.Sprintf("mysql://%s/%s", ds.URL, ds.DatabaseName)
}

// createMySQLConn 创建并配置一个新的 MySQL *gorm.DB 连接。
func (m *DSConnectionManager) createMySQLConn(ds *model.Datasource) (*gorm.DB, error) {
	if ds.URL == "" {
		return nil, fmt.Errorf("数据源 URL 不能为空")
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		ds.Username, ds.Password, ds.URL, ds.DatabaseName)

	gormDB, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("打开数据库连接失败: %w", err)
	}

	sqlDB, err := gormDB.DB()
	if err != nil {
		return nil, fmt.Errorf("获取 sql.DB 失败: %w", err)
	}

	// 配置连接池
	sqlDB.SetConnMaxLifetime(60 * time.Second)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetMaxOpenConns(20)

	// 验证连接
	if err = sqlDB.Ping(); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("数据库 ping 失败: %w", err)
	}

	return gormDB, nil
}

// Refresh 重新加载所有数据源连接（创建新连接或数据源变更后调用）。
func (m *DSConnectionManager) Refresh(db *gorm.DB, l *logrus.Logger) {
	m.mu.Lock()
	// 关闭旧连接
	for key, conn := range m.conns {
		if sqlDB, err := conn.DB(); err == nil {
			sqlDB.Close()
		}
		delete(m.conns, key)
	}
	m.mu.Unlock()

	m.initialize(db, l)
}

// Close 关闭所有缓存的连接。
func (m *DSConnectionManager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for key, conn := range m.conns {
		if sqlDB, err := conn.DB(); err == nil {
			sqlDB.Close()
		}
		delete(m.conns, key)
	}
}
