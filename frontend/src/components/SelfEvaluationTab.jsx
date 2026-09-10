import React, { useEffect, useState } from 'react';
import { 
  Award, 
  CheckCircle2, 
  AlertCircle, 
  Save, 
  FileText, 
  Download,
  Calendar,
  Check,
  X,
  Star,
  Lock,
  Send,
  AlertTriangle,
  RotateCcw,
  MessageSquare,
  Layers,
  Paperclip
} from 'lucide-react';
import { api } from '../api';
import { formatDate } from '../constants';

export default function SelfEvaluationTab({ selectedPeriod, currentUser, users = [] }) {
  const [selectedUser, setSelectedUser] = useState(currentUser?.id || '');
  const [evalData, setEvalData] = useState(null);
  const [criteriaList, setCriteriaList] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [activePart, setActivePart] = useState('part1'); // 'part1' (Phần I - 30đ) | 'part2' (Phần II - 70đ & Phản hồi Bước 4)
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Step 4 Evaluation Feedback Modal state
  const [feedbackTask, setFeedbackTask] = useState(null);
  const [evalFeedbackText, setEvalFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

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
      loadEvaluation();
    }
  }, [selectedPeriod, selectedUser]);

  async function loadEvaluation() {
    try {
      setLoading(true);
      const [res, tasksRes] = await Promise.all([
        api.getEvaluation(selectedPeriod, selectedUser),
        api.getAssignedTasks({ period_id: selectedPeriod, user_id: selectedUser })
      ]);
      setEvalData(res);
      setCriteriaList(res.criteria || []);
      setTasks(tasksRes || []);
    } catch (err) {
      console.error('Error loading self-evaluation:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitEvalFeedback(e) {
    e.preventDefault();
    if (!feedbackTask) return;
    if (!evalFeedbackText.trim()) {
      alert('Vui lòng nhập nội dung phản hồi đánh giá');
      return;
    }
    try {
      setSubmittingFeedback(true);
      await api.submitEvaluationFeedback(feedbackTask.id, {
        evaluation_feedback: evalFeedbackText.trim()
      });
      setSuccessMsg('Đã gửi phản hồi đánh giá đến Lãnh đạo thành công!');
      setTimeout(() => setSuccessMsg(''), 4000);
      setFeedbackTask(null);
      setEvalFeedbackText('');
      loadEvaluation();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmittingFeedback(false);
    }
  }

  function handleSetCriteria(index, satisfiedVal) {
    if (isLocked) return;
    const updated = [...criteriaList];
    updated[index].is_satisfied = satisfiedVal;
    updated[index].score = satisfiedVal === 1 ? updated[index].max_score : 0;
    setCriteriaList(updated);
  }

  function handleToggleCriteria(index) {
    if (isLocked) return;
    const updated = [...criteriaList];
    const nextVal = updated[index].is_satisfied === 1 ? 0 : 1;
    updated[index].is_satisfied = nextVal;
    updated[index].score = nextVal === 1 ? updated[index].max_score : 0;
    setCriteriaList(updated);
  }

  function handleSetAll(satisfied) {
    if (isLocked) return;
    const updated = criteriaList.map(c => ({
      ...c,
      is_satisfied: satisfied ? 1 : 0,
      score: satisfied ? c.max_score : 0
    }));
    setCriteriaList(updated);
  }

  function handleNoteChange(index, note) {
    if (isLocked) return;
    const updated = [...criteriaList];
    updated[index].note = note;
    setCriteriaList(updated);
  }

  async function handleSavePart1() {
    if (!evalData?.evaluation?.id) return;
    try {
      setSaving(true);
      setSuccessMsg('');
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
      setSuccessMsg('Đã lưu kết quả tự đánh giá Phần I thành công!');
      setTimeout(() => setSuccessMsg(''), 3500);
      loadEvaluation();
    } catch (err) {
      alert('Lỗi lưu tự đánh giá: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitSelfEval() {
    if (!evalData?.evaluation?.id) return;
    if (!window.confirm('XÁC NHẬN NỘP BẢN TỰ ĐÁNH GIÁ VÀ CHUYỂN BƯỚC THẨM ĐỊNH?\n\nSau khi nộp, quyền chỉnh sửa bản tự đánh giá của bạn sẽ được khóa để chuyển sang Cán bộ Quản lý / Lãnh đạo thẩm định. Bạn có chắc chắn muốn nộp?')) return;

    try {
      setSubmitting(true);
      // Save items first
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

      // Submit evaluation
      await api.submitSelfEvaluation({
        evaluation_id: evalData.evaluation.id
      });

      setSuccessMsg('Đã nộp bản tự đánh giá thành công! Quyền chỉnh sửa đã được khóa để chuyển sang bước CBQL chấm.');
      setTimeout(() => setSuccessMsg(''), 5000);
      loadEvaluation();
    } catch (err) {
      alert('Lỗi nộp bản tự đánh giá: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const evalStatus = evalData?.evaluation?.status || 'draft';
  const isLocked = evalStatus === 'submitted' || evalStatus === 'approved';
  const isReturned = evalStatus === 'returned';
  const returnReason = evalData?.evaluation?.return_reason;
  const returnedBy = evalData?.evaluation?.returned_by;

  const liveScore = criteriaList.reduce((sum, c) => sum + (c.is_satisfied === 1 ? c.max_score : 0), 0);
  const targetUser = users.find(u => u.id === selectedUser) || currentUser;
  const isAdminAccount = Boolean(evalData?.is_admin_account || targetUser?.role === 'admin');
  const isCbnv = (targetUser?.target_role === 'cbnv') || (targetUser?.role === 'cbnv' && targetUser?.target_role !== 'cbql');

  return (
    <div className="space-y-4">
      {/* 1. Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-slate-200">
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            className="w-6 h-6 rounded-full bg-red-700 text-white flex items-center justify-center font-bold text-[10px] shadow-xs hover:bg-red-800 transition shrink-0"
            title="Quay lại"
          >
            «
          </button>
          <div className="flex items-center gap-1 font-semibold truncate">
            <span className="text-slate-500">Trang chủ</span>
            <span className="text-slate-400">&gt;</span>
            <span className="text-red-700 font-bold">
              {activePart === 'part1' ? 'Tự đánh giá cuối quý (Phần I - 30 điểm)' : 'Nhiệm vụ KPI & Phản hồi Bước 4 (Phần II - 70 điểm)'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* User selector if manager */}
          {users.length > 1 && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-500 font-medium">Xem cán bộ:</span>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg text-xs font-bold p-1.5 focus:ring-2 focus:ring-red-500 max-w-[200px] truncate"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.role === 'cbql' ? 'CBQL' : u.role === 'admin' ? '⚙️ Admin Nghiệp vụ' : 'CBNV'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isAdminAccount && (
            <a
              href={api.getExportUrl(selectedPeriod, selectedUser)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-700 text-red-700 bg-white hover:bg-red-50 text-xs font-bold transition shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải {isCbnv ? 'Mẫu 01-B' : 'Mẫu 01-A'}</span>
            </a>
          )}

          {/* Action buttons: Lock Badge if submitted/approved; Save & Submit buttons if draft/returned */}
          {isAdminAccount ? (
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold shadow-2xs">
              <span>⚙️ Tài khoản Nghiệp vụ (Không đánh giá)</span>
            </div>
          ) : isLocked ? (
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold shadow-2xs">
              <Lock className="w-3.5 h-3.5 text-amber-700" />
              <span>Đã nộp tự đánh giá (Đang khóa)</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSavePart1}
                disabled={saving || submitting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-xs font-bold transition shadow-2xs cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Đang lưu...' : 'Lưu tạm'}</span>
              </button>

              <button
                type="button"
                onClick={handleSubmitSelfEval}
                disabled={saving || submitting}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{submitting ? 'Đang gửi...' : (isReturned ? 'Gửi lại bản tự đánh giá' : 'Nộp tự đánh giá')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* BANNER CHO TÀI KHOẢN ADMIN NGHIỆP VỤ */}
      {isAdminAccount && (
        <div className="bg-slate-50 border-2 border-slate-300 text-slate-800 p-4 rounded-xl shadow-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <span className="font-bold text-sm text-slate-900">
              ⚙️ Tài khoản Quản trị viên là tài khoản nghiệp vụ kỹ thuật
            </span>
            <p className="text-slate-600">
              Theo quy định, tài khoản Quản trị viên (Admin) chỉ thực hiện các chức năng quản trị hệ thống, danh mục, phân quyền và xuất báo cáo. Tài khoản này <strong>không áp dụng KPI cá nhân</strong>, không tham gia tự đánh giá (Mẫu 01) và không xếp loại thi đua.
            </p>
            {users.some(u => u.role !== 'admin') && (
              <p className="text-indigo-700 font-medium pt-1">
                👉 Vui lòng sử dụng hộp chọn <strong>"Xem cán bộ"</strong> ở trên để xem hồ sơ và biểu mẫu tự đánh giá của cán bộ, nhân viên trong đơn vị.
              </p>
            )}
          </div>
        </div>
      )}

      {/* BANNER 1: THÔNG BÁO BỊ TRẢ VỀ YÊU CẦU THỰC HIỆN LẠI */}
      {isReturned && (
        <div className="bg-amber-50 border-2 border-amber-400 text-amber-950 p-4 rounded-xl shadow-xs animate-in fade-in flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1.5 flex-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-amber-950">
                ⚠️ Bản tự đánh giá đã bị Lãnh đạo trả về yêu cầu thực hiện lại
              </span>
              {returnedBy && (
                <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                  Người trả về: {returnedBy}
                </span>
              )}
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-amber-200 font-medium text-slate-800">
              <strong className="text-amber-900">Lý do yêu cầu làm lại:</strong> {returnReason || 'Vui lòng rà soát lại các tiêu chuẩn đánh giá.'}
            </div>
            <p className="text-[11px] text-amber-800">
              Hệ thống đã mở khóa quyền tự đánh giá. Bạn hãy rà soát, điều chỉnh điểm Đạt/Không đạt ở bảng dưới, sau đó bấm <strong>"Gửi lại bản tự đánh giá"</strong>.
            </p>
          </div>
        </div>
      )}

      {/* BANNER 2: THÔNG BÁO ĐÃ KHÓA KHI ĐÃ NỘP HOẶC ĐÃ DUYỆT */}
      {isLocked && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded-xl text-xs flex items-center gap-2.5 shadow-2xs">
          <Lock className="w-4 h-4 text-blue-700 shrink-0" />
          <div className="flex-1">
            <strong>Trạng thái: Đã nộp bản tự đánh giá & Khóa quyền chỉnh sửa.</strong> Hồ sơ đã được chuyển sang Bước 4 để Cán bộ Quản lý và Lãnh đạo cơ quan thẩm định. Nếu cần chỉnh sửa, vui lòng liên hệ Lãnh đạo để được <em>Trả về yêu cầu thực hiện lại</em>.
          </div>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        </div>
      )}

      {/* Sub-tab Switcher: Phần I vs Phần II */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          type="button"
          onClick={() => setActivePart('part1')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activePart === 'part1'
              ? 'border-red-700 text-red-700 bg-red-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Star className="w-4 h-4" />
          <span>Phần I: Tiêu chuẩn chung (30 điểm)</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-100 text-red-800">
            {liveScore}/30đ
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActivePart('part2')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activePart === 'part2'
              ? 'border-indigo-700 text-indigo-800 bg-indigo-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Phần II: Nhiệm vụ KPI & Phản hồi Bước 4 (70 điểm)</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-100 text-indigo-800">
            {evalData?.evaluation?.part2_score || 0}/70đ
          </span>
          {tasks.some(t => t.evaluation_feedback) && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
              💬 Có phản hồi
            </span>
          )}
        </button>
      </div>

      {activePart === 'part1' && (
        <>
          {/* 2. Top Summary Banner */}
          <div className="bg-gradient-to-r from-red-800 to-rose-900 rounded-xl p-5 text-white shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-white/20 text-white text-[11px] font-medium px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              {isCbnv ? 'Áp dụng Mẫu 01-B (CBNV)' : 'Áp dụng Mẫu 01-A (CBQL)'}
            </span>
            <span className="text-xs text-red-200">
              Quy định số 366-QĐ/TW & Hướng dẫn số 06-HD/BTCTU
            </span>
          </div>
          <h2 className="text-lg font-bold mt-1.5">
            Bản Tự Đánh Giá Tiêu Chuẩn Chính Trị, Đạo Đức & Tác Phong
          </h2>
          <p className="text-xs text-red-100/90 mt-0.5">
            Cán bộ tự chuyển đổi trạng thái Đạt (hưởng trọn điểm chuẩn) hoặc Không đạt (0 điểm) theo quy định.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-xs rounded-xl p-3.5 border border-white/20 text-center shrink-0 min-w-[160px]">
          <span className="text-[10px] font-medium text-red-200 uppercase tracking-wider block">
            Điểm tự chấm Phần I:
          </span>
          <div className="text-3xl font-bold text-amber-300 mt-0.5">
            {liveScore} <span className="text-sm font-normal text-white">/ 30 đ</span>
          </div>
          <span className="text-[10px] text-red-200 block mt-0.5">
            {criteriaList.filter(c => c.is_satisfied === 1).length} / {criteriaList.length} tiêu chuẩn đạt
          </span>
        </div>
      </div>

      {/* 3. Criteria Table Controls & List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        {/* Table Header Controls */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="text-xs font-bold text-slate-700 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
            <span>Danh mục 17 tiêu chuẩn đánh giá chính trị, tư tưởng, đạo đức, tác phong</span>
          </div>

          {/* Quick bulk action buttons (only if not locked) */}
          {!isLocked && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSetAll(true)}
                className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 transition shadow-2xs flex items-center gap-1.5"
                title="Đánh giá tất cả tiêu chuẩn đều Đạt"
              >
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Tất cả Đạt (30đ)</span>
              </button>
              <button
                type="button"
                onClick={() => handleSetAll(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 transition shadow-2xs flex items-center gap-1.5"
                title="Đặt lại tất cả tiêu chuẩn thành Không đạt"
              >
                <X className="w-3.5 h-3.5 text-rose-600" />
                <span>Đặt lại (0đ)</span>
              </button>
            </div>
          )}
        </div>

        {/* Mobile View: Cards for each criterion (< md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {loading ? (
            <div className="text-center py-12 text-slate-400 italic text-sm">
              Đang tải tiêu chí đánh giá...
            </div>
          ) : criteriaList.length === 0 ? (
            <div className="text-center py-12 text-slate-400 italic text-sm">
              Không có tiêu chí đánh giá cho đối tượng này.
            </div>
          ) : (
            criteriaList.map((c, idx) => {
              const isSat = c.is_satisfied === 1;
              return (
                <div key={c.id} className={`p-4 space-y-2.5 transition-colors ${!isSat ? 'bg-rose-50/50' : 'bg-white'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {c.code}
                    </span>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ${
                      isSat ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-rose-100 text-rose-800 border border-rose-300'
                    }`}>
                      {isSat ? `Đạt: ${c.max_score}đ` : 'Không đạt: 0đ'}
                    </span>
                  </div>

                  <div className="font-semibold text-slate-900 text-sm leading-snug">
                    {c.title}
                  </div>

                  {/* Touch-Friendly Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => handleSetCriteria(idx, 1)}
                      className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all shadow-2xs ${
                        isSat
                          ? 'bg-emerald-600 text-white ring-2 ring-emerald-400/40'
                          : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                      } ${isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer active:scale-95'}`}
                    >
                      <Check className="w-4 h-4" />
                      <span>Đạt ({c.max_score}đ)</span>
                    </button>

                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => handleSetCriteria(idx, 0)}
                      className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all shadow-2xs ${
                        !isSat
                          ? 'bg-rose-600 text-white ring-2 ring-rose-400/40'
                          : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                      } ${isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer active:scale-95'}`}
                    >
                      <X className="w-4 h-4" />
                      <span>Không đạt (0đ)</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop View: Full Comparison Table (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50/90 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3.5 w-16 text-center">Mã</th>
                <th className="px-4 py-3.5 min-w-[380px]">Nội dung tiêu chuẩn, tiêu chí đánh giá</th>
                <th className="px-4 py-3.5 w-32 text-center">Điểm tối đa</th>
                <th className="px-4 py-3.5 w-56 text-center">Tự đánh giá (Đạt / Không đạt)</th>
                <th className="px-4 py-3.5 w-36 text-center">Điểm tương ứng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="5" className="text-center py-12 text-slate-400 italic text-sm">
                    Đang tải tiêu chí đánh giá...
                  </td>
                </tr>
              ) : criteriaList.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-12 text-slate-400 italic text-sm">
                    Không có tiêu chí đánh giá cho đối tượng này.
                  </td>
                </tr>
              ) : (
                criteriaList.map((c, idx) => {
                  const isSat = c.is_satisfied === 1;
                  return (
                    <tr 
                      key={c.id} 
                      className={`hover:bg-slate-50/80 transition-colors ${!isSat ? 'bg-rose-50/40' : ''}`}
                    >
                      {/* Mã */}
                      <td className="px-4 py-3.5 text-center font-bold text-slate-500 font-mono">
                        {c.code}
                      </td>

                      {/* Tiêu chí */}
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900 leading-snug text-sm">
                          {c.title}
                        </div>
                      </td>

                      {/* Điểm max */}
                      <td className="px-4 py-3.5 text-center font-semibold text-slate-600">
                        {c.max_score} đ
                      </td>

                      {/* Nút chuyển đổi Đạt / Không đạt */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200 shadow-2xs">
                          <button
                            type="button"
                            disabled={isLocked}
                            onClick={() => handleSetCriteria(idx, 1)}
                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              isSat
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-emerald-700 hover:bg-white/60'
                            } ${isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                            title={isLocked ? 'Bản tự đánh giá đã nộp/khóa' : 'Đánh giá Đạt tiêu chuẩn này'}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Đạt</span>
                          </button>
                          <button
                            type="button"
                            disabled={isLocked}
                            onClick={() => handleSetCriteria(idx, 0)}
                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              !isSat
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-rose-700 hover:bg-white/60'
                            } ${isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                            title={isLocked ? 'Bản tự đánh giá đã nộp/khóa' : 'Đánh giá Không đạt tiêu chuẩn này'}
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Không đạt</span>
                          </button>
                        </div>
                      </td>

                      {/* Điểm tương ứng */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <span className={`px-3.5 py-1 rounded-full text-sm font-semibold inline-flex items-center gap-1 shadow-2xs ${
                            isSat 
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                              : 'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}>
                            {isSat ? `${c.max_score} đ` : '0 đ'}
                          </span>
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

      {/* Floating Action Bar on Mobile for Instant Submit */}
      {!isLocked && (
        <div className="md:hidden sticky bottom-3 z-30 bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-slate-200 flex items-center justify-between gap-2 animate-in fade-in slide-in-from-bottom-2">
          <div className="text-xs">
            <span className="text-slate-500 block text-[10px]">Tự chấm:</span>
            <span className="font-bold text-red-700 text-sm">{liveScore} / 30 đ</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSavePart1}
              disabled={saving || submitting}
              className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold shadow-2xs"
            >
              <Save className="w-3.5 h-3.5 inline mr-1" />
              <span>{saving ? 'Lưu...' : 'Lưu tạm'}</span>
            </button>
            <button
              type="button"
              onClick={handleSubmitSelfEval}
              disabled={saving || submitting}
              className="px-4 py-2 rounded-xl bg-red-700 text-white text-xs font-bold shadow-xs"
            >
              <Send className="w-3.5 h-3.5 inline mr-1" />
              <span>{submitting ? 'Gửi...' : 'Nộp đánh giá'}</span>
            </button>
          </div>
        </div>
      )}
        </>
      )}

      {/* PART II: NHIỆM VỤ KPI & PHẢN HỒI ĐÁNH GIÁ (BƯỚC 4 V6) */}
      {activePart === 'part2' && (
        <div className="space-y-4">
          {/* Top Summary Banner for Part II */}
          <div className="bg-gradient-to-r from-slate-800 to-indigo-950 rounded-xl p-5 text-white shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-white/20 text-white text-[11px] font-medium px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Bước 4: Cán bộ xem kết quả đánh giá cuối kỳ
                </span>
                <span className="text-xs text-indigo-200">
                  Phụ lục 5 Hướng dẫn số 06-HD/BTCTU
                </span>
              </div>
              <h2 className="text-lg font-bold mt-1.5">
                Bảng Thẩm Định Điểm Nhiệm Vụ KPI & Phản Hồi Đánh Giá (Mục B - 70 điểm)
              </h2>
              <p className="text-xs text-indigo-100/90 mt-0.5">
                Cán bộ xem chi tiết điểm số do Lãnh đạo thẩm định. Nếu không đồng ý với kết quả, bấm <b>"Phản hồi đánh giá"</b> để Lãnh đạo xem xét sửa đánh giá.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-xs rounded-xl p-3.5 border border-white/20 text-center shrink-0 min-w-[160px]">
              <span className="text-[10px] font-medium text-indigo-200 uppercase tracking-wider block">
                Tổng điểm Phần II đạt được:
              </span>
              <div className="text-3xl font-bold text-amber-300 mt-0.5">
                {evalData?.evaluation?.part2_score || 0} <span className="text-sm font-normal text-white">/ 70 đ</span>
              </div>
              <span className="text-[10px] text-indigo-200 block mt-0.5">
                {tasks.filter(t => t.status === 'approved').length} / {tasks.length} nhiệm vụ đã duyệt
              </span>
            </div>
          </div>

          {/* Task List Table / Cards */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                <span>Danh sách nhiệm vụ KPI & Ý kiến nhận xét của Lãnh đạo</span>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                Tổng số: <b className="text-slate-800">{tasks.length}</b> công việc
              </span>
            </div>

            {tasks.length === 0 ? (
              <div className="py-12 text-center text-slate-400 italic text-sm">
                Chưa có nhiệm vụ nào được ghi nhận trong kỳ đánh giá này.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {tasks.map((task, idx) => {
                  const isApproved = task.status === 'approved';
                  return (
                    <div key={task.id} className="p-4 sm:p-5 hover:bg-slate-50/70 transition-colors space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-1 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-400 text-xs">#{idx + 1}</span>
                            <span className="font-semibold text-slate-900 text-sm">{task.task_name}</span>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              isApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {isApproved ? '✓ Đã thẩm định' : '● Chờ thẩm định'}
                            </span>
                            {task.evaluation_feedback && (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                                💬 Đã gửi phản hồi
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                            <span>Hạn chót: <b>{formatDate(task.deadline)}</b></span>
                            {task.actual_finish_date && (
                              <span>Hoàn thành: <b>{formatDate(task.actual_finish_date)}</b></span>
                            )}
                            <span>Sản phẩm: <b className="text-slate-700">{task.output_result}</b></span>
                          </div>
                        </div>

                        {/* Scores badge & Action */}
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
                            <span className="text-[10px] text-slate-400 block">Điểm quy đổi</span>
                            <span className="font-bold text-emerald-700 text-sm">
                              {Number(Number(task.converted_score || 0).toFixed(2))} <span className="text-xs text-slate-400 font-normal">/ {Number(Number(task.max_converted_score || (task.standard_score * task.difficulty_weight)).toFixed(2))}đ</span>
                            </span>
                          </div>

                          {isApproved && (
                            <button
                              type="button"
                              onClick={() => {
                                setFeedbackTask(task);
                                setEvalFeedbackText(task.evaluation_feedback || '');
                              }}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                                task.evaluation_feedback
                                  ? 'bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-300'
                                  : 'bg-purple-700 hover:bg-purple-800 text-white'
                              }`}
                              title="Phản hồi ý kiến về kết quả chấm điểm của Lãnh đạo"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>{task.evaluation_feedback ? 'Sửa phản hồi' : 'Phản hồi đánh giá'}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Details row: Progress, Quality, Scores */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                          <span className="text-slate-500">Điểm chuẩn:</span> <b>{task.standard_score}đ</b> • <span className="text-slate-500">HSĐK:</span> <b>{task.difficulty_weight}</b>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                          <span className="text-slate-500">Tiến độ:</span> <b>{Math.round((task.progress_pct || 1) * 100)}%</b> • <span className="text-slate-500">Chất lượng:</span> <b>{Math.round((task.quality_pct || 1) * 100)}%</b>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                          <span className="text-slate-500">Điểm thực hiện:</span> <b>{Number(Number(task.execution_score || 0).toFixed(2))}đ</b>
                        </div>
                      </div>

                      {task.cbql_comment && (
                        <div className="p-2.5 bg-amber-50/70 rounded-lg border border-amber-200 text-xs">
                          <strong className="text-amber-900">Ý kiến nhận xét của Lãnh đạo: </strong>
                          <span className="text-slate-800 italic">"{task.cbql_comment}"</span>
                        </div>
                      )}

                      {task.evaluation_feedback && (
                        <div className="p-2.5 bg-purple-50 rounded-lg border border-purple-200 text-xs space-y-1">
                          <div className="font-bold text-purple-800 flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                            <span>Ý kiến phản hồi của Cán bộ (Bước 4):</span>
                          </div>
                          <div className="p-2 bg-white rounded-md border border-purple-100 text-slate-800 italic">
                            "{task.evaluation_feedback}"
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* EVALUATION FEEDBACK MODAL (Bước 4 V6) */}
      {feedbackTask && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-[95%] sm:w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150">
            
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="min-w-0 flex-1 pr-2">
                <div className="flex items-center gap-1.5 text-purple-700 text-xs font-bold uppercase tracking-wider mb-1">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Bước 4: Phản hồi kết quả đánh giá cuối kỳ</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 truncate">
                  Phản hồi kết quả chấm điểm của Lãnh đạo
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{feedbackTask.task_name}</p>
              </div>
              <button 
                type="button"
                onClick={() => setFeedbackTask(null)}
                className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Manager's current grade summary */}
            <div className="bg-purple-50/70 p-3.5 rounded-xl border border-purple-200 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Điểm quy đổi đạt được:</span>
                <span className="font-bold text-purple-900 text-sm">
                  {Number(Number(feedbackTask.converted_score || 0).toFixed(2))} / {Number(Number(feedbackTask.max_converted_score || (feedbackTask.standard_score * feedbackTask.difficulty_weight)).toFixed(2))} đ
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1 border-t border-purple-100">
                <div>Tiến độ: <b>{Math.round((feedbackTask.progress_pct || 1) * 100)}%</b></div>
                <div>Chất lượng: <b>{Math.round((feedbackTask.quality_pct || 1) * 100)}%</b></div>
              </div>
              {feedbackTask.cbql_comment && (
                <div className="pt-1 border-t border-purple-100">
                  <span className="font-semibold text-slate-700">Nhận xét của Lãnh đạo: </span>
                  <span className="text-slate-900 italic">"{feedbackTask.cbql_comment}"</span>
                </div>
              )}
            </div>

            <form onSubmit={handleSubmitEvalFeedback} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nội dung phản hồi / kiến nghị giải trình của Cán bộ *
                </label>
                <textarea
                  rows={4}
                  required
                  value={evalFeedbackText}
                  onChange={(e) => setEvalFeedbackText(e.target.value)}
                  placeholder="Nhập lý do không đồng tình hoặc căn cứ thực tế giải trình để Lãnh đạo xem xét điều chỉnh điểm đánh giá..."
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  💡 Sau khi bạn gửi phản hồi, Lãnh đạo sẽ nhận được thông báo tại màn hình thẩm định để xem xét và thực hiện <strong>"Sửa đánh giá"</strong> theo quy định.
                </p>
              </div>

              <div className="pt-3 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setFeedbackTask(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingFeedback}
                  className="px-5 py-2 text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white rounded-lg shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submittingFeedback ? 'Đang gửi...' : 'Gửi phản hồi đánh giá'}</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
    </div>
  );
}