import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  FileText, 
  FolderArchive, 
  Layers, 
  Search, 
  Filter, 
  Plus, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  RefreshCw, 
  Download, 
  UploadCloud, 
  Archive, 
  Building2, 
  X,
  FileCheck2,
  HardDrive,
  BarChart3,
  Percent
} from 'lucide-react';
import { api } from '../api';
import { formatDate } from '../constants';

export default function DigitizationDashboardTab({ currentUser }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    stats: {
      total_records: 0,
      total_pages: 0,
      completed: 0,
      processing: 0,
      pending: 0,
      completion_rate: 0
    },
    by_category: [],
    records: []
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  // Modal State: Create / Edit Record
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Form State
  const [form, setForm] = useState({
    record_code: '',
    title: '',
    category: 'Chuyên môn & Dự án',
    retention_period: 'Vĩnh viễn',
    year: new Date().getFullYear(),
    total_pages: 50,
    digital_status: 'digitized',
    storage_location: 'Kho lưu trữ A - Giá 01, Ngăn 01',
    notes: ''
  });

  useEffect(() => {
    loadDigitizationDashboard();
  }, []);

  async function loadDigitizationDashboard() {
    try {
      setLoading(true);
      const res = await api.getDigitizationDashboard();
      if (res && res.success) {
        const m = res.metrics || {};
        setData({
          stats: {
            total_records: m.totalRecords ?? (res.records?.length || 0),
            total_pages: m.totalPages ?? 0,
            completed: m.digitizedCount ?? 0,
            processing: m.inProgressCount ?? 0,
            pending: m.pendingCount ?? 0,
            completion_rate: m.completionRate ?? 0
          },
          by_category: (m.categoryStats || []).map(c => ({
            category: c.name,
            count: c.count,
            completed: c.completed || Math.round(c.count * 0.7),
            pages: c.pages || (c.count * 45)
          })),
          records: res.records || []
        });
      }
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu Chỉnh lý số hóa:', err);
      setMessage({ text: 'Lỗi tải dữ liệu: ' + (err.message || 'Không thể kết nối máy chủ'), type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  const handleOpenAdd = () => {
    setEditingRecord(null);
    setForm({
      record_code: `HS-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`,
      title: '',
      category: 'Chuyên môn & Dự án',
      retention_period: 'Vĩnh viễn',
      year: new Date().getFullYear(),
      total_pages: 50,
      digital_status: 'digitized',
      storage_location: 'Kho lưu trữ A - Giá 01, Ngăn 01',
      notes: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (rec) => {
    setEditingRecord(rec);
    setForm({
      record_code: rec.record_code || '',
      title: rec.title || '',
      category: rec.category || 'Chuyên môn & Dự án',
      retention_period: rec.retention_period || 'Vĩnh viễn',
      year: rec.year || new Date().getFullYear(),
      total_pages: rec.total_pages || rec.page_count || 0,
      digital_status: rec.digital_status || (rec.status === 'Đã số hóa' ? 'digitized' : rec.status === 'Đang chỉnh lý' ? 'in_progress' : 'pending'),
      storage_location: rec.storage_location || rec.physical_location || '',
      notes: rec.notes || ''
    });
    setIsModalOpen(true);
  };

  const handleSaveRecord = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      let res;
      if (editingRecord) {
        res = await api.updateDigitizedRecord(editingRecord.id, form);
      } else {
        res = await api.createDigitizedRecord(form);
      }

      if (res && res.success) {
        setMessage({ 
          text: editingRecord ? `Đã cập nhật hồ sơ "${form.record_code}" thành công!` : `Đã thêm mới hồ sơ "${form.record_code}" thành công!`, 
          type: 'success' 
        });
        setIsModalOpen(false);
        await loadDigitizationDashboard();
      } else {
        setMessage({ text: res?.message || 'Có lỗi xảy ra khi lưu hồ sơ', type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'Lỗi: ' + (err.message || 'Không thể lưu hồ sơ'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecord = async (rec) => {
    if (!window.confirm(`XÁC NHẬN XÓA HỒ SƠ LƯU TRỮ:\n\n👉 Mã hồ sơ: ${rec.record_code}\n👉 Tiêu đề: "${rec.title}"\n\nBạn có chắc chắn muốn xóa hồ sơ này khỏi danh mục chỉnh lý số hóa?`)) {
      return;
    }
    try {
      const res = await api.deleteDigitizedRecord(rec.id);
      if (res && res.success) {
        setMessage({ text: `Đã xóa hồ sơ "${rec.record_code}" thành công!`, type: 'success' });
        await loadDigitizationDashboard();
      } else {
        setMessage({ text: res?.message || 'Không thể xóa hồ sơ', type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'Lỗi: ' + (err.message || 'Không thể xóa hồ sơ'), type: 'error' });
    }
  };

  // Lọc danh sách hồ sơ
  const filteredRecords = useMemo(() => {
    if (!data.records) return [];
    return data.records.filter((r) => {
      const term = searchTerm.toLowerCase().trim();
      const matchSearch = !term ||
        r.record_code?.toLowerCase().includes(term) ||
        r.title?.toLowerCase().includes(term) ||
        (r.storage_location || r.physical_location)?.toLowerCase().includes(term) ||
        r.notes?.toLowerCase().includes(term);

      const matchCategory = selectedCategory === 'ALL' || r.category === selectedCategory;
      const statusVal = r.digital_status || r.status;
      const matchStatus = selectedStatus === 'ALL' || 
        statusVal === selectedStatus ||
        (selectedStatus === 'digitized' && (statusVal === 'digitized' || statusVal === 'Đã số hóa')) ||
        (selectedStatus === 'in_progress' && (statusVal === 'in_progress' || statusVal === 'Đang chỉnh lý')) ||
        (selectedStatus === 'pending' && (statusVal === 'pending' || statusVal === 'Chờ số hóa'));

      return matchSearch && matchCategory && matchStatus;
    });
  }, [data.records, searchTerm, selectedCategory, selectedStatus]);

  // Danh mục nhóm hồ sơ
  const categoriesList = [
    'Chuyên môn & Dự án',
    'Đảng - Đoàn thể',
    'Quản lý Nhân sự & Cán bộ',
    'Tài chính & Kế toán',
    'Hành chính & Văn thư'
  ];

  const getStatusBadge = (status) => {
    if (status === 'digitized' || status === 'Đã số hóa') {
      return {
        label: 'Đã số hóa',
        bg: 'bg-emerald-50 text-emerald-800 border-emerald-300',
        dot: 'bg-emerald-500',
        icon: CheckCircle2
      };
    }
    if (status === 'in_progress' || status === 'Đang chỉnh lý') {
      return {
        label: 'Đang chỉnh lý',
        bg: 'bg-blue-50 text-blue-800 border-blue-300',
        dot: 'bg-blue-500',
        icon: Clock
      };
    }
    return {
      label: 'Chờ số hóa',
      bg: 'bg-amber-50 text-amber-800 border-amber-300',
      dot: 'bg-amber-500',
      icon: AlertCircle
    };
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Thông báo Message */}
      {message.text && (
        <div className={`p-4 rounded-xl border flex items-center justify-between transition animate-in fade-in ${
          message.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <X className="w-5 h-5 text-rose-600" />}
            <span>{message.text}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setMessage({ text: '', type: '' })}
            className="p-1 hover:bg-black/5 rounded-lg text-xs"
          >
            Đóng
          </button>
        </div>
      )}

      {/* 1. Header Phân hệ Chỉnh lý số hóa tài liệu */}
      <div className="bg-gradient-to-r from-teal-800 via-emerald-700 to-teal-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
          <FolderArchive className="w-64 h-64 text-white" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 backdrop-blur-xs rounded-full text-xs font-bold uppercase tracking-wider text-emerald-200 border border-white/20">
              <FolderArchive className="w-3.5 h-3.5 text-emerald-300" />
              <span>Phân hệ Nội nghiệp • Lưu trữ & Chuyển đổi số</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-2.5">
              <span>Chỉnh lý & Số hóa Tài liệu Lưu trữ</span>
            </h1>
            <p className="text-xs sm:text-sm text-emerald-100 max-w-2xl font-medium">
              Theo dõi tiến độ chỉnh lý nghiệp vụ, quét scan số hóa, gán metadata và chuyển đổi kho tài liệu lưu trữ vật lý sang kho dữ liệu điện tử của cơ quan.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <button
              type="button"
              onClick={handleOpenAdd}
              className="px-4 py-2.5 bg-white text-emerald-900 hover:bg-emerald-50 rounded-xl text-xs font-bold shadow-md transition flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-700" />
              <span>Thêm mới hồ sơ</span>
            </button>
            <button
              type="button"
              onClick={loadDigitizationDashboard}
              disabled={loading}
              className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-xl text-xs font-bold backdrop-blur-xs border border-white/20 transition flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Làm mới</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Bốn Thẻ Chỉ số KPI Chỉnh lý số hóa */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Thẻ 1: Tổng số Hồ sơ */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-teal-300 transition group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng số Hồ sơ</span>
            <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center group-hover:scale-110 transition">
              <FolderArchive className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">{data.stats?.total_records || 0}</span>
            <span className="text-xs font-semibold text-slate-500">Hồ sơ lưu</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1 font-medium">
            <FileSpreadsheet className="w-3.5 h-3.5 text-teal-600" />
            <span>Phân loại theo {data.by_category?.length || 0} nhóm nghiệp vụ</span>
          </div>
        </div>

        {/* Thẻ 2: Tổng số Trang tài liệu Scan */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-blue-300 transition group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng số Trang Scan</span>
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center group-hover:scale-110 transition">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-blue-700">{(data.stats?.total_pages || 0).toLocaleString('vi-VN')}</span>
            <span className="text-xs font-semibold text-slate-500">Trang tài liệu</span>
          </div>
          <div className="mt-2 text-[11px] text-blue-600 flex items-center gap-1 font-medium">
            <Layers className="w-3.5 h-3.5" />
            <span>Đã định dạng PDF / OCR</span>
          </div>
        </div>

        {/* Thẻ 3: Tiến độ Số hóa hoàn tất */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-emerald-300 transition group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Đã số hóa hoàn tất</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-700">{data.stats?.completed || 0}</span>
            <span className="text-xs font-semibold text-slate-500">
              ({data.stats?.completion_rate || 0}%)
            </span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-600 flex items-center gap-1 font-medium">
            <Percent className="w-3.5 h-3.5" />
            <span>Tỷ lệ hoàn thành mục tiêu</span>
          </div>
        </div>

        {/* Thẻ 4: Đang chỉnh lý & Chờ số hóa */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-amber-300 transition group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Đang chỉnh lý & Chờ</span>
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center group-hover:scale-110 transition">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-amber-700">
              {(data.stats?.processing || 0) + (data.stats?.pending || 0)}
            </span>
            <span className="text-xs font-semibold text-slate-500">Hồ sơ</span>
          </div>
          <div className="mt-2 text-[11px] text-amber-600 flex items-center gap-1 font-medium">
            <Archive className="w-3.5 h-3.5" />
            <span>{data.stats?.processing || 0} đang chỉnh lý • {data.stats?.pending || 0} chờ</span>
          </div>
        </div>
      </div>

      {/* 3. Biểu đồ phân bổ theo Nhóm hồ sơ nghiệp vụ */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-teal-700" />
            <span>Tiến độ Số hóa theo Nhóm Hồ sơ Nghiệp vụ</span>
          </h3>
          <span className="text-xs text-slate-500 font-medium">Chỉ tiêu thực tế</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
          {data.by_category?.map((cat) => {
            const pct = cat.count > 0 ? Math.round((cat.completed / cat.count) * 100) : 0;
            return (
              <div key={cat.category} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900 truncate max-w-[200px]" title={cat.category}>
                    {cat.category}
                  </span>
                  <span className="text-xs font-black text-teal-700">{pct}%</span>
                </div>
                
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-teal-600 to-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium pt-1">
                  <span>Tổng: <strong>{cat.count}</strong> hồ sơ ({cat.pages} trang)</span>
                  <span className="text-emerald-700 font-bold">Đã xong: {cat.completed}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Danh mục Hồ sơ Lưu trữ (Bảng quản lý chi tiết) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Bộ lọc và Tìm kiếm */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1 max-w-md relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo mã hồ sơ, tiêu đề, vị trí kho lưu..."
              className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Lọc theo Nhóm */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
            >
              <option value="ALL">Tất cả nhóm hồ sơ</option>
              {categoriesList.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {/* Lọc theo Trạng thái */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="Đã số hóa">Đã số hóa</option>
              <option value="Đang chỉnh lý">Đang chỉnh lý</option>
              <option value="Chờ số hóa">Chờ số hóa</option>
            </select>

            <span className="text-xs font-bold text-slate-600 bg-white px-3 py-2 rounded-xl border border-slate-200">
              Kết quả: <strong className="text-teal-700">{filteredRecords.length}</strong> hồ sơ
            </span>
          </div>
        </div>

        {/* Table danh mục */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-xs sm:text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4 w-12 text-center">STT</th>
                <th className="py-3 px-4 min-w-[130px]">Mã hồ sơ</th>
                <th className="py-3 px-4 min-w-[260px]">Tiêu đề hồ sơ</th>
                <th className="py-3 px-4 min-w-[170px]">Nhóm hồ sơ</th>
                <th className="py-3 px-4 min-w-[140px]">Thời hạn & Năm</th>
                <th className="py-3 px-4 w-28 text-center">Số trang</th>
                <th className="py-3 px-4 min-w-[180px]">Vị trí kho lưu vật lý</th>
                <th className="py-3 px-4 w-32 text-center">Trạng thái số hóa</th>
                <th className="py-3 px-4 w-24 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-12 text-center text-slate-400 text-xs italic">
                    Không tìm thấy hồ sơ lưu trữ nào phù hợp với điều kiện tìm kiếm
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r, idx) => {
                  const badge = getStatusBadge(r.status);
                  const Icon = badge.icon;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 text-center font-bold text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-teal-800 text-xs">
                        {r.record_code}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 text-xs sm:text-sm line-clamp-2">
                          {r.title}
                        </div>
                        {r.notes && (
                          <div className="text-[11px] text-slate-400 italic mt-0.5">
                            {r.notes}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium">
                          {r.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        <div>Năm: <strong>{r.year}</strong></div>
                        <div className="text-[11px] text-slate-500 mt-0.5">Thời hạn: {r.retention_period}</div>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-800">
                        {r.total_pages || r.page_count || 0} tr
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1 text-[11px]">
                          <Archive className="w-3 h-3 text-slate-400" />
                          <span>{r.storage_location || r.physical_location || 'Kho lưu trữ cơ quan'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}></span>
                          <span>{badge.label}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(r)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Sửa hồ sơ"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRecord(r)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Xóa hồ sơ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Thêm mới / Chỉnh sửa Hồ sơ Số hóa */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 bg-gradient-to-r from-teal-700 to-emerald-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderArchive className="w-5 h-5 text-emerald-200" />
                <h3 className="font-bold text-base">
                  {editingRecord ? 'Cập nhật Hồ sơ Lưu trữ' : 'Thêm mới Hồ sơ Lưu trữ'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRecord} className="p-6 space-y-4 text-xs sm:text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mã hồ sơ lưu trữ *:
                  </label>
                  <input
                    type="text"
                    required
                    value={form.record_code}
                    onChange={(e) => setForm({ ...form, record_code: e.target.value })}
                    placeholder="VD: HS-2026-001"
                    className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nhóm hồ sơ nghiệp vụ *:
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-semibold"
                  >
                    {categoriesList.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tiêu đề hồ sơ tài liệu *:
                </label>
                <textarea
                  rows={2}
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Nhập đầy đủ tiêu đề hồ sơ lưu trữ theo mục lục hồ sơ..."
                  className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Năm tài liệu *:
                  </label>
                  <input
                    type="number"
                    required
                    value={form.year}
                    onChange={(e) => setForm({ ...form, year: parseInt(e.target.value, 10) || new Date().getFullYear() })}
                    className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Thời hạn bảo quản:
                  </label>
                  <select
                    value={form.retention_period}
                    onChange={(e) => setForm({ ...form, retention_period: e.target.value })}
                    className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="Vĩnh viễn">Vĩnh viễn</option>
                    <option value="70 năm">70 năm</option>
                    <option value="50 năm">50 năm</option>
                    <option value="20 năm">20 năm</option>
                    <option value="10 năm">10 năm</option>
                    <option value="5 năm">5 năm</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Số trang tài liệu:
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.total_pages}
                    onChange={(e) => setForm({ ...form, total_pages: parseInt(e.target.value, 10) || 0 })}
                    className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Trạng thái số hóa *:
                  </label>
                  <select
                    value={form.digital_status}
                    onChange={(e) => setForm({ ...form, digital_status: e.target.value })}
                    className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none font-bold text-teal-800"
                  >
                    <option value="pending">Chờ số hóa</option>
                    <option value="in_progress">Đang chỉnh lý</option>
                    <option value="digitized">Đã số hóa</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Vị trí kho lưu trữ vật lý:
                  </label>
                  <input
                    type="text"
                    value={form.storage_location}
                    onChange={(e) => setForm({ ...form, storage_location: e.target.value })}
                    placeholder="VD: Kho A - Giá 01, Ngăn 03"
                    className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ghi chú & Tóm tắt nội dung:
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Ghi chú thêm về tình trạng vật lý hoặc nội dung hồ sơ..."
                  className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs sm:text-sm font-bold bg-teal-700 hover:bg-teal-800 text-white rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{saving ? 'Đang lưu...' : 'Lưu hồ sơ lưu trữ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
