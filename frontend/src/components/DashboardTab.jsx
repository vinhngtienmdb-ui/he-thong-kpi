import React, { useEffect, useState } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Layers, 
  Award, 
  TrendingUp, 
  Download,
  FileSpreadsheet,
  ArrowRight,
  LayoutGrid,
  Table,
  Building2,
  Users,
  UserCheck,
  User,
  Search,
  Filter,
  Printer,
  Eye,
  X,
  ChevronRight,
  AlertTriangle,
  Check,
  Sparkles,
  BarChart3,
  ShieldAlert,
  Lock,
  Unlock
} from 'lucide-react';
import { api } from '../api';
import { formatDate } from '../constants';
import FinalizePeriodModal from './FinalizePeriodModal';

export default function DashboardTab({ 
  selectedPeriod, 
  currentUser, 
  setCurrentTab,
  users = [],
  departments = [],
  periods = [],
  axes = [],
  onReloadPeriods,
  onPeriodChange
}) {
  const [stats, setStats] = useState(null);
  const [evalData, setEvalData] = useState(null);
  const [userTasks, setUserTasks] = useState([]);
  const [mau02Data, setMau02Data] = useState([]);
  const [configs, setConfigs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);

  // Permissions
  const isAdminOrLeader = currentUser?.role === 'admin' || currentUser?.role === 'lanh_dao' || currentUser?.data_scope === 'all';
  const isDeptManager = currentUser?.role === 'cbql' || currentUser?.data_scope === 'dept_tree' || currentUser?.data_scope === 'department';
  
  // Scope: 'personal' (Báo cáo cá nhân) | 'unit' (Báo cáo đơn vị) | 'agency' (Báo cáo cơ quan)
  const [activeScope, setActiveScope] = useState('personal');

  // Filters & State for Unit / Agency Views
  const [selectedDeptId, setSelectedDeptId] = useState(currentUser?.dept_id || (departments[0]?.id || ''));
  const [agencyRankFilter, setAgencyRankFilter] = useState('all');
  const [agencyDeptFilter, setAgencyDeptFilter] = useState('all');
  const [searchStaffText, setSearchStaffText] = useState('');
  const [personalTaskFilter, setPersonalTaskFilter] = useState('all');

  // Quick Inspection Modal
  const [selectedStaffModal, setSelectedStaffModal] = useState(null);

  useEffect(() => {
    loadData();
  }, [selectedPeriod, currentUser]);

  useEffect(() => {
    if (currentUser?.dept_id && !selectedDeptId) {
      setSelectedDeptId(currentUser.dept_id);
    }
  }, [currentUser, departments]);

  async function loadData() {
    try {
      setLoading(true);
      const promises = [
        api.getDashboardStats(selectedPeriod),
        currentUser ? api.getEvaluation(selectedPeriod, currentUser.id) : null,
        currentUser ? api.getAssignedTasks(selectedPeriod, currentUser.id) : [],
        api.getMau02Report(selectedPeriod).catch(() => []),
        api.getAdminConfigs().catch(() => null)
      ];

      const [dashStats, userEval, tasks, mau02, cfg] = await Promise.all(promises);
      setStats(dashStats);
      setEvalData(userEval);
      setUserTasks(tasks || []);
      setMau02Data(mau02 || []);
      setConfigs(cfg);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }

  // Quick open staff modal with fresh evaluation
  const handleOpenStaffModal = async (staff) => {
    try {
      const detail = await api.getEvaluation(selectedPeriod, staff.user_id || staff.id);
      setSelectedStaffModal({
        ...staff,
        evalDetail: detail
      });
    } catch (err) {
      setSelectedStaffModal({
        ...staff,
        evalDetail: null
      });
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500">
        <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-red-700 mx-auto mb-3"></div>
        <p className="font-semibold text-slate-600">Đang tải dữ liệu Bảng giám sát & Báo cáo KPI...</p>
        <p className="text-xs text-slate-400 mt-1">Đang tổng hợp điểm số, 6 trục trọng tâm và danh mục đánh giá</p>
      </div>
    );
  }

  const evaluation = evalData?.evaluation || {};
  const axesSummary = evalData?.axesSummary || [];
  const currentPeriodObj = periods.find(p => p.id === selectedPeriod);
  const isPeriodLocked = currentPeriodObj?.is_locked === 1;

  async function handleToggleFinalizePeriod() {
    if (!currentPeriodObj) return;
    if (isPeriodLocked) {
      if (!window.confirm(
        `XÁC NHẬN MỞ KHÓA KPI CHO KỲ:\n\n👉 "${currentPeriodObj.name}" (${currentPeriodObj.code})\n\nSau khi mở khóa, Cán bộ Quản lý và Lãnh đạo có thể tiếp tục chấm điểm và cập nhật kết quả. Bạn có chắc chắn muốn mở khóa?`
      )) return;
      try {
        await api.unfinalizePeriod(currentPeriodObj.id);
        alert(`Đã mở khóa KPI thành công cho kỳ "${currentPeriodObj.name}"!`);
        if (onReloadPeriods) onReloadPeriods();
        loadData();
      } catch (err) {
        alert('Lỗi mở khóa: ' + err.message);
      }
    } else {
      if (!window.confirm(
        `XÁC NHẬN CHỐT KPI TOÀN ĐƠN VỊ / CƠ QUAN CHO KỲ:\n\n👉 "${currentPeriodObj.name}" (${currentPeriodObj.code})\n\nThời hạn đánh giá: ${formatDate(currentPeriodObj.start_date)} đến ${formatDate(currentPeriodObj.end_date)}\n\nToàn bộ kết quả đánh giá, xếp loại và thẩm định của tất cả cán bộ trong kỳ "${currentPeriodObj.name}" sẽ được khóa sổ chính thức theo Quy định 366-QĐ/TW.\n\nBạn có chắc chắn muốn chốt KPI cho kỳ "${currentPeriodObj.name}"?`
      )) return;
      try {
        await api.finalizePeriod(currentPeriodObj.id, { finalized_by: currentUser?.full_name || 'Lãnh đạo cơ quan' });
        alert(`Đã Chốt & Khóa Sổ KPI toàn cơ quan thành công cho kỳ "${currentPeriodObj.name}"!`);
        if (onReloadPeriods) onReloadPeriods();
        loadData();
      } catch (err) {
        alert('Lỗi chốt KPI: ' + err.message);
      }
    }
  }

  // Agency Names from Configs
  const parentAgencyName = configs?.PARENT_AGENCY_NAME || 'CƠ QUAN CHỦ QUẢN';
  const unitName = configs?.UNIT_NAME || currentUser?.dept_name || 'BAN TỔ CHỨC CƠ QUAN';
  const maxExcellentPct = Number(configs?.MAX_EXCELLENT_PCT || 20);

  // --- Calculations for Unit View ---
  const effectiveDeptId = (isAdminOrLeader ? selectedDeptId : currentUser?.dept_id) || departments[0]?.id;
  const currentDeptObj = departments.find(d => d.id === effectiveDeptId) || { name: currentUser?.dept_name || 'Đơn vị' };
  const deptStaffList = mau02Data.filter(u => u.dept_id === effectiveDeptId);
  const deptStaffCount = deptStaffList.length;
  const deptTotalScoreSum = deptStaffList.reduce((acc, u) => acc + (u.total_score || 0), 0);
  const deptAvgKpi = deptStaffCount > 0 ? (deptTotalScoreSum / deptStaffCount).toFixed(1) : '0';

  const deptExcellentStaff = deptStaffList.filter(u => (u.superior_rank || u.rank_proposed) === 'Hoàn thành xuất sắc nhiệm vụ');
  const deptGoodStaff = deptStaffList.filter(u => (u.superior_rank || u.rank_proposed) === 'Hoàn thành tốt nhiệm vụ');
  const deptCompleteStaff = deptStaffList.filter(u => (u.superior_rank || u.rank_proposed) === 'Hoàn thành nhiệm vụ');
  const deptFailStaff = deptStaffList.filter(u => (u.superior_rank || u.rank_proposed) === 'Không hoàn thành nhiệm vụ');

  const deptExcellentPct = deptStaffCount > 0 ? Number(((deptExcellentStaff.length / deptStaffCount) * 100).toFixed(1)) : 0;
  const isDeptExceedingQuota = deptExcellentPct > maxExcellentPct;

  const deptTotalTasks = deptStaffList.reduce((acc, u) => acc + (u.total_tasks || 0), 0);
  const deptApprovedTasks = deptStaffList.reduce((acc, u) => acc + (u.approved_tasks || 0), 0);
  const deptTaskCompletionPct = deptTotalTasks > 0 ? Math.round((deptApprovedTasks / deptTotalTasks) * 100) : 0;

  // --- Calculations for Agency View ---
  const agencyStaffCount = mau02Data.length;
  const agencyTotalScoreSum = mau02Data.reduce((acc, u) => acc + (u.total_score || 0), 0);
  const agencyAvgKpi = agencyStaffCount > 0 ? (agencyTotalScoreSum / agencyStaffCount).toFixed(1) : '0';
  const agencyExcellentStaff = mau02Data.filter(u => (u.superior_rank || u.rank_proposed) === 'Hoàn thành xuất sắc nhiệm vụ');
  const agencyExcellentPct = agencyStaffCount > 0 ? Number(((agencyExcellentStaff.length / agencyStaffCount) * 100).toFixed(1)) : 0;
  const isAgencyExceedingQuota = agencyExcellentPct > maxExcellentPct;

  // Department KPI Rankings for Agency View
  const deptRankings = departments.map(d => {
    const dUsers = mau02Data.filter(u => u.dept_id === d.id);
    const count = dUsers.length;
    const avgP1 = count > 0 ? (dUsers.reduce((s, u) => s + (u.part1_score || 0), 0) / count).toFixed(1) : '0';
    const avgP2 = count > 0 ? (dUsers.reduce((s, u) => s + (u.part2_score || 0), 0) / count).toFixed(1) : '0';
    const totalScoreAvg = count > 0 ? Number((dUsers.reduce((s, u) => s + (u.total_score || 0), 0) / count).toFixed(1)) : 0;
    const excCount = dUsers.filter(u => (u.superior_rank || u.rank_proposed) === 'Hoàn thành xuất sắc nhiệm vụ').length;
    const excPct = count > 0 ? Number(((excCount / count) * 100).toFixed(1)) : 0;
    const dTasks = dUsers.reduce((s, u) => s + (u.total_tasks || 0), 0);
    const dApprTasks = dUsers.reduce((s, u) => s + (u.approved_tasks || 0), 0);
    const taskRate = dTasks > 0 ? Math.round((dApprTasks / dTasks) * 100) : 0;

    return {
      dept: d,
      staffCount: count,
      avgP1,
      avgP2,
      avgTotal: totalScoreAvg,
      excCount,
      excPct,
      taskRate
    };
  }).sort((a, b) => b.avgTotal - a.avgTotal);

  // Agency Staff List filtered
  const filteredAgencyStaff = mau02Data.filter(u => {
    const matchDept = agencyDeptFilter === 'all' || u.dept_id === agencyDeptFilter;
    const rank = u.superior_rank || u.rank_proposed;
    let matchRank = true;
    if (agencyRankFilter === 'excellent') matchRank = rank === 'Hoàn thành xuất sắc nhiệm vụ';
    else if (agencyRankFilter === 'good') matchRank = rank === 'Hoàn thành tốt nhiệm vụ';
    else if (agencyRankFilter === 'complete') matchRank = rank === 'Hoàn thành nhiệm vụ';
    else if (agencyRankFilter === 'fail') matchRank = rank === 'Không hoàn thành nhiệm vụ';

    const matchSearch = !searchStaffText || 
      u.full_name?.toLowerCase().includes(searchStaffText.toLowerCase()) ||
      u.gov_title?.toLowerCase().includes(searchStaffText.toLowerCase()) ||
      u.party_title?.toLowerCase().includes(searchStaffText.toLowerCase());

    return matchDept && matchRank && matchSearch;
  });

  // Filtered Personal Tasks
  const filteredPersonalTasks = userTasks.filter(t => {
    if (personalTaskFilter === 'all') return true;
    if (personalTaskFilter === 'approved') return t.status === 'approved';
    if (personalTaskFilter === 'submitted') return t.status === 'submitted';
    if (personalTaskFilter === 'in_progress') return t.status === 'in_progress' || t.status === 'assigned';
    return true;
  });

  return (
    <div className="space-y-6">

      {/* Period Finalized Banner */}
      {isPeriodLocked && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-emerald-900 shadow-xs">
          <div className="flex items-center space-x-3">
            <Lock className="w-5 h-5 text-emerald-700 shrink-0" />
            <div>
              <div className="text-sm font-bold">Kỳ đánh giá đã được Chốt & Khóa Sổ KPI Toàn Đơn Vị / Cơ Quan</div>
              <div className="text-xs text-emerald-700 mt-0.5">
                Toàn bộ dữ liệu điểm số, tỷ lệ xuất sắc ({maxExcellentPct}%) và kết luận xếp loại đã được khóa sổ chính thức theo Quy định 366.
                {currentPeriodObj?.finalized_at && ` (Thời điểm chốt: ${formatDate(currentPeriodObj.finalized_at)}${currentPeriodObj?.finalized_by ? ` bởi ${currentPeriodObj.finalized_by}` : ''})`}
              </div>
            </div>
          </div>
          {isAdminOrLeader && (
            <button
              onClick={handleToggleFinalizePeriod}
              className="flex items-center space-x-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-xs transition-colors shrink-0 cursor-pointer"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Mở khóa KPI</span>
            </button>
          )}
        </div>
      )}

      {/* Main Top Header & Scope Selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center space-x-1 bg-red-50 text-red-800 text-xs font-medium px-3 py-1 rounded-full border border-red-200">
              <Sparkles className="w-3.5 h-3.5 text-red-600" />
              <span>BẢNG GIÁM SÁT & BÁO CÁO KPI</span>
            </span>
            <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
              Kỳ: <span className="font-semibold text-slate-700">{currentPeriodObj?.name || selectedPeriod}</span>
            </span>
            <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
              Đơn vị: <span className="font-semibold text-slate-700">{currentUser?.dept_name}</span>
            </span>
            {isPeriodLocked && (
              <span className="inline-flex items-center space-x-1 bg-emerald-100 text-emerald-800 text-[11px] font-semibold px-2 py-0.5 rounded-md border border-emerald-300">
                <Lock className="w-3 h-3" />
                <span>Đã Chốt KPI Kỳ {currentPeriodObj?.name}</span>
              </span>
            )}
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-1.5">
            Hệ thống Theo dõi & Đánh giá Kết quả Thực hiện KPI
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 font-normal">
            Căn cứ Quy định số 366-QĐ/TW và Hướng dẫn số 06-HD/BTCTU về đánh giá cán bộ, công chức, viên chức
          </p>
        </div>

        {/* Global Print & Excel Actions */}
        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto justify-end">
          {isAdminOrLeader && (
            <button
              type="button"
              onClick={() => setIsFinalizeModalOpen(true)}
              className={`flex items-center space-x-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg shadow-xs transition-colors cursor-pointer ${
                isPeriodLocked
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-emerald-700 hover:bg-emerald-800 text-white'
              }`}
              title="Quản lý Chốt / Mở khóa kết quả KPI theo Quý"
            >
              {isPeriodLocked ? (
                <>
                  <Unlock className="w-4 h-4 text-white" />
                  <span>Quản lý Chốt KPI Quý ({currentPeriodObj?.name || 'Theo Quý'})</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-white" />
                  <span>Chốt KPI theo Quý ({currentPeriodObj?.name || 'Theo Quý'})</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium px-3.5 py-2 rounded-lg shadow-xs transition-colors cursor-pointer"
            title="In trực tiếp hoặc Xuất file PDF chuẩn Nghị định 30 (Times New Roman 14pt)"
          >
            <Printer className="w-4 h-4 text-slate-200" />
            <span>In Báo Cáo / PDF</span>
          </button>

          {activeScope === 'agency' ? (
            <a
              href={api.getExportMau02Url(selectedPeriod)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-1.5 bg-red-700 hover:bg-red-800 text-white text-xs font-medium px-3.5 py-2 rounded-lg shadow-xs transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Tải Excel Mẫu 02 (Toàn CQ)</span>
            </a>
          ) : (
            <a
              href={api.getExportUrl(selectedPeriod, currentUser?.id)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium px-3.5 py-2 rounded-lg shadow-xs transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Tải Excel ({activeScope === 'personal' ? 'Cá nhân' : 'Đơn vị'})</span>
            </a>
          )}
        </div>
      </div>

      {/* Scope Navigation Bar (Personal vs Unit vs Agency) */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-2.5 gap-2 overflow-x-auto shadow-2xs">
        
        {/* 1. Báo cáo KPI Cá nhân */}
        <button
          type="button"
          onClick={() => setActiveScope('personal')}
          className={`flex items-center space-x-2 py-2.5 px-4 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-all cursor-pointer ${
            activeScope === 'personal'
              ? 'border-red-700 text-red-700 bg-red-50/40 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Báo Cáo KPI Cá Nhân</span>
          <span className="ml-1.5 px-2 py-0.5 text-[11px] rounded-full bg-red-100 text-red-800 font-semibold">
            {evaluation.total_score || 0} đ
          </span>
        </button>

        {/* 2. Báo cáo KPI Toàn Đơn vị / Phòng ban */}
        <button
          type="button"
          onClick={() => setActiveScope('unit')}
          className={`flex items-center space-x-2 py-2.5 px-4 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-all cursor-pointer ${
            activeScope === 'unit'
              ? 'border-red-700 text-red-700 bg-red-50/40 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Báo Cáo KPI Đơn Vị / Phòng Ban</span>
          <span className="ml-1.5 px-2 py-0.5 text-[11px] rounded-full bg-blue-100 text-blue-800 font-semibold">
            {deptStaffCount} nhân sự
          </span>
        </button>

        {/* 3. Báo cáo KPI Toàn Cơ quan Chủ quản (Chỉ Lãnh đạo & Admin) */}
        {isAdminOrLeader && (
          <button
            type="button"
            onClick={() => setActiveScope('agency')}
            className={`flex items-center space-x-2 py-2.5 px-4 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-all cursor-pointer ${
              activeScope === 'agency'
                ? 'border-red-700 text-red-700 bg-red-50/40 rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Báo Cáo KPI Toàn Cơ Quan Chủ Quản</span>
            <span className="ml-1.5 px-2 py-0.5 text-[11px] rounded-full bg-purple-100 text-purple-800 font-semibold">
              {departments.length} đơn vị
            </span>
          </button>
        )}

      </div>

      {/* ========================================================================= */}
      {/* SCOPE 1: BÁO CÁO KPI CÁ NHÂN */}
      {/* ========================================================================= */}
      {activeScope === 'personal' && (
        <div className="space-y-6">
          
          {/* Welcome & Profile Summary Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <span className="inline-block bg-red-50 text-red-800 border border-red-200 text-xs font-medium px-3 py-0.5 rounded-full uppercase tracking-wider">
                  {currentUser?.role === 'cbql' ? 'Cán bộ Quản lý / Lãnh đạo Đơn vị' : currentUser?.role === 'lanh_dao' ? 'Lãnh đạo Cơ quan' : currentUser?.role === 'admin' ? 'Quản trị viên Hệ thống' : 'Cán bộ Nhân viên'}
                </span>
                <span className="text-xs bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-0.5 rounded-full font-normal">
                  Mã CB: {currentUser?.id}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                {currentUser?.full_name}
              </h3>
              <p className="text-slate-500 text-xs sm:text-sm mt-1 font-normal">
                {currentUser?.party_title ? `${currentUser.party_title} • ` : ''}
                {currentUser?.gov_title ? `${currentUser.gov_title} • ` : ''}
                <span className="text-slate-700 font-medium">{currentUser?.dept_name}</span>
              </p>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCurrentTab('assignment')}
                className="flex items-center space-x-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium px-3.5 py-2 rounded-lg border border-slate-200 shadow-2xs transition-colors cursor-pointer"
              >
                <Layers className="w-4 h-4 text-slate-500" />
                <span>Quản Lý Nhiệm Vụ</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrentTab('self_eval')}
                className="flex items-center space-x-2 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold px-3.5 py-2 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <Award className="w-4 h-4" />
                <span>Đánh Giá Cuối Kỳ</span>
              </button>
            </div>
          </div>

          {/* KPI Evaluation Score Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Total Score */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-red-300 transition-colors">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-slate-500 uppercase">Tổng Điểm KPI Cá Nhân</span>
                <Award className="w-5 h-5 text-amber-500" />
              </div>
              <div className="mt-2 flex items-baseline space-x-1.5">
                <span className="text-2xl sm:text-3xl font-bold text-slate-900">{evaluation.total_score || 0}</span>
                <span className="text-xs text-slate-400 font-normal">/ 100 điểm</span>
              </div>
              <div className="mt-2.5">
                <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${
                  (evaluation.total_score || 0) >= 90 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                  (evaluation.total_score || 0) >= 70 ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                  (evaluation.total_score || 0) >= 50 ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                  'bg-red-100 text-red-800 border border-red-300'
                }`}>
                  {evaluation.rank_proposed || 'Chưa xếp loại'}
                </span>
              </div>
            </div>

            {/* Part 1 Score */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-slate-500 uppercase">Phần I: Tiêu Chí Chung</span>
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <div className="mt-2 flex items-baseline space-x-1.5">
                <span className="text-2xl sm:text-3xl font-bold text-slate-900">{evaluation.part1_score || 0}</span>
                <span className="text-xs text-slate-400 font-normal">/ 30 điểm</span>
              </div>
              <p className="mt-2 text-xs text-slate-500 font-normal leading-relaxed">
                17 tiêu chuẩn chính trị, tư tưởng, đạo đức, lối sống theo Quy định 366-QĐ/TW
              </p>
            </div>

            {/* Part 2 Score */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-slate-500 uppercase">Phần II: 6 Trục Trọng Tâm</span>
                <Layers className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="mt-2 flex items-baseline space-x-1.5">
                <span className="text-2xl sm:text-3xl font-bold text-slate-900">{evaluation.part2_score || 0}</span>
                <span className="text-xs text-slate-400 font-normal">/ 70 điểm</span>
              </div>
              <p className="mt-2 text-xs text-slate-500 font-normal leading-relaxed">
                Công thức HD.06: KPI = 70 × Thực tế hoàn thành (B) / Kế hoạch đăng ký (A)
              </p>
            </div>

            {/* Ahead of Schedule & Bonus */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-slate-500 uppercase">Vượt Tiến Độ & Điểm Thưởng</span>
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline space-x-2">
                <span className="text-2xl sm:text-3xl font-bold text-emerald-700">
                  {evalData?.stats?.aheadSchedulePct || 0}%
                </span>
                <span className="text-xs font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  +{evaluation.bonus_score || 0}đ thưởng
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 font-normal">
                {(evalData?.stats?.aheadSchedulePct || 0) >= 30 ? (
                  <span className="text-emerald-700 font-medium">✓ Đạt chuẩn hoàn thành xuất sắc (&gt;= 30%)</span>
                ) : (
                  <span className="text-amber-700 font-normal">Cần hoàn thành trước hạn &gt;= 30% để xét Xuất sắc</span>
                )}
              </p>
            </div>

          </div>

          {/* Task Status Execution Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center space-x-3 shadow-2xs">
              <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-100">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-slate-800">{stats?.inProgressTasks || 0}</div>
                <div className="text-xs text-slate-500 font-normal">Đang thực hiện</div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center space-x-3 shadow-2xs">
              <div className="p-2.5 bg-amber-50 text-amber-700 rounded-lg border border-amber-100">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-slate-800">{stats?.submittedTasks || 0}</div>
                <div className="text-xs text-slate-500 font-normal">Đã nộp minh chứng</div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center space-x-3 shadow-2xs">
              <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-slate-800">{stats?.approvedTasks || 0}</div>
                <div className="text-xs text-slate-500 font-normal">Đã duyệt hoàn thành</div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center space-x-3 shadow-2xs">
              <div className="p-2.5 bg-purple-50 text-purple-700 rounded-lg border border-purple-100">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-slate-800">{stats?.totalTasks || 0}</div>
                <div className="text-xs text-slate-500 font-normal">Tổng số việc trong kỳ</div>
              </div>
            </div>
          </div>

          {/* 6 Axes Breakdown (Grid / Table) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-900">
                  Kết quả thực hiện theo 6 Trục Trọng tâm (Phần II - 70 điểm)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-normal">
                  Điểm đạt được = Điểm tối đa của trục × Tỷ lệ hoàn thành KPI % (Điểm quy đổi / Điểm chuẩn)
                </p>
              </div>
              
              <div className="flex items-center space-x-3 w-full md:w-auto justify-between md:justify-end">
                <div className="bg-slate-100 p-1 rounded-lg flex items-center border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`px-3 py-1.5 rounded-md text-xs flex items-center space-x-1.5 transition-all cursor-pointer ${
                      viewMode === 'grid' 
                        ? 'bg-white text-red-700 font-medium shadow-xs' 
                        : 'text-slate-600 hover:text-slate-900 font-normal'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Dạng Thẻ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`px-3 py-1.5 rounded-md text-xs flex items-center space-x-1.5 transition-all cursor-pointer ${
                      viewMode === 'table' 
                        ? 'bg-white text-red-700 font-medium shadow-xs' 
                        : 'text-slate-600 hover:text-slate-900 font-normal'
                    }`}
                  >
                    <Table className="w-3.5 h-3.5" />
                    <span>Dạng Bảng</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentTab('grading')}
                  className="text-xs font-normal text-red-700 hover:text-red-800 flex items-center space-x-1 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <span>Quy chế tính điểm</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                {axesSummary.map((ax, idx) => {
                  const pct = Math.min(100, Math.round(ax.kpi_pct * 100));
                  return (
                    <div 
                      key={ax.axis_code} 
                      className="border border-slate-200 rounded-xl p-4 sm:p-5 bg-white hover:border-red-300 hover:shadow-sm transition-all flex flex-col justify-between shadow-2xs"
                    >
                      <div>
                        <div className="flex justify-between items-center pb-2.5 border-b border-slate-100">
                          <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-md">
                            Trục {idx + 1}
                          </span>
                          <div className="text-right">
                            <span className="text-sm font-semibold text-slate-900">{ax.axis_score}</span>
                            <span className="text-xs text-slate-400 font-normal"> / {ax.max_score} đ</span>
                          </div>
                        </div>

                        <h4 className="text-xs sm:text-[13px] font-normal text-slate-800 mt-2.5 mb-2.5 leading-relaxed min-h-[50px] flex items-start">
                          {ax.axis_name.replace(`TRỤC ${idx + 1} - `, '')}
                        </h4>
                      </div>

                      <div className="pt-2.5 border-t border-slate-100">
                        <div className="flex justify-between items-center text-xs text-slate-500 mb-1.5 font-normal">
                          <span>Tỷ lệ KPI: <span className="font-semibold text-slate-700">{pct}%</span></span>
                          <span>{ax.tasks_count} công việc</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden p-0.5 border border-slate-200">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              pct >= 100 ? 'bg-emerald-600' :
                              pct >= 80 ? 'bg-blue-600' :
                              pct >= 60 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-400 mt-1.5 font-normal">
                          <span>Điểm quy đổi: <span className="font-medium text-slate-600">{ax.sum_converted_score || 0}</span></span>
                          <span>Điểm chuẩn: <span className="font-medium text-slate-600">{ax.sum_standard_score || 0}</span></span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-xs">
                <table className="w-full text-left text-xs sm:text-sm text-slate-700">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-xs">
                    <tr>
                      <th className="px-3.5 py-3 text-center w-16">Trục</th>
                      <th className="px-4 py-3 min-w-[300px]">Nội dung Trục Trọng tâm</th>
                      <th className="px-3.5 py-3 text-center w-24">Điểm chuẩn</th>
                      <th className="px-3.5 py-3 text-center w-24">Điểm quy đổi</th>
                      <th className="px-3.5 py-3 text-center w-24">Tỷ lệ KPI</th>
                      <th className="px-3.5 py-3 text-center w-24">Điểm tối đa</th>
                      <th className="px-3.5 py-3 text-center w-28">Điểm đạt được</th>
                      <th className="px-3.5 py-3 text-center w-20">Số việc</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {axesSummary.map((ax, idx) => {
                      const pct = Math.min(100, Math.round(ax.kpi_pct * 100));
                      return (
                        <tr key={ax.axis_code} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-3.5 py-3 text-center text-red-700 font-medium">
                            <span className="bg-red-50 border border-red-200 px-2 py-0.5 rounded text-xs">
                              Trục {idx + 1}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-normal text-slate-800 leading-relaxed">
                            {ax.axis_name.replace(`TRỤC ${idx + 1} - `, '')}
                          </td>
                          <td className="px-3.5 py-3 text-center text-slate-600 font-normal">
                            {ax.sum_standard_score || 0}
                          </td>
                          <td className="px-3.5 py-3 text-center text-slate-600 font-normal">
                            {ax.sum_converted_score || 0}
                          </td>
                          <td className="px-3.5 py-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              pct >= 100 ? 'bg-emerald-100 text-emerald-800' :
                              pct >= 80 ? 'bg-blue-100 text-blue-800' :
                              pct >= 60 ? 'bg-amber-100 text-amber-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {pct}%
                            </span>
                          </td>
                          <td className="px-3.5 py-3 text-center font-normal text-slate-600">
                            {ax.max_score} đ
                          </td>
                          <td className="px-3.5 py-3 text-center font-semibold text-slate-900 text-sm">
                            {ax.axis_score} đ
                          </td>
                          <td className="px-3.5 py-3 text-center text-slate-500 font-normal">
                            {ax.tasks_count} việc
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 font-semibold border-t border-slate-300 text-slate-900 text-xs">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-right uppercase tracking-wider text-slate-600">
                        Tổng cộng Phần II (6 Trục Trọng tâm):
                      </td>
                      <td className="px-3.5 py-3 text-center text-indigo-700 font-bold text-sm">
                        {axesSummary.reduce((acc, a) => acc + (a.max_score || 0), 0)} đ
                      </td>
                      <td className="px-3.5 py-3 text-center text-red-700 font-bold text-sm">
                        {evaluation.part2_score || 0} đ
                      </td>
                      <td className="px-3.5 py-3 text-center text-slate-600 font-normal">
                        {axesSummary.reduce((acc, a) => acc + (a.tasks_count || 0), 0)} việc
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Personal Task List in Current Period */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-900">
                  Danh Mục Nhiệm Vụ Trong Kỳ ({filteredPersonalTasks.length} nhiệm vụ)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-normal">
                  Căn cứ thẩm định điểm quy đổi theo thời hạn hoàn thành và chất lượng sản phẩm
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={personalTaskFilter}
                  onChange={(e) => setPersonalTaskFilter(e.target.value)}
                  className="text-xs font-normal p-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
                >
                  <option value="all">Tất cả trạng thái ({userTasks.length})</option>
                  <option value="approved">Đã phê duyệt hoàn thành ({userTasks.filter(t => t.status === 'approved').length})</option>
                  <option value="submitted">Đã nộp minh chứng ({userTasks.filter(t => t.status === 'submitted').length})</option>
                  <option value="in_progress">Đang thực hiện ({userTasks.filter(t => t.status === 'in_progress' || t.status === 'assigned').length})</option>
                </select>

                <button
                  type="button"
                  onClick={() => setCurrentTab('assignment')}
                  className="text-xs font-medium text-red-700 hover:text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  + Đăng ký / Giao việc mới
                </button>
              </div>
            </div>

            {filteredPersonalTasks.length === 0 ? (
              <div className="py-10 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                <Layers className="w-9 h-9 mx-auto mb-2 text-slate-300" />
                <p className="font-medium text-slate-600 text-sm">Chưa có nhiệm vụ nào trong danh mục</p>
                <p className="text-xs mt-1 text-slate-400">Hãy đăng ký nhiệm vụ mới hoặc nhận phân công từ lãnh đạo đơn vị</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs sm:text-sm text-slate-700">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-xs">
                    <tr>
                      <th className="px-3 py-3 text-center w-12 font-semibold">STT</th>
                      <th className="px-4 py-3 min-w-[240px] font-semibold">Tên Nhiệm Vụ</th>
                      <th className="px-3 py-3 text-center w-24 font-semibold">Trục</th>
                      <th className="px-3 py-3 text-center w-24 font-semibold">Nguồn</th>
                      <th className="px-3 py-3 text-center w-28 font-semibold">Thời hạn</th>
                      <th className="px-3 py-3 text-center w-28 font-semibold">Xong thực tế</th>
                      <th className="px-3 py-3 text-center w-20 font-semibold">Điểm chuẩn</th>
                      <th className="px-3 py-3 text-center w-20 font-semibold">HSĐK</th>
                      <th className="px-3 py-3 text-center w-24 font-semibold">Tiến độ</th>
                      <th className="px-3 py-3 text-center w-24 font-semibold">Điểm quy đổi</th>
                      <th className="px-4 py-3 text-center w-32 font-semibold">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredPersonalTasks.map((task, idx) => {
                      const diffWeight = task.difficulty_weight || 1.0;
                      const diffPct = Math.round(diffWeight * 100);
                      const isAhead = (task.progress_pct === 1.0 && task.actual_finish_date && task.actual_finish_date < task.deadline) || task.bonus_score > 0;

                      return (
                        <tr key={task.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-3 py-3 text-center font-normal text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900 leading-snug">
                              {task.task_name}
                            </div>
                            {task.output_result && (
                              <div className="text-[11px] text-slate-500 mt-0.5 font-normal">
                                Sản phẩm: {task.output_result}
                              </div>
                            )}
                            {task.evidence_text && (
                              <div className="text-[11px] text-blue-600 mt-0.5 italic font-normal">
                                Minh chứng: {task.evidence_text}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-medium border border-slate-200">
                              {task.axis_code?.replace('TRUC_', 'Trục ')}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-normal ${
                              task.origin === 'assigned' 
                                ? 'bg-purple-100 text-purple-800' 
                                : 'bg-teal-100 text-teal-800'
                            }`}>
                              {task.origin === 'assigned' ? 'Được giao' : 'Đăng ký'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center font-normal text-slate-600">
                            {formatDate(task.deadline)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {task.actual_finish_date ? (
                              <span className={`font-normal ${isAhead ? 'text-emerald-700 font-medium' : 'text-slate-700'}`}>
                                {formatDate(task.actual_finish_date)}
                                {isAhead && <span className="block text-[10px] text-emerald-600 font-normal">Trước hạn</span>}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center font-normal text-slate-700">
                            {task.standard_score}
                          </td>
                          <td className="px-3 py-3 text-center font-normal text-slate-700">
                            <span className="bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded text-[11px]">
                              {diffPct}%
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="font-normal text-slate-800">
                              {Math.round((task.progress_pct || 0) * 100)}%
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center font-semibold text-red-700 text-sm">
                            {task.converted_score !== undefined ? Number(task.converted_score).toFixed(2) : '0.00'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                              task.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                              task.status === 'submitted' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                              task.status === 'rejected' ? 'bg-red-100 text-red-800 border border-red-300' :
                              'bg-blue-100 text-blue-800 border border-blue-200'
                            }`}>
                              {task.status === 'approved' ? '✓ Đã duyệt' :
                               task.status === 'submitted' ? '⏳ Đã nộp MC' :
                               task.status === 'rejected' ? '✕ Từ chối' : '⚙ Đang làm'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* SCOPE 2: BÁO CÁO KPI TOÀN ĐƠN VỊ / PHÒNG BAN */}
      {/* ========================================================================= */}
      {activeScope === 'unit' && (
        <div className="space-y-6">

          {/* Department Selector & Unit Header */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-medium text-blue-800 bg-blue-50 border border-blue-200 px-3 py-0.5 rounded-full uppercase">
                  BÁO CÁO TỔNG HỢP KPI ĐƠN VỊ
                </span>
                <span className="text-xs text-slate-500 font-normal">
                  (Căn cứ Mẫu 02 theo Hướng dẫn 06-HD/BTCTU)
                </span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 mt-1.5">
                {currentDeptObj.name}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5 font-normal">
                Cơ quan: <span className="font-semibold text-slate-700">{unitName}</span> • {parentAgencyName}
              </p>
            </div>

            {/* Department Picker for Admin/Leaders */}
            {isAdminOrLeader && (
              <div className="flex items-center space-x-2 w-full md:w-auto">
                <label className="text-xs font-medium text-slate-700 whitespace-nowrap">Chọn Phòng/Đơn vị:</label>
                <select
                  value={effectiveDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  className="text-xs font-normal p-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 w-full md:w-64"
                >
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 4 Unit Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Total Staff in Unit */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-slate-500 uppercase">Tổng Cán Bộ Đơn Vị</span>
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div className="mt-2 flex items-baseline space-x-1.5">
                <span className="text-2xl sm:text-3xl font-bold text-slate-900">{deptStaffCount}</span>
                <span className="text-xs font-normal text-slate-400">cán bộ</span>
              </div>
              <p className="mt-2 text-xs text-slate-500 font-normal">
                Bao gồm Trưởng/Phó phòng và toàn bộ chuyên viên
              </p>
            </div>

            {/* Average Unit KPI Score */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-slate-500 uppercase">Điểm KPI Trung Bình Đơn Vị</span>
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline space-x-1.5">
                <span className="text-2xl sm:text-3xl font-bold text-slate-900">{deptAvgKpi}</span>
                <span className="text-xs font-normal text-slate-400">/ 100 điểm</span>
              </div>
              <p className="mt-2 text-xs text-slate-500 font-normal">
                Điểm bình quân thực hiện công việc và tiêu chí chung
              </p>
            </div>

            {/* Outstanding Quota (<= 20%) */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-slate-500 uppercase">Tỷ Lệ Hoàn Thành Xuất Sắc</span>
                <Award className={`w-5 h-5 ${isDeptExceedingQuota ? 'text-red-600' : 'text-emerald-600'}`} />
              </div>
              <div className="mt-2 flex items-baseline space-x-2">
                <span className={`text-2xl sm:text-3xl font-bold ${isDeptExceedingQuota ? 'text-red-700' : 'text-emerald-700'}`}>
                  {deptExcellentPct}%
                </span>
                <span className="text-xs text-slate-400 font-normal">
                  ({deptExcellentStaff.length}/{deptStaffCount} người)
                </span>
              </div>
              <div className="mt-2">
                {isDeptExceedingQuota ? (
                  <span className="inline-flex items-center text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Vượt định mức khống chế &gt; {maxExcellentPct}%
                  </span>
                ) : (
                  <span className="inline-flex items-center text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                    <Check className="w-3 h-3 mr-1" />
                    Đạt định mức khống chế ≤ {maxExcellentPct}%
                  </span>
                )}
              </div>
            </div>

            {/* Task Completion Rate */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-slate-500 uppercase">Tỷ Lệ Hoàn Thành Nhiệm Vụ</span>
                <CheckCircle2 className="w-5 h-5 text-purple-600" />
              </div>
              <div className="mt-2 flex items-baseline space-x-2">
                <span className="text-2xl sm:text-3xl font-bold text-purple-700">{deptTaskCompletionPct}%</span>
                <span className="text-xs text-slate-400 font-normal">
                  ({deptApprovedTasks}/{deptTotalTasks} việc)
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 font-normal">
                Tỷ lệ công việc đã được thẩm định & phê duyệt
              </p>
            </div>

          </div>

          {/* 4-Tier Rank Distribution Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-3.5">
            <h4 className="text-xs sm:text-sm font-semibold text-slate-700 uppercase">
              Phân Bổ Xếp Loại Đơn Vị ({deptStaffCount} cán bộ)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <div className="text-xs font-medium text-emerald-800">Xuất Sắc (≥ 90đ)</div>
                <div className="text-xl sm:text-2xl font-bold text-emerald-900 mt-1">{deptExcellentStaff.length} cán bộ</div>
                <div className="text-xs text-emerald-700 font-normal">{deptExcellentPct}% đơn vị</div>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-xs font-medium text-blue-800">Hoàn Thành Tốt (70 - 89đ)</div>
                <div className="text-xl sm:text-2xl font-bold text-blue-900 mt-1">{deptGoodStaff.length} cán bộ</div>
                <div className="text-xs text-blue-700 font-normal">
                  {deptStaffCount > 0 ? ((deptGoodStaff.length / deptStaffCount) * 100).toFixed(1) : 0}% đơn vị
                </div>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="text-xs font-medium text-amber-800">Hoàn Thành (50 - 69đ)</div>
                <div className="text-xl sm:text-2xl font-bold text-amber-900 mt-1">{deptCompleteStaff.length} cán bộ</div>
                <div className="text-xs text-amber-700 font-normal">
                  {deptStaffCount > 0 ? ((deptCompleteStaff.length / deptStaffCount) * 100).toFixed(1) : 0}% đơn vị
                </div>
              </div>
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="text-xs font-medium text-red-800">Không Hoàn Thành (&lt; 50đ)</div>
                <div className="text-xl sm:text-2xl font-bold text-red-900 mt-1">{deptFailStaff.length} cán bộ</div>
                <div className="text-xs text-red-700 font-normal">
                  {deptStaffCount > 0 ? ((deptFailStaff.length / deptStaffCount) * 100).toFixed(1) : 0}% đơn vị
                </div>
              </div>
            </div>
          </div>

          {/* Unit Staff KPI Table */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
              <div>
                <h4 className="text-base sm:text-lg font-semibold text-slate-900">
                  Bảng Tổng Hợp Kết Quả Đánh Giá Cán Bộ Trong Đơn Vị (Mẫu 02)
                </h4>
                <p className="text-xs text-slate-500 mt-0.5 font-normal">
                  Xếp hạng theo điểm tổng kết quả đánh giá thực thi công việc và tiêu chí chung
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setCurrentTab('reports')}
                  className="text-xs font-normal text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                >
                  Mở Module Báo cáo & Ký duyệt
                </button>
              </div>
            </div>

            {deptStaffList.length === 0 ? (
              <div className="py-12 text-center text-slate-400 bg-slate-50/50 rounded-xl">
                <p className="font-medium text-slate-600 text-sm">Đơn vị chưa có cán bộ nào được đánh giá trong kỳ</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-xs">
                <table className="w-full text-left text-xs sm:text-sm text-slate-700">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-xs">
                    <tr>
                      <th className="px-3 py-3 text-center w-12 font-semibold">STT</th>
                      <th className="px-4 py-3 min-w-[190px] font-semibold">Họ Và Tên</th>
                      <th className="px-3 py-3 min-w-[150px] font-semibold">Chức Vụ / Chức Danh</th>
                      <th className="px-3 py-3 text-center w-28 font-semibold">Nhiệm Vụ (Duyệt/Tổng)</th>
                      <th className="px-3 py-3 text-center w-24 font-semibold">Trước Hạn</th>
                      <th className="px-3 py-3 text-center w-24 font-semibold">Phần I (30)</th>
                      <th className="px-3 py-3 text-center w-24 font-semibold">Phần II (70)</th>
                      <th className="px-3 py-3 text-center w-20 font-semibold">Thưởng</th>
                      <th className="px-3 py-3 text-center w-24 font-semibold">Tổng KPI</th>
                      <th className="px-4 py-3 text-center min-w-[160px] font-semibold">Xếp Loại Đề Xuất</th>
                      <th className="px-3 py-3 text-center w-24 font-semibold">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {deptStaffList.map((staff, idx) => {
                      const totalScore = staff.total_score || 0;
                      const rank = staff.superior_rank || staff.rank_proposed || 'Chưa xếp loại';

                      return (
                        <tr key={staff.user_id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-3 py-3 text-center font-normal text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">
                              {staff.full_name}
                            </div>
                            <div className="text-[11px] text-slate-400 font-normal">
                              {staff.target_role === 'cbql' || staff.role === 'cbql' ? 'Cán bộ quản lý' : 'Cán bộ nhân viên'}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-slate-600 font-normal">
                            {staff.party_title ? <div className="text-xs font-normal">{staff.party_title}</div> : null}
                            {staff.gov_title ? <div className="text-xs text-slate-500 font-normal">{staff.gov_title}</div> : null}
                            {!staff.party_title && !staff.gov_title && <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center font-normal">
                            <span className="font-medium text-slate-800">{staff.approved_tasks || 0}</span>
                            <span className="text-slate-400"> / {staff.total_tasks || 0}</span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {staff.ahead_tasks > 0 ? (
                              <span className="text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded text-xs border border-emerald-200">
                                {staff.ahead_tasks} việc
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal">0</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center font-normal text-slate-700">
                            {staff.part1_score || 0}
                          </td>
                          <td className="px-3 py-3 text-center font-normal text-slate-700">
                            {staff.part2_score || 0}
                          </td>
                          <td className="px-3 py-3 text-center font-normal text-emerald-700">
                            {staff.bonus_score ? `+${staff.bonus_score}` : '0'}
                          </td>
                          <td className="px-3 py-3 text-center font-semibold text-red-700 text-sm">
                            {totalScore}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                              rank === 'Hoàn thành xuất sắc nhiệm vụ' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                              rank === 'Hoàn thành tốt nhiệm vụ' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                              rank === 'Hoàn thành nhiệm vụ' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                              'bg-red-100 text-red-800 border border-red-300'
                            }`}>
                              {rank}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleOpenStaffModal(staff)}
                              className="inline-flex items-center space-x-1 text-xs font-normal text-red-700 hover:text-red-900 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-md border border-red-200 transition-colors cursor-pointer"
                              title="Xem chi tiết điểm 6 trục của cán bộ này"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Chi tiết</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 font-semibold border-t border-slate-300 text-slate-900 text-xs">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-right uppercase tracking-wider text-slate-600 font-medium">
                        Trung bình toàn đơn vị ({deptStaffCount} cán bộ):
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-800">
                        {deptApprovedTasks}/{deptTotalTasks}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-emerald-700">
                        {deptStaffList.reduce((s, u) => s + (u.ahead_tasks || 0), 0)}
                      </td>
                      <td className="px-3 py-3 text-center font-normal text-slate-800">
                        {deptStaffCount > 0 ? (deptStaffList.reduce((s, u) => s + (u.part1_score || 0), 0) / deptStaffCount).toFixed(1) : 0}
                      </td>
                      <td className="px-3 py-3 text-center font-normal text-slate-800">
                        {deptStaffCount > 0 ? (deptStaffList.reduce((s, u) => s + (u.part2_score || 0), 0) / deptStaffCount).toFixed(1) : 0}
                      </td>
                      <td className="px-3 py-3 text-center font-normal text-emerald-700">
                        {deptStaffCount > 0 ? (deptStaffList.reduce((s, u) => s + (u.bonus_score || 0), 0) / deptStaffCount).toFixed(1) : 0}
                      </td>
                      <td className="px-3 py-3 text-center font-bold text-red-700 text-sm">
                        {deptAvgKpi}
                      </td>
                      <td colSpan={2} className="px-4 py-3 text-center text-slate-600 font-normal">
                        Xuất sắc: {deptExcellentStaff.length} ({deptExcellentPct}%)
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* SCOPE 3: BÁO CÁO KPI TOÀN CƠ QUAN CHỦ QUẢN (LÃNH ĐẠO & ADMIN) */}
      {/* ========================================================================= */}
      {activeScope === 'agency' && isAdminOrLeader && (
        <div className="space-y-6">

          {/* Agency Macro Header */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <span className="inline-block bg-red-50 text-red-800 border border-red-200 text-xs font-medium px-3 py-0.5 rounded-full uppercase tracking-wider mb-2">
                BÁO CÁO TOÀN CƠ QUAN CHỦ QUẢN (MẪU 02 - HƯỚNG DẪN 06-HD/BTCTU)
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                {parentAgencyName}
              </h3>
              <p className="text-slate-500 text-xs sm:text-sm mt-1 font-normal">
                Đơn vị đầu mối: <span className="text-slate-800 font-medium">{unitName}</span> • Địa phương: {configs?.LOCATION_NAME || 'TP. Hồ Chí Minh'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href={api.getExportMau02Url(selectedPeriod)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-xs transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                <span>Xuất File Excel Mẫu 02 Toàn Cơ Quan</span>
              </a>
            </div>
          </div>

          {/* 4 Agency Macro KPI Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Total Units */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-slate-500 uppercase">Tổng Đơn Vị / Phòng Ban</span>
                <Building2 className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="mt-2 flex items-baseline space-x-1.5">
                <span className="text-2xl sm:text-3xl font-bold text-slate-900">{departments.length}</span>
                <span className="text-xs font-normal text-slate-400">đơn vị</span>
              </div>
              <p className="mt-2 text-xs text-slate-500 font-normal">
                Toàn bộ các phòng ban chuyên môn trực thuộc cơ quan
              </p>
            </div>

            {/* Total Staff across Agency */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-slate-500 uppercase">Tổng Số Cán Bộ Toàn Cơ Quan</span>
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div className="mt-2 flex items-baseline space-x-1.5">
                <span className="text-2xl sm:text-3xl font-bold text-slate-900">{agencyStaffCount}</span>
                <span className="text-xs font-normal text-slate-400">cán bộ</span>
              </div>
              <p className="mt-2 text-xs text-slate-500 font-normal">
                Cán bộ quản lý và nhân viên đã tham gia đánh giá kỳ này
              </p>
            </div>

            {/* Agency Average KPI Score */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-slate-500 uppercase">Điểm KPI Bình Quân Toàn Cơ Quan</span>
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline space-x-1.5">
                <span className="text-2xl sm:text-3xl font-bold text-slate-900">{agencyAvgKpi}</span>
                <span className="text-xs font-normal text-slate-400">/ 100 điểm</span>
              </div>
              <p className="mt-2 text-xs text-slate-500 font-normal">
                Điểm KPI trung bình của toàn thể cán bộ trong toàn cơ quan
              </p>
            </div>

            {/* Agency Excellent Quota Check */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-slate-500 uppercase">Tỷ Lệ Xuất Sắc Toàn Cơ Quan</span>
                <Award className={`w-5 h-5 ${isAgencyExceedingQuota ? 'text-red-600' : 'text-emerald-600'}`} />
              </div>
              <div className="mt-2 flex items-baseline space-x-2">
                <span className={`text-2xl sm:text-3xl font-bold ${isAgencyExceedingQuota ? 'text-red-700' : 'text-emerald-700'}`}>
                  {agencyExcellentPct}%
                </span>
                <span className="text-xs text-slate-400 font-normal">
                  ({agencyExcellentStaff.length}/{agencyStaffCount} người)
                </span>
              </div>
              <div className="mt-2">
                {isAgencyExceedingQuota ? (
                  <span className="inline-flex items-center text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Vượt trần khống chế &gt; {maxExcellentPct}% toàn cơ quan
                  </span>
                ) : (
                  <span className="inline-flex items-center text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                    <Check className="w-3 h-3 mr-1" />
                    Đạt chỉ tiêu khống chế ≤ {maxExcellentPct}% toàn cơ quan
                  </span>
                )}
              </div>
            </div>

          </div>

          {/* Department Rankings Table */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
              <div>
                <h4 className="text-base sm:text-lg font-semibold text-slate-900">
                  Bảng Xếp Hạng Kết Quả Đánh Giá KPI Giữa Các Đơn Vị / Phòng Ban
                </h4>
                <p className="text-xs text-slate-500 mt-0.5 font-normal">
                  Thứ tự xếp hạng căn cứ điểm KPI trung bình toàn đơn vị từ cao xuống thấp
                </p>
              </div>

              <div className="text-xs text-slate-500 font-normal">
                Tổng số đơn vị: <span className="font-semibold text-slate-800">{deptRankings.length}</span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-xs">
              <table className="w-full text-left text-xs sm:text-sm text-slate-700">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-xs">
                  <tr>
                    <th className="px-3 py-3 text-center w-14 font-semibold">Hạng</th>
                    <th className="px-4 py-3 min-w-[220px] font-semibold">Tên Đơn Vị / Phòng Ban</th>
                    <th className="px-3 py-3 text-center w-24 font-semibold">Số Cán Bộ</th>
                    <th className="px-3 py-3 text-center w-28 font-semibold">Điểm TB Phần I</th>
                    <th className="px-3 py-3 text-center w-28 font-semibold">Điểm TB Phần II</th>
                    <th className="px-3 py-3 text-center w-32 font-semibold">Điểm KPI Trung Bình</th>
                    <th className="px-3 py-3 text-center w-36 font-semibold">Tỷ Lệ Xuất Sắc</th>
                    <th className="px-3 py-3 text-center w-32 font-semibold">Tỷ Lệ Xong Việc</th>
                    <th className="px-3 py-3 text-center w-24 font-semibold">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {deptRankings.map((dr, idx) => (
                    <tr key={dr.dept.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3 py-3 text-center">
                        {idx === 0 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs">
                            1
                          </span>
                        ) : idx === 1 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-800 font-semibold text-xs">
                            2
                          </span>
                        ) : idx === 2 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold text-xs">
                            3
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">{idx + 1}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {dr.dept.name}
                        {dr.dept.code && (
                          <span className="ml-2 text-[11px] text-slate-400 font-normal">
                            ({dr.dept.code})
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center font-normal text-slate-700">
                        {dr.staffCount} người
                      </td>
                      <td className="px-3 py-3 text-center font-normal text-slate-700">
                        {dr.avgP1}
                      </td>
                      <td className="px-3 py-3 text-center font-normal text-slate-700">
                        {dr.avgP2}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-red-700 text-sm">
                        {dr.avgTotal} đ
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-medium ${
                          dr.excPct > maxExcellentPct 
                            ? 'bg-red-100 text-red-800 border border-red-300' 
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}>
                          {dr.excCount}/{dr.staffCount} ({dr.excPct}%)
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center font-normal text-purple-800">
                        {dr.taskRate}%
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDeptId(dr.dept.id);
                            setActiveScope('unit');
                          }}
                          className="inline-flex items-center space-x-1 text-xs font-normal text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md border border-blue-200 transition-colors cursor-pointer"
                        >
                          <span>Xem phòng</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Full Agency Staff Roster (Mẫu 02 Tổng Hợp) with Filters */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
              <div>
                <h4 className="text-base sm:text-lg font-semibold text-slate-900">
                  Danh Sách Toàn Thể Cán Bộ Cơ Quan (Mẫu 02 Tổng Hợp)
                </h4>
                <p className="text-xs text-slate-500 mt-0.5 font-normal">
                  Hiển thị {filteredAgencyStaff.length} / {agencyStaffCount} cán bộ theo bộ lọc hiện hành
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                {/* Search Box */}
                <div className="relative flex-1 sm:flex-initial">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm tên, chức vụ..."
                    value={searchStaffText}
                    onChange={(e) => setSearchStaffText(e.target.value)}
                    className="text-xs pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 w-full sm:w-48 font-normal"
                  />
                </div>

                {/* Department Filter */}
                <select
                  value={agencyDeptFilter}
                  onChange={(e) => setAgencyDeptFilter(e.target.value)}
                  className="text-xs font-normal p-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
                >
                  <option value="all">Tất cả đơn vị ({departments.length})</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>

                {/* Rank Filter */}
                <select
                  value={agencyRankFilter}
                  onChange={(e) => setAgencyRankFilter(e.target.value)}
                  className="text-xs font-normal p-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
                >
                  <option value="all">Tất cả xếp loại</option>
                  <option value="excellent">Xuất sắc</option>
                  <option value="good">Hoàn thành tốt</option>
                  <option value="complete">Hoàn thành</option>
                  <option value="fail">Không hoàn thành</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-xs">
              <table className="w-full text-left text-xs sm:text-sm text-slate-700">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-xs">
                  <tr>
                    <th className="px-3 py-3 text-center w-12 font-semibold">STT</th>
                    <th className="px-4 py-3 min-w-[180px] font-semibold">Họ Và Tên</th>
                    <th className="px-4 py-3 min-w-[180px] font-semibold">Đơn Vị / Phòng Ban</th>
                    <th className="px-3 py-3 min-w-[140px] font-semibold">Chức Vụ</th>
                    <th className="px-3 py-3 text-center w-24 font-semibold">Phần I (30)</th>
                    <th className="px-3 py-3 text-center w-24 font-semibold">Phần II (70)</th>
                    <th className="px-3 py-3 text-center w-20 font-semibold">Thưởng</th>
                    <th className="px-3 py-3 text-center w-24 font-semibold">Tổng Điểm</th>
                    <th className="px-4 py-3 text-center min-w-[160px] font-semibold">Xếp Loại</th>
                    <th className="px-3 py-3 text-center w-24 font-semibold">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredAgencyStaff.map((staff, idx) => {
                    const rank = staff.superior_rank || staff.rank_proposed || 'Chưa xếp loại';
                    return (
                      <tr key={staff.user_id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3 py-3 text-center font-normal text-slate-500">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{staff.full_name}</div>
                          <div className="text-[11px] text-slate-400 font-normal">
                            {staff.target_role === 'cbql' || staff.role === 'cbql' ? 'Lãnh đạo / Quản lý' : 'Nhân viên'}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-normal text-slate-800">
                          {staff.dept_name}
                        </td>
                        <td className="px-3 py-3 text-slate-600 font-normal">
                          {staff.gov_title || staff.party_title || '—'}
                        </td>
                        <td className="px-3 py-3 text-center font-normal text-slate-700">
                          {staff.part1_score || 0}
                        </td>
                        <td className="px-3 py-3 text-center font-normal text-slate-700">
                          {staff.part2_score || 0}
                        </td>
                        <td className="px-3 py-3 text-center font-normal text-emerald-700">
                          {staff.bonus_score ? `+${staff.bonus_score}` : '0'}
                        </td>
                        <td className="px-3 py-3 text-center font-semibold text-red-700 text-sm">
                          {staff.total_score || 0}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                            rank === 'Hoàn thành xuất sắc nhiệm vụ' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                            rank === 'Hoàn thành tốt nhiệm vụ' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                            rank === 'Hoàn thành nhiệm vụ' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                            'bg-red-100 text-red-800 border border-red-300'
                          }`}>
                            {rank}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleOpenStaffModal(staff)}
                            className="inline-flex items-center space-x-1 text-xs font-normal text-red-700 hover:text-red-900 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-md border border-red-200 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Xem</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* QUICK INSPECTION MODAL FOR STAFF MEMBER */}
      {/* ========================================================================= */}
      {selectedStaffModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-[95%] sm:max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-start bg-gradient-to-r from-red-800 to-rose-900 text-white rounded-t-2xl">
              <div>
                <span className="text-xs bg-white/20 text-white px-2.5 py-0.5 rounded-full uppercase font-medium">
                  BẢNG ĐIỂM CHI TIẾT CÁN BỘ
                </span>
                <h3 className="text-lg sm:text-xl font-bold mt-1">
                  {selectedStaffModal.full_name}
                </h3>
                <p className="text-xs text-red-100 mt-0.5 font-normal">
                  {selectedStaffModal.gov_title || selectedStaffModal.party_title ? `${selectedStaffModal.gov_title || selectedStaffModal.party_title} • ` : ''}
                  {selectedStaffModal.dept_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStaffModal(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-4">
              
              {/* Score Highlights */}
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[11px] font-normal text-slate-500 uppercase">Phần I (30)</div>
                  <div className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
                    {selectedStaffModal.evalDetail?.evaluation?.part1_score ?? selectedStaffModal.part1_score ?? 0}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[11px] font-normal text-slate-500 uppercase">Phần II (70)</div>
                  <div className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
                    {selectedStaffModal.evalDetail?.evaluation?.part2_score ?? selectedStaffModal.part2_score ?? 0}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[11px] font-normal text-slate-500 uppercase">Điểm Thưởng</div>
                  <div className="text-lg sm:text-xl font-bold text-emerald-700 mt-1">
                    +{selectedStaffModal.evalDetail?.evaluation?.bonus_score ?? selectedStaffModal.bonus_score ?? 0}
                  </div>
                </div>
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <div className="text-[11px] font-medium text-red-700 uppercase">Tổng Điểm</div>
                  <div className="text-lg sm:text-xl font-bold text-red-700 mt-1">
                    {selectedStaffModal.evalDetail?.evaluation?.total_score ?? selectedStaffModal.total_score ?? 0}
                  </div>
                </div>
              </div>

              {/* Rank Banner */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <span className="text-xs font-normal text-slate-600">Xếp loại kết quả:</span>
                <span className="text-xs font-medium text-red-700 bg-white border border-red-200 px-3 py-1 rounded-lg">
                  {selectedStaffModal.superior_rank || selectedStaffModal.rank_proposed || 'Chưa xếp loại'}
                </span>
              </div>

              {/* 6 Axes Breakdown in Modal */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                  Kết Quả Thực Hiện 6 Trục Trọng Tâm
                </h4>
                {selectedStaffModal.evalDetail?.axesSummary ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-center w-16 font-semibold">Trục</th>
                          <th className="px-3 py-2 font-semibold">Tên Trục Trọng Tâm</th>
                          <th className="px-3 py-2 text-center w-24 font-semibold">Tối đa</th>
                          <th className="px-3 py-2 text-center w-24 font-semibold">Đạt được</th>
                          <th className="px-3 py-2 text-center w-20 font-semibold">Số việc</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {selectedStaffModal.evalDetail.axesSummary.map((ax, idx) => (
                          <tr key={ax.axis_code} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-center font-medium text-red-700">
                              Trục {idx + 1}
                            </td>
                            <td className="px-3 py-2 font-normal text-slate-800">
                              {ax.axis_name.replace(`TRỤC ${idx + 1} - `, '')}
                            </td>
                            <td className="px-3 py-2 text-center font-normal text-slate-600">
                              {ax.max_score} đ
                            </td>
                            <td className="px-3 py-2 text-center font-semibold text-slate-900">
                              {ax.axis_score} đ
                            </td>
                            <td className="px-3 py-2 text-center text-slate-500 font-normal">
                              {ax.tasks_count} việc
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-400 font-normal">
                    Cán bộ chưa có số liệu chi tiết 6 trục trong kỳ này
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-3.5 border-t border-slate-100 flex justify-end bg-slate-50 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setSelectedStaffModal(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal Chốt / Mở khóa KPI theo Quý */}
      <FinalizePeriodModal
        isOpen={isFinalizeModalOpen}
        onClose={() => setIsFinalizeModalOpen(false)}
        periods={periods}
        currentPeriodId={selectedPeriod}
        onSelectPeriod={onPeriodChange}
        onReloadPeriods={async () => {
          if (onReloadPeriods) await onReloadPeriods();
          loadData();
        }}
        currentUser={currentUser}
      />

    </div>
  );
}

