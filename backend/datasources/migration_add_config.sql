-- 为 datasources 表添加 config 字段
-- 用于存储 HTTP 数据源的专用配置（method、body、auth_type、auth_token、data_format、data_path等）

ALTER TABLE `datasources`
ADD COLUMN `config` json DEFAULT NULL COMMENT 'HTTP数据源专用配置：method、body、auth_type、auth_token、data_format、data_path等'
AFTER `headers`;