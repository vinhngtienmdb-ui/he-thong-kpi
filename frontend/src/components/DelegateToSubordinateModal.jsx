import React, { useState, useEffect } from 'react';
import { Users, UserPlus, X, Check, AlertCircle, Clock, Calendar, ArrowRight, UserCheck } from 'lucide-react';
import { api } from '../api';
import { formatDate } from '../constants';

export default function DelegateToSubordinateModal({ task, isOpen, onClose, currentUser, onDelegated }) {
  if (!isOpen || !task) return null;

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [subordinateId, setSubordinateId] = useState('');
  const [deadline, setDeadline] = useState(task.deadline || '');
  const [difficultyWeight, setDifficultyWeight] = useState(task.difficulty_weight || 1.0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadSubordinates() {
      try {
        setLoadingUsers(true);
        const data = await api.getUsers();
        // Lọc cán bộ: Loại trừ chính người đang thực hiện nhiệm vụ này
        const filtered = (data || []).filter(u => u.id !== task.user_id && u.id !== currentUser?.id && u.is_active !== 0);
        setUsers(filtered);
        if (filtered.length > 0) {
          setSubordinateId(filtered[0].id);
        }
      } catch (err) {
        console.error('Error fetching users:', err);
      } finally {
        setLoadingUsers(false);
      }
    }

    if (isOpen) {
      loadSubordinates();
      setDeadline(task.deadline || '');
      setDifficultyWeight(task.difficulty_weight || 1.0);
      setNotes('');
      setError('');
    }
  }, [isOpen, task, currentUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subordinateId) {
      setError('Vui lòng chọn cán bộ cấp dưới nhận nhiệm vụ!');
      return;
    }
    if (!deadline) {
      setError('Vui lòng chọn hạn hoàn thành cho cấp dưới!');
      return;
    }
    if (task.deadline && deadline > task.deadline) {
      if (!window.confirm(`LƯU Ý: Hạn hoàn thành của cấp dưới (${formatDate(deadline)}) trễ hơn hạn chót của nhiệm vụ gốc (${formatDate(task.deadline)}). Bạn có chắc chắn muốn giao hạn này?`)) {
        return;
      }
    }

    try {
      setIsSubmitting(true);
      setError('');
      await api.delegateTaskToSubordinate(task.id, {
        subordinate_id: subordinateId,
        deadline,
        difficulty_weight: Number(difficultyWeight),
        notes: notes.trim()
      });

      if (onDelegated) onDelegated();
      onClose();
    } catch (err) {
      setError(err.message || 'Lỗi khi giao nhiệm vụ cho cấp dưới');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedSub = users.find(u => u.id === subordinateId);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-red-700 to-red-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-amber-300" />
            <div>
              <h3 className="font-bold text-sm">Giao nhiệm vụ cho Cấp dưới</h3>
              <p className="text-[11px] text-red-100">Chuyển giao nhiệm vụ công việc để cấp dưới thực hiện và nộp minh chứng</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Task Summary Banner */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 text-xs space-y-1.5">
          <div className="text-[10px] font-bold uppercase text-slate-400">Nhiệm vụ gốc:</div>
          <div className="font-bold text-slate-900 text-sm">{task.task_name}</div>
          <div className="flex flex-wrap items-center gap-3 text-slate-600 text-[11px] pt-1">
            <span>Hạn hoàn thành gốc: <b className="text-red-700">{formatDate(task.deadline)}</b></span>
            <span>•</span>
            <span>Điểm chuẩn: <b>{task.standard_score || 10}đ</b></span>
            <span>•</span>
            <span>Hệ số độ khó: <b>{task.difficulty_weight || 1.0}</b></span>
          </div>
          {task.delegated_to_user_name && (
            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 font-semibold text-[11px]">
              ℹ Nhiệm vụ này hiện đã được giao cho cán bộ: <b>{task.delegated_to_user_name}</b>. Việc giao lại sẽ tạo thêm phân bổ mới cho cấp dưới được chọn.
            </div>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Chọn cán bộ cấp dưới tiếp nhận <span className="text-red-600">*</span>:
            </label>
            {loadingUsers ? (
              <div className="p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-500 font-medium">
                Đang tải danh sách cán bộ...
              </div>
            ) : (
              <select
                required
                value={subordinateId}
                onChange={(e) => setSubordinateId(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-red-500 focus:outline-hidden cursor-pointer"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.gov_title || u.role || 'Cán bộ'} - {u.dept_name || 'Đơn vị'})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Hạn hoàn thành của cấp dưới <span className="text-red-600">*</span>:
              </label>
              <input
                type="date"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-semibold focus:ring-2 focus:ring-red-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Hệ số độ khó (HSĐK):
              </label>
              <input
                type="number"
                step="0.1"
                min="1.0"
                max="3.0"
                value={difficultyWeight}
                onChange={(e) => setDifficultyWeight(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-semibold focus:ring-2 focus:ring-red-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Chỉ đạo, hướng dẫn thực hiện cho cấp dưới:
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Nhập yêu cầu về nội dung, sản phẩm đầu ra, minh chứng cần nộp hoặc thời gian báo cáo tiến độ..."
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-hidden placeholder-slate-400"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Đang phân công...</span>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Xác nhận giao nhiệm vụ</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
