---
name: "dashboard-panel-editing"
description: "如何通过返回结构化 JSON 指令让前端自动修改仪表盘面板配置并立即刷新。支持增加/编辑/查询报表、查询仪表盘、查询面板数据、分析指标风险、查看指定数据库表数据、分析表结构智能推荐最佳报表方案并按照方案新建报表、为表格列配置 Data Links（可点击链接跳转到指定 URL）。不支持编辑仪表盘、删除仪表盘、删除报表。"
---

# Dashboard Panel Editing (仪表盘面板编辑对接指南)

本 skill 描述智能体如何根据用户对话，返回结构化 JSON 让前端**自动修改指定报表**并立即刷新图表。**智能体不需要调用任何 HTTP API，只需返回 JSON 指令，前端会自动处理。**

---

## ⚠️ 核心原则：用户确认优先（适用于所有数据源和所有操作）

**智能体在执行任何修改/创建操作前，都必须先和用户确定，得到用户许可后才能执行，不能跳过用户直接执行。**

这个原则适用于：
- **所有数据源类型**：HTTP API、MySQL 数据库等
- **所有操作类型**：创建报表、修改报表、优化报表、修复报表等
- **所有场景**：用户明确要求、用户模糊要求、智能体主动发现问题等

### 禁止行为（严禁）

- ❌ **跳过用户确认直接执行任何操作**
- ❌ **用户未回复就返回 update_draft 指令**
- ❌ **用户提出疑问时强行执行**
- ❌ **用户犹豫或沉默时自动执行**
- ❌ **用户拒绝后继续执行**
- ❌ **在任何数据源类型（HTTP、MySQL）下跳过用户确认**
- ❌ **修复面板时清空或丢失原有查询配置**（rawSql、http_path、http_data_path 等）

### 正确行为（必须遵守）

- ✅ **详细说明即将执行的操作内容**
- ✅ **清晰展示方案细节**（数据源、查询、图表类型、配置等）
- ✅ **等待用户明确回复**（不催促）
- ✅ **根据用户反馈调整方案**
- ✅ **得到用户明确许可后才返回 update_draft 指令**
- ✅ **适用于所有数据源类型（HTTP、MySQL）和所有操作**
- ✅ **修复面板时必须保留所有原有查询配置**（不能清空、不能丢失）

### 适用场景

| 操作类型 | 是否需要用户确认 | 说明 |
|---------|----------------|------|
| 创建新面板 | ✅ 必须确认 | 告知用户将创建什么面板、什么配置 |
| 修改现有面板 | ✅ 必须确认 | 告知用户将修改哪些字段、改成什么 |
| 优化报表 | ✅ 必须确认 | 告知用户将做哪些优化、预期效果 |
| 修复报表 | ✅ 必须确认 | 告知用户发现什么问题、如何修复 |
| 查询数据 | ❌ 无需确认 | 查询操作只是获取数据，不修改配置 |
| 分析风险 | ❌ 无需确认 | 分析操作只返回结果，不修改配置 |
| 查询仪表盘/面板信息 | ❌ 无需确认 | 只读操作，不修改任何配置 |
| 删除面板 | ❌ 不支持 | 系统不支持删除，需告知用户手动操作 |

### 确认流程三步骤

```
步骤1：向用户说明即将执行的操作
  ↓
步骤2：等待用户明确回复（同意、疑问、调整、拒绝）
  ↓
步骤3：根据用户回复决定下一步操作
  ├─ 同意 → 执行操作（返回 update_draft）
  ├─ 疑问 → 解释并等待再次确认
  ├─ 调整 → 调整方案并等待再次确认
  └─ 拒绝 → 取消操作，询问其他需求
```

### 示例：正确的确认流程

```
用户：帮我创建一个报表展示监控数据

智能体：好的，创建报表需要先确定数据源。让我先查看系统中可用的数据源...

（智能体调用数据源列表 API）

智能体：系统中目前有以下数据源可供选择：

| 数据源ID | 名称 | 类型 | 连接地址 |
|---------|------|------|----------|
| ds-http-1 | 监控API | HTTP | http://localhost:9999 |
| ds-1 | 网络指标数据库 | MySQL | 127.0.0.1:3306 |

请问您想使用哪个数据源？

用户：使用 ds-http-1

智能体：好的，已选择 HTTP 数据源 ds-http-1。请问：
1. API 路径是什么？
2. 您希望展示哪些数据？

用户：API 路径是 /api/host/cpu，我想看 CPU 使用率

智能体：明白了，我将创建以下面板：

面板：【CPU使用率】仪表盘
- 图表类型：gauge
- 数据源：ds-http-1（监控API）
- API路径：/api/host/cpu
- 展示内容：CPU 用户态使用率
- 阈值：<60 绿色、60-80 黄色、>80 红色

请问是否可以开始创建？

用户：好的，可以创建

智能体：收到确认，正在创建面板...（返回 update_draft 指令）
```

---

## ⚠️ 数据源确定方式

**新建报表时，数据源是必须首先确定的配置项。**

---

### 方式一：@数据源名 显式指定（最推荐 ✅）

用户在对话中使用 `@数据源名` 语法指定数据源。

**前端自动解析**：当用户在输入框中输入 `@` 时，前端自动下拉展示可用的数据源列表。用户选择后，`@数据源名称` 被插入输入框。**前端在发送消息时，自动将 `@` 引用的数据源信息注入到上下文中**，格式为：

```
【已解析数据源】[{"mention":"监控API","id":"ds-http-1","name":"监控API","type":"http","url":"http://localhost:9999"}]
```

**智能体处理逻辑（关键！）**：
- **直接从上下文中的 `【已解析数据源】` 读取数据源信息**（id、type、name 等）
- **⚠️ 不需要调用数据源列表 API！** 数据源已由前端解析完毕，直接使用即可
- 上下文中没有 `【已解析数据源】` 但用户消息中有 `@xxx` → 说明前端无法匹配该名称，告知用户"未找到数据源 xxx"

**示例**：
```
上下文：
【已解析数据源】[{"mention":"监控API","id":"ds-http-1","name":"监控API","type":"http","url":"http://localhost:9999"}]
【用户指令】创建 CPU 监控面板，使用 @监控API

智能体：好的，已解析数据源：监控API（ds-http-1，HTTP类型）。
请问：
1. API 路径是什么？
2. 您希望展示哪些指标？
```

---

### 方式二：列出数据源供选择（兜底方案）

如果用户没有指定数据源（消息中没有 `@`），则列出所有可用数据源供用户选择。

**触发条件**：
- 用户请求创建报表
- 上下文中的 `【已解析数据源】` 为空

**智能体行为**：
1. 调用数据源列表 API
2. 返回 `select_datasource` 指令，前端展示数据源选择器
3. 等待用户选择后继续

**注意**：用户选择后，前端会发送新消息（如"我选择数据源：ds-http-1"），此时智能体直接从数据源列表 API 结果中获取该数据源信息即可，无需再次调用 API。

---

### 数据源列表 API

**仅在方式二（无 @ 指定）时调用**：

```bash
curl -s http://127.0.0.1:3011/api/v1/datasources/list \
  -H 'Content-Type: application/json' \
  -d '{}'
```

**响应示例**：
```json
{
  "success": true,
  "data": [
    {
      "id": "ds-http-1",
      "name": "监控API",
      "type": "http",
      "url": "http://localhost:9999"
    }
  ]
}
```

---

### 完整判断流程图

```
用户要求创建报表
  ↓
【步骤1】检查上下文中的【已解析数据源】
  ├─ 有 → 直接使用已解析的数据源（id、type、name 已知）
  │       ⚠️ 不需要调用任何 API！直接进入后续流程
  └─ 无 → 进入步骤2
  ↓
【步骤2】调用数据源列表 API → 返回 select_datasource 指令
  ↓
前端展示选择器 → 等待用户选择
  ↓
用户选择后继续后续流程
```

---

### 最佳实践示例

**示例1：显式指定（最推荐）**
```
用户：创建 CPU 监控面板，使用 @监控API

（前端注入上下文：已解析数据源=[{"id":"ds-http-1","name":"监控API","type":"http",...}]）

智能体：好的，已识别数据源：监控API（ds-http-1，HTTP类型）。
请问：
1. API 路径是什么？
2. 您希望展示哪些指标？
```

**示例2：未指定数据源，列出选择**
```
用户：帮我创建一个报表

（上下文中无【已解析数据源】）

智能体：（调用数据源列表 API）创建报表需要先确定数据源。请从以下选择：
返回 select_datasource 指令 → 前端展示选择器 → 用户点击 ds-1

用户：我选择数据源：ds-1（网络指标数据库，类型：mysql）

智能体：好的，已选择 MySQL 数据源 ds-1。请问要查询哪些数据？
```

**示例3：多数据源混合**
```
用户：创建面板展示 CPU 使用率（用 @监控API）和订单表数据（用 @mysql-prod）

（前端注入上下文：[{"mention":"监控API","id":"ds-http-1",...}, {"mention":"mysql-prod","id":"ds-1",...}]）

智能体：（直接使用上下文中的数据源，不需要调用 API）
好的，将使用两个数据源：
1. @监控API（ds-http-1）用于 CPU 使用率
2. @mysql-prod（ds-1）用于订单表数据

将创建以下面板：
面板1：CPU 使用率（gauge，数据源：ds-http-1，路径：/api/host/cpu）
面板2：订单数据（table，数据源：ds-1，SQL：SELECT * FROM orders LIMIT 100）

请问是否开始创建？
```

---

### 禁止行为

- ❌ **用户已指定 @数据源名时，仍然调用数据源列表 API 去查找**（数据源已由前端解析，直接使用！）
- ❌ 用户未指定数据源时直接假设默认数据源
- ❌ 在没有数据源的情况下返回 update_draft 指令
- ❌ 忽略用户明确指定的 @数据源名

---

## 1. 架构

```
用户在仪表盘详情页的 AI 对话框输入指令
  ↓
前端自动附带仪表盘上下文（ID、标题、面板列表）→ WebSocket 发送给智能体
  ↓
智能体理解意图：
  ├─ 面板编辑 → 返回结构化 JSON（update_draft）→ 前端自动合并到草稿 → 图表刷新
  └─ 数据查询/风险分析 → 调用 POST /api/v1/dashboards/data → 分析数据 → 返回风险报告
```

**前端已自动附加上下文**，智能体收到的消息格式为：
```
当前仪表盘ID为db-xxx，标题为网络指标总览。把测试改为折线图
```


---

## 2. 能力范围

### 支持的操作

| 操作 | 说明 |
|------|------|
| 查询仪表盘 | 告诉用户当前仪表盘有哪些面板、什么配置 |
| 查询报表 | 告诉用户某个面板的详细信息（标题、类型、SQL、数据源等） |
| 编辑报表 | 修改面板的标题、图表类型、SQL查询、数据源等 |
| 增加报表 | 新增一个面板（标题、类型、SQL、数据源等） |
| 查询数据 | 通过后端 API 查询仪表盘面板的实际数据 |
| 风险分析 | 基于查询到的数据，分析指标是否存在风险（阈值超限、异常波动等） |

### 不支持的操作

| 操作 | 说明 |
|------|------|
| 编辑仪表盘 | 不能修改仪表盘标题、描述等元信息 |
| 删除仪表盘 | 不能删除整个仪表盘 |
| 删除报表 | 不能删除已有面板 |

如果用户请求不支持的的操作，礼貌地告知不支持，并建议用户在 UI 中手动操作。

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
          "category": "",
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
| `panels` | array | 是 | **仅变更的面板**（修改的+新增的），不包含未变更的面板 |
| `message` | string | 是 | 自然语言说明，告知用户具体改了什么 |

**面板对象字段**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | **修改时必填** | 面板唯一 ID，修改已有面板时填写原 ID |
| `title` | string | 是 | 面板标题 |
| `type` | string | 是 | 图表类型：`line` 折线图、`bar` 柱状图、`pie` 饼图、`gauge` 仪表盘、`table` 表格 |
| `gridPos` | object | 否 | 布局 `{x,y,w,h}`，不填时前端自动计算 |
| `datasource_id` | string | 否 | 数据源 ID |
| `targets` | array | 是 | 查询配置数组 |
| `options` | object | 否 | 额外选项，默认 `{}` |

**target 对象字段**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `refId` | string | 是 | 查询引用 ID：`A`, `B`, `C`... |
| `rawSql` | string | 否 | 自定义 SQL（优先于其他查询模式） |
| `aliasMap` | object | 否 | 列名 → 别名映射 |
| `category` | string | 否 | 指标分类（默认模式用） |
| `metricName` | string | 是 | 图例名称，折线图/柱状图的图例标签 |

### 3.2 查询操作 → 返回纯文本

```json
{
  "message": "当前仪表盘共有 4 个面板：交易日历（折线图）、测试（柱状图）、各机房占比（饼图）、测试预览（表格）。"
}
```

不需要 `action` 字段时，前端作为普通聊天消息展示。

### 3.3 查询数据与风险分析 → 调用后端 API

当用户询问某个面板的数据或指标风险时，调用后端 `POST /api/v1/panels/data` 接口，**只查询指定面板**的数据（而非整个仪表盘），减少不必要的数据传输。

#### 接口说明

**请求：**
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
| `dashboard_id` | string | **是** | 仪表盘 ID，从上下文获取。缺失则返回 400 错误 |
| `panel_id` | string | **是** | 面板 ID，从用户提到的面板名称对应上下文中找到。缺失则返回 400 错误 |
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
    "target": [
      [{"date": "2024-01-01", "market": "sha", "volume": 12345}, ...]
    ]
  }
}
```

`target` 是二维数组，第一维对应面板的每个 target（refId A/B/C），第二维是数据行。

#### 风险分析规则

拿到数据后，按以下规则分析风险：

| 风险等级 | 条件 | 说明 |
|----------|------|------|
| 高风险 | 数值列有值超过阈值 80% 或为 0 | 可能是异常峰值或服务中断 |
| 中风险 | 数值列波动超过 ±50%（与前一天/小时对比） | 指标波动较大 |
| 低风险 | 其他 | 正常范围 |

对面板的每个数值列进行检测，输出风险报告。

**回复格式**（纯文本，不需要 `action`）：
```
【指标风险分析报告 - 交易日历】

- volume: 正常（最大值 12,345，阈值安全）
- amount: 高风险（最新值 0，可能服务中断）

建议：重点关注 amount 指标，检查数据源是否正常。
```

如果用户问的是整个仪表盘的多个面板，**逐个面板调用接口**，汇总后给出报告。

---

## 4. 关键规则

1. **`panels` 只包含变更的面板**：修改了哪几个就返回哪几个，不要返回全部面板
2. **修改已有面板时必须带 `id`**：前端通过 `id` 匹配合并，id 来自上下文中面板列表
3. **新增面板时 `id` 留空或不填**：前端自动生成唯一 ID
4. **`action` 必须为 `"update_draft"`**：前端据此识别并更新草稿
5. **`message` 要有清晰的用户反馈**：告知具体改了什么，末尾提示「保存仪表板」
6. **`refId` 使用 `A`, `B`, `C`**：多查询场景按字母递增
7. **修改已有面板时只传需要改的字段**：前端合并逻辑是 `{ ...原面板, ...新面板 }`，只改 `options` 就不要传 `targets`，否则会覆盖掉原有的 SQL 查询和别名映射。只改 `type` 就不要改其他字段
8. **修改 SQL 时必须保留原有 `aliasMap` 和 `metricName`**：从上下文中读取面板当前的 `targets`，修改 `rawSql` 时把原 `aliasMap` 和 `metricName` 原封不动带回去。不要自作主张把 `SELECT a, b` 改成 `SELECT *`，也不要删除别名映射

---

## 5. 常见场景示例

### 场景 A：修改图表类型

用户说："把测试改为折线图"

智能体从上下文中知道"测试"面板的 id 和当前配置，返回：

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

从上下文获取 `panel-cal` 的当前配置，修改 `rawSql`：

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

### 场景 G：查询数据并分析风险

用户说："帮我看看各机房带宽使用率有没有异常"

**步骤：**

1. 从上下文匹配面板名称，找到对应的面板 ID（如 `panel-bw`）和仪表盘 ID（如 `db-2`）
2. 调用 API 查询该面板数据：
```bash
curl -s http://127.0.0.1:3011/api/v1/panels/data \
  -H 'Content-Type: application/json' \
  -d '{"dashboard_id":"db-2","panel_id":"panel-bw"}'
```
3. 从响应中提取 `target` 数据
4. 按风险分析规则检测每个数值列，输出报告：
```
【指标风险分析报告 - 各机房带宽使用率对比】

- 威新机房-带宽使用率: 高风险（92%，超过 80% 阈值）
- 南方机房-带宽使用率: 正常（45%）
- 北方机房-带宽使用率: 中风险（较昨日波动 +55%）

总结：威新机房带宽使用率过高，建议扩容；北方机房波动需关注。
```

### 场景 H：查询指定时间范围的数据

用户说："最近6小时交易日历的数据有什么异常吗"

**步骤：**

1. 从上下文匹配"交易日历"面板 ID（如 `panel-cal`）和仪表盘 ID
2. 计算时间范围：当前时间往前推 6 小时
3. 调用 API：
```bash
curl -s http://127.0.0.1:3011/api/v1/panels/data \
  -H 'Content-Type: application/json' \
  -d '{"dashboard_id":"db-2","panel_id":"panel-cal","from":"2026-06-08T08:00:00+08:00","to":"2026-06-08T14:00:00+08:00"}'
```
4. 分析数据并输出风险报告

---

## 6. 数据源 ID 参考

| 数据源 ID | 名称 |
|-----------|------|
| `ds-1` | 网络指标API |

---

## 7. 数据源类型说明

系统支持两种数据源类型：MySQL 和 HTTP API。

### 7.1 MySQL 数据源

MySQL 数据源用于查询数据库数据，通过 SQL 语句获取报表数据。

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

### 7.2 HTTP API 数据源

HTTP API 数据源用于从外部 API 获取数据，类似 Grafana 的 Infinity 插件。

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

**面板查询配置**（target 对象新增字段）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `http_path` | `string` | API路径（与数据源Base URL拼接成完整URL） |
| `http_method` | `string` | HTTP方法（`"GET"` / `"POST"` / `"PUT"` / `"DELETE"` / `"PATCH"`） |
| `http_body_type` | `string` | 请求体类型（`"raw"` / `"form-data"` / `"x-www-form-urlencoded"` / `"graphql"`），不填默认 `"raw"` |
| `http_body` | `string` | 请求体内容（`raw`/`graphql` 类型时使用，JSON 或 GraphQL 字符串） |
| `http_form_data` | `Array<{key:string,value:string}>` | 表单数据（`form-data`/`x-www-form-urlencoded` 类型时使用，key-value 数组） |
| `http_headers` | `object` | 自定义HTTP请求头（JSON对象，可覆盖数据源Headers） |
| `http_data_format` | `string` | 数据格式（`"json"` / `"xml"` / `"csv"`） |
| `http_data_path` | `string` | 数据提取路径（JSONPath，如 `"data.results"`） |

**Headers优先级规则**：
```
认证Headers（最高优先级） > 查询配置Headers（http_headers） > 数据源Headers（最低优先级）

示例：
数据源Headers: {"X-Api-Version": "v1"}
查询配置Headers: {"X-Api-Version": "v2", "X-Custom": "test"}
认证Headers: Authorization: Bearer xxx

最终请求Headers：
  Authorization: Bearer xxx（认证头，最高优先级）
  X-Api-Version: v2（查询配置覆盖数据源）
  X-Custom: test（查询配置新增）
```

**完整URL拼接规则**：
```
数据源 Base URL + target.http_path = 最终请求URL

示例：
数据源URL: https://api.weather.com
target.http_path: /v1/current?city=$city
最终URL: https://api.weather.com/v1/current?city=$city
```

**变量替换规则**：
- HTTP URL 中的变量**不添加引号**（与MySQL不同）
- `$__from` → `2024-01-01T00:00:00Z`（不带引号）
- `$city` → `北京`（直接替换值）
- 支持所有变量类型：用户变量、系统变量

### 7.3 HTTP API 查询示例

**场景 A：GET请求获取数据**

用户说："创建一个面板，从天气API获取当前天气数据"

假设已配置HTTP数据源（ID: `ds-http-1`，Base URL: `https://api.weather.com`，认证: Bearer Token）

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
  "message": "已创建表格面板展示天气API数据。请点击右上角「保存仪表板」持久化。"
}
```

**场景 B：POST请求提交数据**

用户说："从API获取用户统计数据，需要POST请求"

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

**场景 C：使用变量动态查询**

用户说："创建一个面板，根据城市变量查询天气"

假设仪表盘已有变量 `$city`（当前值为"上海"）

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
  "message": "已创建仪表盘面板，根据城市变量动态查询天气。变量 $city 会自动替换为当前选中的城市，$__from 替换为时间范围起始值。"
}
```

**实际请求示例**：
```
用户选择变量：city=深圳，时间范围：2024-01-01 ~ 2024-01-31

配置的URL：
https://api.weather.com/v1/weather?city=$city&from=$__from

实际请求：
https://api.weather.com/v1/weather?city=深圳&from=2024-01-01T00:00:00Z

（变量已替换为真实值，不带引号）
```

**场景 D：Form Data POST 请求**

用户说："创建一个面板，用 form-data 方式提交表单获取数据"

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

**场景 E：x-www-form-urlencoded POST 请求**

```json
{
  "targets": [
    {
      "refId": "A",
      "http_path": "/api/login",
      "http_method": "POST",
      "http_body_type": "x-www-form-urlencoded",
      "http_form_data": [
        {"key": "username", "value": "admin"},
        {"key": "password", "value": "secret"}
      ],
      "http_data_format": "json",
      "metricName": "登录结果"
    }
  ]
}
```

**场景 F：GraphQL 请求**

```json
{
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
  ]
}
```

### 7.4 请求体类型说明

| body_type | 说明 | 使用字段 | 自动设置 Content-Type |
|-----------|------|----------|----------------------|
| `raw`（默认） | 原始请求体 | `http_body` | `application/json` |
| `form-data` | multipart 表单 | `http_form_data` | `multipart/form-data` |
| `x-www-form-urlencoded` | URL编码表单 | `http_form_data` | `application/x-www-form-urlencoded` |
| `graphql` | GraphQL 查询 | `http_body`（GraphQL 字符串） | `application/json`（自动包装为 `{"query": "..."}`） |

### 7.5 Query Inspector（HTTP 请求调试）

Query Inspector 面板支持查看 HTTP 请求的详细信息，方便调试。展开后显示：

1. **cURL 命令**：等效的 curl 命令，可直接复制到终端执行
2. **请求详情**：Method、URL、Body Type
3. **Headers**：表格形式展示所有请求头（含数据源 Headers + 查询 Headers + 认证 Headers）
4. **请求体**：raw/graphql 类型显示 Body 内容
5. **Form Data**：form-data/x-www-form-urlencoded 类型显示字段列表

**Query Inspector 请求体**：
```json
{
  "datasource_id": "ds-http-1",
  "dashboard_id": "db-1",
  "http_path": "/api/v1/data",
  "http_method": "POST",
  "http_body_type": "form-data",
  "http_form_data": [
    {"key": "type", "value": "daily"}
  ],
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

### 7.6 数据解析说明

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
- 用户可通过 `options.columnOrder` 自定义列显示顺序
- 用户可通过 `options.hiddenColumns` 隐藏特定列

### 7.7 HTTP vs MySQL 对比

| 特性 | MySQL 数据源 | HTTP API 数据源 |
|------|-------------|----------------|
| 查询方式 | SQL语句 | HTTP请求 |
| 查询字段 | `rawSql` | `http_path` + `http_method` 等 |
| 变量替换 | 添加引号（SQL语法） | 不添加引号（URL参数） |
| 认证配置 | 数据库连接配置 | HTTP认证头（Bearer/API Key） |
| 数据格式 | 数据库表结构 | JSON/XML/CSV解析 |
| 适用场景 | 内部数据库查询 | 外部API集成、第三方数据 |

### 7.8 智能体判断数据源类型的规则

1. **优先检查 target 中的查询字段**：
    - 有 `rawSql` → MySQL 数据源
    - 有 `http_path` → HTTP API 数据源

2. **从上下文获取数据源信息**：
    - 前端会在消息中附带仪表盘的面板列表
    - 每个面板的 `datasource_id` 可查询数据源类型

3. **修改已有面板时保持数据源类型一致**：
    - MySQL 面板 → 只修改 `rawSql`，不要添加 `http_path`
    - HTTP 面板 → 只修改 `http_path`，不要添加 `rawSql`

4. **创建新面板时选择合适的数据源**：
    - 用户明确说"调用API" → HTTP 数据源
    - 用户说"查询数据库/表" → MySQL 数据源
    - 默认使用仪表盘中已有面板的数据源类型

---

## 8. 注意事项

1. **面板编辑无需调用 HTTP API**：只需从上下文获取面板信息，构造 JSON 返回
2. **查询数据需调用 API**：当用户询问"有没有异常"、"分析风险"、"查看数据"时，调用 `POST /api/v1/panels/data` 获取指定面板数据后再分析。多个面板时逐个调用。
3. **所有面板信息从上下文获取**：前端会在每条消息中附带仪表盘 ID、标题、面板列表
4. **修改时保留面板其他字段**：只改用户要求改的字段，其他字段保持不变
5. **新增面板从已有面板复制字段**：参考上下文中的面板字段结构来构造新面板
6. **不支持删除**：告知用户去 UI 手动操作
7. **时间范围**：用户提到"最近N小时/天"时，计算对应的 RFC3339 时间戳传入 API；不提供时间则查全部数据
8. **变量功能**：仪表盘支持变量（类似 Grafana），SQL 中可使用 `$varname` 或 `${varname}` 引用变量值

---

## 9. 仪表盘变量功能

### 9.1 变量概述

仪表盘变量（Dashboard Variables）是 Grafana 风格的模板变量功能，允许用户创建动态仪表盘。变量显示在仪表盘顶部的下拉选择器中，用户可以通过选择不同的变量值来动态改变面板的查询结果。

### 8.2 变量类型

| 类型 | 说明 |
|------|------|
| `custom` | 自定义列表，手动定义选项值（逗号分隔） |
| `query` | 查询生成，通过 SQL 查询动态获取选项值 |
| `textbox` | 文本框，用户自由输入值 |
| `constant` | 常量，隐藏的固定值 |
| `datasource` | 数据源选择，切换面板的数据源 |
| `interval` | 时间间隔，用于时间分组 |

### 8.3 变量语法

在 SQL 查询中使用变量：

```sql
-- 基本语法
SELECT * FROM servers WHERE name = '$server'
SELECT * FROM servers WHERE name = '${server}'

-- 多选场景（变量开启多选）
SELECT * FROM servers WHERE name IN ($server)
-- 替换后：SELECT * FROM servers WHERE name IN ('server1','server2','server3')

-- 全选场景（变量开启"全部"选项）
SELECT * FROM servers WHERE name IN ($server)
-- 替换后：SELECT * FROM servers WHERE name IN ('server1','server2',...) 或使用 AllValue
```

### 8.4 变量 API

| 接口 | 说明 |
|------|------|
| `POST /api/v1/variables/list` | 获取仪表盘的变量列表 |
| `POST /api/v1/variables/get` | 获取单个变量详情 |
| `POST /api/v1/variables/create` | 创建变量 |
| `POST /api/v1/variables/update` | 更新变量 |
| `POST /api/v1/variables/delete` | 删除变量 |
| `POST /api/v1/variables/values` | 获取变量的可选值（query 类型动态查询） |

### 8.5 变量结构

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
    current: { text: string; value: string | string[] }  // 当前选中值
    multi: boolean                  // 是否多选
    include_all: boolean            // 是否包含"全部"选项
    all_value: string               // "全部"选项的值（默认 *）
    sort_order: number              // 排序序号
}

interface VariableOption {
    text: string                    // 显示文本
    value: string                   // 实际值
    selected?: boolean              // 是否选中
}
```

### 8.6 使用示例

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
      {"text": "上海", "value": "shanghai"},
      {"text": "深圳", "value": "shenzhen"}
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

**在 SQL 中使用变量**：
```sql
-- 面板的 rawSql
SELECT date, market, weekday FROM calendar WHERE market = '$market' LIMIT 100

-- 多选时
SELECT date, market, weekday FROM calendar WHERE market IN ($market) LIMIT 100
```

### 8.7 变量管理 UI

用户可以在仪表盘编辑页面的"变量"标签页中管理变量：
- 添加新变量
- 编辑已有变量
- 删除变量
- 调整变量顺序

变量选择器显示在仪表盘顶部，用户可以通过下拉框选择变量值，选择后所有引用该变量的面板会自动刷新数据。

---

## 9. 文件上传 API

### 9.1 接口说明

提供文件上传功能，支持客户端向服务器上传附件文件。

### 9.2 文件上传

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

### 9.3 文件保存位置

文件保存在后端运行目录下的 `./client_files/` 文件夹中。

```bash
# 示例：使用 curl 上传文件
curl -X POST http://127.0.0.1:3011/api/v1/file/upload \
  -F "file=@/path/to/document.pdf"
```

### 9.4 AI 对话框附件功能

AI 对话框中支持文件上传功能：

1. 输入框左侧有 📎 按钮，点击可选择文件
2. 支持多文件选择和批量上传
3. 上传后的文件显示为标签，可点击 × 移除
4. 发送消息时，已上传的文件路径会作为 `files` 字段一起发送给 WebSocket：
```json
{
  "type": "chat",
  "message": "请分析这个文件...",
  "files": ["/path/to/client_files/doc1.pdf", "/path/to/client_files/doc2.txt"]
}
```

---

## 10. 查看指定数据库表数据

当用户指定了数据库和表名，需要查看表中的数据时，使用 `update_draft` 指令新建或修改一个面板，将 `rawSql` 设为目标查询。

### 10.1 流程

1. 从上下文获取当前仪表盘 ID（`dashboard_id`）和数据源 ID（`datasource_id`）
2. 构造 `rawSql`：`SELECT * FROM <表名> LIMIT <N>`（默认 LIMIT 100）
3. 如果用户指定了数据库（如 `cmp_service.net_work_metrics`），直接使用完整表名
4. 返回 `update_draft` 指令，前端自动执行 SQL 并刷新图表

### 10.2 场景：用户告知数据库和表名，要求查看数据

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

### 10.3 场景：带条件的表查询

用户说："查看 net_work_metrics 表中 node 为'交易互联网线路'的数据"

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "",
      "title": "交易互联网线路数据",
      "type": "table",
      "datasource_id": "ds-1",
      "targets": [
        {
          "refId": "A",
          "rawSql": "SELECT * FROM net_work_metrics WHERE node = '交易互联网线路' LIMIT 50",
          "metricName": "交易互联网线路"
        }
      ],
      "options": {}
    }
  ],
  "message": "已新建表格面板展示交易互联网线路数据。请点击右上角「保存仪表板」持久化。"
}
```

### 10.4 场景：只查指定列

用户说："只看 net_work_metrics 表的 node, metrics, current_value 三个字段"

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "",
      "title": "网络指标概览",
      "type": "table",
      "datasource_id": "ds-1",
      "targets": [
        {
          "refId": "A",
          "rawSql": "SELECT node, metrics, current_value FROM net_work_metrics LIMIT 100",
          "metricName": "网络指标概览"
        }
      ],
      "options": {}
    }
  ],
  "message": "已新建表格展示 node, metrics, current_value 三个字段。请点击右上角「保存仪表板」持久化。"
}
```

### 10.5 规则

- 默认 `SELECT *` 加 `LIMIT 100`，避免一次性返回过多数据
- 用户指定条件时，用 `WHERE` 过滤
- 用户指定列时，用具体列名替代 `*`
- 图表类型默认用 `table`（表格），方便查看原始数据
- 数据库名 `cmp_service` 直接连接，表名无需加库名前缀

---

## 11. 分析表结构并智能推荐报表方案

当用户不知道如何为数据表创建合适的报表时，智能体需要完成以下步骤：

1. **查询表结构**：通过 SQL 获取表字段信息
2. **抽样数据**：获取少量样本数据进行分析
3. **分析字段特征**：识别字段类型、含义、分布
4. **推荐报表方案**：基于字段特征推荐最合适的图表类型和查询
5. **自动创建面板**：返回 `update_draft` 指令创建优化后的面板

### 11.1 分析流程

```
用户说"帮我为 db_performance_metrics 表创建合适的报表"
  ↓
① 查询表结构：SELECT COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT FROM information_schema.columns WHERE table_schema='cmp_service' AND table_name='表名'
  ↓
② 抽样数据：SELECT * FROM 表名 LIMIT 5
  ↓
③ 分析字段 → 识别分类字段、数值字段、时间字段
  ↓
④ 推荐报表方案 → 选图表类型 + 构造 SQL
  ↓
⑤ 返回 update_draft 指令 → 前端自动创建面板
```

### 11.2 字段分类规则

| 字段特征 | 分类 | 适合的图表 |
|----------|------|-----------|
| 字段名含 `id` 后缀 | 标识列 | 不放图表中，或放表格首列 |
| 字段名含 `name`/`title`/`label` | 名称/标签列 | 饼图扇区标签、柱状图X轴 |
| 字段名含 `rate`/`ratio`/`percent`/`利用率`/`使用率` | 比率指标 | 折线图/柱状图/Gauge（数值0-100） |
| 字段名含 `count`/`total`/`qty`/`num`/`数`/`量` | 计数指标 | 柱状图/折线图 |
| 字段名含 `time`/`date`/`created_at`/`updated_at` | 时间字段 | 折线图X轴 |
| 字段名含 `value`/`peak`/`max`/`min`/`avg` | 数值指标 | 折线图/柱状图 |
| 字段名含 `change`/`wow`/`dod` | 变化率 | 折线图（正负值用颜色区分） |
| 字段名含 `category`/`type`/`node`/`db_type` | 分类字段 | 饼图分组/柱状图X轴 |
| 字段类型为 `varchar`/`text` | 文本字段 | 表格列（不作为数值轴） |
| 字段类型为 `int`/`decimal`/`float` | 数值字段 | 折线图Y轴/柱状图Y轴 |

### 11.3 图表类型选择规则

| 数据特征 | 推荐图表类型 | 原因 |
|----------|-------------|------|
| 1个分类 + 1个数值 | `bar`（柱状图） | 分类对比一目了然 |
| 1个时间 + 1个数值 | `line`（折线图） | 展示趋势变化 |
| 1个分类 + 1个数值（占比场景） | `pie`（饼图） | 占比分布直观 |
| 只有1个核心数值 | `gauge`（仪表盘） | 单指标直观展示 |
| 多列原始数据 | `table`（表格） | 查看明细数据 |
| 多个数值指标 + 分类 | `bar`（柱状图多target） | 多指标对比 |
| 变化率数据（正负值） | `line`（折线图） | 趋势波动展示 |

### 11.4 完整场景示例：分析表结构并创建报表

用户说："帮我为 db_performance_metrics 表创建合适的报表来展示数据"

**步骤 1：查询表结构**

```bash
curl -s http://127.0.0.1:3011/api/v1/dashboards/data \
  -H 'Content-Type: application/json' \
  -d '{
    "dashboard_id": "db-1",
    "dashboard_json": {
      "panels": [{
        "id": "tmp",
        "targets": [{
          "refId": "A",
          "rawSql": "SELECT COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT FROM information_schema.columns WHERE table_schema='\''cmp_service'\'' AND table_name='\''db_performance_metrics'\'' ORDER BY ordinal_position"
        }]
      }]
    }
  }'
```

或者直接创建表格面板展示表结构：
```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "",
      "title": "db_performance_metrics 表结构",
      "type": "table",
      "datasource_id": "ds-1",
      "targets": [
        {
          "refId": "A",
          "rawSql": "SELECT COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT FROM information_schema.columns WHERE table_schema='cmp_service' AND table_name='db_performance_metrics' ORDER BY ordinal_position",
          "metricName": "表结构"
        }
      ],
      "options": {}
    }
  ],
  "message": "已新建表格查看 db_performance_metrics 表结构。"
}
```

**步骤 2-5：分析字段后创建最优报表**

假设分析 db_performance_metrics 表字段：
- `db_type`: 分类字段（mysql/redis） → 饼图分组
- `db_name`: 实例名称 → X轴标签
- `metric_name`: 指标名称 → 分类标签
- `metric_value`: 当前值 → 数值轴
- `unit`: 单位（次/秒、%、GB等）→ 辅助信息
- `historical_peak`: 历史峰值 → 数值轴对比
- `wow_change`/`dod_change`: 变化率 → 辅助趋势

推荐报表方案并返回 `update_draft`：

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "",
      "title": "MySQL 实例核心指标对比",
      "type": "bar",
      "datasource_id": "ds-1",
      "targets": [
        {
          "refId": "A",
          "rawSql": "SELECT db_name, metric_name, CAST(metric_value AS DECIMAL(10,2)) as value FROM db_performance_metrics WHERE db_type='mysql' AND metric_name IN ('QPS','TPS') ORDER BY db_name",
          "metricName": "QPS_TPS"
        }
      ],
      "options": {}
    },
    {
      "id": "",
      "title": "MySQL CPU & 内存使用率",
      "type": "bar",
      "datasource_id": "ds-1",
      "targets": [
        {
          "refId": "A",
          "rawSql": "SELECT db_name, metric_name, CAST(metric_value AS DECIMAL(10,2)) as value FROM db_performance_metrics WHERE db_type='mysql' AND metric_name IN ('CPU使用率','内存使用率')",
          "metricName": "CPU_内存"
        }
      ],
      "options": {}
    },
    {
      "id": "",
      "title": "Redis 实例内存使用分布",
      "type": "pie",
      "datasource_id": "ds-1",
      "targets": [
        {
          "refId": "A",
          "rawSql": "SELECT db_name, CAST(metric_value AS DECIMAL(10,2)) as value FROM db_performance_metrics WHERE db_type='redis' AND metric_name='内存使用百分比'",
          "metricName": "Redis内存"
        }
      ],
      "options": {}
    },
    {
      "id": "",
      "title": "数据库核心指标总览",
      "type": "table",
      "datasource_id": "ds-1",
      "targets": [
        {
          "refId": "A",
          "rawSql": "SELECT db_type, db_name, metric_name, metric_value, unit, historical_peak, wow_change, dod_change FROM db_performance_metrics ORDER BY db_type, db_name",
          "metricName": "总览"
        }
      ],
      "options": {}
    }
  ],
  "message": "已为 db_performance_metrics 表创建 4 个面板：\n1. 【MySQL 实例核心指标对比】柱状图 - QPS/TPS 对比\n2. 【MySQL CPU & 内存使用率】柱状图 - 资源使用率\n3. 【Redis 实例内存使用分布】饼图 - 内存分布\n4. 【数据库核心指标总览】表格 - 详细数据\n请点击右上角「保存仪表板」持久化。"
}
```

### 11.5 网路指标表分析示例

用户说："net_work_metrics 表适合用什么图表展示"

**字段分析**：
- `node`：设备/线路类型（分类字段）→ X轴/饼图分组
- `category`：指标分类（资源使用率/请求量）→ 筛选条件
- `metrics`：指标名称（威新机房-cpu利用率等）→ X轴标签
- `unit`：单位（%、Mbps、次/秒等）→ 辅助
- `current_value`：当前值 → 主数值
- `historical_peak`：历史峰值 → 对比基准
- `wow_change`/`dod_change`：周同比/日环比 → 波动趋势

**推荐方案**：

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "",
      "title": "各设备CPU使用率对比",
      "type": "bar",
      "datasource_id": "ds-1",
      "targets": [
        {
          "refId": "A",
          "rawSql": "SELECT node, metrics, CAST(current_value AS DECIMAL(10,2)) as value FROM net_work_metrics WHERE metrics LIKE '%-cpu利用率' ORDER BY node, metrics",
          "metricName": "CPU使用率"
        }
      ],
      "options": {}
    },
    {
      "id": "",
      "title": "设备类型指标分布",
      "type": "pie",
      "datasource_id": "ds-1",
      "targets": [
        {
          "refId": "A",
          "rawSql": "SELECT node, COUNT(*) as cnt FROM net_work_metrics GROUP BY node",
          "metricName": "设备分布"
        }
      ],
      "options": {}
    }
  ],
  "message": "已创建 2 个面板展示 net_work_metrics 表数据。建议还可按 node 创建下拉变量，实现按设备类型筛选。请点击右上角「保存仪表板」持久化。"
}
```

### 11.6 智能推荐规则总结

1. **先查结构再动手**：不要猜测字段含义，通过 `information_schema.columns` 获取真实表结构
2. **分类字段优先作为X轴**：`node`、`db_type`、`db_name` 等分类字段放在 X 轴或饼图分组
3. **数值字段作为Y轴**：`metric_value`、`current_value`、`historical_peak` 等作为数值展示
4. **一个面板聚焦一个主题**：不要把 MySQL 和 Redis 指标混在一个图表里，应分开创建
5. **多面板组合**：柱状图做对比 + 饼图看分布 + 表格看明细 = 完整的数据展示方案
6. **message 中解释推荐理由**：告诉用户为什么这样选择图表类型

---

## 12. 合并单元格（Cell Merge）

表格类型面板支持合并相同值的相邻单元格，类似 Excel 的合并功能。

### 12.1 配置字段

面板 `options` 中：

| 字段 | 类型 | 说明 |
|------|------|------|
| `enableCellMerge` | `boolean` | 是否启用合并单元格 |
| `mergeColumns` | `string` | 需要合并的列名，逗号分隔，如 `"node,category"` |

### 12.2 合并规则

- 仅对 `type: "table"` 的面板生效
- 在当前页数据上合并（不会跨分页边界）
- 层级合并：后面列的合并范围受前面列合并范围限制
- **列名兼容 aliasMap**：如果面板有 `aliasMap`（如 `{"node": "设备类型"}`），`mergeColumns` 传原始列名 `"node"` 或别名 `"设备类型"` 均可匹配。推荐传**原始列名**（aliasMap 的 key），更稳定

### 12.3 场景：为已有面板启用合并单元格（✅ 正确）

用户说："把 node 和 category 两列合并相同的值"

**只传 id 和需要修改的 options，不要传 targets/title/type 等字段（会覆盖原有配置）**

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "panel-xxx",
      "options": {
        "enableCellMerge": true,
        "mergeColumns": "node,category"
      }
    }
  ],
  "message": "已为 node 和 category 列启用合并单元格。请点击右上角「保存仪表板」持久化。"
}
```

### 12.4 场景：关闭合并单元格

```json
{
  "action": "update_draft",
  "panels": [{ "id": "panel-xxx", "options": { "enableCellMerge": false } }],
  "message": "已关闭合并单元格。"
}
```

---

## 13. 条件告警（Cell Alert）

为表格中的数值单元格设置告警规则，满足条件时高亮显示。

### 13.1 配置字段

面板 `options` 中：

| 字段 | 类型 | 说明 |
|------|------|------|
| `enableCellAlert` | `boolean` | 是否启用条件告警 |
| `alertMode` | `"absolute"` \| `"percentage"` | 比较模式：绝对值或百分比 |
| `cellAlerts` | `CellAlertRule[]` | 告警规则数组 |

`CellAlertRule` 结构：

| 字段 | 类型 | 说明 |
|------|------|------|
| `column` | `string` | 目标列名 |
| `op` | `">"` \| `">="` \| `"<"` \| `"<="` \| `"="` \| `"!="` | 比较操作符 |
| `value` | `number` | 阈值 |
| `color` | `string` | 匹配时的 hex 颜色，如 `"#ff4d4f"` |

### 13.2 比较模式

- **absolute**：单元格数值直接与阈值比较。如 CPU > 80 → 红色
- **percentage**：单元格值转换为占该列最大值的百分比后再比较。如列最大值为 200，单元格值为 100，则以 50 比较

### 13.3 场景：为已有面板设置条件告警（✅ 正确）

用户说："current_value 超过 60 显示黄色，超过 80 显示红色"

**只传 id 和 options，不传 targets**

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

**注意**：规则按数组顺序评估，后面覆盖前面。先写大阈值（>80 红色）再写小阈值（>60 黄色），保证 90 匹配红色而非黄色。

### 13.4 场景：关闭条件告警

```json
{
  "action": "update_draft",
  "panels": [{ "id": "panel-xxx", "options": { "enableCellAlert": false } }],
  "message": "已关闭条件告警。"
}
```

---

## 14. 启用/关闭列筛选（Column Filter）

表格每列表头旁显示筛选漏斗按钮，点击可按该列值过滤行。

### 14.1 配置字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `enableColumnFilter` | `boolean` | 是否启用列筛选 |

### 14.2 筛选功能

- 仅 `type: "table"` 生效
- 操作符：`=` / `!=` / `>` / `>=` / `<` / `<=` / `contains`
- 多列同时筛选取交集
- 筛选结果自动传递到排序和分页

### 14.3 场景：为已有面板启用列筛选（✅ 正确）

用户说："给表格加上列筛选功能"

**只传 id 和 options**

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "panel-xxx",
      "options": { "enableColumnFilter": true }
    }
  ],
  "message": "已启用列筛选。表头各列旁会出现筛选按钮。"
}
```

### 14.4 场景：关闭列筛选

```json
{
  "action": "update_draft",
  "panels": [{ "id": "panel-xxx", "options": { "enableColumnFilter": false } }],
  "message": "已关闭列筛选。"
}
```

### 14.5 分页配置

默认每页 **5 条**，在 `options.pageSize` 中配置（范围 1-500）：

```json
{ "options": { "pageSize": 10 } }
```

---

## 15. 字段显示配置（Column Display）

表格支持配置字段的显示/隐藏和显示顺序，类似Excel的列管理功能。

### 15.1 配置字段

面板 `options` 中：

| 字段 | 类型 | 说明 |
|------|------|------|
| `hiddenColumns` | `string[]` | 需要隐藏的列名数组，默认 `[]`（全显示） |
| `columnOrder` | `string[]` | 列显示顺序数组，未配置则使用默认顺序 |

### 15.2 显示/隐藏规则

- **默认行为**：所有列都显示（`hiddenColumns: []`）
- **隐藏列**：将列名加入 `hiddenColumns` 数组即可隐藏
- **显示列**：从 `hiddenColumns` 数组中移除列名即可显示
- **配置生效范围**：仅对 `type: "table"` 的面板生效

### 15.3 列显示顺序规则

- **默认顺序**：MySQL数据源按SQL返回顺序，HTTP API数据源按字母顺序
- **自定义顺序**：通过 `columnOrder` 数组指定列的显示顺序
- **未指定列**：不在 `columnOrder` 中的列会排在后面（保持默认顺序）
- **优先级**：`columnOrder` > 默认顺序

### 15.4 场景：隐藏特定列（✅ 正确）

用户说："隐藏 id 和 created_at 两列"

**只传 id 和 options，不传 targets**

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "panel-xxx",
      "options": {
        "hiddenColumns": ["id", "created_at"]
      }
    }
  ],
  "message": "已隐藏 id 和 created_at 两列。其他列正常显示。"
}
```

### 15.5 场景：自定义列显示顺序

用户说："把 name 列放在最前面，然后是 email，其他列按原顺序"

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "panel-xxx",
      "options": {
        "columnOrder": ["name", "email"]
      }
    }
  ],
  "message": "已调整列顺序：name、email在最前面，其他列保持原顺序排在后面。"
}
```

**实际显示效果**：
```
假设表格原有列：id, name, email, phone, created_at

配置 columnOrder: ["name", "email"]

最终显示顺序：
name, email, id, phone, created_at
（前两列按配置顺序，后三列保持默认顺序）
```

### 15.6 场景：同时配置显示和顺序

用户说："隐藏 id 列，并把 name、email 放在最前面"

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "panel-xxx",
      "options": {
        "hiddenColumns": ["id"],
        "columnOrder": ["name", "email"]
      }
    }
  ],
  "message": "已隐藏 id 列，并将 name、email 放在最前面显示。"
}
```

### 15.7 场景：恢复默认显示（显示所有列）

用户说："恢复显示所有列"

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "panel-xxx",
      "options": {
        "hiddenColumns": [],
        "columnOrder": []
      }
    }
  ],
  "message": "已恢复默认显示，所有列都可见，按默认顺序排列。"
}
```

### 15.8 场景：新建表格时配置字段显示

用户说："创建用户列表表格，只显示 name、email、phone 三列"

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "",
      "title": "用户列表",
      "type": "table",
      "datasource_id": "ds-1",
      "targets": [
        {
          "refId": "A",
          "rawSql": "SELECT id, name, email, phone, created_at FROM users LIMIT 50",
          "metricName": "用户列表"
        }
      ],
      "options": {
        "hiddenColumns": ["id", "created_at"],
        "columnOrder": ["name", "email", "phone"]
      }
    }
  ],
  "message": "已创建用户列表表格，只显示 name、email、phone 三列，按此顺序排列。"
}
```

### 15.9 HTTP API 数据源的列顺序说明

HTTP API 返回的数据列名默认按字母顺序排序（保证稳定性），用户可通过 `columnOrder` 自定义：

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "panel-xxx",
      "options": {
        "columnOrder": ["user_id", "user_name", "email", "status"]
      }
    }
  ],
  "message": "已调整HTTP API数据源的列显示顺序。"
}
```

**示例**：
```
API返回列（字母顺序）：email, status, user_id, user_name

配置 columnOrder: ["user_id", "user_name", "email", "status"]

最终显示顺序：
user_id, user_name, email, status
（按用户指定的顺序显示）
```

### 15.10 列名兼容 aliasMap

如果面板有 `aliasMap`（如 `{"user_name": "用户名"}`），配置时使用**原始列名**：

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "panel-xxx",
      "options": {
        "hiddenColumns": ["user_name"],  // 使用原始列名，不是别名"用户名"
        "columnOrder": ["user_id", "user_name"]
      }
    }
  ],
  "message": "已配置字段显示。"
}
```

### 15.11 规则总结

1. **只对表格生效**：`type: "table"` 的面板才支持字段显示配置
2. **默认全显示**：`hiddenColumns: []` 表示所有列都显示
3. **使用原始列名**：配置时使用 SQL 返回的原始列名，不使用 aliasMap 别名
4. **修改时只传 options**：不要传 targets、title 等其他字段，避免覆盖原配置
5. **columnOrder 优先级高**：指定顺序的列排在前面，未指定的保持默认顺序
6. **可同时配置显示和顺序**：`hiddenColumns` 和 `columnOrder` 可同时使用
7. **清空数组恢复默认**：`hiddenColumns: []` + `columnOrder: []` 恢复默认显示

---

## 16. Data Links（数据链接）

为表格中的特定列配置可点击的链接，点击后跳转到指定 URL。类似 Grafana 的 Data Links 功能。

### 16.1 配置字段

面板对象中：

| 字段 | 类型 | 说明 |
|------|------|------|
| `dataLinks` | `DataLinkDef[]` | 数据链接配置数组 |

`DataLinkDef` 结构：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `field` | `string` | **是** | 目标列名（原始列名，不含 aliasMap 别名） |
| `title` | `string` | 否 | 链接显示文本。不填则使用单元格值作为链接文本 |
| `url` | `string` | **是** | 跳转 URL，支持变量替换 |
| `target` | `'_blank' \| '_self'` | 否 | 打开方式。默认 `_blank`（新标签页） |

### 16.2 URL 变量替换

URL 中可使用 `${字段名}` 引用当前行的字段值，实现动态链接。

示例：
- `url: "/d/db-123?var-server=${server_name}"` → 点击跳转到指定仪表盘并传递变量
- `url: "https://grafana.example.com/d/abc?var-host=${host}"` → 跳转到外部 Grafana
- `url: "/report/${report_key}"` → 跳转到日报详情页

### 16.3 场景：为已有面板添加 Data Links（✅ 正确）

用户说："给 server_name 列加上链接，点击跳转到该服务器的详情仪表盘"

**只传 id 和 dataLinks，不传 targets/options**

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
  "message": "已为 server_name 列添加链接，点击跳转到服务器详情仪表盘。"
}
```

### 16.4 场景：多列添加链接

用户说："host 和 service 两列都加上链接"

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "panel-xxx",
      "dataLinks": [
        { "field": "host", "url": "/d/db-host?var-host=${host}" },
        { "field": "service", "url": "/d/db-service?var-svc=${service}" }
      ]
    }
  ],
  "message": "已为 host 和 service 两列添加链接。"
}
```

### 16.5 场景：新建面板时配置 Data Links

用户说："新建一个表格展示服务器列表，server_name 列点击跳转到详情页"

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "",
      "title": "服务器列表",
      "type": "table",
      "datasource_id": "ds-1",
      "targets": [
        {
          "refId": "A",
          "rawSql": "SELECT server_name, ip, status, cpu_usage FROM servers LIMIT 50",
          "metricName": "服务器列表"
        }
      ],
      "options": {},
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
  "message": "已新建服务器列表表格，server_name 列可点击跳转。"
}
```

### 16.6 场景：链接到日报详情页

用户说："report_key 列点击跳转到对应的日报"

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "panel-xxx",
      "dataLinks": [
        {
          "field": "report_key",
          "url": "/report/${report_key}",
          "target": "_blank"
        }
      ]
    }
  ],
  "message": "已为 report_key 列添加链接，点击跳转到日报详情页。"
}
```

### 16.7 场景：清除 Data Links

用户说："去掉 server_name 列的链接"

```json
{
  "action": "update_draft",
  "panels": [
    {
      "id": "panel-xxx",
      "dataLinks": []
    }
  ],
  "message": "已清除所有数据链接。"
}
```

### 16.8 规则

1. **只对表格生效**：`type: "table"` 的面板才显示 Data Links
2. **field 必须是原始列名**：不使用 aliasMap 的别名。如 SQL 返回 `server_name`，aliasMap 映射为"服务器名称"，field 应写 `server_name`
3. **变量替换用 `${}`语法**：URL 中的 `${field}` 会替换为当前行的字段值
4. **URL 需是完整路径**：内部链接以 `/`开头，外部链接以 `http://` 或 `https://` 开头
5. **修改已有面板时只传 dataLinks**：不要传 targets、options 等其他字段，避免覆盖原配置
6. **新增面板时 dataLinks 与 targets 同级**：作为面板对象的字段一起提交

---

## 17. 创建快照（Snapshot）

快照保存当前仪表盘或面板的完整状态（含数据），生成可分享的静态链接。

### 17.1 快照类型

| 类型 | 面板范围 | 创建位置 |
|------|----------|----------|
| 仪表盘快照 | 所有面板 | 仪表盘详情页 → 顶部工具栏「创建快照」 |
| 面板快照 | 单个面板 | 面板编辑详情页 → 右侧「共享」标签 |

### 17.2 分享链接

- 仪表盘快照：`http://域名/snapshot/{snapshot_key}` → 展示所有面板
- 面板快照：`http://域名/snapshot/{snapshot_key}` → 展示单个面板（铺满全屏）
- 快照页面为纯展示模式，不可编辑、无拖拽、无菜单

### 17.3 智能体应如何响应

智能体**无法直接创建快照**（快照需要前端收集渲染时的面板查询数据）。当用户要求创建快照时，应指导用户操作：

> 仪表盘快照：点击仪表盘顶部工具栏的「创建快照」按钮，输入名称后点击创建。创建后可复制链接分享。
>
> 面板快照：进入面板编辑详情页 → 右侧「共享」标签 → 输入名称 → 点击「创建快照」。

### 17.4 规则

- 快照是**静态**的，创建后不随仪表盘修改而更新
- 保存完整数据（dashboard_json + panels_data），无需访问数据库
