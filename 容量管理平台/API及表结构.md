##### API文档：

1 获取指标数据

Path : /api/v1/ops\_dbapi/api/network\_metrics

入参: date

本地请求示例:

curl -X POST \

http://127.0.0.1:3010/api/v1/ops\_dbapi/api/network\_metrics \

-d '{

"params": {

"date": "2026-06-01"

}

}'

返回: {

"errorCode": "00000",

"errorMessage": "",

"success": true,

"data": [

{

"created\_at": "2026-05-15T16:08:06+08:00", // 创建时间

"current\_value": "6.652", // 当天峰值

"historical\_peak": "6.652", // 历史峰值

"id": "2055198521950347264", // ID

"metric\_category": "资源使用率", // 类别

"metric\_name": "威新机房-带宽使用率（电信）", // 指标名称

"mom\_change": "0", // 环比

"node\_type": "交易互联网线路", // 节点类型

"unit": "%", // 单位

"updated\_at": null,

"yoy\_change": null // 周同比

}

]

2 获取模板数据

Path: /api/v1/ops\_dbapi/api/business\_systems

本地请求示例:

curl -X POST \

http://127.0.0.1:3010/api/v1/ops\_dbapi/api/business\_systems \

-d '{

"params": {

"id": "1"

}

}'

入参: id

返回:

前端固定json字符串（数据过长存储在后端business\_systems表references字段 ）

##### 容量管理表结构模型：

```

// 网络指标

type NetWorkMetrics struct {

Base

Node string `gorm:"type:varchar(64);not null;comment:'节点名称'"`

CurrentValueSourceId string `gorm:"type:varchar(128);not null;comment:'调用观测平台当天峰值Id'"`

HistoryPeakSourceId string `gorm:"type:varchar(128);not null;comment:'调用观测平台历史峰值Id'"`

Category string `gorm:"type:varchar(124);not null;comment:'指标类型'"`

Metrics string `gorm:"type:varchar(124);not null;comment:'指标名'"`

Unit string `gorm:"type:varchar(6;);not null;comment:'单位'"`

CurrentValue string `gorm:"type:varchar(12);not null;comment:'当前值'"`

HistoricalPeak string `gorm:"type:varchar(12);not null;comment:'历史峰值'"`

WowChange string `gorm:"type:varchar(12);not null;comment:'上周同一交易日同比'"`

DodChange string `gorm:"type:varchar(12);not null;comment:'上一交易日环比'"`

}

// 模板数据

type BusinessSystems struct {

Base

References string `gorm:"type:text;not null;comment:'模板JSON数据'"`

}

// 交易日历

type Calendar struct {

Market string `gorm:"type:varchar(4);comment:'交易所'"`

Date string `gorm:"type:varchar(16);comment:'日期，格式：2022-09-15'"`

Weekday string `gorm:"type:varchar(4);comment:'星期'"`

Quater int `gorm:"type:int(11);comment:'季度'"`

Weeknum int `gorm:"type:int(11);comment:'周数'"`

TradeFlag string `gorm:"type:varchar(1);comment:'是否交易日，Y是，N否'"`

Remark string `gorm:"type:varchar(1)"`

Holiday int `gorm:"type:int(11);comment:'假期，0 非假期，1 国家公共节假日，2 周末假日'"`

}

// 基础字段

type Base struct {

// 主键id

ID string `gorm:"type:varchar(15);primary\_key;not null"`

// UnixTime

// 创建时间

CreatedAt time.Time

UpdatedAt time.Time

// 软删除时间

DeletedAt gorm.DeletedAt `gorm:"index"`

}

```
