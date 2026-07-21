---
name: "dashboard-panel-editing"
description: "告知智能体如何通过返回结构化 JSON 指令与前端交互，实时修改仪表盘面板配置。支持增加/编辑报表、查询仪表盘面板信息、查看数据库表数据、分析表结构智能推荐报表方案、配置 Data Links/合并单元格/条件告警/列筛选/字段显示等。不支持编辑仪表盘、删除仪表盘、删除报表。获取数据请使用 dashboard-data-query skill。"
---

# Dashboard Panel Editing (仪表盘面板编辑对接指南)

本 skill 描述智能体如何根据用户对话，返回结构化 JSON 让前端**自动修改指定报表**并立即刷新图表。

---

## ⚠️ 核心原则：用户确认优先（适用于所有数据源和所有操作）

**智能体在执行任何修改/创建操作前，都必须先和用户确定，得到用户许可后才能执行，不能跳过用户直接执行。**

### 禁止行为（严禁）

- ❌ **跳过用户确认直接执行任何操作**
- ❌ **用户未回复就返回 update_draft 指令**
- ❌ **用户提出疑问时强行执行**
- ❌ **用户拒绝后继续执行**
- ❌ **修复面板时清空或丢失原有查询配置**（rawSql、http_path、http_data_path 等）

### 正确行为（必须遵守）

- ✅ **详细说明即将执行的操作内容**
- ✅ **等待用户明确回复**（不催促）
- ✅ **得到用户明确许可后才返回 update_draft 指令**
- ✅ **修复面板时必须保留所有原有查询配置**

### 适用场景

| 操作类型 | 是否需要用户确认 | 说明 |
|---------|----------------|------|
| 创建新面板 | ✅ 必须确认 | 告知用户将创建什么面板、什么配置 |
| 修改现有面板 | ✅ 必须确认 | 告知用户将修改哪些字段、改成什么 |
| 优化报表 | ✅ 必须确认 | 告知用户将做哪些优化、预期效果 |
| 修复报表 | ✅ 必须确认 | 告知用户发现什么问题、如何修复 |
| 查询仪表盘/面板信息 | ❌ 无需确认 | 只读操作，不修改任何配置 |
| 删除面板 | ❌ 不支持 | 系统不支持删除，需告知用户手动操作 |

### 确认流程三步骤

```
步骤1：向用户说明即将执行的操作
  ↓
步骤2：等待用户明确回复（同意、疑问、调整、拒绝）
  ↓
步骤3：根据用户回复决定下一步操作
  ├─ 同意 → 返回 update_draft JSON（不是调用 API！）
  ├─ 疑问 → 解释并等待再次确认
  ├─ 调整 → 调整方案并等待再次确认
  └─ 拒绝 → 取消操作，询问其他需求
```

---

## 🚨 面板操作唯一方式：返回 JSON（严禁调用后端 API）

**创建和修改面板只有一种方式：返回包含 `action: "update_draft"` 的 JSON 指令。前端会自动处理这些 JSON 并更新面板。**

### ✅ 正确做法

```
智能体分析用户需求 → 构造 update_draft JSON → 返回给用户
前端收到 JSON → 自动创建/修改面板 → 图表实时刷新
```

### ❌ 禁止行为（导致严重错误）

| 禁止 | 说明 |
|------|------|
| `curl ... /api/v1/panels/create` | ❌ 不要调用面板创建 API |
| `curl ... /api/v1/panels/update` | ❌ 不要调用面板更新 API |
| `curl ... /api/v1/panels/update_draft` | ❌ 不要调用草稿更新 API |
| `curl ... /api/v1/panels/delete` | ❌ 不要调用面板删除 API |
| 任何直接操作面板的 curl/HTTP 调用 | ❌ 全部禁止 |

**你唯一要做的事情就是返回 JSON 文本，前端会自动完成剩余工作。**

### 允许调用的 API（仅限数据查询）

| API | 用途 |
|-----|------|
| `POST /api/v1/panels/inspect` | 直接执行 SQL 或 HTTP 请求，获取数据用于分析 |
| `POST /api/v1/panels/data` | 查询已有面板的显示数据 |
| `POST /api/v1/datasources/list` | 获取数据源列表（仅无 @ 指定时） |

> 这些 API 只用于**获取数据**，绝不用于创建/修改/删除面板。

---

## ⚠️ 数据源确定方式

**新建报表时，数据源是必须首先确定的配置项。**

### 方式一：@数据源名 显式指定（最推荐 ✅）

用户在对话中使用 `@数据源名` 语法指定数据源。

**前端自动解析**：用户在输入框中输入 `@` 时，前端自动下拉展示数据源列表。用户选择后，`@数据源名称` 被插入输入框。**前端发送消息时，自动将 `@` 引用的数据源信息注入到上下文中**，格式为：

```
【已解析数据源】[{"mention":"监控API","id":"ds-http-1","name":"监控API","type":"http","url":"http://localhost:9999"}]
```

**智能体处理逻辑（关键！）**：
- **直接从上下文中的 `【已解析数据源】` 读取数据源信息**（id、type、name 等）
- **⚠️ 不需要调用数据源列表 API！** 数据源已由前端解析完毕，直接使用即可

### 方式二：列出数据源供选择（兜底方案）

如果用户没有指定数据源（消息中没有 `@`），则调用数据源列表 API 并返回 `select_datasource` 指令。

**返回指令格式**：
```json
{
  "action": "select_datasource",
  "datasources": [
    {"id": "ds-http-1", "name": "监控API", "type": "http", "url": "http://localhost:9999"},
    {"id": "ds-1", "name": "网络指标数据库", "type": "mysql", "url": "cmp-service-svc:3306"}
  ],
  "message": "创建报表需要先确定数据源。请从以下数据源中选择一个："
}
```

### 数据源列表 API

**仅在无 @ 指定时调用**：
```bash
curl -s http://cmp-service-svc:3011/api/v1/datasources/list -H 'Content-Type: application/json' -d '{}'
```

### 禁止行为

- ❌ **用户已指定 @数据源名时，仍然调用数据源列表 API 去查找**
- ❌ 用户未指定数据源时直接假设默认数据源
- ❌ 在没有数据源的情况下返回 update_draft 指令

---

## 1. `#面板名` 引用面板

用户在输入框中输入 `#` 时，前端自动下拉展示当前仪表盘的**所有面板列表**。用户输入前几个字即可实时筛选匹配的面板。

**前端自动解析**：用户选择面板后，`#面板名称` 被插入输入框。**前端发送消息时，自动将 `#` 引用的面板信息注入到上下文中**，格式为：

```
【已解析面板】[{"mention":"CPU监控","id":"panel-cpu","title":"CPU监控","type":"line"}]
```

**智能体处理逻辑**：
- **直接从上下文中的 `【已解析面板】` 读取面板信息**（id、title、type）
- **⚠️ 不需要遍历上下文中的面板列表去匹配**——面板已由前端解析完毕，直接使用即可
- 需要修改该面板时，直接使用 `【已解析面板】` 中的 `id` 作为 `update_draft` 的 panel id

**示例**：
```
用户：分析一下 #CPU监控 这个面板有什么问题

（前端注入上下文：已解析面板=[{"id":"panel-cpu","title":"CPU监控","type":"line"}]）

智能体：好的，我来分析 CPU监控 面板（panel-cpu）。
这个面板是折线图类型，让我查看它的数据...

（调用面板数据查询 API 分析数据，参考 dashboard-data-query skill）
```

**多面板引用**：
```
用户：对比 #CPU监控 和 #内存使用率 的数据

（前端注入上下文：已解析面板=[{"id":"panel-cpu",...}, {"id":"panel-mem",...}]）

智能体：好的，我将对比以下两个面板的数据：
1. CPU监控（panel-cpu）
2. 内存使用率（panel-mem）
```

---

## 2. 架构

```
用户在仪表盘详情页的 AI 对话框输入指令
  ↓
前端自动附带仪表盘上下文（ID、标题、面板列表）→ WebSocket 发送给智能体
  ↓
智能体理解意图：
  ├─ 面板编辑 → 返回结构化 JSON（update_draft）→ 前端自动合并到草稿 → 图表刷新
  └─ 数据查询/风险分析 → 参考 dashboard-data-query skill
```

---

## 2. 能力范围

### 支持的操作

| 操作 | 说明 |
|------|------|
| 查询仪表盘 | 告诉用户当前仪表盘有哪些面板、什么配置 |
| 查询报表 | 告诉用户某个面板的详细信息 |
| 编辑报表 | 修改面板的标题、图表类型、查询配置、数据源等 |
| 增加报表 | 新增一个面板 |
| 查看数据库表数据 | 新建表格面板，执行 SELECT 查询 |
| 分析表结构并推荐报表 | 查询表结构 → 分析字段 → 推荐图表类型和 SQL |
| 配置 Data Links | 为表格列配置可点击链接 |
| 配置合并单元格/告警/筛选/字段显示 | 面板 options 配置 |

### 不支持的操作

| 操作 | 说明 |
|------|------|
| 编辑仪表盘 | 不能修改仪表盘标题、描述等元信息 |
| 删除仪表盘 | 不能删除整个仪表盘 |
| 删除报表 | 不能删除已有面板 |
| 查询数据/风险分析 | 参考 dashboard-data-query skill |

---

## 3. 输出格式

### 3.1 编辑/新增报表 → 返回 update_draft 指令

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "panel-bar",
      "title": "测试",
      "type": "line",
      "gridPos": { "x": 0, "y": 0, "w": 24, "h": 8 },
      "datasource_id": "ds-1",
      "targets": [
        {
          "refId": "A",
          "rawSql": "SELECT * FROM calendar WHERE market = 'sha' LIMIT 5",
          "aliasMap": { "date": "日期" },
          "metricName": "深圳市场"
        }
      ],
      "options": {}
    }
  ],
  "message": "已将【测试】改为折线图，SQL 改为仅显示深圳市场数据。请在右上角点击「保存仪表板」持久化。"
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `action` | string | 是 | 固定为 `"update_draft"` |
| `panels` | array | 是 | **仅变更的面板**，不包含未变更的面板 |
| `message` | string | 是 | 自然语言说明 |

**面板对象字段**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | **修改时必填** | 面板唯一 ID，修改已有面板时填写原 ID |
| `title` | string | 是 | 面板标题 |
| `type` | string | 是 | 图表类型：`line`、`bar`、`pie`、`gauge`、`table` |
| `gridPos` | object | 否 | 布局 `{x,y,w,h}`，不填时前端自动计算 |
| `datasource_id` | string | 否 | 数据源 ID |
| `targets` | array | 是 | 查询配置数组 |
| `options` | object | 否 | 额外选项，默认 `{}` |

**target 对象字段**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `refId` | string | 是 | 查询引用 ID：`A`, `B`, `C`... |
| `rawSql` | string | 否 | SQL 查询（MySQL 数据源） |
| `http_path` | string | 否 | API 路径（HTTP 数据源） |
| `http_method` | string | 否 | HTTP 方法（HTTP 数据源） |
| `http_body_type` | string | 否 | 请求体类型（HTTP 数据源） |
| `http_body` | string | 否 | 请求体内容（HTTP 数据源） |
| `http_form_data` | array | 否 | 表单数据（HTTP 数据源） |
| `http_headers` | object | 否 | 自定义请求头（HTTP 数据源） |
| `http_data_format` | string | 否 | 数据格式（HTTP 数据源） |
| `http_data_path` | string | 否 | 数据提取路径（HTTP 数据源） |
| `aliasMap` | object | 否 | 列名 → 别名映射 |
| `metricName` | string | 是 | 图例名称 |

### 3.2 查询操作 → 返回纯文本

```json
{
  "message": "当前仪表盘共有 4 个面板：交易日历（折线图）、测试（柱状图）、各机房占比（饼图）、测试预览（表格）。"
}
```

不需要 `action` 字段时，前端作为普通聊天消息展示。

---

## 4. 关键规则

1. **`panels` 只包含变更的面板**
2. **修改已有面板时必须带 `id`**
3. **新增面板时 `id` 留空或不填**
4. **`action` 必须为 `"update_draft"`**
5. **`message` 要有清晰的用户反馈**，末尾提示「保存仪表板」
6. **`refId` 使用 `A`, `B`, `C`**
7. **修改已有面板时只传需要改的字段**：只改 `type` 就不要传 `targets` 和 `datasource_id`
8. **⚠️ targets 按 refId 深度合并**：前端合并逻辑是 `{ ...原target, ...新target }`，AI 只需要传要修改的 target 字段，未传的字段会保留原值
   - **只改 `aliasMap` 时**：targets 数组中只传 `refId` + `aliasMap`，不要传其他字段
   - **只改 `http_path` 时**：只传 `refId` + `http_path`
   - **只改 `metricName` 时**：只传 `refId` + `metricName`
9. **⚠️ 严禁清空 target 关键字段**：绝对不能将 http_path、rawSql、http_method、http_data_path 等设为空字符串或删除
10. **⚠️ 分析面板时基于上下文给出的完整配置**：上下文中每个面板的 targets 已包含 `http_path`、`http_method`、`http_data_format`、`http_data_path`、`rawSql` 等完整字段。不要看到有值的字段就认为没配置——上下文中有的字段就是已配置的。判断面板是否有问题需要通过查询实际数据来确认，不能仅凭字段名推断

---

## 4.1 布局间距要求

**创建或修改面板时，必须确保布局合理，避免拥挤和重叠。**

### 基本原则

| 规则 | 说明 |
|------|------|
| 面板间距 | 面板之间至少保留 1 个单位的间距（gridPos 的 x/y 坐标） |
| 最小高度 | 仪表板（gauge）类型面板最小高度为 6，推荐高度为 8 |
| 最小宽度 | 仪表板（gauge）类型面板最小宽度为 6，推荐宽度为 8 |
| 文字空间 | 确保面板标题和图表内容有足够空间，不被截断 |

### 仪表板（gauge）布局示例

**正确布局**（间距合理，文字不重叠）：
```json
{
  "panels": [
    { "id": "", "title": "CPU使用率", "type": "gauge", "gridPos": { "x": 0, "y": 0, "w": 8, "h": 8 } },
    { "id": "", "title": "内存使用率", "type": "gauge", "gridPos": { "x": 8, "y": 0, "w": 8, "h": 8 } },
    { "id": "", "title": "磁盘使用率", "type": "gauge", "gridPos": { "x": 16, "y": 0, "w": 8, "h": 8 } }
  ]
}
```

**错误布局**（拥挤，文字重叠）：
```json
{
  "panels": [
    { "id": "", "title": "CPU使用率", "type": "gauge", "gridPos": { "x": 0, "y": 0, "w": 4, "h": 4 } },
    { "id": "", "title": "内存使用率", "type": "gauge", "gridPos": { "x": 4, "y": 0, "w": 4, "h": 4 } }
  ]
}
```

### 布局检查清单

创建多个面板时，检查以下几点：
1. ✅ 面板之间没有重叠（gridPos 的 x+w 不超过下一个面板的 x）
2. ✅ 仪表板类型面板高度 ≥ 6
3. ✅ 同一行面板的 y 坐标相同，x 坐标依次递增
4. ✅ 面板标题不会被截断

---

## 5. 常见场景示例

### 场景 A：修改图表类型

用户说："把测试改为折线图"

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "panel-bar",
      "title": "测试",
      "type": "line",
      "datasource_id": "ds-1",
      "targets": [{"refId": "A", "rawSql": "SELECT * FROM calendar LIMIT 5", "metricName": "测试"}],
      "options": {}
    }
  ],
  "message": "已将【测试】改为折线图。请点击右上角「保存仪表板」持久化。"
}
```

### 场景 B：新增面板

用户说："新增一个柱状图叫新增测试"

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "",
      "title": "新增测试",
      "type": "bar",
      "datasource_id": "ds-1",
      "targets": [{"refId": "A", "rawSql": "SELECT * FROM calendar LIMIT 10", "metricName": "新增测试"}],
      "options": {}
    }
  ],
  "message": "已新增柱状图【新增测试】。请点击右上角「保存仪表板」持久化。"
}
```

### 场景 C：修改 SQL 查询

用户说："把交易日历的 SQL 改为只显示上海市场"

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "panel-cal",
      "title": "交易日历",
      "type": "line",
      "datasource_id": "ds-1",
      "targets": [{"refId": "A", "rawSql": "SELECT * FROM calendar WHERE market = 'sha'", "metricName": "交易日历"}],
      "options": {}
    }
  ],
  "message": "已将【交易日历】SQL 改为仅显示上海市场数据。请点击右上角「保存仪表板」持久化。"
}
```

### 场景 C2：只改字段别名（aliasMap）

用户说："给天气查询表格的字段赋予别名，city 改为城市，temp 改为温度"

**⚠️ 关键规则**：只传需要改的字段！只传 `refId` + `aliasMap`，其他字段不传。

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "panel-http-1",
      "targets": [
        {
          "refId": "A",
          "aliasMap": { "city": "城市", "temp": "温度" }
        }
      ]
    }
  ],
  "message": "已将天气查询的字段别名设置为：city→城市、temp→温度。请点击右上角「保存仪表板」持久化。"
}
```

### 场景 C3：只改 HTTP API 路径

用户说："把天气查询的 API 路径改为 /v2/weather"

只传 `refId` + `http_path`，其他不传：

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "panel-http-1",
      "targets": [
        {
          "refId": "A",
          "http_path": "/v2/weather"
        }
      ]
    }
  ],
  "message": "已将天气查询的 API 路径更新为 /v2/weather。请点击右上角「保存仪表板」持久化。"
}
```

### 场景 D：同时修改 + 新增

用户说："把测试改为折线图，再新增一个柱状图叫新报表"

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "panel-bar",
      "title": "测试",
      "type": "line",
      "datasource_id": "ds-1",
      "targets": [{"refId": "A", "rawSql": "SELECT * FROM calendar LIMIT 5", "metricName": "测试"}],
      "options": {}
    },
    {
      "id": "",
      "title": "新报表",
      "type": "bar",
      "datasource_id": "ds-1",
      "targets": [{"refId": "A", "rawSql": "SELECT * FROM calendar LIMIT 10", "metricName": "新报表"}],
      "options": {}
    }
  ],
  "message": "已将【测试】改为折线图，新增柱状图【新报表】。请点击右上角「保存仪表板」持久化。"
}
```

### 场景 E：查询面板信息

用户说："交易日历是什么配置？"

```json
{
  "message": "【交易日历】面板配置：类型=折线图，数据源=ds-1，SQL=SELECT * FROM calendar，图例名称=交易日历。"
}
```

### 场景 F：不支持的删除操作

用户说："删除测试面板"

```json
{
  "message": "抱歉，不支持删除面板。请在界面中点击面板右上角 ⋮ → 删除 来手动删除。"
}
```

---

## 6. HTTP API 数据源面板示例

### 场景 A：GET请求获取数据

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "",
      "title": "当前天气",
      "type": "table",
      "datasource_id": "ds-http-1",
      "targets": [
        {
          "refId": "A",
          "http_path": "/v1/current?city=北京",
          "http_method": "GET",
          "http_data_format": "json",
          "http_data_path": "data.weather",
          "metricName": "天气数据"
        }
      ],
      "options": {}
    }
  ],
  "message": "已创建表格面板展示天气API数据。"
}
```

### 场景 B：POST请求提交数据

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "",
      "title": "用户统计",
      "type": "table",
      "datasource_id": "ds-http-1",
      "targets": [
        {
          "refId": "A",
          "http_path": "/api/v1/stats",
          "http_method": "POST",
          "http_body": "{\"type\": \"daily\", \"limit\": 100}",
          "http_data_format": "json",
          "http_data_path": "results",
          "metricName": "统计数据"
        }
      ],
      "options": {}
    }
  ],
  "message": "已创建表格面板，通过POST请求获取用户统计数据。"
}
```

### 场景 C：使用变量动态查询

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "",
      "title": "城市天气",
      "type": "gauge",
      "datasource_id": "ds-http-1",
      "targets": [
        {
          "refId": "A",
          "http_path": "/v1/weather?city=$city&from=$__from",
          "http_method": "GET",
          "http_data_format": "json",
          "http_data_path": "temperature",
          "metricName": "温度"
        }
      ],
      "options": {}
    }
  ],
  "message": "已创建仪表盘面板，根据城市变量动态查询天气。"
}
```

### 场景 D：Form Data POST 请求

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "",
      "title": "表单数据",
      "type": "table",
      "datasource_id": "ds-http-1",
      "targets": [
        {
          "refId": "A",
          "http_path": "/api/v1/query",
          "http_method": "POST",
          "http_body_type": "form-data",
          "http_form_data": [
            {"key": "type", "value": "daily"},
            {"key": "limit", "value": "100"}
          ],
          "http_data_format": "json",
          "http_data_path": "results",
          "metricName": "表单数据"
        }
      ],
      "options": {}
    }
  ],
  "message": "已创建表格面板，通过 form-data 方式提交表单获取数据。"
}
```

### 场景 E：GraphQL 请求

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "",
      "title": "用户列表",
      "type": "table",
      "datasource_id": "ds-http-1",
      "targets": [
        {
          "refId": "A",
          "http_path": "/graphql",
          "http_method": "POST",
          "http_body_type": "graphql",
          "http_body": "{ users { id name email } }",
          "http_data_format": "json",
          "http_data_path": "data.users",
          "metricName": "用户列表"
        }
      ],
      "options": {}
    }
  ],
  "message": "已创建表格面板，通过 GraphQL 获取用户列表。"
}
```

---

## 7. 查看指定数据库表数据

用户说："查看 cmp_service 库的 db_performance_metrics 表数据"

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "",
      "title": "db_performance_metrics 表数据",
      "type": "table",
      "datasource_id": "ds-1",
      "targets": [
        {
          "refId": "A",
          "rawSql": "SELECT * FROM db_performance_metrics LIMIT 100",
          "metricName": "db_performance_metrics"
        }
      ],
      "options": {}
    }
  ],
  "message": "已新建表格面板展示 db_performance_metrics 表数据（前100行）。请点击右上角「保存仪表板」持久化。"
}
```

**规则**：
- 默认 `SELECT *` 加 `LIMIT 100`
- 用户指定条件时，用 `WHERE` 过滤
- 用户指定列时，用具体列名替代 `*`
- 图表类型默认用 `table`

---

## 8. 分析表结构并智能推荐报表方案

当用户要求为数据库表或 HTTP API 创建报表时，智能体通过 **`POST /api/v1/panels/inspect`** API 直接查询数据进行分析，**无需创建临时面板**。MySQL 和 HTTP API 数据源均遵循此流程。

### 8.1 分析流程（3 轮即可完成，适用于 MySQL 和 HTTP API）

```
用户要求为某表/某 API 创建报表
  ↓
【第1轮：说明计划】
智能体：我将分析目标数据源的结构，然后给出报表建议。步骤如下：
  1. 通过 API 获取数据结构（MySQL查information_schema / HTTP直接请求）
  2. 抽样10条数据分析字段特征
  3. 综合分析后给出报表推荐方案
请问可以开始吗？
  ↓ 用户确认
  ↓
【第2轮：查询结构和抽样数据 + 分析推荐】

--- MySQL 数据源 ---
智能体：调用 POST /api/v1/panels/inspect 查询表结构：
  {
    "datasource_id": "ds-1",
    "dashboard_id": "<从上下文获取>",
    "raw_sql": "SELECT COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT FROM information_schema.columns WHERE table_schema='cmp_service' AND table_name='XXX'"
  }
  → 获取字段列表

智能体：再调用 POST /api/v1/panels/inspect 抽样数据：
  {
    "datasource_id": "ds-1",
    "dashboard_id": "<从上下文获取>",
    "raw_sql": "SELECT * FROM XXX LIMIT 10"
  }
  → 获取10行真实数据

--- HTTP API 数据源 ---
智能体：调用 POST /api/v1/panels/inspect 获取 API 数据：
  {
    "datasource_id": "ds-http-1",
    "dashboard_id": "<从上下文获取>",
    "http_path": "/api/xxx",
    "http_method": "GET",
    "http_data_format": "json",
    "http_data_path": "data.results"
  }
  → 获取 API 返回的数据（columns + rows）

智能体：结合字段分类规则（见8.2）和图表选择规则（见8.3），输出推荐方案：
  "【报表推荐方案 - XXX】

  根据抽样数据分析：
  - node 字段（varchar，值为"南方机房"等）→ 分类字段，适合做饼图分组 / 柱状图X轴
  - current_value 字段（decimal，值为 85.2 等）→ 数值字段，适合做 Y 轴指标
  - metrics 字段（varchar）→ 分类字段，适合做区分维度

  建议创建以下报表：
    1. 各节点监控值对比（柱状图）- 展示各 node 的 current_value 对比
    2. 指标类型分布（饼图）- 展示各 metrics 类型的占比
    3. 监控数据明细（表格）- 展示全部字段数据

  请问是否按此方案创建？"
  ↓ 用户确认
  ↓
【第3轮：创建最终报表】
智能体：返回 update_draft，包含用户确认的所有报表面板
```

### 8.1.1 查询 API 说明

使用 `dashboard-data-query` skill 中定义的 **`POST /api/v1/panels/inspect`** 接口：

**MySQL 数据源**：
- 表结构查询：`raw_sql` = `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT FROM information_schema.columns WHERE table_schema='cmp_service' AND table_name='表名'`
- 抽样数据查询：`raw_sql` = `SELECT * FROM 表名 LIMIT 10`

**HTTP API 数据源**：
- 直接请求 API：设置 `http_path`、`http_method`、`http_data_format`、`http_data_path` 等字段
- 无需两次调用，一次请求即可获取样本数据进行分析
- API 返回 `columns` + `rows`，可直接分析字段特征

**共同规则**：
- **无需创建临时面板**，API 直接返回 `columns` + `rows` + `row_count`

### 8.1.2 规则

- **MySQL**：先查结构，再抽样10条，然后分析
- **HTTP API**：直接请求获取数据即可分析（API 返回的字段名和值已足够判断类型）
- **推荐方案必须先文字输出**：不要跳过分析直接创建报表
- 抽样数量统一为 **10 条**，数据量适中且足够分析

### 8.2 字段分类规则

| 字段特征 | 分类 | 适合的图表 |
|----------|------|-----------|
| 字段名含 `rate`/`ratio`/`percent`/`利用率`/`使用率` | 比率指标 | 折线图/柱状图/Gauge（数值0-100） |
| 字段名含 `count`/`total`/`qty`/`num`/`数`/`量` | 计数指标 | 柱状图/折线图 |
| 字段名含 `time`/`date`/`created_at`/`updated_at` | 时间字段 | 折线图X轴 |
| 字段名含 `value`/`peak`/`max`/`min`/`avg` | 数值指标 | 折线图/柱状图 |
| 字段名含 `category`/`type`/`node` | 分类字段 | 饼图分组/柱状图X轴 |

### 8.3 图表类型选择规则

| 数据特征 | 推荐图表类型 | 原因 |
|----------|-------------|------|
| 1个分类 + 1个数值 | `bar` | 分类对比一目了然 |
| 1个时间 + 1个数值 | `line` | 展示趋势变化 |
| 1个分类 + 1个数值（占比场景） | `pie` | 占比分布直观 |
| 只有1个核心数值 | `gauge` | 单指标直观展示 |
| 多列原始数据 | `table` | 查看明细数据 |

### 8.4 规则

1. **先查结构再动手**：通过 `information_schema.columns` 获取真实表结构
2. **分类字段优先作为X轴**
3. **数值字段作为Y轴**
4. **一个面板聚焦一个主题**
5. **多面板组合**：柱状图做对比 + 饼图看分布 + 表格看明细

---

## 9. 合并单元格（Cell Merge）

面板 `options` 中配置，仅对 `type: "table"` 生效：

| 字段 | 类型 | 说明 |
|------|------|------|
| `enableCellMerge` | `boolean` | 是否启用 |
| `mergeColumns` | `string` | 需要合并的列名，逗号分隔 |

**启用合并单元格**：
```json
{
  "action": "update_draft",
  "panels": [{ "id": "panel-xxx", "options": { "enableCellMerge": true, "mergeColumns": "node,category" } }],
  "message": "已为 node 和 category 列启用合并单元格。"
}
```

**关闭**：
```json
{ "action": "update_draft", "panels": [{ "id": "panel-xxx", "options": { "enableCellMerge": false } }], "message": "已关闭合并单元格。" }
```

---

## 10. 条件告警（Cell Alert）

面板 `options` 中配置，仅对 `type: "table"` 生效：

| 字段 | 类型 | 说明 |
|------|------|------|
| `enableCellAlert` | `boolean` | 是否启用 |
| `alertMode` | `"absolute"` \| `"percentage"` | 比较模式 |
| `cellAlerts` | `CellAlertRule[]` | 告警规则数组 |

`CellAlertRule`：`{ column, op, value, color }`

**设置条件告警**：
```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "panel-xxx",
      "options": {
        "enableCellAlert": true,
        "alertMode": "absolute",
        "cellAlerts": [
          { "column": "current_value", "op": ">", "value": 80, "color": "#ff4d4f" },
          { "column": "current_value", "op": ">", "value": 60, "color": "#faad14" }
        ]
      }
    }
  ],
  "message": "已为 current_value 列设置条件告警：>60 黄色，>80 红色。"
}
```

**注意**：规则按数组顺序评估，先写大阈值再写小阈值。

---

## 11. 启用/关闭列筛选（Column Filter）

面板 `options` 中配置，仅对 `type: "table"` 生效：

| 字段 | 类型 | 说明 |
|------|------|------|
| `enableColumnFilter` | `boolean` | 是否启用列筛选 |

**启用**：
```json
{ "action": "update_draft", "panels": [{ "id": "panel-xxx", "options": { "enableColumnFilter": true } }], "message": "已启用列筛选。" }
```

**关闭**：
```json
{ "action": "update_draft", "panels": [{ "id": "panel-xxx", "options": { "enableColumnFilter": false } }], "message": "已关闭列筛选。" }
```

**分页配置**：`{ "options": { "pageSize": 10 } }`

---

## 12. 字段显示配置（Column Display）

面板 `options` 中配置，仅对 `type: "table"` 生效：

| 字段 | 类型 | 说明 |
|------|------|------|
| `hiddenColumns` | `string[]` | 需要隐藏的列名数组 |
| `columnOrder` | `string[]` | 列显示顺序数组 |

**隐藏列**：
```json
{ "action": "update_draft", "panels": [{ "id": "panel-xxx", "options": { "hiddenColumns": ["id", "created_at"] } }], "message": "已隐藏 id 和 created_at 列。" }
```

**调整列顺序**：
```json
{ "action": "update_draft", "panels": [{ "id": "panel-xxx", "options": { "columnOrder": ["name", "email"] } }], "message": "已调整列顺序。" }
```

**恢复默认**：
```json
{ "action": "update_draft", "panels": [{ "id": "panel-xxx", "options": { "hiddenColumns": [], "columnOrder": [] } }], "message": "已恢复默认显示。" }
```

**规则**：使用原始列名，不使用 aliasMap 别名。

---

## 13. Data Links（数据链接）

为表格中的特定列配置可点击的链接。

### 配置字段

面板对象中：

| 字段 | 类型 | 说明 |
|------|------|------|
| `dataLinks` | `DataLinkDef[]` | 数据链接配置数组 |

`DataLinkDef` 结构：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `field` | `string` | **是** | 目标列名（原始列名） |
| `title` | `string` | 否 | 链接显示文本 |
| `url` | `string` | **是** | 跳转 URL，支持 `${字段名}` 变量替换 |
| `target` | `'_blank' \| '_self'` | 否 | 打开方式，默认 `_blank` |

### 场景示例

**为已有面板添加 Data Links**：
```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "panel-xxx",
      "dataLinks": [
        {
          "field": "server_name",
          "title": "查看详情",
          "url": "/d/db-server-detail?var-server=${server_name}",
          "target": "_blank"
        }
      ]
    }
  ],
  "message": "已为 server_name 列添加链接。"
}
```

**多列添加链接**：
```json
{ "id": "panel-xxx", "dataLinks": [
  { "field": "host", "url": "/d/db-host?var-host=${host}" },
  { "field": "service", "url": "/d/db-service?var-svc=${service}" }
]}
```

**清除 Data Links**：
```json
{ "action": "update_draft", "panels": [{ "id": "panel-xxx", "dataLinks": [] }], "message": "已清除所有数据链接。" }
```

**新建面板时配置 Data Links**：
```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "",
      "title": "服务器列表",
      "type": "table",
      "datasource_id": "ds-1",
      "targets": [{"refId": "A", "rawSql": "SELECT server_name, ip, status FROM servers LIMIT 50", "metricName": "服务器列表"}],
      "options": {},
      "dataLinks": [{"field": "server_name", "title": "查看详情", "url": "/d/db-server-detail?var-server=${server_name}", "target": "_blank"}]
    }
  ],
  "message": "已新建服务器列表表格，server_name 列可点击跳转。"
}
```

**规则**：
1. 只对表格生效
2. `field` 必须是原始列名，不使用 aliasMap 别名
3. URL 中的 `${field}` 会替换为当前行的字段值
4. 修改已有面板时只传 `dataLinks`，不要传 targets/options

---

## 14. 注意事项

1. **面板编辑无需调用 HTTP API**：只需从上下文获取面板信息，构造 JSON 返回
2. **所有面板信息从上下文获取**：前端会在每条消息中附带仪表盘 ID、标题、面板列表
3. **修改时保留面板其他字段**：只改用户要求改的字段，其他字段保持不变
4. **新增面板从已有面板复制字段**：参考上下文中的面板字段结构来构造新面板
5. **不支持删除**：告知用户去 UI 手动操作
