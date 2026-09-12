import React, { useEffect, useState, useMemo, useRef } from 'react';
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
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  BarChart3,
  TrendingUp,
  User,
  Users,
  Star,
  ExternalLink,
  ChevronRight,
  Eye,
  Trash2,
  ArrowRight,
  ShieldCheck,
  FileSpreadsheet,
  Zap
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

export default function ExecutionTab({ 
  selectedPeriod, 
  onPeriodChange,
  periods = [], 
  currentUser, 
  axes = [],
  setCurrentTab
}) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  // 'ALL' | 'IN_PROGRESS' | 'OVERDUE' | 'REJECTED' | 'COMPLETED'
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [taskTypeFilter, setTaskTypeFilter] = useState('ALL'); // 'ALL' | 'Thường xuyên' | 'Đột xuất' | TRUC_1..6

  // Inline Accordion Expand State: ID of task currently expanded
  const [expandedTaskId, setExpandedTaskId] = useState(null);

  // Form State for Expanded Task
  const [finishDate, setFinishDate] = useState('');
  const [selfQualityPct, setSelfQualityPct] = useState(1.0);
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState('');
  const [detailNote, setDetailNote] = useState('');
  const [isBonusProposed, setIsBonusProposed] = useState(false);
  const [bonusReason, setBonusReason] = useState('');
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [activeEvidenceTab, setActiveEvidenceTab] = useState('upload'); // 'upload' | 'inherit'
  const [inheritedEvidence, setInheritedEvidence] = useState(null);
  const [subordinateEvidences, setSubordinateEvidences] = useState([]);
  const [loadingSubEvidences, setLoadingSubEvidences] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef(null);

  // Assignment Details Modal State
  const [assignmentDetailTask, setAssignmentDetailTask] = useState(null);

  // Evaluation feedback modal state (Bước 4)
  const [feedbackTask, setFeedbackTask] = useState(null);
  const [evalFeedbackText, setEvalFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  // Extension Modal State (CBNV xin gia hạn tiến độ)
  const [extensionModalTask, setExtensionModalTask] = useState(null);
  const [requestedDeadline, setRequestedDeadline] = useState('');
  const [extensionReason, setExtensionReason] = useState('');
  const [isSubmittingExtension, setIsSubmittingExtension] = useState(false);

  const todayStr = useMemo(() => {
    return new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
  }, []);

  const currentPeriodObj = useMemo(() => {
    return periods.find(p => p.id === selectedPeriod) || periods[0];
  }, [periods, selectedPeriod]);

  function isTaskDueOrOverdue(task) {
    if (!task || !task.deadline || task.status === 'approved') return false;
    return task.deadline <= todayStr;
  }

  // Load Tasks for Current User in Selected Period
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

    const handleFocus = () => loadMyTasks();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadMyTasks();
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    const timer = setInterval(() => {
      loadMyTasks();
    }, 30000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(timer);
    };
  }, [selectedPeriod, currentUser]);

  // Handle Toggle Expand Task Card for Inline Editing
  function handleToggleExpand(task) {
    if (expandedTaskId === task.id) {
      setExpandedTaskId(null);
      return;
    }

    setExpandedTaskId(task.id);
    setFinishDate(task.actual_finish_date || todayStr);
    setSelfQualityPct(task.quality_pct !== undefined && task.quality_pct !== null ? task.quality_pct : 1.0);
    setDocNumber(task.document_number || '');
    setDocDate(task.document_date || '');
    setDetailNote(task.detailed_result_note || task.evidence_text || '');
    setIsBonusProposed(task.is_bonus_proposed === 1 || task.is_bonus_proposed === true);
    setBonusReason(task.bonus_reason || '');
    setEvidenceFile(null);
    setInheritedEvidence(
      task.inherited_from_task_id ? {
        evidence_file_url: task.evidence_file_url,
        evidence_file_name: task.evidence_file_name,
        user_name: task.inherited_from_user_name,
        task_id: task.inherited_from_task_id
      } : null
    );
    setActiveEvidenceTab('upload');
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
    if (!detailNote.trim()) {
      setDetailNote(`Kế thừa sản phẩm / tệp kết quả từ cán bộ ${sub.user_name}: ${sub.evidence_text || sub.task_name}`);
    }
  }

  // Calculate live preview progress % (Working days, excluding weekends)
  function calculatePreviewProgress(deadlineStr, finishStr) {
    if (!deadlineStr) return { pct: 1.0, lateDays: 0, label: 'Đúng hạn (100%)' };
    const finish = finishStr || todayStr;
    const d = parseDateOnly(deadlineStr);
    const f = parseDateOnly(finish);
    if (!d || !f || f <= d) {
      return { pct: 1.0, lateDays: 0, label: 'Hoàn thành đúng hoặc trước hạn (100%)' };
    }

    let lateDays = 0;
    let cur = new Date(d);
    cur.setDate(cur.getDate() + 1);
    while (cur <= f) {
      const day = cur.getDay();
      if (day !== 0 && day !== 6) lateDays++;
      cur.setDate(cur.getDate() + 1);
    }

    if (lateDays <= 3) return { pct: 0.8, lateDays, label: `Hoàn thành chậm ${lateDays} ngày làm việc (80%)` };
    if (lateDays <= 5) return { pct: 0.6, lateDays, label: `Hoàn thành chậm ${lateDays} ngày làm việc (60%)` };
    return { pct: 0.0, lateDays, label: `Hoàn thành chậm ${lateDays} ngày làm việc (> 5 ngày: 0%)` };
  }

  // Handle Submit Evidence or Save Draft
  async function handleSaveEvidence(task, isDraft = false) {
    if (!task) return;

    if (!isDraft) {
      if (!finishDate) {
        alert('Vui lòng chọn ngày hoàn thành thực tế!');
        return;
      }
      if (!detailNote.trim() && !evidenceFile && !inheritedEvidence && !task.evidence_file_url) {
        alert('Để gửi đánh giá, bạn cần nhập mô tả kết quả hoặc đính kèm ít nhất 1 file minh chứng!');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const formData = new FormData();
      formData.append('actual_finish_date', finishDate);
      formData.append('self_quality_pct', selfQualityPct);
      formData.append('document_number', docNumber.trim());
      formData.append('document_date', docDate);
      formData.append('detailed_result_note', detailNote.trim());
      formData.append('evidence_text', docNumber ? `${docNumber.trim()}${docDate ? ` (Ngày BH: ${formatDate(docDate)})` : ''}` : detailNote.trim());
      formData.append('is_bonus_proposed', isBonusProposed ? 'true' : 'false');
      formData.append('bonus_reason', bonusReason.trim());
      formData.append('is_draft', isDraft ? 'true' : 'false');

      if (evidenceFile) {
        formData.append('evidence_file', evidenceFile);
      } else if (inheritedEvidence) {
        formData.append('existing_file_url', inheritedEvidence.evidence_file_url);
        formData.append('existing_file_name', inheritedEvidence.evidence_file_name);
        formData.append('inherited_from_task_id', inheritedEvidence.task_id);
        formData.append('inherited_from_user_name', inheritedEvidence.user_name);
      }

      const res = await api.submitEvidence(task.id, formData);
      alert(res.message || (isDraft ? 'Đã lưu bản nháp thành công!' : 'Đã cập nhật kết quả và nộp minh chứng thành công!'));
      setExpandedTaskId(null);
      loadMyTasks();
    } catch (err) {
      alert('Lỗi xử lý: ' + (err.message || err));
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle File Select & Drag-and-drop
  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 25 * 1024 * 1024) {
        alert('Dung lượng tệp vượt quá giới hạn 25MB. Vui lòng chọn tệp nhẹ hơn!');
        return;
      }
      setEvidenceFile(file);
      setInheritedEvidence(null);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (file.size > 25 * 1024 * 1024) {
        alert('Dung lượng tệp vượt quá giới hạn 25MB. Vui lòng chọn tệp nhẹ hơn!');
        return;
      }
      setEvidenceFile(file);
      setInheritedEvidence(null);
    }
  }

  // Handle Extension Request
  function openExtensionModal(task) {
    if (task.status === 'rejected') {
      alert('Nhiệm vụ đã bị từ chối tiếp nhận, không thể xin gia hạn!');
      return;
    }
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

  // Handle Feedback Submission
  async function handleSubmitEvalFeedback(e) {
    if (e) e.preventDefault();
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
      alert(err.message || err);
    } finally {
      setSubmittingFeedback(false);
    }
  }

  // Counts for Filter Pills
  const counts = useMemo(() => {
    let in_progress = 0;
    let overdue = 0;
    let rejected = 0;
    let completed = 0;

    for (const t of tasks) {
      const isOverdue = t.deadline && t.deadline < todayStr && t.status !== 'approved' && t.status !== 'submitted';
      const isRejected = t.status === 'rejected' || t.is_returned === 1;
      const isDone = t.status === 'approved' || t.status === 'submitted';

      if (isOverdue) overdue++;
      if (isRejected) rejected++;
      if (isDone) completed++;
      if (t.status === 'in_progress' && !isOverdue) in_progress++;
    }

    return {
      all: tasks.length,
      in_progress,
      overdue,
      rejected,
      completed
    };
  }, [tasks, todayStr]);

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      // 1. Status Filter
      if (statusFilter === 'IN_PROGRESS') {
        const isOverdue = t.deadline && t.deadline < todayStr && t.status !== 'approved' && t.status !== 'submitted';
        if (t.status !== 'in_progress' || isOverdue) return false;
      } else if (statusFilter === 'OVERDUE') {
        const isOverdue = t.deadline && t.deadline < todayStr && t.status !== 'approved' && t.status !== 'submitted';
        if (!isOverdue) return false;
      } else if (statusFilter === 'REJECTED') {
        if (t.status !== 'rejected' && t.is_returned !== 1) return false;
      } else if (statusFilter === 'COMPLETED') {
        if (t.status !== 'approved' && t.status !== 'submitted') return false;
      }

      // 2. Search Term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchName = (t.task_name || '').toLowerCase().includes(term);
        const matchResult = (t.output_result || '').toLowerCase().includes(term);
        const matchDoc = (t.document_number || '').toLowerCase().includes(term);
        const matchAssigner = (t.assigner_name || '').toLowerCase().includes(term);
        if (!matchName && !matchResult && !matchDoc && !matchAssigner) return false;
      }

      // 3. Task Type / Axis Filter
      if (taskTypeFilter !== 'ALL') {
        if (taskTypeFilter === 'Thường xuyên' || taskTypeFilter === 'Đột xuất') {
          if (t.task_type !== taskTypeFilter) return false;
        } else if (taskTypeFilter.startsWith('TRUC_')) {
          if ((t.axis_code || 'TRUC_1') !== taskTypeFilter) return false;
        }
      }

      return true;
    });
  }, [tasks, statusFilter, searchTerm, taskTypeFilter, todayStr]);

  return (
    <div className="space-y-4 sm:space-y-6 pb-12">
      
      {/* 1. TOP HEADER (Matching Image 1) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base sm:text-lg lg:text-xl font-extrabold text-slate-900 tracking-tight">
            Thực hiện nhiệm vụ và nộp minh chứng
          </h2>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 font-bold border border-red-200 hidden sm:inline-block">
            Bước 2
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Excel Export Button */}
          {currentUser && selectedPeriod && (
            <a
              href={api.getExportUrl ? api.getExportUrl(selectedPeriod, currentUser.id) : '#'}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold text-red-600 bg-white border border-red-500 hover:bg-red-50 transition shadow-2xs cursor-pointer active:scale-95"
              title="Xuất file báo cáo thực hiện công việc và kết quả KPI"
            >
              <Download className="w-4 h-4 text-red-600" />
              <span>Xuất Excel</span>
            </a>
          )}

          {/* Period Selector Dropdown */}
          {periods && periods.length > 0 && (
            <div className="relative">
              <select
                value={selectedPeriod}
                onChange={(e) => onPeriodChange && onPeriodChange(e.target.value)}
                className="appearance-none pl-3.5 pr-8 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 cursor-pointer shadow-2xs focus:ring-2 focus:ring-red-500 focus:outline-none transition"
              >
                {periods.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.is_active ? '(Chính thức) ' : ''}{p.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-500 absolute right-2.5 top-3 pointer-events-none" />
            </div>
          )}

          {/* Quick Refresh Button */}
          <button
            type="button"
            onClick={loadMyTasks}
            disabled={loading}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs border border-slate-300 transition shadow-2xs cursor-pointer active:scale-95"
            title="Đồng bộ lại danh sách nhiệm vụ"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-red-600' : 'text-slate-600'}`} />
          </button>
        </div>
      </div>

      {/* 2. FILTER TABS & SEARCH BAR (Matching Image 1) */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Status Pills with Counts */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 sm:pb-0 scrollbar-none whitespace-nowrap">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'ALL'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <span>Tất cả</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] sm:text-xs ${
                statusFilter === 'ALL' ? 'bg-white/20 text-white font-bold' : 'bg-slate-200 text-slate-700'
              }`}>
                {counts.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('IN_PROGRESS')}
              className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'IN_PROGRESS'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <span>Đang thực hiện</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] sm:text-xs ${
                statusFilter === 'IN_PROGRESS' ? 'bg-white/20 text-white font-bold' : 'bg-slate-200 text-slate-700'
              }`}>
                {counts.in_progress}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('OVERDUE')}
              className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'OVERDUE'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <span>Quá hạn</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] sm:text-xs ${
                statusFilter === 'OVERDUE' ? 'bg-white/20 text-white font-bold' : 'bg-rose-100 text-rose-800 font-bold'
              }`}>
                {counts.overdue}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('REJECTED')}
              className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'REJECTED'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <span>Bị từ chối</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] sm:text-xs ${
                statusFilter === 'REJECTED' ? 'bg-white/20 text-white font-bold' : 'bg-slate-200 text-slate-700'
              }`}>
                {counts.rejected}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('COMPLETED')}
              className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'COMPLETED'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <span>Hoàn thành</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] sm:text-xs ${
                statusFilter === 'COMPLETED' ? 'bg-white/20 text-white font-bold' : 'bg-emerald-100 text-emerald-800 font-bold'
              }`}>
                {counts.completed}
              </span>
            </button>
          </div>

          {/* Search & Task Type Dropdown */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full lg:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm kiếm nhiệm vụ..."
                className="w-full pl-9 pr-3.5 py-2 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none bg-slate-50/50"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="relative w-full sm:w-auto">
              <select
                value={taskTypeFilter}
                onChange={(e) => setTaskTypeFilter(e.target.value)}
                className="w-full sm:w-auto appearance-none pl-3 pr-8 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 cursor-pointer shadow-2xs focus:ring-2 focus:ring-red-500 focus:outline-none"
              >
                <option value="ALL">Loại nhiệm vụ: Tất cả</option>
                <option value="Thường xuyên">● Thường xuyên</option>
                <option value="Đột xuất">⚡ Đột xuất</option>
                {axes && axes.map(ax => (
                  <option key={ax.code} value={ax.code}>
                    {ax.name.includes(' - ') ? ax.name.split(' - ')[0] : ax.code}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
            </div>
          </div>

        </div>
      </div>

      {/* 3. TASK LIST (Matching Image 1 & Image 2) */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-500 shadow-xs">
            <RefreshCw className="w-8 h-8 text-red-600 animate-spin mx-auto mb-2" />
            <p className="font-semibold text-slate-700 text-sm sm:text-base">Đang tải danh sách nhiệm vụ...</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-500 shadow-xs">
            <CheckSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-bold text-slate-700 text-base">Không có công việc nào phù hợp với bộ lọc</p>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Vui lòng thử chọn trạng thái khác hoặc xóa từ khóa tìm kiếm.
            </p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const isApproved = task.status === 'approved';
            const isSubmitted = task.status === 'submitted';
            const isPending = task.status === 'pending_approval';
            const isRejected = task.status === 'rejected' || task.is_returned === 1;
            const isOverdue = task.deadline && task.deadline < todayStr && !isApproved && !isSubmitted;

            const isExpanded = expandedTaskId === task.id;

            // Maximum score allowed
            const maxScore = Number((task.max_converted_score || (task.standard_score * task.difficulty_weight)).toFixed(1));
            
            // Progress percentage for circle
            const progressDisplayPct = Math.round((task.progress_pct !== undefined && task.progress_pct !== null ? task.progress_pct : 1.0) * 100);

            // Self evaluated score (dự kiến / thực tế)
            const selfScore = task.converted_score !== undefined && task.converted_score !== null && task.converted_score > 0
              ? `${Number(task.converted_score).toFixed(1)} điểm`
              : (task.actual_finish_date ? `${maxScore} điểm` : 'Chưa tự đánh giá');

            // Assigner / Evaluator info
            const assignerName = task.assigner_name || task.evaluator_name || task.grader_name || 'Lãnh đạo đơn vị';
            const initialChar = (assignerName.trim().charAt(0) || 'L').toUpperCase();

            // Realtime calculation for expanded panel
            const currentPreviewProg = calculatePreviewProgress(task.deadline, finishDate);
            const liveCalculatedScore = (maxScore * currentPreviewProg.pct * parseFloat(selfQualityPct || 1.0)).toFixed(1);

            return (
              <div 
                key={task.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all overflow-hidden"
              >
                {/* CARD MAIN CONTENT */}
                <div className="p-4 sm:p-5 space-y-3.5">
                  
                  {/* TOP ROW: Circle %, Badges, Title, Action Buttons */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      
                      {/* Red Progress Circle */}
                      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full border-2 border-red-600 bg-red-50/20 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                        <span className="text-xs sm:text-sm font-extrabold text-red-700">
                          {progressDisplayPct}%
                        </span>
                      </div>

                      {/* Badges and Task Title */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Task Type Badge */}
                          {task.task_type === 'Đột xuất' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              <Star className="w-3 h-3 text-amber-600 fill-amber-600" />
                              <span>Đột xuất</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                              <span>Thường xuyên</span>
                            </span>
                          )}

                          {/* Status Badge */}
                          {isRejected ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                              <span>Bị từ chối / Trả về</span>
                            </span>
                          ) : isApproved ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                              <span>Hoàn thành (Đã duyệt)</span>
                            </span>
                          ) : isSubmitted ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                              <span>Chờ đánh giá</span>
                            </span>
                          ) : isOverdue ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                              <span>Quá hạn</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                              <span>Đang thực hiện</span>
                            </span>
                          )}

                          {/* Extension Status Tag */}
                          {task.extension_status === 'pending' && (
                            <span className="text-[11px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 inline-flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-700" />
                              <span>Chờ duyệt gia hạn</span>
                            </span>
                          )}
                        </div>

                        {/* Task Title */}
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug flex items-center gap-2 flex-wrap">
                          <span>{task.task_name}</span>
                          {task.is_skip_level === 1 && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs inline-flex items-center gap-1 shrink-0" title={task.skip_level_notes ? `Giao việc vượt cấp: ${task.skip_level_notes}` : 'Giao việc vượt cấp'}>
                              <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
                              <span>Vượt cấp</span>
                            </span>
                          )}
                          {task.target_position_title && (
                            <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-xs font-semibold shrink-0" title={task.target_dept_name ? `Tại đơn vị: ${task.target_dept_name}` : ''}>
                              Chức vụ: {task.target_position_title}
                            </span>
                          )}
                        </h3>
                      </div>
                    </div>

                    {/* Action Buttons Top-Right */}
                    <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                      {/* Update Button (Toggle Inline Accordion) */}
                      {!isApproved ? (
                        <button
                          type="button"
                          onClick={() => handleToggleExpand(task)}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold border transition shadow-2xs cursor-pointer active:scale-95 ${
                            isExpanded
                              ? 'bg-red-700 text-white border-red-700 hover:bg-red-800'
                              : 'text-red-600 bg-white border-red-500 hover:bg-red-50'
                          }`}
                          title="Cập nhật kết quả thực hiện và minh chứng"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          <span>{isExpanded ? 'Thu gọn' : 'Cập nhật'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setFeedbackTask(task);
                            setEvalFeedbackText(task.evaluation_feedback || '');
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold text-purple-700 bg-purple-50 border border-purple-300 hover:bg-purple-100 transition shadow-2xs cursor-pointer"
                          title="Gửi phản hồi về điểm đánh giá của Lãnh đạo"
                        >
                          <MessageSquare className="w-4 h-4" />
                          <span>Phản hồi ĐG</span>
                        </button>
                      )}

                      {/* View Assignment Button */}
                      <button
                        type="button"
                        onClick={() => setAssignmentDetailTask(task)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold text-red-600 bg-white border border-red-500 hover:bg-red-50 transition shadow-2xs cursor-pointer active:scale-95"
                        title="Xem chi tiết nội dung phân công nhiệm vụ"
                      >
                        <Layers className="w-4 h-4 text-red-600" />
                        <span>Xem phân công</span>
                      </button>

                      {/* Request Extension Button (Only if due or overdue and not rejected) */}
                      {isTaskDueOrOverdue(task) && task.extension_status !== 'pending' && !isApproved && task.status !== 'rejected' && (
                        <button
                          type="button"
                          onClick={() => openExtensionModal(task)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold text-amber-700 bg-amber-50 border border-amber-300 hover:bg-amber-100 transition shadow-2xs cursor-pointer"
                          title="Xin gia hạn tiến độ"
                        >
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          <span className="hidden sm:inline">Xin gia hạn</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* MIDDLE ROW: 3 Distinct Rounded Info Boxes (THỜI GIAN / ĐIỂM KPI / NGƯỜI PHÂN CÔNG) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    
                    {/* Box 1: THỜI GIAN */}
                    <div className="p-3.5 bg-slate-50/70 border border-slate-100 rounded-xl space-y-2">
                      <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase block">
                        THỜI GIAN
                      </span>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                            <Calendar className="w-3.5 h-3.5" />
                          </div>
                          <div className="text-xs">
                            <span className="text-slate-500 block text-[11px]">Hạn hoàn thành</span>
                            <span className={`font-bold ${isOverdue ? 'text-rose-600' : 'text-slate-800'}`}>
                              {formatDate(task.deadline)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                          <div className="text-xs">
                            <span className="text-slate-500 block text-[11px]">Ngày hoàn thành thực tế</span>
                            <span className="font-bold text-slate-800">
                              {task.actual_finish_date ? formatDate(task.actual_finish_date) : 'Chưa cập nhật'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Box 2: ĐIỂM KPI */}
                    <div className="p-3.5 bg-slate-50/70 border border-slate-100 rounded-xl space-y-2">
                      <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase block">
                        ĐIỂM KPI
                      </span>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-rose-50 text-rose-700 flex items-center justify-center shrink-0">
                            <BarChart3 className="w-3.5 h-3.5" />
                          </div>
                          <div className="text-xs">
                            <span className="text-slate-500 block text-[11px]">Điểm quy định tối đa</span>
                            <span className="font-extrabold text-red-600">
                              {maxScore} điểm
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                            <TrendingUp className="w-3.5 h-3.5" />
                          </div>
                          <div className="text-xs">
                            <span className="text-slate-500 block text-[11px]">Điểm tự đánh giá</span>
                            <span className="font-extrabold text-emerald-700">
                              {selfScore}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Box 3: NGƯỜI PHÂN CÔNG */}
                    <div className="p-3.5 bg-slate-50/70 border border-slate-100 rounded-xl space-y-2">
                      <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase block">
                        NGƯỜI PHÂN CÔNG
                      </span>
                      <div className="flex items-center gap-2.5 pt-1">
                        <div className="w-8 h-8 rounded-full bg-red-700 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                          {initialChar}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                            {assignerName}
                          </div>
                          <span className="text-[11px] text-slate-500 truncate block">
                            {task.origin === 'assigned' ? 'Lãnh đạo phân công' : 'Đơn vị phụ trách'}
                          </span>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Warning message if task was returned by manager */}
                  {task.is_returned === 1 && (
                    <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-900 font-medium space-y-1">
                      <div className="font-bold text-rose-800 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        <span>Lãnh đạo yêu cầu bổ sung / làm lại minh chứng:</span>
                      </div>
                      <p className="p-2 bg-white rounded-lg border border-rose-200 text-slate-800">
                        {task.return_reason || task.cbql_comment || 'Yêu cầu rà soát và cập nhật lại minh chứng.'}
                      </p>
                    </div>
                  )}

                  {/* Existing evidence summary if available and not expanded */}
                  {!isExpanded && (task.evidence_file_name || task.evidence_text || task.detailed_result_note) && (
                    <div className="text-xs text-slate-500 pt-1 flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-700">Minh chứng đã nộp:</span>
                      {task.evidence_file_name && (
                        <a 
                          href={task.evidence_file_url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline font-semibold"
                        >
                          <Paperclip className="w-3 h-3" />
                          <span>{task.evidence_file_name}</span>
                        </a>
                      )}
                      {task.evidence_text && (
                        <span className="text-slate-600">({task.evidence_text})</span>
                      )}
                    </div>
                  )}

                </div>

                {/* INLINE EXPANDED PANEL (Matching Image 2) */}
                {isExpanded && (
                  <div className="border-t border-slate-200 bg-white p-4 sm:p-6 space-y-6 animate-in fade-in duration-200">
                    
                    {/* SECTION 1: KẾT QUẢ THỰC HIỆN */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-red-700" />
                          <span>Kết quả thực hiện</span>
                        </h4>
                      </div>

                      {/* Row 1: Ngày hoàn thành thực tế & Tự đánh giá mức độ chất lượng */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1">
                            Ngày hoàn thành thực tế <span className="text-red-500">*</span>:
                          </label>
                          <input
                            type="date"
                            value={finishDate}
                            onChange={(e) => setFinishDate(e.target.value)}
                            className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none bg-slate-50/50 font-semibold text-slate-800"
                          />
                          <p className="text-[11px] text-slate-400 mt-1 italic">
                            * Ngày hoàn thành thực tế sẽ ảnh hưởng trực tiếp đến điểm tiến độ thời gian.
                          </p>
                        </div>

                        <div>
                          <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1">
                            * Tự đánh giá mức độ hoàn thành chất lượng <span className="text-red-500">*</span>:
                          </label>
                          <select
                            value={selfQualityPct}
                            onChange={(e) => setSelfQualityPct(parseFloat(e.target.value))}
                            className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none bg-slate-50/50 font-semibold text-slate-800 cursor-pointer"
                          >
                            <option value={1.0}>100% - Xuất sắc / Hoàn thành tốt chất lượng</option>
                            <option value={0.8}>80% - Hoàn thành đạt yêu cầu</option>
                            <option value={0.6}>60% - Hoàn thành nhưng còn thiếu sót/chậm</option>
                            <option value={0.0}>0% - Không hoàn thành</option>
                          </select>
                        </div>
                      </div>

                      {/* Row 2: Số văn bản & Ngày ban hành văn bản */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1">
                            Số văn bản (minh chứng):
                          </label>
                          <input
                            type="text"
                            value={docNumber}
                            onChange={(e) => setDocNumber(e.target.value)}
                            placeholder="Vd: 1200-CV/BTCTU hoặc Kế hoạch số 05/KH..."
                            className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none bg-slate-50/50"
                          />
                        </div>

                        <div>
                          <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1">
                            Ngày ban hành văn bản:
                          </label>
                          <input
                            type="date"
                            value={docDate}
                            onChange={(e) => setDocDate(e.target.value)}
                            className="w-full p-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none bg-slate-50/50 font-medium text-slate-800"
                          />
                        </div>
                      </div>

                      {/* Row 3: Mô tả chi tiết kết quả */}
                      <div>
                        <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1">
                          Mô tả chi tiết kết quả:
                        </label>
                        <textarea
                          rows={3}
                          value={detailNote}
                          onChange={(e) => setDetailNote(e.target.value)}
                          placeholder="Nhập mô tả kết quả thực hiện, số liệu cụ thể, đường dẫn hoặc thông tin minh chứng..."
                          className="w-full p-3 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none bg-slate-50/50 leading-relaxed"
                        />
                        <p className="text-[11px] text-slate-400 mt-1 italic">
                          * Để gửi đánh giá, cần nhập mô tả này hoặc đính kèm ít nhất một file minh chứng.
                        </p>
                      </div>

                      {/* Row 4: Checkbox Nhiệm vụ có điểm thưởng */}
                      <div className="pt-1">
                        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isBonusProposed}
                            onChange={(e) => setIsBonusProposed(e.target.checked)}
                            className="w-4 h-4 text-red-600 rounded border-slate-300 focus:ring-red-500 cursor-pointer"
                          />
                          <span className="text-xs sm:text-sm font-bold text-slate-800 inline-flex items-center gap-1">
                            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                            <span>Nhiệm vụ có điểm thưởng (sáng kiến, vượt mức tiến độ hoặc hoàn thành xuất sắc)</span>
                          </span>
                        </label>

                        {isBonusProposed && (
                          <div className="mt-2 pl-6">
                            <input
                              type="text"
                              value={bonusReason}
                              onChange={(e) => setBonusReason(e.target.value)}
                              placeholder="Nhập căn cứ đề xuất cộng điểm thưởng..."
                              className="w-full p-2.5 text-xs sm:text-sm border border-amber-300 rounded-xl bg-amber-50/40 focus:ring-2 focus:ring-amber-500"
                            />
                          </div>
                        )}
                      </div>

                    </div>

                    {/* SECTION 2: ĐIỂM KPI TỰ ĐÁNH GIÁ (DỰ KIẾN) */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-emerald-600" />
                          <span>Điểm KPI tự đánh giá (dự kiến)</span>
                        </h4>
                      </div>

                      {finishDate ? (
                        <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                          <div className="space-y-1 text-xs sm:text-sm text-emerald-950">
                            <div className="font-bold flex items-center gap-2">
                              <span>Tiến độ: {currentPreviewProg.label}</span>
                              <span>•</span>
                              <span>Chất lượng: {Math.round(selfQualityPct * 100)}%</span>
                            </div>
                            <p className="text-emerald-800 text-xs">
                              Công thức: Điểm tối đa ({maxScore}đ) × Tiến độ ({Math.round(currentPreviewProg.pct * 100)}%) × Chất lượng ({Math.round(selfQualityPct * 100)}%)
                              {isBonusProposed ? ' + Điểm thưởng đề xuất' : ''}
                            </p>
                          </div>

                          <div className="text-left sm:text-right shrink-0">
                            <span className="text-[11px] text-emerald-700 font-bold uppercase block">Điểm dự kiến</span>
                            <span className="text-xl sm:text-2xl font-extrabold text-emerald-800">
                              {liveCalculatedScore} <span className="text-xs font-normal text-emerald-600">/ {maxScore} đ</span>
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm text-slate-500 italic">
                          ℹ️ Chưa đủ dữ liệu để tính điểm - vui lòng nhập ngày hoàn thành thực tế và chọn mức tự đánh giá chất lượng.
                        </div>
                      )}
                    </div>

                    {/* SECTION 3: MINH CHỨNG */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                          <Paperclip className="w-4 h-4 text-red-700" />
                          <span>Minh chứng</span>
                        </h4>

                        {/* Tabs for Evidence: Upload or Inherit */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveEvidenceTab('upload')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                              activeEvidenceTab === 'upload'
                                ? 'bg-red-50 text-red-700 border border-red-300'
                                : 'text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            Tải file lên
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveEvidenceTab('inherit')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                              activeEvidenceTab === 'inherit'
                                ? 'bg-red-50 text-red-700 border border-red-300'
                                : 'text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            Lấy kết quả của cấp dưới ({subordinateEvidences.length})
                          </button>
                        </div>
                      </div>

                      {activeEvidenceTab === 'upload' ? (
                        <div>
                          {/* File Dropzone */}
                          <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleFileChange}
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                            className="hidden"
                          />

                          <div
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition ${
                              isDragging 
                                ? 'border-red-500 bg-red-50/60' 
                                : 'border-red-200/80 bg-red-50/10 hover:bg-red-50/30'
                            }`}
                          >
                            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-2.5 shadow-2xs">
                              <Upload className="w-6 h-6" />
                            </div>
                            <p className="text-xs sm:text-sm font-bold text-slate-800">
                              Kéo thả hoặc <span className="text-red-700 underline">nhấp để tải lên</span>
                            </p>
                            <p className="text-[11px] text-slate-400 mt-1">
                              Hỗ trợ PDF, DOC, DOCX, XLS, XLSX, JPG, JPEG, PNG. Dung lượng tối đa: 25MB/file
                            </p>
                          </div>

                          {/* Selected File Badge */}
                          {(evidenceFile || task.evidence_file_name) && (
                            <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2 text-xs sm:text-sm">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileCheck2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span className="font-semibold text-slate-800 truncate">
                                  {evidenceFile ? evidenceFile.name : task.evidence_file_name}
                                </span>
                                {evidenceFile && (
                                  <span className="text-[11px] text-slate-400 shrink-0">
                                    ({(evidenceFile.size / 1024 / 1024).toFixed(2)} MB)
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {task.evidence_file_url && !evidenceFile && (
                                  <a
                                    href={task.evidence_file_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-blue-600 font-bold hover:underline"
                                  >
                                    Xem tệp
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEvidenceFile(null);
                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                  }}
                                  className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                  title="Xóa tệp"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Inherit Subordinate Evidence Tab */
                        <div className="space-y-2">
                          {loadingSubEvidences ? (
                            <div className="p-6 text-center text-xs text-slate-500">Đang tìm kiếm minh chứng từ cấp dưới...</div>
                          ) : subordinateEvidences.length === 0 ? (
                            <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
                              Chưa có cán bộ cấp dưới nào nộp minh chứng cho nhiệm vụ này.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                              {subordinateEvidences.map(sub => (
                                <div
                                  key={sub.id}
                                  onClick={() => handleSelectSubordinateEvidence(sub)}
                                  className={`p-3 rounded-xl border transition cursor-pointer text-xs space-y-1 ${
                                    inheritedEvidence?.task_id === sub.task_id
                                      ? 'bg-red-50 border-red-400 ring-2 ring-red-400/20'
                                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  <div className="flex items-center justify-between font-bold text-slate-800">
                                    <span>👤 {sub.user_name}</span>
                                    <span className="text-emerald-700 font-bold">{formatDate(sub.actual_finish_date)}</span>
                                  </div>
                                  <div className="text-slate-600 line-clamp-2">
                                    {sub.evidence_text || sub.detailed_result_note || 'Đã nộp tệp minh chứng'}
                                  </div>
                                  {sub.evidence_file_name && (
                                    <div className="text-blue-700 font-semibold flex items-center gap-1 pt-0.5">
                                      <Paperclip className="w-3 h-3" />
                                      <span className="truncate">{sub.evidence_file_name}</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* FOOTER ACTIONS (Matching Image 2) */}
                    <div className="flex flex-wrap items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setExpandedTaskId(null)}
                        className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs sm:text-sm font-bold hover:bg-slate-100 transition cursor-pointer"
                      >
                        Hủy bỏ
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSaveEvidence(task, true)}
                        disabled={isSubmitting}
                        className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
                        title="Lưu tạm tiến độ và minh chứng mà không gửi đánh giá"
                      >
                        {isSubmitting ? 'Đang lưu...' : 'Lưu bản nháp'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSaveEvidence(task, false)}
                        disabled={isSubmitting}
                        className="px-5 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs sm:text-sm font-bold transition shadow-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
                        title="Gửi minh chứng chính thức đến người đánh giá"
                      >
                        <Send className="w-4 h-4" />
                        <span>{isSubmitting ? 'Đang gửi...' : 'Gửi đánh giá'}</span>
                      </button>
                    </div>

                  </div>
                )}

              </div>
            );
          })
        )}
      </div>

      {/* 4. MODAL XEM PHÂN CÔNG (Matching requirement) */}
      {assignmentDetailTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-red-50/80">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-red-700" />
                <h3 className="text-sm sm:text-base font-bold text-slate-900">Chi tiết phân công nhiệm vụ</h3>
              </div>
              <button
                type="button"
                onClick={() => setAssignmentDetailTask(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs sm:text-sm">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Tên nhiệm vụ</span>
                <p className="font-extrabold text-slate-900 text-sm sm:text-base leading-snug">
                  {assignmentDetailTask.task_name}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-800 text-xs font-bold">
                    {assignmentDetailTask.axis_code || 'TRUC_1'}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-bold">
                    {assignmentDetailTask.task_type || 'Thường xuyên'}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold">
                    {assignmentDetailTask.origin === 'assigned' ? 'Lãnh đạo giao' : 'Tự đăng ký'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-[11px] text-slate-400 uppercase block font-bold">Người giao việc</span>
                  <span className="font-bold text-slate-800 block">{assignmentDetailTask.assigner_name || 'Lãnh đạo đơn vị'}</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-[11px] text-slate-400 uppercase block font-bold">Người thẩm định & chấm điểm</span>
                  <span className="font-bold text-indigo-900 block">{assignmentDetailTask.evaluator_name || assignmentDetailTask.grader_name || 'Lãnh đạo đơn vị'}</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-[11px] text-slate-400 uppercase block font-bold">Hạn hoàn thành</span>
                  <span className="font-extrabold text-red-600 block">{formatDate(assignmentDetailTask.deadline)}</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-[11px] text-slate-400 uppercase block font-bold">Điểm tối đa quy định</span>
                  <span className="font-extrabold text-emerald-700 block">
                    {(assignmentDetailTask.max_converted_score || (assignmentDetailTask.standard_score * assignmentDetailTask.difficulty_weight)).toFixed(1)} điểm
                    <span className="text-xs font-normal text-slate-500"> (Chuẩn: {assignmentDetailTask.standard_score}đ × HS: {assignmentDetailTask.difficulty_weight})</span>
                  </span>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Kết quả đầu ra yêu cầu</span>
                <p className="font-semibold text-slate-800 leading-relaxed">
                  {assignmentDetailTask.output_result || 'Văn bản / Kế hoạch / Báo cáo hoàn thành'}
                </p>
              </div>

              {assignmentDetailTask.extension_count > 0 && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs">
                  ℹ️ Nhiệm vụ này đã được phê duyệt gia hạn <strong>{assignmentDetailTask.extension_count} lần</strong>.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end p-4 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAssignmentDetailTask(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs sm:text-sm font-bold transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL CBNV XIN GIA HẠN CÔNG VIỆC */}
      {extensionModalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-amber-50/80">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm sm:text-base font-bold text-slate-900">Yêu cầu xin gia hạn tiến độ công việc</h3>
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
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1">
                    Thời hạn mới đề xuất <span className="text-red-500">*</span>:
                  </label>
                  <input
                    type="date"
                    required
                    value={requestedDeadline}
                    onChange={(e) => setRequestedDeadline(e.target.value)}
                    min={toInputDateFormat(new Date().toISOString().split('T')[0])}
                    className="w-full text-xs sm:text-sm p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-semibold text-slate-800"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Hạn mới đề xuất phải sau ngày hạn hiện tại ({formatDate(extensionModalTask.deadline)}).
                  </p>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1">
                    Lý do xin gia hạn <span className="text-red-500">*</span>:
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={extensionReason}
                    onChange={(e) => setExtensionReason(e.target.value)}
                    placeholder="Nhập chi tiết khó khăn, nguyên nhân cần gia hạn thời gian hoàn thành..."
                    className="w-full text-xs sm:text-sm p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-normal"
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
                  className="px-3.5 py-1.5 rounded-xl border border-slate-300 text-slate-700 text-xs sm:text-sm font-semibold hover:bg-slate-100 cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExtension || !requestedDeadline || !extensionReason.trim()}
                  className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingExtension ? 'Đang gửi...' : 'Gửi yêu cầu gia hạn'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL PHẢN HỒI Ý KIẾN ĐÁNH GIÁ (BƯỚC 4) */}
      {feedbackTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-purple-50/80">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm sm:text-base font-bold text-slate-900">Phản hồi ý kiến về kết quả đánh giá (Bước 4)</h3>
              </div>
              <button
                type="button"
                onClick={() => setFeedbackTask(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs sm:text-sm">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-800">{feedbackTask.task_name}</div>
                <div className="text-slate-500">
                  Người đánh giá: <strong>{feedbackTask.evaluator_name || feedbackTask.grader_name || 'Lãnh đạo đơn vị'}</strong>
                </div>
              </div>

              <form onSubmit={handleSubmitEvalFeedback} className="space-y-3">
                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1">
                    Nội dung phản hồi / kiến nghị giải trình của Cán bộ *:
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={evalFeedbackText}
                    onChange={(e) => setEvalFeedbackText(e.target.value)}
                    placeholder="Nhập lý do không đồng tình hoặc căn cứ thực tế giải trình để Lãnh đạo xem xét điều chỉnh điểm đánh giá..."
                    className="w-full text-xs sm:text-sm p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    💡 Sau khi bạn gửi phản hồi, Lãnh đạo sẽ nhận được thông báo tại màn hình thẩm định để xem xét và thực hiện "Sửa đánh giá" theo quy định.
                  </p>
                </div>

                <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setFeedbackTask(null)}
                    className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submittingFeedback}
                    className="px-5 py-2 text-xs sm:text-sm font-bold bg-purple-700 hover:bg-purple-800 text-white rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{submittingFeedback ? 'Đang gửi...' : 'Gửi phản hồi đánh giá'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
