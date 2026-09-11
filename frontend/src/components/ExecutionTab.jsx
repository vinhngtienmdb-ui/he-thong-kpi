import React, { useEffect, useState } from 'react';
import { 
  CheckSquare, 
  Upload, 
  FileText, 
  Clock, 
  Calendar, 
  FileCheck2, 
  Paperclip,
  CheckCircle2,
  AlertTriangle,
  Send,
  Lock,
  RotateCcw,
  MessageSquare,
  X,
  Download,
  Check,
  Info,
  RefreshCw,
  Layers,
  Filter
} from 'lucide-react';
import { api } from '../api';
import { formatDate, toInputDateFormat, parseDateOnly } from '../constants';

export function compareTasksByAxisAndDeadline(a, b) {
  // 1. Ưu tiên 1: Sắp xếp theo Trục (TRUC_1 -> TRUC_6 -> Khác)
  const getAxisOrder = (code) => {
    if (!code) return 99;
    const m = String(code).match(/TRUC_(\d+)/i);
    if (m) return parseInt(m[1], 10);
    return 98;
  };

  const orderA = getAxisOrder(a.axis_code);
  const orderB = getAxisOrder(b.axis_code);
  if (orderA !== orderB) {
    return orderA - orderB;
  }

  // 2. Ưu tiên 2: Sắp xếp theo ngày đến hạn (Sắp đến hạn trước - Deadline ASC)
  const dlA = a.deadline || '9999-12-31';
  const dlB = b.deadline || '9999-12-31';
  if (dlA !== dlB) {
    return dlA.localeCompare(dlB);
  }

  // 3. Phụ trợ: Nếu cùng hạn chót thì sắp xếp theo tên công việc
  return (a.task_name || '').localeCompare(b.task_name || '', 'vi');
}

export default function ExecutionTab({ selectedPeriod, currentUser, axes = [] }) {
  const [tasks, setTasks] = useState([]);
  const [selectedAxisFilter, setSelectedAxisFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState(null); // Task currently opening evidence modal

  // Evaluation feedback modal state (Bước 4 V6)
  const [feedbackTask, setFeedbackTask] = useState(null);
  const [evalFeedbackText, setEvalFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  // Subordinate evidences inheritance (Lấy file kết quả từ cấp dưới cho cùng nhiệm vụ)
  const [subordinateEvidences, setSubordinateEvidences] = useState([]);
  const [loadingSubEvidences, setLoadingSubEvidences] = useState(false);
  const [inheritedEvidence, setInheritedEvidence] = useState(null);

  // Modal form state
  const [finishDate, setFinishDate] = useState(new Date().toISOString().split('T')[0]);
  const [evidenceText, setEvidenceText] = useState('');
  const [detailedResultNote, setDetailedResultNote] = useState('');
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [quantityPct, setQuantityPct] = useState(1.0);
  const [selfQualityPct, setSelfQualityPct] = useState(1.0);
  const [submitting, setSubmitting] = useState(false);

  // Extension Modal State (CBNV xin gia hạn tiến độ - chỉ khi việc đã đến hạn hoặc quá hạn)
  const [extensionModalTask, setExtensionModalTask] = useState(null);
  const [requestedDeadline, setRequestedDeadline] = useState('');
  const [extensionReason, setExtensionReason] = useState('');
  const [isSubmittingExtension, setIsSubmittingExtension] = useState(false);

  const todayStr = React.useMemo(() => {
    return new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
  }, []);

  function isTaskDueOrOverdue(task) {
    if (!task || !task.deadline || task.status === 'approved') return false;
    return task.deadline <= todayStr;
  }

  function openExtensionModal(task) {
    if (!isTaskDueOrOverdue(task)) {
      alert('Theo quy định, chỉ được gửi yêu cầu xin gia hạn khi công việc đã đến hạn hoặc quá hạn!');
      return;
    }
    setExtensionModalTask(task);
    const base = new Date();
    base.setDate(base.getDate() + 7);
    setRequestedDeadline(toInputDateFormat(base.toISOString().split('T')[0]));
    setExtensionReason('');
  }

  async function handleSubmitExtension(e) {
    if (e) e.preventDefault();
    if (!extensionModalTask) return;
    if (!requestedDeadline) {
      alert('Vui lòng chọn thời hạn hoàn thành mới đề xuất!');
      return;
    }
    if (requestedDeadline <= extensionModalTask.deadline) {
      alert('Thời hạn mới đề xuất phải sau thời hạn hiện tại của nhiệm vụ!');
      return;
    }
    if (!extensionReason.trim()) {
      alert('Vui lòng nhập lý do xin gia hạn công việc!');
      return;
    }

    try {
      setIsSubmittingExtension(true);
      const res = await api.requestTaskExtension(extensionModalTask.id, {
        requested_deadline: requestedDeadline,
        reason: extensionReason.trim()
      });
      alert(res.message || 'Đã gửi yêu cầu xin gia hạn tới Lãnh đạo xem xét thành công!');
      setExtensionModalTask(null);
      loadMyTasks();
    } catch (err) {
      alert('Lỗi gửi yêu cầu gia hạn: ' + (err.message || err));
    } finally {
      setIsSubmittingExtension(false);
    }
  }

  async function loadMyTasks() {
    if (!currentUser) return;
    try {
      setLoading(true);
      const data = await api.getAssignedTasks({
        period_id: selectedPeriod,
        user_id: currentUser.id
      });
      const sorted = (data || []).slice().sort(compareTasksByAxisAndDeadline);
      setTasks(sorted);
    } catch (err) {
      console.error('Error fetching my tasks:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMyTasks();

    // Tự động đồng bộ khi người dùng quay lại tab trình duyệt
    const handleFocus = () => loadMyTasks();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadMyTasks();
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    // Chu kỳ tự động đồng bộ ngầm định kỳ 30 giây
    const timer = setInterval(() => {
      loadMyTasks();
    }, 30000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(timer);
    };
  }, [selectedPeriod, currentUser]);

  function openEvidenceModal(task) {
    setActiveTask(task);
    setFinishDate(task.actual_finish_date || new Date().toISOString().split('T')[0]);
    setEvidenceText(task.evidence_text || '');
    setDetailedResultNote(task.detailed_result_note || '');
    setQuantityPct(task.quantity_pct !== undefined ? task.quantity_pct : 1.0);
    setSelfQualityPct(task.quality_pct !== undefined ? task.quality_pct : 1.0);
    setEvidenceFile(null);
    setInheritedEvidence(null);
    loadSubordinateEvidences(task.id);
  }

  async function loadSubordinateEvidences(taskId) {
    try {
      setLoadingSubEvidences(true);
      const res = await api.getSubordinateEvidences(taskId);
      setSubordinateEvidences(res || []);
    } catch (err) {
      console.error('Error fetching subordinate evidences:', err);
      setSubordinateEvidences([]);
    } finally {
      setLoadingSubEvidences(false);
    }
  }

  function handleSelectSubordinateEvidence(sub) {
    setInheritedEvidence(sub);
    setEvidenceFile(null);
    if (sub.actual_finish_date) {
      setFinishDate(sub.actual_finish_date);
    }
    if (!evidenceText.trim()) {
      setEvidenceText(`Kế thừa sản phẩm / tệp kết quả từ cán bộ ${sub.user_name}: ${sub.evidence_text || sub.task_name}`);
    }
  }

  async function handleSubmitEvidence(e) {
    e.preventDefault();
    if (!activeTask) return;

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('actual_finish_date', finishDate);
      formData.append('evidence_text', evidenceText);
      formData.append('detailed_result_note', detailedResultNote);
      formData.append('quantity_pct', quantityPct);
      formData.append('self_quality_pct', selfQualityPct);
      if (evidenceFile) {
        formData.append('evidence_file', evidenceFile);
      } else if (inheritedEvidence) {
        formData.append('existing_file_url', inheritedEvidence.evidence_file_url);
        formData.append('existing_file_name', inheritedEvidence.evidence_file_name);
        formData.append('inherited_from_task_id', inheritedEvidence.task_id);
        formData.append('inherited_from_user_name', inheritedEvidence.user_name);
      }

      const res = await api.submitEvidence(activeTask.id, formData);
      alert('Đã cập nhật kết quả và nộp minh chứng thành công! Tiến độ đạt: ' + Math.round((res.progressPct || 1) * 100) + '%');
      setActiveTask(null);
      loadMyTasks();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
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
      alert('Đã gửi ý kiến phản hồi đánh giá đến Lãnh đạo thành công!');
      setFeedbackTask(null);
      setEvalFeedbackText('');
      loadMyTasks();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmittingFeedback(false);
    }
  }

  // Helper to preview progress % based on dates (Tính theo ngày làm việc, trừ T7, CN)
  function getPreviewProgress(deadlineStr, finishStr) {
    if (!finishStr) return { pct: 1.0, text: 'Hoàn thành đúng hoặc trước hạn: 100%', lateDays: 0 };
    const d = parseDateOnly(deadlineStr);
    const f = parseDateOnly(finishStr);
    if (!d || !f || f <= d) {
      return { pct: 1.0, text: 'Hoàn thành đúng hoặc trước hạn: 100%', lateDays: 0 };
    }

    let lateDays = 0;
    let cur = new Date(d);
    cur.setDate(cur.getDate() + 1);
    while (cur <= f) {
      const day = cur.getDay();
      if (day !== 0 && day !== 6) lateDays++;
      cur.setDate(cur.getDate() + 1);
    }

    if (lateDays <= 3) return { pct: 0.8, text: `Hoàn thành chậm ${lateDays} ngày làm việc: 80%`, lateDays };
    if (lateDays <= 5) return { pct: 0.6, text: `Hoàn thành chậm ${lateDays} ngày làm việc: 60%`, lateDays };
    return { pct: 0.0, text: `Hoàn thành chậm ${lateDays} ngày làm việc (> 5 ngày): 0%`, lateDays };
  }

  const defaultAxesList = [
    { code: 'TRUC_1', name: 'Trục 1 - Thực hiện mục tiêu phát triển kinh tế - xã hội và nhiệm vụ chính trị được giao', shortName: 'Trục 1' },
    { code: 'TRUC_2', name: 'Trục 2 - Hoàn thiện thể chế, đẩy mạnh phân cấp, phân quyền gắn với kiểm tra, giám sát', shortName: 'Trục 2' },
    { code: 'TRUC_3', name: 'Trục 3 - Thúc đẩy phát triển khoa học, công nghệ, đổi mới sáng tạo và chuyển đổi số', shortName: 'Trục 3' },
    { code: 'TRUC_4', name: 'Trục 4 - Xây dựng Đảng và hệ thống chính trị trong sạch, vững mạnh; giữ gìn đoàn kết, thống nhất nội bộ', shortName: 'Trục 4' },
    { code: 'TRUC_5', name: 'Trục 5 - Phát triển văn hóa, con người, bảo đảm an sinh xã hội, nâng cao đời sống nhân dân', shortName: 'Trục 5' },
    { code: 'TRUC_6', name: 'Trục 6 - Củng cố quốc phòng, an ninh, giữ vững ổn định chính trị - xã hội', shortName: 'Trục 6' }
  ];
  const effectiveAxesList = (axes && axes.length > 0) ? axes.map(a => ({
    ...a,
    shortName: a.name.includes(' - ') ? a.name.split(' - ')[0] : a.code
  })) : defaultAxesList;

  const filteredTasks = tasks.filter(t => {
    if (selectedAxisFilter !== 'ALL' && (t.axis_code || 'TRUC_1') !== selectedAxisFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>Nhiệm vụ của tôi & Cập nhật Minh chứng</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 font-bold border border-red-200">
              Bước 2
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cán bộ: <b className="text-slate-800">{currentUser?.full_name}</b> • Cập nhật ngày hoàn thành thực tế, đính kèm văn bản minh chứng và tự đánh giá
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500">
            Tổng số công việc: <span className="font-bold text-red-700">{tasks.length}</span>
          </div>
          <button
            type="button"
            onClick={loadMyTasks}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold border border-slate-300 transition cursor-pointer active:scale-95 shadow-2xs"
            title="Đồng bộ dữ liệu mới nhất từ máy chủ (tránh sót công việc bị điều chỉnh/xóa)"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-red-600' : 'text-slate-600'}`} />
            <span>Đồng bộ</span>
          </button>
        </div>
      </div>

      {/* Axis Filter Pills */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mr-1">
          <Filter className="w-3.5 h-3.5 text-red-700" />
          <span>Lọc theo trục:</span>
        </div>
        <button
          type="button"
          onClick={() => setSelectedAxisFilter('ALL')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
            selectedAxisFilter === 'ALL'
              ? 'bg-red-700 text-white shadow-xs'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
          }`}
        >
          Tất cả các trục ({tasks.length})
        </button>
        {effectiveAxesList.map(ax => {
          const count = tasks.filter(t => (t.axis_code || 'TRUC_1') === ax.code).length;
          return (
            <button
              key={ax.code}
              type="button"
              onClick={() => setSelectedAxisFilter(ax.code)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                selectedAxisFilter === ax.code
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
              }`}
            >
              <span>{ax.shortName || ax.code.replace('_', ' ')}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                selectedAxisFilter === ax.code ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-800'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Notice Banner: Thẩm quyền chấm điểm */}
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-slate-50 border border-blue-200 p-4 rounded-xl flex items-start gap-3 text-blue-900 shadow-2xs">
        <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
          <Info className="w-4 h-4" />
        </div>
        <div className="text-xs space-y-1">
          <div className="font-bold text-blue-950 text-sm flex items-center gap-1.5">
            <span>Lưu ý nguyên tắc thẩm định & chấm điểm hoàn thành công việc:</span>
          </div>
          <p className="text-blue-900 leading-relaxed">
            • <strong>Nhiệm vụ do cá nhân tự đăng ký:</strong> Mặc định người thẩm định và chấm điểm là <strong>Lãnh đạo đơn vị</strong> (Trưởng phòng/ban hoặc Lãnh đạo phụ trách).
          </p>
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-10 text-slate-500">Đang tải nhiệm vụ...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-xl border border-slate-200 text-slate-500">
            <CheckSquare className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="font-medium text-slate-700">Chưa có công việc nào trong danh mục đã chọn.</p>
            <p className="text-xs text-slate-400 mt-1">Hãy kiểm tra bộ lọc trục hoặc chuyển sang tab "Giao & Đăng ký việc" để đăng ký nhiệm vụ.</p>
          </div>
        ) : (
          filteredTasks.map((task, idx) => {
            const isApproved = task.status === 'approved';
            const isSubmitted = task.status === 'submitted';
            const isPending = task.status === 'pending_approval';

            const axisObj = axes.find(a => a.code === task.axis_code);
            const prevTask = idx > 0 ? filteredTasks[idx - 1] : null;
            const isFirstInAxis = selectedAxisFilter === 'ALL' && (!prevTask || prevTask.axis_code !== task.axis_code);
            const tasksInCurrentAxis = tasks.filter(t => (t.axis_code || 'TRUC_1') === (task.axis_code || 'TRUC_1')).length;

            return (
              <React.Fragment key={task.id}>
                {isFirstInAxis && (
                  <div className="flex items-center justify-between gap-2 pt-5 pb-2 border-b-2 border-red-700/80 mb-1 mt-3 first:mt-0">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-700 shadow-2xs" />
                      <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-900">
                        {axisObj ? axisObj.name : `Trục ${task.axis_code || '1'}`}
                      </h3>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                        {tasksInCurrentAxis} nhiệm vụ
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 italic hidden sm:inline">
                      Ưu tiên: Sắp đến hạn trước
                    </span>
                  </div>
                )}
                <div 
                  className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4"
                >
                {/* Left info */}
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-sm bg-slate-100 text-slate-700 border border-slate-200">
                      {axisObj ? axisObj.name.split(' - ')[0] : 'Trục 1'}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      task.task_type === 'Đột xuất' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {task.task_type} ({task.standard_score}đ)
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      task.origin === 'assigned' ? 'bg-indigo-100 text-indigo-800' : 'bg-orange-100 text-orange-800'
                    }`}>
                      {task.origin === 'assigned' 
                        ? (task.assigner_name ? `Lãnh đạo giao (${task.assigner_name})` : 'Lãnh đạo giao')
                        : 'Tự đăng ký'}
                    </span>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 inline-flex items-center gap-1">
                      <span>👤 Người chấm điểm:</span>
                      <strong className="text-indigo-900">
                        {task.origin === 'assigned' 
                          ? (task.assigner_name ? `Người giao (${task.assigner_name})` : 'Lãnh đạo giao việc')
                          : `Lãnh đạo đơn vị${task.grader_name && task.grader_name !== 'Lãnh đạo đơn vị' ? ` (${task.grader_name})` : ''}`}
                      </strong>
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      HSĐK: {Math.round(task.difficulty_weight * 100)}%
                    </span>
                    {task.is_returned === 1 ? (
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-rose-600" />
                        ⚠️ Bị trả về: Yêu cầu nộp lại minh chứng
                      </span>
                    ) : (
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        isApproved ? 'bg-emerald-100 text-emerald-800' :
                        isSubmitted ? 'bg-blue-100 text-blue-800' :
                        isPending ? 'bg-amber-100 text-amber-800' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {isApproved ? '✓ Đã thẩm định & Chấm điểm (Khóa)' :
                         isSubmitted ? '🔒 Đã nộp minh chứng (Đang khóa chờ chấm)' :
                         isPending ? '⏳ Đang chờ duyệt công việc' : '● Đang thực hiện'}
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 leading-snug">
                    {task.task_name}
                  </h3>

                  <div className="flex flex-wrap text-xs text-slate-600 gap-y-1 gap-x-4">
                    <span>Kết quả đầu ra yêu cầu: <b className="text-slate-800">{task.output_result}</b></span>
                    <span className="flex items-center space-x-1.5 flex-wrap">
                      <Clock className={`w-3.5 h-3.5 ${
                        task.deadline && task.deadline < todayStr && !isApproved && !isSubmitted
                          ? 'text-rose-600'
                          : task.deadline && task.deadline <= new Date(Date.now() + 3 * 86400000 + 7 * 3600000).toISOString().split('T')[0] && !isApproved && !isSubmitted
                            ? 'text-amber-600'
                            : 'text-slate-400'
                      }`} />
                      {task.deadline && task.deadline < todayStr && !isApproved && !isSubmitted ? (
                        <span className="px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 font-bold text-[11px] inline-flex items-center gap-1">
                          ⚠️ Quá hạn: <b>{formatDate(task.deadline)}</b>
                        </span>
                      ) : task.deadline && task.deadline <= new Date(Date.now() + 3 * 86400000 + 7 * 3600000).toISOString().split('T')[0] && !isApproved && !isSubmitted ? (
                        <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 font-bold text-[11px] inline-flex items-center gap-1">
                          ⏳ Sắp đến hạn: <b>{formatDate(task.deadline)}</b>
                        </span>
                      ) : (
                        <span>Hạn chót: <b>{formatDate(task.deadline)}</b></span>
                      )}
                      {task.extension_count > 0 && (
                        <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                          (Đã gia hạn: {task.extension_count} lần)
                        </span>
                      )}
                      {task.extension_status === 'pending' && (
                        <span 
                          className="text-[10px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300"
                          title={`Hạn đề xuất: ${formatDate(task.requested_deadline)} - Lý do: ${task.extension_reason || ''}`}
                        >
                          ⏳ Chờ duyệt GH
                        </span>
                      )}
                      {task.extension_status === 'rejected' && (
                        <span 
                          className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200"
                          title={`Lý do từ chối: ${task.extension_reject_reason || ''}`}
                        >
                          ✕ Bị từ chối GH
                        </span>
                      )}
                    </span>
                    {task.actual_finish_date && (
                      <span className="flex items-center space-x-1 text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Hoàn thành: <b>{formatDate(task.actual_finish_date)}</b></span>
                      </span>
                    )}

                    {/* Thông tin người nhận đánh giá / thẩm định */}
                    <span className="flex items-center space-x-1 text-slate-600">
                      <span>Đánh giá:</span>
                      <b className="text-slate-800">{task.evaluator_name || task.grader_name || 'Lãnh đạo đơn vị'}</b>
                      {task.evaluator_type === 'delegated_manager' ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-200" title={`Lãnh đạo đơn vị (${task.delegated_by_name || 'LĐ'}) đã chuyển quyền đánh giá cho ${task.evaluator_name}`}>
                          🔄 LĐ ủy quyền
                        </span>
                      ) : task.origin === 'assigned' ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200">
                          Người giao việc
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                          Lãnh đạo đơn vị
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Warning banner if task was returned by manager */}
                  {task.is_returned === 1 && (
                    <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-900 font-medium space-y-1">
                      <div className="font-bold text-rose-800 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        Lãnh đạo yêu cầu bổ sung / làm lại minh chứng:
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-rose-200 text-slate-800">
                        {task.return_reason || task.cbql_comment || 'Yêu cầu rà soát và cập nhật lại minh chứng.'}
                      </div>
                    </div>
                  )}

                  {/* Evidence details if present */}
                  {(task.evidence_text || task.detailed_result_note || task.evidence_file_name) && (
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                      {task.evidence_text && (
                        <div className="text-slate-700">
                          <span className="font-semibold text-slate-900">Minh chứng: </span>
                          {task.evidence_text}
                        </div>
                      )}
                      {task.detailed_result_note && (
                        <div className="text-slate-700">
                          <span className="font-semibold text-slate-900">Ghi chú chi tiết kết quả: </span>
                          {task.detailed_result_note}
                        </div>
                      )}
                      {task.evidence_file_url && (
                        <div className="flex items-center space-x-1.5 text-blue-700 flex-wrap gap-y-1">
                          <Paperclip className="w-3.5 h-3.5 shrink-0" />
                          <a 
                            href={task.evidence_file_url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="font-medium hover:underline"
                          >
                            Tệp đính kèm: {task.evidence_file_name || 'Tải file minh chứng'}
                          </a>
                          {task.inherited_from_user_name && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 inline-flex items-center gap-1">
                              📥 Kế thừa từ cấp dưới: {task.inherited_from_user_name}
                            </span>
                          )}
                        </div>
                      )}
                      {task.cbql_comment && task.is_returned !== 1 && (
                        <div className="text-amber-800 font-medium">
                          Ý kiến CBQL: {task.cbql_comment}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cadre Evaluation Feedback Banner (Bước 4) */}
                  {task.evaluation_feedback && (
                    <div className="p-2.5 bg-purple-50 rounded-lg border border-purple-200 text-xs space-y-1">
                      <div className="font-bold text-purple-800 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                        <span>Ý kiến phản hồi đánh giá của bạn (Bước 4):</span>
                      </div>
                      <div className="p-2 bg-white rounded-md border border-purple-100 text-slate-800 italic">
                        "{task.evaluation_feedback}"
                      </div>
                    </div>
                  )}
                </div>

                {/* Right score / action */}
                <div className="flex flex-col sm:flex-row lg:flex-col items-end gap-3 shrink-0">
                  {isApproved && (
                    <div className="text-right">
                      <div className="text-xs text-slate-500">Điểm quy đổi đạt được</div>
                      <div className="text-lg font-bold text-emerald-700">
                        {Number(Number(task.converted_score || 0).toFixed(2))} <span className="text-xs font-normal text-slate-400">/ {Number(Number(task.max_converted_score || (task.standard_score * task.difficulty_weight)).toFixed(2))} đ</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Tiến độ: {Math.round(task.progress_pct * 100)}% • Chất lượng: {Math.round(task.quality_pct * 100)}%
                      </div>
                    </div>
                  )}

                  {!isPending && (
                    task.is_returned === 1 ? (
                      <div className="flex flex-col sm:flex-row lg:flex-col items-end gap-2">
                        <button
                          onClick={() => openEvidenceModal(task)}
                          className="flex items-center space-x-1.5 text-xs font-bold px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white shadow-xs transition-colors cursor-pointer"
                          title="Hoàn thiện minh chứng và gửi lại đánh giá"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Nộp lại & Gửi đánh giá</span>
                        </button>
                        {isTaskDueOrOverdue(task) && (
                          task.extension_status === 'pending' ? (
                            <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-300 inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>Đang chờ duyệt GH</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openExtensionModal(task)}
                              className="flex items-center space-x-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition-colors active:scale-95 cursor-pointer"
                              title="Gửi yêu cầu xin gia hạn tiến độ tới Lãnh đạo (chỉ khi việc đã đến hạn hoặc quá hạn)"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              <span>Xin gia hạn</span>
                            </button>
                          )
                        )}
                      </div>
                    ) : isSubmitted ? (
                      <div className="flex flex-col sm:flex-row lg:flex-col items-end gap-1.5">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold">
                          <Send className="w-3 h-3 text-indigo-600" />
                          <span>Đã gửi đánh giá</span>
                        </div>
                        <span className="text-[11px] text-slate-500 text-right">
                          Chờ <b>{task.evaluator_name || task.grader_name || 'Lãnh đạo'}</b> chấm
                        </span>
                        {task.extension_status === 'pending' && (
                          <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-300 inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>Đang chờ duyệt GH</span>
                          </span>
                        )}
                      </div>
                    ) : isApproved ? (
                      <div className="flex flex-col sm:flex-row lg:flex-col items-end gap-2">
                        <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Đã duyệt (Khóa)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setFeedbackTask(task);
                            setEvalFeedbackText(task.evaluation_feedback || '');
                          }}
                          className={`flex items-center space-x-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                            task.evaluation_feedback
                              ? 'bg-purple-100 border-purple-300 text-purple-800 hover:bg-purple-200'
                              : 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'
                          }`}
                          title="Gửi ý kiến phản hồi về kết quả chấm điểm của Lãnh đạo (Bước 4)"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                          <span>{task.evaluation_feedback ? 'Sửa phản hồi đánh giá' : 'Phản hồi đánh giá'}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row lg:flex-col items-end gap-2">
                        <button
                          onClick={() => openEvidenceModal(task)}
                          className="flex items-center space-x-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white shadow-xs transition-colors cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Nộp SP & Gửi đánh giá</span>
                        </button>
                        {isTaskDueOrOverdue(task) && (
                          task.extension_status === 'pending' ? (
                            <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-300 inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>Đang chờ duyệt GH</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openExtensionModal(task)}
                              className="flex items-center space-x-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition-colors active:scale-95 cursor-pointer"
                              title="Gửi yêu cầu xin gia hạn tiến độ tới Lãnh đạo (chỉ khi việc đã đến hạn hoặc quá hạn)"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              <span>Xin gia hạn</span>
                            </button>
                          )
                        )}
                      </div>
                    )
                  )}
                </div>

              </div>
            </React.Fragment>
          );
          })
        )}
      </div>

      {/* SUBMIT EVIDENCE MODAL */}
      {activeTask && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl w-[95%] sm:max-w-lg p-4 sm:p-6 shadow-xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Nộp sản phẩm & Gửi đánh giá công việc
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeTask.task_name}
                </p>
              </div>
              <button 
                onClick={() => setActiveTask(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitEvidence} className="space-y-4">
              
              {/* Date Comparison & Automatic Late calculation */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ngày hoàn thành thực tế *
                </label>
                <input
                  type="date"
                  required
                  value={toInputDateFormat(finishDate)}
                  onChange={(e) => setFinishDate(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-red-500"
                />
                
                {/* Auto Calculated Progress Badge */}
                {(() => {
                  const progInfo = getPreviewProgress(activeTask.deadline, finishDate);
                  return (
                    <div className="mt-2 text-xs flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-slate-600">Thời hạn: <b>{formatDate(activeTask.deadline)}</b></span>
                      <span className="text-slate-400">➔</span>
                      <span className="text-slate-600">Tiến độ công việc:</span>
                      <span className={`font-bold px-2.5 py-1 rounded text-xs ${
                        progInfo.pct === 1.0 ? 'bg-emerald-100 text-emerald-800' :
                        progInfo.pct === 0.8 ? 'bg-blue-100 text-blue-800' :
                        progInfo.pct === 0.6 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {progInfo.text}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Evidence description / text */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Số hiệu văn bản, báo cáo, minh chứng *
                </label>
                <textarea
                  required
                  rows="2"
                  value={evidenceText}
                  onChange={(e) => setEvidenceText(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-red-500"
                  placeholder="Ví dụ: Báo cáo số 15-BC/BTCTU ngày 28/3/2026 đã ban hành..."
                ></textarea>
              </div>

              {/* Detailed result note */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ghi chú chi tiết kết quả
                </label>
                <textarea
                  rows="2"
                  value={detailedResultNote}
                  onChange={(e) => setDetailedResultNote(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-red-500 font-normal"
                  placeholder="Nhập ghi chú chi tiết về kết quả đạt được, tiến độ thực hiện hoặc giải trình bổ sung (nếu có)..."
                ></textarea>
              </div>

              {/* Feature: Lấy tệp kết quả từ cấp dưới cho cùng nhiệm vụ */}
              <div className="space-y-2 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Download className="w-4 h-4 text-indigo-600" />
                    <span>Tệp kết quả từ Cấp dưới (cho cùng nhiệm vụ):</span>
                  </label>
                  {loadingSubEvidences ? (
                    <span className="text-[11px] text-slate-400 italic">Đang tìm...</span>
                  ) : (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                      {subordinateEvidences.length} kết quả
                    </span>
                  )}
                </div>

                {loadingSubEvidences ? (
                  <div className="text-center py-3 text-slate-400 text-xs italic">
                    Đang quét tìm tệp kết quả của các cán bộ cấp dưới...
                  </div>
                ) : subordinateEvidences.length === 0 ? (
                  <div className="p-2 bg-white rounded-lg border border-slate-200 text-slate-500 text-xs italic text-center">
                    Chưa có cấp dưới nào nộp tệp kết quả cho nhiệm vụ này.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {subordinateEvidences.map(sub => {
                      const isSelected = inheritedEvidence?.task_id === sub.task_id;
                      return (
                        <div
                          key={sub.task_id}
                          className={`p-2.5 rounded-lg border text-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                            isSelected
                              ? 'bg-indigo-50/90 border-indigo-400 ring-2 ring-indigo-200'
                              : 'bg-white border-slate-200 hover:border-indigo-300'
                          }`}
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900">{sub.user_name}</span>
                              <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                {sub.user_title || sub.dept_name || 'Cán bộ'}
                              </span>
                              <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                                {sub.match_type}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-700">
                              <Paperclip className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              <a
                                href={sub.evidence_file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-indigo-700 hover:underline truncate"
                                title="Bấm để xem tệp trước khi kế thừa"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {sub.evidence_file_name || 'Xem tệp kết quả'}
                              </a>
                              {sub.actual_finish_date && (
                                <span className="text-[11px] text-slate-400 shrink-0">
                                  • Hoàn thành: {formatDate(sub.actual_finish_date)}
                                </span>
                              )}
                            </div>
                            {sub.evidence_text && (
                              <p className="text-[11px] text-slate-500 truncate italic">
                                "{sub.evidence_text}"
                              </p>
                            )}
                          </div>

                          <div className="shrink-0">
                            {isSelected ? (
                              <button
                                type="button"
                                onClick={() => setInheritedEvidence(null)}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-bold text-xs flex items-center gap-1 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Bỏ chọn</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSelectSubordinateEvidence(sub)}
                                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1 shadow-2xs cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Lấy tệp này</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Status if inherited file is selected */}
              {inheritedEvidence && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between text-xs animate-in fade-in">
                  <div className="flex items-center gap-2 text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <div>Đang chọn tệp từ cấp dưới: <b className="text-emerald-950">{inheritedEvidence.user_name}</b></div>
                      <div className="font-semibold text-indigo-700 underline flex items-center gap-1 mt-0.5">
                        <Paperclip className="w-3.5 h-3.5" />
                        <a href={inheritedEvidence.evidence_file_url} target="_blank" rel="noreferrer">
                          {inheritedEvidence.evidence_file_name}
                        </a>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInheritedEvidence(null)}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold cursor-pointer"
                  >
                    Hủy kế thừa
                  </button>
                </div>
              )}

              {/* Evidence file upload */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Hoặc tự tải lên tệp đính kèm mới (PDF, Word, Ảnh văn bản có dấu)
                </label>
                <input
                  type="file"
                  accept=".pdf, .doc, .docx, .png, .jpg, .jpeg, .xlsx"
                  onChange={(e) => {
                    setEvidenceFile(e.target.files[0]);
                    if (e.target.files[0]) {
                      setInheritedEvidence(null);
                    }
                  }}
                  className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                />
                {activeTask.evidence_file_name && !evidenceFile && !inheritedEvidence && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Tệp hiện tại: <b>{activeTask.evidence_file_name}</b> (chọn file mới nếu muốn thay thế)
                  </p>
                )}
              </div>

              {/* Self assessment */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Số lượng sản phẩm</label>
                  <select
                    value={quantityPct}
                    onChange={(e) => setQuantityPct(parseFloat(e.target.value))}
                    className="w-full text-xs p-2 border border-slate-300 rounded-md"
                  >
                    <option value="1.0">Hoàn thành đủ 100%</option>
                    <option value="0.0">Không đủ số lượng (0%)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kết quả (Căn cứ chất lượng sản phẩm)
                  </label>
                  <select
                    value={selfQualityPct}
                    onChange={(e) => setSelfQualityPct(parseFloat(e.target.value))}
                    className="w-full text-xs p-2 border border-slate-300 rounded-md font-semibold"
                  >
                    <option value="1.0">Đạt đầy đủ yêu cầu: 100%</option>
                    <option value="0.8">Đạt yêu cầu, chỉnh sửa nhỏ: 80%</option>
                    <option value="0.6">Hoàn thành cơ bản: 60%</option>
                    <option value="0.0">Không đạt yêu cầu: 0%</option>
                  </select>
                </div>
              </div>

              {/* Notice: Người thẩm định & chấm điểm hoàn thành */}
              <div className="p-3 bg-indigo-50/90 border border-indigo-200 rounded-xl text-xs text-indigo-950 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-indigo-900">
                  <Send className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Người nhận thẩm định & chấm điểm nhiệm vụ:</span>
                </div>
                <div className="text-indigo-900 flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-sm text-indigo-950">{activeTask.evaluator_name || activeTask.grader_name || 'Lãnh đạo đơn vị'}</span>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                    {activeTask.evaluator_type === 'delegated_manager'
                      ? 'Quản lý được Lãnh đạo ủy quyền'
                      : (activeTask.origin === 'assigned' ? 'Người giao việc' : 'Lãnh đạo đơn vị')}
                  </span>
                </div>
                <p className="leading-relaxed text-[11px] text-indigo-800">
                  Sau khi nộp, hệ thống sẽ tự động cập nhật kết quả và chuyển thông báo đến người đánh giá để thẩm định và chấm điểm hoàn thành.
                </p>
              </div>

              <div className="pt-3 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveTask(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold bg-red-700 hover:bg-red-800 text-white rounded-md shadow-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Đang gửi...' : '📤 Nộp sản phẩm & Gửi đánh giá'}</span>
                </button>
              </div>

            </form>
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

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Người chấm điểm:</span>
                <span className="font-bold text-slate-900">{feedbackTask.grader_name || 'Lãnh đạo đơn vị'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Điểm thẩm định Lãnh đạo:</span>
                <span className="font-bold text-purple-700 text-sm">{feedbackTask.converted_score} đ (Tiến độ: {Math.round(feedbackTask.progress_pct * 100)}%, Chất lượng: {Math.round(feedbackTask.quality_pct * 100)}%)</span>
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

      {/* MODAL CBNV XIN GIA HẠN CÔNG VIỆC (CHỈ HIỂN THỊ KHI ĐÃ ĐẾN HẠN HOẶC QUÁ HẠN) */}
      {extensionModalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-amber-50/80">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">Yêu cầu xin gia hạn tiến độ công việc</h3>
              </div>
              <button
                type="button"
                onClick={() => setExtensionModalTask(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitExtension}>
              <div className="p-5 space-y-3.5">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                  <div className="font-bold text-slate-800">{extensionModalTask.task_name}</div>
                  <div className="text-slate-500 flex items-center gap-2 flex-wrap">
                    <span>Hạn hiện tại: <strong className="text-rose-600">{formatDate(extensionModalTask.deadline)}</strong></span>
                    <span>•</span>
                    <span>Người giao / duyệt: <strong>{extensionModalTask.assigner_name || 'Lãnh đạo đơn vị'}</strong></span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Thời hạn mới đề xuất <span className="text-red-500">*</span>:
                  </label>
                  <input
                    type="date"
                    required
                    value={requestedDeadline}
                    onChange={(e) => setRequestedDeadline(e.target.value)}
                    min={toInputDateFormat(new Date().toISOString().split('T')[0])}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-semibold text-slate-800"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Hạn mới đề xuất phải sau ngày hạn hiện tại ({formatDate(extensionModalTask.deadline)}).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Lý do xin gia hạn <span className="text-red-500">*</span>:
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={extensionReason}
                    onChange={(e) => setExtensionReason(e.target.value)}
                    placeholder="Nhập chi tiết khó khăn, nguyên nhân cần gia hạn thời gian hoàn thành..."
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-normal"
                  />
                </div>

                <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
                  ℹ️ <strong>Quy định:</strong> Tính năng xin gia hạn chỉ khả dụng khi công việc đã đến hạn hoặc quá hạn. Yêu cầu sẽ được gửi tới Lãnh đạo xem xét và phê duyệt.
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 p-4 bg-slate-50 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setExtensionModalTask(null)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExtension || !requestedDeadline || !extensionReason.trim()}
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingExtension ? 'Đang gửi...' : 'Gửi yêu cầu gia hạn'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
