import React, { useState, useEffect, useMemo } from 'react';
import { 
  Award, 
  Users, 
  ShieldCheck, 
  Search, 
  Filter, 
  RefreshCw, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Edit3, 
  FileText, 
  Download, 
  BookOpen, 
  Building2, 
  ChevronRight, 
  X,
  UserCheck,
  Star,
  Sparkles
} from 'lucide-react';
import { api } from '../api';
import { formatDate } from '../constants';

export default function PartyMembersDashboardTab({ currentUser }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    stats: { total: 0, official: 0, probationary: 0, badges: 0 },
    charts: { by_age: [], by_cell: [] },
    members: []
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCell, setSelectedCell] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [editingMember, setEditingMember] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Form chỉnh sửa hồ sơ Đảng viên
  const [form, setForm] = useState({
    party_card_number: '',
    party_title: '',
    party_join_date: '',
    party_official_date: '',
    party_cell: '',
    party_badge: '',
    party_status: 'CHÍNH THỨC'
  });

  useEffect(() => {
    loadPartyDashboard();
  }, []);

  async function loadPartyDashboard() {
    try {
      setLoading(true);
      const res = await api.getPartyMembersDashboard();
      if (res && res.success) {
        const m = res.metrics || res.stats || {};
        setData({
          stats: {
            total: m.total ?? m.totalRecords ?? (res.members?.length || 0),
            official: m.officialCount ?? m.official ?? 0,
            probationary: m.probationaryCount ?? m.probationary ?? 0,
            badges: m.badgeCount ?? m.badges ?? 0
          },
          charts: {
            by_cell: (m.cellStats || []).map(c => ({ party_cell: c.name || c.party_cell, count: c.count })),
            by_age: (m.ageStats || []).map(a => ({ age_group: a.group || a.age_group, count: a.count }))
          },
          members: res.members || []
        });
      }
    } catch (err) {
      console.error('Lỗi khi tải hồ sơ Đảng viên:', err);
      setMessage({ text: 'Lỗi tải dữ liệu: ' + (err.message || 'Không thể kết nối máy chủ'), type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  const handleOpenEdit = (member) => {
    setEditingMember(member);
    setForm({
      party_card_number: member.party_card_number || '',
      party_title: member.party_title || 'Đảng viên',
      party_join_date: member.party_join_date || '',
      party_official_date: member.party_official_date || '',
      party_cell: member.party_cell || 'Chi bộ 1',
      party_badge: member.party_badge || '',
      party_status: member.party_status || 'CHÍNH THỨC'
    });
  };

  const handleSaveMember = async (e) => {
    e.preventDefault();
    if (!editingMember) return;
    try {
      setSaving(true);
      const res = await api.updatePartyMember(editingMember.id, form);
      if (res && res.success) {
        setMessage({ text: `Đã cập nhật hồ sơ Đảng viên "${editingMember.full_name}" thành công!`, type: 'success' });
        setEditingMember(null);
        await loadPartyDashboard();
      } else {
        setMessage({ text: res?.message || 'Có lỗi xảy ra khi lưu', type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'Lỗi: ' + (err.message || 'Không thể lưu hồ sơ'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Lọc danh sách Đảng viên
  const filteredMembers = useMemo(() => {
    if (!data.members) return [];
    return data.members.filter((m) => {
      const matchSearch = !searchTerm.trim() || 
        m.full_name?.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
        m.party_card_number?.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
        m.party_cell?.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
        m.dept_name?.toLowerCase().includes(searchTerm.toLowerCase().trim());

      const matchCell = selectedCell === 'ALL' || m.party_cell === selectedCell;
      const matchStatus = selectedStatus === 'ALL' || (m.party_status || 'CHÍNH THỨC') === selectedStatus;

      return matchSearch && matchCell && matchStatus;
    });
  }, [data.members, searchTerm, selectedCell, selectedStatus]);

  // Danh sách chi bộ độc nhất để làm bộ lọc
  const cellOptions = useMemo(() => {
    if (!data.members) return [];
    const set = new Set();
    data.members.forEach(m => {
      if (m.party_cell) set.add(m.party_cell);
    });
    return Array.from(set);
  }, [data.members]);

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

      {/* 1. Header Phân hệ Nội nghiệp - Hồ sơ Đảng viên */}
      <div className="bg-gradient-to-r from-red-800 via-rose-700 to-red-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
          <Award className="w-64 h-64 text-white" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 backdrop-blur-xs rounded-full text-xs font-bold uppercase tracking-wider text-amber-200 border border-white/20">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
              <span>Phân hệ Nội nghiệp • Quản lý Công tác Đảng</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-2.5">
              <span>Hồ sơ Đảng viên & Sinh hoạt Chi bộ</span>
            </h1>
            <p className="text-xs sm:text-sm text-red-100 max-w-2xl font-medium">
              Hệ thống theo dõi thông tin, ngày vào Đảng, ngày chính thức, số thẻ Đảng và phân loại sinh hoạt Đảng viên toàn cơ quan theo Điều lệ Đảng Cộng sản Việt Nam.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <button
              type="button"
              onClick={loadPartyDashboard}
              disabled={loading}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-xl text-xs font-bold backdrop-blur-xs border border-white/20 transition flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Làm mới số liệu</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Bốn Thẻ Chỉ số KPI Thống kê Đảng viên */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Thẻ 1: Tổng số Đảng viên */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-red-300 transition group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng số Đảng viên</span>
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center group-hover:scale-110 transition">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">{data.stats?.total || 0}</span>
            <span className="text-xs font-semibold text-slate-500">Đồng chí</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1 font-medium">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span>Sinh hoạt tại {cellOptions.length} Chi bộ trực thuộc</span>
          </div>
        </div>

        {/* Thẻ 2: Đảng viên chính thức */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-emerald-300 transition group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Đảng viên chính thức</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-700">{data.stats?.official || 0}</span>
            <span className="text-xs font-semibold text-slate-500">
              ({data.stats?.total ? Math.round((data.stats.official / data.stats.total) * 100) : 0}%)
            </span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-600 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Đủ tư cách biểu quyết</span>
          </div>
        </div>

        {/* Thẻ 3: Đảng viên dự bị */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-amber-300 transition group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Đảng viên dự bị</span>
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center group-hover:scale-110 transition">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-amber-700">{data.stats?.probationary || 0}</span>
            <span className="text-xs font-semibold text-slate-500">Đồng chí</span>
          </div>
          <div className="mt-2 text-[11px] text-amber-600 flex items-center gap-1 font-medium">
            <Clock className="w-3.5 h-3.5" />
            <span>Thời gian thử thách 12 tháng</span>
          </div>
        </div>

        {/* Thẻ 4: Huy hiệu Đảng */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-purple-300 transition group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Huy hiệu Đảng</span>
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center group-hover:scale-110 transition">
              <Award className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-purple-700">{data.stats?.badges || 0}</span>
            <span className="text-xs font-semibold text-slate-500">Đã nhận huy hiệu</span>
          </div>
          <div className="mt-2 text-[11px] text-purple-600 flex items-center gap-1 font-medium">
            <Star className="w-3.5 h-3.5" />
            <span>30, 40, 45 năm tuổi Đảng</span>
          </div>
        </div>
      </div>

      {/* 3. Phân bổ Biểu đồ Trực quan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Phân bổ theo Chi bộ */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-red-600" />
              <span>Phân bổ Đảng viên theo Chi bộ sinh hoạt</span>
            </h3>
            <span className="text-xs text-slate-500">{data.charts?.by_cell?.length || 0} Chi bộ</span>
          </div>

          <div className="space-y-3 pt-1">
            {data.charts?.by_cell?.map((item) => {
              const pct = data.stats?.total ? Math.round((item.count / data.stats.total) * 100) : 0;
              return (
                <div key={item.party_cell} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="font-bold text-slate-800">{item.party_cell}</span>
                    <span className="text-slate-600">
                      <strong>{item.count}</strong> đ/chí ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-red-600 to-rose-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cơ cấu theo Độ tuổi */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-red-600" />
              <span>Cơ cấu Đảng viên theo Độ tuổi</span>
            </h3>
            <span className="text-xs text-slate-500">Tuổi đời</span>
          </div>

          <div className="space-y-3 pt-1">
            {data.charts?.by_age?.map((item, idx) => {
              const pct = data.stats?.total ? Math.round((item.count / data.stats.total) * 100) : 0;
              const colorGradients = [
                'from-blue-500 to-cyan-500',
                'from-emerald-500 to-teal-500',
                'from-amber-500 to-orange-500',
                'from-purple-500 to-indigo-500'
              ];
              const grad = colorGradients[idx % colorGradients.length];

              return (
                <div key={item.age_group} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="font-bold text-slate-800">{item.age_group}</span>
                    <span className="text-slate-600">
                      <strong>{item.count}</strong> đ/chí ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className={`bg-gradient-to-r ${grad} h-full rounded-full transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. Danh sách Đảng viên & Bảng quản lý chi tiết */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Bộ lọc và Tìm kiếm */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1 max-w-md relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên, số thẻ Đảng, chi bộ sinh hoạt..."
              className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Lọc theo Chi bộ */}
            <select
              value={selectedCell}
              onChange={(e) => setSelectedCell(e.target.value)}
              className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none"
            >
              <option value="ALL">Tất cả Chi bộ ({cellOptions.length})</option>
              {cellOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {/* Lọc theo Trạng thái */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="CHÍNH THỨC">Chính thức</option>
              <option value="DỰ BỊ">Dự bị</option>
            </select>

            <span className="text-xs font-bold text-slate-600 bg-white px-3 py-2 rounded-xl border border-slate-200">
              Kết quả: <strong className="text-red-700">{filteredMembers.length}</strong> đ/chí
            </span>
          </div>
        </div>

        {/* Table danh sách */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-left text-xs sm:text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4 w-12 text-center">STT</th>
                <th className="py-3 px-4 min-w-[200px]">Họ và tên / Đơn vị</th>
                <th className="py-3 px-4 min-w-[130px]">Số thẻ Đảng</th>
                <th className="py-3 px-4 min-w-[150px]">Chức vụ Đảng & CQ</th>
                <th className="py-3 px-4 min-w-[160px]">Chi bộ sinh hoạt</th>
                <th className="py-3 px-4 min-w-[180px]">Ngày vào Đảng / Chính thức</th>
                <th className="py-3 px-4 w-28 text-center">Trạng thái</th>
                <th className="py-3 px-4 w-24 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-slate-400 text-xs italic">
                    Không tìm thấy Đảng viên nào phù hợp với điều kiện tìm kiếm
                  </td>
                </tr>
              ) : (
                filteredMembers.map((m, idx) => {
                  const isOfficial = (m.party_status || 'CHÍNH THỨC') === 'CHÍNH THỨC';
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 text-center font-bold text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 text-xs sm:text-sm">
                          {m.full_name}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                          {m.dept_name || 'Cơ quan'}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-red-700 text-xs">
                        {m.party_card_number || <span className="text-slate-300 font-normal italic">Chưa cấp</span>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800 text-xs">
                          {m.party_title || 'Đảng viên'}
                        </div>
                        {m.gov_title && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            CQ: {m.gov_title}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-800 border border-red-200 text-xs font-semibold">
                          <Building2 className="w-3 h-3 text-red-600" />
                          {m.party_cell || 'Chi bộ 1'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        <div>
                          Vào Đảng: <strong>{m.party_join_date ? formatDate(m.party_join_date) : '--/--/----'}</strong>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Chính thức: <strong>{m.party_official_date ? formatDate(m.party_official_date) : '--/--/----'}</strong>
                        </div>
                        {m.party_badge && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold">
                              <Award className="w-2.5 h-2.5" />
                              {m.party_badge}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                          isOfficial 
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                            : 'bg-amber-50 text-amber-800 border-amber-300'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isOfficial ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                          {isOfficial ? 'Chính thức' : 'Dự bị'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(m)}
                          className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition inline-flex items-center gap-1 cursor-pointer"
                          title="Cập nhật thông tin Đảng viên"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Sửa</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Chỉnh sửa Hồ sơ Đảng viên */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 bg-gradient-to-r from-red-700 to-rose-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-300" />
                <h3 className="font-bold text-base">Cập nhật Hồ sơ Đảng viên</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMember} className="p-6 space-y-4 text-xs sm:text-sm">
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-900 text-sm">{editingMember.full_name}</div>
                <div className="text-slate-600 text-xs">
                  Đơn vị: <strong>{editingMember.dept_name || 'Cơ quan'}</strong> | Chức vụ CQ: <strong>{editingMember.gov_title || 'Cán bộ'}</strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Số thẻ Đảng:
                  </label>
                  <input
                    type="text"
                    value={form.party_card_number}
                    onChange={(e) => setForm({ ...form, party_card_number: e.target.value })}
                    placeholder="VD: 02.045678"
                    className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Trạng thái Đảng viên *:
                  </label>
                  <select
                    value={form.party_status}
                    onChange={(e) => setForm({ ...form, party_status: e.target.value })}
                    className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none font-semibold"
                  >
                    <option value="CHÍNH THỨC">Chính thức</option>
                    <option value="DỰ BỊ">Dự bị</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Chức vụ Đảng:
                  </label>
                  <input
                    type="text"
                    value={form.party_title}
                    onChange={(e) => setForm({ ...form, party_title: e.target.value })}
                    placeholder="VD: Bí thư chi bộ, Đảng viên..."
                    className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Chi bộ sinh hoạt *:
                  </label>
                  <input
                    type="text"
                    value={form.party_cell}
                    onChange={(e) => setForm({ ...form, party_cell: e.target.value })}
                    placeholder="VD: Chi bộ 1, Chi bộ 2..."
                    required
                    className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Ngày kết nạp (vào Đảng):
                  </label>
                  <input
                    type="date"
                    value={form.party_join_date}
                    onChange={(e) => setForm({ ...form, party_join_date: e.target.value })}
                    className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Ngày công nhận chính thức:
                  </label>
                  <input
                    type="date"
                    value={form.party_official_date}
                    onChange={(e) => setForm({ ...form, party_official_date: e.target.value })}
                    className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Huy hiệu Đảng đã nhận:
                </label>
                <input
                  type="text"
                  value={form.party_badge}
                  onChange={(e) => setForm({ ...form, party_badge: e.target.value })}
                  placeholder="VD: Huy hiệu 30 năm tuổi Đảng (để trống nếu chưa nhận)"
                  className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs sm:text-sm font-bold bg-red-700 hover:bg-red-800 text-white rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{saving ? 'Đang lưu...' : 'Lưu thông tin hồ sơ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
