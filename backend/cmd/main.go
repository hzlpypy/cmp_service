// Package main 是 cmp_service 后端服务的入口文件。
// 负责初始化配置、数据库连接、注册各模块路由并启动 HTTP 服务。
//
// 服务架构：
//   - Web 框架：Gin
//   - ORM：GORM（MySQL 驱动）
//   - 日志：Logrus
//   - 配置：YAML 文件
//
// 模块划分：
//   - network_metrics：网络指标查询（存量接口）
//   - business_systems：业务系统查询（存量接口）
//   - folders：文件夹管理（新增）
//   - datasources：数据源管理（新增）
//   - dashboards：仪表板管理（新增）
//   - panels：面板管理（新增）
package main

import (
	"cmp_service_backend/business_systems"
	"cmp_service_backend/cmd/config"
	"cmp_service_backend/dashboards"
	"cmp_service_backend/datasources"
	"cmp_service_backend/folders"
	"cmp_service_backend/network_metrics"
	"cmp_service_backend/panels"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func main() {
	// 初始化 Gin 引擎（默认已包含 Logger 和 Recovery 中间件）
	e := gin.Default()

	// 初始化日志记录器
	l := logrus.New()
	l.SetLevel(logrus.InfoLevel)

	// 加载配置文件
	cfg := config.NewConfig()

	// 构建 MySQL DSN（数据源名称）
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=%s&parseTime=True&loc=Local",
		cfg.Mysql.User,
		cfg.Mysql.Password,
		cfg.Mysql.Host,
		cfg.Mysql.Port,
		cfg.Mysql.DBName,
		cfg.Mysql.Charset,
	)

	// 建立数据库连接
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		l.Fatalf("Failed to connect to database: %v", err)
	}

	// 获取底层 sql.DB 实例，用于配置连接池
	sqlDB, err := db.DB()
	if err != nil {
		l.Fatalf("Failed to get sql.DB: %v", err)
	}
	defer sqlDB.Close()

	// 配置数据库连接池参数
	sqlDB.SetConnMaxLifetime(time.Duration(cfg.Mysql.ConnMaxLifetime) * time.Second)
	sqlDB.SetMaxIdleConns(cfg.Mysql.MaxIdleConns)
	sqlDB.SetMaxOpenConns(cfg.Mysql.MaxOpenConns)

	// 测试数据库连通性
	if err = sqlDB.Ping(); err != nil {
		l.Fatalf("Failed to ping database: %v", err)
	}
	l.Info("Database connection established")

	// ============================================================
	// 存量接口注册（原有 cmp_service 功能）
	// ============================================================

	// 网络指标接口：POST /api/v1/ops_dbapi/api/network_metrics
	nmSvc := network_metrics.NewServer(db, l)
	nmCtrl := network_metrics.NewController(nmSvc)
	network_metrics.RegisterNetworkMetricsRouter(e, nmCtrl)

	// 业务系统接口：POST /api/v1/ops_dbapi/api/business_systems
	bsSvc := business_systems.NewServer(db, l)
	bsCtrl := business_systems.NewController(bsSvc)
	business_systems.RegisterBusinessSystemsRouter(e, bsCtrl)

	// ============================================================
	// 报表平台新接口注册（Grafana 风格仪表板系统）
	// ============================================================

	// 文件夹管理：/api/v1/folders/*
	folderSvc := folders.NewServer(db, l)
	folderCtrl := folders.NewController(folderSvc)
	folders.RegisterFoldersRouter(e, folderCtrl)

	// 数据源管理：/api/v1/datasources/*
	dsSvc := datasources.NewServer(db, l)
	dsCtrl := datasources.NewController(dsSvc)
	datasources.RegisterDatasourcesRouter(e, dsCtrl)

	// 仪表板管理：/api/v1/dashboards/*
	dbSvc := dashboards.NewServer(db, l)
	dbCtrl := dashboards.NewController(dbSvc)
	dashboards.RegisterDashboardsRouter(e, dbCtrl)

	// 面板管理：/api/v1/panels/*
	panelSvc := panels.NewServer(db, l)
	panelCtrl := panels.NewController(panelSvc)
	panels.RegisterPanelsRouter(e, panelCtrl)

	// CORS 中间件：允许跨域请求（开发阶段开放所有来源）
	e.Use(func(ctx *gin.Context) {
		ctx.Header("Access-Control-Allow-Origin", "*")
		ctx.Header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		ctx.Header("Access-Control-Allow-Headers", "Content-Type,Authorization")
		// 预检请求直接返回 204
		if ctx.Request.Method == "OPTIONS" {
			ctx.AbortWithStatus(204)
			return
		}
		ctx.Next()
	})

	// 启动 HTTP 服务器
	l.Infof("Server starting on port %d", cfg.Server.Port)
	_ = e.Run(fmt.Sprintf(":%d", cfg.Server.Port))
}
