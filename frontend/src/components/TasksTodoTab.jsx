import React, { useState, useEffect, useMemo } from 'react';
import { 
  ClipboardList, 
  Search, 
  Filter, 
  Plus, 
  Clock, 
  Award, 
  AlertTriangle, 
  MessageSquare, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  Check, 
  X, 
  LayoutGrid, 
  Calendar, 
  User, 
  Briefcase, 
  FileText, 
  ShieldCheck, 
  ChevronDown,
  RefreshCw,
  Send,
  AlertCircle
} from 'lucide-react';
import { api } from '../api';
import { formatDate, toInputDateFormat } from '../constants';
import { getUserPermissions } from '../permissions';

export default function TasksTodoTab({
  selectedPeriod,
  onPeriodChange,
  periods = [],
  currentUser,
  users = [],
  departments = [],
  axes = [],
  setCurrentTab
}) {
  const userPerms = getUserPermissions(currentUser);
  const isCBQL = Boolean(userPerms.isManager || userPerms.isAdmin || userPerms.canAssignTasks || userPerms.canGradeTasks);

  // Filter states
  const [tasks, setTasks] = useState([]);
  const [standardTasks, setStandardTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState('all'); // 'all', 'pending_approval', 'submitted', 'feedback', 'assigned', 'overdue', 'history'
  const [selectedPosition, setSelectedPosition] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);
  const [selectedDept, setSelectedDept] = useState('all');
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);

  // Modal states
  const [showQuickAssignModal, setShowQuickAssignModal] = useState(false);
  const [viewingTask, setViewingTask] = useState(null);
  const [evaluatingTask, setEvaluatingTask] = useState(null);
  const [evalScore, setEvalScore] = useState(10);
  const [evalNotes, setEvalNotes] = useState('');
  const [actionNotice, setActionNotice] = useState(null);

  // Quick Assign Form
  const [quickAssignForm, setQuickAssignForm] = useState({
    user_id: '',
    standard_task_id: '',
    task_name: '',
    deadline: '2026-12-31',
    quantity: 1,
    notes: '',
    standard_score: 10,
    difficulty_weight: 1.0
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedPeriod) params.period_id = selectedPeriod;
      
      const [assignedData, stdData] = await Promise.all([
        api.getAssignedTasks(params),
        api.getStandardTasks()
      ]);

      setTasks(Array.isArray(assignedData) ? assignedData : []);
      setStandardTasks(Array.isArray(stdData) ? stdData : []);
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu công việc cần xử lý:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedPeriod]);

  // Positions list from users
  const positions = useMemo(() => {
    const set = new Set();
    users.forEach(u => {
      if (u.position) set.add(u.position);
      if (u.title) set.add(u.title);
    });
    return Array.from(set);
  }, [users]);

  // Metric counts
  const now = new Date();
  const metrics = useMemo(() => {
    let pendingApproval = 0;
    let pendingEval = 0;
    let overdue = 0;
    let feedback = 0;

    tasks.forEach(t => {
      // 1. Chờ duyệt đăng ký
      if (t.status === 'pending_approval' || t.status === 'registered') {
        pendingApproval++;
      }
      // 2. Chờ đánh giá nhiệm vụ
      if (t.status === 'submitted') {
        pendingEval++;
      }
      // 3. Quá hạn xử lý
      if (t.deadline) {
        const d = new Date(t.deadline);
        if (d < now && t.status !== 'completed' && t.status !== 'evaluated') {
          overdue++;
        }
      }
      // 4. Cán bộ phản hồi
      if (t.status === 'feedback_submitted' || t.has_feedback || (t.feedback_comment && !t.feedback_resolved)) {
        feedback++;
      }
    });

    return { pendingApproval, pendingEval, overdue, feedback };
  }, [tasks]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      // 1. Filter by SubTab
      if (activeSubTab === 'pending_approval') {
        if (t.status !== 'pending_approval' && t.status !== 'registered') return false;
      } else if (activeSubTab === 'submitted') {
        if (t.status !== 'submitted') return false;
      } else if (activeSubTab === 'feedback') {
        if (t.status !== 'feedback_submitted' && !t.has_feedback && !(t.feedback_comment && !t.feedback_resolved)) return false;
      } else if (activeSubTab === 'assigned') {
        if (t.status !== 'assigned' && t.status !== 'in_progress') return false;
      } else if (activeSubTab === 'overdue') {
        if (!t.deadline) return false;
        const d = new Date(t.deadline);
        if (d >= now || t.status === 'completed' || t.status === 'evaluated') return false;
      } else if (activeSubTab === 'history') {
        if (t.status !== 'completed' && t.status !== 'evaluated' && t.status !== 'rejected') return false;
      }

      // 2. Filter by Position
      if (selectedPosition !== 'all') {
        const u = users.find(user => user.id === t.user_id);
        if (!u || (u.position !== selectedPosition && u.title !== selectedPosition)) return false;
      }

      // 3. Filter by Department
      if (selectedDept !== 'all') {
        const u = users.find(user => user.id === t.user_id);
        if (!u || u.department_id !== selectedDept) return false;
      }

      // 4. Filter by Search Term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchName = t.task_name?.toLowerCase().includes(term);
        const matchUser = t.user_name?.toLowerCase().includes(term);
        const matchCode = t.task_code?.toLowerCase().includes(term);
        if (!matchName && !matchUser && !matchCode) return false;
      }

      return true;
    });
  }, [tasks, activeSubTab, selectedPosition, selectedDept, searchTerm, users]);

  // Pagination
  const totalPages = Math.ceil(filteredTasks.length / pageSize) || 1;
  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTasks.slice(start, start + pageSize);
  }, [filteredTasks, currentPage, pageSize]);

  // Handle Select All Checkbox
  const toggleSelectAll = () => {
    if (selectedTaskIds.length === paginatedTasks.length && paginatedTasks.length > 0) {
      setSelectedTaskIds([]);
    } else {
      setSelectedTaskIds(paginatedTasks.map(t => t.id));
    }
  };

  const toggleSelectTask = (id) => {
    setSelectedTaskIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Quick Approve / Reject for self-registered task
  const handleApproveTask = async (task) => {
    try {
      await api.approveTask(task.id, {
        status: 'approved',
        approved_by: currentUser?.id
      });
      setActionNotice({ type: 'success', text: `Đã phê duyệt nhiệm vụ "${task.task_name}"!` });
      loadData();
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err) {
      alert(err.message || 'Lỗi khi phê duyệt nhiệm vụ');
    }
  };

  // Quick Evaluate (Chấm điểm)
  const handleSaveEvaluation = async () => {
    if (!evaluatingTask) return;
    try {
      await api.evaluateTask(evaluatingTask.id, {
        manager_score: Number(evalScore),
        manager_notes: evalNotes,
        status: 'evaluated',
        evaluated_by: currentUser?.id
      });
      setActionNotice({ type: 'success', text: `Đã đánh giá thành công nhiệm vụ "${evaluatingTask.task_name}"!` });
      setEvaluatingTask(null);
      loadData();
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err) {
      alert(err.message || 'Lỗi khi lưu kết quả đánh giá');
    }
  };

  // Quick Assign Submit
  const handleQuickAssignSubmit = async (e) => {
    e.preventDefault();
    if (!quickAssignForm.user_id) {
      alert('Vui lòng chọn cán bộ nhận nhiệm vụ!');
      return;
    }
    if (!quickAssignForm.task_name && !quickAssignForm.standard_task_id) {
      alert('Vui lòng chọn hoặc nhập tên nhiệm vụ!');
      return;
    }

    try {
      const payload = {
        period_id: selectedPeriod,
        user_id: quickAssignForm.user_id,
        task_name: quickAssignForm.task_name,
        standard_task_id: quickAssignForm.standard_task_id || null,
        deadline: quickAssignForm.deadline,
        standard_score: 10,
        difficulty_weight: Number(quickAssignForm.difficulty_weight) || 1.0,
        task_type: 'Thường xuyên',
        assigned_by: currentUser?.id,
        notes: quickAssignForm.notes
      };

      await api.assignTask(payload);
      setActionNotice({ type: 'success', text: 'Đã giao nhiệm vụ nhanh thành công!' });
      setShowQuickAssignModal(false);
      setQuickAssignForm({
        user_id: '',
        standard_task_id: '',
        task_name: '',
        deadline: '2026-12-31',
        quantity: 1,
        notes: '',
        standard_score: 10,
        difficulty_weight: 1.0
      });
      loadData();
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err) {
      alert(err.message || 'Lỗi khi giao nhiệm vụ');
    }
  };

  // Helper status badge renderer
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'pending_approval':
      case 'registered':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <Clock className="w-3 h-3 text-amber-600" />
            Chờ duyệt đăng ký
          </span>
        );
      case 'submitted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-300">
            <Award className="w-3 h-3 text-blue-600" />
            Chờ đánh giá
          </span>
        );
      case 'evaluated':
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Đã hoàn thành
          </span>
        );
      case 'feedback_submitted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-300">
            <MessageSquare className="w-3 h-3 text-purple-600" />
            Cán bộ phản hồi
          </span>
        );
      case 'assigned':
      case 'in_progress':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <Clock className="w-3 h-3 text-slate-500" />
            Đang thực hiện
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast Notice */}
      {actionNotice && (
        <div className={`p-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between shadow-sm border transition-all ${
          actionNotice.type === 'success' 
            ? 'bg-emerald-50 border-emerald-300 text-emerald-800' 
            : 'bg-red-50 border-red-300 text-red-800'
        }`}>
          <div className="flex items-center gap-2">
            {actionNotice.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <span>{actionNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="text-slate-400 hover:text-slate-700 font-bold ml-3 text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. Breadcrumb */}
      <div className="flex items-center gap-2 text-xs pb-1 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setCurrentTab ? setCurrentTab('dashboard') : window.history.back()}
          className="w-6 h-6 rounded-full bg-red-700 text-white flex items-center justify-center font-bold text-[10px] shadow-xs hover:bg-red-800 transition shrink-0 cursor-pointer"
          title="Quay lại Bảng điều khiển"
        >
          «
        </button>
        <div className="flex items-center gap-1 font-semibold truncate">
          <span 
            onClick={() => setCurrentTab ? setCurrentTab('dashboard') : null}
            className="text-slate-500 hover:text-red-700 cursor-pointer transition"
          >
            Trang chủ
          </span>
          <span className="text-slate-400">&gt;</span>
          <span className="text-red-700 font-bold">Công việc cần xử lý</span>
        </div>
      </div>

      {/* 2. Top Filter / Quick Action Bar (Đúng Ảnh 1) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Dropdown 1: Tất cả vị trí công tác */}
          <div className="relative min-w-[200px]">
            <select
              value={selectedPosition}
              onChange={(e) => setSelectedPosition(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-red-500 transition cursor-pointer"
            >
              <option value="all">Tất cả vị trí công tác</option>
              {positions.map(pos => (
                <option key={pos} value={pos}>{pos}</option>
              ))}
            </select>
          </div>

          {/* Dropdown 2: Bộ chọn kỳ đánh giá */}
          <div className="relative min-w-[240px]">
            <select
              value={selectedPeriod}
              onChange={(e) => onPeriodChange && onPeriodChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-red-500 transition cursor-pointer"
            >
              {periods.map(p => (
                <option key={p.id} value={p.id}>
                  (Chính thức){p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Nút bên phải: + Giao nhiệm vụ nhanh */}
        {isCBQL && (
          <button
            type="button"
            onClick={() => setShowQuickAssignModal(true)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-lg shadow-sm transition shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Giao nhiệm vụ nhanh</span>
          </button>
        )}
      </div>

      {/* 3. 4 Metric Cards (Đúng Ảnh 1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Chờ duyệt đăng ký (Vàng) */}
        <div 
          onClick={() => setActiveSubTab('pending_approval')}
          className={`p-4 rounded-xl border transition-all cursor-pointer select-none bg-amber-50/50 hover:bg-amber-100/60 ${
            activeSubTab === 'pending_approval' ? 'border-amber-500 ring-2 ring-amber-300 shadow-sm' : 'border-amber-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-800">{metrics.pendingApproval}</div>
              <div className="text-xs font-semibold text-slate-600">Chờ duyệt đăng ký</div>
            </div>
          </div>
        </div>

        {/* Card 2: Chờ đánh giá nhiệm vụ (Xanh dương) */}
        <div 
          onClick={() => setActiveSubTab('submitted')}
          className={`p-4 rounded-xl border transition-all cursor-pointer select-none bg-blue-50/50 hover:bg-blue-100/60 ${
            activeSubTab === 'submitted' ? 'border-blue-500 ring-2 ring-blue-300 shadow-sm' : 'border-blue-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-800">{metrics.pendingEval}</div>
              <div className="text-xs font-semibold text-slate-600">Chờ đánh giá nhiệm vụ</div>
            </div>
          </div>
        </div>

        {/* Card 3: Quá hạn xử lý (Đỏ) */}
        <div 
          onClick={() => setActiveSubTab('overdue')}
          className={`p-4 rounded-xl border transition-all cursor-pointer select-none bg-rose-50/50 hover:bg-rose-100/60 ${
            activeSubTab === 'overdue' ? 'border-rose-500 ring-2 ring-rose-300 shadow-sm' : 'border-rose-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-800">{metrics.overdue}</div>
              <div className="text-xs font-semibold text-slate-600">Quá hạn xử lý</div>
            </div>
          </div>
        </div>

        {/* Card 4: Cán bộ phản hồi (Tím) */}
        <div 
          onClick={() => setActiveSubTab('feedback')}
          className={`p-4 rounded-xl border transition-all cursor-pointer select-none bg-purple-50/50 hover:bg-purple-100/60 ${
            activeSubTab === 'feedback' ? 'border-purple-500 ring-2 ring-purple-300 shadow-sm' : 'border-purple-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-800">{metrics.feedback}</div>
              <div className="text-xs font-semibold text-slate-600">Cán bộ phản hồi</div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Sub-tabs lọc trạng thái (Đúng Ảnh 1) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="flex items-center gap-1 px-3 pt-2 border-b border-slate-200 overflow-x-auto scrollbar-none">
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'pending_approval', label: `Chờ duyệt (${metrics.pendingApproval})` },
            { id: 'submitted', label: `Chờ đánh giá (${metrics.pendingEval})` },
            { id: 'feedback', label: `Phản hồi (${metrics.feedback})` },
            { id: 'assigned', label: 'Nhiệm vụ đã phân công' },
            { id: 'overdue', label: `Quá hạn xử lý (${metrics.overdue})` },
            { id: 'history', label: 'Lịch sử xử lý' }
          ].map(tab => {
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveSubTab(tab.id);
                  setCurrentPage(1);
                }}
                className={`px-3.5 py-2.5 text-xs font-bold transition whitespace-nowrap border-b-2 cursor-pointer ${
                  isActive
                    ? 'border-red-700 text-red-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* 5. Search Bar & Advanced Filter Button */}
        <div className="p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-100">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="🔍 Tìm theo nội dung nhiệm vụ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-xs placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAdvancedFilterOpen(!advancedFilterOpen)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition border cursor-pointer ${
                advancedFilterOpen || selectedDept !== 'all'
                  ? 'bg-red-50 border-red-700 text-red-700'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>⚙ Bộ lọc nâng cao</span>
            </button>
          </div>
        </div>

        {/* Drawer bộ lọc nâng cao */}
        {advancedFilterOpen && (
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Phòng ban / Bộ phận:</label>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
              >
                <option value="all">Tất cả phòng ban</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setSelectedDept('all');
                  setSelectedPosition('all');
                  setSearchTerm('');
                }}
                className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition"
              >
                🗑 Xoá lọc
              </button>
            </div>
          </div>
        )}

        {/* 6. Bảng danh sách công việc cần xử lý */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px]">
                <th className="p-2.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={paginatedTasks.length > 0 && selectedTaskIds.length === paginatedTasks.length}
                    onChange={toggleSelectAll}
                    className="rounded text-red-700 focus:ring-red-500 cursor-pointer"
                  />
                </th>
                <th className="p-2.5 w-12 text-center">STT</th>
                <th className="p-2.5 min-w-[220px]">Tên nhiệm vụ</th>
                <th className="p-2.5 min-w-[150px]">Tên cán bộ</th>
                <th className="p-2.5 min-w-[120px]">Loại</th>
                <th className="p-2.5 min-w-[90px] text-center">Điểm tối đa</th>
                <th className="p-2.5 min-w-[110px] text-center">Hạn hoàn thành</th>
                <th className="p-2.5 min-w-[130px] text-center">Ngày gửi duyệt / gửi đánh giá</th>
                <th className="p-2.5 min-w-[130px] text-center">Trạng thái</th>
                <th className="p-2.5 min-w-[100px] text-center">Điểm tự ĐG</th>
                <th className="p-2.5 min-w-[120px] text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-red-700" />
                    Đang tải dữ liệu công việc cần xử lý...
                  </td>
                </tr>
              ) : paginatedTasks.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 mb-3">
                        <ClipboardList className="w-8 h-8" />
                      </div>
                      <span className="font-semibold text-slate-500 text-sm">Không có công việc cần xử lý</span>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedTasks.map((task, index) => {
                  const stt = (currentPage - 1) * pageSize + index + 1;
                  const maxScore = (task.standard_score || 10) * (task.difficulty_weight || 1.0);
                  const isOverdue = task.deadline && new Date(task.deadline) < now && task.status !== 'completed' && task.status !== 'evaluated';

                  return (
                    <tr key={task.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedTaskIds.includes(task.id)}
                          onChange={() => toggleSelectTask(task.id)}
                          className="rounded text-red-700 focus:ring-red-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-2.5 text-center font-bold text-slate-600">{stt}</td>
                      <td className="p-2.5">
                        <div className="font-bold text-slate-800 line-clamp-2">{task.task_name}</div>
                        {task.task_code && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">{task.task_code}</div>
                        )}
                      </td>
                      <td className="p-2.5 font-semibold text-slate-700">
                        {task.user_name || 'Chưa gán'}
                      </td>
                      <td className="p-2.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                          ● Thường xuyên
                        </span>
                      </td>
                      <td className="p-2.5 text-center font-bold text-red-700">
                        {maxScore.toFixed(1)}
                      </td>
                      <td className="p-2.5 text-center">
                        <span className={`font-semibold ${isOverdue ? 'text-rose-600' : 'text-slate-600'}`}>
                          {task.deadline ? formatDate(task.deadline) : '—'}
                        </span>
                      </td>
                      <td className="p-2.5 text-center text-slate-600">
                        {task.submitted_at ? formatDate(task.submitted_at) : (task.created_at ? formatDate(task.created_at) : '—')}
                      </td>
                      <td className="p-2.5 text-center">
                        {renderStatusBadge(task.status)}
                      </td>
                      <td className="p-2.5 text-center font-bold text-blue-700">
                        {task.self_score !== null && task.self_score !== undefined ? Number(task.self_score).toFixed(1) : '—'}
                      </td>
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Nút Xem chi tiết */}
                          <button
                            type="button"
                            onClick={() => setViewingTask(task)}
                            className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition cursor-pointer"
                            title="Xem chi tiết nhiệm vụ"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Nút Phê duyệt nhanh nếu là chờ duyệt */}
                          {(task.status === 'pending_approval' || task.status === 'registered') && isCBQL && (
                            <button
                              type="button"
                              onClick={() => handleApproveTask(task)}
                              className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded transition cursor-pointer"
                              title="Phê duyệt nhanh nhiệm vụ này"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}

                          {/* Nút Chấm điểm nếu đã nộp */}
                          {task.status === 'submitted' && isCBQL && (
                            <button
                              type="button"
                              onClick={() => {
                                setEvaluatingTask(task);
                                setEvalScore(task.self_score || 10);
                                setEvalNotes('');
                              }}
                              className="p-1 text-red-700 hover:text-red-900 hover:bg-red-50 rounded transition cursor-pointer"
                              title="Đánh giá, chấm điểm nhiệm vụ"
                            >
                              <ShieldCheck className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 7. Footer & Pagination */}
        <div className="p-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 text-xs text-slate-500">
          <div>
            {filteredTasks.length === 0 ? (
              <span>Không có kết quả</span>
            ) : (
              <span>
                Hiển thị <b>{(currentPage - 1) * pageSize + 1}</b> - <b>{Math.min(currentPage * pageSize, filteredTasks.length)}</b> trên tổng <b>{filteredTasks.length}</b> nhiệm vụ
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span>Hiển thị:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="p-1 bg-white border border-slate-300 rounded text-xs font-semibold focus:outline-hidden"
              >
                <option value={10}>10/trang</option>
                <option value={20}>20/trang</option>
                <option value={50}>50/trang</option>
              </select>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40 hover:bg-slate-100 cursor-pointer"
                >
                  ‹
                </button>
                <span className="font-bold text-slate-700 px-1">{currentPage} / {totalPages}</span>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40 hover:bg-slate-100 cursor-pointer"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 8. Floating Action Button (FAB) đỏ góc dưới bên phải */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          type="button"
          onClick={() => setShowQuickAssignModal(true)}
          className="w-12 h-12 rounded-full bg-red-700 hover:bg-red-800 text-white flex items-center justify-center shadow-lg transition transform hover:scale-105 cursor-pointer"
          title="Tiện ích tác vụ nhanh"
        >
          <LayoutGrid className="w-5 h-5" />
        </button>
      </div>

      {/* Modal 1: Giao nhiệm vụ nhanh */}
      {showQuickAssignModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 bg-red-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5" />
                <h3 className="font-bold text-sm">Giao nhiệm vụ nhanh cho cán bộ</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickAssignModal(false)}
                className="text-white/80 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickAssignSubmit} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Chọn cán bộ nhận việc <span className="text-red-600">*</span>:
                </label>
                <select
                  required
                  value={quickAssignForm.user_id}
                  onChange={(e) => setQuickAssignForm({ ...quickAssignForm, user_id: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 font-semibold"
                >
                  <option value="">-- Chọn cán bộ tiếp nhận --</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.position || u.role || 'Cán bộ'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Chọn từ danh mục chuẩn:</label>
                <select
                  value={quickAssignForm.standard_task_id}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const found = standardTasks.find(s => s.id === selectedId);
                    if (found) {
                      setQuickAssignForm({
                        ...quickAssignForm,
                        standard_task_id: selectedId,
                        task_name: found.task_name,
                        deadline: found.deadline || '2026-12-31',
                        difficulty_weight: found.difficulty_weight || 1.0
                      });
                    } else {
                      setQuickAssignForm({
                        ...quickAssignForm,
                        standard_task_id: ''
                      });
                    }
                  }}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
                >
                  <option value="">-- Chọn công việc chuẩn có sẵn --</option>
                  {standardTasks.map(st => (
                    <option key={st.id} value={st.id}>
                      {st.task_name} (Hệ số: {st.difficulty_weight || 1.0})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Tên nhiệm vụ <span className="text-red-600">*</span>:
                </label>
                <textarea
                  required
                  rows={2}
                  value={quickAssignForm.task_name}
                  onChange={(e) => setQuickAssignForm({ ...quickAssignForm, task_name: e.target.value })}
                  placeholder="Nhập nội dung nhiệm vụ..."
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Hạn hoàn thành:</label>
                  <input
                    type="date"
                    required
                    value={quickAssignForm.deadline}
                    onChange={(e) => setQuickAssignForm({ ...quickAssignForm, deadline: e.target.value })}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Hệ số độ khó (HSĐK):</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1.0"
                    max="3.0"
                    value={quickAssignForm.difficulty_weight}
                    onChange={(e) => setQuickAssignForm({ ...quickAssignForm, difficulty_weight: e.target.value })}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Ghi chú / Hướng dẫn thêm:</label>
                <input
                  type="text"
                  value={quickAssignForm.notes}
                  onChange={(e) => setQuickAssignForm({ ...quickAssignForm, notes: e.target.value })}
                  placeholder="Ghi chú thêm nếu có..."
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowQuickAssignModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold shadow-xs cursor-pointer"
                >
                  Phân công ngay
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Xem chi tiết nhiệm vụ */}
      {viewingTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-800 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Chi tiết nhiệm vụ cần xử lý</h3>
              <button
                type="button"
                onClick={() => setViewingTask(null)}
                className="text-white/80 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div>
                <div className="text-slate-400 font-bold uppercase text-[10px]">Tên nhiệm vụ:</div>
                <div className="font-bold text-slate-800 text-sm mt-0.5">{viewingTask.task_name}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[10px]">Cán bộ thực hiện:</div>
                  <div className="font-semibold text-slate-700 mt-0.5">{viewingTask.user_name}</div>
                </div>
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[10px]">Loại nhiệm vụ:</div>
                  <div className="font-semibold text-red-700 mt-0.5">● Thường xuyên</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[10px]">Hạn hoàn thành:</div>
                  <div className="font-semibold text-slate-700 mt-0.5">{formatDate(viewingTask.deadline)}</div>
                </div>
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[10px]">Trạng thái:</div>
                  <div className="mt-0.5">{renderStatusBadge(viewingTask.status)}</div>
                </div>
              </div>
              {viewingTask.evidence_file && (
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[10px]">Minh chứng nộp:</div>
                  <div className="mt-1">
                    <a
                      href={viewingTask.evidence_file}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-semibold"
                    >
                      📎 Xem tệp minh chứng đính kèm
                    </a>
                  </div>
                </div>
              )}
              {viewingTask.self_notes && (
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[10px]">Ghi chú tự đánh giá:</div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 mt-1">
                    {viewingTask.self_notes}
                  </div>
                </div>
              )}
              <div className="pt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setViewingTask(null)}
                  className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 font-bold text-slate-700 rounded-lg cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Đánh giá / Chấm điểm nhanh */}
      {evaluatingTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="p-4 bg-red-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" />
                <h3 className="font-bold text-sm">Đánh giá, chấm điểm nhiệm vụ</h3>
              </div>
              <button
                type="button"
                onClick={() => setEvaluatingTask(null)}
                className="text-white/80 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3.5 text-xs">
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Nhiệm vụ:</div>
                <div className="font-bold text-slate-800 text-sm">{evaluatingTask.task_name}</div>
              </div>
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-[11px] font-semibold text-blue-800">
                  Cán bộ tự đánh giá: <b>{evaluatingTask.self_score ?? 10} điểm</b>
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Điểm đánh giá của Lãnh đạo:</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="10"
                  value={evalScore}
                  onChange={(e) => setEvalScore(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg font-bold text-red-700 text-sm focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nhận xét, ý kiến đánh giá:</label>
                <textarea
                  rows={2}
                  value={evalNotes}
                  onChange={(e) => setEvalNotes(e.target.value)}
                  placeholder="Nhập nhận xét nếu có..."
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEvaluatingTask(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleSaveEvaluation}
                  className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold shadow-xs cursor-pointer"
                >
                  Lưu kết quả đánh giá
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
