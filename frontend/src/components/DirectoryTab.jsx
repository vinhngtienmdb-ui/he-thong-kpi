import React, { useState, useEffect, useMemo } from 'react';
import { 
  BookUser, 
  Users, 
  Phone, 
  Mail, 
  Building2, 
  Search, 
  Filter, 
  Download, 
  Copy, 
  Check, 
  ExternalLink, 
  ShieldCheck, 
  Eye, 
  RefreshCw, 
  Grid, 
  List, 
  UserCheck, 
  Briefcase, 
  Calendar, 
  MapPin, 
  Sparkles,
  PhoneCall,
  UserPlus,
  ArrowUpRight,
  ChevronRight,
  X
} from 'lucide-react';
import { api } from '../api';
import { formatDate } from '../constants';

export default function DirectoryTab({ 
  currentUser, 
  setCurrentTab,
  onAssignToUser
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ users: [], departments: [], viewer: null, stats: {} });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [scope, setScope] = useState('all'); // 'all' | 'my_unit' | 'subordinates'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [selectedUser, setSelectedUser] = useState(null); // Detail modal
  const [copiedItem, setCopiedItem] = useState(null); // { type: 'phone'|'email', id: string }
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    loadDirectory();
  }, [scope, selectedDept]);

  async function loadDirectory() {
    try {
      setLoading(true);
      const params = {};
      if (scope !== 'all') params.scope = scope;
      if (selectedDept) params.dept_id = selectedDept;
      if (searchTerm.trim()) params.search = searchTerm.trim();

      const res = await api.getDirectory(params);
      if (res && res.success) {
        setData(res);
      }
    } catch (err) {
      console.error('Lỗi khi tải danh bạ:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    loadDirectory();
  };

  const copyToClipboard = (text, type, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedItem({ type, id });
    setToastMessage(`Đã sao chép ${type === 'phone' ? 'số điện thoại' : 'địa chỉ email'} vào bộ nhớ tạm!`);
    setTimeout(() => {
      setCopiedItem(null);
      setToastMessage('');
    }, 2500);
  };

  const isManager = Boolean(
    currentUser?.role === 'admin' ||
    currentUser?.role_code === 'admin_donvi' ||
    currentUser?.role === 'cbql' ||
    currentUser?.target_role === 'cbql' ||
    ['admin', 'admin_donvi', 'cbql_phong', 'ld_coquan', 'to_truong', 'hieu_pho'].includes(currentUser?.role_code) ||
    currentUser?.management_role ||
    (data.stats?.subordinatesCount > 0)
  );

  // Lọc tìm kiếm phía client cho phản hồi tức thì
  const filteredUsers = useMemo(() => {
    if (!data.users) return [];
    if (!searchTerm.trim()) return data.users;
    const term = searchTerm.toLowerCase().trim();
    return data.users.filter(u => 
      u.full_name?.toLowerCase().includes(term) ||
      u.phone?.toLowerCase().includes(term) ||
      u.email?.toLowerCase().includes(term) ||
      u.username?.toLowerCase().includes(term) ||
      u.dept_name?.toLowerCase().includes(term) ||
      u.gov_title?.toLowerCase().includes(term) ||
      u.party_title?.toLowerCase().includes(term)
    );
  }, [data.users, searchTerm]);

  // Sinh avatar chữ cái với màu sắc đa dạng
  const getAvatarBadge = (name, roleCode, isSubordinate) => {
    const initials = name
      ? name.split(' ').filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase()
      : 'CB';
    
    let bgGradient = 'from-slate-600 to-slate-800';
    if (isSubordinate) {
      bgGradient = 'from-rose-600 to-red-700';
    } else if (roleCode === 'admin' || roleCode === 'admin_donvi') {
      bgGradient = 'from-purple-600 to-indigo-700';
    } else if (roleCode === 'cbql' || roleCode === 'ld_coquan') {
      bgGradient = 'from-amber-500 to-orange-600';
    } else {
      bgGradient = 'from-blue-600 to-cyan-700';
    }

    return (
      <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${bgGradient} text-white flex items-center justify-center font-bold text-sm shadow-md shrink-0 ring-2 ring-white`}>
        {initials}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-2 text-xs font-medium animate-in fade-in slide-in-from-bottom-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Header & Summary Cards */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 text-white flex items-center justify-center shadow-md shadow-red-500/20">
              <BookUser className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <span>Danh bạ liên hệ nội bộ</span>
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                  Toàn hệ thống
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Tra cứu thông tin liên lạc công tác toàn hệ thống & quản lý danh sách CBNV trực thuộc đơn vị
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start md:self-auto">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-medium transition ${
                  viewMode === 'grid' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Hiển thị dạng thẻ lưới"
              >
                <Grid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Dạng thẻ</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-medium transition ${
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Hiển thị dạng bảng danh sách"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Dạng bảng</span>
              </button>
            </div>

            {/* Export Excel Button */}
            <a
              href={api.getDirectoryExportUrl({ scope, dept_id: selectedDept, search: searchTerm })}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 shadow-2xs transition"
              title="Xuất danh bạ ra file Excel (.xlsx)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Excel</span>
            </a>
          </div>
        </div>

        {/* Thống kê nhanh 4 chỉ số */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Toàn hệ thống */}
          <div 
            onClick={() => { setScope('all'); setSelectedDept(''); }}
            className={`p-3 sm:p-4 rounded-xl border transition cursor-pointer ${
              scope === 'all' && !selectedDept
                ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-400/30'
                : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide">Toàn hệ thống</span>
              <Users className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
              {data.stats?.total ?? '—'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Tổng số nhân sự công tác</div>
          </div>

          {/* Card 2: Đơn vị của tôi */}
          <div 
            onClick={() => { setScope('my_unit'); }}
            className={`p-3 sm:p-4 rounded-xl border transition cursor-pointer ${
              scope === 'my_unit'
                ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-400/30'
                : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide">Đơn vị của tôi</span>
              <Building2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-emerald-700 mt-1">
              {data.stats?.myDeptCount ?? '—'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 truncate" title={currentUser?.dept_name || 'Phòng ban đơn vị'}>
              {currentUser?.dept_name || 'Cùng phòng ban'}
            </div>
          </div>

          {/* Card 3: Cán bộ trực thuộc quản lý (Nổi bật cho Quản lý) */}
          <div 
            onClick={() => { if (isManager) setScope('subordinates'); }}
            className={`p-3 sm:p-4 rounded-xl border transition ${
              isManager ? 'cursor-pointer' : 'opacity-70 cursor-default'
            } ${
              scope === 'subordinates'
                ? 'bg-rose-50/90 border-rose-300 ring-2 ring-rose-400/30 shadow-xs'
                : isManager 
                  ? 'bg-rose-50/30 border-rose-200 hover:bg-rose-50/60' 
                  : 'bg-slate-50/60 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-semibold text-rose-800 uppercase tracking-wide">Cán bộ trực thuộc</span>
              <UserCheck className="w-4 h-4 text-rose-600" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-rose-700 mt-1">
              {data.stats?.subordinatesCount ?? 0}
            </div>
            <div className="text-[10px] text-rose-600 font-medium mt-0.5">
              {isManager ? 'Thuộc thẩm quyền quản lý' : 'Chỉ dành cho Quản lý'}
            </div>
          </div>

          {/* Card 4: Số phòng ban / đơn vị */}
          <div className="p-3 sm:p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide">Phòng ban / Đơn vị</span>
              <Briefcase className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-purple-700 mt-1">
              {data.stats?.departmentsCount ?? data.departments?.length ?? '—'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Cơ cấu tổ chức cơ quan</div>
          </div>
        </div>
      </div>

      {/* 2. Filter & Scope Switcher Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Scope Segmented Control */}
          <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200 text-xs font-semibold overflow-x-auto">
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                scope === 'all' 
                  ? 'bg-white text-slate-900 shadow-2xs font-bold' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🌐 Toàn hệ thống ({data.stats?.total || 0})
            </button>

            <button
              type="button"
              onClick={() => setScope('my_unit')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                scope === 'my_unit' 
                  ? 'bg-white text-emerald-800 shadow-2xs font-bold' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🏢 Đơn vị của tôi ({data.stats?.myDeptCount || 0})
            </button>

            {isManager && (
              <button
                type="button"
                onClick={() => setScope('subordinates')}
                className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  scope === 'subordinates' 
                    ? 'bg-rose-600 text-white shadow-xs font-bold' 
                    : 'text-rose-700 hover:bg-rose-100/60 font-semibold'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>CBNV trực thuộc ({data.stats?.subordinatesCount || 0})</span>
              </button>
            )}
          </div>

          {/* Department Filter Dropdown */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="text-xs border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500/30 max-w-[220px] sm:max-w-[260px] truncate"
            >
              <option value="">Tất cả phòng ban / đơn vị</option>
              {data.departments?.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name} {dept.user_count ? `(${dept.user_count})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Real-time Search Box */}
        <div className="relative">
          <input
            type="text"
            placeholder="Tìm theo họ tên, số điện thoại, email, chức danh chính quyền, chức vụ Đảng..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs sm:text-sm rounded-xl pl-9 pr-8 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500 transition shadow-inner"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 transition"
              title="Xóa tìm kiếm"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 3. Main Contact List Area */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center">
          <RefreshCw className="w-8 h-8 text-red-600 animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-500 font-medium">Đang tải danh bạ hệ thống...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-700">Không tìm thấy cán bộ nào</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchTerm || selectedDept || scope !== 'all'
              ? 'Không có nhân sự nào khớp với tiêu chí tìm kiếm hoặc phạm vi bạn đã chọn.'
              : 'Chưa có thông tin nhân sự nào trong danh bạ.'}
          </p>
          {(searchTerm || selectedDept || scope !== 'all') && (
            <button
              type="button"
              onClick={() => { setSearchTerm(''); setSelectedDept(''); setScope('all'); }}
              className="px-3.5 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition"
            >
              Đặt lại bộ lọc
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW (Thẻ danh bạ cá nhân) */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredUsers.map((u) => {
            return (
              <div 
                key={u.id}
                className={`bg-white rounded-2xl border transition-all duration-200 hover:shadow-md flex flex-col justify-between overflow-hidden relative ${
                  u.is_self
                    ? 'border-blue-300 ring-2 ring-blue-500/10'
                    : u.is_subordinate
                      ? 'border-rose-200 ring-1 ring-rose-500/10 hover:border-rose-300'
                      : 'border-slate-200/80 hover:border-slate-300'
                }`}
              >
                {/* Top Badge Indicators */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    {getAvatarBadge(u.full_name, u.role_code, u.is_subordinate)}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-bold text-sm text-slate-900 truncate" title={u.full_name}>
                          {u.full_name}
                        </h3>
                        {u.is_self && (
                          <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.2 rounded-full">
                            Bạn
                          </span>
                        )}
                        {u.is_subordinate && (
                          <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.2 rounded-full flex items-center gap-0.5">
                            <UserCheck className="w-2.5 h-2.5" />
                            Trực thuộc
                          </span>
                        )}
                      </div>

                      {/* Chức danh chính quyền & Chức vụ Đảng */}
                      <div className="text-xs text-slate-600 mt-0.5 font-medium truncate" title={u.gov_title || 'Chưa cập nhật chức danh'}>
                        {u.gov_title || 'Cán bộ'}
                      </div>
                      {u.party_title && (
                        <div className="text-[11px] text-amber-700 font-medium truncate" title={u.party_title}>
                          ★ {u.party_title}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Thông tin Đơn vị & Tuyến quản lý */}
                  <div className="space-y-1 pt-1 text-xs border-t border-slate-100">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate font-medium" title={u.dept_name || 'Đang cập nhật'}>
                        {u.dept_name || 'Chưa phân bổ đơn vị'}
                      </span>
                    </div>

                    {u.manager_name && (
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">
                          Quản lý: <strong className="text-slate-700 font-semibold">{u.manager_name}</strong>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Số điện thoại & Email (Click to call / mail & Click to copy) */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    {/* Số điện thoại */}
                    <div className="flex items-center justify-between text-xs bg-slate-50/80 px-2.5 py-1.5 rounded-xl border border-slate-100">
                      <a
                        href={u.phone ? `tel:${u.phone}` : undefined}
                        className={`flex items-center gap-2 min-w-0 font-medium ${
                          u.phone ? 'text-blue-700 hover:underline' : 'text-slate-400 cursor-default'
                        }`}
                        title={u.phone ? 'Bấm để gọi điện' : 'Chưa có số điện thoại'}
                      >
                        <Phone className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span className="font-mono text-xs truncate">
                          {u.phone || 'Chưa cập nhật SĐT'}
                        </span>
                      </a>
                      {u.phone && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(u.phone, 'phone', u.id)}
                          className="text-slate-400 hover:text-slate-700 p-1 rounded-md transition cursor-pointer"
                          title="Sao chép số điện thoại"
                        >
                          {copiedItem?.type === 'phone' && copiedItem?.id === u.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* Email */}
                    <div className="flex items-center justify-between text-xs bg-slate-50/80 px-2.5 py-1.5 rounded-xl border border-slate-100">
                      <a
                        href={u.email ? `mailto:${u.email}` : undefined}
                        className={`flex items-center gap-2 min-w-0 font-medium ${
                          u.email ? 'text-indigo-700 hover:underline' : 'text-slate-400 cursor-default'
                        }`}
                        title={u.email ? 'Bấm để gửi email' : 'Chưa có địa chỉ email'}
                      >
                        <Mail className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="text-xs truncate" title={u.email}>
                          {u.email || 'Chưa cập nhật email'}
                        </span>
                      </a>
                      {u.email && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(u.email, 'email', u.id)}
                          className="text-slate-400 hover:text-slate-700 p-1 rounded-md transition cursor-pointer"
                          title="Sao chép email"
                        >
                          {copiedItem?.type === 'email' && copiedItem?.id === u.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="bg-slate-50 px-4 py-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedUser(u)}
                    className="text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                    <span>Xem hồ sơ</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {/* Nút gọi điện nhanh */}
                    {u.phone && (
                      <a
                        href={`tel:${u.phone}`}
                        className="p-1.5 rounded-lg bg-white border border-slate-200 text-blue-600 hover:bg-blue-50 transition"
                        title={`Gọi cho ${u.full_name}`}
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                      </a>
                    )}

                    {/* Nút gửi email nhanh */}
                    {u.email && (
                      <a
                        href={`mailto:${u.email}`}
                        className="p-1.5 rounded-lg bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50 transition"
                        title={`Gửi thư cho ${u.full_name}`}
                      >
                        <Mail className="w-3.5 h-3.5" />
                      </a>
                    )}

                    {/* Nếu là quản lý & cán bộ trực thuộc: nút tắt Giao việc */}
                    {u.can_assign && (
                      <button
                        type="button"
                        onClick={() => {
                          if (onAssignToUser) onAssignToUser(u);
                          else if (setCurrentTab) setCurrentTab('assignment');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white font-semibold text-[11px] shadow-2xs transition cursor-pointer"
                        title={`Giao việc trực tiếp cho ${u.full_name}`}
                      >
                        <UserPlus className="w-3 h-3" />
                        <span>Giao việc</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW (Bảng danh sách chuẩn công vụ) */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-3 w-12 text-center">STT</th>
                  <th className="py-3 px-3 min-w-[200px]">Cán bộ & Chức danh</th>
                  <th className="py-3 px-3 min-w-[180px]">Đơn vị / Phòng ban</th>
                  <th className="py-3 px-3 min-w-[140px]">Số điện thoại</th>
                  <th className="py-3 px-3 min-w-[180px]">Địa chỉ Email</th>
                  <th className="py-3 px-3 min-w-[140px]">Quản lý trực tiếp</th>
                  <th className="py-3 px-3 text-right w-28">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u, idx) => (
                  <tr 
                    key={u.id}
                    className={`hover:bg-slate-50/80 transition ${
                      u.is_self ? 'bg-blue-50/30' : u.is_subordinate ? 'bg-rose-50/20' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 text-center text-slate-400 font-mono">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center justify-center shrink-0">
                          {u.full_name?.charAt(0) || 'C'}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span className="truncate">{u.full_name}</span>
                            {u.is_self && (
                              <span className="text-[9px] bg-blue-100 text-blue-800 font-bold px-1 rounded-full">Bạn</span>
                            )}
                            {u.is_subordinate && (
                              <span className="text-[9px] bg-rose-100 text-rose-800 font-bold px-1 rounded-full">Trực thuộc</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {u.gov_title || 'Cán bộ'} {u.party_title ? `• ${u.party_title}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 font-medium">
                      {u.dept_name || '—'}
                    </td>
                    <td className="py-2.5 px-3">
                      {u.phone ? (
                        <div className="flex items-center gap-1.5">
                          <a href={`tel:${u.phone}`} className="font-mono text-blue-700 hover:underline">
                            {u.phone}
                          </a>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(u.phone, 'phone', u.id)}
                            className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                            title="Sao chép"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {u.email ? (
                        <div className="flex items-center gap-1.5">
                          <a href={`mailto:${u.email}`} className="text-indigo-700 hover:underline truncate max-w-[180px]" title={u.email}>
                            {u.email}
                          </a>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(u.email, 'email', u.id)}
                            className="text-slate-400 hover:text-slate-700 p-0.5 shrink-0 cursor-pointer"
                            title="Sao chép"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {u.manager_name || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedUser(u)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition cursor-pointer"
                          title="Xem chi tiết"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {u.can_assign && (
                          <button
                            type="button"
                            onClick={() => {
                              if (onAssignToUser) onAssignToUser(u);
                              else if (setCurrentTab) setCurrentTab('assignment');
                            }}
                            className="p-1.5 rounded-lg text-red-700 hover:bg-red-50 transition cursor-pointer"
                            title="Giao việc"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Contact Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-[95%] sm:max-w-lg shadow-2xl border border-slate-200 p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                {getAvatarBadge(selectedUser.full_name, selectedUser.role_code, selectedUser.is_subordinate)}
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>{selectedUser.full_name}</span>
                    {selectedUser.is_subordinate && (
                      <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full">
                        Cán bộ trực thuộc
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500">
                    @{selectedUser.username} • {selectedUser.role_name || selectedUser.role || 'Cán bộ'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {/* Chi tiết liên hệ */}
            <div className="space-y-2.5 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block text-[10px] font-medium">Chức vụ Đảng</span>
                  <span className="font-semibold text-slate-800 text-xs mt-0.5 block">
                    {selectedUser.party_title || '—'}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block text-[10px] font-medium">Chức danh chính quyền</span>
                  <span className="font-semibold text-slate-800 text-xs mt-0.5 block">
                    {selectedUser.gov_title || '—'}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
                <span className="text-slate-400 block text-[10px] font-medium">Đơn vị công tác</span>
                <div className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>{selectedUser.dept_name || 'Chưa phân bổ'}</span>
                </div>
                {selectedUser.dept_location && (
                  <div className="text-[11px] text-slate-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    <span>{selectedUser.dept_location}</span>
                  </div>
                )}
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                <span className="text-slate-400 block text-[10px] font-medium">Kênh liên lạc</span>
                
                {/* SĐT */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-blue-600" />
                    <span className="font-mono text-xs font-semibold text-blue-700">
                      {selectedUser.phone || 'Chưa cập nhật'}
                    </span>
                  </div>
                  {selectedUser.phone && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedUser.phone, 'phone', selectedUser.id)}
                        className="px-2 py-1 bg-white border border-slate-200 rounded text-[10px] text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                      >
                        Sao chép
                      </button>
                      <a
                        href={`tel:${selectedUser.phone}`}
                        className="px-2.5 py-1 bg-blue-600 text-white rounded text-[10px] font-semibold hover:bg-blue-700 transition"
                      >
                        Gọi điện
                      </a>
                    </div>
                  )}
                </div>

                {/* Email */}
                <div className="flex items-center justify-between border-t border-slate-200/60 pt-2">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="text-xs font-medium text-indigo-700">
                      {selectedUser.email || 'Chưa cập nhật'}
                    </span>
                  </div>
                  {selectedUser.email && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedUser.email, 'email', selectedUser.id)}
                        className="px-2 py-1 bg-white border border-slate-200 rounded text-[10px] text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                      >
                        Sao chép
                      </button>
                      <a
                        href={`mailto:${selectedUser.email}`}
                        className="px-2.5 py-1 bg-indigo-600 text-white rounded text-[10px] font-semibold hover:bg-indigo-700 transition"
                      >
                        Gửi thư
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Tuyến báo cáo quản lý */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <span className="text-slate-400 block text-[10px] font-medium">Tuyến quản lý & Đánh giá</span>
                <div className="text-slate-700 text-xs">
                  Người quản lý trực tiếp: <strong>{selectedUser.manager_name || 'Chưa thiết lập'}</strong>
                </div>
                {selectedUser.final_evaluator_name && (
                  <div className="text-slate-500 text-[11px]">
                    Người đánh giá cuối cùng: <strong>{selectedUser.final_evaluator_name}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Đóng
              </button>

              {selectedUser.can_assign && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUser(null);
                    if (onAssignToUser) onAssignToUser(selectedUser);
                    else if (setCurrentTab) setCurrentTab('assignment');
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Giao việc cho cán bộ này</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
