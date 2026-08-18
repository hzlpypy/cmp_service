# -*- coding: utf-8 -*-
"""
示例脚本：演示如何构造 update_draft 指令（不调用任何后端 API）。

⚠️ 重要：本脚本仅用于演示「构造 JSON 指令」这一过程。
面板的创建/修改只能通过返回 update_draft JSON 由前端处理，
严禁调用 /api/v1/panels/create、/api/v1/panels/update 等接口。

实际使用时，智能体直接从用户消息的上下文中获取仪表板信息（仪表板ID、面板列表等），
无需也无法通过脚本读取后端数据。
"""

import json

# ===== 模拟：前端注入的仪表板上下文（实际运行时由消息上下文提供） =====
# 实际运行时，仪表板 ID、标题、面板列表均由前端注入到消息上下文中，无需硬编码。

# 模拟上下文中的面板列表（仅包含面板基本字段）
context_panels = [
    {"id": "panel-cal", "title": "交易日历", "type": "line", "datasource_id": "ds-1"},
    {"id": "panel-bar", "title": "测试", "type": "bar", "datasource_id": "ds-1"},
]


def find_panel(panels, title):
    for p in panels:
        if p.get("title") == title:
            return p
    return None


def build_update_draft(panels, message):
    """构造 update_draft 指令（正确的输出格式）。"""
    return {
        "action": "update_draft",
        "panels": panels,
        "message": message,
    }


# ===== 1. 修改面板：将标题为「测试」的面板类型改为 line =====
panel = find_panel(context_panels, "测试")
if panel:
    print(f"✅ 找到面板「{panel['title']}」(id={panel['id']})")
    modify_panel = {
        "id": panel["id"],
        "title": panel["title"],
        "type": "line",
        "datasource_id": panel["datasource_id"],
        "targets": [{"refId": "A", "rawSql": "SELECT * FROM calendar LIMIT 5", "metricName": "测试"}],
        "options": {},
    }
else:
    modify_panel = None
    print("❌ 未找到面板「测试」")

# ===== 2. 新增面板（id 留空，前端自动生成） =====
new_panel = {
    "id": "",  # 新增面板 id 留空
    "title": "新增测试",
    "type": "bar",
    "datasource_id": "ds-1",
    "targets": [{"refId": "A", "rawSql": "SELECT * FROM calendar LIMIT 3", "metricName": "新增测试"}],
    "options": {},
}

# ===== 3. 输出 update_draft 指令 =====
panels_to_send = []
if modify_panel:
    panels_to_send.append(modify_panel)
panels_to_send.append(new_panel)

cmd = build_update_draft(
    panels_to_send,
    "已完成以下修改：\n"
    "1. 将「测试」面板的图表类型改为折线图(line)\n"
    "2. 新增面板「新增测试」，类型为柱状图(bar)，数据源 ds-1，SQL: SELECT * FROM calendar LIMIT 3\n\n"
    "请到右上角点击「保存仪表板」持久化。",
)

print("\n=== WebSocket 推送指令（仅需返回此 JSON，前端自动处理） ===")
print(json.dumps(cmd, ensure_ascii=False, indent=2))
