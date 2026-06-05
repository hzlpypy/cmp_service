# 容量管理平台 - 后端API接口文档

> 基础地址: `http://127.0.0.1:3011`
> 统一响应格式: `{"errorCode":"00000","errorMessage":"","success":true,"data":{}}`

---

## 1. 数据库表结构

### 1.1 folders (文件夹)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(19) PK | 主键，如 `folder-1` |
| uid | VARCHAR(64) | 唯一标识 |
| title | VARCHAR(128) | 文件夹名称 |
| created_at | DATETIME(3) | 创建时间 |
| updated_at | DATETIME(3) | 更新时间 |
| deleted_at | DATETIME(3) | 软删除 |

### 1.2 datasources (数据源)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(19) PK | 主键，如 `ds-1` |
| name | VARCHAR(128) | 数据源名称 |
| type | VARCHAR(16) | `mysql` 或 `http` |
| url | VARCHAR(512) | 连接地址 |
| database_name | VARCHAR(64) | 数据库名(mysql专用) |
| username | VARCHAR(64) | 用户名 |
| password | VARCHAR(256) | 密码 |
| headers | JSON | HTTP请求头(http专用) |
| enabled | TINYINT(1) | 启用状态 |
| created_at | DATETIME(3) | 创建时间 |
| updated_at | DATETIME(3) | 更新时间 |
| deleted_at | DATETIME(3) | 软删除 |

### 1.3 dashboards (仪表板)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(19) PK | 主键，如 `db-1` |
| title | VARCHAR(256) | 仪表板名称 |
| folder_id | VARCHAR(19) | 所属文件夹ID |
| created_at | DATETIME(3) | 创建时间 |
| updated_at | DATETIME(3) | 更新时间 |
| deleted_at | DATETIME(3) | 软删除 |

### 1.4 panels (面板)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(19) PK | 主键，如 `panel-1` |
| dashboard_id | VARCHAR(19) | 所属仪表板ID |
| title | VARCHAR(256) | 面板标题 |
| type | VARCHAR(16) | 图表类型: `bar`/`line`/`pie`/`gauge`/`table` |
| grid_pos_x | INT | 网格列起始位置 |
| grid_pos_y | INT | 网格行起始位置 |
| grid_pos_w | INT | 网格列跨度(默认12) |
| grid_pos_h | INT | 网格行跨度(默认7) |
| datasource | JSON | 数据源配置 `{"category":"xxx","metricName":"xxx"}` |
| options | JSON | 图表自定义配置 |
| sort_order | INT | 排序 |
| created_at | DATETIME(3) | 创建时间 |
| updated_at | DATETIME(3) | 更新时间 |
| deleted_at | DATETIME(3) | 软删除 |

---

## 2. 文件夹 API

### 2.1 获取文件夹列表 (含仪表板)

```
GET /api/v1/folders/list
```

响应:
```json
{
  "errorCode": "00000",
  "errorMessage": "",
  "success": true,
  "data": {
    "list": [
      {
        "id": "folder-1",
        "uid": "net-monitor",
        "title": "网络监控",
        "dashboards": [
          { "id": "db-1", "title": "网络链路带宽监控", "folder_id": "folder-1",
            "created_at": "2026-06-04T02:12:54+08:00", "updated_at": "2026-06-04T02:12:54+08:00" }
        ],
        "created_at": "2026-06-04T02:12:54+08:00",
        "updated_at": "2026-06-04T02:12:54+08:00"
      }
    ],
    "total": 3
  }
}
```

### 2.2 获取文件夹详情

```
POST /api/v1/folders/get
Content-Type: application/json

{"id": "folder-1"}
```

### 2.3 创建文件夹

```
POST /api/v1/folders/create
Content-Type: application/json

{"uid": "new-folder", "title": "新建文件夹"}
```

### 2.4 更新文件夹

```
POST /api/v1/folders/update
Content-Type: application/json

{"id": "folder-1", "uid": "new-uid", "title": "修改后的名称"}
```

### 2.5 删除文件夹

```
POST /api/v1/folders/delete
Content-Type: application/json

{"id": "folder-1"}
```

---

## 3. 仪表板 API

### 3.1 获取仪表板列表 (含面板)

```
POST /api/v1/dashboards/list
Content-Type: application/json

{}                                  // 获取所有仪表板
{"folder_id": "folder-1"}          // 按文件夹筛选
```

响应:
```json
{
  "errorCode": "00000",
  "errorMessage": "",
  "success": true,
  "data": [
    {
      "id": "db-1",
      "title": "网络链路带宽监控",
      "folder_id": "folder-1",
      "folder_name": "网络监控",
      "panels": [
        {
          "id": "panel-1",
          "title": "各机房带宽使用率对比",
          "type": "bar",
          "grid_pos_x": 0,
          "grid_pos_y": 0,
          "grid_pos_w": 12,
          "grid_pos_h": 8,
          "datasource": {"category": "资源使用率", "metricName": "带宽使用率"},
          "options": {},
          "sort_order": 0
        }
      ],
      "created_at": "2026-06-04T02:12:54+08:00",
      "updated_at": "2026-06-04T02:12:54+08:00"
    }
  ]
}
```

### 3.2 获取仪表板详情 (含面板)

```
POST /api/v1/dashboards/get
Content-Type: application/json

{"id": "db-1"}
```

### 3.3 创建仪表板

```
POST /api/v1/dashboards/create
Content-Type: application/json

{"title": "新建仪表板", "folder_id": "folder-1"}
```

### 3.4 更新仪表板

```
POST /api/v1/dashboards/update
Content-Type: application/json

{"id": "db-1", "title": "修改后的名称", "folder_id": "folder-2"}
```

### 3.5 删除仪表板

```
POST /api/v1/dashboards/delete
Content-Type: application/json

{"id": "db-1"}
```

---

## 4. 面板 API

### 4.1 创建面板

```
POST /api/v1/panels/create
Content-Type: application/json

{
  "dashboard_id": "db-1",
  "title": "新面板",
  "type": "bar",
  "grid_pos_x": 0,
  "grid_pos_y": 0,
  "grid_pos_w": 12,
  "grid_pos_h": 7,
  "datasource": {"category": "资源使用率", "metricName": "带宽使用率"},
  "options": {},
  "sort_order": 10
}
```

### 4.2 更新面板

```
POST /api/v1/panels/update
Content-Type: application/json

{
  "id": "panel-1",
  "title": "修改后的面板名",
  "type": "line",
  "grid_pos_x": 0,
  "grid_pos_y": 0,
  "grid_pos_w": 24,
  "grid_pos_h": 7,
  "datasource": {"category": "资源使用率", "metricName": "带宽使用率"},
  "options": {},
  "sort_order": 0
}
```

### 4.3 删除面板

```
POST /api/v1/panels/delete
Content-Type: application/json

{"id": "panel-1"}
```

---

## 5. 数据源 API

### 5.1 获取数据源列表

```
GET /api/v1/datasources/list
```

响应:
```json
{
  "errorCode": "00000",
  "success": true,
  "data": [
    {
      "id": "ds-1",
      "name": "cmp_service MySQL",
      "type": "mysql",
      "url": "127.0.0.1:3306",
      "database_name": "cmp_service",
      "username": "root",
      "headers": {},
      "enabled": true,
      "created_at": "2026-06-04T02:12:54+08:00",
      "updated_at": "2026-06-04T02:12:54+08:00"
    }
  ]
}
```

### 5.2 获取数据源详情

```
POST /api/v1/datasources/get
Content-Type: application/json

{"id": "ds-1"}
```

### 5.3 创建数据源

```
POST /api/v1/datasources/create
Content-Type: application/json

{
  "name": "新数据源",
  "type": "mysql",
  "url": "127.0.0.1:3306",
  "database_name": "mydb",
  "username": "root",
  "password": "password",
  "headers": {},
  "enabled": true
}
```

HTTP类型示例:
```json
{
  "name": "新API数据源",
  "type": "http",
  "url": "http://127.0.0.1:3011/api/v1/xxx",
  "headers": {"Content-Type": "application/json", "Authorization": "Bearer xxx"},
  "enabled": true
}
```

### 5.4 更新数据源

```
POST /api/v1/datasources/update
Content-Type: application/json

{"id": "ds-1", "name": "修改后的名称", "url": "new.host:3306", ...}
```

### 5.5 删除数据源

```
POST /api/v1/datasources/delete
Content-Type: application/json

{"id": "ds-1"}
```

### 5.6 测试数据源连接

```
POST /api/v1/datasources/test
Content-Type: application/json

{"id": "ds-1"}
```

响应:
```json
{"errorCode": "00000", "errorMessage": "cmp_service MySQL(mysql) 连接正常", "success": true}
```

---

## 6. 存量接口

### 6.1 获取网络指标

```
POST /api/v1/ops_dbapi/api/network_metrics
Content-Type: application/json

{"params": {"date": "2026-05-13"}}
```

### 6.2 获取模板数据

```
POST /api/v1/ops_dbapi/api/business_systems
Content-Type: application/json

{"params": {"id": "1"}}
```

---

## 7. 项目结构

```
backend/
├── cmd/
│   ├── main.go                 # 应用入口
│   └── config/
│       ├── conf.go             # 配置加载
│       └── config.yaml         # MySQL连接配置
├── model/
│   └── models.go               # 所有ORM模型(Folder/Datasource/Dashboard/Panel + 存量表)
├── folders/                    # 文件夹模块
│   ├── controller.go, model.go, router.go, service.go
├── datasources/                # 数据源模块
│   ├── controller.go, model.go, router.go, service.go
├── dashboards/                 # 仪表板模块
│   ├── controller.go, model.go, router.go, service.go
├── panels/                     # 面板模块
│   ├── controller.go, model.go, router.go, service.go
├── network_metrics/            # 存量: 网络指标接口
├── business_systems/           # 存量: 模板数据接口
├── go.mod / go.sum
```

## 8. 错误码

| errorCode | 说明 |
|-----------|------|
| 00000 | 成功 |
| 40001 | 请求参数错误 |
| 40400 | 资源不存在 |
| 50000 | 服务器内部错误 |
