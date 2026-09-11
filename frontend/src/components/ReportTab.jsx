import React, { useEffect, useState } from 'react';
import { 
  Download, 
  FileText, 
  Printer, 
  Building,
  User,
  CheckCircle2, 
  AlertCircle,
  Clock,
  Paperclip,
  Layers,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Filter,
  Award
} from 'lucide-react';
import { api } from '../api';
import { formatDate, formatAdministrativeDate } from '../constants';

export default function ReportTab({ 
  selectedPeriod, 
  onPeriodChange, 
  periods = [], 
  currentUser, 
  users = [], 
  departments = [], 
  axes = [] 
}) {
  const activePeriodId = selectedPeriod || (periods?.length > 0 ? periods[0].id : '');
  const currentPeriodObj = periods?.find(p => p.id === activePeriodId);
  const periodDisplayName = currentPeriodObj?.name || 'Quý III, Năm 2026';
  const [selectedUser, setSelectedUser] = useState(currentUser?.id || '');
  const [evalData, setEvalData] = useState(null);
  const [userTasks, setUserTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState({});

  // View state: 'self_eval' (Mẫu 01-A/B), 'execution_report' (Báo cáo thực hiện công việc), or 'mau_02' (Báo cáo tổng hợp toàn cơ quan)
  const [activeReportView, setActiveReportView] = useState('self_eval');
  const [showSectionBDetails, setShowSectionBDetails] = useState(false);

  // Mẫu 02 state
  const [mau02List, setMau02List] = useState([]);
  const [mau02Loading, setMau02Loading] = useState(false);
  const [mau02Saving, setMau02Saving] = useState(false);
  const [editingRow, setEditingRow] = useState(null); // row user_id or evaluation_id being edited
  const [rowEditData, setRowEditData] = useState({});
  const [mau02SuccessMsg, setMau02SuccessMsg] = useState('');

  // Filter state for execution report
  const [originFilter, setOriginFilter] = useState('all'); // 'all', 'assigned', 'registered'
  const [axisFilter, setAxisFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (currentUser) {
      const nonAdminUsers = users.filter(u => u.role !== 'admin');
      const isAccessible = nonAdminUsers.some(u => u.id === selectedUser);
      if (!isAccessible) {
        if (currentUser.role === 'admin' && nonAdminUsers.length > 0) {
          setSelectedUser(nonAdminUsers[0].id);
        } else {
          setSelectedUser(currentUser.id);
        }
      }
    }
  }, [currentUser, users]);

  useEffect(() => {
    if (selectedUser && activePeriodId) {
      loadData();
    }
  }, [activePeriodId, selectedUser, currentUser]);

  useEffect(() => {
    if (activeReportView === 'mau_02' && activePeriodId) {
      loadMau02();
    }
  }, [activeReportView, activePeriodId, currentUser]);

  async function loadData() {
    try {
      setLoading(true);
      const [evalRes, tasksRes, cfgRes] = await Promise.all([
        api.getEvaluation(activePeriodId, selectedUser),
        api.getAssignedTasks({ period_id: activePeriodId, user_id: selectedUser }),
        api.getAdminConfigs().catch(() => ({}))
      ]);
      setEvalData(evalRes);
      setUserTasks(tasksRes);
      if (cfgRes) setConfigs(cfgRes);
    } catch (err) {
      console.error('Error loading report preview:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMau02() {
    try {
      setMau02Loading(true);
      const data = await api.getMau02Report(activePeriodId);
      setMau02List(data || []);
    } catch (err) {
      console.error('Error loading Mau 02:', err);
    } finally {
      setMau02Loading(false);
    }
  }

  const handleStartEditMau02 = (row) => {
    setEditingRow(row.user_id);
    setRowEditData({
      evaluation_id: row.evaluation_id,
      user_id: row.user_id,
      period_id: activePeriodId,
      superior_rank: row.superior_rank || row.rank_proposed || 'Hoàn thành tốt nhiệm vụ',
      summary_reason: row.summary_reason || '',
      cadre_proposal_note: row.cadre_proposal_note || ''
    });
  };

  const handleSaveMau02Row = async (userId) => {
    try {
      setMau02Saving(true);
      setMau02SuccessMsg('');
      await api.saveMau02Report(rowEditData);
      setEditingRow(null);
      setMau02SuccessMsg('Đã lưu kết luận đánh giá và đề xuất cán bộ thành công');
      await loadMau02();
      setTimeout(() => setMau02SuccessMsg(''), 3000);
    } catch (err) {
      alert('Lỗi lưu Mẫu 02: ' + err.message);
    } finally {
      setMau02Saving(false);
    }
  };

  const handlePeriodChange = (newPeriodId) => {
    if (onPeriodChange) {
      onPeriodChange(newPeriodId);
    }
  };

  const targetUser = users.find(u => u.id === selectedUser) || evalData?.user || currentUser || {};
  const isCbnv = (targetUser?.target_role === 'cbnv') || (targetUser?.role === 'cbnv' && targetUser?.target_role !== 'cbql');
  const isUnitLeader = Boolean(
    (configs.LEADER_SIGNER_NAME && targetUser.full_name?.trim().toLowerCase() === configs.LEADER_SIGNER_NAME.trim().toLowerCase()) ||
    (targetUser.management_role === 'lanh_dao' && (!targetUser.manager_id || targetUser.role === 'admin')) ||
    (/\b(trưởng ban|giám đốc|hiệu trưởng|bí thư)\b/i.test(targetUser.gov_title || '') && !/\bphó\b/i.test(targetUser.gov_title || ''))
  );
  const canEditMau02 = currentUser?.role === 'admin' || currentUser?.role === 'cbql' || (currentUser?.data_scope && currentUser?.data_scope !== 'personal');
  const evaluation = evalData?.evaluation || {};
  const criteria = evalData?.criteria || [];
  const exportUrl = api.getExportUrl(activePeriodId, selectedUser);
  const exportMau02Url = api.getExportMau02Url(activePeriodId);

  // Match targetUser's department from departments list or evalData.user
  const targetUserDept = departments.find(d => d.id === targetUser?.department_id)
    || departments.find(d => d.name === targetUser?.dept_name)
    || departments.find(d => !d.parent_id)
    || departments[0] || {};

  const parentAgency = targetUserDept.parent_agency
    || evalData?.user?.parent_agency
    || configs.PARENT_AGENCY_NAME
    || 'THÀNH ỦY THÀNH PHỐ HỒ CHÍ MINH';

  const locationName = targetUserDept.location_name
    || evalData?.user?.location_name
    || configs.LOCATION_NAME
    || 'TP. Hồ Chí Minh';

  const unitName = targetUserDept.name
    || targetUser.dept_name
    || configs.UNIT_NAME
    || 'BAN TỔ CHỨC THÀNH ỦY TP. HỒ CHÍ MINH';

  // For Mẫu 02 (toàn cơ quan)
  const rootDept = departments.find(d => !d.parent_id) || departments[0] || {};
  const mau02ParentAgency = rootDept.parent_agency || parentAgency;
  const mau02LocationName = rootDept.location_name || locationName;
  const mau02UnitName = rootDept.name || configs.UNIT_NAME || 'BAN TỔ CHỨC THÀNH ỦY TP. HỒ CHÍ MINH';

  const part1Score = criteria.reduce((sum, c) => sum + (c.is_satisfied === 1 ? c.max_score : 0), 0);
  const part2Score = evaluation.part2_score !== undefined && evaluation.part2_score !== null ? evaluation.part2_score : 0;
  const bonusScore = evaluation.bonus_score || 0;
  const grandTotal = Number((part1Score + part2Score + bonusScore).toFixed(2));
  const rank = evaluation.superior_rank || evaluation.rank_proposed || 'Chưa xếp loại';

  // Metrics for execution report
  const assignedTasksCount = userTasks.filter(t => t.origin === 'assigned').length;
  const registeredTasksCount = userTasks.filter(t => t.origin === 'registered').length;
  const approvedTasks = userTasks.filter(t => t.status === 'approved');
  const totalConvertedScore = userTasks.reduce((s, t) => s + (t.converted_score || 0), 0);
  const aheadOrOnTimeTasks = userTasks.filter(t => t.progress_pct === 1.0).length;

  // Filtered tasks for execution report
  const filteredExecutionTasks = userTasks.filter(t => {
    if (originFilter !== 'all' && t.origin !== originFilter) return false;
    if (axisFilter !== 'all' && t.axis_code !== axisFilter) return false;
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    return true;
  });

  // Phân nhóm công việc theo từng trụ cột (ghi rõ nội dung trụ cột)
  const defaultAxesList = [
    { code: 'TRUC_1', name: 'Trục 1 - Thực hiện mục tiêu phát triển kinh tế - xã hội và nhiệm vụ chính trị được giao' },
    { code: 'TRUC_2', name: 'Trục 2 - Hoàn thiện thể chế, đẩy mạnh phân cấp, phân quyền gắn với kiểm tra, giám sát' },
    { code: 'TRUC_3', name: 'Trục 3 - Thúc đẩy phát triển khoa học, công nghệ, đổi mới sáng tạo và chuyển đổi số' },
    { code: 'TRUC_4', name: 'Trục 4 - Xây dựng Đảng và hệ thống chính trị trong sạch, vững mạnh; giữ gìn đoàn kết, thống nhất nội bộ; phòng, chống tham nhũng, lãng phí, tiêu cực' },
    { code: 'TRUC_5', name: 'Trục 5 - Phát triển văn hóa, con người, bảo đảm an sinh xã hội, nâng cao đời sống nhân dân' },
    { code: 'TRUC_6', name: 'Trục 6 - Củng cố quốc phòng, an ninh, giữ vững ổn định chính trị - xã hội, nâng cao hiệu quả đối ngoại và hội nhập quốc tế' }
  ];

  const effectiveAxes = (axes && axes.length > 0) ? axes : defaultAxesList;

  const groupedTasksByAxis = effectiveAxes.map(ax => {
    const tasks = filteredExecutionTasks.filter(t => (t.axis_code || 'TRUC_1') === ax.code);
    return {
      code: ax.code,
      name: ax.name,
      tasks,
      totalStdScore: tasks.reduce((s, t) => s + (t.standard_score || 0), 0),
      totalConvScore: Number(tasks.reduce((s, t) => s + (t.converted_score || 0), 0).toFixed(2))
    };
  }).filter(group => group.tasks.length > 0);

  const mappedCodes = new Set(effectiveAxes.map(ax => ax.code));
  const unmappedTasks = filteredExecutionTasks.filter(t => t.axis_code && !mappedCodes.has(t.axis_code));
  if (unmappedTasks.length > 0) {
    groupedTasksByAxis.push({
      code: 'OTHER',
      name: 'Nhiệm vụ khác / Chưa phân nhóm trụ cột',
      tasks: unmappedTasks,
      totalStdScore: unmappedTasks.reduce((s, t) => s + (t.standard_score || 0), 0),
      totalConvScore: Number(unmappedTasks.reduce((s, t) => s + (t.converted_score || 0), 0).toFixed(2))
    });
  }

  // Calculate Mẫu 02 stats
  const totalStaff = mau02List.length;
  const countExc = mau02List.filter(r => (r.superior_rank || r.rank_proposed || '').includes('xuất sắc')).length;
  const countGood = mau02List.filter(r => (r.superior_rank || r.rank_proposed || '').includes('tốt')).length;
  const countFail = mau02List.filter(r => (r.superior_rank || r.rank_proposed || '').toLowerCase().includes('không')).length;
  const countComplete = totalStaff - countExc - countGood - countFail;
  const excPercent = totalStaff > 0 ? ((countExc / totalStaff) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-6">
      
      {/* Action and Selector Bar (Hidden during print) */}
      <div className="no-print bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <FileSpreadsheet className="w-5 h-5 text-red-700" />
              <span>Hệ thống Báo cáo Đánh giá & Xếp loại KPI (Hướng dẫn 06-HD/BTCTU)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Đầy đủ biểu mẫu: <b>Mẫu 01-A (CBQL)</b>, <b>Mẫu 01-B (CBNV)</b>, <b>Báo cáo công việc (Bảng 1 - PL5)</b> và <b>Mẫu 02 (Tổng hợp toàn cơ quan)</b>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Period selector */}
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-600">Kỳ đánh giá:</span>
              <select
                value={activePeriodId}
                onChange={(e) => handlePeriodChange(e.target.value)}
                className="text-xs font-semibold p-2 bg-slate-50 border border-slate-300 rounded-md focus:ring-2 focus:ring-red-500 font-medium text-slate-800"
              >
                {periods.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.is_locked ? '(Đã chốt)' : ''} {p.is_active === 0 ? '(Tạm ngừng)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* User selector (for personal reports) */}
            {activeReportView !== 'mau_02' && (
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-slate-600">Cán bộ:</span>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="text-xs font-semibold p-2 bg-slate-50 border border-slate-300 rounded-md focus:ring-2 focus:ring-red-500"
                >
                  {users.filter(u => u.role !== 'admin').map(u => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.role === 'cbql' ? 'CBQL' : 'CBNV'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Print / Export PDF Button */}
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm transition-colors cursor-pointer"
              title="In trực tiếp hoặc Lưu dưới dạng PDF chuẩn Nghị định 30/2020/NĐ-CP (Font Times New Roman 14pt)"
            >
              <Printer className="w-4 h-4 text-slate-200" />
              <span>In báo cáo / Xuất PDF</span>
            </button>

            {/* Download Buttons */}
            {activeReportView === 'mau_02' ? (
              <a
                href={exportMau02Url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Tải Excel Mẫu 02 (Toàn cơ quan)</span>
              </a>
            ) : (
              <a
                href={exportUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Tải Excel ({isCbnv ? 'Mẫu 01-B' : 'Mẫu 01-A'} & Công việc)</span>
              </a>
            )}
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveReportView('self_eval')}
            className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
              activeReportView === 'self_eval'
                ? 'border-red-700 text-red-700 bg-red-50/40 rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>
              {isCbnv ? 'Mẫu 01-B: Bản tự đánh giá (CBNV)' : 'Mẫu 01-A: Bản tự đánh giá (CBQL)'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveReportView('execution_report')}
            className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
              activeReportView === 'execution_report'
                ? 'border-red-700 text-red-700 bg-red-50/40 rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Báo cáo thực hiện công việc ({userTasks.length} việc: {assignedTasksCount} giao, {registeredTasksCount} tự đăng ký)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveReportView('mau_02')}
            className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
              activeReportView === 'mau_02'
                ? 'border-red-700 text-red-700 bg-red-50/40 rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Mẫu 02: Tổng hợp xếp loại & Đề xuất cán bộ toàn cơ quan</span>
          </button>
        </div>
      </div>

      {/* DOCUMENT PREVIEW CONTAINER (MẪU 01-A hoặc MẪU 01-B) */}
      {activeReportView === 'self_eval' && (
        <div className="print-document bg-white rounded-xl border border-slate-300 shadow-md p-3.5 sm:p-6 md:p-10 font-times text-[14pt] leading-relaxed w-full space-y-6 text-black">
          
          {/* Top Header: Mẫu 01-A vs Mẫu 01-B */}
          <div className="text-right text-[14pt] font-bold text-black">
            {isCbnv ? 'Mẫu 01-B' : 'Mẫu 01-A'}
          </div>

        {/* Agency & National Title Header (Rows 2-3) */}
        <div className="grid grid-cols-2 text-center text-[14pt]">
          <div>
            <p className="uppercase text-black leading-tight">
              {parentAgency}
            </p>
            <p className="font-bold text-[14pt] uppercase text-black leading-tight mt-0.5">
              {unitName.toUpperCase()}
            </p>
            <div className="w-24 mx-auto border-b border-black mt-1"></div>
          </div>
          <div>
            <p className="font-bold text-[14pt] uppercase text-black tracking-wider">
              ĐẢNG CỘNG SẢN VIỆT NAM
            </p>
            <p className="text-[14pt] italic text-black mt-1">
              {formatAdministrativeDate(new Date(), locationName)}
            </p>
          </div>
        </div>

        {/* Document Title (Rows 4-5) */}
        <div className="text-center space-y-1 pt-2">
          <h1 className="text-[16pt] font-bold uppercase text-black tracking-tight">
            BẢN TỰ ĐÁNH GIÁ, XẾP LOẠI CỦA CÁ NHÂN
          </h1>
          <p className="text-[14pt] font-semibold text-black italic">
            {isCbnv 
              ? '(Dành cho công chức, viên chức không giữ chức vụ lãnh đạo, quản lý)' 
              : '(Dành cho cán bộ lãnh đạo, quản lý)'}
          </p>
          <p className="text-[14pt] italic text-black">
            {periodDisplayName}
          </p>
        </div>

        {/* Cadre Details (Rows 6-10) */}
        <div className="text-[14pt] text-black space-y-2 pt-2 border-t border-b border-black/20 py-3 leading-relaxed">
          <p>
            <b>Họ và tên:</b> {targetUser.full_name} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <b>Ngày sinh:</b> {formatDate(targetUser.birth_date, '10/04/1973')}
          </p>
          <p>
            <b>Chức vụ Đảng:</b> {targetUser.party_title || 'Đảng viên'}
          </p>
          <p>
            <b>Chức vụ chính quyền:</b> {targetUser.gov_title || (isCbnv ? 'Chuyên viên' : 'Lãnh đạo')}
          </p>
          <p>
            <b>Chức vụ đoàn thể:</b> {targetUser.union_title || 'Không có'}
          </p>
          <p>
            <b>Đơn vị công tác:</b> {unitName}
          </p>
        </div>

        {/* Section I Intro (Rows 11-12) */}
        <div className="text-[14pt] text-black space-y-1">
          <p className="font-bold">I. Tự đánh giá kết quả thực hiện nhiệm vụ</p>
          <p className="italic text-slate-800">
            Trên cơ sở nhiệm vụ được giao, cá nhân tự đánh giá về kết quả thực hiện nhiệm vụ theo quý như sau:
          </p>
        </div>

        {/* A. NHÓM TIÊU CHÍ CHUNG (30 ĐIỂM) (Rows 13-35) */}
        <div className="space-y-2">
          <p className="text-[14pt] font-bold text-black uppercase">
            A. NHÓM TIÊU CHÍ CHUNG (30 ĐIỂM)
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[14pt] border-collapse border border-black font-times text-black">
              <thead>
                <tr className="bg-slate-100 font-bold text-black text-center text-[14pt]">
                  <th className="border border-black p-2.5 w-14">TT</th>
                  <th className="border border-black p-2.5 min-w-[340px]">Tiêu chí / Nội dung</th>
                  <th className="border border-black p-2.5 w-24">Đảm bảo<br />(Đánh dấu x)</th>
                  <th className="border border-black p-2.5 w-28">Không<br />đảm bảo<br />(Đánh dấu x)</th>
                  <th className="border border-black p-2.5 w-24">Điểm tối đa</th>
                  <th className="border border-black p-2.5 w-36 leading-snug">
                    Điểm đạt<br />(Chấm tối đa nếu đảm bảo; 0 điểm nếu không đảm bảo)
                  </th>
                  <th className="border border-black p-2.5 w-24">Ghi chú</th>
                </tr>
              </thead>
            <tbody>
              {/* Group 1 Header */}
              <tr className="bg-slate-50 font-bold text-black">
                <td className="border border-black p-2 text-center">1</td>
                <td className="border border-black p-2">
                  Về phẩm chất chính trị, đạo đức, lối sống, thực hiện trách nhiệm nêu gương
                </td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2 text-right">18</td>
                <td className="border border-black p-2 text-right">
                  {criteria.filter(c => c.group_no === 1).reduce((s, c) => s + (c.is_satisfied === 1 ? c.max_score : 0), 0)}
                </td>
                <td className="border border-black p-2"></td>
              </tr>
              {criteria.filter(c => c.group_no === 1).map((c) => {
                const isSat = c.is_satisfied === 1;
                return (
                  <tr key={c.id}>
                    <td className="border border-black p-2 text-center font-bold text-slate-700">{c.code}</td>
                    <td className="border border-black p-2 leading-relaxed text-[14pt] text-black">{c.title}</td>
                    <td className="border border-black p-2 text-center font-bold text-emerald-800">{isSat ? 'x' : ''}</td>
                    <td className="border border-black p-2 text-center font-bold text-rose-800">{!isSat ? 'x' : ''}</td>
                    <td className="border border-black p-2 text-right font-medium">{c.max_score}</td>
                    <td className="border border-black p-2 text-right font-bold text-black">{isSat ? c.max_score : 0}</td>
                    <td className="border border-black p-2 text-[14pt] text-slate-600">{c.note || ''}</td>
                  </tr>
                );
              })}

              {/* Group 2 Header (Differentiated for CBQL vs CBNV) */}
              <tr className="bg-slate-50 font-bold text-black">
                <td className="border border-black p-2 text-center">2</td>
                <td className="border border-black p-2">
                  {isCbnv 
                    ? 'Tinh thần trách nhiệm, năng động, sáng tạo, đổi mới trong thực hiện nhiệm vụ'
                    : 'Tư duy đổi mới, chiến lược, khát vọng cống hiến, dám nghĩ dám làm'}
                </td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2 text-right">4</td>
                <td className="border border-black p-2 text-right">
                  {criteria.filter(c => c.group_no === 2 && (c.target_role === 'all' || c.target_role === (isCbnv ? 'cbnv' : 'cbql') || !c.target_role)).reduce((s, c) => s + (c.is_satisfied === 1 ? c.max_score : 0), 0)}
                </td>
                <td className="border border-black p-2"></td>
              </tr>
              {criteria.filter(c => c.group_no === 2 && (c.target_role === 'all' || c.target_role === (isCbnv ? 'cbnv' : 'cbql') || !c.target_role)).map((c) => {
                const isSat = c.is_satisfied === 1;
                return (
                  <tr key={c.id}>
                    <td className="border border-black p-2 text-center font-bold text-slate-700">{c.code}</td>
                    <td className="border border-black p-2 leading-relaxed text-[14pt] text-black">{c.title}</td>
                    <td className="border border-black p-2 text-center font-bold text-emerald-800">{isSat ? 'x' : ''}</td>
                    <td className="border border-black p-2 text-center font-bold text-rose-800">{!isSat ? 'x' : ''}</td>
                    <td className="border border-black p-2 text-right font-medium">{c.max_score}</td>
                    <td className="border border-black p-2 text-right font-bold text-black">{isSat ? c.max_score : 0}</td>
                    <td className="border border-black p-2 text-[14pt] text-slate-600">{c.note || ''}</td>
                  </tr>
                );
              })}

              {/* Group 3 Header */}
              <tr className="bg-slate-50 font-bold text-black">
                <td className="border border-black p-2 text-center">3</td>
                <td className="border border-black p-2">
                  Về tự phê bình và phê bình, tự soi, tự sửa, khắc phục hạn chế, khuyết điểm
                </td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2"></td>
                <td className="border border-black p-2 text-right">8</td>
                <td className="border border-black p-2 text-right">
                  {criteria.filter(c => c.group_no === 3).reduce((s, c) => s + (c.is_satisfied === 1 ? c.max_score : 0), 0)}
                </td>
                <td className="border border-black p-2"></td>
              </tr>
              {criteria.filter(c => c.group_no === 3).map((c) => {
                const isSat = c.is_satisfied === 1;
                return (
                  <tr key={c.id}>
                    <td className="border border-black p-2 text-center font-bold text-slate-700">{c.code}</td>
                    <td className="border border-black p-2 leading-relaxed text-[14pt] text-black">{c.title}</td>
                    <td className="border border-black p-2 text-center font-bold text-emerald-800">{isSat ? 'x' : ''}</td>
                    <td className="border border-black p-2 text-center font-bold text-rose-800">{!isSat ? 'x' : ''}</td>
                    <td className="border border-black p-2 text-right font-medium">{c.max_score}</td>
                    <td className="border border-black p-2 text-right font-bold text-black">{isSat ? c.max_score : 0}</td>
                    <td className="border border-black p-2 text-[14pt] text-slate-600">{c.note || ''}</td>
                  </tr>
                );
              })}

              {/* Row 35: Tổng (A) */}
              <tr className="bg-slate-100 font-bold text-black">
                <td colSpan="4" className="border border-black p-2.5 text-right">Tổng (A) =</td>
                <td className="border border-black p-2.5 text-right">30</td>
                <td className="border border-black p-2.5 text-right text-red-800 font-bold">{part1Score}</td>
                <td className="border border-black p-2.5"></td>
              </tr>

              {/* Row 36: B. KẾT QUẢ THỰC HIỆN NHIỆM VỤ ĐƯỢC GIAO (70 ĐIỂM) */}
              <tr className="bg-slate-100 font-bold text-black">
                <td className="border border-black p-2.5 text-center">B</td>
                <td colSpan="6" className="border border-black p-2.5 uppercase">
                  KẾT QUẢ THỰC HIỆN NHIỆM VỤ ĐƯỢC GIAO (70 ĐIỂM)
                </td>
              </tr>

              {/* Row 37: Description of 6 axes */}
              <tr>
                <td className="border border-black p-2"></td>
                <td colSpan="3" className="border border-black p-2 text-[14pt] italic text-slate-800 leading-relaxed">
                  Tập trung vào các trục kết quả trọng tâm: (1) Thực hiện mục tiêu phát triển kinh tế - xã hội và nhiệm vụ chính trị được giao; (2) Hoàn thiện thể chế, đẩy mạnh phân cấp, phân quyền gắn với kiểm tra, giám sát; (3) Thúc đẩy phát triển khoa học, công nghệ, đổi mới sáng tạo và chuyển đổi số; (4) Xây dựng Đảng và hệ thống chính trị trong sạch, vững mạnh; giữ gìn đoàn kết, thống nhất nội bộ; phòng, chống tham nhũng, lãng phí, tiêu cực; (5) Phát triển văn hóa, con người, bảo đảm an sinh xã hội, nâng cao đời sống nhân dân; (6) Củng cố quốc phòng, an ninh, giữ vững ổn định chính trị - xã hội, nâng cao hiệu quả đối ngoại và hội nhập quốc tế.
                </td>
                <td className="border border-black p-2 text-right font-bold text-black">
                  Điểm tối đa (70 điểm)
                </td>
                <td className="border border-black p-2 text-right font-bold text-indigo-900">
                  Điểm đạt được:<br />
                  <span className="text-[14pt] font-bold">{part2Score}</span>
                </td>
                <td className="border border-black p-2 text-[14pt] text-slate-500"></td>
              </tr>

              {/* Row 38: TỔNG (B) */}
              <tr className="bg-slate-100 font-bold text-black">
                <td colSpan="4" className="border border-black p-2.5 text-right">
                  TỔNG (B) = Điểm KPI đã tính tại bảng tính điểm
                </td>
                <td className="border border-black p-2.5 text-right">70</td>
                <td className="border border-black p-2.5 text-right text-indigo-900 font-bold">{part2Score}</td>
                <td className="border border-black p-2.5"></td>
              </tr>

              {/* Row 39: Điểm thưởng */}
              <tr className="bg-slate-50 text-black">
                <td colSpan="4" className="border border-black p-2 text-right italic">
                  Điểm thưởng (nhiệm vụ sáng tạo, đổi mới, vượt mức - tối đa 7 điểm)
                </td>
                <td className="border border-black p-2 text-right">7</td>
                <td className="border border-black p-2 text-right text-emerald-800 font-bold">{bonusScore}</td>
                <td className="border border-black p-2"></td>
              </tr>

              {/* Row 40: TỔNG (A + B + Thưởng) */}
              <tr className="bg-amber-100/70 font-bold text-black text-[14pt]">
                <td colSpan="4" className="border border-black p-2.5 text-right text-red-900 uppercase">
                  TỔNG ĐIỂM ĐÁNH GIÁ (A + B + Thưởng) =
                </td>
                <td className="border border-black p-2.5 text-right text-red-900">100</td>
                <td className="border border-black p-2.5 text-right text-red-900 text-[15pt]">{grandTotal}</td>
                <td className="border border-black p-2.5"></td>
              </tr>
            </tbody>
          </table>
        </div>

          {/* Sub-toggle inside Section B: View Tasks contributing to KPI (Screen only, hidden on print) */}
          <div className="pt-1 no-print">
            <button
              type="button"
              onClick={() => setShowSectionBDetails(!showSectionBDetails)}
              className="flex items-center space-x-1.5 text-xs text-indigo-700 hover:text-indigo-900 font-bold font-sans hover:underline cursor-pointer"
            >
              {showSectionBDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              <span>
                {showSectionBDetails 
                  ? 'Thu gọn danh sách công việc cấu thành Điểm Phần B' 
                  : `Xem chi tiết ${approvedTasks.length} công việc cấu thành Điểm Phần B (Giao việc & Tự đăng ký)`}
              </span>
            </button>

            {showSectionBDetails && (
              <div className="mt-2.5 p-3 bg-slate-50 border border-slate-300 rounded-lg font-times text-xs space-y-2">
                <div className="font-bold text-slate-800 text-xs uppercase tracking-wide">
                  Danh mục công việc đã hoàn thành & được thẩm định tính điểm (Tổng {approvedTasks.length} việc)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-xs border-collapse bg-white">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                      <tr>
                        <th className="p-2 border border-slate-200 w-12 text-center">TT</th>
                        <th className="p-2 border border-slate-200 min-w-[120px]">Nguồn việc</th>
                        <th className="p-2 border border-slate-200 min-w-[80px]">Trục</th>
                        <th className="p-2 border border-slate-200 min-w-[300px]">Tên công việc</th>
                        <th className="p-2 border border-slate-200 min-w-[100px] text-right">Điểm chuẩn</th>
                        <th className="p-2 border border-slate-200 min-w-[80px] text-center">HSĐK</th>
                        <th className="p-2 border border-slate-200 min-w-[110px] text-right">Điểm quy đổi</th>
                      </tr>
                    </thead>
                  <tbody>
                    {approvedTasks.map((t, i) => (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="p-1.5 border border-slate-200 text-center">{i + 1}</td>
                        <td className="p-1.5 border border-slate-200 whitespace-nowrap">
                          {t.origin === 'assigned' ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-indigo-100 text-indigo-800">
                              Lãnh đạo giao
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-800">
                              Tự đăng ký
                            </span>
                          )}
                        </td>
                        <td className="p-1.5 border border-slate-200 font-medium text-slate-600">{t.axis_code}</td>
                        <td className="p-1.5 border border-slate-200 font-medium text-slate-800">{t.task_name}</td>
                        <td className="p-1.5 border border-slate-200 text-right">{t.standard_score}</td>
                        <td className="p-1.5 border border-slate-200 text-center">{t.difficulty_weight}</td>
                        <td className="p-1.5 border border-slate-200 text-right font-bold text-emerald-700">{Number(Number(t.converted_score || 0).toFixed(2))}</td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* II. Tự đề xuất xếp loại mức chất lượng (Rows 41-43) */}
        <div className="text-[14pt] space-y-2 pt-2 text-black">
          <p className="font-bold">
            II. Tự đề xuất xếp loại mức chất lượng: <span className="text-red-800 font-bold uppercase">{rank}</span>
          </p>
          <p className="italic text-slate-800">
            (Theo 04 mức: 1- Hoàn thành xuất sắc nhiệm vụ, 2- Hoàn thành tốt nhiệm vụ, 3- Hoàn thành nhiệm vụ và 4- Không hoàn thành nhiệm vụ)
          </p>
          <p className="italic text-slate-800 text-[14pt] leading-relaxed">
            Tiêu chí đánh giá, xếp loại chất lượng thực hiện theo mục 2.3, khoản 2, phần IV của Kế hoạch số 13-KH/TU của Ban Thường vụ Thành ủy; trong đó, trường hợp cá nhân “Hoàn thành xuất sắc nhiệm vụ” ngoài kết quả tổng điểm đạt từ 90 điểm trở lên, các địa phương, lĩnh vực, cơ quan, đơn vị, bộ phận do cá nhân trực tiếp lãnh đạo, quản lý hoàn thành 100% nhiệm vụ được giao; trong đó có ít nhất 30% số nhiệm vụ hoàn thành vượt mức yêu cầu.
          </p>
        </div>

        {/* Chữ ký theo chuẩn Mẫu 01-A (CBQL) vs Mẫu 01-B (CBNV) */}
        {isCbnv ? (
          /* MẪU 01-B: CÓ 3 BÊN KÝ (Cá nhân, Người quản lý đơn vị / CBQL, Thủ trưởng cơ quan) */
          <div className="space-y-8 pt-4">
            <div className="grid grid-cols-2 text-center text-[14pt]">
              {/* Bên trái: Cá nhân tự đánh giá */}
              <div className="space-y-20">
                <div>
                  <p className="font-bold uppercase text-black">CÁ NHÂN TỰ ĐÁNH GIÁ</p>
                  <p className="italic text-[14pt] text-slate-700">(Ký, ghi rõ họ tên)</p>
                </div>
                <div>
                  <p className="font-bold text-[14pt] text-black">{targetUser.full_name}</p>
                </div>
              </div>

              {/* Bên phải: Người quản lý đơn vị trực tiếp */}
              <div className="space-y-20">
                <div>
                  <p className="font-bold uppercase text-black leading-tight">
                    LÃNH ĐẠO / QUẢN LÝ ĐƠN VỊ TRỰC TIẾP
                  </p>
                  <p className="italic text-[14pt] text-slate-700">(Ký, ghi rõ họ tên)</p>
                </div>
                <div>
                  <p className="font-bold text-[14pt] text-black uppercase">
                    {configs.DEPT_LEADER_TITLE || 'TRƯỞNG PHÒNG'}
                  </p>
                </div>
              </div>
            </div>

            {/* III. Nhận xét, đánh giá của cấp có thẩm quyền (Thủ trưởng cơ quan) */}
            <div className="text-[14pt] space-y-2 pt-6 border-t border-black/20 text-black">
              <p className="font-bold">
                III. Nhận xét, đánh giá của cấp có thẩm quyền
              </p>
              <p>
                - Chấm điểm: <b>{grandTotal} điểm</b>
              </p>
              <p>
                - Đề xuất xếp loại: <b>{rank}</b>
              </p>
              {evaluation.superior_comment && (
                <p className="italic text-slate-800">
                  - Ý kiến nhận xét: {evaluation.superior_comment}
                </p>
              )}

              <div className="grid grid-cols-2 text-center pt-6 text-[14pt]">
                <div></div>
                <div className="space-y-20">
                  <div>
                    <p className="font-bold uppercase text-black leading-tight">
                      THỦ TRƯỞNG CƠ QUAN, ĐƠN VỊ
                    </p>
                    <p className="italic text-[14pt] text-slate-700 mt-0.5">
                      (Xác lập thời điểm, ký, ghi rõ họ tên và đóng dấu)
                    </p>
                  </div>
                  <div>
                    {!isUnitLeader && (
                      <p className="font-bold text-[14pt] text-black">
                        {configs.LEADER_SIGNER_NAME || 'Thái Thị Bích Liên'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* MẪU 01-A (CBQL): 2 BÊN KÝ (Cá nhân lãnh đạo tự đánh giá, và Xác nhận của Ban Thường vụ / Tập thể lãnh đạo) */
          <div className="space-y-8 pt-4">
            <div className="grid grid-cols-2 text-center text-[14pt]">
              <div></div>
              <div className="space-y-20">
                <div>
                  <p className="font-bold uppercase text-black">CÁ NHÂN TỰ ĐÁNH GIÁ</p>
                  <p className="italic text-[14pt] text-slate-700">(Ký, ghi rõ họ tên)</p>
                </div>
                <div>
                  <p className="font-bold text-[14pt] text-black">{targetUser.full_name}</p>
                </div>
              </div>
            </div>

            {/* III. Nhận xét, đánh giá của cấp có thẩm quyền */}
            <div className="text-[14pt] space-y-2 pt-6 border-t border-black/20 text-black">
              <p className="font-bold">
                III. Nhận xét, đánh giá của cấp có thẩm quyền
              </p>
              <p>
                - Chấm điểm: <b>{grandTotal} điểm</b>
              </p>
              <p>
                - Đề xuất xếp loại: <b>{rank}</b>
              </p>
              {evaluation.superior_comment && (
                <p className="italic text-slate-800">
                  - Ý kiến nhận xét: {evaluation.superior_comment}
                </p>
              )}

              <div className="grid grid-cols-2 text-center pt-6 text-[14pt]">
                <div></div>
                <div className="space-y-20">
                  <div>
                    <p className="font-bold uppercase text-black leading-tight">
                      XÁC NHẬN CỦA BAN THƯỜNG VỤ CẤP ỦY<br />
                      HOẶC TẬP THỂ LÃNH ĐẠO CƠ QUAN, ĐƠN VỊ
                    </p>
                    <p className="italic text-[14pt] text-slate-700 mt-0.5">
                      (Xác lập thời điểm, ký, ghi rõ họ tên và đóng dấu)
                    </p>
                  </div>
                  <div>
                    {!isUnitLeader && (
                      <p className="font-bold text-[14pt] text-black">
                        {configs.LEADER_SIGNER_NAME || 'Thái Thị Bích Liên'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 2: BÁO CÁO KẾT QUẢ THỰC HIỆN CÔNG VIỆC CHI TIẾT       */}
      {/* ========================================================= */}
      {activeReportView === 'execution_report' && (
        <div className="space-y-6">
          
          {/* Summary Stat Cards (Screen only) */}
          <div className="no-print grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-xs text-slate-500 font-medium">Tổng số công việc</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{userTasks.length}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Trong kỳ đánh giá</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-xs">
              <div className="text-xs text-indigo-700 font-semibold flex items-center space-x-1">
                <span>🎖️ Lãnh đạo giao</span>
              </div>
              <div className="text-2xl font-bold text-indigo-800 mt-1">{assignedTasksCount}</div>
              <div className="text-[11px] text-indigo-600 mt-0.5">
                Chiếm {userTasks.length > 0 ? Math.round((assignedTasksCount / userTasks.length) * 100) : 0}%
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs">
              <div className="text-xs text-amber-700 font-semibold flex items-center space-x-1">
                <span>📝 Tự đăng ký</span>
              </div>
              <div className="text-2xl font-bold text-amber-800 mt-1">{registeredTasksCount}</div>
              <div className="text-[11px] text-amber-600 mt-0.5">
                Chiếm {userTasks.length > 0 ? Math.round((registeredTasksCount / userTasks.length) * 100) : 0}%
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs">
              <div className="text-xs text-emerald-700 font-semibold">Đúng / Trước hạn</div>
              <div className="text-2xl font-bold text-emerald-800 mt-1">{aheadOrOnTimeTasks}</div>
              <div className="text-[11px] text-emerald-600 mt-0.5">
                Tỷ lệ {userTasks.length > 0 ? Math.round((aheadOrOnTimeTasks / userTasks.length) * 100) : 0}%
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-red-200 shadow-xs">
              <div className="text-xs text-red-700 font-semibold">Điểm quy đổi đạt</div>
              <div className="text-2xl font-bold text-red-800 mt-1">{Number(totalConvertedScore.toFixed(1))}</div>
              <div className="text-[11px] text-red-600 mt-0.5">Phần B (tối đa 70đ)</div>
            </div>
          </div>

          {/* Filter Toolbar (Screen only) */}
          <div className="no-print bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Origin filter */}
              <div className="flex items-center space-x-2 text-xs">
                <span className="font-semibold text-slate-700 flex items-center space-x-1">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span>Nguồn:</span>
                </span>
                <select
                  value={originFilter}
                  onChange={(e) => setOriginFilter(e.target.value)}
                  className="p-1.5 bg-slate-50 border border-slate-300 rounded-md font-medium text-slate-800"
                >
                  <option value="all">Tất cả nguồn việc ({userTasks.length})</option>
                  <option value="assigned">🎖️ Lãnh đạo giao ({assignedTasksCount})</option>
                  <option value="registered">📝 Cá nhân tự đăng ký ({registeredTasksCount})</option>
                </select>
              </div>

              {/* Axis filter */}
              <div className="flex items-center space-x-2 text-xs">
                <span className="font-semibold text-slate-700">Trục:</span>
                <select
                  value={axisFilter}
                  onChange={(e) => setAxisFilter(e.target.value)}
                  className="p-1.5 bg-slate-50 border border-slate-300 rounded-md font-medium text-slate-800"
                >
                  <option value="all">Tất cả 6 trục trọng tâm</option>
                  {axes.map((ax, i) => (
                    <option key={ax.code} value={ax.code}>
                      Trục {i + 1} - {ax.name.split(' - ')[1] || ax.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status filter */}
              <div className="flex items-center space-x-2 text-xs">
                <span className="font-semibold text-slate-700">Trạng thái:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="p-1.5 bg-slate-50 border border-slate-300 rounded-md font-medium text-slate-800"
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="approved">Đã duyệt kết quả</option>
                  <option value="submitted">Đã nộp minh chứng</option>
                  <option value="in_progress">Đang thực hiện</option>
                  <option value="pending_approval">Chờ duyệt việc</option>
                </select>
              </div>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Hiển thị: <b>{filteredExecutionTasks.length}</b> / {userTasks.length} công việc
            </div>
          </div>

          {/* Official Document Container (Bảng 1 - Phụ lục 5) */}
          <div className="print-document bg-white rounded-xl border border-slate-300 shadow-md p-3.5 sm:p-6 md:p-10 font-times text-[14pt] text-black space-y-6">
            
            {/* Agency & National Title Header */}
            <div className="grid grid-cols-2 text-center text-[14pt]">
              <div>
                <p className="uppercase text-black leading-tight">
                  {parentAgency}
                </p>
                <p className="font-bold text-[14pt] uppercase text-black leading-tight mt-0.5">
                  {unitName.toUpperCase()}
                </p>
                <div className="w-24 mx-auto border-b border-black mt-1"></div>
              </div>
              <div>
                <p className="font-bold text-[14pt] uppercase text-black tracking-wider">
                  ĐẢNG CỘNG SẢN VIỆT NAM
                </p>
                <p className="text-[14pt] italic text-black mt-1">
                  {formatAdministrativeDate(new Date(), locationName)}
                </p>
              </div>
            </div>

            {/* Document Title */}
            <div className="text-center space-y-1 pt-2">
              <h1 className="text-[16pt] font-bold uppercase text-black tracking-tight">
                BÁO CÁO KẾT QUẢ THỰC HIỆN NHIỆM VỤ, CÔNG VIỆC CỦA CÁ NHÂN
              </h1>
              <p className="text-[14pt] italic text-black">
                (Bảng 1 - Phụ lục 5 ban hành kèm theo Hướng dẫn số 06-HD/BTCTU ngày 12 tháng 8 năm 2026 của Ban Tổ chức Thành ủy)
              </p>
              <p className="text-[14pt] italic text-black">
                {periodDisplayName}
              </p>
            </div>

            {/* Cadre Details */}
            <div className="text-[14pt] text-black space-y-2 pt-2 border-t border-b border-black/20 py-3 leading-relaxed">
              <p>
                <b>Họ và tên:</b> {targetUser.full_name} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <b>Ngày sinh:</b> {formatDate(targetUser.birth_date, '10/04/1973')}
              </p>
              <p>
                <b>Chức vụ Đảng:</b> {targetUser.party_title || 'Đảng viên'}
              </p>
              <p>
                <b>Chức vụ chính quyền:</b> {targetUser.gov_title || (isCbnv ? 'Chuyên viên' : 'Lãnh đạo')}
              </p>
              <p>
                <b>Chức vụ đoàn thể:</b> {targetUser.union_title || 'Không có'}
              </p>
              <p>
                <b>Đơn vị công tác:</b> {unitName}
              </p>
            </div>

            {/* Tasks Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1300px] text-left text-[14pt] border-collapse border border-black font-times text-black">
                <thead>
                  <tr className="bg-slate-100 font-bold text-black border-b border-black text-center text-[14pt]">
                    <th className="border border-black p-2.5 text-center w-12">STT</th>
                    <th className="border border-black p-2.5 min-w-[300px]">Tên công việc / Nhiệm vụ</th>
                    <th className="border border-black p-2.5 min-w-[130px] text-center">Loại công việc</th>
                    <th className="border border-black p-2.5 min-w-[180px]">Kết quả đầu ra</th>
                    <th className="border border-black p-2.5 min-w-[110px] text-center">Hạn chót</th>
                    <th className="border border-black p-2.5 min-w-[110px] text-center">Ngày HT</th>
                    <th className="border border-black p-2.5 min-w-[100px] text-center">Tiến độ</th>
                    <th className="border border-black p-2.5 min-w-[200px]">Minh chứng đính kèm</th>
                    <th className="border border-black p-2.5 min-w-[90px] text-center">Điểm chuẩn</th>
                    <th className="border border-black p-2.5 min-w-[80px] text-center">HSĐK</th>
                    <th className="border border-black p-2.5 min-w-[110px] text-center font-bold">Điểm quy đổi</th>
                    <th className="border border-black p-2.5 min-w-[130px] text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedTasksByAxis.length === 0 ? (
                    <tr>
                      <td colSpan="12" className="border border-black p-6 text-center text-slate-500 italic">
                        Không có công việc nào thỏa mãn bộ lọc hiện tại.
                      </td>
                    </tr>
                  ) : (
                    groupedTasksByAxis.map((group) => (
                      <React.Fragment key={group.code}>
                        {/* Dòng phân nhóm theo từng trụ cột (ghi rõ nội dung trụ cột) */}
                        <tr className="bg-slate-200/90 font-bold text-black border-y-2 border-black">
                          <td colSpan="12" className="border border-black px-3 py-2 text-left uppercase text-[14pt]">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold">{group.name}</span>
                              <span className="text-[13pt] font-semibold text-slate-800 normal-case">
                                ({group.tasks.length} nhiệm vụ • Tổng điểm QĐ: {group.totalConvScore} đ)
                              </span>
                            </div>
                          </td>
                        </tr>

                        {group.tasks.map((t, taskIdx) => {
                          const isApproved = t.status === 'approved';
                          const isSubmitted = t.status === 'submitted';
                          return (
                            <tr key={t.id} className="hover:bg-slate-50">
                              {/* Ở mỗi trục, đánh số thứ tự nhiệm vụ bắt đầu từ 1 */}
                              <td className="border border-black p-2 text-center text-slate-700">{taskIdx + 1}</td>

                              {/* Tên công việc / Nhiệm vụ: không thêm ghi chú nào khác */}
                              <td className="border border-black p-2 font-bold text-black leading-snug">
                                {t.task_name}
                              </td>

                              {/* Cột Loại công việc sau cột Tên công việc */}
                              <td className="border border-black p-2 text-center text-slate-800 whitespace-nowrap">
                                {t.task_type || 'Chuyên môn'}
                              </td>

                              {/* Kết quả đầu ra */}
                              <td className="border border-black p-2 text-black">
                                {t.output_result}
                              </td>

                              {/* Deadline & Actual Finish */}
                              <td className="border border-black p-2 text-center whitespace-nowrap text-slate-800">
                                {formatDate(t.deadline)}
                              </td>
                              <td className="border border-black p-2 text-center whitespace-nowrap">
                                {t.actual_finish_date ? (
                                  <span className="text-emerald-800 font-bold">{formatDate(t.actual_finish_date)}</span>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>

                              {/* Tiến độ % */}
                              <td className="border border-black p-2 text-center whitespace-nowrap">
                                {t.progress_pct !== null && t.progress_pct !== undefined ? (
                                  <span className="font-bold text-black">
                                    {Math.round(t.progress_pct * 100)}%
                                  </span>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>

                              {/* Minh chứng */}
                              <td className="border border-black p-2">
                                {t.evidence_text && (
                                  <div className="text-black text-[13pt]">{t.evidence_text}</div>
                                )}
                                {t.evidence_file_url && (
                                  <div className="flex items-center space-x-1 text-blue-800 text-[13pt] mt-0.5">
                                    <Paperclip className="w-3.5 h-3.5 shrink-0" />
                                    <a 
                                      href={t.evidence_file_url} 
                                      target="_blank" 
                                      rel="noreferrer" 
                                      className="truncate hover:underline font-medium"
                                    >
                                      {t.evidence_file_name || 'Tệp đính kèm'}
                                    </a>
                                  </div>
                                )}
                                {!t.evidence_text && !t.evidence_file_url && (
                                  <span className="text-slate-400 italic text-[13pt]">Chưa nộp</span>
                                )}
                              </td>

                              {/* Điểm chuẩn & HS */}
                              <td className="border border-black p-2 text-center font-bold">{t.standard_score}</td>
                              <td className="border border-black p-2 text-center font-bold">{t.difficulty_weight}</td>

                              {/* Điểm quy đổi */}
                              <td className="border border-black p-2 text-center font-bold text-black">
                                {isApproved ? (
                                  <span className="text-emerald-800 font-bold">{Number(Number(t.converted_score || 0).toFixed(2))}</span>
                                ) : (
                                  <span className="text-slate-500 font-normal">{Number(Number(t.converted_score || 0).toFixed(2))}</span>
                                )}
                              </td>

                              {/* Trạng thái */}
                              <td className="border border-black p-2 text-center whitespace-nowrap">
                                <span className="font-bold">
                                  {isApproved ? 'Đã duyệt' :
                                   isSubmitted ? 'Đã nộp MC' :
                                   t.status === 'pending_approval' ? 'Chờ duyệt' :
                                   t.status === 'rejected' ? 'Bị từ chối' : 'Đang làm'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))
                  )}
                </tbody>

                {/* Table Footer: Totals */}
                {filteredExecutionTasks.length > 0 && (
                  <tfoot className="bg-slate-100 font-bold text-black border-t-2 border-black">
                    <tr>
                      <td colSpan="8" className="border border-black p-2.5 text-right uppercase text-[14pt] tracking-wide">
                        Tổng cộng ({filteredExecutionTasks.length} việc) =
                      </td>
                      <td className="border border-black p-2.5 text-center text-black">
                        {filteredExecutionTasks.reduce((s, t) => s + (t.standard_score || 0), 0)}
                      </td>
                      <td className="border border-black"></td>
                      <td className="border border-black p-2.5 text-center text-red-800 font-bold text-[14pt]">
                        {Number(filteredExecutionTasks.reduce((s, t) => s + (t.converted_score || 0), 0).toFixed(2))}
                      </td>
                      <td className="border border-black"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Bottom Signature Block */}
            <div className="grid grid-cols-2 text-center pt-8 text-[14pt] text-black">
              <div className="space-y-20">
                <div>
                  <p className="font-bold uppercase text-black">CÁ NHÂN TỰ ĐÁNH GIÁ</p>
                  <p className="italic text-[14pt] text-slate-700">(Ký, ghi rõ họ tên)</p>
                </div>
                <div>
                  <p className="font-bold text-[14pt] text-black">{targetUser.full_name}</p>
                </div>
              </div>

              <div className="space-y-20">
                <div>
                  <p className="italic text-[14pt] text-black mb-1">
                    {formatAdministrativeDate(new Date(), locationName)}
                  </p>
                  <p className="font-bold uppercase text-black leading-tight">
                    XÁC NHẬN CỦA BAN THƯỜNG VỤ CẤP ỦY<br />
                    HOẶC TẬP THỂ LÃNH ĐẠO CƠ QUAN, ĐƠN VỊ
                  </p>
                  <p className="italic text-[14pt] text-slate-700 mt-0.5">
                    (Xác lập thời điểm, ký, ghi rõ họ tên và đóng dấu)
                  </p>
                </div>
                <div>
                  {!isUnitLeader && (
                    <p className="font-bold text-[14pt] text-black">
                      {configs.LEADER_SIGNER_NAME || 'Thái Thị Bích Liên'}
                    </p>
                  )}
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 3: MẪU 02 - BẢNG TỔNG HỢP XẾP LOẠI TOÀN CƠ QUAN     */}
      {/* ========================================================= */}
      {activeReportView === 'mau_02' && (
        <div className="space-y-6">
          {/* Mẫu 02 Stat Cards (Screen only) */}
          <div className="no-print grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-xs text-slate-500 font-medium">Tổng số cán bộ</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{totalStaff}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Toàn cơ quan, đơn vị</div>
            </div>

            <div className={`p-4 rounded-xl border shadow-xs ${Number(excPercent) <= 20 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-300'}`}>
              <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                <span>🌟 Xuất sắc</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${Number(excPercent) <= 20 ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'}`}>
                  {Number(excPercent) <= 20 ? 'Đạt chỉ tiêu ≤20%' : 'Vượt 20% HD.06!'}
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{countExc}</div>
              <div className="text-[11px] text-slate-600 mt-0.5 font-medium">
                Tỷ lệ: {excPercent}% (Quy định ≤ 20%)
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-xs">
              <div className="text-xs text-blue-700 font-semibold">Tốt</div>
              <div className="text-2xl font-bold text-blue-900 mt-1">{countGood}</div>
              <div className="text-[11px] text-blue-600 mt-0.5">
                Tỷ lệ {totalStaff > 0 ? ((countGood / totalStaff) * 100).toFixed(1) : 0}%
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-xs text-slate-600 font-semibold">Hoàn thành</div>
              <div className="text-2xl font-bold text-slate-800 mt-1">{countComplete}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Tỷ lệ {totalStaff > 0 ? ((countComplete / totalStaff) * 100).toFixed(1) : 0}%
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs">
              <div className="text-xs text-rose-700 font-semibold">Không hoàn thành</div>
              <div className="text-2xl font-bold text-rose-800 mt-1">{countFail}</div>
              <div className="text-[11px] text-rose-600 mt-0.5">
                Tỷ lệ {totalStaff > 0 ? ((countFail / totalStaff) * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>

          {mau02SuccessMsg && (
            <div className="no-print p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{mau02SuccessMsg}</span>
            </div>
          )}

          {/* Document Container */}
          <div className="print-document bg-white rounded-xl border border-slate-300 shadow-md p-3.5 sm:p-6 md:p-10 font-times text-[14pt] space-y-6 text-black">
            {/* Header Mẫu 02 */}
            <div className="text-right text-[14pt] font-bold text-black">
              Mẫu 02
            </div>

            <div className="grid grid-cols-2 text-center text-[14pt]">
              <div>
                <p className="uppercase text-black leading-tight">
                  {mau02ParentAgency}
                </p>
                <p className="font-bold text-[14pt] uppercase text-black leading-tight mt-0.5">
                  {mau02UnitName.toUpperCase()}
                </p>
                <div className="w-24 mx-auto border-b border-black mt-1"></div>
              </div>
              <div>
                <p className="font-bold text-[14pt] uppercase text-black tracking-wider">
                  ĐẢNG CỘNG SẢN VIỆT NAM
                </p>
                <p className="text-[14pt] italic text-black mt-1">
                  {formatAdministrativeDate(new Date(), mau02LocationName)}
                </p>
              </div>
            </div>

            <div className="text-center space-y-1 pt-2">
              <h1 className="text-[16pt] font-bold uppercase text-black tracking-tight">
                BẢNG TỔNG HỢP KẾT QUẢ ĐÁNH GIÁ, XẾP LOẠI VÀ ĐỀ XUẤT CÔNG TÁC CÁN BỘ
              </h1>
              <p className="text-[14pt] italic text-black">
                (Ban hành kèm theo Hướng dẫn số 06-HD/BTCTU ngày 12 tháng 8 năm 2026 của Ban Tổ chức Thành ủy)
              </p>
              <p className="text-[14pt] italic text-black">
                {periodDisplayName}
              </p>
            </div>

            {/* Table Mẫu 02 */}
            <div className="overflow-x-auto pt-2">
              <table className="w-full min-w-[1700px] text-left text-[14pt] border-collapse border border-black font-times text-black">
                <thead>
                  <tr className="bg-slate-100 font-bold text-black text-center text-[14pt]">
                    <th rowSpan="2" className="border border-black px-3 py-2.5 w-12">STT</th>
                    <th rowSpan="2" className="border border-black px-3 py-2.5 min-w-[190px]">Họ và tên</th>
                    <th rowSpan="2" className="border border-black px-3 py-2.5 min-w-[150px]">Chức vụ</th>
                    <th rowSpan="2" className="border border-black px-3 py-2.5 min-w-[170px]">Đơn vị</th>
                    <th colSpan="4" className="border border-black px-3 py-2">Điểm đánh giá chi tiết</th>
                    <th colSpan="2" className="border border-black px-3 py-2">Kết quả xếp loại</th>
                    <th rowSpan="2" className="border border-black px-3 py-2.5 min-w-[240px]">Tóm tắt căn cứ, lý do đề xuất</th>
                    <th rowSpan="2" className="border border-black px-3 py-2.5 min-w-[200px]">Đề xuất công tác cán bộ</th>
                    <th rowSpan="2" className="no-print border border-black px-3 py-2.5 min-w-[120px] text-center">Thao tác</th>
                  </tr>
                  <tr className="bg-slate-100 font-bold text-black text-center text-[14pt]">
                    <th className="border border-black px-2 py-2 min-w-[90px] w-24">Phần A<br />(30đ)</th>
                    <th className="border border-black px-2 py-2 min-w-[90px] w-24">Phần B<br />(70đ)</th>
                    <th className="border border-black px-2 py-2 min-w-[90px] w-24">Thưởng<br />(TĐ 7đ)</th>
                    <th className="border border-black px-2 py-2 min-w-[100px] w-28 text-red-900 font-bold">Tổng<br />(100đ)</th>
                    <th className="border border-black px-2 py-2 min-w-[160px]">Cá nhân đề xuất</th>
                    <th className="border border-black px-2 py-2 min-w-[180px]">Lãnh đạo đề xuất</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black">
                  {mau02Loading ? (
                    <tr>
                      <td colSpan="13" className="border border-black text-center py-8 text-slate-500 italic">
                        Đang tải danh sách Mẫu 02 toàn cơ quan...
                      </td>
                    </tr>
                  ) : mau02List.length === 0 ? (
                    <tr>
                      <td colSpan="13" className="border border-black text-center py-8 text-slate-500 italic">
                        Chưa có dữ liệu đánh giá trong kỳ này.
                      </td>
                    </tr>
                  ) : (
                    mau02List.map((r, idx) => {
                      const isEditing = editingRow === r.user_id;
                      const p1 = r.part1_score !== null && r.part1_score !== undefined ? Number(r.part1_score) : 30;
                      const p2 = r.part2_score !== null && r.part2_score !== undefined ? Number(r.part2_score) : 0;
                      const bonus = r.bonus_score !== null && r.bonus_score !== undefined ? Number(r.bonus_score) : 0;
                      const total = r.total_score !== null && r.total_score !== undefined ? Number(r.total_score) : (p1 + p2 + bonus);
                      const finalRank = r.superior_rank || r.rank_proposed || 'Chưa xếp loại';

                      return (
                        <tr key={r.user_id} className="hover:bg-slate-50 transition">
                          <td className="border border-black px-3.5 py-2.5 text-center text-slate-700">{idx + 1}</td>
                          <td className="border border-black px-3.5 py-2.5">
                            <div className="font-bold text-black">{r.full_name}</div>
                          </td>
                          <td className="border border-black px-3.5 py-2.5 text-black">
                            <div>{r.gov_title || r.party_title || 'Cán bộ'}</div>
                            {r.union_title && (
                              <div className="text-[12pt] text-indigo-900 italic mt-0.5">{r.union_title}</div>
                            )}
                          </td>
                          <td className="border border-black px-3.5 py-2.5 text-black">
                            {r.dept_name || ''}
                          </td>

                          {/* Scores */}
                          <td className="border border-black px-3.5 py-2.5 text-center font-bold">{p1}</td>
                          <td className="border border-black px-3.5 py-2.5 text-center font-bold">{p2}</td>
                          <td className="border border-black px-3.5 py-2.5 text-center text-emerald-800 font-bold">{bonus > 0 ? bonus : '-'}</td>
                          <td className="border border-black px-3.5 py-2.5 text-center font-bold text-red-900 text-[14pt]">{total}</td>

                          {/* Self Rank */}
                          <td className="border border-black px-3.5 py-2.5 text-center text-black">
                            {r.rank_proposed || <span className="text-slate-400 italic">Chưa tự đánh giá</span>}
                          </td>

                          {/* Superior Rank */}
                          <td className="border border-black px-3.5 py-2.5 text-center font-semibold">
                            {isEditing ? (
                              <select
                                value={rowEditData.superior_rank}
                                onChange={(e) => setRowEditData({ ...rowEditData, superior_rank: e.target.value })}
                                className="w-full text-xs font-semibold p-1.5 border border-blue-400 rounded bg-white"
                              >
                                <option value="Hoàn thành xuất sắc nhiệm vụ">Hoàn thành xuất sắc nhiệm vụ</option>
                                <option value="Hoàn thành tốt nhiệm vụ">Hoàn thành tốt nhiệm vụ</option>
                                <option value="Hoàn thành nhiệm vụ">Hoàn thành nhiệm vụ</option>
                                <option value="Không hoàn thành nhiệm vụ">Không hoàn thành nhiệm vụ</option>
                              </select>
                            ) : (
                              <span className="font-bold">
                                {finalRank}
                              </span>
                            )}
                          </td>

                          {/* Summary reason */}
                          <td className="border border-black px-3.5 py-2.5 text-black">
                            {isEditing ? (
                              <textarea
                                rows="2"
                                value={rowEditData.summary_reason}
                                onChange={(e) => setRowEditData({ ...rowEditData, summary_reason: e.target.value })}
                                className="w-full text-xs p-1.5 border border-blue-400 rounded"
                                placeholder="Ghi tóm tắt lý do đánh giá..."
                              />
                            ) : (
                              <span className="text-[14pt]">{r.summary_reason || r.superior_comment || '-'}</span>
                            )}
                          </td>

                          {/* Cadre Proposal Note */}
                          <td className="border border-black px-3.5 py-2.5 text-black">
                            {isEditing ? (
                              <input
                                type="text"
                                value={rowEditData.cadre_proposal_note}
                                onChange={(e) => setRowEditData({ ...rowEditData, cadre_proposal_note: e.target.value })}
                                className="w-full text-xs p-1.5 border border-blue-400 rounded"
                                placeholder="Quy hoạch, Bổ nhiệm, Khen thưởng..."
                              />
                            ) : (
                              <span className="text-[14pt] font-medium text-black">{r.cadre_proposal_note || '-'}</span>
                            )}
                          </td>

                          {/* Actions (Screen only) */}
                          <td className="no-print border border-black px-3.5 py-2.5 text-center">
                            {isEditing ? (
                              <div className="flex flex-col gap-1">
                                <button
                                  type="button"
                                  disabled={mau02Saving}
                                  onClick={() => handleSaveMau02Row(r.user_id)}
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold cursor-pointer"
                                >
                                  Lưu
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingRow(null)}
                                  className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[10px] cursor-pointer"
                                >
                                  Huỷ
                                </button>
                              </div>
                            ) : canEditMau02 ? (
                              <button
                                type="button"
                                onClick={() => handleStartEditMau02(r)}
                                className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-[11px] font-medium border border-indigo-200 cursor-pointer"
                              >
                                Đề xuất
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Chỉ xem</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom 2-Column Signatures */}
            <div className="grid grid-cols-2 text-center pt-8 text-[14pt] text-black">
              {/* Col 1: Người lập biểu (để trống tên và chức danh) */}
              <div className="space-y-20">
                <div>
                  <p className="font-bold uppercase text-black">NGƯỜI LẬP BIỂU</p>
                  <p className="italic text-[14pt] text-slate-700">(Ký, ghi rõ họ tên)</p>
                </div>
                <div className="h-6">
                  {/* Để trống tên và chức danh */}
                </div>
              </div>

              {/* Col 2: Thủ trưởng cơ quan, đơn vị (Lấy Lãnh đạo đơn vị, loại bỏ chức danh bên dưới) */}
              <div className="space-y-20">
                <div>
                  <p className="italic text-[14pt] text-black mb-1">
                    {formatAdministrativeDate(new Date(), mau02LocationName)}
                  </p>
                  <p className="font-bold uppercase text-black leading-tight">
                    THỦ TRƯỞNG CƠ QUAN, ĐƠN VỊ
                  </p>
                  <p className="italic text-[14pt] text-slate-700 mt-0.5">
                    (Ký, ghi rõ họ tên và đóng dấu)
                  </p>
                </div>
                <div>
                  <p className="font-bold text-[14pt] text-black">
                    {configs.LEADER_SIGNER_NAME || 'Thái Thị Bích Liên'}
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
