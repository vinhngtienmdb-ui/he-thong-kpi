import React, { useEffect, useState } from 'react';
import { 
  Award, 
  CheckCircle2, 
  Layers, 
  Paperclip, 
  Star, 
  MessageSquare, 
  Save, 
  FileSpreadsheet,
  AlertCircle,
  Lock,
  Unlock,
  RotateCcw,
  Clock,
  AlertTriangle,
  X,
  Info
} from 'lucide-react';
import { api } from '../api';
import { formatDate } from '../constants';
import FinalizePeriodModal from './FinalizePeriodModal';

export default function GradingTab({ selectedPeriod, currentUser, users, axes, periods = [], onReloadPeriods, onPeriodChange }) {
  const [selectedUser, setSelectedUser] = useState(currentUser?.id || '');
  const [evalData, setEvalData] = useState(null);
  const [userTasks, setUserTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);

  // Active grading modal state
  const [gradingTask, setGradingTask] = useState(null);
  const [gradeForm, setGradeForm] = useState({
    quality_pct: 1.0,
    quantity_pct: 1.0,
    progress_pct: 1.0,
    cbql_comment: ''
  });

  // Criteria state (Part 1 - 30 pts)
  const [criteriaList, setCriteriaList] = useState([]);
  const [savingPart1, setSavingPart1] = useState(false);

  // Conclusion state
  const [superiorRank, setSuperiorRank] = useState('');
  const [superiorComment, setSuperiorComment] = useState('');
  const [savingConclusion, setSavingConclusion] = useState(false);

  // Return Evaluation Modal state
  const [isReturnEvalModalOpen, setIsReturnEvalModalOpen] = useState(false);
  const [returnEvalReason, setReturnEvalReason] = useState('');
  const [submittingReturnEval, setSubmittingReturnEval] = useState(false);

  // Return Task Modal state
  const [returningTask, setReturningTask] = useState(null);
  const [returnTaskReason, setReturnTaskReason] = useState('');
  const [submittingReturnTask, setSubmittingReturnTask] = useState(false);

  const currentPeriodObj = periods.find(p => p.id === selectedPeriod);
  const isPeriodLocked = currentPeriodObj?.is_locked === 1;
  const gradingLockDate = currentPeriodObj?.grading_lock_date;
  const todayStr = new Date().toISOString().split('T')[0];
  const isPastGradingLock = Boolean(gradingLockDate && todayStr > gradingLockDate);
  const isGradingLocked = (isPeriodLocked || isPastGradingLock) && currentUser?.role !== 'admin';

  const canGrade = !isGradingLocked && (currentUser?.role === 'admin' || currentUser?.role === 'cbql' || (currentUser?.data_scope && currentUser?.data_scope !== 'personal'));

  useEffect(() => {
    if (currentUser) {
      const isAccessible = users.some(u => u.id === selectedUser);
      if (!isAccessible) {
        setSelectedUser(currentUser.id);
      }
    }
  }, [currentUser, users]);

  useEffect(() => {
    if (selectedUser) {
      loadEvaluationData();
    }
  }, [selectedPeriod, selectedUser]);

  async function loadEvaluationData() {
    try {
      setLoading(true);
      const [evalRes, tasksRes] = await Promise.all([
        api.getEvaluation(selectedPeriod, selectedUser),
        api.getAssignedTasks({ period_id: selectedPeriod, user_id: selectedUser })
      ]);
      setEvalData(evalRes);
      setCriteriaList(evalRes.criteria || []);
      setUserTasks(tasksRes);
      setSuperiorRank(evalRes.evaluation?.superior_rank || evalRes.evaluation?.rank_proposed || '');
      setSuperiorComment(evalRes.evaluation?.superior_comment || '');
    } catch (err) {
      console.error('Error loading eval data:', err);
    } finally {
      setLoading(false);
    }
  }

  function openGradeModal(task) {
    setGradingTask(task);
    setGradeForm({
      difficulty_weight: task.difficulty_weight || 1.0,
      quality_pct: task.quality_pct !== undefined ? task.quality_pct : 1.0,
      quantity_pct: task.quantity_pct !== undefined ? task.quantity_pct : 1.0,
      progress_pct: task.progress_pct !== undefined ? task.progress_pct : 1.0,
      cbql_comment: task.cbql_comment || ''
    });
  }

  async function handleSaveGrade(e) {
    e.preventDefault();
    if (!gradingTask) return;

    try {
      await api.gradeTask(gradingTask.id, gradeForm);
      alert('Đã lưu kết quả chấm điểm công việc thành công!');
      setGradingTask(null);
      loadEvaluationData();
    } catch (err) {
      alert(err.message);
    }
  }

  function handleToggleCriteria(index) {
    const updated = [...criteriaList];
    updated[index].is_satisfied = updated[index].is_satisfied === 1 ? 0 : 1;
    updated[index].score = updated[index].is_satisfied === 1 ? updated[index].max_score : 0;
    setCriteriaList(updated);
  }

  async function handleSavePart1() {
    if (!evalData?.evaluation?.id) return;
    try {
      setSavingPart1(true);
      const items = criteriaList.map(c => ({
        criteria_id: c.id,
        is_satisfied: c.is_satisfied === 1,
        max_score: c.max_score,
        note: c.note || ''
      }));
      await api.savePart1Evaluation({
        evaluation_id: evalData.evaluation.id,
        items
      });
      alert('Đã lưu kết quả đánh giá Phần I (30 điểm tiêu chí chung)!');
      loadEvaluationData();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingPart1(false);
    }
  }

  async function handleSaveConclusion() {
    if (!evalData?.evaluation?.id) return;
    if (isGradingLocked) {
      alert('Kỳ đánh giá đã bị khóa hoặc hết hạn chấm điểm. Không thể lưu kết luận!');
      return;
    }
    try {
      setSavingConclusion(true);
      await api.saveSuperiorConclusion({
        evaluation_id: evalData.evaluation.id,
        superior_rank: superiorRank,
        superior_comment: superiorComment,
        status: 'approved'
      });
      alert('Đã lưu kết luận và xếp loại của cấp có thẩm quyền thành công!');
      loadEvaluationData();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingConclusion(false);
    }
  }

  async function handleReturnEvaluation(e) {
    e.preventDefault();
    if (!evalData?.evaluation?.id) return;
    if (!returnEvalReason.trim()) {
      alert('Vui lòng nhập lý do trả về bản tự đánh giá!');
      return;
    }
    try {
      setSubmittingReturnEval(true);
      await api.returnEvaluation({
        evaluation_id: evalData.evaluation.id,
        return_reason: returnEvalReason
      });
      alert('Đã trả về bản tự đánh giá cho cán bộ thực hiện lại thành công!');
      setIsReturnEvalModalOpen(false);
      setReturnEvalReason('');
      loadEvaluationData();
    } catch (err) {
      alert('Lỗi trả về: ' + err.message);
    } finally {
      setSubmittingReturnEval(false);
    }
  }

  async function handleReturnTask(e) {
    e.preventDefault();
    if (!returningTask) return;
    if (!returnTaskReason.trim()) {
      alert('Vui lòng nhập lý do trả về công việc / minh chứng!');
      return;
    }
    try {
      setSubmittingReturnTask(true);
      await api.returnAssignedTask(returningTask.id, {
        return_reason: returnTaskReason
      });
      alert(`Đã trả về công việc "${returningTask.task_name}" yêu cầu cán bộ nộp lại minh chứng!`);
      setReturningTask(null);
      setReturnTaskReason('');
      if (gradingTask && gradingTask.id === returningTask.id) {
        setGradingTask(null);
      }
      loadEvaluationData();
    } catch (err) {
      alert('Lỗi trả về: ' + err.message);
    } finally {
      setSubmittingReturnTask(false);
    }
  }

  async function handleToggleFinalizePeriod() {
    if (!currentPeriodObj) return;
    if (isPeriodLocked) {
      if (!window.confirm(
        `XÁC NHẬN MỞ KHÓA KPI CHO KỲ:\n\n👉 "${currentPeriodObj.name}" (${currentPeriodObj.code})\n\nSau khi mở khóa, Cán bộ Quản lý và Hội đồng có thể tiếp tục chấm điểm và cập nhật kết luận đánh giá. Bạn có chắc chắn muốn mở khóa?`
      )) return;
      try {
        await api.unfinalizePeriod(currentPeriodObj.id);
        alert(`Đã mở khóa KPI thành công cho kỳ "${currentPeriodObj.name}"!`);
        if (onReloadPeriods) onReloadPeriods();
        loadEvaluationData();
      } catch (err) {
        alert('Lỗi mở khóa: ' + err.message);
      }
    } else {
      if (!window.confirm(
        `XÁC NHẬN CHỐT KPI TOÀN ĐƠN VỊ / CƠ QUAN CHO KỲ:\n\n👉 "${currentPeriodObj.name}" (${currentPeriodObj.code})\n\nThời hạn đánh giá: ${formatDate(currentPeriodObj.start_date)} đến ${formatDate(currentPeriodObj.end_date)}\n\nToàn bộ kết quả đánh giá của kỳ "${currentPeriodObj.name}" sẽ được khóa sổ chính thức theo Quy định số 366-QĐ/TW.\n\nBạn có chắc chắn muốn chốt KPI cho kỳ "${currentPeriodObj.name}"?`
      )) return;
      try {
        await api.finalizePeriod(currentPeriodObj.id, { finalized_by: currentUser?.full_name || 'Lãnh đạo cơ quan' });
        alert(`Đã Chốt & Khóa Sổ KPI toàn cơ quan thành công cho kỳ "${currentPeriodObj.name}"!`);
        if (onReloadPeriods) onReloadPeriods();
        loadEvaluationData();
      } catch (err) {
        alert('Lỗi chốt KPI: ' + err.message);
      }
    }
  }

  // Live Score Calculator for Modal (Chuẩn Phụ lục 5 Hướng dẫn 06-HD/BTCTU)
  function calculatePreviewScores(stdScore, diffWeight, prog, qual) {
    const exec = Number((stdScore * (0.30 * prog + 0.70 * qual)).toFixed(2));
    let conv = Number((exec * diffWeight).toFixed(2));
    const maxConv = Number((stdScore * diffWeight).toFixed(2));
    if (conv > maxConv) conv = maxConv;
    return {
      exec,
      conv,
      maxConv
    };
  }

  // Calculate live sum of Part 1
  const livePart1Score = criteriaList.reduce((sum, c) => sum + (c.is_satisfied === 1 ? c.max_score : 0), 0);
  const evaluation = evalData?.evaluation || {};
  const axesSummary = evalData?.axesSummary || [];

  return (
    <div className="space-y-6">
      
      {/* Period Lock & Deadline Banners */}
      {isPeriodLocked && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-emerald-900">
          <div className="flex items-center space-x-3">
            <Lock className="w-5 h-5 text-emerald-700 shrink-0" />
            <div>
              <div className="text-sm font-bold">Kỳ đánh giá "{currentPeriodObj?.name}" ({currentPeriodObj?.code}) đã được Chốt KPI Toàn Đơn Vị / Cơ Quan</div>
              <div className="text-xs text-emerald-700">
                Toàn bộ dữ liệu điểm và xếp loại đã được khóa chính thức theo Quy định 366. Chế độ chấm điểm đang khóa đối với CBQL.
              </div>
            </div>
          </div>
          {(currentUser?.role === 'admin' || currentUser?.role === 'cbql') && (
            <button
              onClick={handleToggleFinalizePeriod}
              className="flex items-center space-x-1 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-xs transition-colors shrink-0 cursor-pointer"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Mở khóa KPI ({currentPeriodObj?.name})</span>
            </button>
          )}
        </div>
      )}

      {!isPeriodLocked && isPastGradingLock && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-center space-x-3 text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <div className="text-sm font-bold">Đã hết thời hạn chấm điểm KPI theo cấu hình ({formatDate(gradingLockDate)})</div>
            <div className="text-xs text-amber-700">
              Quyền chấm điểm và kết luận xếp loại đã tự động khóa đối với Cán bộ Quản lý. Chỉ Quản trị viên mới có thể can thiệp hoặc gia hạn thời gian khóa trong phần Cấu hình.
            </div>
          </div>
        </div>
      )}

      {currentUser?.role === 'cbnv' && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center space-x-3 text-blue-900">
          <Info className="w-5 h-5 text-blue-600 shrink-0" />
          <div className="text-xs">
            <span className="font-bold">Chế độ xem kết quả thẩm định cá nhân: </span>
            Bạn đang xem bảng điểm và nhận xét của Cán bộ Quản lý đối với kết quả thực hiện KPI của bạn. Quyền thẩm định, cho điểm và kết luận xếp loại thuộc thẩm quyền của CBQL / Hội đồng đánh giá.
          </div>
        </div>
      )}

      {/* Target User Selector Bar */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Hội đồng / Cán bộ Quản lý Thẩm định & Chấm điểm KPI
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Thẩm định minh chứng từng công việc (70đ) và đánh giá 17 tiêu chuẩn chính trị, đạo đức (30đ)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {(currentUser?.role === 'admin' || currentUser?.role === 'cbql' || currentUser?.role === 'lanh_dao') && (
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
                  <Unlock className="w-4 h-4" />
                  <span>Quản lý Chốt KPI Quý ({currentPeriodObj?.name || 'Theo Quý'})</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Chốt KPI theo Quý ({currentPeriodObj?.name || 'Theo Quý'})</span>
                </>
              )}
            </button>
          )}

          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">Đánh giá cho cán bộ:</span>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="text-xs font-bold p-2 bg-slate-50 border border-slate-300 rounded-md focus:ring-2 focus:ring-red-500"
            >
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.role === 'cbql' ? 'CBQL' : 'CBNV'}) - {u.gov_title || ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Score Card */}
      <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-xs grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-center">
        <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
          <span className="text-[10px] sm:text-xs font-semibold uppercase text-slate-500 block truncate">Phần I: Tiêu chuẩn chung</span>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            {livePart1Score} <span className="text-xs text-slate-400 font-normal">/ 30 đ</span>
          </div>
          <p className="text-[11px] text-slate-500 truncate">17 tiêu chí Quy định 366</p>
        </div>

        <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
          <span className="text-[10px] sm:text-xs font-semibold uppercase text-indigo-700 block truncate">Phần II: 6 Trục Trọng tâm</span>
          <div className="text-xl sm:text-2xl font-bold text-indigo-700 mt-1">
            {evaluation.part2_score || 0} <span className="text-xs text-slate-400 font-normal">/ 70 đ</span>
          </div>
          <p className="text-[11px] text-slate-500 truncate">Tổng điểm quy đổi</p>
        </div>

        <div className="p-3 bg-red-50/50 rounded-xl border border-red-100">
          <span className="text-[10px] sm:text-xs font-semibold uppercase text-red-700 block truncate">Tổng điểm Đánh giá</span>
          <div className="text-2xl sm:text-3xl font-bold text-red-700 mt-1">
            {Number((livePart1Score + (evaluation.part2_score || 0)).toFixed(2))} <span className="text-xs text-slate-400 font-normal">/ 100</span>
          </div>
          <p className="text-[11px] text-slate-500 truncate">Thang điểm 100 chuẩn</p>
        </div>

        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
          <span className="text-[10px] sm:text-xs font-semibold uppercase text-slate-600 block truncate">Đề xuất xếp loại</span>
          <span className="text-xs sm:text-sm font-bold text-slate-900 block mt-1 truncate">
            {evaluation.rank_proposed || 'Chưa xếp loại'}
          </span>
          <span className="text-[11px] text-slate-500 block truncate">
            Vượt tiến độ: {evalData?.stats?.aheadSchedulePct || 0}%
          </span>
        </div>
      </div>

      {/* SECTION 1: TASK GRADING (PHẦN II - 70 ĐIỂM) */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              <span>Phần II: Danh sách Công việc & Thẩm định Minh chứng (70 điểm)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Hệ thống áp dụng công thức Chuẩn theo Phụ lục 5 Hướng dẫn 06-HD/BTCTU: <code>Điểm thực hiện = Điểm chuẩn × (30% Tiến độ + 70% Chất lượng) | Điểm quy đổi = Điểm thực hiện × Hệ số độ khó (100%, 110%, 120%)</code>
            </p>
          </div>
        </div>

        {/* Mobile Task Cards (< md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {userTasks.length === 0 ? (
            <div className="py-8 text-center text-slate-400 italic text-xs">
              Chưa có nhiệm vụ nào được giao hoặc nộp trong kỳ này.
            </div>
          ) : (
            userTasks.map((t, idx) => {
              const isApproved = t.status === 'approved';
              return (
                <div key={t.id} className="py-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-slate-900 text-sm leading-snug">
                      {idx + 1}. {t.task_name}
                    </span>
                    <span className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-bold ${
                      isApproved ? 'bg-emerald-100 text-emerald-800' : (t.is_returned === 1 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600')
                    }`}>
                      {isApproved ? 'Đã duyệt' : (t.is_returned === 1 ? 'Bị trả về' : 'Chờ chấm')}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500">
                    Hạn: {formatDate(t.deadline)} {t.actual_finish_date && `• Xong: ${formatDate(t.actual_finish_date)}`}
                  </div>

                  {t.is_returned === 1 && (
                    <div className="text-xs text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                      <strong>⚠️ Đã trả về:</strong> {t.return_reason || 'Yêu cầu nộp lại minh chứng'}
                    </div>
                  )}

                  {t.evidence_text && (
                    <div className="text-xs text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <span className="font-semibold text-indigo-700">Minh chứng: </span>{t.evidence_text}
                    </div>
                  )}

                  {t.evidence_file_url && (
                    <div className="text-xs text-blue-600 flex items-center gap-1">
                      <Paperclip className="w-3.5 h-3.5" />
                      <a href={t.evidence_file_url} target="_blank" rel="noreferrer" className="underline font-medium">
                        {t.evidence_file_name || 'Xem tệp minh chứng'}
                      </a>
                    </div>
                  )}

                  {t.inherited_from_user_name && (
                    <div className="text-[11px] text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 inline-block font-medium">
                      📥 Kế thừa từ cấp dưới: {t.inherited_from_user_name}
                    </div>
                  )}

                  {/* Cadre Evaluation Feedback Banner (Bước 4) */}
                  {t.evaluation_feedback && (
                    <div className="text-xs text-purple-900 bg-purple-50 p-2.5 rounded-lg border border-purple-200 space-y-1">
                      <div className="font-bold text-purple-800 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                        <span>Ý kiến phản hồi đánh giá của cán bộ (Bước 4):</span>
                      </div>
                      <div className="p-2 bg-white rounded-md border border-purple-100 text-slate-800 font-medium italic">
                        "{t.evaluation_feedback}"
                      </div>
                    </div>
                  )}

                  {/* Metrics pills */}
                  <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                    <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-[10px] text-slate-400 block">Điểm chuẩn</span>
                      <span className="font-bold text-slate-800">{t.standard_score}</span>
                    </div>
                    <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-[10px] text-slate-400 block">HSĐK</span>
                      <span className="font-bold text-slate-800">{t.difficulty_weight}</span>
                    </div>
                    <div className="p-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                      <span className="text-[10px] text-emerald-700 block">Điểm quy đổi</span>
                      <span className="font-bold text-emerald-800">{Number(Number(t.converted_score || 0).toFixed(2))}</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  {canGrade && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => openGradeModal(t)}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold shadow-2xs text-center cursor-pointer text-white ${
                          t.evaluation_feedback 
                            ? 'bg-purple-700 hover:bg-purple-800 ring-2 ring-purple-300' 
                            : 'bg-indigo-600 hover:bg-indigo-700'
                        }`}
                      >
                        {t.evaluation_feedback ? 'Sửa đánh giá' : (isApproved ? 'Chấm lại' : 'Chấm điểm')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReturningTask(t);
                          setReturnTaskReason('');
                        }}
                        className="py-2 px-3 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold shadow-2xs cursor-pointer"
                      >
                        ↩️ Trả về
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Task Table (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm text-slate-600">
            <thead className="bg-slate-50 font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3.5 w-14 text-center">TT</th>
                <th className="px-4 py-3.5 min-w-[380px]">Tên công việc & Minh chứng</th>
                <th className="px-4 py-3.5 w-24 text-center">ĐC</th>
                <th className="px-4 py-3.5 w-24 text-center">HSĐK</th>
                <th className="px-4 py-3.5 w-28 text-center">Tiến độ %</th>
                <th className="px-4 py-3.5 w-28 text-center">Chất lượng %</th>
                <th className="px-4 py-3.5 w-32 text-center">Điểm thực hiện</th>
                <th className="px-4 py-3.5 w-32 text-center">Điểm quy đổi</th>
                <th className="px-4 py-3.5 w-36 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-normal">
              {userTasks.map((t, idx) => {
                const isApproved = t.status === 'approved';
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3.5 text-center font-normal text-slate-500">{idx + 1}</td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-900 text-sm">{t.task_name}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Hạn: {formatDate(t.deadline)} {t.actual_finish_date && `• Hoàn thành: ${formatDate(t.actual_finish_date)}`}
                      </div>
                      {t.is_returned === 1 && (
                        <div className="text-xs text-amber-800 bg-amber-50 p-1.5 rounded-md border border-amber-200 mt-1.5 flex items-start space-x-1">
                          <span className="font-bold">⚠️ Đã trả về:</span>
                          <span>{t.return_reason || 'Yêu cầu nộp lại minh chứng'}</span>
                        </div>
                      )}
                      {t.evidence_text && (
                        <div className="text-xs text-indigo-600 mt-1">
                          Minh chứng: {t.evidence_text}
                        </div>
                      )}
                      {t.evidence_file_url && (
                        <div className="text-xs text-blue-600 mt-1 flex items-center space-x-1">
                          <Paperclip className="w-3.5 h-3.5" />
                          <a href={t.evidence_file_url} target="_blank" rel="noreferrer" className="underline font-medium">
                            {t.evidence_file_name || 'Xem tệp minh chứng'}
                          </a>
                        </div>
                      )}
                      {t.inherited_from_user_name && (
                        <div className="text-[11px] text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 inline-block font-medium mt-1">
                          📥 Kế thừa từ cấp dưới: {t.inherited_from_user_name}
                        </div>
                      )}
                      {t.evaluation_feedback && (
                        <div className="text-xs text-purple-900 bg-purple-50 p-2 rounded-lg border border-purple-200 mt-1.5 space-y-0.5">
                          <div className="font-bold text-purple-800 flex items-center gap-1">
                            <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                            <span>Phản hồi của cán bộ (Bước 4):</span>
                          </div>
                          <div className="text-slate-800 pl-4 italic">
                            "{t.evaluation_feedback}"
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center font-normal text-slate-800">{t.standard_score}</td>
                    <td className="px-4 py-3.5 text-center">{t.difficulty_weight}</td>
                    <td className="px-4 py-3.5 text-center font-normal">
                      {Math.round((t.progress_pct || 1) * 100)}%
                    </td>
                    <td className="px-4 py-3.5 text-center font-normal">
                      {Math.round((t.quality_pct || 1) * 100)}%
                    </td>
                    <td className="px-4 py-3.5 text-center font-semibold text-slate-900">
                      {Number(Number(t.execution_score || 0).toFixed(2))}
                    </td>
                    <td className="px-4 py-3.5 text-center font-semibold text-emerald-700">
                      {Number(Number(t.converted_score || 0).toFixed(2))}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex flex-col items-center justify-center space-y-1">
                        {canGrade ? (
                          <>
                            <button
                              onClick={() => openGradeModal(t)}
                              className={`font-semibold px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer w-full text-center ${
                                t.evaluation_feedback
                                  ? 'bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-300 font-bold'
                                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                              }`}
                              title={t.evaluation_feedback ? 'Cán bộ có ý kiến phản hồi đánh giá, xem và điều chỉnh điểm' : (isApproved ? 'Chấm lại điểm công việc' : 'Thẩm định và chấm điểm')}
                            >
                              {t.evaluation_feedback ? 'Sửa đánh giá' : (isApproved ? 'Chấm lại' : 'Chấm điểm')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReturningTask(t);
                                setReturnTaskReason('');
                              }}
                              title="Trả về yêu cầu cán bộ bổ sung hoặc làm lại minh chứng"
                              className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-semibold px-2 py-1 rounded-lg text-xs transition-colors cursor-pointer w-full text-center"
                            >
                              ↩️ Trả về
                            </button>
                          </>
                        ) : (
                          <div className="space-y-1">
                            <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold ${
                              isApproved 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                : (t.is_returned === 1 ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-500')
                            }`}>
                              {isApproved ? 'Đã duyệt' : (t.is_returned === 1 ? '⚠️ Bị trả về' : 'Chờ CBQL chấm')}
                            </span>
                            {t.evaluation_feedback && (
                              <span className="block px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                💬 Đã phản hồi
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 2: COMMON CRITERIA EVALUATION (PHẦN I - 30 ĐIỂM) */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        {evaluation.status === 'returned' && (
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Bản tự đánh giá đang ở trạng thái Trả về yêu cầu làm lại.</span>
              <span className="ml-1 text-slate-700">Lý do: {evaluation.return_reason || 'Chưa cung cấp'}</span>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <Star className="w-5 h-5 text-amber-500" />
              <span>Phần I: 17 Tiêu chí Đánh giá Chung theo Quy định 366-QĐ/TW (30 điểm)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Tích chọn "Đảm bảo" để chấm điểm tối đa; không đảm bảo chấm 0 điểm
            </p>
          </div>

          <div className="flex items-center space-x-2">
            {canGrade && (
              <button
                type="button"
                onClick={() => {
                  setIsReturnEvalModalOpen(true);
                  setReturnEvalReason('');
                }}
                className="flex items-center space-x-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                title="Trả về yêu cầu cán bộ tự đánh giá lại"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Trả về tự đánh giá</span>
              </button>
            )}
            <button
              onClick={handleSavePart1}
              disabled={savingPart1 || !canGrade}
              className="flex items-center space-x-1.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-xs transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{savingPart1 ? 'Đang lưu...' : 'Lưu điểm Phần I'}</span>
            </button>
          </div>
        </div>

        {/* Mobile View: Criteria cards (< md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {criteriaList.map((c, i) => {
            const isSat = c.is_satisfied === 1;
            return (
              <div key={c.id} className={`p-4 space-y-2.5 transition-colors ${!isSat ? 'bg-rose-50/50' : 'bg-white'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    {c.code}
                  </span>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${isSat ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                    {isSat ? `${c.max_score} đ` : '0 đ'} / {c.max_score} đ
                  </span>
                </div>

                <div className="text-sm font-semibold text-slate-900 leading-snug">
                  {c.title}
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleCriteria(i)}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs transition-all shadow-2xs cursor-pointer flex items-center justify-center gap-2 ${
                    isSat
                      ? 'bg-emerald-600 text-white shadow-emerald-200 ring-2 ring-emerald-400/40'
                      : 'bg-rose-600 text-white shadow-rose-200 ring-2 ring-rose-400/40'
                  }`}
                >
                  {isSat ? `✓ Đảm bảo tiêu chuẩn (${c.max_score}đ)` : '✕ Không đảm bảo tiêu chuẩn (0đ)'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Desktop View: Criteria table (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm text-slate-600">
            <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3.5 w-16 text-center">Mã</th>
                <th className="px-4 py-3.5 min-w-[480px]">Nội dung tiêu chuẩn, tiêu chí</th>
                <th className="px-4 py-3.5 w-28 text-center">Điểm tối đa</th>
                <th className="px-4 py-3.5 w-44 text-center">Trạng thái</th>
                <th className="px-4 py-3.5 w-28 text-center">Điểm đạt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {criteriaList.map((c, i) => {
                const isSat = c.is_satisfied === 1;
                return (
                  <tr key={c.id} className={`hover:bg-slate-50 ${!isSat ? 'bg-rose-50/40' : ''}`}>
                    <td className="px-4 py-3.5 text-center font-bold text-slate-500 font-mono">{c.code}</td>
                    <td className="px-4 py-3.5 leading-relaxed text-slate-800 text-sm font-medium">
                      {c.title}
                    </td>
                    <td className="px-4 py-3.5 text-center font-semibold text-slate-600">
                      {c.max_score} đ
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleCriteria(i)}
                        className={`px-3.5 py-1.5 rounded-lg font-bold text-xs transition-colors ${
                          isSat
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                        }`}
                      >
                        {isSat ? '✓ Đảm bảo' : '✕ Không đảm bảo'}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-center font-semibold text-slate-900 text-sm">
                      {isSat ? c.max_score : 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 3: SUPERIOR CONCLUSION & RANKING */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2 border-b border-slate-100 pb-3">
          <MessageSquare className="w-5 h-5 text-purple-600" />
          <span>Ý kiến Nhận xét & Kết luận Xếp loại của Cấp có thẩm quyền</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Xếp loại chính thức *
            </label>
            <select
              value={superiorRank}
              onChange={(e) => setSuperiorRank(e.target.value)}
              disabled={!canGrade}
              className={`w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-md font-bold text-slate-900 ${
                !canGrade ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''
              }`}
            >
              <option value="Hoàn thành xuất sắc nhiệm vụ">Hoàn thành xuất sắc nhiệm vụ</option>
              <option value="Hoàn thành tốt nhiệm vụ">Hoàn thành tốt nhiệm vụ</option>
              <option value="Hoàn thành nhiệm vụ">Hoàn thành nhiệm vụ</option>
              <option value="Không hoàn thành nhiệm vụ">Không hoàn thành nhiệm vụ</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              * Điều kiện xuất sắc: Tổng điểm &ge; 90 và có trên 30% nhiệm vụ vượt tiến độ.
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nhận xét, đánh giá của Cấp ủy / Lãnh đạo cơ quan
            </label>
            <textarea
              rows="2"
              value={superiorComment}
              onChange={(e) => setSuperiorComment(e.target.value)}
              disabled={!canGrade}
              className={`w-full text-xs p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-red-500 ${
                !canGrade ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''
              }`}
              placeholder="Nhận xét về mức độ đáp ứng đối với các mục tiêu, nhiệm vụ then chốt..."
            ></textarea>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
          <div className="text-xs text-slate-500 italic">
            {!canGrade 
              ? '🔒 Cán bộ nhân viên chỉ thực hiện tự đánh giá Phần I. Kết luận xếp loại chính thức do Cán bộ Quản lý / Lãnh đạo thẩm định và phê duyệt.' 
              : 'Thẩm định kết quả và quyết định xếp loại công chức, viên chức, người lao động theo Quy định 366.'}
          </div>
          {canGrade && (
            <button
              onClick={handleSaveConclusion}
              disabled={savingConclusion}
              className="flex items-center space-x-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-xs transition-colors shrink-0"
            >
              <Save className="w-4 h-4" />
              <span>{savingConclusion ? 'Đang lưu...' : 'Lưu kết luận & Hoàn tất đánh giá'}</span>
            </button>
          )}
        </div>
      </div>

      {/* GRADING MODAL */}
      {gradingTask && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-[95%] sm:w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150">
            
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="min-w-0 flex-1 pr-2">
                <h3 className="text-base font-bold text-slate-900 truncate">
                  Thẩm định & Chấm điểm Công việc
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{gradingTask.task_name}</p>
              </div>
              <button 
                type="button"
                onClick={() => setGradingTask(null)}
                className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGrade} className="space-y-3.5">
              
              {/* Cadre Evaluation Feedback (Bước 4) */}
              {gradingTask.evaluation_feedback && (
                <div className="p-3 bg-purple-50 border border-purple-300 rounded-xl text-xs space-y-1.5 animate-in fade-in">
                  <div className="font-bold text-purple-900 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-purple-700 shrink-0" />
                    <span>Ý kiến phản hồi đánh giá của cán bộ (Bước 4):</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-purple-200 text-slate-800 font-medium italic">
                    "{gradingTask.evaluation_feedback}"
                  </div>
                  <p className="text-[11px] text-purple-700">
                    💡 Cán bộ đã gửi phản hồi đề nghị xem xét lại. Lãnh đạo có thể điều chỉnh tỷ lệ tiến độ, chất lượng hoặc cập nhật nhận xét dưới đây để hoàn tất <strong>Sửa đánh giá</strong>.
                  </p>
                </div>
              )}

              {/* Evidence preview box */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                <div><span className="font-semibold text-slate-700">Thời hạn:</span> {formatDate(gradingTask.deadline)}</div>
                <div><span className="font-semibold text-slate-700">Ngày hoàn thành thực tế:</span> {gradingTask.actual_finish_date ? formatDate(gradingTask.actual_finish_date) : 'Chưa cập nhật'}</div>
                <div><span className="font-semibold text-slate-700">Minh chứng đã nộp:</span> {gradingTask.evidence_text || 'Không có'}</div>
                {gradingTask.evidence_file_url && (
                  <div>
                    <a href={gradingTask.evidence_file_url} target="_blank" rel="noreferrer" className="text-blue-700 underline font-semibold">
                      📎 Xem tệp minh chứng ({gradingTask.evidence_file_name})
                    </a>
                  </div>
                )}
                {gradingTask.inherited_from_user_name && (
                  <div className="text-teal-800 bg-teal-50 px-2 py-1 rounded border border-teal-200 font-medium">
                    📥 Tệp minh chứng được kế thừa từ cấp dưới: <span className="font-bold">{gradingTask.inherited_from_user_name}</span>
                  </div>
                )}
              </div>

              {/* Difficulty weight & Standard score */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Điểm chuẩn (ĐC)
                  </label>
                  <div className="w-full text-xs p-2 bg-slate-100 border border-slate-300 rounded-md font-bold text-slate-700">
                    {gradingTask.standard_score || 10} điểm
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Hệ số độ khó (HSĐK)
                  </label>
                  <select
                    value={gradeForm.difficulty_weight}
                    onChange={(e) => setGradeForm({ ...gradeForm, difficulty_weight: parseFloat(e.target.value) })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-md font-semibold"
                  >
                    <option value="1.0">100% (Thông thường - 1.0)</option>
                    <option value="1.1">110% (Phối hợp - 1.1)</option>
                    <option value="1.2">120% (Phức tạp / quan trọng - 1.2)</option>
                  </select>
                </div>
              </div>

              {/* Progress & Quality sliders/selects */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tiến độ công việc (Theo thời hạn hoàn thành)
                  </label>
                  <select
                    value={gradeForm.progress_pct}
                    onChange={(e) => setGradeForm({ ...gradeForm, progress_pct: parseFloat(e.target.value) })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-md font-semibold"
                  >
                    <option value="1.0">Hoàn thành đúng hoặc trước hạn: 100%</option>
                    <option value="0.8">Hoàn thành chậm 1– 3 ngày làm việc: 80%</option>
                    <option value="0.6">Hoàn thành chậm 4 – 5 ngày làm việc: 60%</option>
                    <option value="0.0">Hoàn thành chậm trên 5 ngày làm việc: 0%</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kết quả (Căn cứ chất lượng sản phẩm)
                  </label>
                  <select
                    value={gradeForm.quality_pct}
                    onChange={(e) => setGradeForm({ ...gradeForm, quality_pct: parseFloat(e.target.value) })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-md font-semibold"
                  >
                    <option value="1.0">Đạt đầy đủ yêu cầu: 100%</option>
                    <option value="0.8">Đạt yêu cầu, chỉnh sửa nhỏ: 80%</option>
                    <option value="0.6">Hoàn thành cơ bản: 60%</option>
                    <option value="0.0">Không đạt yêu cầu: 0%</option>
                  </select>
                </div>
              </div>

              {/* Calculated Live Scores Box */}
              {(() => {
                const preview = calculatePreviewScores(
                  gradingTask.standard_score || 10,
                  gradeForm.difficulty_weight || 1.0,
                  gradeForm.progress_pct,
                  gradeForm.quality_pct
                );
                return (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs flex justify-between items-center">
                    <div>
                      <span className="text-slate-600 block">
                        Điểm thực hiện: <b>{preview.exec} đ</b> <span className="text-[11px] text-slate-400 font-normal">(= ĐC × (30% Tiến độ + 70% Chất lượng))</span>
                      </span>
                      <span className="text-slate-600 block mt-0.5">
                        Hệ số độ khó: <b>{Math.round((gradeForm.difficulty_weight || 1.0) * 100)}%</b> (tối đa kế hoạch: {preview.maxConv} đ)
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-indigo-800 text-[11px] block uppercase font-medium">Điểm quy đổi đạt được</span>
                      <span className="text-xl font-bold text-indigo-900">{preview.conv} đ</span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ý kiến đánh giá / nhận xét của CBQL
                </label>
                <textarea
                  rows="2"
                  value={gradeForm.cbql_comment}
                  onChange={(e) => setGradeForm({ ...gradeForm, cbql_comment: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-red-500"
                  placeholder="Nhận xét chất lượng, tiến độ hoặc lưu ý..."
                ></textarea>
              </div>

              <div className="pt-3 flex justify-between items-center border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    const t = gradingTask;
                    setGradingTask(null);
                    setReturningTask(t);
                    setReturnTaskReason('');
                  }}
                  className="px-3 py-2 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-md transition-colors"
                >
                  ↩️ Trả về yêu cầu làm lại
                </button>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setGradingTask(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-md"
                  >
                    Đóng
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-semibold bg-indigo-700 hover:bg-indigo-800 text-white rounded-md shadow-xs"
                  >
                    Lưu & Phê duyệt điểm
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MODAL: TRẢ VỀ TỰ ĐÁNH GIÁ (PHẦN I) */}
      {isReturnEvalModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-[95%] sm:w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <RotateCcw className="w-5 h-5 text-amber-600" />
                <span>Trả về Bản Tự Đánh Giá (Phần I)</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsReturnEvalModalOpen(false)}
                className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-1">
              <p>
                Sau khi trả về, cán bộ sẽ được <b>mở khóa quyền chỉnh sửa</b> Phần I để tự đánh giá lại theo các nhận xét, chỉ đạo.
              </p>
            </div>

            <form onSubmit={handleReturnEvaluation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Lý do trả về / Hướng dẫn chỉnh sửa <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows="3"
                  required
                  value={returnEvalReason}
                  onChange={(e) => setReturnEvalReason(e.target.value)}
                  placeholder="Nhập lý do chi tiết hoặc tiêu chí chưa chuẩn xác..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsReturnEvalModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingReturnEval}
                  className="px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submittingReturnEval ? 'Đang xử lý...' : 'Xác nhận Trả về'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TRẢ VỀ CÔNG VIỆC / MINH CHỨNG */}
      {returningTask && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-[95%] sm:w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <RotateCcw className="w-5 h-5 text-amber-600" />
                <span>Trả về Công việc & Minh chứng</span>
              </h3>
              <button
                type="button"
                onClick={() => setReturningTask(null)}
                className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
              <div className="font-bold text-slate-800">{returningTask.task_name}</div>
              <div className="text-slate-500 text-[11px]">Hạn hoàn thành: {formatDate(returningTask.deadline)}</div>
            </div>

            <p className="text-xs text-slate-600">
              Công việc này sẽ được chuyển lại trạng thái thực hiện để cán bộ bổ sung hoặc thay thế tệp minh chứng, cập nhật số liệu.
            </p>

            <form onSubmit={handleReturnTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Lý do trả về / Yêu cầu bổ sung <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows="3"
                  required
                  value={returnTaskReason}
                  onChange={(e) => setReturnTaskReason(e.target.value)}
                  placeholder="Ví dụ: Minh chứng chưa rõ số hiệu văn bản; Tệp đính kèm bị lỗi; Cần đính kèm quyết định phê duyệt..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReturningTask(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-md"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingReturnTask}
                  className="px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-md shadow-xs disabled:opacity-50"
                >
                  {submittingReturnTask ? 'Đang xử lý...' : 'Xác nhận Trả về'}
                </button>
              </div>
            </form>
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
