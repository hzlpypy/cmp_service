// UserGroupManager 用户组维护弹窗：创建/重命名/删除用户组，管理组成员。
import { useState, useEffect, useCallback } from 'react'
import { Modal, List, Input, Button, Table, Space, message, Popconfirm, Empty, Tag, Select } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import * as api from '../api'
import type { UserGroupBrief, GroupMemberBrief, UserBrief } from '../api'

interface UserGroupManagerProps {
  open: boolean
  onClose: () => void
}

export default function UserGroupManager({ open, onClose }: UserGroupManagerProps) {
  const [groups, setGroups] = useState<UserGroupBrief[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [newName, setNewName] = useState('')

  // 重命名
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)

  // 成员
  const [members, setMembers] = useState<GroupMemberBrief[]>([])
  const [users, setUsers] = useState<UserBrief[]>([])
  const [userCache, setUserCache] = useState<Record<string, UserBrief>>({}) // 已见过的用户缓存，保证已选项显示名字
  const [selectedUser, setSelectedUser] = useState<UserBrief | null>(null)
  const [searching, setSearching] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const loadGroups = useCallback(async () => {
    const list = await api.listGroups()
    setGroups(list)
    return list
  }, [])

  const loadMembers = useCallback(async (gid: string) => {
    try {
      setMembers(await api.listGroupMembers(gid))
    } catch (e: any) {
      message.error('加载成员失败: ' + (e.message || e))
    }
  }, [])

  // 拉取用户列表（最多前20个），并合并进缓存供已选项显示名字
  const fetchUsers = useCallback(async (q: string) => {
    setSearching(true)
    try {
      const list = (await api.searchUsers(q)) || []
      const limited = list.slice(0, 20)
      setUsers(limited)
      setUserCache((prev) => {
        const next = { ...prev }
        limited.forEach((u) => { next[u.user_id] = u })
        return next
      })
    } catch (e: any) {
      message.error('加载用户失败: ' + (e.message || e))
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    loadGroups().then((list) => {
      setSelectedId(list.length > 0 ? list[0].id : '')
    }).catch((e: any) => message.error('加载用户组失败: ' + (e.message || e)))
    setNewName('')
    setRenaming(null)
    fetchUsers('') // 自动拉取前20个用户
    setSelectedUserId('')
    setSelectedUser(null)
    setMembers([])
  }, [open, loadGroups, fetchUsers])

  useEffect(() => {
    if (selectedId) loadMembers(selectedId)
  }, [selectedId, loadMembers])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const g = await api.createGroup(newName.trim())
      message.success('创建成功')
      setNewName('')
      const list = await loadGroups()
      setSelectedId(g.id)
      // 让列表滚动到新组（简单处理：直接选中）
      if (!list.some((x) => x.id === g.id)) return
    } catch (e: any) {
      message.error('创建失败: ' + (e.message || e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.deleteGroup(id)
      message.success('删除成功')
      const list = await loadGroups()
      setSelectedId(list.length > 0 ? list[0].id : '')
      setMembers([])
    } catch (e: any) {
      message.error('删除失败: ' + (e.message || e))
    }
  }

  const saveRename = async () => {
    if (!renaming) return
    const { id, name } = renaming
    setRenaming(null)
    if (!name.trim()) {
      loadGroups()
      return
    }
    try {
      await api.updateGroup(id, name.trim())
      message.success('已重命名')
      loadGroups()
    } catch (e: any) {
      message.error('重命名失败: ' + (e.message || e))
    }
  }

  const handleAddMember = async () => {
    if (!selectedId || !selectedUserId) return
    setSaving(true)
    try {
      await api.addGroupMember(selectedId, [selectedUserId])
      message.success('已添加成员')
      setSelectedUserId('')
      setSelectedUser(null)
      loadMembers(selectedId)
      loadGroups()
    } catch (e: any) {
      message.error('添加失败: ' + (e.message || e))
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!selectedId) return
    try {
      await api.removeGroupMember(selectedId, userId)
      message.success('已移除成员')
      loadMembers(selectedId)
      loadGroups()
    } catch (e: any) {
      message.error('移除失败: ' + (e.message || e))
    }
  }

  const memberColumns: ColumnsType<GroupMemberBrief> = [
    { title: '姓名', dataIndex: 'display_name', width: 140 },
    { title: '用户ID', dataIndex: 'user_id' },
    {
      title: '操作', width: 90,
      render: (_: unknown, m: GroupMemberBrief) => (
        <Popconfirm title="移除该成员？" onConfirm={() => handleRemoveMember(m.user_id)}>
          <Button size="small" danger type="link">移除</Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <Modal title="用户组管理" open={open} onCancel={onClose} footer={null} width={880} destroyOnClose>
      <div style={{ display: 'flex', gap: 16, minHeight: 420 }}>
        {/* 左侧：组列表 */}
        <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid #f0f0f0', paddingRight: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="新用户组名称"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onPressEnter={handleCreate}
              />
              <Button type="primary" onClick={handleCreate} loading={saving} disabled={!newName.trim()}>新建</Button>
            </Space.Compact>
          </div>
          <List
            dataSource={groups}
            locale={{ emptyText: '暂无用户组，请先新建' }}
            renderItem={(g) => (
              <List.Item
                style={{
                  cursor: 'pointer',
                  background: selectedId === g.id ? '#e6f4ff' : undefined,
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: selectedId === g.id ? '1px solid #91caff' : '1px solid transparent',
                }}
                onClick={() => setSelectedId(g.id)}
                actions={[
                  <a key="rename" onClick={(e) => { e.stopPropagation(); setRenaming({ id: g.id, name: g.name }) }}>重命名</a>,
                  <Popconfirm key="del" title="删除该用户组？其相关分享将一并取消。" onConfirm={() => handleDelete(g.id)}>
                    <a style={{ color: '#ff4d4f' }} onClick={(e) => e.stopPropagation()}>删除</a>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={
                    renaming && renaming.id === g.id ? (
                      <Input
                        size="small"
                        autoFocus
                        value={renaming.name}
                        onChange={(e) => setRenaming({ id: g.id, name: e.target.value })}
                        onBlur={saveRename}
                        onPressEnter={saveRename}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : g.name
                  }
                  description={
                    <span>
                      <Tag color="purple" style={{ marginRight: 4 }}>{g.member_count} 人</Tag>
                      {g.owner_name ? `创建者：${g.owner_name}` : ''}
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        </div>

        {/* 右侧：成员管理 */}
        <div style={{ flex: 1 }}>
          {selectedId ? (
            <>
              <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Select
                  placeholder="选择用户（可输入姓名/ID搜索）"
                  style={{ width: 260 }}
                  value={selectedUserId || undefined}
                  onChange={(id: string) => {
                    setSelectedUserId(id)
                    setSelectedUser(userCache[id] || null)
                  }}
                  options={[
                    // 已选中但不在当前搜索结果中的用户，仍保留展示
                    ...(selectedUser && !users.some((u) => u.user_id === selectedUser.user_id)
                      ? [{ value: selectedUser.user_id, label: `${selectedUser.display_name} (${selectedUser.user_id})` }]
                      : []),
                    ...users.map((u) => ({ value: u.user_id, label: `${u.display_name} (${u.user_id})` })),
                  ]}
                  showSearch
                  filterOption={false}
                  onSearch={fetchUsers}
                  loading={searching}
                  notFoundContent={searching ? '搜索中...' : '无匹配用户'}
                />
                <Button type="primary" disabled={!selectedUserId} loading={saving} onClick={handleAddMember}>添加成员</Button>
                {selectedUserId && <Tag color="blue">{userCache[selectedUserId]?.display_name || selectedUserId}</Tag>}
              </div>
              <Table
                rowKey="user_id"
                size="small"
                columns={memberColumns}
                dataSource={members}
                pagination={false}
                locale={{ emptyText: '暂无成员，请在上方选择添加' }}
              />
            </>
          ) : (
            <Empty description="请选择或新建用户组" style={{ marginTop: 80 }} />
          )}
        </div>
      </div>
    </Modal>
  )
}
