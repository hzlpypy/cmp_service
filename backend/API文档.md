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
| dashboard_json | JSON | 仪表板完整定义（含 panels 数组，Grafana 风格） |
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

### 2.2 ~ 2.5 获取/创建/更新/删除文件夹

参见旧版文档，接口路由不变。

---

## 3. 仪表板 API

### 3.1 获取仪表板列表 (含面板)

```
POST /api/v1/dashboards/list
Content-Type: application/json

{}                                  // 获取所有仪表板
{"folder_id": "folder-1"}          // 按文件夹筛选
```

### 3.2 获取仪表板详情

```
POST /api/v1/dashboards/get
Content-Type: application/json

{"id": "db-1"}
```

响应包含 `dashboard_json` 字段（完整仪表板定义，含 `panels` 数组）。

### 3.3 创建仪表板

```
POST /api/v1/dashboards/create
Content-Type: application/json

{"title": "新建仪表板", "folder_id": "folder-1"}
```

可选传入 `dashboard_json` 预设面板。

### 3.4 更新仪表板（含 dashboard_json）

```
POST /api/v1/dashboards/update
Content-Type: application/json

{
  "id": "db-1",
  "title": "修改后的名称",
  "folder_id": "folder-1",
  "dashboard_json": {
    "title": "修改后的名称",
    "panels": [
      {
        "id": "panel-cal",
        "title": "交易日历",
        "type": "line",
        "gridPos": { "x": 0, "y": 0, "w": 24, "h": 8 },
        "datasource_id": "ds-1",
        "targets": [
          {
            "refId": "A",
            "rawSql": "SELECT date, market FROM calendar",
            "aliasMap": { "date": "日期" },
            "category": "",
            "metricName": "交易日历"
          }
        ],
        "options": {}
      }
    ]
  }
}
```

**关键点**：面板不通过独立 API 操作，而是作为 `dashboard_json.panels` 的一部分整体更新。

### 3.5 删除仪表板

```
POST /api/v1/dashboards/delete
Content-Type: application/json

{"id": "db-1"}
```

### 3.6 查询仪表板数据（含草稿预览）

```
POST /api/v1/dashboards/data
Content-Type: application/json

// 基础用法：根据数据库中的 dashboard_json 查询数据
{"id": "db-1"}

// 带时间范围过滤（仅对默认模式 net_work_metrics 表生效）
{
  "id": "db-1",
  "from": "2026-06-04T00:00:00Z",
  "to": "2026-06-04T06:00:00Z"
}

// 草稿预览模式：传入 dashboard_json 覆盖数据库中的配置
// 前端编辑面板后立即预览效果，不持久化到数据库
{
  "id": "db-1",
  "dashboard_json": {
    "panels": [
      {
        "id": "panel-cal",
        "title": "交易日历",
        "type": "line",
        "targets": [{
          "refId": "A",
          "rawSql": "SELECT * FROM calendar WHERE market='sha' LIMIT 3"
        }]
      }
    ]
  }
}
```

**参数说明**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 仪表板ID |
| `from` | string | 否 | 数据起始时间 RFC3339 格式，用于时间范围过滤 |
| `to` | string | 否 | 数据结束时间 RFC3339 格式 |
| `dashboard_json` | object | 否 | 草稿 JSON，不为空时后端直接使用此配置查询，不从数据库读取 |

**响应**：

```json
{
  "success": true,
  "data": {
    "dashboard_id": "db-1",
    "dashboard_title": "网络监控",
    "dashboard_json": { "panels": [...] },
    "panels_data": [
      {
        "panel_id": "panel-cal",
        "panel_title": "交易日历",
        "panel_type": "line",
        "target": [
          [
            { "date": "2021-01-01", "market": "sha", "weekday": "FRI" },
            { "date": "2021-01-04", "market": "sha", "weekday": "MON" }
          ]
        ]
      }
    ]
  }
}
```

---

## 4. 面板 API

面板作为 `dashboard_json.panels` 的一部分管理，不推荐直接调用面板 API。**推荐使用仪表板 update 接口整体更新。**

### 4.1 创建面板

```
POST /api/v1/panels/create
Content-Type: application/json

{ "dashboard_id": "db-1", "title": "新面板", "type": "bar", ... }
```

### 4.2 更新面板

```
POST /api/v1/panels/update
Content-Type: application/json

{ "id": "panel-1", "title": "修改后的面板名", ... }
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
POST /api/v1/datasources/list
Content-Type: application/json

{}
```

### 5.2 ~ 5.6 获取/创建/更新/删除/测试数据源

接口路由不变，参见旧版文档。

---

## 6. 仪表板面板编辑工作流

### 工作流 A: 直接持久化编辑

```
1. GET /api/v1/dashboards/get  → 获取 dashboard_json
2. 修改 dashboard_json.panels 中的目标面板
3. POST /api/v1/dashboards/update  → 提交整个 dashboard_json
```

### 工作流 B: 草稿预览模式（推荐用于智能体）

```
1. GET /api/v1/dashboards/get  → 获取 dashboard_json
2. 修改 dashboard_json.panels 中的目标面板
3. POST /api/v1/dashboards/data  → 传入 dashboard_json 草稿预览数据
4. 用户确认效果后:
   POST /api/v1/dashboards/update  → 持久化
```

### PanelDef 数据结构

```typescript
interface PanelDef {
  id: string                          // 面板ID，如 "panel-cal"
  title: string                       // 面板标题，如 "交易日历"
  type: 'bar' | 'line' | 'pie' | 'gauge' | 'table'
  gridPos: { x: number; y: number; w: number; h: number }
  datasource_id?: string              // 数据源ID
  targets: TargetDef[]                // 查询配置数组
  options: Record<string, unknown>    // 额外选项
}

interface TargetDef {
  refId: string                       // 查询标识 A/B/C...
  rawSql?: string                     // 自定义SQL
  aliasMap?: Record<string, string>   // 列名→别名映射
  table?: string                      // [兼容] 表名
  fields?: string                     // [兼容] 字段列表
  category: string                    // 指标分类
  metricName: string                  // 图例名称
}
```

### 查询模式优先级

| 优先级 | 模式 | 判断条件 | 说明 |
|--------|------|----------|------|
| 1 | 自定义SQL | `rawSql` 不为空 | 直接执行 SELECT 语句 |
| 2 | 自定义表 | `table` 不为空 | 按 `fields` 选列 |
| 3 | 默认模式 | 以上皆空 | 按 `category` + `metricName` 查 network_metrics 表 |

### 时间范围过滤

- 参数 `from`/`to` 仅在默认模式（network_metrics 表）中生效，过滤 `created_at` 字段
- 自定义 SQL 和自定义表模式的时间过滤需在 SQL 中自行添加 WHERE 条件
- 前端折线图面板额外支持客户端时间过滤（仅对折线图生效）

---

## 7. 存量接口

### 7.1 获取网络指标

```
POST /api/v1/ops_dbapi/api/network_metrics
Content-Type: application/json

{"params": {"date": "2026-05-13"}}
```

### 7.2 获取模板数据

```
POST /api/v1/ops_dbapi/api/business_systems
Content-Type: application/json

{"params": {"id": "1"}}
```

---

## 8. 项目结构

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
├── datasources/                # 数据源模块
├── dashboards/                 # 仪表板模块（含 /data 数据查询）
├── panels/                     # 面板模块
├── network_metrics/            # 存量: 网络指标接口
├── business_systems/           # 存量: 模板数据接口
├── go.mod / go.sum
```

## 9. 错误码

| errorCode | 说明 |
|-----------|------|
| 00000 | 成功 |
| 40001 | 请求参数错误 |
| 40400 | 资源不存在 |
| 50000 | 服务器内部错误 |
