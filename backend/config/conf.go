// Package config 提供应用配置的加载和管理功能。
// 通过读取 config.yaml 文件来初始化服务运行所需的各项参数。
package config

import (
	"gopkg.in/yaml.v2"
	"io/ioutil"
	"log"
)

// Config 是应用的总配置结构体，对应 config.yaml 文件的顶层结构。
// 包含运行模式、服务器端口、MySQL 连接等所有配置项。
type Config struct {
	// Model 运行模式：debug / release
	Model  string `yaml:"model"`
	// Server 服务器配置
	Server struct {
		// Ip 服务器监听IP
		Ip   string `yaml:"ip"`
		// Port 服务器监听端口
		Port int    `yaml:"port"`
		// Name 服务名称
		Name string `yaml:"name"`
	} `yaml:"server"`
	// Mysql MySQL 数据库连接配置
	Mysql struct {
		// Host 数据库主机地址
		Host string `yaml:"host"`
		// Port 数据库端口
		Port int `yaml:"port"`
		// User 数据库用户名
		User string `yaml:"user"`
		// Password 数据库密码
		Password string `yaml:"password"`
		// DBName 数据库名称
		DBName string `yaml:"db_name"`
		// Charset 数据库字符集
		Charset string `yaml:"charset"`
		// ConnMaxLifetime 连接最大存活时间（秒）
		ConnMaxLifetime int `yaml:"conn_max_lifetime"`
		// MaxIdleConns 最大空闲连接数
		MaxIdleConns int `yaml:"max_idle_conns"`
		// MaxOpenConns 最大打开连接数
		MaxOpenConns int `yaml:"max_open_conns"`
		// DisableForeignKeyConstraintWhenMigrating 迁移时是否禁用外键约束
		DisableForeignKeyConstraintWhenMigrating bool `yaml:"disable_foreign_key_constraint_when_migrating"`
	} `yaml:"mysql"`
}

// NewConfig 创建并加载应用配置。
// 从与 conf.go 同目录下的 config.yaml 文件中读取配置，
// 解析失败时会直接终止程序。
func NewConfig() *Config {
	// 读取 YAML 配置文件内容
	bytes, err := ioutil.ReadFile("./config/config.yaml")
	if err != nil {
		log.Fatal(err)
	}
	// 反序列化到 Config 结构体
	config := &Config{}
	err = yaml.Unmarshal(bytes, config)
	if err != nil {
		log.Fatal(err)
	}
	return config
}
