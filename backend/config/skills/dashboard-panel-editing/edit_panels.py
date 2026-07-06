import json
import requests

BASE = 'http://127.0.0.1:3011'
DASHBOARD_ID = 'db-1780554122415'

# 1. 获取仪表板
r = requests.post(f'{BASE}/api/v1/dashboards/get', json={'id': DASHBOARD_ID})
resp = r.json()
print("获取仪表板响应:", json.dumps(resp, ensure_ascii=False, indent=2))

d = resp['data']
dj = json.loads(json.dumps(d['dashboard_json']))  # 深拷贝

# 2. 找到标题为"测试"的面板，修改类型为 line
found_test = False
for p in dj['panels']:
    if p.get('title') == '测试':
        p['type'] = 'line'
        found_test = True
        print(f"\n✅ 已将面板「{p['title']}」(id={p['id']}) 的类型改为 line")
        break

if not found_test:
    print("\n❌ 未找到标题为「测试」的面板")

# 3. 新增面板"新增测试"，类型为 bar
import uuid
new_panel_id = f"panel-{uuid.uuid4().hex[:12]}"

# 计算新面板的 gridPos - 放在现有面板下方
max_y = 0
for p in dj['panels']:
    bottom = p['gridPos']['y'] + p['gridPos']['h']
    if bottom > max_y:
        max_y = bottom

new_panel = {
    "id": new_panel_id,
    "title": "新增测试",
    "type": "bar",
    "gridPos": {"x": 0, "y": max_y, "w": 24, "h": 8},
    "datasource_id": "ds-1",
    "targets": [
        {
            "refId": "A",
            "rawSql": "SELECT * FROM calendar LIMIT 3",
            "aliasMap": {},
            "category": "",
            "metricName": ""
        }
    ],
    "options": {}
}

dj['panels'].append(new_panel)
print(f"\n✅ 已新增面板「新增测试」(id={new_panel_id})，类型为 bar")

# 4. 输出最终的 dashboard_json
print("\n=== 最终 panels ===")
for p in dj['panels']:
    print(f"  - {p['title']} (type={p['type']}, datasource={p.get('datasource_id', 'N/A')}, id={p['id']})")

# 5. 输出 WebSocket 指令
ws_message = {
    "action": "update_draft",
    "dashboard_json": dj,
    "message": "已完成以下修改：\n1. 将「测试」面板的图表类型改为折线图(line)\n2. 新增面板「新增测试」，类型为柱状图(bar)，数据源 ds-1，SQL: SELECT * FROM calendar LIMIT 3\n\n请到右上角点击「保存仪表板」持久化。"
}

print("\n=== WebSocket 推送指令 ===")
print(json.dumps(ws_message, ensure_ascii=False, indent=2))
