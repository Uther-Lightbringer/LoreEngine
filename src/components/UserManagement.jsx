import React, { useState, useEffect } from 'react';
import { getToken } from '../services/authService.js';
import './UserManagement.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:29999/api';

const UserManagement = ({ onBack }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [editPassword, setEditPassword] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = getToken();
      const response = await fetch(`${API_BASE}/users`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      setUsers(data);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;

    try {
      const token = getToken();
      const response = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username: newUsername, password: newPassword })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to create user');
      }

      setNewUsername('');
      setNewPassword('');
      setShowAddForm(false);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdatePassword = async (userId) => {
    if (!editPassword) return;

    try {
      const token = getToken();
      const response = await fetch(`${API_BASE}/users/${userId}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: editPassword })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to update password');
      }

      setEditingUser(null);
      setEditPassword('');
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!confirm(`确定要删除用户 "${username}" 吗？此操作不可恢复。`)) {
      return;
    }

    try {
      const token = getToken();
      const response = await fetch(`${API_BASE}/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to delete user');
      }

      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="user-management">
      <div className="header">
        <h2>用户管理</h2>
        <button className="back-btn" onClick={onBack}>返回</button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="actions">
        <button className="add-btn" onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? '取消' : '添加用户'}
        </button>
      </div>

      {showAddForm && (
        <form className="add-form" onSubmit={handleAddUser}>
          <h3>添加新用户</h3>
          <div className="form-row">
            <input
              type="text"
              placeholder="用户名"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="密码"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <button type="submit">创建</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="loading">加载中...</p>
      ) : (
        <table className="users-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>用户名</th>
              <th>角色</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td>{user.username}</td>
                <td>{user.is_admin ? '管理员' : '普通用户'}</td>
                <td>{new Date(user.created_at).toLocaleString()}</td>
                <td>
                  {user.username === 'admin' ? (
                    <span className="protected">受保护</span>
                  ) : (
                    <div className="action-buttons">
                      {editingUser === user.id ? (
                        <>
                          <input
                            type="password"
                            placeholder="新密码"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                          />
                          <button onClick={() => handleUpdatePassword(user.id)}>保存</button>
                          <button onClick={() => { setEditingUser(null); setEditPassword(''); }}>取消</button>
                        </>
                      ) : (
                        <>
                          <button className="edit-btn" onClick={() => setEditingUser(user.id)}>改密码</button>
                          <button className="delete-btn" onClick={() => handleDeleteUser(user.id, user.username)}>删除</button>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default UserManagement;
