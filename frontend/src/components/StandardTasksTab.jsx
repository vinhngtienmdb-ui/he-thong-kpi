import React, { useEffect, useState } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  Download,
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertCircle,
  AlertTriangle,
  Clock,
  Layers,
  Sparkles,
  SquarePen,
  UserPlus,
  Users,
  Ban,
  Trash2,
  Check,
  X,
  UserCheck,
  Eye
} from 'lucide-react';
import { api } from '../api';
import { OUTPUT_RESULT_OPTIONS, formatDate, toInputDateFormat } from '../constants';

export default function StandardTasksTab({ 
  selectedPeriod, 
  axes = [], 
  currentUser, 
  users = [], 
  departments = [],
  onAssignTask 
}) {
  const isCBQL = currentUser?.role === 'cbql' || currentUser?.role === 'admin';
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAxis, setSelectedAxis] = useState('');
  const [selectedOutputResult, setSelectedOutputResult] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [customOutputResult, setCustomOutputResult] = useState('');
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);

  // Action Modals State (Xem / Sửa / Giao việc / Khóa / Xóa)
  const [viewingTask, setViewingTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editCustomOutput, setEditCustomOutput] = useState('');

  const [assigningTask, setAssigningTask] = useState(null);
  const [assignForm, setAssignForm] = useState({
    user_ids: [],
    deadline: '',
    quantity: 1,
    notes: ''
  });
  const [assignUserSearch, setAssignUserSearch] = useState('');

  // Bulk Assignment Modal State
  const [isBulkAssignModalOpen, setIsBulkAssignModalOpen] = useState(false);
  const [bulkAssignDeadline, setBulkAssignDeadline] = useState('2026-09-30');
  const [bulkAssignUserIds, setBulkAssignUserIds] = useState([]);
  const [bulkAssignDeptFilter, setBulkAssignDeptFilter] = useState('');
  const [bulkAssignUserSearch, setBulkAssignUserSearch] = useState('');
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);

  const [lockingTask, setLockingTask] = useState(null);
  const [lockNote, setLockNote] = useState('');

  const [deletingTask, setDeletingTask] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);

  // New task form state
  const [newTask, setNewTask] = useState({
    task_name: '',
    output_result: OUTPUT_RESULT_OPTIONS[0],
    deadline: '2026-09-30',
    task_type: 'Thường xuyên',
    standard_score: 10,
    difficulty_weight: 1.0,
    expected_evidence: '',
    axis_code: 'TRUC_1',
    dept_code: 'A29.123.22',
  });

  useEffect(() => {
    loadTasks();
  }, [selectedPeriod, selectedAxis]);

  async function loadTasks() {
    try {
      setLoading(true);
      const params = {};
      if (selectedPeriod) params.period_id = selectedPeriod;
      if (selectedAxis) params.axis_code = selectedAxis;
      const data = await api.getStandardTasks(params);
      setTasks(data);
    } catch (err) {
      console.error('Error fetching standard tasks:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport(useDefault = false) {
    try {
      setImporting(true);
      setImportMessage(null);
      const formData = new FormData();
      formData.append('period_id', selectedPeriod);
      if (!useDefault && selectedFile) {
        formData.append('file', selectedFile);
      }
      const res = await api.importStandardTasks(formData);
      if (res.success) {
        setImportMessage({ type: 'success', text: res.message });
        loadTasks();
        setTimeout(() => setShowImportModal(false), 2000);
      } else {
        setImportMessage({ type: 'error', text: res.message });
      }
    } catch (err) {
      setImportMessage({ type: 'error', text: err.message });
    } finally {
      setImporting(false);
    }
  }

  async function handleCreateTask(e) {
    e.preventDefault();
    try {
      const finalOutput = newTask.output_result === 'Khác' && customOutputResult.trim()
        ? `Khác: ${customOutputResult.trim()}`
        : newTask.output_result;

      await api.createStandardTask({
        ...newTask,
        output_result: finalOutput,
        period_id: selectedPeriod
      });
      setShowAddModal(false);
      setCustomOutputResult('');
      setActionNotice({ type: 'success', text: `Đã thêm công việc "${newTask.task_name}" vào danh mục chuẩn!` });
      loadTasks();
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err) {
      alert(err.message);
    }
  }

  // SỬA CÔNG VIỆC (Edit)
  const handleOpenEdit = (task) => {
    setEditingTask(task);
    const isCustom = !OUTPUT_RESULT_OPTIONS.includes(task.output_result);
    setEditForm({
      task_name: task.task_name || '',
      output_result: isCustom ? 'Khác' : (task.output_result || OUTPUT_RESULT_OPTIONS[0]),
      deadline: task.deadline || '2026-09-30',
      task_type: task.task_type || 'Thường xuyên',
      standard_score: task.standard_score || 10,
      difficulty_weight: task.difficulty_weight || 1.0,
      expected_evidence: task.expected_evidence || '',
      axis_code: task.axis_code || 'TRUC_1',
      status: task.status || 'Hoạt động'
    });
    setEditCustomOutput(isCustom ? (task.output_result || '').replace('Khác: ', '') : '');
  };

  const handleSaveEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editingTask || !editForm) return;
    try {
      const finalOutput = editForm.output_result === 'Khác' && editCustomOutput.trim()
        ? `Khác: ${editCustomOutput.trim()}`
        : editForm.output_result;

      await api.updateStandardTask(editingTask.id, {
        ...editForm,
        output_result: finalOutput
      });
      setActionNotice({ type: 'success', text: `Đã cập nhật công việc "${editForm.task_name}" thành công!` });
      setEditingTask(null);
      setEditForm(null);
      loadTasks();
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err) {
      alert(err.message || 'Lỗi khi cập nhật công việc');
    }
  };

  const handleCancelEdit = () => {
    if (!editingTask) return;
    handleOpenEdit(editingTask);
  };

  const handleBackEdit = () => {
    setEditingTask(null);
    setEditForm(null);
  };

  // GIAO VIỆC (Assign - Phân công 1 hoặc nhiều người)
  const handleOpenAssign = (task) => {
    setAssigningTask(task);
    setAssignUserSearch('');
    const defaultIds = (users && users.length > 0) ? [users[0].id] : [];
    setAssignForm({
      user_ids: defaultIds,
      deadline: task.deadline || '2026-09-30',
      quantity: 1,
      notes: ''
    });
  };

  const handleToggleAssignUser = (userId) => {
    setAssignForm(prev => {
      const current = prev.user_ids || [];
      if (current.includes(userId)) {
        return { ...prev, user_ids: current.filter(id => id !== userId) };
      } else {
        return { ...prev, user_ids: [...current, userId] };
      }
    });
  };

  const handleSelectAllAssignUsers = () => {
    if (assignForm.user_ids.length === users.length) {
      setAssignForm(prev => ({ ...prev, user_ids: [] }));
    } else {
      setAssignForm(prev => ({ ...prev, user_ids: users.map(u => u.id) }));
    }
  };

  const handleSaveAssign = async (e) => {
    if (e) e.preventDefault();
    if (!assigningTask) return;
    if (!assignForm.user_ids || assignForm.user_ids.length === 0) {
      alert('Vui lòng chọn ít nhất 1 cán bộ nhận nhiệm vụ!');
      return;
    }
    try {
      const res = await api.assignTask({
        period_id: selectedPeriod,
        user_ids: assignForm.user_ids,
        standard_task_id: assigningTask.id,
        task_name: assigningTask.task_name,
        output_result: assigningTask.output_result,
        deadline: assignForm.deadline,
        task_type: assigningTask.task_type || 'Thường xuyên',
        standard_score: assigningTask.standard_score,
        difficulty_weight: assigningTask.difficulty_weight,
        axis_code: assigningTask.axis_code,
        notes: assignForm.notes,
        assigned_by: currentUser?.id,
        quantity: parseFloat(assignForm.quantity) || 1
      });
      const count = assignForm.user_ids.length;
      setActionNotice({ 
        type: 'success', 
        text: res.message || (count > 1 
          ? `Đã phân công nhiệm vụ thành công cho ${count} cán bộ cùng thực hiện!`
          : `Đã phân công nhiệm vụ cho cán bộ thành công!`)
      });
      setAssigningTask(null);
      setAssignUserSearch('');
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err) {
      alert(err.message || 'Lỗi khi phân công nhiệm vụ');
    }
  };

  const handleCancelAssign = () => {
    setAssignForm({
      user_ids: (users && users.length > 0) ? [users[0].id] : [],
      deadline: assigningTask?.deadline || '2026-09-30',
      quantity: 1,
      notes: ''
    });
    setAssignUserSearch('');
  };

  const handleBackAssign = () => {
    setAssigningTask(null);
    setAssignUserSearch('');
  };

  // PHÂN CÔNG HÀNG LOẠT (Bulk Assign: Nhiều việc cho nhiều người)
  const handleOpenBulkAssign = () => {
    if (selectedTaskIds.length === 0) {
      alert('Vui lòng tích chọn ít nhất 1 nhiệm vụ trong danh sách để phân công!');
      return;
    }
    const selectedTasksList = tasks.filter(t => selectedTaskIds.includes(t.id));
    const firstDeadline = selectedTasksList.find(t => t.deadline)?.deadline || '2026-09-30';
    setBulkAssignDeadline(toInputDateFormat(firstDeadline));
    setBulkAssignUserIds([]);
    setBulkAssignDeptFilter('');
    setBulkAssignUserSearch('');
    setIsBulkAssignModalOpen(true);
  };

  const handleToggleBulkAssignUser = (userId) => {
    setBulkAssignUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAllBulkUsers = (filteredUserList) => {
    const visibleIds = filteredUserList.map(u => u.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => bulkAssignUserIds.includes(id));
    if (allSelected) {
      setBulkAssignUserIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setBulkAssignUserIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleRemoveTaskFromBulk = (taskId) => {
    setSelectedTaskIds(prev => {
      const next = prev.filter(id => id !== taskId);
      if (next.length === 0) {
        setIsBulkAssignModalOpen(false);
      }
      return next;
    });
  };

  const handleSaveBulkAssign = async () => {
    if (selectedTaskIds.length === 0) {
      alert('Danh sách nhiệm vụ được chọn đang trống!');
      return;
    }
    if (bulkAssignUserIds.length === 0) {
      alert('Vui lòng chọn ít nhất 1 cán bộ để nhận phân công nhiệm vụ!');
      return;
    }
    try {
      setIsBulkAssigning(true);
      const res = await api.bulkAssignTasks({
        period_id: selectedPeriod,
        task_ids: selectedTaskIds,
        user_ids: bulkAssignUserIds,
        deadline: bulkAssignDeadline,
        assigned_by: currentUser?.id
      });

      setActionNotice({
        type: 'success',
        text: res.message || `Đã phân công thành công ${selectedTaskIds.length} nhiệm vụ cho ${bulkAssignUserIds.length} cán bộ!`
      });
      setIsBulkAssignModalOpen(false);
      setSelectedTaskIds([]);
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err) {
      alert(err.message || 'Lỗi khi thực hiện phân công hàng loạt');
    } finally {
      setIsBulkAssigning(false);
    }
  };

  // TẠM KHÓA / MỞ KHÓA (Toggle Status)
  const handleOpenLock = (task) => {
    setLockingTask(task);
    setLockNote('');
  };

  const handleSaveLock = async () => {
    if (!lockingTask) return;
    try {
      const targetStatus = lockingTask.status === 'Tạm khóa' ? 'Hoạt động' : 'Tạm khóa';
      await api.toggleStandardTaskStatus(lockingTask.id, { status: targetStatus, note: lockNote });
      setActionNotice({ 
        type: 'success', 
        text: `Đã chuyển trạng thái công việc sang "${targetStatus}" thành công!` 
      });
      setLockingTask(null);
      loadTasks();
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err) {
      alert(err.message || 'Lỗi khi cập nhật trạng thái');
    }
  };

  const handleCancelLock = () => {
    setLockNote('');
  };

  const handleBackLock = () => {
    setLockingTask(null);
  };

  // XÓA CÔNG VIỆC (Delete)
  const handleOpenDelete = (task) => {
    setDeletingTask(task);
  };

  const handleSaveDelete = async () => {
    if (!deletingTask) return;
    try {
      await api.deleteStandardTask(deletingTask.id);
      setActionNotice({ 
        type: 'success', 
        text: `Đã xóa công việc "${deletingTask.task_name}" khỏi danh mục chuẩn!` 
      });
      setDeletingTask(null);
      loadTasks();
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err) {
      alert(err.message || 'Lỗi khi xóa công việc');
    }
  };

  const handleCancelDelete = () => {
    setDeletingTask(null);
  };

  const handleBackDelete = () => {
    setDeletingTask(null);
  };

  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.task_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.output_result?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOutput = !selectedOutputResult || t.output_result?.toLowerCase().includes(selectedOutputResult.toLowerCase());
    return matchesSearch && matchesOutput;
  });

  const activeFilterCount = (selectedAxis ? 1 : 0) + (selectedOutputResult ? 1 : 0);

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedAxis('');
    setSelectedOutputResult('');
  };

  const toggleSelectAll = () => {
    if (selectedTaskIds.length === filteredTasks.length && filteredTasks.length > 0) {
      setSelectedTaskIds([]);
    } else {
      setSelectedTaskIds(filteredTasks.map(t => t.id));
    }
  };

  const toggleSelectTask = (id) => {
    setSelectedTaskIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  function formatTaskCode(code, idx) {
    if (!code) {
      const num = String(idx + 1).padStart(5, '0');
      return ['A29.123.22', '2026CV00', num];
    }
    const str = String(code).trim();
    const parts = str.split(/\s+/);
    if (parts.length >= 2) {
      const p1 = parts[0];
      const p2 = parts[1];
      if (p2.length >= 8) {
        return [p1, p2.slice(0, 8), p2.slice(8)];
      }
      return [p1, p2];
    }
    if (str.length > 15) {
      return [str.slice(0, 10), str.slice(10, 18), str.slice(18)].filter(Boolean);
    }
    return [str];
  }

  return (
    <div className="space-y-4">
      {/* Toast / Notification Banner */}
      {actionNotice && (
        <div className={`p-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between shadow-sm border transition-all ${
          actionNotice.type === 'success' 
            ? 'bg-emerald-50 border-emerald-300 text-emerald-800' 
            : 'bg-red-50 border-red-300 text-red-800'
        }`}>
          <div className="flex items-center gap-2.5">
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
            className="text-slate-400 hover:text-slate-700 font-bold ml-3 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. Top Breadcrumb & Action Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-slate-200">
        
        {/* Breadcrumb */}
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
            <span className="text-red-700 font-bold">Danh mục sản phẩm công việc chuẩn đơn vị</span>
          </div>
        </div>

        {/* Action Buttons Group */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Quay lại */}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-red-700 text-red-700 bg-white hover:bg-red-50 text-xs font-bold transition shadow-2xs"
          >
            <span>← Quay lại</span>
          </button>

          {/* Tải file mẫu */}
          <a
            href={api.getStandardTasksTemplateUrl()}
            download="Mau_nhap_danh_muc_cong_viec_chuan.xlsx"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 bg-slate-50 hover:bg-slate-100 text-xs font-bold transition shadow-2xs cursor-pointer"
            title="Tải biểu mẫu Excel chuẩn (.xlsx) để nhập danh mục công việc"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Tải file mẫu</span>
          </a>

          {/* Nhập file (Chỉ CBQL & Admin) */}
          {isCBQL && (
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-red-700 text-red-700 bg-white hover:bg-red-50 text-xs font-bold transition shadow-2xs"
            >
              <span>↑ Nhập file</span>
            </button>
          )}

          {/* Xuất file */}
          <button
            type="button"
            onClick={() => {
              window.open(api.getExportUrl(selectedPeriod, currentUser?.id || 'usr-ql1'), '_blank');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-red-700 text-red-700 bg-white hover:bg-red-50 text-xs font-bold transition shadow-2xs"
          >
            <span>↓ Xuất file</span>
          </button>

          {/* Phân công cho nhiều cán bộ (Chỉ CBQL & Admin) */}
          {isCBQL && (
            <button
              type="button"
              onClick={handleOpenBulkAssign}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs ${
                selectedTaskIds.length > 0
                  ? 'bg-[#c62828] hover:bg-[#b71c1c] text-white shadow-md'
                  : 'bg-slate-100 text-slate-400 border border-slate-200'
              }`}
              title={selectedTaskIds.length > 0 ? `Phân công ${selectedTaskIds.length} nhiệm vụ đã chọn cho cán bộ` : 'Tích chọn các ô checkbox nhiệm vụ bên dưới để phân công hàng loạt'}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Phân công ({selectedTaskIds.length})</span>
            </button>
          )}

          {/* + Thêm mới (Chỉ CBQL & Admin) */}
          {isCBQL && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1 px-4 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-bold transition shadow-sm"
            >
              <span>+ Thêm mới</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
        
        {/* Search text input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Nhập mã hoặc tên"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-xs placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:outline-hidden"
          />
        </div>

        {/* Right Filter Actions */}
        <div className="flex items-center gap-2">
          {/* Bộ lọc nâng cao */}
          <button
            type="button"
            onClick={() => setAdvancedFilterOpen(!advancedFilterOpen)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition border ${
              advancedFilterOpen || activeFilterCount > 0
                ? 'bg-red-50 border-red-700 text-red-700'
                : 'bg-white border-red-700 text-red-700 hover:bg-red-50'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Bộ lọc nâng cao ({activeFilterCount})</span>
          </button>

          {/* Xóa lọc */}
          <button
            type="button"
            onClick={handleResetFilters}
            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition"
          >
            <span>🗑 Xoá lọc</span>
          </button>
        </div>
      </div>

      {/* Advanced Filter Drawer */}
      {advancedFilterOpen && (
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs animate-in fade-in duration-200">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Trục kết quả:</label>
            <select
              value={selectedAxis}
              onChange={(e) => setSelectedAxis(e.target.value)}
              className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
            >
              <option value="">Tất cả 6 Trục</option>
              {axes.map((ax, idx) => (
                <option key={ax.code} value={ax.code}>
                  Trục {idx + 1} - {ax.name.replace(`TRỤC ${idx + 1} - `, '')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Kết quả đầu ra:</label>
            <select
              value={selectedOutputResult}
              onChange={(e) => setSelectedOutputResult(e.target.value)}
              className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
            >
              <option value="">Tất cả Kết quả đầu ra</option>
              {OUTPUT_RESULT_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* 3. Data Table matching exact ICPV layout */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-white text-slate-700 font-semibold border-b border-red-200/70">
              <tr>
                <th className={`px-2 py-3.5 ${isCBQL ? 'w-[3%] min-w-[28px]' : 'w-[1%]'} text-center`}>
                  {isCBQL && (
                    <input
                      type="checkbox"
                      checked={filteredTasks.length > 0 && selectedTaskIds.length === filteredTasks.length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer accent-red-600"
                      title="Chọn tất cả công việc"
                    />
                  )}
                </th>
                <th className="px-2 py-3.5 w-[3%] min-w-[30px] text-center">STT</th>
                <th className="px-2 py-3.5 w-[8.5%] min-w-[78px]">Mã công việc</th>
                <th className="px-3 py-3.5 w-[23%] min-w-[160px]">Tên công việc</th>
                <th className="px-2 py-3.5 w-[8%] min-w-[70px] leading-tight">Kết quả đầu ra</th>
                <th className="px-2 py-3.5 w-[7.5%] min-w-[75px] text-center whitespace-nowrap leading-tight">Thời hạn</th>
                <th className="px-2 py-3.5 w-[7%] min-w-[70px] text-center">Loại</th>
                <th className="px-1 py-3.5 w-[5%] min-w-[45px] text-center leading-tight">Điểm chuẩn</th>
                <th className="px-1 py-3.5 w-[4.5%] min-w-[40px] text-center leading-tight">Hệ số</th>
                <th className="px-1 py-3.5 w-[5.5%] min-w-[50px] text-center leading-tight">Điểm quy đổi</th>
                <th className="px-2 py-3.5 w-[11%] min-w-[95px]">Đơn vị</th>
                <th className="px-2 py-3.5 w-[6.5%] min-w-[65px] text-center leading-tight">Trạng thái</th>
                <th className="px-2 py-3.5 w-[8.5%] min-w-[125px] text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {loading ? (
                <tr>
                  <td colSpan="13" className="text-center py-12 text-slate-400 italic">
                    Đang tải danh mục sản phẩm công việc chuẩn...
                  </td>
                </tr>
              ) : filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan="13" className="text-center py-12 text-slate-400 italic">
                    Không tìm thấy công việc nào phù hợp. Bấm "Thêm mới" hoặc "Nhập file" để tạo dữ liệu.
                  </td>
                </tr>
              ) : (
                filteredTasks.map((t, idx) => {
                  const isDotXuat = t.task_type === 'Đột xuất';
                  const convScore = Number((t.max_converted_score !== undefined && t.max_converted_score !== null 
                    ? t.max_converted_score 
                    : (t.standard_score * (t.difficulty_weight || 1.0))).toFixed(2));
                  const deptName = t.dept_name || 'Chi bộ Trường Mầm non Hoàng Yến';

                  return (
                    <tr 
                      key={t.id} 
                      className={`transition-colors ${selectedTaskIds.includes(t.id) ? 'bg-red-50/70' : 'hover:bg-slate-50/80'}`}
                    >
                      {/* Checkbox chọn */}
                      <td className="px-2 py-3 text-center">
                        {isCBQL && (
                          <input
                            type="checkbox"
                            checked={selectedTaskIds.includes(t.id)}
                            onChange={() => toggleSelectTask(t.id)}
                            className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer accent-red-600"
                          />
                        )}
                      </td>

                      {/* STT */}
                      <td className="px-2 py-3 text-center font-normal text-slate-600">
                        {idx + 1}
                      </td>

                      {/* Mã công việc (wrapped in 2-3 lines like in image) */}
                      <td className="px-2 py-3 font-mono text-[11px] text-slate-700 leading-tight">
                        {formatTaskCode(t.code, idx).map((line, i) => (
                          <div key={i}>{line}</div>
                        ))}
                      </td>

                      {/* Tên công việc */}
                      <td className="px-3 py-3">
                        <div className="font-normal text-slate-800 leading-relaxed text-xs">
                          {t.task_name}
                        </div>
                        {t.expected_evidence && (
                          <div className="text-[11px] text-slate-400 mt-0.5 italic">
                            Minh chứng: {t.expected_evidence}
                          </div>
                        )}
                      </td>

                      {/* Kết quả đầu ra (wrapped naturally) */}
                      <td className="px-2 py-3 text-slate-700 text-xs leading-tight">
                        {t.output_result || 'Báo cáo tổng hợp'}
                      </td>

                      {/* Thời hạn */}
                      <td className="px-2 py-3 text-slate-700 whitespace-nowrap text-center text-xs font-normal">
                        {formatDate(t.deadline)}
                      </td>

                      {/* Loại (⚡ Đột xuất / ● Thường xuyên) */}
                      <td className="px-2 py-3 text-center">
                        {isDotXuat ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#fff2e8] text-[#e05626]">
                            <span className="font-bold">⚡</span> Đột xuất
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#eef4ff] text-[#3b66d1]">
                            <span className="font-bold">●</span> Thường xuyên
                          </span>
                        )}
                      </td>

                      {/* Điểm chuẩn */}
                      <td className="px-1 py-3 text-center font-normal text-slate-700 text-xs">
                        {t.standard_score}
                      </td>

                      {/* Hệ số */}
                      <td className="px-1 py-3 text-center font-normal text-slate-700 text-xs">
                        {t.difficulty_weight || 1}
                      </td>

                      {/* Điểm quy đổi (Bold red) */}
                      <td className="px-1 py-3 text-center font-bold text-red-600 text-xs">
                        {convScore}
                      </td>

                      {/* Đơn vị */}
                      <td className="px-2 py-3 text-slate-700 text-xs leading-tight">
                        {deptName}
                      </td>

                      {/* Trạng thái (Soft green pill for Hoạt động) */}
                      <td className="px-2 py-3 text-center">
                        {t.status === 'Tạm khóa' ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#fef3c7] text-[#b45309]">
                            Tạm khóa
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#e6f8ee] text-[#1e834b]">
                            Hoạt động
                          </span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="px-2 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                          {/* 1. Xem chi tiết (White circle, subtle border) */}
                          <button
                            type="button"
                            onClick={() => setViewingTask(t)}
                            className="w-6.5 h-6.5 sm:w-7 sm:h-7 rounded-full bg-white hover:bg-slate-50 border border-slate-300 text-slate-600 flex items-center justify-center transition shadow-2xs cursor-pointer shrink-0"
                            title="Xem chi tiết công việc"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {isCBQL ? (
                            <>
                              {/* 2. Sửa (Red circle) */}
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(t)}
                                className="w-6.5 h-6.5 sm:w-7 sm:h-7 rounded-full bg-[#cc292b] hover:bg-[#b52022] text-white flex items-center justify-center transition shadow-2xs cursor-pointer shrink-0"
                                title="Chỉnh sửa công việc"
                              >
                                <SquarePen className="w-3.5 h-3.5" />
                              </button>

                              {/* 3. Giao việc / Phân công (Red circle) */}
                              <button
                                type="button"
                                onClick={() => handleOpenAssign(t)}
                                className="w-6.5 h-6.5 sm:w-7 sm:h-7 rounded-full bg-[#cc292b] hover:bg-[#b52022] text-white flex items-center justify-center transition shadow-2xs cursor-pointer shrink-0"
                                title="Phân công / Giao việc cho cán bộ"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                              </button>

                              {/* 4. Tạm khóa / Kích hoạt (Yellow circle) */}
                              <button
                                type="button"
                                onClick={() => handleOpenLock(t)}
                                className="w-6.5 h-6.5 sm:w-7 sm:h-7 rounded-full bg-[#f6c343] hover:bg-[#e0ad2f] text-white flex items-center justify-center transition shadow-2xs cursor-pointer shrink-0"
                                title={t.status === 'Tạm khóa' ? 'Mở khóa công việc' : 'Tạm khóa công việc'}
                              >
                                <Ban className="w-3.5 h-3.5 stroke-[2.4]" />
                              </button>

                              {/* 5. Xóa (Red circle) */}
                              <button
                                type="button"
                                onClick={() => handleOpenDelete(t)}
                                className="w-6.5 h-6.5 sm:w-7 sm:h-7 rounded-full bg-[#cc292b] hover:bg-[#b52022] text-white flex items-center justify-center transition shadow-2xs cursor-pointer shrink-0"
                                title="Xóa công việc khỏi danh mục"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            /* Với CBNV: nút Tự đăng ký nhiệm vụ vào kế hoạch quý cá nhân */
                            <button
                              type="button"
                              onClick={() => onAssignTask && onAssignTask(t)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-700 hover:bg-red-800 text-white text-[11px] font-semibold transition shadow-2xs cursor-pointer"
                              title="Tự đăng ký công việc này vào kế hoạch cá nhân"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Đăng ký</span>
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
      </div>

      {/* Floating Bulk Action Bar when tasks are selected (Chỉ CBQL & Admin) */}
      {selectedTaskIds.length > 0 && isCBQL && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border border-slate-700 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-600 text-white font-bold text-xs">
              {selectedTaskIds.length}
            </span>
            <span className="text-xs sm:text-sm font-medium">nhiệm vụ được chọn</span>
          </div>

          <div className="h-4 w-px bg-slate-700"></div>

          <button
            type="button"
            onClick={handleOpenBulkAssign}
            className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow-md transition cursor-pointer"
          >
            <Users className="w-4 h-4" />
            <span>Phân công cho cán bộ ({selectedTaskIds.length} việc)</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedTaskIds([])}
            className="text-xs text-slate-400 hover:text-white transition px-1.5 py-1 cursor-pointer"
          >
            Bỏ chọn
          </button>
        </div>
      )}

      {/* 4. Floating Action Button (FAB - 9 dots grid launcher - Chỉ CBQL & Admin) */}
      {isCBQL && (
        <div className="fixed bottom-6 right-6 z-40">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="w-12 h-12 rounded-full bg-red-700 hover:bg-red-800 text-white flex items-center justify-center shadow-xl hover:shadow-2xl transition transform hover:scale-105 border-2 border-white"
            title="Tác vụ nhanh"
          >
            <div className="grid grid-cols-3 gap-0.5">
              <span className="w-1.5 h-1.5 rounded-xs bg-white"></span>
              <span className="w-1.5 h-1.5 rounded-xs bg-white"></span>
              <span className="w-1.5 h-1.5 rounded-xs bg-white"></span>
              <span className="w-1.5 h-1.5 rounded-xs bg-white"></span>
              <span className="w-1.5 h-1.5 rounded-xs bg-white"></span>
              <span className="w-1.5 h-1.5 rounded-xs bg-white"></span>
              <span className="w-1.5 h-1.5 rounded-xs bg-white"></span>
              <span className="w-1.5 h-1.5 rounded-xs bg-white"></span>
              <span className="w-1.5 h-1.5 rounded-xs bg-white"></span>
            </div>
          </button>
        </div>
      )}

      {/* IMPORT EXCEL MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl w-[95%] sm:max-w-lg p-4 sm:p-6 shadow-xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <span>Nạp Danh mục từ File Excel mẫu</span>
              </h3>
              <button 
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Template Download Prompt */}
            <div className="p-3.5 bg-blue-50/90 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <div className="font-bold text-blue-950 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-blue-700" />
                  <span>Biểu mẫu Excel chuẩn đính kèm</span>
                </div>
                <div className="text-blue-800 text-[11px] leading-relaxed">
                  Tải file mẫu gồm 5 sheet: <b>Mẫu import</b> (có sẵn công thức tự tính điểm), <b>Hướng dẫn</b>, <b>6 Trục trọng tâm</b>, <b>Đơn vị</b> và <b>Kỳ đánh giá</b>.
                </div>
              </div>
              <a
                href={api.getStandardTasksTemplateUrl()}
                download="Mau_nhap_danh_muc_cong_viec_chuan.xlsx"
                className="inline-flex items-center justify-center gap-1.5 bg-white hover:bg-blue-100 text-blue-800 font-bold px-3.5 py-2 rounded-lg border border-blue-300 shadow-xs transition shrink-0 cursor-pointer text-xs"
              >
                <Download className="w-3.5 h-3.5 text-blue-700" />
                <span>Tải file mẫu (.xlsx)</span>
              </a>
            </div>

            <div className="text-xs text-slate-600 space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <p className="font-semibold text-slate-800">Quy tắc nạp dữ liệu từ biểu mẫu:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-600">
                <li>Hệ thống đọc dữ liệu từ sheet <b>01. Mẫu import</b>.</li>
                <li>Tự động nhận diện Điểm chuẩn (10đ Thường xuyên, 12đ Đột xuất).</li>
                <li>Tự động tính Điểm quy đổi tối đa = Điểm chuẩn × Hệ số độ khó.</li>
                <li>Khớp tự động vào 6 Trục kết quả trọng tâm và đơn vị quản lý.</li>
              </ul>
            </div>

            {/* Custom file upload */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Tải lên file Excel (.xlsx) <span className="text-red-500">*</span>
              </label>
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center hover:border-emerald-500 transition-colors bg-slate-50/50">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  id="excelStandardTaskFileInput"
                  onChange={(e) => setSelectedFile(e.target.files?.[0])}
                  className="hidden"
                />
                <label htmlFor="excelStandardTaskFileInput" className="cursor-pointer flex flex-col items-center justify-center space-y-2">
                  <div className="p-3 bg-emerald-100 text-emerald-800 rounded-full">
                    <Upload className="w-5 h-5" />
                  </div>
                  {selectedFile ? (
                    <div className="text-xs">
                      <span className="font-bold text-slate-800 block text-sm">{selectedFile.name}</span>
                      <span className="text-slate-500 text-[11px]">{(selectedFile.size / 1024).toFixed(1)} KB - Nhấp để chọn file khác</span>
                    </div>
                  ) : (
                    <div className="text-xs">
                      <span className="font-semibold text-slate-700 block">Nhấp để chọn file hoặc kéo thả vào đây</span>
                      <span className="text-slate-400 text-[11px]">Hỗ trợ định dạng .xlsx theo đúng biểu mẫu đính kèm</span>
                    </div>
                  )}
                </label>
              </div>

              {selectedFile && (
                <button
                  disabled={importing}
                  onClick={() => handleImport(false)}
                  className="mt-3 w-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{importing ? 'Đang xử lý...' : `Tiến hành nạp dữ liệu từ file: ${selectedFile.name}`}</span>
                </button>
              )}
            </div>

            <div className="relative flex py-1 items-center">
              <div className="grow border-t border-slate-200"></div>
              <span className="shrink mx-3 text-slate-400 text-[11px] uppercase font-medium">Hoặc nạp nhanh từ file demo</span>
              <div className="grow border-t border-slate-200"></div>
            </div>

            {/* Default file quick import */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Nạp trực tiếp bộ dữ liệu mẫu chuẩn demo có sẵn</span>
              </div>
              <button
                disabled={importing}
                onClick={() => handleImport(true)}
                className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 rounded-md shadow-xs transition-colors shrink-0 cursor-pointer"
              >
                {importing ? 'Đang nạp...' : '⚡ Nạp bản demo'}
              </button>
            </div>

            {importMessage && (
              <div className={`p-3 rounded-lg text-xs flex items-center space-x-2 ${
                importMessage.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
              }`}>
                {importMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>{importMessage.text}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ADD STANDARD TASK MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl w-[95%] sm:max-w-lg p-4 sm:p-6 shadow-xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Thêm Công việc chuẩn vào Danh mục
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tên công việc *</label>
                <textarea
                  required
                  rows="2"
                  value={newTask.task_name}
                  onChange={(e) => setNewTask({ ...newTask, task_name: e.target.value })}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                  placeholder="Nhập tên nhiệm vụ, công việc..."
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Kết quả đầu ra *</label>
                  <select
                    value={newTask.output_result}
                    onChange={(e) => setNewTask({ ...newTask, output_result: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-red-500 font-medium"
                  >
                    {OUTPUT_RESULT_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  {newTask.output_result === 'Khác' && (
                    <input
                      type="text"
                      required
                      value={customOutputResult}
                      onChange={(e) => setCustomOutputResult(e.target.value)}
                      placeholder="Mô tả cụ thể kết quả đầu ra..."
                      className="mt-1.5 w-full text-xs p-1.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-red-500"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Thời hạn hoàn thành *</label>
                  <input
                    type="date"
                    required
                    value={toInputDateFormat(newTask.deadline)}
                    onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Loại công việc</label>
                  <select
                    value={newTask.task_type}
                    onChange={(e) => {
                      const type = e.target.value;
                      setNewTask({
                        ...newTask,
                        task_type: type,
                        standard_score: type === 'Đột xuất' ? 12 : 10
                      });
                    }}
                    className="w-full text-xs p-2 border border-slate-300 rounded-md"
                  >
                    <option value="Thường xuyên">Thường xuyên (10đ)</option>
                    <option value="Đột xuất">Đột xuất (12đ)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Điểm chuẩn</label>
                  <input
                    type="number"
                    value={newTask.standard_score}
                    readOnly
                    className="w-full text-xs p-2 bg-slate-100 border border-slate-300 rounded-md font-bold text-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Hệ số độ khó</label>
                  <select
                    value={newTask.difficulty_weight}
                    onChange={(e) => setNewTask({ ...newTask, difficulty_weight: parseFloat(e.target.value) })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-md"
                  >
                    <option value="1.0">100% (Thông thường - 1.0)</option>
                    <option value="1.1">110% (Phối hợp - 1.1)</option>
                    <option value="1.2">120% (Phức tạp / quan trọng - 1.2)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Trục kết quả trọng tâm *</label>
                <select
                  value={newTask.axis_code}
                  onChange={(e) => setNewTask({ ...newTask, axis_code: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-300 rounded-md"
                >
                  {axes.map((ax, i) => (
                    <option key={ax.code} value={ax.code}>
                      Trục {i + 1} - {ax.name.replace(`TRỤC ${i + 1} - `, '')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Minh chứng dự kiến</label>
                <input
                  type="text"
                  value={newTask.expected_evidence}
                  onChange={(e) => setNewTask({ ...newTask, expected_evidence: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-300 rounded-md"
                  placeholder="VD: Số văn bản, báo cáo ban hành..."
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2.5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs transition"
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewTask({
                      task_name: '',
                      output_result: OUTPUT_RESULT_OPTIONS[0],
                      deadline: '2026-09-30',
                      task_type: 'Thường xuyên',
                      standard_score: 10,
                      difficulty_weight: 1.0,
                      expected_evidence: '',
                      axis_code: 'TRUC_1',
                      dept_code: 'A29.123.22',
                    });
                    setCustomOutputResult('');
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg shadow-2xs transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-red-700 hover:bg-red-800 text-white rounded-lg shadow-xs transition flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Lưu</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 1. MODAL CHỈNH SỬA CÔNG VIỆC CHUẨN */}
      {editingTask && editForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-[95%] sm:max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-4 sm:p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#dc2626] text-white flex items-center justify-center shadow-xs">
                  <SquarePen className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Chỉnh sửa Công việc chuẩn
                  </h3>
                  <p className="text-xs text-slate-500">
                    Cập nhật định mức, hệ số độ khó và tiêu chuẩn nghiệm thu
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={handleBackEdit}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên công việc / Sản phẩm chuẩn *
                </label>
                <textarea
                  required
                  rows="3"
                  value={editForm.task_name}
                  onChange={(e) => setEditForm({ ...editForm, task_name: e.target.value })}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                  placeholder="Nhập tên nhiệm vụ, công việc..."
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Kết quả đầu ra *
                  </label>
                  <select
                    value={editForm.output_result}
                    onChange={(e) => setEditForm({ ...editForm, output_result: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 font-medium"
                  >
                    {OUTPUT_RESULT_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  {editForm.output_result === 'Khác' && (
                    <input
                      type="text"
                      required
                      value={editCustomOutput}
                      onChange={(e) => setEditCustomOutput(e.target.value)}
                      placeholder="Mô tả cụ thể kết quả đầu ra..."
                      className="mt-1.5 w-full text-xs p-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Thời hạn hoàn thành *
                  </label>
                  <input
                    type="date"
                    required
                    value={toInputDateFormat(editForm.deadline)}
                    onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Loại công việc
                  </label>
                  <select
                    value={editForm.task_type}
                    onChange={(e) => {
                      const type = e.target.value;
                      setEditForm({
                        ...editForm,
                        task_type: type,
                        standard_score: type === 'Đột xuất' ? 12 : 10
                      });
                    }}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                  >
                    <option value="Thường xuyên">Thường xuyên (10đ)</option>
                    <option value="Đột xuất">Đột xuất (12đ)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Điểm chuẩn
                  </label>
                  <input
                    type="number"
                    value={editForm.standard_score}
                    readOnly
                    className="w-full text-xs p-2 bg-slate-100 border border-slate-300 rounded-lg font-bold text-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Hệ số độ khó
                  </label>
                  <select
                    value={editForm.difficulty_weight}
                    onChange={(e) => setEditForm({ ...editForm, difficulty_weight: parseFloat(e.target.value) })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                  >
                    <option value="1.0">100% (Thông thường - 1.0)</option>
                    <option value="1.1">110% (Phối hợp - 1.1)</option>
                    <option value="1.2">120% (Phức tạp / quan trọng - 1.2)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Trục kết quả trọng tâm *
                </label>
                <select
                  value={editForm.axis_code}
                  onChange={(e) => setEditForm({ ...editForm, axis_code: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                >
                  {axes.map((ax, i) => (
                    <option key={ax.code} value={ax.code}>
                      Trục {i + 1} - {ax.name.replace(`TRỤC ${i + 1} - `, '')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Minh chứng dự kiến
                </label>
                <input
                  type="text"
                  value={editForm.expected_evidence}
                  onChange={(e) => setEditForm({ ...editForm, expected_evidence: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                  placeholder="VD: Số văn bản ban hành, báo cáo kết quả, biên bản nghiệm thu..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Trạng thái hoạt động
                </label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                >
                  <option value="Hoạt động">✓ Hoạt động (Có thể phân công/đăng ký)</option>
                  <option value="Tạm khóa">🔒 Tạm khóa (Tạm dừng áp dụng)</option>
                </select>
              </div>

              {/* Popup Action Buttons: Lưu / Hủy / Quay lại */}
              <div className="pt-4 flex items-center justify-end gap-2.5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleBackEdit}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs transition"
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg shadow-2xs transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-red-700 hover:bg-red-800 text-white rounded-lg shadow-xs transition flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Lưu</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. MODAL GIAO VIỆC / PHÂN CÔNG CÁN BỘ (Hỗ trợ phân công 1 hoặc nhiều người) */}
      {assigningTask && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-[95%] sm:max-w-xl max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 p-4 sm:p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#c62828] text-white flex items-center justify-center shadow-xs">
                  <UserPlus className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Phân công / Giao nhiệm vụ cho Cán bộ
                  </h3>
                  <p className="text-xs text-slate-500">
                    Có thể phân công cùng một công việc cho một hoặc nhiều cán bộ cùng thực hiện
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={handleBackAssign}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Task summary info badge */}
            <div className="p-3 bg-red-50/70 border border-red-200 rounded-xl space-y-1.5">
              <div className="text-xs font-semibold text-slate-900 line-clamp-2">
                📌 {assigningTask.task_name}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                <span className="bg-white px-2 py-0.5 rounded border border-red-200 font-medium text-red-800">
                  {assigningTask.task_type || 'Thường xuyên'}
                </span>
                <span>•</span>
                <span>Điểm chuẩn: <b>{assigningTask.standard_score}</b></span>
                <span>•</span>
                <span>Hệ số: <b>{assigningTask.difficulty_weight || 1}</b></span>
                <span>•</span>
                <span>Quy đổi: <b className="text-red-700">{Number((assigningTask.standard_score * (assigningTask.difficulty_weight || 1)).toFixed(2))}đ</b></span>
              </div>
            </div>

            <form onSubmit={handleSaveAssign} className="space-y-4">
              {/* Cán bộ nhận việc - Multi-select */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                    <span>Cán bộ tiếp nhận nhiệm vụ *</span>
                    <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-[11px] font-semibold">
                      Đã chọn: {assignForm.user_ids?.length || 0}/{users.length}
                    </span>
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={handleSelectAllAssignUsers}
                      className="text-red-700 hover:text-red-800 font-bold hover:underline"
                    >
                      {assignForm.user_ids?.length === users.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                    </button>
                  </div>
                </div>

                {/* Search user */}
                <div className="relative">
                  <input
                    type="text"
                    value={assignUserSearch}
                    onChange={(e) => setAssignUserSearch(e.target.value)}
                    placeholder="Tìm cán bộ theo tên, chức vụ, đơn vị..."
                    className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
                </div>

                {/* User selection list */}
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1 bg-slate-50/50">
                  {users
                    .filter(u => {
                      if (!assignUserSearch.trim()) return true;
                      const q = assignUserSearch.toLowerCase();
                      return (
                        u.full_name?.toLowerCase().includes(q) ||
                        u.gov_title?.toLowerCase().includes(q) ||
                        u.party_title?.toLowerCase().includes(q) ||
                        u.dept_name?.toLowerCase().includes(q)
                      );
                    })
                    .map(u => {
                      const isChecked = assignForm.user_ids?.includes(u.id);
                      const initial = u.full_name ? u.full_name.split(' ').pop().charAt(0).toUpperCase() : 'C';
                      return (
                        <div
                          key={u.id}
                          onClick={() => handleToggleAssignUser(u.id)}
                          className={`
                            flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition border text-xs
                            ${isChecked 
                              ? 'bg-red-50 border-red-300 text-slate-900 font-semibold shadow-2xs' 
                              : 'bg-white hover:bg-slate-100/80 border-slate-200 text-slate-700'
                            }
                          `}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} 
                            className="rounded text-red-700 focus:ring-red-500 w-4 h-4 cursor-pointer shrink-0"
                          />
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${isChecked ? 'bg-red-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                            {initial}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate">{u.full_name}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                {u.role === 'cbql' ? 'Lãnh đạo' : 'Chuyên viên'}
                              </span>
                            </div>
                            <div className="text-[10.5px] text-slate-400 truncate">
                              {u.gov_title || u.party_title || 'Cán bộ'} • {u.dept_name || 'Cơ quan'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  {users.filter(u => {
                    if (!assignUserSearch.trim()) return true;
                    const q = assignUserSearch.toLowerCase();
                    return (
                      u.full_name?.toLowerCase().includes(q) ||
                      u.gov_title?.toLowerCase().includes(q) ||
                      u.party_title?.toLowerCase().includes(q) ||
                      u.dept_name?.toLowerCase().includes(q)
                    );
                  }).length === 0 && (
                    <div className="text-center py-4 text-xs text-slate-400 italic">
                      Không tìm thấy cán bộ phù hợp với từ khóa
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Hạn hoàn thành *
                  </label>
                  <input
                    type="date"
                    required
                    value={toInputDateFormat(assignForm.deadline)}
                    onChange={(e) => setAssignForm({ ...assignForm, deadline: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Khối lượng / Số lượng
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={assignForm.quantity}
                    onChange={(e) => setAssignForm({ ...assignForm, quantity: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Chỉ đạo / Yêu cầu cụ thể của Lãnh đạo
                </label>
                <textarea
                  rows="2"
                  value={assignForm.notes}
                  onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
                  placeholder="Ghi chú yêu cầu tiến độ, phối hợp các phòng ban..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
                ></textarea>
              </div>

              {/* Popup Action Buttons: Lưu / Hủy / Quay lại */}
              <div className="pt-4 flex items-center justify-end gap-2.5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleBackAssign}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs transition"
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  onClick={handleCancelAssign}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg shadow-2xs transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!assignForm.user_ids || assignForm.user_ids.length === 0}
                  className="px-4 py-2 text-xs font-bold bg-[#c62828] hover:bg-[#b71c1c] text-white rounded-lg shadow-xs transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4" />
                  <span>Lưu ({assignForm.user_ids?.length || 0} cán bộ)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. MODAL XÁC NHẬN TẠM KHÓA / MỞ KHÓA CÔNG VIỆC */}
      {lockingTask && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-[95%] sm:max-w-md shadow-2xl border border-slate-200 p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#facc15] text-[#b91c1c] flex items-center justify-center shadow-xs border border-amber-300">
                  <Ban className="w-4 h-4 text-[#c62828] stroke-[2.4]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {lockingTask.status === 'Tạm khóa' ? 'Xác nhận Mở khóa công việc' : 'Xác nhận Tạm khóa công việc'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Thay đổi trạng thái hiệu lực trong danh mục chuẩn
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={handleBackLock}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
              <p className="text-xs font-bold text-amber-900">
                Bạn có chắc chắn muốn {lockingTask.status === 'Tạm khóa' ? 'mở khóa kích hoạt lại' : 'tạm khóa dừng áp dụng'} công việc sau:
              </p>
              <div className="text-xs text-slate-800 font-semibold bg-white p-2.5 rounded-lg border border-amber-200">
                {lockingTask.task_name}
              </div>
              <p className="text-[11px] text-amber-800">
                {lockingTask.status === 'Tạm khóa' 
                  ? '• Công việc sẽ được kích hoạt lại để cán bộ đăng ký và lãnh đạo phân công.'
                  : '• Công việc sau khi tạm khóa sẽ không thể phân công hoặc chọn tự đăng ký trong kỳ này.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Lý do thay đổi trạng thái (Tùy chọn)
              </label>
              <input
                type="text"
                value={lockNote}
                onChange={(e) => setLockNote(e.target.value)}
                placeholder="Nhập lý do tạm khóa hoặc ghi chú điều chỉnh..."
                className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Popup Action Buttons: Lưu / Hủy / Quay lại */}
            <div className="pt-4 flex items-center justify-end gap-2.5 border-t border-slate-200">
              <button
                type="button"
                onClick={handleBackLock}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs transition"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={handleCancelLock}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg shadow-2xs transition"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveLock}
                className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs transition flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Lưu</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL XÁC NHẬN XÓA CÔNG VIỆC KHỎI DANH MỤC */}
      {deletingTask && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-[95%] sm:max-w-md shadow-2xl border border-slate-200 p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#dc2626] text-white flex items-center justify-center shadow-xs">
                  <Trash2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Xác nhận Xóa Công việc chuẩn
                  </h3>
                  <p className="text-xs text-slate-500">
                    Loại bỏ công việc khỏi Danh mục sản phẩm chuẩn đơn vị
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={handleBackDelete}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-red-800 font-bold text-xs">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>Cảnh báo hành động xóa dữ liệu:</span>
              </div>
              <div className="text-xs text-slate-900 font-semibold bg-white p-2.5 rounded-lg border border-red-200">
                {deletingTask.task_name}
              </div>
              <p className="text-[11px] text-red-700">
                Hành động này sẽ xóa vĩnh viễn công việc này khỏi Danh mục chuẩn. Các nhiệm vụ đã phân công hoặc tự đăng ký trước đó sẽ không bị ảnh hưởng.
              </p>
            </div>

            {/* Popup Action Buttons: Lưu / Hủy / Quay lại */}
            <div className="pt-4 flex items-center justify-end gap-2.5 border-t border-slate-200">
              <button
                type="button"
                onClick={handleBackDelete}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs transition"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={handleCancelDelete}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg shadow-2xs transition"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveDelete}
                className="px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-lg shadow-xs transition flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Lưu</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL XEM CHI TIẾT CÔNG VIỆC CHUẨN */}
      {viewingTask && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-white rounded-2xl w-[95%] sm:max-w-2xl shadow-2xl border border-slate-200 p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200 shadow-2xs">
                  <Eye className="w-4 h-4 text-slate-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Chi tiết công việc chuẩn
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Mã: {viewingTask.code}
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setViewingTask(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition"
              >
                ✕
              </button>
            </div>

            {/* Content Details */}
            <div className="space-y-3.5 text-xs text-slate-700">
              {/* Task Name */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Tên công việc</div>
                <div className="text-sm font-semibold text-slate-900 leading-snug">
                  {viewingTask.task_name}
                </div>
              </div>

              {/* Grid 2 cols */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-white rounded-xl border border-slate-200">
                  <div className="text-[11px] font-bold text-slate-500 mb-1">Kết quả đầu ra</div>
                  <div className="font-medium text-slate-800">{viewingTask.output_result || 'Báo cáo tổng hợp'}</div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200">
                  <div className="text-[11px] font-bold text-slate-500 mb-1">Thời hạn thực hiện</div>
                  <div className="font-medium text-slate-800">{formatDate(viewingTask.deadline)}</div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200">
                  <div className="text-[11px] font-bold text-slate-500 mb-1">Loại công việc</div>
                  <div>
                    {viewingTask.task_type === 'Đột xuất' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#fff2e8] text-[#e05626]">
                        ⚡ Đột xuất
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#eef4ff] text-[#3b66d1]">
                        ● Thường xuyên
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200">
                  <div className="text-[11px] font-bold text-slate-500 mb-1">Trạng thái</div>
                  <div>
                    {viewingTask.status === 'Tạm khóa' ? (
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#fef3c7] text-[#b45309]">
                        Tạm khóa
                      </span>
                    ) : (
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#e6f8ee] text-[#1e834b]">
                        Hoạt động
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200">
                  <div className="text-[11px] font-bold text-slate-500 mb-1">Điểm chuẩn & Hệ số</div>
                  <div className="flex items-center gap-3 text-slate-800">
                    <span>Điểm chuẩn: <strong>{viewingTask.standard_score}</strong></span>
                    <span>•</span>
                    <span>Hệ số: <strong>{viewingTask.difficulty_weight || 1}</strong></span>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200">
                  <div className="text-[11px] font-bold text-slate-500 mb-1">Điểm quy đổi tối đa</div>
                  <div className="text-base font-bold text-red-600">
                    {Number((viewingTask.max_converted_score !== undefined && viewingTask.max_converted_score !== null 
                      ? viewingTask.max_converted_score 
                      : (viewingTask.standard_score * (viewingTask.difficulty_weight || 1.0))).toFixed(2))}
                  </div>
                </div>
              </div>

              {/* Đơn vị */}
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 mb-1">Đơn vị / Phòng ban</div>
                <div className="font-medium text-slate-800">{viewingTask.dept_name || 'Chi bộ Trường Mầm non Hoàng Yến'}</div>
              </div>

              {/* Minh chứng */}
              {viewingTask.expected_evidence && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[11px] font-bold text-slate-500 mb-1">Yêu cầu minh chứng</div>
                  <div className="text-slate-800 italic">{viewingTask.expected_evidence}</div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  const taskToEdit = viewingTask;
                  setViewingTask(null);
                  handleOpenEdit(taskToEdit);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-lg shadow-xs transition flex items-center gap-1.5"
              >
                <SquarePen className="w-3.5 h-3.5" />
                <span>Chỉnh sửa</span>
              </button>
              <button
                type="button"
                onClick={() => setViewingTask(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg shadow-2xs transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL PHÂN CÔNG HÀNG LOẠT (Nhiều nhiệm vụ cho nhiều người) */}
      {isBulkAssignModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-[95%] sm:max-w-4xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-red-700 text-white flex items-center justify-center shadow-xs">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Phân công nhiều nhiệm vụ cho cán bộ
                  </h3>
                  <p className="text-xs text-slate-500">
                    Giao đồng thời các nhiệm vụ đã chọn cho danh sách cán bộ được phân công
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsBulkAssignModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center font-bold text-sm transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body - 2 Columns */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Left Col: Selected Tasks List (md:col-span-5) */}
              <div className="md:col-span-5 flex flex-col gap-4 border-b md:border-b-0 md:border-r border-slate-200 pb-4 md:pb-0 md:pr-6">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span>Nhiệm vụ được chọn</span>
                    <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-[11px] font-bold">
                      {selectedTaskIds.length}
                    </span>
                  </label>
                  <span className="text-[11px] text-slate-400 italic">
                    Bấm dấu × để bỏ bớt
                  </span>
                </div>

                {/* Selected tasks scroll area */}
                <div className="flex-1 max-h-[300px] overflow-y-auto space-y-2 pr-1">
                  {tasks
                    .filter(t => selectedTaskIds.includes(t.id))
                    .map((t, index) => (
                      <div 
                        key={t.id} 
                        className="p-3 bg-red-50/50 hover:bg-red-50 border border-red-200/80 rounded-xl relative group transition text-xs"
                      >
                        <button
                          type="button"
                          onClick={() => handleRemoveTaskFromBulk(t.id)}
                          className="absolute right-2 top-2 w-5 h-5 rounded-full bg-white hover:bg-red-600 text-slate-400 hover:text-white flex items-center justify-center text-[10px] transition border border-slate-200 shadow-2xs cursor-pointer"
                          title="Bỏ nhiệm vụ này khỏi danh sách phân công"
                        >
                          ✕
                        </button>
                        <div className="flex items-center gap-1.5 pr-6">
                          <span className="font-bold text-red-700">#{index + 1}</span>
                          <span className="font-mono text-[10.5px] text-slate-500 bg-white px-1.5 py-0.2 rounded border border-red-100">
                            {t.code || 'CV-CH'}
                          </span>
                        </div>
                        <div className="font-semibold text-slate-800 mt-1 leading-snug pr-4">
                          {t.task_name}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                          <span>Điểm: <b>{t.standard_score}</b></span>
                          <span>•</span>
                          <span>Hệ số: <b>{t.difficulty_weight || 1}</b></span>
                          <span>•</span>
                          <span className="text-red-700 font-bold">
                            {Number(((t.standard_score || 10) * (t.difficulty_weight || 1)).toFixed(2))}đ
                          </span>
                        </div>
                      </div>
                    ))}
                </div>

                {/* Deadline Setting */}
                <div className="pt-3 border-t border-slate-200 space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Thời hạn hoàn thành chung *
                  </label>
                  <input
                    type="date"
                    value={bulkAssignDeadline}
                    onChange={(e) => setBulkAssignDeadline(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
                    required
                  />
                  <div className="text-[11px] text-slate-400">
                    Định dạng hiển thị hệ thống: <strong>{formatDate(bulkAssignDeadline)}</strong>
                  </div>
                </div>
              </div>

              {/* Right Col: Staff Selection (md:col-span-7) */}
              <div className="md:col-span-7 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <span>Cán bộ tiếp nhận</span>
                    <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-[11px] font-bold">
                      Đã chọn: {bulkAssignUserIds.length} cán bộ
                    </span>
                  </label>
                  {/* Select all toggle button */}
                  {(() => {
                    const filteredUsers = users.filter(u => {
                      const matchesDept = !bulkAssignDeptFilter || u.dept_id === bulkAssignDeptFilter || u.dept_code === bulkAssignDeptFilter || u.dept_name === bulkAssignDeptFilter;
                      if (!matchesDept) return false;
                      if (!bulkAssignUserSearch.trim()) return true;
                      const q = bulkAssignUserSearch.toLowerCase();
                      return (
                        u.full_name?.toLowerCase().includes(q) ||
                        u.gov_title?.toLowerCase().includes(q) ||
                        u.party_title?.toLowerCase().includes(q) ||
                        u.dept_name?.toLowerCase().includes(q)
                      );
                    });
                    const visibleIds = filteredUsers.map(u => u.id);
                    const allSelected = visibleIds.length > 0 && visibleIds.every(id => bulkAssignUserIds.includes(id));
                    return (
                      <button
                        type="button"
                        onClick={() => handleSelectAllBulkUsers(filteredUsers)}
                        className="text-xs font-bold text-red-700 hover:text-red-800 hover:underline cursor-pointer"
                      >
                        {allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả hiển thị'}
                      </button>
                    );
                  })()}
                </div>

                {/* Filters for staff list */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Department select */}
                  {departments && departments.length > 0 && (
                    <select
                      value={bulkAssignDeptFilter}
                      onChange={(e) => setBulkAssignDeptFilter(e.target.value)}
                      className="text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
                    >
                      <option value="">Tất cả đơn vị / bộ phận</option>
                      {departments.map(d => (
                        <option key={d.id || d.code} value={d.id || d.code}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Search input */}
                  <div className={`relative ${!departments || departments.length === 0 ? 'sm:col-span-2' : ''}`}>
                    <input
                      type="text"
                      value={bulkAssignUserSearch}
                      onChange={(e) => setBulkAssignUserSearch(e.target.value)}
                      placeholder="Tìm tên cán bộ, chức vụ..."
                      className="w-full text-xs pl-8 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>

                {/* Staff Selection List */}
                <div className="flex-1 max-h-[290px] overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1.5 bg-slate-50/50">
                  {(() => {
                    const filteredUsers = users.filter(u => {
                      const matchesDept = !bulkAssignDeptFilter || u.dept_id === bulkAssignDeptFilter || u.dept_code === bulkAssignDeptFilter || u.dept_name === bulkAssignDeptFilter;
                      if (!matchesDept) return false;
                      if (!bulkAssignUserSearch.trim()) return true;
                      const q = bulkAssignUserSearch.toLowerCase();
                      return (
                        u.full_name?.toLowerCase().includes(q) ||
                        u.gov_title?.toLowerCase().includes(q) ||
                        u.party_title?.toLowerCase().includes(q) ||
                        u.dept_name?.toLowerCase().includes(q)
                      );
                    });

                    if (filteredUsers.length === 0) {
                      return (
                        <div className="text-center py-8 text-xs text-slate-400 italic">
                          Không tìm thấy cán bộ nào phù hợp với bộ lọc
                        </div>
                      );
                    }

                    return filteredUsers.map(u => {
                      const isChecked = bulkAssignUserIds.includes(u.id);
                      const initial = u.full_name ? u.full_name.split(' ').pop().charAt(0).toUpperCase() : 'C';
                      return (
                        <div
                          key={u.id}
                          onClick={() => handleToggleBulkAssignUser(u.id)}
                          className={`
                            flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition border text-xs
                            ${isChecked 
                              ? 'bg-red-50 border-red-300 text-slate-900 font-medium shadow-2xs' 
                              : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                            }
                          `}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} 
                            className="rounded text-red-700 focus:ring-red-500 w-4 h-4 cursor-pointer shrink-0 accent-red-600"
                          />
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 ${isChecked ? 'bg-red-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                            {initial}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold truncate">{u.full_name}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                {u.role === 'cbql' ? 'Lãnh đạo' : 'Chuyên viên'}
                              </span>
                            </div>
                            <div className="text-[10.5px] text-slate-400 truncate">
                              {u.gov_title || u.party_title || 'Cán bộ'} • {u.dept_name || 'Cơ quan'}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>

            {/* Modal Footer with Summary Banner */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-red-100 text-red-800 font-bold border border-red-200">
                  {selectedTaskIds.length} việc × {bulkAssignUserIds.length} người
                </span>
                <span className="text-slate-600">
                  = <strong className="text-slate-900">{selectedTaskIds.length * bulkAssignUserIds.length}</strong> lượt phân công nhiệm vụ
                </span>
              </div>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsBulkAssignModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs transition cursor-pointer"
                  disabled={isBulkAssigning}
                >
                  Hủy
                </button>

                <button
                  type="button"
                  onClick={handleSaveBulkAssign}
                  disabled={isBulkAssigning || selectedTaskIds.length === 0 || bulkAssignUserIds.length === 0}
                  className={`
                    px-5 py-2 text-xs font-bold text-white rounded-lg shadow-sm transition flex items-center gap-2
                    ${isBulkAssigning || selectedTaskIds.length === 0 || bulkAssignUserIds.length === 0
                      ? 'bg-slate-300 cursor-not-allowed text-slate-500'
                      : 'bg-red-700 hover:bg-red-800 shadow-md cursor-pointer'
                    }
                  `}
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {isBulkAssigning 
                      ? 'Đang phân công...' 
                      : `Xác nhận phân công (${selectedTaskIds.length * bulkAssignUserIds.length})`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
