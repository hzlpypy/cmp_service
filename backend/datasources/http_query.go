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
	"mime/multipart"
	"net/http"
	"net/url"
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
	// BodyType 请求体类型：raw, form-data, x-www-form-urlencoded, graphql
	BodyType string `json:"http_body_type"`
	// Body 请求体（用于POST/PUT等，raw/graphql类型使用）
	Body string `json:"http_body"`
	// FormData 表单数据（用于form-data类型，JSON对象数组）
	// 格式：[{"key": "field1", "value": "value1"}, {"key": "field2", "value": "value2"}]
	FormData []FormDataField `json:"http_form_data"`
	// Headers 自定义HTTP请求头（JSON对象，如 {"X-Custom-Header": "value"}）
	Headers model.JSONMap `json:"http_headers"`
	// DataFormat 数据格式：json, xml, csv
	DataFormat string `json:"http_data_format"`
	// DataPath 数据提取路径（JSONPath或XPath表达式）
	DataPath string `json:"http_data_path"`
	// Timeout 请求超时时间（秒），优先使用target配置，否则使用数据源默认值
	Timeout int `json:"timeout"`
}

// FormDataField 表单数据字段
type FormDataField struct {
	Key   string `json:"key"`
	Value string `json:"value"`
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

	e.log.Infof("HTTP查询: Method=%s, Path=%s, BodyType=%s, FormData=%v", queryConfig.Method, queryConfig.Path, queryConfig.BodyType, queryConfig.FormData)

	// 解析数据源认证配置
	authConfig := e.ParseAuthConfig(ds.Config)

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

	// 应用变量替换到FormData字段
	if queryConfig.FormData != nil {
		for i, field := range queryConfig.FormData {
			queryConfig.FormData[i].Key = variables.ReplaceVariables(field.Key, varValues)
			queryConfig.FormData[i].Value = variables.ReplaceVariables(field.Value, varValues)

			// 手动替换系统变量到FormData（不添加引号）
			if from != "" && to != "" {
				queryConfig.FormData[i].Key = strings.ReplaceAll(queryConfig.FormData[i].Key, "${__from}", from)
				queryConfig.FormData[i].Key = strings.ReplaceAll(queryConfig.FormData[i].Key, "$__from", from)
				queryConfig.FormData[i].Key = strings.ReplaceAll(queryConfig.FormData[i].Key, "${__to}", to)
				queryConfig.FormData[i].Key = strings.ReplaceAll(queryConfig.FormData[i].Key, "$__to", to)

				queryConfig.FormData[i].Value = strings.ReplaceAll(queryConfig.FormData[i].Value, "${__from}", from)
				queryConfig.FormData[i].Value = strings.ReplaceAll(queryConfig.FormData[i].Value, "$__from", from)
				queryConfig.FormData[i].Value = strings.ReplaceAll(queryConfig.FormData[i].Value, "${__to}", to)
				queryConfig.FormData[i].Value = strings.ReplaceAll(queryConfig.FormData[i].Value, "$__to", to)
			}
		}
	}

	// 更新queryConfig.Body为已替换变量的版本
	queryConfig.Body = body

	// 确定超时时间（优先使用查询配置，否则使用数据源默认）
	timeout := queryConfig.Timeout
	if timeout <= 0 {
		timeout = authConfig.Timeout
	}
	if timeout <= 0 {
		timeout = 10 // 默认10秒
	}

	// 创建HTTP请求
	req, err := e.createHTTPRequest(url, queryConfig.Method, queryConfig)
	if err != nil {
		result.Error = fmt.Sprintf("创建HTTP请求失败: %v", err)
		return result
	}

	// 设置请求头（数据源Headers + 查询配置Headers + 认证头）
	// Headers优先级：认证Headers > 查询配置Headers > 数据源Headers
	e.setRequestHeaders(req, ds.Headers, queryConfig.Headers, authConfig)

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

// ParseAuthConfig 解析数据源认证配置
func (e *HTTPQueryExecutor) ParseAuthConfig(config model.JSONMap) *HTTPAuthConfig {
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
func (e *HTTPQueryExecutor) createHTTPRequest(url string, method string, queryConfig *HTTPQueryConfig) (*http.Request, error) {
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
		// 根据BodyType构建不同格式的请求体
		var reqBody []byte
		var contentType string

		switch queryConfig.BodyType {
		case "raw":
			// Raw: 原始文本，默认application/json
			reqBody = []byte(queryConfig.Body)
			contentType = "application/json"
		case "x-www-form-urlencoded":
			// URL编码表单
			formData := e.buildURLEncodedForm(queryConfig.FormData)
			reqBody = []byte(formData)
			contentType = "application/x-www-form-urlencoded"
		case "form-data":
			// multipart/form-data
			body, ct := e.buildMultipartForm(queryConfig.FormData)
			reqBody = body
			contentType = ct
			e.log.Infof("createHTTPRequest: form-data body长度=%d, contentType=%s", len(reqBody), contentType)
		case "graphql":
			// GraphQL查询，包装成JSON格式
			graphQLBody := map[string]string{
				"query": queryConfig.Body,
			}
			jsonBody, _ := json.Marshal(graphQLBody)
			reqBody = jsonBody
			contentType = "application/json"
		default:
			// 默认使用raw模式
			reqBody = []byte(queryConfig.Body)
			contentType = "application/json"
		}

		req, err = http.NewRequest(method, url, bytes.NewBuffer(reqBody))
		if err == nil && contentType != "" {
			// 使用直接赋值，避免Header.Set将boundary转为小写导致multipart解析失败
			req.Header["Content-Type"] = []string{contentType}
		}
	}

	if err != nil {
		return nil, err
	}

	return req, nil
}

// buildURLEncodedForm 构建URL编码表单数据
func (e *HTTPQueryExecutor) buildURLEncodedForm(formData []FormDataField) string {
	if formData == nil || len(formData) == 0 {
		return ""
	}
	form := url.Values{}
	for _, field := range formData {
		if field.Key != "" {
			form.Set(field.Key, field.Value)
		}
	}
	return form.Encode()
}

// buildMultipartForm 构建multipart/form-data请求体
func (e *HTTPQueryExecutor) buildMultipartForm(formData []FormDataField) ([]byte, string) {
	if formData == nil || len(formData) == 0 {
		e.log.Warnf("buildMultipartForm: formData为空")
		return []byte{}, ""
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	for _, field := range formData {
		if field.Key != "" {
			e.log.Infof("buildMultipartForm: 写入字段 key=%s, value=%s", field.Key, field.Value)
			_ = writer.WriteField(field.Key, field.Value)
		}
	}
	_ = writer.Close()

	// 生成Content-Type：手动拼接确保boundary大小写与body中一致
	// multipart.NewWriter生成的boundary含大写hex，但Go的Header.Set会转为小写，导致不匹配
	contentType := fmt.Sprintf("multipart/form-data; boundary=%s", writer.Boundary())

	e.log.Infof("buildMultipartForm: 生成body长度=%d, ContentType=%s", body.Len(), contentType)
	return body.Bytes(), contentType
}

// setRequestHeaders 设置请求头
// Headers优先级：认证Headers > 查询配置Headers > 数据源Headers
func (e *HTTPQueryExecutor) setRequestHeaders(req *http.Request, dsHeaders model.JSONMap, queryHeaders model.JSONMap, authConfig *HTTPAuthConfig) {
	// 1. 设置数据源配置的Headers（最低优先级）
	// 使用直接赋值绕过Go的header key自动canonicalization，保持用户输入的大小写
	if dsHeaders != nil {
		for key, value := range dsHeaders {
			if strValue, ok := value.(string); ok {
				req.Header[key] = []string{strValue}
			}
		}
	}

	// 2. 设置查询配置的Headers（可以覆盖数据源Headers）
	if queryHeaders != nil {
		for key, value := range queryHeaders {
			if strValue, ok := value.(string); ok {
				req.Header[key] = []string{strValue}
			}
		}
	}

	// 3. 根据认证类型设置认证头（最高优先级，确保认证信息不被覆盖）
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