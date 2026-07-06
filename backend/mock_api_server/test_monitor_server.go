// Package main 提供监控指标测试服务。
// 该服务为独立的 HTTP 服务器，用于模拟提供 RabbitMQ、主机和日志监控指标数据。
// 所有数据均为拟真数据，用于 HTTP API 数据源的测试。
package main

import (
	"fmt"
	"math/rand"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// ============================================================
// RabbitMQ 监控指标数据结构
// ============================================================

// RabbitMQQueueMetric 单个队列的监控指标
type RabbitMQQueueMetric struct {
	QueueName        string  `json:"queue_name"`         // 队列名称
	Messages         int64   `json:"messages"`          // 队列中消息总数
	MessagesReady    int64   `json:"messages_ready"`    // 等待被消费的消息数
	MessagesUnacked  int64   `json:"messages_unacked"`   // 已投递但未确认的消息数
	Consumers        int     `json:"consumers"`         // 消费者数量
	MessageRateIn    float64 `json:"message_rate_in"`   // 消息发布速率（条/秒）
	MessageRateOut   float64 `json:"message_rate_out"`  // 消息消费速率（条/秒）
	MemoryUsed       int64   `json:"memory_used"`       // 队列占用内存（字节）
	State            string  `json:"state"`             // 队列状态：running, paused, crashed
	CreatedAt        string  `json:"created_at"`        // 创建时间
}

// RabbitMQOverview RabbitMQ 整体概览
type RabbitMQOverview struct {
	TotalQueues       int     `json:"total_queues"`        // 总队列数
	TotalConnections   int     `json:"total_connections"`   // 总连接数
	TotalChannels      int     `json:"total_channels"`      // 总通道数
	TotalConsumers     int     `json:"total_consumers"`     // 总消费者数
	TotalMessages      int64   `json:"total_messages"`      // 总消息数
	MessageRate        float64 `json:"message_rate"`        // 总消息速率
	DiskFree          int64   `json:"disk_free"`           // 剩余磁盘空间（字节）
	MemoryUsed        int64   `json:"memory_used"`         // 已使用内存（字节）
	MemoryLimit       int64   `json:"memory_limit"`        // 内存限制（字节）
	Uptime            int64   `json:"uptime"`              // 运行时间（秒）
	RabbitMQVersion   string  `json:"rabbitmq_version"`    // RabbitMQ 版本
	ClusterName       string  `json:"cluster_name"`        // 集群名称
}

// RabbitMQResponse RabbitMQ 监控指标响应
type RabbitMQResponse struct {
	Timestamp string             `json:"timestamp"`   // 数据采集时间
	Overview  RabbitMQOverview   `json:"overview"`   // 整体概览
	Queues    []RabbitMQQueueMetric `json:"queues"`    // 队列指标列表
}

// ============================================================
// 主机监控指标数据结构
// ============================================================

// CPUInfo CPU 使用信息
type CPUInfo struct {
	UsagePercent     float64 `json:"usage_percent"`      // CPU 使用率（%）
	UserMode        float64 `json:"user_mode"`          // 用户态使用率（%）
	SystemMode      float64 `json:"system_mode"`        // 内核态使用率（%）
	IdlePercent     float64 `json:"idle_percent"`       // 空闲率（%）
	IOwaitPercent   float64 `json:"iowait_percent"`     // I/O 等待率（%）
	Cores           int     `json:"cores"`              // CPU 核心数
	LoadAvg1min     float64 `json:"load_avg_1min"`      // 1分钟平均负载
	LoadAvg5min     float64 `json:"load_avg_5min"`      // 5分钟平均负载
	LoadAvg15min    float64 `json:"load_avg_15min"`     // 15分钟平均负载
}

// MemoryInfo 内存使用信息
type MemoryInfo struct {
	TotalMB         int64   `json:"total_mb"`            // 总内存（MB）
	UsedMB          int64   `json:"used_mb"`             // 已用内存（MB）
	FreeMB          int64   `json:"free_mb"`             // 空闲内存（MB）
	CachedMB        int64   `json:"cached_mb"`           // 缓存内存（MB）
	BuffersMB       int64   `json:"buffers_mb"`          // 缓冲内存（MB）
	UsagePercent    float64 `json:"usage_percent"`       // 内存使用率（%）
	AvailableMB     int64   `json:"available_mb"`        // 可用内存（MB）
	SwapTotalMB     int64   `json:"swap_total_mb"`      // 交换分区总量（MB）
	SwapUsedMB      int64   `json:"swap_used_mb"`        // 交换分区使用量（MB）
	SwapUsagePercent float64 `json:"swap_usage_percent"` // 交换分区使用率（%）
}

// DiskInfo 磁盘使用信息
type DiskInfo struct {
	Device          string  `json:"device"`              // 设备名称（如 /dev/sda1）
	MountPoint      string  `json:"mount_point"`         // 挂载点
	FileSystem      string  `json:"file_system"`         // 文件系统类型（ext4, xfs等）
	TotalGB         float64 `json:"total_gb"`            // 总空间（GB）
	UsedGB          float64 `json:"used_gb"`             // 已用空间（GB）
	FreeGB          float64 `json:"free_gb"`             // 剩余空间（GB）
	UsagePercent    float64 `json:"usage_percent"`       // 使用率（%）
	InodesTotal     int64   `json:"inodes_total"`        // 总 inode 数
	InodesUsed      int64   `json:"inodes_used"`         // 已用 inode 数
	InodesUsagePercent float64 `json:"inodes_usage_percent"` // inode 使用率（%）
}

// NetworkInfo 网络流量信息
type NetworkInfo struct {
	Interface       string  `json:"interface"`          // 网络接口名称（eth0, ens33等）
	BytesRecvMB     float64 `json:"bytes_recv_mb"`       // 接收字节数（MB）
	BytesSentMB     float64 `json:"bytes_sent_mb"`       // 发送字节数（MB）
	PacketsRecv     int64   `json:"packets_recv"`        // 接收数据包数
	PacketsSent     int64   `json:"packets_sent"`        // 发送数据包数
	RecvRateKBps    float64 `json:"recv_rate_kbps"`      // 接收速率（KB/s）
	SendRateKBps    float64 `json:"send_rate_kbps"`      // 发送速率（KB/s）
	ErrorsIn        int     `json:"errors_in"`           // 接收错误数
	ErrorsOut       int     `json:"errors_out"`          // 发送错误数
	DroppedIn       int     `json:"dropped_in"`          // 接收丢包数
	DroppedOut      int     `json:"dropped_out"`         // 发送丢包数
}

// HostResponse 主机监控指标响应
type HostResponse struct {
	Timestamp    string        `json:"timestamp"`      // 数据采集时间
	Hostname     string        `json:"hostname"`       // 主机名
	IPAddress    string        `json:"ip_address"`     // IP 地址
	OS           string        `json:"os"`             // 操作系统
	KernelVersion string       `json:"kernel_version"` // 内核版本
	Uptime       int64         `json:"uptime"`         // 运行时间（秒）
	CPU          CPUInfo       `json:"cpu"`            // CPU 指标
	Memory       MemoryInfo    `json:"memory"`         // 内存指标
	Disks        []DiskInfo    `json:"disks"`          // 磁盘指标列表
	Network      []NetworkInfo `json:"network"`        // 网络指标列表
}

// ============================================================
// 异常日志监控指标数据结构
// ============================================================

// LogStatistics 日志统计信息
type LogStatistics struct {
	LogLevel      string `json:"log_level"`       // 日志级别
	TotalCount    int64  `json:"total_count"`    // 总数
	LastHourCount int64  `json:"last_hour_count"` // 最近1小时数量
	LastDayCount  int64  `json:"last_day_count"` // 最近24小时数量
}

// LogEntry 单条日志条目
type LogEntry struct {
	Timestamp   string `json:"timestamp"`    // 日志时间
	Level       string `json:"level"`        // 日志级别（ERROR, WARN, INFO, DEBUG）
	ServiceName string `json:"service_name"` // 服务名称
	Message     string `json:"message"`      // 日志消息
	TraceID     string `json:"trace_id"`     // 追踪ID
	StackTrace  string `json:"stack_trace"`  // 堆栈跟踪（可选）
}

// LogResponse 日志监控指标响应
type LogResponse struct {
	Timestamp     string          `json:"timestamp"`      // 数据采集时间
	Statistics    []LogStatistics `json:"statistics"`     // 各级别日志统计
	RecentErrors  []LogEntry      `json:"recent_errors"`  // 最近错误日志列表
	RecentWarnings []LogEntry     `json:"recent_warnings"` // 最近警告日志列表
	TopServices   []ServiceErrorCount `json:"top_services"` // 错误数最多的服务
}

// ServiceErrorCount 服务错误统计
type ServiceErrorCount struct {
	ServiceName string `json:"service_name"` // 服务名称
	ErrorCount  int64  `json:"error_count"`  // 错误数量
	LastError   string `json:"last_error"`   // 最后错误消息
}

// ============================================================
// 模拟数据生成函数
// ============================================================

// 生成 RabbitMQ 模拟数据
func generateRabbitMQData() RabbitMQResponse {
	now := time.Now()

	// 生成队列数据
	queueNames := []string{
		"order.created",
		"order.paid",
		"order.cancelled",
		"payment.notify",
		"inventory.update",
		"user.register",
		"email.send",
		"sms.notify",
		"task.process",
		"log.aggregate",
	}

	queues := make([]RabbitMQQueueMetric, 0, len(queueNames))
	for _, name := range queueNames {
		messages := rand.Int63n(5000)
		messagesReady := int64(float64(messages) * 0.8)
		messagesUnacked := messages - messagesReady

		queues = append(queues, RabbitMQQueueMetric{
			QueueName:       name,
			Messages:        messages,
			MessagesReady:   messagesReady,
			MessagesUnacked: messagesUnacked,
			Consumers:       rand.Intn(10) + 1,
			MessageRateIn:   rand.Float64() * 100,
			MessageRateOut:  rand.Float64() * 80,
			MemoryUsed:      rand.Int63n(10*1024*1024) + 1024*1024,
			State:           []string{"running", "running", "running", "running", "paused"}[rand.Intn(5)],
			CreatedAt:       now.Add(-time.Duration(rand.Intn(30*24)) * time.Hour).Format("2006-01-02T15:04:05+08:00"),
		})
	}

	return RabbitMQResponse{
		Timestamp: now.Format("2006-01-02T15:04:05+08:00"),
		Overview: RabbitMQOverview{
			TotalQueues:       len(queues),
			TotalConnections:  rand.Intn(100) + 50,
			TotalChannels:     rand.Intn(300) + 100,
			TotalConsumers:    rand.Intn(200) + 50,
			TotalMessages:     int64(rand.Intn(50000) + 10000),
			MessageRate:       rand.Float64() * 500,
			DiskFree:          rand.Int63n(100*1024*1024*1024) + 50*1024*1024*1024,
			MemoryUsed:        rand.Int63n(4*1024*1024*1024) + 1*1024*1024*1024,
			MemoryLimit:       8 * 1024 * 1024 * 1024,
			Uptime:            rand.Int63n(30*24*3600) + 24*3600,
			RabbitMQVersion:   "3.12.10",
			ClusterName:       "rabbit@production-cluster",
		},
		Queues: queues,
	}
}

// 生成主机监控模拟数据
func generateHostData() HostResponse {
	now := time.Now()

	// CPU 信息
	cpuUsage := rand.Float64() * 100
	cpuInfo := CPUInfo{
		UsagePercent:   roundTwo(cpuUsage),
		UserMode:       roundTwo(cpuUsage * 0.6),
		SystemMode:     roundTwo(cpuUsage * 0.3),
		IdlePercent:     roundTwo(100 - cpuUsage),
		IOwaitPercent:   roundTwo(rand.Float64() * 5),
		Cores:           16,
		LoadAvg1min:     roundTwo(rand.Float64() * 20),
		LoadAvg5min:     roundTwo(rand.Float64() * 18),
		LoadAvg15min:    roundTwo(rand.Float64() * 15),
	}

	// 内存信息
	memUsed := rand.Int63n(16000) + 8000
	memTotal := int64(32768)
	memInfo := MemoryInfo{
		TotalMB:          memTotal,
		UsedMB:           memUsed,
		FreeMB:           memTotal - memUsed,
		CachedMB:         rand.Int63n(4000) + 1000,
		BuffersMB:        rand.Int63n(1000) + 200,
		UsagePercent:     roundTwo(float64(memUsed) / float64(memTotal) * 100),
		AvailableMB:      memTotal - memUsed + rand.Int63n(2000),
		SwapTotalMB:      8192,
		SwapUsedMB:       rand.Int63n(1000),
		SwapUsagePercent: roundTwo(rand.Float64() * 10),
	}

	// 磁盘信息
	disks := []DiskInfo{
		{
			Device:             "/dev/sda1",
			MountPoint:         "/",
			FileSystem:         "ext4",
			TotalGB:            500.0,
			UsedGB:             roundTwo(rand.Float64() * 300 + 100),
			FreeGB:             roundTwo(rand.Float64() * 200 + 100),
			UsagePercent:       roundTwo(rand.Float64() * 60 + 30),
			InodesTotal:        32768000,
			InodesUsed:         rand.Int63n(1000000) + 500000,
			InodesUsagePercent: roundTwo(rand.Float64() * 3),
		},
		{
			Device:             "/dev/sdb1",
			MountPoint:         "/data",
			FileSystem:         "xfs",
			TotalGB:            2000.0,
			UsedGB:             roundTwo(rand.Float64() * 1500 + 200),
			FreeGB:             roundTwo(rand.Float64() * 500 + 100),
			UsagePercent:       roundTwo(rand.Float64() * 40 + 20),
			InodesTotal:        131072000,
			InodesUsed:         rand.Int63n(5000000) + 2000000,
			InodesUsagePercent: roundTwo(rand.Float64() * 4),
		},
	}
	disks[0].FreeGB = disks[0].TotalGB - disks[0].UsedGB
	disks[1].FreeGB = disks[1].TotalGB - disks[1].UsedGB

	// 网络信息
	networks := []NetworkInfo{
		{
			Interface:    "eth0",
			BytesRecvMB:  roundTwo(rand.Float64() * 1024*1024 + 512*1024),
			BytesSentMB:  roundTwo(rand.Float64() * 512*1024 + 256*1024),
			PacketsRecv:  rand.Int63n(100000000) + 50000000,
			PacketsSent:  rand.Int63n(50000000) + 20000000,
			RecvRateKBps: roundTwo(rand.Float64() * 10240 + 1024),
			SendRateKBps: roundTwo(rand.Float64() * 5120 + 512),
			ErrorsIn:     rand.Intn(100),
			ErrorsOut:    rand.Intn(50),
			DroppedIn:    rand.Intn(200),
			DroppedOut:   rand.Intn(100),
		},
		{
			Interface:    "eth1",
			BytesRecvMB:  roundTwo(rand.Float64() * 512*1024 + 128*1024),
			BytesSentMB:  roundTwo(rand.Float64() * 256*1024 + 64*1024),
			PacketsRecv:  rand.Int63n(30000000) + 10000000,
			PacketsSent:  rand.Int63n(20000000) + 5000000,
			RecvRateKBps: roundTwo(rand.Float64() * 5120 + 256),
			SendRateKBps: roundTwo(rand.Float64() * 2048 + 128),
			ErrorsIn:     rand.Intn(50),
			ErrorsOut:    rand.Intn(30),
			DroppedIn:    rand.Intn(100),
			DroppedOut:   rand.Intn(50),
		},
	}

	return HostResponse{
		Timestamp:     now.Format("2006-01-02T15:04:05+08:00"),
		Hostname:      "prod-server-01",
		IPAddress:     "192.168.1.100",
		OS:            "CentOS Linux release 7.9.2009",
		KernelVersion: "3.10.0-1160.90.1.el7.x86_64",
		Uptime:        rand.Int63n(30*24*3600) + 24*3600,
		CPU:           cpuInfo,
		Memory:        memInfo,
		Disks:         disks,
		Network:       networks,
	}
}

// 生成日志监控模拟数据
func generateLogData() LogResponse {
	now := time.Now()

	// 统计数据
	statistics := []LogStatistics{
		{
			LogLevel:      "ERROR",
			TotalCount:     rand.Int63n(10000) + 1000,
			LastHourCount:  rand.Int63n(100) + 10,
			LastDayCount:   rand.Int63n(1000) + 200,
		},
		{
			LogLevel:      "WARN",
			TotalCount:     rand.Int63n(50000) + 5000,
			LastHourCount:  rand.Int63n(500) + 50,
			LastDayCount:   rand.Int63n(5000) + 1000,
		},
		{
			LogLevel:      "INFO",
			TotalCount:     rand.Int63n(1000000) + 100000,
			LastHourCount:  rand.Int63n(10000) + 1000,
			LastDayCount:   rand.Int63n(100000) + 20000,
		},
		{
			LogLevel:      "DEBUG",
			TotalCount:     rand.Int63n(500000) + 50000,
			LastHourCount:  rand.Int63n(5000) + 500,
			LastDayCount:   rand.Int63n(50000) + 10000,
		},
	}

	// 最近错误日志
	errorMessages := []string{
		"Database connection timeout: failed to connect to MySQL server",
		"Redis connection refused: connection reset by peer",
		"NullPointerException in UserService.getUserById",
		"HTTP 504 Gateway Timeout: upstream server timeout",
		"Failed to send email: SMTP connection timeout",
	}

	recentErrors := make([]LogEntry, 0, 5)
	for i := 0; i < 5; i++ {
		recentErrors = append(recentErrors, LogEntry{
			Timestamp:   now.Add(-time.Duration(i*15+rand.Intn(10)) * time.Minute).Format("2006-01-02T15:04:05+08:00"),
			Level:       "ERROR",
			ServiceName: []string{"user-service", "order-service", "payment-service", "inventory-service", "notification-service"}[rand.Intn(5)],
			Message:     errorMessages[rand.Intn(len(errorMessages))],
			TraceID:     fmt.Sprintf("trace-%s-%d", randomString(8), rand.Int63n(100000)),
			StackTrace:  "at com.example.service.UserService.getUserById(UserService.java:123)\n\tat com.example.controller.UserController.getUser(UserController.java:45)",
		})
	}

	// 最近警告日志
	warningMessages := []string{
		"High memory usage detected: 85% memory used",
		"Slow query detected: query took 5.2 seconds",
		"Rate limit approaching: 90% of limit reached",
		"Cache miss rate high: 35% cache miss",
		"Connection pool nearly exhausted: 95% used",
	}

	recentWarnings := make([]LogEntry, 0, 5)
	for i := 0; i < 5; i++ {
		recentWarnings = append(recentWarnings, LogEntry{
			Timestamp:   now.Add(-time.Duration(i*10+rand.Intn(5)) * time.Minute).Format("2006-01-02T15:04:05+08:00"),
			Level:       "WARN",
			ServiceName: []string{"monitor-service", "gateway-service", "cache-service", "db-service", "auth-service"}[rand.Intn(5)],
			Message:     warningMessages[rand.Intn(len(warningMessages))],
			TraceID:     fmt.Sprintf("trace-%s-%d", randomString(8), rand.Int63n(100000)),
		})
	}

	// 错误数最多的服务
	topServices := []ServiceErrorCount{
		{ServiceName: "payment-service", ErrorCount: rand.Int63n(500) + 100, LastError: "Transaction timeout: payment gateway not responding"},
		{ServiceName: "order-service", ErrorCount: rand.Int63n(300) + 50, LastError: "Failed to create order: inventory check failed"},
		{ServiceName: "user-service", ErrorCount: rand.Int63n(200) + 30, LastError: "Authentication failed: token expired"},
		{ServiceName: "notification-service", ErrorCount: rand.Int63n(150) + 20, LastError: "Failed to send push notification: device offline"},
		{ServiceName: "inventory-service", ErrorCount: rand.Int63n(100) + 10, LastError: "Stock synchronization failed: database lock timeout"},
	}

	return LogResponse{
		Timestamp:      now.Format("2006-01-02T15:04:05+08:00"),
		Statistics:     statistics,
		RecentErrors:   recentErrors,
		RecentWarnings: recentWarnings,
		TopServices:    topServices,
	}
}

// 辅助函数：保留两位小数
func roundTwo(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}

// 辅助函数：生成随机字符串
func randomString(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, length)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return string(b)
}

// ============================================================
// HTTP 控制器
// ============================================================

// RabbitMQ 监控指标接口
// GET /api/test/rabbitmq
func getRabbitMQMetrics(c *gin.Context) {
	data := generateRabbitMQData()
	c.JSON(http.StatusOK, gin.H{
		"errorCode":    "00000",
		"errorMessage": "",
		"success":      true,
		"data":         data,
	})
}

// 主机监控指标接口
// GET /api/test/host
func getHostMetrics(c *gin.Context) {
	data := generateHostData()
	c.JSON(http.StatusOK, gin.H{
		"errorCode":    "00000",
		"errorMessage": "",
		"success":      true,
		"data":         data,
	})
}

// 日志监控指标接口
// GET /api/test/logs
func getLogMetrics(c *gin.Context) {
	data := generateLogData()
	c.JSON(http.StatusOK, gin.H{
		"errorCode":    "00000",
		"errorMessage": "",
		"success":      true,
		"data":         data,
	})
}

// 健康检查接口
// GET /api/test/health
func healthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"errorCode":    "00000",
		"errorMessage": "",
		"success":      true,
		"data": gin.H{
			"status":    "healthy",
			"timestamp": time.Now().Format("2006-01-02T15:04:05+08:00"),
			"service":   "test-monitor-server",
		},
	})
}

// ============================================================
// 主函数
// ============================================================

func main() {
	// 设置随机种子
	rand.Seed(time.Now().UnixNano())

	// 创建 Gin 引擎
	gin.SetMode(gin.ReleaseMode)
	e := gin.Default()

	// CORS 中间件
	e.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// 注册路由
	api := e.Group("/api/test")
	{
		api.GET("/health", healthCheck)
		api.GET("/rabbitmq", getRabbitMQMetrics)
		api.GET("/host", getHostMetrics)
		api.GET("/logs", getLogMetrics)
	}

	// 启动服务器
	port := 8088
	fmt.Printf("==========================================\n")
	fmt.Printf("  监控指标测试服务已启动\n")
	fmt.Printf("  端口: %d\n", port)
	fmt.Printf("==========================================\n")
	fmt.Printf("\n可用接口:\n")
	fmt.Printf("  健康检查:    GET http://localhost:%d/api/test/health\n", port)
	fmt.Printf("  RabbitMQ指标: GET http://localhost:%d/api/test/rabbitmq\n", port)
	fmt.Printf("  主机指标:    GET http://localhost:%d/api/test/host\n", port)
	fmt.Printf("  日志指标:    GET http://localhost:%d/api/test/logs\n", port)
	fmt.Printf("\n按 Ctrl+C 停止服务\n\n")

	if err := e.Run(fmt.Sprintf(":%d", port)); err != nil {
		fmt.Printf("服务启动失败: %v\n", err)
	}
}