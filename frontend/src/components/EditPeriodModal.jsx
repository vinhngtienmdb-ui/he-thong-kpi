import React, { useState, useEffect } from 'react';
import { Calendar, Edit3, X, Check, AlertCircle, Clock, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { formatDate } from '../constants';

export default function EditPeriodModal({ period, isOpen, onClose, onUpdated }) {
  if (!isOpen || !period) return null;

  const [formData, setFormData] = useState({
    name: period.name || '',
    code: period.code || '',
    start_date: period.start_date || '',
    end_date: period.end_date || '',
    grading_lock_date: period.grading_lock_date || '',
    is_active: period.is_active !== 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (period) {
      setFormData({
        name: period.name || '',
        code: period.code || '',
        start_date: period.start_date || '',
        end_date: period.end_date || '',
        grading_lock_date: period.grading_lock_date || '',
        is_active: period.is_active !== 0
      });
      setError('');
    }
  }, [period]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Vui lòng nhập tên kỳ đánh giá!');
      return;
    }
    if (formData.start_date && formData.end_date && formData.start_date > formData.end_date) {
      setError('Ngày bắt đầu không được lớn hơn ngày kết thúc kỳ đánh giá!');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await api.updatePeriod(period.id, formData);
      if (onUpdated) onUpdated();
      onClose();
    } catch (err) {
      setError(err.message || 'Lỗi khi cập nhật kỳ đánh giá');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-red-700 to-red-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-amber-300" />
            <div>
              <h3 className="font-bold text-sm">Chỉnh sửa Kỳ đánh giá (Đang mở)</h3>
              <p className="text-[11px] text-red-100">Cập nhật thời hạn và thông tin điều hành của kỳ đánh giá</p>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-amber-900 leading-relaxed text-[11px]">
              Kỳ đánh giá này đang ở trạng thái <b>Mở</b> (chưa chốt sổ). Cán bộ quản lý và Lãnh đạo có thể điều chỉnh ngày kết thúc hoặc hạn chấm điểm theo kế hoạch công tác thực tế.
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Tên kỳ đánh giá <span className="text-red-600">*</span>:
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ví dụ: Đánh giá Quý IV/2026"
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-red-500 focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Mã định danh kỳ:</label>
              <input
                type="text"
                disabled
                value={formData.code}
                className="w-full p-2.5 bg-slate-100 border border-slate-300 rounded-lg text-slate-500 font-mono cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Trạng thái kỳ:</label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="period_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded text-red-700 focus:ring-red-500 cursor-pointer"
                />
                <label htmlFor="period_active" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Đang hoạt động (Active)
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Ngày bắt đầu kỳ:</label>
              <input
                type="date"
                required
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-red-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Ngày kết thúc kỳ:</label>
              <input
                type="date"
                required
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-red-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Thời hạn khóa chấm điểm (Tùy chọn):</label>
            <input
              type="date"
              value={formData.grading_lock_date}
              onChange={(e) => setFormData({ ...formData, grading_lock_date: e.target.value })}
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-red-500 focus:outline-hidden"
            />
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Sau ngày này, hệ thống sẽ nhắc nhở các Cán bộ Quản lý hoàn tất thẩm định chấm điểm.
            </span>
          </div>

          {/* Action buttons */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <span>Đang lưu...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Lưu thay đổi</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
