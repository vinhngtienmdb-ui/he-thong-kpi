import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  X, 
  Search, 
  Check, 
  Edit, 
  Trash2, 
  AlertCircle, 
  Building2, 
  UserCheck, 
  Sparkles 
} from 'lucide-react';
import { api } from '../api';

export default function UserGroupManagementModal({ 
  isOpen, 
  onClose, 
  users = [], 
  departments = [], 
  onGroupsUpdated 
}) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    dept_id: '',
    member_ids: []
  });

  const [memberSearch, setMemberSearch] = useState('');
  const [memberDeptFilter, setMemberDeptFilter] = useState('all');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadGroups();
      resetForm();
    }
  }, [isOpen]);

  async function loadGroups() {
    try {
      setLoading(true);
      const data = await api.getUserGroups();
      setGroups(data || []);
      if (onGroupsUpdated) onGroupsUpdated(data || []);
    } catch (err) {
      console.error('Error loading groups:', err);
      setErrorMsg('Lỗi tải danh sách nhóm: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setEditingGroupId(null);
    setFormData({
      name: '',
      description: '',
      dept_id: '',
      member_ids: []
    });
    setIsFormOpen(false);
    setErrorMsg('');
    setMemberSearch('');
    setMemberDeptFilter('all');
  }

  function handleOpenCreate() {
    resetForm();
    setIsFormOpen(true);
  }

  function handleOpenEdit(group) {
    setEditingGroupId(group.id);
    const existingMemberIds = (group.members || []).map(m => m.user_id || m.id);
    setFormData({
      name: group.name || '',
      description: group.description || '',
      dept_id: group.dept_id || '',
      member_ids: existingMemberIds
    });
    setIsFormOpen(true);
    setErrorMsg('');
  }

  async function handleDeleteGroup(group) {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa nhóm "${group.name}"?`)) return;
    try {
      await api.deleteUserGroup(group.id);
      await loadGroups();
      if (editingGroupId === group.id) resetForm();
    } catch (err) {
      alert('Lỗi xóa nhóm: ' + err.message);
    }
  }

  function toggleMember(userId) {
    setFormData(prev => {
      const exists = prev.member_ids.includes(userId);
      return {
        ...prev,
        member_ids: exists 
          ? prev.member_ids.filter(id => id !== userId) 
          : [...prev.member_ids, userId]
      };
    });
  }

  function handleSelectAllFiltered(filteredList) {
    const idsToAdd = filteredList.map(u => u.id);
    setFormData(prev => ({
      ...prev,
      member_ids: [...new Set([...prev.member_ids, ...idsToAdd])]
    }));
  }

  function handleDeselectAllFiltered(filteredList) {
    const idsToRemove = new Set(filteredList.map(u => u.id));
    setFormData(prev => ({
      ...prev,
      member_ids: prev.member_ids.filter(id => !idsToRemove.has(id))
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.name.trim()) {
      setErrorMsg('Vui lòng nhập tên nhóm!');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg('');

      if (editingGroupId) {
        await api.updateUserGroup(editingGroupId, formData);
      } else {
        await api.createUserGroup(formData);
      }

      await loadGroups();
      resetForm();
    } catch (err) {
      setErrorMsg(err.message || 'Lỗi lưu thông tin nhóm');
    } finally {
      setSubmitting(false);
    }
  }

  const filteredUsers = users.filter(u => {
    if (u.role === 'admin') return false;
    const matchesSearch = !memberSearch.trim() || 
      u.full_name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
      u.username?.toLowerCase().includes(memberSearch.toLowerCase()) ||
      u.gov_title?.toLowerCase().includes(memberSearch.toLowerCase());
    const matchesDept = memberDeptFilter === 'all' || u.dept_id === memberDeptFilter;
    return matchesSearch && matchesDept;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-700 via-indigo-800 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <Users className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h2 className="text-base font-bold">Quản lý Nhóm người dùng & Tổ công tác tự tạo</h2>
              <p className="text-xs text-indigo-200">
                Tạo các nhóm làm việc (Tổ công tác, Ban chuyên môn) để giao việc hoặc phân bổ văn bản nhanh cho nhiều người
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-rose-700 text-xs font-medium">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Top action: Add new button */}
          {!isFormOpen && (
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Danh sách nhóm đã tạo ({groups.length})</h3>
                <p className="text-xs text-slate-500">Các nhóm này có thể được dùng ngay khi Giao việc hoặc Phân bổ văn bản</p>
              </div>
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Tạo nhóm mới</span>
              </button>
            </div>
          )}

          {/* Form Create / Edit */}
          {isFormOpen ? (
            <form onSubmit={handleSubmit} className="bg-slate-50 p-5 rounded-xl border border-indigo-100 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <h4 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  {editingGroupId ? 'Cập nhật nhóm người dùng' : 'Tạo nhóm người dùng mới'}
                </h4>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-slate-500 hover:text-slate-800 px-2.5 py-1 bg-white rounded border border-slate-200 hover:bg-slate-100 transition cursor-pointer"
                >
                  Hủy & Quay lại danh sách
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tên nhóm / Tổ công tác <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Tổ Chuyển đổi số, Tổ thẩm định hồ sơ..."
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Đơn vị / Phòng ban phụ trách (Tùy chọn)
                  </label>
                  <select
                    value={formData.dept_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, dept_id: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="">-- Toàn cơ quan (Mọi phòng ban) --</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mô tả nhiệm vụ / chức năng của nhóm
                </label>
                <input
                  type="text"
                  placeholder="VD: Chuyên trách thẩm định và tham mưu các nội dung liên quan CNTT"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Member Selection Section */}
              <div className="space-y-2 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    Chọn thành viên tham gia nhóm (Đã chọn: <span className="text-indigo-600 font-extrabold">{formData.member_ids.length}</span> cán bộ)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectAllFiltered(filteredUsers)}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold px-2 py-1 bg-indigo-50 hover:bg-indigo-100 rounded border border-indigo-200 transition cursor-pointer"
                    >
                      Chọn tất cả danh sách lọc
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeselectAllFiltered(filteredUsers)}
                      className="text-[11px] text-slate-600 hover:text-slate-800 font-semibold px-2 py-1 bg-white hover:bg-slate-100 rounded border border-slate-200 transition cursor-pointer"
                    >
                      Bỏ chọn danh sách lọc
                    </button>
                  </div>
                </div>

                {/* Filters for users */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-white p-2.5 rounded-lg border border-slate-200">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Tìm theo họ tên, chức danh..."
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-md focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <select
                    value={memberDeptFilter}
                    onChange={(e) => setMemberDeptFilter(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-md focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="all">Tất cả phòng ban</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                {/* Users checklist */}
                <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Không tìm thấy cán bộ nào phù hợp với bộ lọc
                    </div>
                  ) : (
                    filteredUsers.map(u => {
                      const isChecked = formData.member_ids.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className={`px-3.5 py-2 flex items-center justify-between hover:bg-indigo-50/50 cursor-pointer transition ${
                            isChecked ? 'bg-indigo-50/70' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleMember(u.id)}
                              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                            />
                            <div>
                              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                <span>{u.full_name}</span>
                                <span className="text-[10px] font-normal text-slate-400">({u.username})</span>
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                                <span>{u.gov_title || 'Chuyên viên'}</span>
                                {u.dept_name && (
                                  <>
                                    <span>•</span>
                                    <span className="text-slate-600">{u.dept_name}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {isChecked && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                              <Check className="w-3 h-3" />
                              Đã chọn
                            </span>
                          )}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Đang lưu...' : (editingGroupId ? 'Lưu cập nhật' : 'Tạo nhóm')}
                </button>
              </div>
            </form>
          ) : (
            /* Groups List */
            <div className="space-y-3">
              {loading ? (
                <div className="text-center py-10 text-xs text-slate-400">
                  Đang nạp danh sách nhóm...
                </div>
              ) : groups.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-600">Chưa có nhóm nào được tạo</p>
                  <p className="text-xs text-slate-400 mt-1">Bấm nút "Tạo nhóm mới" ở góc trên để tạo tổ công tác đầu tiên</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {groups.map(g => (
                    <div 
                      key={g.id}
                      className="bg-white border border-slate-200 hover:border-indigo-300 rounded-xl p-4 shadow-xs transition space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{g.name}</span>
                            <span className="text-xs font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                              {g.member_count || (g.members || []).length} thành viên
                            </span>
                          </h4>
                          {g.description && (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{g.description}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(g)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition cursor-pointer"
                            title="Sửa nhóm & thành viên"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteGroup(g)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                            title="Xóa nhóm"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Scope and members summary */}
                      <div className="pt-2 border-t border-slate-100 text-[11px] space-y-1">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{g.dept_name || 'Toàn cơ quan'}</span>
                        </div>

                        {g.members && g.members.length > 0 && (
                          <div className="text-slate-600 flex flex-wrap gap-1 pt-1">
                            {g.members.slice(0, 4).map(m => (
                              <span key={m.user_id || m.id} className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                {m.full_name}
                              </span>
                            ))}
                            {g.members.length > 4 && (
                              <span className="text-slate-400 text-[10px] self-center">
                                +{g.members.length - 4} người khác
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Dữ liệu nhóm được đồng bộ tức thì lên Supabase Cloud</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg font-medium transition cursor-pointer"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
}
