# 监控指标测试服务 API 文档

> 服务地址：`http://localhost:8088`
> 版本：1.0.0
> 最后更新：2026-07-06

---

## 概述

本服务提供监控指标的模拟数据，用于 HTTP API 数据源的测试。所有数据均为拟真数据，每次请求返回随机变化的数值，模拟真实监控场景。

---

## 通用响应格式

所有接口均返回统一的 JSON 格式：

```json
{
  "errorCode": "00000",
  "errorMessage": "",
  "success": true,
  "data": { ... }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `errorCode` | string | 错误码，`"00000"` 表示成功 |
| `errorMessage` | string | 错误消息，成功时为空 |
| `success` | boolean | 是否成功 |
| `data` | object | 实际数据内容 |

---

## 接口列表

| 接口 | 方法 | 路径 | 描述 |
|------|------|------|------|
| 健康检查 | GET | `/api/test/health` | 检查服务运行状态 |
| RabbitMQ 指标 | GET | `/api/test/rabbitmq` | RabbitMQ 队列和消息监控指标 |
| 主机指标 | GET | `/api/test/host` | CPU、内存、磁盘、网络监控指标 |
| 日志指标 | GET | `/api/test/logs` | 异常日志统计和最近错误列表 |

---

## 1. 健康检查

**GET** `/api/test/health`

检查服务是否正常运行。

### 响应示例

```json
{
  "errorCode": "00000",
  "errorMessage": "",
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-07-06T15:30:00+08:00",
    "service": "test-monitor-server"
  }
}
```

### data 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | string | 服务状态，固定为 `"healthy"` |
| `timestamp` | string | 当前时间（RFC3339 格式） |
| `service` | string | 服务名称 |

---

## 2. RabbitMQ 监控指标

**GET** `/api/test/rabbitmq`

获取 RabbitMQ 消息队列的监控指标数据。

### 响应示例

```json
{
  "errorCode": "00000",
  "errorMessage": "",
  "success": true,
  "data": {
    "timestamp": "2026-07-06T15:30:00+08:00",
    "overview": {
      "total_queues": 10,
      "total_connections": 78,
      "total_channels": 215,
      "total_consumers": 142,
      "total_messages": 28543,
      "message_rate": 324.5,
      "disk_free": 107374182400,
      "memory_used": 2147483648,
      "memory_limit": 8589934592,
      "uptime": 2592000,
      "rabbitmq_version": "3.12.10",
      "cluster_name": "rabbit@production-cluster"
    },
    "queues": [
      {
        "queue_name": "order.created",
        "messages": 1245,
        "messages_ready": 996,
        "messages_unacked": 249,
        "consumers": 5,
        "message_rate_in": 45.2,
        "message_rate_out": 38.7,
        "memory_used": 5242880,
        "state": "running",
        "created_at": "2026-05-15T10:00:00+08:00"
      }
    ]
  }
}
```

### data 字段说明

#### overview（整体概览）

| 字段 | 类型 | 说明 |
|------|------|------|
| `total_queues` | int | 总队列数 |
| `total_connections` | int | 总连接数 |
| `total_channels` | int | 总通道数 |
| `total_consumers` | int | 总消费者数 |
| `total_messages` | int64 | 总消息数 |
| `message_rate` | float64 | 总消息速率（条/秒） |
| `disk_free` | int64 | 剩余磁盘空间（字节） |
| `memory_used` | int64 | 已使用内存（字节） |
| `memory_limit` | int64 | 内存限制（字节） |
| `uptime` | int64 | 运行时间（秒） |
| `rabbitmq_version` | string | RabbitMQ 版本 |
| `cluster_name` | string | 集群名称 |

#### queues（队列列表）

每个队列包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `queue_name` | string | 队列名称 |
| `messages` | int64 | 队列中消息总数 |
| `messages_ready` | int64 | 等待被消费的消息数 |
| `messages_unacked` | int64 | 已投递但未确认的消息数 |
| `consumers` | int | 消费者数量 |
| `message_rate_in` | float64 | 消息发布速率（条/秒） |
| `message_rate_out` | float64 | 消息消费速率（条/秒） |
| `memory_used` | int64 | 队列占用内存（字节） |
| `state` | string | 队列状态：`running` / `paused` / `crashed` |
| `created_at` | string | 创建时间 |

### 模拟队列列表

服务固定返回 10 个队列的模拟数据：

| 队列名称 | 描述 |
|---------|------|
| `order.created` | 订单创建事件 |
| `order.paid` | 订单支付事件 |
| `order.cancelled` | 订单取消事件 |
| `payment.notify` | 支付通知 |
| `inventory.update` | 库存更新 |
| `user.register` | 用户注册 |
| `email.send` | 邮件发送 |
| `sms.notify` | 短信通知 |
| `task.process` | 任务处理 |
| `log.aggregate` | 日志聚合 |

---

## 3. 主机监控指标

**GET** `/api/test/host`

获取主机 CPU、内存、磁盘、网络等监控指标。

### 响应示例

```json
{
  "errorCode": "00000",
  "errorMessage": "",
  "success": true,
  "data": {
    "timestamp": "2026-07-06T15:30:00+08:00",
    "hostname": "prod-server-01",
    "ip_address": "192.168.1.100",
    "os": "CentOS Linux release 7.9.2009",
    "kernel_version": "3.10.0-1160.90.1.el7.x86_64",
    "uptime": 2592000,
    "cpu": {
      "usage_percent": 42.35,
      "user_mode": 25.41,
      "system_mode": 12.70,
      "idle_percent": 57.65,
      "iowait_percent": 2.15,
      "cores": 16,
      "load_avg_1min": 8.52,
      "load_avg_5min": 7.23,
      "load_avg_15min": 6.15
    },
    "memory": {
      "total_mb": 32768,
      "used_mb": 12543,
      "free_mb": 20225,
      "cached_mb": 3250,
      "buffers_mb": 520,
      "usage_percent": 38.26,
      "available_mb": 23995,
      "swap_total_mb": 8192,
      "swap_used_mb": 245,
      "swap_usage_percent": 2.99
    },
    "disks": [
      {
        "device": "/dev/sda1",
        "mount_point": "/",
        "file_system": "ext4",
        "total_gb": 500.0,
        "used_gb": 245.5,
        "free_gb": 254.5,
        "usage_percent": 49.1,
        "inodes_total": 32768000,
        "inodes_used": 725430,
        "inodes_usage_percent": 2.21
      },
      {
        "device": "/dev/sdb1",
        "mount_point": "/data",
        "file_system": "xfs",
        "total_gb": 2000.0,
        "used_gb": 850.0,
        "free_gb": 1150.0,
        "usage_percent": 42.5,
        "inodes_total": 131072000,
        "inodes_used": 4250000,
        "inodes_usage_percent": 3.25
      }
    ],
    "network": [
      {
        "interface": "eth0",
        "bytes_recv_mb": 1572864.0,
        "bytes_sent_mb": 786432.0,
        "packets_recv": 85000000,
        "packets_sent": 42000000,
        "recv_rate_kbps": 8192.5,
        "send_rate_kbps": 4096.25,
        "errors_in": 12,
        "errors_out": 5,
        "dropped_in": 35,
        "dropped_out": 18
      },
      {
        "interface": "eth1",
        "bytes_recv_mb": 524288.0,
        "bytes_sent_mb": 262144.0,
        "packets_recv": 25000000,
        "packets_sent": 15000000,
        "recv_rate_kbps": 3072.5,
        "send_rate_kbps": 1536.75,
        "errors_in": 8,
        "errors_out": 3,
        "dropped_in": 15,
        "dropped_out": 7
      }
    ]
  }
}
```

### data 字段说明

#### 基本信息

| 字段 | 类型 | 说明 |
|------|------|------|
| `timestamp` | string | 数据采集时间 |
| `hostname` | string | 主机名（固定为 `prod-server-01`） |
| `ip_address` | string | IP 地址（固定为 `192.168.1.100`） |
| `os` | string | 操作系统 |
| `kernel_version` | string | 内核版本 |
| `uptime` | int64 | 运行时间（秒） |

#### cpu（CPU 指标）

| 字段 | 类型 | 说明 |
|------|------|------|
| `usage_percent` | float64 | CPU 使用率（%） |
| `user_mode` | float64 | 用户态使用率（%） |
| `system_mode` | float64 | 内核态使用率（%） |
| `idle_percent` | float64 | 空闲率（%） |
| `iowait_percent` | float64 | I/O 等待率（%） |
| `cores` | int | CPU 核心数（固定为 16） |
| `load_avg_1min` | float64 | 1分钟平均负载 |
| `load_avg_5min` | float64 | 5分钟平均负载 |
| `load_avg_15min` | float64 | 15分钟平均负载 |

#### memory（内存指标）

| 字段 | 类型 | 说明 |
|------|------|------|
| `total_mb` | int64 | 总内存（MB） |
| `used_mb` | int64 | 已用内存（MB） |
| `free_mb` | int64 | 空闲内存（MB） |
| `cached_mb` | int64 | 缓存内存（MB） |
| `buffers_mb` | int64 | 缓冲内存（MB） |
| `usage_percent` | float64 | 内存使用率（%） |
| `available_mb` | int64 | 可用内存（MB） |
| `swap_total_mb` | int64 | 交换分区总量（MB） |
| `swap_used_mb` | int64 | 交换分区使用量（MB） |
| `swap_usage_percent` | float64 | 交换分区使用率（%） |

#### disks（磁盘列表）

每个磁盘包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `device` | string | 设备名称 |
| `mount_point` | string | 挂载点 |
| `file_system` | string | 文件系统类型 |
| `total_gb` | float64 | 总空间（GB） |
| `used_gb` | float64 | 已用空间（GB） |
| `free_gb` | float64 | 剩余空间（GB） |
| `usage_percent` | float64 | 使用率（%） |
| `inodes_total` | int64 | 总 inode 数 |
| `inodes_used` | int64 | 已用 inode 数 |
| `inodes_usage_percent` | float64 | inode 使用率（%） |

#### network（网络列表）

每个网卡包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `interface` | string | 网络接口名称 |
| `bytes_recv_mb` | float64 | 接收字节数（MB） |
| `bytes_sent_mb` | float64 | 发送字节数（MB） |
| `packets_recv` | int64 | 接收数据包数 |
| `packets_sent` | int64 | 发送数据包数 |
| `recv_rate_kbps` | float64 | 接收速率（KB/s） |
| `send_rate_kbps` | float64 | 发送速率（KB/s） |
| `errors_in` | int | 接收错误数 |
| `errors_out` | int | 发送错误数 |
| `dropped_in` | int | 接收丢包数 |
| `dropped_out` | int | 发送丢包数 |

---

## 4. 日志监控指标

**GET** `/api/test/logs`

获取异常日志的统计信息和最近错误/警告列表。

### 响应示例

```json
{
  "errorCode": "00000",
  "errorMessage": "",
  "success": true,
  "data": {
    "timestamp": "2026-07-06T15:30:00+08:00",
    "statistics": [
      {
        "log_level": "ERROR",
        "total_count": 5423,
        "last_hour_count": 45,
        "last_day_count": 356
      },
      {
        "log_level": "WARN",
        "total_count": 28543,
        "last_hour_count": 185,
        "last_day_count": 2856
      },
      {
        "log_level": "INFO",
        "total_count": 854321,
        "last_hour_count": 8543,
        "last_day_count": 85432
      },
      {
        "log_level": "DEBUG",
        "total_count": 425432,
        "last_hour_count": 4253,
        "last_day_count": 42543
      }
    ],
    "recent_errors": [
      {
        "timestamp": "2026-07-06T15:15:00+08:00",
        "level": "ERROR",
        "service_name": "payment-service",
        "message": "Database connection timeout: failed to connect to MySQL server",
        "trace_id": "trace-a8b7c6d5-12345",
        "stack_trace": "at com.example.service.UserService.getUserById(UserService.java:123)\n\tat com.example.controller.UserController.getUser(UserController.java:45)"
      }
    ],
    "recent_warnings": [
      {
        "timestamp": "2026-07-06T15:20:00+08:00",
        "level": "WARN",
        "service_name": "monitor-service",
        "message": "High memory usage detected: 85% memory used",
        "trace_id": "trace-x1y2z3a4-67890"
      }
    ],
    "top_services": [
      {
        "service_name": "payment-service",
        "error_count": 325,
        "last_error": "Transaction timeout: payment gateway not responding"
      },
      {
        "service_name": "order-service",
        "error_count": 185,
        "last_error": "Failed to create order: inventory check failed"
      }
    ]
  }
}
```

### data 字段说明

#### statistics（日志统计）

每个日志级别的统计信息：

| 字段 | 类型 | 说明 |
|------|------|------|
| `log_level` | string | 日志级别：`ERROR` / `WARN` / `INFO` / `DEBUG` |
| `total_count` | int64 | 总数 |
| `last_hour_count` | int64 | 最近1小时数量 |
| `last_day_count` | int64 | 最近24小时数量 |

#### recent_errors（最近错误日志）

每条错误日志包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| `timestamp` | string | 日志时间 |
| `level` | string | 日志级别（固定为 `ERROR`） |
| `service_name` | string | 服务名称 |
| `message` | string | 日志消息 |
| `trace_id` | string | 追踪 ID |
| `stack_trace` | string | 堆栈跟踪（可选） |

#### recent_warnings（最近警告日志）

每条警告日志包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| `timestamp` | string | 日志时间 |
| `level` | string | 日志级别（固定为 `WARN`） |
| `service_name` | string | 服务名称 |
| `message` | string | 日志消息 |
| `trace_id` | string | 追踪 ID |

#### top_services（错误数最多的服务）

每个服务的错误统计：

| 字段 | 类型 | 说明 |
|------|------|------|
| `service_name` | string | 服务名称 |
| `error_count` | int64 | 错误数量 |
| `last_error` | string | 最后错误消息 |

### 模拟服务列表

日志数据涉及以下服务：

| 服务名称 | 描述 |
|---------|------|
| `user-service` | 用户服务 |
| `order-service` | 订单服务 |
| `payment-service` | 支付服务 |
| `inventory-service` | 库存服务 |
| `notification-service` | 通知服务 |
| `monitor-service` | 监控服务 |
| `gateway-service` | 网关服务 |
| `cache-service` | 缓存服务 |
| `db-service` | 数据库服务 |
| `auth-service` | 认证服务 |

---

## 使用示例

### cURL 命令

```bash
# 健康检查
curl -s http://localhost:8088/api/test/health

# RabbitMQ 指标
curl -s http://localhost:8088/api/test/rabbitmq

# 主机指标
curl -s http://localhost:8088/api/test/host

# 日志指标
curl -s http://localhost:8088/api/test/logs
```

### 在仪表盘中使用

创建 HTTP 数据源时，配置如下：

| 配置项 | 值 |
|-------|-----|
| Base URL | `http://localhost:8088` |
| API 路径（RabbitMQ） | `/api/test/rabbitmq` |
| API 路径（主机） | `/api/test/host` |
| API 路径（日志） | `/api/test/logs` |
| 数据格式 | JSON |

**数据提取路径（JSONPath）示例**：

| 目标数据 | JSONPath |
|---------|----------|
| RabbitMQ 队列列表 | `data.queues` |
| RabbitMQ 总消息数 | `data.overview.total_messages` |
| CPU 使用率 | `data.cpu.usage_percent` |
| 内存使用率 | `data.memory.usage_percent` |
| 磁盘列表 | `data.disks` |
| 网络列表 | `data.network` |
| 日志统计 | `data.statistics` |
| 最近错误 | `data.recent_errors` |
| TOP 服务 | `data.top_services` |

---

## 启动服务

```bash
# 编译
cd backend
go build -o test_monitor_server test_monitor_server.go

# 运行
./test_monitor_server
```

服务启动后会监听 **8088** 端口。

---

## 数据特点

- **随机拟真**：每次请求返回随机变化的数据，模拟真实监控场景
- **波动范围**：数值在合理范围内波动（如 CPU 使用率 0-100%，内存使用率 30-60%）
- **时间戳更新**：每次请求的时间戳为当前时间
- **状态模拟**：队列状态随机为 `running` 或 `paused`
- **错误模拟**：日志数据包含真实的错误消息和堆栈跟踪