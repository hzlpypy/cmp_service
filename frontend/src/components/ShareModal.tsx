// ShareModal 资源分享弹窗：将仪表板/快照分享给用户或团队，支持可编辑/只读权限。
import { useState, useEffect, useCallback } from 'react'
import { Modal, Table, Tabs, Select, Checkbox, Button, Space, Tag, message, Popconfirm } from 'antd'
import * as api from '../api'
import type { ShareRes, UserBrief, TeamBrief, UserGroupBrief } from '../api'

interface ShareModalProps {
  open: boolean
  resourceType: 'dashboard' | 'snapshot'
  /** 待分享的资源ID列表：单个即分享单个；多个（文件夹/多选）则批量分享 */
  resourceIds: string[]
  resourceNames?: string[]
  onClose: () => void
}

type ShareToType = 'user' | 'team' | 'group'

export default function ShareModal({ open, resourceType, resourceIds, resourceNames, onClose }: ShareModalProps) {
  // 仅单个资源时才能展示/管理已有分享列表
  const resourceId = resourceIds.length === 1 ? resourceIds[0] : undefined
  const isBatch = resourceIds.length > 1

  const [shares, setShares] = useState<ShareRes[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // 用户选择（打开弹窗自动拉取前20个，Select 内支持搜索）
  const [users, setUsers] = useState<UserBrief[]>([])
  const [userCache, setUserCache] = useState<Record<string, UserBrief>>({}) // 已见过的用户缓存，保证分享列表能显示名字
  const [selectedUser, setSelectedUser] = useState<UserBrief | null>(null)
  const [searching, setSearching] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string>('')

  // 团队列表
  const [teams, setTeams] = useState<TeamBrief[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')

  // 用户组列表（平台内部维护）
  const [groups, setGroups] = useState<UserGroupBrief[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')

  const [canEdit, setCanEdit] = useState(false)

  const loadShares = useCallback(async () => {
    if (!resourceId) return
    setLoading(true)
    try {
      setShares(await api.listShares(resourceType, resourceId))
    } catch (e: any) {
      message.error('加载分享列表失败: ' + (e.message || e))
    } finally {
      setLoading(false)
    }
  }, [resourceType, resourceId])

  const loadTeams = useCallback(async () => {
    try {
      setTeams(await api.listTeams())
    } catch (e: any) {
      message.error('加载团队列表失败: ' + (e.message || e))
    }
  }, [])

  const loadGroups = useCallback(async () => {
    try {
      setGroups(await api.listGroups())
    } catch (e: any) {
      message.error('加载用户组列表失败: ' + (e.message || e))
    }
  }, [])

  // 拉取用户列表（最多前20个），并合并进缓存供分享列表显示名字
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
    if (open) {
      loadShares()
      loadTeams()
      loadGroups()
      fetchUsers('') // 自动拉取前20个用户
      setSelectedUserId('')
      setSelectedUser(null)
      setSelectedTeamId('')
      setSelectedGroupId('')
      setCanEdit(false)
    }
  }, [open, loadShares, loadTeams, loadGroups, fetchUsers])

  const handleAdd = async (shareToType: ShareToType, shareToId: string) => {
    if (!shareToId || resourceIds.length === 0) return
    setSaving(true)
    try {
      for (const id of resourceIds) {
        await api.shareResource({ resource_type: resourceType, resource_id: id, share_to_type: shareToType, share_to_id: shareToId, can_edit: canEdit })
      }
      message.success(isBatch ? `已分享 ${resourceIds.length} 个资源` : '分享成功')
      setSelectedUserId('')
      setSelectedUser(null)
      setSelectedTeamId('')
      setSelectedGroupId('')
      if (resourceId) loadShares()
    } catch (e: any) {
      message.error('分享失败: ' + (e.message || e))
    } finally {
      setSaving(false)
    }
  }

  const handleToggleEdit = async (share: ShareRes) => {
    try {
      await api.shareResource({ resource_type: share.resource_type, resource_id: share.resource_id, share_to_type: share.share_to_type, share_to_id: share.share_to_id, can_edit: !share.can_edit })
      message.success('已更新权限')
      loadShares()
    } catch (e: any) {
      message.error('更新失败: ' + (e.message || e))
    }
  }

  const handleRemove = async (share: ShareRes) => {
    try {
      await api.unshareResource({ resource_type: share.resource_type, resource_id: share.resource_id, share_to_type: share.share_to_type, share_to_id: share.share_to_id })
      message.success('已取消分享')
      loadShares()
    } catch (e: any) {
      message.error('取消分享失败: ' + (e.message || e))
    }
  }

  const columns = [
    { title: '类型', dataIndex: 'share_to_type', width: 80, render: (t: string) =>
        t === 'user' ? <Tag color="blue">用户</Tag>
        : t === 'team' ? <Tag color="green">团队</Tag>
        : <Tag color="purple">用户组</Tag>
    },
    { title: '接收者', dataIndex: 'share_to_id', width: 180, render: (_: string, r: ShareRes) => {
        if (r.share_to_type === 'team') {
          const team = teams.find((t) => t.id === r.share_to_id)
          return team ? team.name : r.share_to_id
        }
        if (r.share_to_type === 'group') {
          const group = groups.find((g) => g.id === r.share_to_id)
          return group ? `${group.name}（${group.member_count}人）` : r.share_to_id
        }
        const user = users.find((u) => u.user_id === r.share_to_id) || userCache[r.share_to_id]
        return user ? `${user.display_name} (${r.share_to_id})` : r.share_to_id
      },
    },
    {
      title: '权限', dataIndex: 'can_edit', width: 100,
      render: (v: boolean) => (v ? <Tag color="orange">可编辑</Tag> : <Tag>只读</Tag>),
    },
    {
      title: '操作', width: 160,
      render: (_: unknown, r: ShareRes) => (
        <Space>
          <Button size="small" onClick={() => handleToggleEdit(r)}>{r.can_edit ? '设为只读' : '设为可编辑'}</Button>
          <Popconfirm title="确定取消此分享？" onConfirm={() => handleRemove(r)}>
            <Button size="small" danger>取消分享</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const typeName = resourceType === 'dashboard' ? '仪表板' : '快照'
  const title = isBatch
    ? `分享 ${resourceIds.length} 个${typeName}`
    : `分享${typeName}${resourceNames?.[0] ? ` - ${resourceNames[0]}` : ''}`

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      destroyOnHidden
    >
      <Tabs
        items={[
          {
            key: 'users',
            label: '分享给用户',
            children: (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
                <Checkbox checked={canEdit} onChange={(e) => setCanEdit(e.target.checked)}>可编辑</Checkbox>
                <Button type="primary" disabled={!selectedUserId} loading={saving} onClick={() => handleAdd('user', selectedUserId)}>添加</Button>
              </div>
            ),
          },
          {
            key: 'teams',
            label: '分享给团队',
            children: (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Select
                  placeholder="选择团队"
                  style={{ width: 220 }}
                  value={selectedTeamId || undefined}
                  onChange={setSelectedTeamId}
                  options={teams.map((t) => ({ value: t.id, label: t.name }))}
                />
                <Checkbox checked={canEdit} onChange={(e) => setCanEdit(e.target.checked)}>可编辑</Checkbox>
                <Button type="primary" disabled={!selectedTeamId} loading={saving} onClick={() => handleAdd('team', selectedTeamId)}>添加</Button>
              </div>
            ),
          },
          {
            key: 'groups',
            label: '分享给用户组',
            children: (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Select
                  placeholder="选择用户组（需先在用户组管理中创建）"
                  style={{ width: 300 }}
                  value={selectedGroupId || undefined}
                  onChange={setSelectedGroupId}
                  options={groups.map((g) => ({ value: g.id, label: `${g.name}（${g.member_count}人）` }))}
                  notFoundContent="暂无用户组，请先创建"
                />
                <Checkbox checked={canEdit} onChange={(e) => setCanEdit(e.target.checked)}>可编辑</Checkbox>
                <Button type="primary" disabled={!selectedGroupId} loading={saving} onClick={() => handleAdd('group', selectedGroupId)}>添加</Button>
              </div>
            ),
          },
        ]}
      />

      {isBatch ? (
        <div style={{ marginTop: 16, padding: 12, background: '#fafafa', borderRadius: 6, fontSize: 13, color: 'var(--text-secondary, #666)' }}>
          批量分享将对选中的 {resourceIds.length} 个资源逐一添加分享；如需查看/取消单个资源的分享，请在对应资源上单独操作。
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <Table
            rowKey="id"
            size="small"
            loading={loading}
            columns={columns}
            dataSource={shares}
            pagination={false}
            locale={{ emptyText: '暂无分享，请在上方添加' }}
          />
        </div>
      )}
    </Modal>
  )
}
