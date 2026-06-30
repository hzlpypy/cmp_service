// Package datasources 提供HTTP数据源查询功能。
// 实现对HTTP API数据源的查询，支持多种HTTP方法、认证方式和数据格式解析。
package datasources

import (
	"bytes"
	"cmp_service_backend/model"
	"cmp_service_backend/variables"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/sirupsen/logrus"
)

// HTTPQueryConfig HTTP查询配置结构
// 从面板target配置中获取
type HTTPQueryConfig struct {
	// Method HTTP请求方法：GET, POST, PUT, DELETE等
	Method string `json:"http_method"`
	// Path API路径，会与数据源Base URL拼接
	Path string `json:"http_path"`
	// Body 请求体（用于POST/PUT等）
	Body string `json:"http_body"`
	// DataFormat 数据格式：json, xml, csv
	DataFormat string `json:"http_data_format"`
	// DataPath 数据提取路径（JSONPath或XPath表达式）
	DataPath string `json:"http_data_path"`
	// Timeout 请求超时时间（秒），优先使用target配置，否则使用数据源默认值
	Timeout int `json:"timeout"`
}

// HTTPQueryResult HTTP查询结果
type HTTPQueryResult struct {
	// Columns 列名列表
	Columns []string `json:"columns"`
	// Rows 数据行列表
	Rows []map[string]interface{} `json:"rows"`
	// Error 错误信息
	Error string `json:"error,omitempty"`
}

// HTTPQueryExecutor HTTP查询执行器
type HTTPQueryExecutor struct {
	log *logrus.Logger
}

// NewHTTPQueryExecutor 创建HTTP查询执行器
func NewHTTPQueryExecutor(log *logrus.Logger) *HTTPQueryExecutor {
	return &HTTPQueryExecutor{log: log}
}

// QueryHTTPDatasource 执行HTTP数据源查询
// 参数：
// - ds: 数据源配置（包含Base URL和认证信息）
// - queryConfig: 查询配置（从面板target获取，包含path、method、body等）
// - varValues: 变量值列表
// - from: 时间范围开始（用于系统变量替换）
// - to: 时间范围结束（用于系统变量替换）
// 返回查询结果和错误信息
func (e *HTTPQueryExecutor) QueryHTTPDatasource(ds *model.Datasource, queryConfig *HTTPQueryConfig, varValues []variables.VariableValue, from, to string) *HTTPQueryResult {
	result := &HTTPQueryResult{
		Columns: []string{},
		Rows:    []map[string]interface{}{},
	}

	// 解析数据源认证配置
	authConfig := e.parseAuthConfig(ds.Config)

	// 拼接完整URL: Base URL + Path
	fullURL := ds.URL + queryConfig.Path

	// 应用变量替换到URL
	url := variables.ReplaceVariables(fullURL, varValues)

	// 手动替换系统变量（不添加引号，适用于URL参数）
	if from != "" && to != "" {
		fromTime, _ := time.Parse(time.RFC3339, from)
		toTime, _ := time.Parse(time.RFC3339, to)

		// 替换 $__from（不添加引号）
		url = strings.ReplaceAll(url, "${__from}", from)
		url = strings.ReplaceAll(url, "$__from", from)

		// 替换 $__to（不添加引号）
		url = strings.ReplaceAll(url, "${__to}", to)
		url = strings.ReplaceAll(url, "$__to", to)

		// 替换 $__fromUnix（毫秒）
		fromMs := fromTime.UnixMilli()
		url = strings.ReplaceAll(url, "${__fromUnix}", fmt.Sprintf("%d", fromMs))
		url = strings.ReplaceAll(url, "$__fromUnix", fmt.Sprintf("%d", fromMs))

		// 替换 $__toUnix（毫秒）
		toMs := toTime.UnixMilli()
		url = strings.ReplaceAll(url, "${__toUnix}", fmt.Sprintf("%d", toMs))
		url = strings.ReplaceAll(url, "$__toUnix", fmt.Sprintf("%d", toMs))

		// 替换 $__fromMs 和 $__toMs（毫秒）
		url = strings.ReplaceAll(url, "${__fromMs}", fmt.Sprintf("%d", fromMs))
		url = strings.ReplaceAll(url, "$__fromMs", fmt.Sprintf("%d", fromMs))
		url = strings.ReplaceAll(url, "${__toMs}", fmt.Sprintf("%d", toMs))
		url = strings.ReplaceAll(url, "$__toMs", fmt.Sprintf("%d", toMs))
	}

	// 应用变量替换到Body
	body := variables.ReplaceVariables(queryConfig.Body, varValues)

	// 手动替换系统变量到Body（不添加引号）
	if from != "" && to != "" {
		fromTime, _ := time.Parse(time.RFC3339, from)
		toTime, _ := time.Parse(time.RFC3339, to)

		body = strings.ReplaceAll(body, "${__from}", from)
		body = strings.ReplaceAll(body, "$__from", from)
		body = strings.ReplaceAll(body, "${__to}", to)
		body = strings.ReplaceAll(body, "$__to", to)

		fromMs := fromTime.UnixMilli()
		toMs := toTime.UnixMilli()
		body = strings.ReplaceAll(body, "${__fromUnix}", fmt.Sprintf("%d", fromMs))
		body = strings.ReplaceAll(body, "$__fromUnix", fmt.Sprintf("%d", fromMs))
		body = strings.ReplaceAll(body, "${__toUnix}", fmt.Sprintf("%d", toMs))
		body = strings.ReplaceAll(body, "$__toUnix", fmt.Sprintf("%d", toMs))
		body = strings.ReplaceAll(body, "${__fromMs}", fmt.Sprintf("%d", fromMs))
		body = strings.ReplaceAll(body, "$__fromMs", fmt.Sprintf("%d", fromMs))
		body = strings.ReplaceAll(body, "${__toMs}", fmt.Sprintf("%d", toMs))
		body = strings.ReplaceAll(body, "$__toMs", fmt.Sprintf("%d", toMs))
	}

	// 确定超时时间（优先使用查询配置，否则使用数据源默认）
	timeout := queryConfig.Timeout
	if timeout <= 0 {
		timeout = authConfig.Timeout
	}
	if timeout <= 0 {
		timeout = 10 // 默认10秒
	}

	// 创建HTTP请求
	req, err := e.createHTTPRequest(url, queryConfig.Method, body)
	if err != nil {
		result.Error = fmt.Sprintf("创建HTTP请求失败: %v", err)
		return result
	}

	// 设置请求头（数据源Headers + 认证头）
	e.setRequestHeaders(req, ds.Headers, authConfig)

	// 发送请求
	client := &http.Client{
		Timeout: time.Duration(timeout) * time.Second,
	}
	resp, err := client.Do(req)
	if err != nil {
		result.Error = fmt.Sprintf("HTTP请求失败: %v", err)
		return result
	}
	defer resp.Body.Close()

	// 检查响应状态码
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		result.Error = fmt.Sprintf("HTTP请求返回错误状态码: %d", resp.StatusCode)
		return result
	}

	// 读取响应体
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		result.Error = fmt.Sprintf("读取响应体失败: %v", err)
		return result
	}

	// 解析响应数据
	return e.parseResponse(respBody, queryConfig.DataFormat, queryConfig.DataPath)
}

// HTTPAuthConfig HTTP认证配置结构
// 从数据源Config中获取
type HTTPAuthConfig struct {
	// AuthType 认证类型：none, basic, bearer, api_key
	AuthType string `json:"auth_type"`
	// AuthToken 认证Token或API Key值
	AuthToken string `json:"auth_token"`
	// AuthUsername Basic认证用户名
	AuthUsername string `json:"auth_username"`
	// AuthPassword Basic认证密码
	AuthPassword string `json:"auth_password"`
	// Timeout 默认超时时间（秒）
	Timeout int `json:"timeout"`
}

// parseAuthConfig 解析数据源认证配置
func (e *HTTPQueryExecutor) parseAuthConfig(config model.JSONMap) *HTTPAuthConfig {
	result := &HTTPAuthConfig{
		AuthType: "none",
		Timeout:  10,
	}

	if config == nil {
		return result
	}

	// 解析认证方式
	if authType, ok := config["auth_type"].(string); ok {
		result.AuthType = authType
	}
	if authToken, ok := config["auth_token"].(string); ok {
		result.AuthToken = authToken
	}
	if authUsername, ok := config["auth_username"].(string); ok {
		result.AuthUsername = authUsername
	}
	if authPassword, ok := config["auth_password"].(string); ok {
		result.AuthPassword = authPassword
	}

	// 解析默认超时时间
	if timeout, ok := config["timeout"].(float64); ok && timeout > 0 {
		result.Timeout = int(timeout)
	}

	return result
}

// createHTTPRequest 创建HTTP请求对象
func (e *HTTPQueryExecutor) createHTTPRequest(url string, method string, body string) (*http.Request, error) {
	// 默认方法为GET
	if method == "" {
		method = "GET"
	}
	method = strings.ToUpper(method)

	// 创建请求对象
	var req *http.Request
	var err error

	if method == "GET" || method == "DELETE" {
		req, err = http.NewRequest(method, url, nil)
	} else {
		// POST, PUT等方法需要请求体
		reqBody := []byte(body)
		req, err = http.NewRequest(method, url, bytes.NewBuffer(reqBody))
	}

	if err != nil {
		return nil, err
	}

	return req, nil
}

// setRequestHeaders 设置请求头
func (e *HTTPQueryExecutor) setRequestHeaders(req *http.Request, headers model.JSONMap, authConfig *HTTPAuthConfig) {
	// 设置数据源配置的Headers
	if headers != nil {
		for key, value := range headers {
			if strValue, ok := value.(string); ok {
				req.Header.Set(key, strValue)
			}
		}
	}

	// 根据认证类型设置认证头
	switch authConfig.AuthType {
	case "bearer":
		if authConfig.AuthToken != "" {
			req.Header.Set("Authorization", "Bearer "+authConfig.AuthToken)
		}
	case "api_key":
		if authConfig.AuthToken != "" {
			req.Header.Set("X-API-Key", authConfig.AuthToken)
		}
	case "basic":
		if authConfig.AuthUsername != "" && authConfig.AuthPassword != "" {
			req.SetBasicAuth(authConfig.AuthUsername, authConfig.AuthPassword)
		}
	}

	// POST/PUT等方法默认设置Content-Type
	method := strings.ToUpper(req.Method)
	if method == "POST" || method == "PUT" || method == "PATCH" {
		if req.Header.Get("Content-Type") == "" {
			req.Header.Set("Content-Type", "application/json")
		}
	}
}

// parseResponse 解析响应数据
func (e *HTTPQueryExecutor) parseResponse(body []byte, dataFormat string, dataPath string) *HTTPQueryResult {
	switch dataFormat {
	case "json":
		return e.parseJSONResponse(body, dataPath)
	case "xml":
		return e.parseXMLResponse(body, dataPath)
	case "csv":
		return e.parseCSVResponse(body)
	default:
		// 默认尝试解析JSON
		return e.parseJSONResponse(body, dataPath)
	}
}

// parseJSONResponse 解析JSON响应
func (e *HTTPQueryExecutor) parseJSONResponse(body []byte, dataPath string) *HTTPQueryResult {
	result := &HTTPQueryResult{
		Columns: []string{},
		Rows:    []map[string]interface{}{},
	}

	var data interface{}
	if err := json.Unmarshal(body, &data); err != nil {
		result.Error = fmt.Sprintf("JSON解析失败: %v", err)
		return result
	}

	// 如果指定了dataPath，提取特定路径的数据
	if dataPath != "" {
		data = e.extractJSONPath(data, dataPath)
	}

	// 转换为行数据
	return e.convertToRows(data)
}

// parseXMLResponse 解析XML响应（简化实现）
func (e *HTTPQueryExecutor) parseXMLResponse(body []byte, dataPath string) *HTTPQueryResult {
	result := &HTTPQueryResult{
		Columns: []string{},
		Rows:    []map[string]interface{}{},
	}

	// XML解析比较复杂，这里提供简化的实现
	// 将XML转换为JSON格式再处理
	var xmlData interface{}
	if err := xml.Unmarshal(body, &xmlData); err != nil {
		result.Error = fmt.Sprintf("XML解析失败: %v", err)
		return result
	}

	// 转换为行数据
	return e.convertToRows(xmlData)
}

// parseCSVResponse 解析CSV响应（简化实现）
func (e *HTTPQueryExecutor) parseCSVResponse(body []byte) *HTTPQueryResult {
	result := &HTTPQueryResult{
		Columns: []string{},
		Rows:    []map[string]interface{}{},
	}

	// CSV解析：简化实现，假设第一行是列名
	lines := strings.Split(string(body), "\n")
	if len(lines) < 2 {
		result.Error = "CSV数据格式错误或数据为空"
		return result
	}

	// 解析列名（第一行）
	columns := strings.Split(lines[0], ",")
	result.Columns = columns

	// 解析数据行（后续行）
	for i := 1; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}
		values := strings.Split(line, ",")
		row := make(map[string]interface{})
		for j, col := range columns {
			if j < len(values) {
				row[col] = values[j]
			}
		}
		result.Rows = append(result.Rows, row)
	}

	return result
}

// extractJSONPath 从JSON数据中提取指定路径的数据
// 支持简单的点分隔路径，如 "data.items" 或 "results"
func (e *HTTPQueryExecutor) extractJSONPath(data interface{}, path string) interface{} {
	if path == "" {
		return data
	}

	// 分割路径
	parts := strings.Split(path, ".")

	// 逐层访问
	current := data
	for _, part := range parts {
		if current == nil {
			return nil
		}

		// 尝试作为map访问
		if m, ok := current.(map[string]interface{}); ok {
			current = m[part]
		} else {
			// 不是map，路径无效
			return current
		}
	}

	return current
}

// convertToRows 将数据转换为行格式
func (e *HTTPQueryExecutor) convertToRows(data interface{}) *HTTPQueryResult {
	result := &HTTPQueryResult{
		Columns: []string{},
		Rows:    []map[string]interface{}{},
	}

	// 根据数据类型处理
	switch v := data.(type) {
	case []interface{}:
		// 数组类型：每个元素作为一行
		if len(v) == 0 {
			return result
		}

		// 从第一个元素推断列名
		if firstRow, ok := v[0].(map[string]interface{}); ok {
			// Go的map遍历顺序是随机的，需要排序以保持稳定顺序
			keys := make([]string, 0, len(firstRow))
			for key := range firstRow {
				keys = append(keys, key)
			}
			// 按字母顺序排序列名（保证顺序稳定）
			sort.Strings(keys)
			result.Columns = keys
		}

		// 转换所有行
		for _, item := range v {
			if row, ok := item.(map[string]interface{}); ok {
				result.Rows = append(result.Rows, row)
			} else {
				// 不是map，转换为单列数据
				result.Rows = append(result.Rows, map[string]interface{}{
					"value": item,
				})
			}
		}

	case map[string]interface{}:
		// 单个对象：作为一个整体行
		// Go的map遍历顺序是随机的，需要排序以保持稳定顺序
		keys := make([]string, 0, len(v))
		for key := range v {
			keys = append(keys, key)
		}
		// 按字母顺序排序列名（保证顺序稳定）
		sort.Strings(keys)
		result.Columns = keys
		result.Rows = append(result.Rows, v)

	default:
		// 其他类型：作为单列数据
		result.Columns = []string{"value"}
		result.Rows = append(result.Rows, map[string]interface{}{
			"value": data,
		})
	}

	return result
}