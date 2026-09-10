import React, { useEffect, useState, useMemo } from 'react';
import { 
  ClipboardCheck, 
  Send, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Search, 
  Filter, 
  Building2, 
  User, 
  Award, 
  ShieldCheck, 
  Save, 
  Check, 
  ArrowRight, 
  Users, 
  FileText,
  MessageSquare,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw
} from 'lucide-react';
import { api } from '../api';

const RANK_OPTIONS = [
  'Hoàn thành xuất sắc nhiệm vụ',
  'Hoàn thành tốt nhiệm vụ',
  'Hoàn thành nhiệm vụ',
  'Không hoàn thành nhiệm vụ'
];

function getRankBadgeClass(rank) {
  if (!rank) return 'bg-slate-100 text-slate-500 border-slate-200';
  if (rank.includes('xuất sắc')) return 'bg-amber-50 text-amber-700 border-amber-300 font-bold';
  if (rank.includes('tốt')) return 'bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold';
  if (rank.includes('Không')) return 'bg-rose-50 text-rose-700 border-rose-300 font-semibold';
  return 'bg-blue-50 text-blue-700 border-blue-300';
}

export default function AdvisoryTab({ selectedPeriod, currentUser, users = [] }) {
  const [advisoryList, setAdvisoryList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingRows, setEditingRows] = useState({}); // { [evalId]: { rank, comment } }
  const [savingId, setSavingId] = useState(null);
  const [submittingBulk, setSubmittingBulk] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    loadData();
  }, [selectedPeriod]);

  async function loadData() {
    try {
      setLoading(true);
      const data = await api.getAdvisorySummary(selectedPeriod);
      setAdvisoryList(data);
      
      // Khởi tạo state chỉnh sửa theo dữ liệu hiện tại
      const rowState = {};
      data.forEach(item => {
        const key = item.evaluation_id || item.user_id;
        rowState[key] = {
          rank: item.advisory_rank || item.superior_rank || item.rank_proposed || 'Hoàn thành tốt nhiệm vụ',
          comment: item.advisory_comment || ''
        };
      });
      setEditingRows(rowState);
    } catch (err) {
      console.error('Lỗi tải danh sách tham mưu:', err);
    } finally {
      setLoading(false);
    }
  }

  // Danh sách các phòng ban duy nhất để lọc
  const departments = useMemo(() => {
    const set = new Set();
    advisoryList.forEach(item => {
      if (item.dept_name) set.add(item.dept_name);
    });
    return Array.from(set).sort();
  }, [advisoryList]);

  // Bộ lọc dữ liệu
  const filteredList = useMemo(() => {
    return advisoryList.filter(item => {
      // Tìm kiếm theo tên hoặc chức vụ
      const matchSearch = !searchTerm.trim() || 
        item.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.gov_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.party_title?.toLowerCase().includes(searchTerm.toLowerCase());

      // Lọc theo phòng ban
      const matchDept = deptFilter === 'all' || item.dept_name === deptFilter;

      // Lọc theo trạng thái trình biểu quyết
      let matchStatus = true;
      if (statusFilter === 'submitted') {
        matchStatus = item.is_advisory_submitted === 1;
      } else if (statusFilter === 'pending') {
        matchStatus = !item.is_advisory_submitted;
      } else if (statusFilter === 'has_comment') {
        matchStatus = Boolean(item.advisory_comment || item.advisory_rank);
      }

      return matchSearch && matchDept && matchStatus;
    });
  }, [advisoryList, searchTerm, deptFilter, statusFilter]);

  // Thống kê nhanh
  const stats = useMemo(() => {
    const total = advisoryList.length;
    const submittedCount = advisoryList.filter(i => i.is_advisory_submitted === 1).length;
    const hasSuperiorEval = advisoryList.filter(i => Boolean(i.superior_rank)).length;
    const hasFeedback = advisoryList.filter(i => i.task_feedback_count > 0).length;
    return {
      total,
      submittedCount,
      pendingCount: total - submittedCount,
      hasSuperiorEval,
      hasFeedback
    };
  }, [advisoryList]);

  // Cập nhật giá trị đang chỉnh sửa
  const handleInputChange = (key, field, value) => {
    setEditingRows(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [field]: value
      }
    }));
  };

  // Lưu ý kiến tham mưu cho 1 cán bộ
  const handleSaveSingle = async (item) => {
    const key = item.evaluation_id || item.user_id;
    const current = editingRows[key] || {};
    try {
      setSavingId(key);
      await api.saveAdvisoryProposal({
        evaluation_id: item.evaluation_id,
        user_id: item.user_id,
        period_id: selectedPeriod,
        advisory_rank: current.rank,
        advisory_comment: current.comment
      });
      setSuccessMsg(`Đã lưu ý kiến tham mưu cho đ/c ${item.full_name}!`);
      setTimeout(() => setSuccessMsg(''), 3000);
      await loadData();
    } catch (err) {
      alert('Lỗi lưu tham mưu: ' + err.message);
    } finally {
      setSavingId(null);
    }
  };

  // Trình biểu quyết cho 1 cán bộ
  const handleSubmitSingle = async (item) => {
    if (!window.confirm(`Xác nhận Trình biểu quyết hồ sơ của đ/c "${item.full_name}" lên Hội đồng Tập thể Lãnh đạo?`)) return;
    try {
      setSavingId(item.evaluation_id || item.user_id);
      
      // Lưu ý kiến trước khi trình
      const key = item.evaluation_id || item.user_id;
      const current = editingRows[key] || {};
      await api.saveAdvisoryProposal({
        evaluation_id: item.evaluation_id,
        user_id: item.user_id,
        period_id: selectedPeriod,
        advisory_rank: current.rank,
        advisory_comment: current.comment
      });

      // Bấm trình biểu quyết
      await api.submitAdvisoryToVoting({
        period_id: selectedPeriod,
        items: [{ user_id: item.user_id, evaluation_id: item.evaluation_id }]
      });

      setSuccessMsg(`Đã trình biểu quyết hồ sơ của đ/c ${item.full_name} thành công!`);
      setTimeout(() => setSuccessMsg(''), 3500);
      await loadData();
    } catch (err) {
      alert('Lỗi trình biểu quyết: ' + err.message);
    } finally {
      setSavingId(null);
    }
  };

  // Chọn / bỏ chọn tất cả
  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredList.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredList.map(i => i.user_id));
    }
  };

  const handleToggleSelectOne = (userId) => {
    setSelectedIds(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  // Trình biểu quyết hàng loạt
  const handleSubmitBulk = async () => {
    if (selectedIds.length === 0) {
      alert('Vui lòng chọn ít nhất 1 cán bộ để trình biểu quyết');
      return;
    }

    const selectedItems = advisoryList.filter(i => selectedIds.includes(i.user_id));
    if (!window.confirm(`XÁC NHẬN TRÌNH BIỂU QUYẾT HÀNG LOẠT?\n\nBạn đang chọn ${selectedItems.length} hồ sơ để trình lên Tập thể Lãnh đạo biểu quyết tại Bước 7. Tiếp tục?`)) {
      return;
    }

    try {
      setSubmittingBulk(true);

      // Lưu các đề xuất hiện tại trước khi submit
      for (const item of selectedItems) {
        const key = item.evaluation_id || item.user_id;
        const current = editingRows[key];
        if (current) {
          await api.saveAdvisoryProposal({
            evaluation_id: item.evaluation_id,
            user_id: item.user_id,
            period_id: selectedPeriod,
            advisory_rank: current.rank,
            advisory_comment: current.comment
          });
        }
      }

      // Trình biểu quyết
      await api.submitAdvisoryToVoting({
        period_id: selectedPeriod,
        items: selectedItems.map(i => ({ user_id: i.user_id, evaluation_id: i.evaluation_id }))
      });

      setSuccessMsg(`Đã trình biểu quyết thành công ${selectedItems.length} hồ sơ!`);
      setSelectedIds([]);
      setTimeout(() => setSuccessMsg(''), 4000);
      await loadData();
    } catch (err) {
      alert('Lỗi trình biểu quyết hàng loạt: ' + err.message);
    } finally {
      setSubmittingBulk(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2 text-xs">
          <div className="w-6 h-6 rounded-full bg-red-700 text-white flex items-center justify-center font-bold text-[10px] shadow-xs shrink-0">
            6
          </div>
          <div className="flex items-center gap-1 font-semibold truncate">
            <span className="text-slate-500">Quản lý đánh giá</span>
            <span className="text-slate-400">&gt;</span>
            <span className="text-red-700 font-bold">Bước 6: Cơ quan Tham mưu Tổng hợp & Trình biểu quyết</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-red-600' : ''}`} />
            Làm mới
          </button>
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={handleSubmitBulk}
              disabled={submittingBulk}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-bold transition shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              Trình biểu quyết ({selectedIds.length})
            </button>
          )}
        </div>
      </div>

      {/* Thông báo thành công */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fade-in shadow-2xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 2. Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Tổng số hồ sơ</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-black text-slate-800 mt-1">{stats.total}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Cán bộ, công chức trong kỳ</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Lãnh đạo đã chấm</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black text-emerald-700 mt-1">{stats.hasSuperiorEval} / {stats.total}</div>
          <div className="text-[11px] text-emerald-600 font-medium mt-0.5">Đã có kết luận Bước 5</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Chờ trình biểu quyết</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-black text-amber-600 mt-1">{stats.pendingCount}</div>
          <div className="text-[11px] text-amber-600 font-medium mt-0.5">Cần tham mưu thẩm tra</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Đã trình biểu quyết</span>
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-black text-blue-700 mt-1">{stats.submittedCount}</div>
          <div className="text-[11px] text-blue-600 font-medium mt-0.5">Sẵn sàng tại Bước 7</div>
        </div>
      </div>

      {/* 3. Toolbar & Filters */}
      <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          {/* Search box */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo tên cán bộ, chức vụ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white transition"
            />
          </div>

          {/* Department Filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 focus:ring-2 focus:ring-red-500"
          >
            <option value="all">Tất cả đơn vị / phòng ban</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 focus:ring-2 focus:ring-red-500"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="pending">Chờ trình biểu quyết</option>
            <option value="submitted">Đã trình biểu quyết (Bước 7)</option>
            <option value="has_comment">Đã nhập ý kiến tham mưu</option>
          </select>
        </div>

        {/* Bulk select action indicator */}
        <div className="text-xs text-slate-500 font-medium flex items-center gap-2">
          <span>Đang hiển thị: <strong className="text-slate-800">{filteredList.length}</strong> cán bộ</span>
        </div>
      </div>

      {/* 4. Table view */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold">
                <th className="py-2.5 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={filteredList.length > 0 && selectedIds.length === filteredList.length}
                    onChange={handleToggleSelectAll}
                    className="rounded text-red-600 focus:ring-red-500 cursor-pointer"
                  />
                </th>
                <th className="py-2.5 px-3 min-w-[170px]">Cán bộ / Đơn vị</th>
                <th className="py-2.5 px-3 min-w-[150px] bg-slate-100/50">Tự đánh giá (B4)</th>
                <th className="py-2.5 px-3 min-w-[170px] bg-blue-50/40">Lãnh đạo trực tiếp (B5)</th>
                <th className="py-2.5 px-3 min-w-[240px] bg-red-50/30">Ý kiến & Đề xuất Tham mưu (B6)</th>
                <th className="py-2.5 px-3 min-w-[140px] text-center">Trạng thái / Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                    Không tìm thấy dữ liệu cán bộ phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredList.map((item, idx) => {
                  const key = item.evaluation_id || item.user_id;
                  const currentEdit = editingRows[key] || {
                    rank: item.advisory_rank || item.superior_rank || item.rank_proposed || 'Hoàn thành tốt nhiệm vụ',
                    comment: item.advisory_comment || ''
                  };
                  const isSelected = selectedIds.includes(item.user_id);
                  const isSubmitted = item.is_advisory_submitted === 1;
                  const isSaving = savingId === key;

                  return (
                    <tr key={key} className={`hover:bg-slate-50/80 transition ${isSelected ? 'bg-red-50/30' : ''}`}>
                      {/* Checkbox */}
                      <td className="py-3 px-3 text-center align-top">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectOne(item.user_id)}
                          className="rounded text-red-600 focus:ring-red-500 cursor-pointer mt-1"
                        />
                      </td>

                      {/* Thông tin Cán bộ */}
                      <td className="py-3 px-3 align-top">
                        <div className="font-bold text-slate-900">{item.full_name}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{item.dept_name || 'Chưa phân bổ'}</span>
                        </div>
                        <div className="text-[11px] text-slate-600 font-medium mt-0.5">
                          {item.gov_title || item.party_title || 'Chuyên viên'}
                        </div>
                        {item.task_feedback_count > 0 && (
                          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold mt-1">
                            <MessageSquare className="w-2.5 h-2.5" />
                            <span>Có {item.task_feedback_count} phản hồi B4</span>
                          </div>
                        )}
                      </td>

                      {/* Kết quả Tự đánh giá (Bước 4) */}
                      <td className="py-3 px-3 align-top bg-slate-50/40">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Phần I (30đ):</span>
                          <strong className="text-slate-800">{item.part1_score ?? '--'}</strong>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Phần II (70đ):</span>
                          <strong className="text-slate-800">{item.part2_score ?? '--'}</strong>
                        </div>
                        <div className="flex items-center justify-between text-[11px] border-t border-slate-200/60 pt-0.5 mt-0.5">
                          <span className="text-slate-600 font-bold">Tổng điểm:</span>
                          <strong className="text-red-700 font-black">{item.total_score ?? '--'}</strong>
                        </div>
                        <div className="mt-1.5">
                          <span className={`inline-block text-[10px] px-2 py-0.5 rounded border leading-tight ${getRankBadgeClass(item.rank_proposed)}`}>
                            {item.rank_proposed || 'Chưa tự xếp loại'}
                          </span>
                        </div>
                      </td>

                      {/* Kết quả Lãnh đạo trực tiếp (Bước 5) */}
                      <td className="py-3 px-3 align-top bg-blue-50/20">
                        {item.superior_rank ? (
                          <>
                            <div className="flex items-center gap-1 text-[11px]">
                              <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span className="font-semibold text-slate-700">Đề xuất của LĐ:</span>
                            </div>
                            <div className="mt-1">
                              <span className={`inline-block text-[10px] px-2 py-0.5 rounded border leading-tight ${getRankBadgeClass(item.superior_rank)}`}>
                                {item.superior_rank}
                              </span>
                            </div>
                            {item.superior_comment && (
                              <p className="text-[11px] text-slate-600 italic bg-white/70 p-1.5 rounded border border-blue-100 mt-1 line-clamp-3" title={item.superior_comment}>
                                "{item.superior_comment}"
                              </p>
                            )}
                          </>
                        ) : (
                          <div className="text-[11px] text-slate-400 italic py-2">
                            Lãnh đạo chưa hoàn tất đánh giá Bước 5
                          </div>
                        )}
                      </td>

                      {/* Cơ quan Tham mưu (Bước 6) */}
                      <td className="py-3 px-3 align-top bg-red-50/10">
                        <div className="space-y-1.5">
                          <div>
                            <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-0.5">
                              Đề xuất xếp loại của Tham mưu:
                            </label>
                            <select
                              value={currentEdit.rank}
                              onChange={(e) => handleInputChange(key, 'rank', e.target.value)}
                              disabled={isSubmitted}
                              className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-lg p-1.5 focus:ring-2 focus:ring-red-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                            >
                              {RANK_OPTIONS.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-0.5">
                              Ý kiến nhận xét / Thẩm tra hồ sơ:
                            </label>
                            <textarea
                              rows={2}
                              value={currentEdit.comment}
                              onChange={(e) => handleInputChange(key, 'comment', e.target.value)}
                              disabled={isSubmitted}
                              placeholder="Nhập ý kiến thẩm tra hồ sơ, thành tích đột xuất hoặc lưu ý..."
                              className="w-full text-xs p-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 resize-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                            />
                          </div>

                          {!isSubmitted && (
                            <button
                              type="button"
                              onClick={() => handleSaveSingle(item)}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold transition"
                            >
                              <Save className="w-3 h-3" />
                              {isSaving ? 'Đang lưu...' : 'Lưu ý kiến'}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Trạng thái & Nút Trình biểu quyết */}
                      <td className="py-3 px-3 align-middle text-center">
                        {isSubmitted ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-300">
                              <CheckCircle2 className="w-3 h-3" />
                              Đã trình biểu quyết
                            </span>
                            {item.advisory_submitted_at && (
                              <div className="text-[9px] text-slate-400">
                                {new Date(item.advisory_submitted_at).toLocaleDateString('vi-VN')}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200">
                              <Clock className="w-2.5 h-2.5" />
                              Chờ trình
                            </span>
                            <div>
                              <button
                                type="button"
                                onClick={() => handleSubmitSingle(item)}
                                disabled={isSaving}
                                className="inline-flex items-center justify-center gap-1 w-full px-2.5 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-bold transition shadow-2xs"
                              >
                                <Send className="w-3 h-3" />
                                Trình BQ
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Guidance */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 flex items-start gap-2.5">
        <Sparkles className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-bold text-slate-800">Quy định Bước 6 theo Hướng dẫn 06-HD/BTCTU:</p>
          <p>Cơ quan/bộ phận tham mưu (Phòng Tổ chức cán bộ, Văn phòng) có trách nhiệm rà soát toàn bộ kết quả tự đánh giá và điểm số của Lãnh đạo trực tiếp, tổng hợp hồ sơ và trình Tập thể Lãnh đạo biểu quyết tại Bước 7. Người thực hiện tham mưu không phải là người quyết định xếp loại cuối cùng.</p>
        </div>
      </div>
    </div>
  );
}
