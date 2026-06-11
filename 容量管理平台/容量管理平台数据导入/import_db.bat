@echo off
REM cmp_service 数据库一键导入脚本 (Windows)
REM 使用方法: import_db.bat

REM 数据库配置（请根据实际情况修改）
set DB_HOST=127.0.0.1
set DB_PORT=3306
set DB_USER=root
set DB_PASS=Cmsops@2025
set DB_NAME=cmp_service

REM SQL 文件路径
set SQL_FILE=cmp_service_full.sql

echo ==========================================
echo cmp_service 数据库导入脚本
echo ==========================================

REM 检查 SQL 文件是否存在
if not exist "%SQL_FILE%" (
    echo 错误: SQL 文件 %SQL_FILE% 不存在
    pause
    exit /b 1
)

echo 正在导入数据库...
echo 数据库: %DB_NAME%
echo 主机: %DB_HOST%:%DB_PORT%
echo.

REM 先创建数据库（如果不存在）
echo 创建数据库（如果不存在）...
mysql -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p%DB_PASS% -e "CREATE DATABASE IF NOT EXISTS %DB_NAME% CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

REM 导入数据
echo 导入表结构和数据...
mysql -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p%DB_PASS% %DB_NAME% < %SQL_FILE%

if %ERRORLEVEL% equ 0 (
    echo.
    echo ==========================================
    echo 导入成功！
    echo ==========================================
    echo.
    echo 数据库 %DB_NAME% 已成功导入
    echo 包含所有表结构和数据
) else (
    echo.
    echo 导入失败，请检查错误信息
    pause
    exit /b 1
)

pause