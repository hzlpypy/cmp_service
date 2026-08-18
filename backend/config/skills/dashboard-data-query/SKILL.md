---
name: "dashboard-data-query"
description: "告知智能体如何获取仪表盘相关数据。包括查询面板数据、分析指标风险、了解数据源类型与配置、使用仪表盘变量、文件上传等。不涉及面板的修改/创建操作（创建/修改面板请使用 dashboard-panel-editing skill）。"
---

# Dashboard Data Query (仪表盘数据获取指南)

本 skill 描述智能体如何通过后端 API 获取仪表盘相关数据，包括查询面板数据、分析指标风险、了解数据源配置等。

---

## 1. 架构

```
用户在仪表盘详情页的 AI 对话框输入指令
  ↓
前端自动附带仪表盘上下文（ID、标题、面板列表）→ WebSocket 发送给智能体
  ↓
智能体理解意图：
  ├─ 数据查询/风险分析 → 调用后端 API → 分析数据 → 返回报告
  └─ 面板编辑 → 请参考 dashboard-panel-editing skill
```

**前端已自动附加上下文**，智能体收到的消息格式为：
```
仪表板ID: db-xxx
标题: 网络指标总览
4 个面板: [{"idx":0,"id":"panel-1","title":"交易日历","type":"line",...}]
【用户指令】帮我看看交易日历的数据有没有异常
```

---

## 2. 查询面板数据与风险分析

当用户询问某个面板的数据或指标风险时，调用后端 API。

### 2.1 面板数据查询 API

**POST /api/v1/panels/data**

```bash
curl -s http://127.0.0.1:3011/api/v1/panels/data \
  -H 'Content-Type: application/json' \
  -d '{
    "dashboard_id": "仪表盘ID",
    "panel_id": "面板ID",
    "from": "2024-01-01T00:00:00+08:00",
    "to":   "2024-01-02T00:00:00+08:00"
  }'
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `dashboard_id` | string | **是** | 仪表盘 ID，从上下文获取 |
| `panel_id` | string | **是** | 面板 ID，从上下文匹配 |
| `from` | string | 否 | 起始时间 RFC3339，不填默认不限 |
| `to` | string | 否 | 结束时间 RFC3339，不填默认不限 |

> 当用户提到"最近N小时"等时间范围时，计算对应的时间戳填入 `from`/`to`。

**响应：**
```json
{
  "success": true,
  "data": {
    "panel_id": "panel-cal",
    "panel_title": "交易日历",
    "panel_type": "line",
    "datasource_id": "ds-1",
    "columns": ["date", "market", "volume"],
    "target": [
      [{"date": "2024-01-01", "market": "sha", "volume": 12345}, {"date": "2024-01-02", "market": "sha", "volume": 12890}]
    ]
  }
}
```

`target` 是二维数组，第一维对应面板的每个 target（refId A/B/C），第二维是数据行。`columns` 为数据列名顺序。

### 2.1.1 直接 SQL 查询 API（Query Inspector）

**⚠️ 推荐：分析表结构时优先使用此 API**，无需先创建面板即可直接执行 SQL 并获取结果。

**POST /api/v1/panels/inspect**

```bash
curl -s http://127.0.0.1:3011/api/v1/panels/inspect \
  -H 'Content-Type: application/json' \
  -d '{
    "datasource_id": "ds-1",
    "dashboard_id": "db-xxx",
    "raw_sql": "SELECT * FROM net_work_metrics LIMIT 5"
  }'
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `datasource_id` | string | 否 | 数据源 ID（MySQL 数据源上执行 SQL） |
| `dashboard_id` | string | **是** | 仪表盘 ID，从上下文获取 |
| `raw_sql` | string | 否 | SQL 查询语句（MySQL 数据源使用） |
| `variables` | object | 否 | 变量值映射 |
| `from` | string | 否 | 时间范围开始 RFC3339 |
| `to` | string | 否 | 时间范围结束 RFC3339 |

**响应**：
```json
{
  "success": true,
  "data": {
    "processed_sql": "SELECT * FROM net_work_metrics LIMIT 5",
    "columns": ["id", "node", "metrics", "current_value"],
    "rows": [
      {"id": 1, "node": "南方机房", "metrics": "cpu_usage", "current_value": 85.2},
      {"id": 2, "node": "北方机房", "metrics": "memory_usage", "current_value": 62.1}
    ],
    "row_count": 2
  }
}
```

**使用场景**：
- **MySQL 表结构查询**：`SELECT COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT FROM information_schema.columns WHERE table_schema='cmp_service' AND table_name='表名'`
- **MySQL 抽样数据**：`SELECT * FROM 表名 LIMIT 10`
- **HTTP API 数据获取**：设置 `http_path`、`http_method`、`http_data_format`、`http_data_path` 等字段直接请求 API
- MySQL 表结构查询和抽样数据查询需要**分两次调用**此 API；HTTP API 一次调用即可

### 2.2 风险分析规则

拿到数据后，按以下规则分析风险：

| 风险等级 | 条件 | 说明 |
|----------|------|------|
| 高风险 | 数值列有值超过阈值 80% 或为 0 | 可能是异常峰值或服务中断 |
| 中风险 | 数值列波动超过 ±50%（与前一天/小时对比） | 指标波动较大 |
| 低风险 | 其他 | 正常范围 |

对面板的每个数值列进行检测，输出风险报告。

**回复格式**（纯文本）：
```
【指标风险分析报告 - 交易日历】

- volume: 正常（最大值 12,345，阈值安全）
- amount: 高风险（最新值 0，可能服务中断）

建议：重点关注 amount 指标，检查数据源是否正常。
```

如果用户问的是整个仪表盘的多个面板，**逐个面板调用接口**，汇总后给出报告。

### 2.3 场景：查询数据并分析风险

用户说："帮我看看各机房带宽使用率有没有异常"

**步骤：**
1. 从上下文匹配面板名称，找到对应的面板 ID（如 `panel-bw`）和仪表盘 ID（如 `db-2`）
2. 调用 API 查询该面板数据
3. 从响应中提取 `target` 数据
4. 按风险分析规则检测每个数值列，输出报告

### 2.4 场景：查询指定时间范围的数据

用户说："最近6小时交易日历的数据有什么异常吗"

**步骤：**
1. 从上下文匹配"交易日历"面板 ID 和仪表盘 ID
2. 计算时间范围：当前时间往前推 6 小时
3. 调用 API 传入 `from`/`to`
4. 分析数据并输出风险报告

---

## 3. 数据源 ID 参考

> 数据源以数据库实际数据为准，可通过数据源列表 API 获取完整列表。以下为常见数据源示例：

| 数据源 ID | 名称 |
|-----------|------|
| `ds-1` | 网络指标数据库（MySQL） |
| `ds-http-1` | 监控API（HTTP） |

---

## 4. 数据源类型说明

系统支持两种数据源类型：MySQL 和 HTTP API。

### 4.1 MySQL 数据源

**配置字段**：
- `type`: `"mysql"`
- `url`: 数据库连接地址（如 `127.0.0.1:3306`）
- `name`: 数据源名称
- `config`: 无特殊配置

**面板查询配置**：
```json
{
  "targets": [
    {
      "refId": "A",
      "rawSql": "SELECT * FROM users WHERE city = '$city' LIMIT 100",
      "metricName": "用户数据"
    }
  ]
}
```

**变量支持**：
- `$varname` 或 `${varname}` 语法
- 系统变量：`$__from`、`$__to`（自动添加引号，用于SQL时间条件）

### 4.2 HTTP API 数据源

**配置字段**：
- `type`: `"http"`
- `url`: Base URL（基础地址，如 `https://api.example.com`）
- `name`: 数据源名称
- `headers`: 自定义HTTP请求头（JSON对象，如 `{"X-Custom-Header": "value"}`）
- `config`: HTTP认证配置（JSON对象）
    - `auth_type`: 认证类型（`"none"` / `"bearer"` / `"apikey"` / `"basic"`）
    - `auth_token`: Bearer Token 或 API Key 值
    - `auth_username`: Basic Auth 用户名
    - `auth_password`: Basic Auth 密码
    - `timeout`: 超时时间（秒，默认10）

**面板查询配置字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `http_path` | `string` | API路径（与数据源Base URL拼接成完整URL） |
| `http_method` | `string` | HTTP方法（`"GET"` / `"POST"` / `"PUT"` / `"DELETE"` / `"PATCH"`） |
| `http_body_type` | `string` | 请求体类型（`"raw"` / `"form-data"` / `"x-www-form-urlencoded"` / `"graphql"`） |
| `http_body` | `string` | 请求体内容（`raw`/`graphql` 类型时使用） |
| `http_form_data` | `Array<{key:string,value:string}>` | 表单数据（`form-data`/`x-www-form-urlencoded` 类型时使用） |
| `http_headers` | `object` | 自定义HTTP请求头（可覆盖数据源Headers） |
| `http_data_format` | `string` | 数据格式（`"json"` / `"xml"` / `"csv"`） |
| `http_data_path` | `string` | 数据提取路径（JSONPath，如 `"data.results"`） |

**Headers优先级规则**：
```
认证Headers（最高优先级） > 查询配置Headers（http_headers） > 数据源Headers（最低优先级）
```

**完整URL拼接规则**：
```
数据源 Base URL + target.http_path = 最终请求URL
```

**变量替换规则**：
- HTTP URL 中的变量**不添加引号**（与MySQL不同）
- `$__from` → `2024-01-01T00:00:00Z`（不带引号）
- `$city` → `北京`（直接替换值）

### 4.3 HTTP 请求体类型说明

| body_type | 说明 | 使用字段 | 自动设置 Content-Type |
|-----------|------|----------|----------------------|
| `raw`（默认） | 原始请求体 | `http_body` | `application/json` |
| `form-data` | multipart 表单 | `http_form_data` | `multipart/form-data` |
| `x-www-form-urlencoded` | URL编码表单 | `http_form_data` | `application/x-www-form-urlencoded` |
| `graphql` | GraphQL 查询 | `http_body`（GraphQL 字符串） | `application/json` |

### 4.4 Query Inspector（HTTP 请求调试）

Query Inspector 面板支持查看 HTTP 请求的详细信息，方便调试。

**Query Inspector 请求体**：
```json
{
  "datasource_id": "ds-http-1",
  "dashboard_id": "db-1",
  "http_path": "/api/v1/data",
  "http_method": "POST",
  "http_body_type": "form-data",
  "http_form_data": [{"key": "type", "value": "daily"}],
  "variables": {},
  "from": "2024-01-01T00:00:00+08:00",
  "to": "2024-01-02T00:00:00+08:00"
}
```

**Query Inspector 响应**（新增 `request_info` 字段）：
```json
{
  "processed_sql": "https://api.example.com/v1/data",
  "columns": ["name", "value"],
  "rows": [{"name": "test", "value": 123}],
  "row_count": 1,
  "request_info": {
    "method": "POST",
    "url": "https://api.example.com/v1/data",
    "headers": {"Authorization": "Bearer xxx", "X-Custom": "test"},
    "body_type": "form-data",
    "form_data": [{"key": "type", "value": "daily"}],
    "curl_command": "curl -X POST \\\n  -H 'Authorization: Bearer xxx' \\\n  -H 'X-Custom: test' \\\n  -F 'type=daily' \\\n  'https://api.example.com/v1/data'"
  }
}
```

### 4.5 数据解析说明

**JSONPath 提取规则**：

| http_data_path | API 返回示例 | 提取结果 |
|----------------|-------------|----------|
| `data` | `{"data": [{"name": "Alice"}]}` | `[{"name": "Alice"}]` |
| `data.results` | `{"data": {"results": [{"id": 1}]}}` | `[{"id": 1}]` |
| `items[*]` | `{"items": [{"a": 1}, {"a": 2}]}` | `[{"a": 1}, {"a": 2}]` |
| 留空或不填 | `{"name": "Alice", "age": 25}` | 整个对象作为单行数据 |

**数据转换**：
- API 返回数组 → 每个元素作为一行
- API 返回单个对象 → 作为一行
- API 返回单个值 → 转为单列表格（列名 `value`）

**列名稳定性**：
- HTTP API 返回的列名按字母顺序排序（保证稳定）

### 4.6 HTTP vs MySQL 对比

| 特性 | MySQL 数据源 | HTTP API 数据源 |
|------|-------------|----------------|
| 查询方式 | SQL语句 | HTTP请求 |
| 查询字段 | `rawSql` | `http_path` + `http_method` 等 |
| 变量替换 | 添加引号（SQL语法） | 不添加引号（URL参数） |
| 认证配置 | 数据库连接配置 | HTTP认证头（Bearer/API Key） |
| 数据格式 | 数据库表结构 | JSON/XML/CSV解析 |
| 适用场景 | 内部数据库查询 | 外部API集成、第三方数据 |

### 4.7 智能体判断数据源类型的规则

1. **优先检查 target 中的查询字段**：
    - 有 `rawSql` → MySQL 数据源
    - 有 `http_path` → HTTP API 数据源
2. **从上下文获取数据源信息**：前端会在消息中附带仪表盘的面板列表
3. **修改已有面板时保持数据源类型一致**：MySQL 面板只修改 `rawSql`，HTTP 面板只修改 `http_path`

---

## 5. 仪表盘变量功能

仪表盘变量允许用户创建动态仪表盘，变量显示在仪表盘顶部的下拉选择器中。

### 5.1 变量类型

| 类型 | 说明 |
|------|------|
| `custom` | 自定义列表，手动定义选项值 |
| `query` | 查询生成，通过 SQL 查询动态获取选项值 |
| `textbox` | 文本框，用户自由输入值 |
| `constant` | 常量，隐藏的固定值 |
| `datasource` | 数据源选择，切换面板的数据源 |
| `interval` | 时间间隔，用于时间分组 |

### 5.2 变量语法

在 SQL 查询中使用变量：
```sql
-- 基本语法
SELECT * FROM servers WHERE name = '$server'

-- 多选场景
SELECT * FROM servers WHERE name IN ($server)
```

### 5.3 变量 API

| 接口 | 说明 |
|------|------|
| `POST /api/v1/variables/list` | 获取仪表盘的变量列表 |
| `POST /api/v1/variables/get` | 获取单个变量详情 |
| `POST /api/v1/variables/create` | 创建变量 |
| `POST /api/v1/variables/update` | 更新变量 |
| `POST /api/v1/variables/delete` | 删除变量 |
| `POST /api/v1/variables/values` | 获取变量的可选值 |

### 5.4 变量结构

```typescript
interface VariableRes {
    id: string
    dashboard_id: string
    name: string                    // 变量名，用于 $name 引用
    type: 'custom' | 'query' | 'textbox' | 'constant' | 'datasource' | 'interval'
    label: string                   // 显示名称
    description: string             // 描述
    options: VariableOption[]       // 选项列表（custom 类型）
    query: string                   // 查询语句（query 类型）
    datasource_id: string           // 数据源 ID（query 类型）
    default: string                 // 默认值
    current: { text: string; value: string | string[] }
    multi: boolean                  // 是否多选
    include_all: boolean            // 是否包含"全部"选项
    all_value: string               // "全部"选项的值
    sort_order: number              // 排序序号
}
```

### 5.5 使用示例

**创建自定义变量**：
```bash
curl -s http://127.0.0.1:3011/api/v1/variables/create \
  -H 'Content-Type: application/json' \
  -d '{
    "dashboard_id": "db-1",
    "name": "server",
    "type": "custom",
    "label": "服务器",
    "options": [
      {"text": "北京", "value": "beijing"},
      {"text": "上海", "value": "shanghai"}
    ],
    "default": "beijing",
    "multi": false
  }'
```

**创建查询变量**：
```bash
curl -s http://127.0.0.1:3011/api/v1/variables/create \
  -H 'Content-Type: application/json' \
  -d '{
    "dashboard_id": "db-1",
    "name": "market",
    "type": "query",
    "label": "市场",
    "query": "SELECT DISTINCT market FROM calendar",
    "datasource_id": "ds-1",
    "multi": true,
    "include_all": true
  }'
```

---

## 6. 文件上传 API

### 6.1 接口说明

**POST /api/v1/file/upload**

请求方式：`multipart/form-data`

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | File | 是 | 要上传的文件 |

**支持的文件类型**：`.txt` `.md` `.pdf` `.docx` `.xlsx` `.jpg` `.jpeg` `.png`

**响应格式**：
```json
{
  "errorCode": "00000",
  "errorMessage": "",
  "success": true,
  "data": {
    "file_path": "/absolute/path/to/client_files/filename.txt",
    "file_name": "filename.txt"
  }
}
```

### 6.2 文件保存位置

文件保存在后端运行目录下的 `./client_files/` 文件夹中。

```bash
curl -X POST http://127.0.0.1:3011/api/v1/file/upload \
  -F "file=@/path/to/document.pdf"
```

---

## 7. 数据源列表 API

用于获取系统中所有可用的数据源。**注意：该接口为 GET 方法，无请求体。**

```bash
curl -s http://127.0.0.1:3011/api/v1/datasources/list
```

---

## 8. 创建快照（Snapshot）

快照保存当前仪表盘或面板的完整状态（含数据），生成可分享的静态链接。

### 8.1 快照类型

| 类型 | 面板范围 | 创建位置 |
|------|----------|----------|
| 仪表盘快照 | 所有面板 | 仪表盘详情页 → 顶部工具栏「创建快照」 |
| 面板快照 | 单个面板 | 面板编辑详情页 → 右侧「共享」标签 |

### 8.2 智能体应如何响应

智能体**无法直接创建快照**。当用户要求创建快照时，应指导用户操作：

> 仪表盘快照：点击仪表盘顶部工具栏的「创建快照」按钮，输入名称后点击创建。创建后可复制链接分享。
>
> 面板快照：进入面板编辑详情页 → 右侧「共享」标签 → 输入名称 → 点击「创建快照」。

---

## 9. 注意事项

1. **查询数据需调用 API**：当用户询问"有没有异常"、"分析风险"、"查看数据"时，调用后端 API 获取数据后再分析
2. **所有面板信息从上下文获取**：前端会在每条消息中附带仪表盘 ID、标题、面板列表
3. **时间范围**：用户提到"最近N小时/天"时，计算对应的 RFC3339 时间戳
4. **变量功能**：SQL 中可使用 `$varname` 引用变量值；HTTP URL 中变量不添加引号
5. **多个面板时逐个调用**：用户问整个仪表盘时，逐个面板调用 API，汇总后给出报告
