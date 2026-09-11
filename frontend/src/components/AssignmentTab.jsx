import React, { useEffect, useState, useMemo } from 'react';
import { 
  UserCheck, 
  Send, 
  Check, 
  X, 
  Clock, 
  UserPlus, 
  FileCheck, 
  Layers,
  Sparkles,
  LayoutDashboard,
  ArrowUpRight,
  ArrowDownLeft,
  User,
  Users,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Filter,
  Search,
  FileText,
  ChevronRight,
  Plus,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Paperclip,
  Zap,
  FolderPlus,
  Briefcase,
  Trash2
} from 'lucide-react';
import { api } from '../api';
import { OUTPUT_RESULT_OPTIONS, formatDate, toInputDateFormat, parseDateOnly } from '../constants';
import UserGroupManagementModal from './UserGroupManagementModal';

export default function AssignmentTab({ 
  selectedPeriod, 
  currentUser, 
  users, 
  axes, 
  prefillTask, 
  clearPrefillTask,
  setCurrentTab
}) {
  const [standardTasks, setStandardTasks] = useState([]);
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customOutputResult, setCustomOutputResult] = useState('');

  // Active View Mode: 'dashboard' | 'assigned_out' | 'assigned_in' | 'personal' | 'all'
  const [activeView, setActiveView] = useState('dashboard');

  // Sub-view for 'assigned_in' (Nhiệm vụ được giao): 'summary' (Tổng hợp theo nhân sự) | 'list' (Danh sách chi tiết)
  const [assignedInSubView, setAssignedInSubView] = useState('summary');
  const [assignedInScope, setAssignedInScope] = useState('all'); // 'all' (Tất cả nhân sự trong đơn vị) | 'me' (Chỉ tôi)
  const [expandedUserIds, setExpandedUserIds] = useState([]);

  // Search & Filters for tables
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [axisFilter, setAxisFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [filterMyAssignedOnly, setFilterMyAssignedOnly] = useState(false);

  // Approval Modal State
  const [approvalModalTask, setApprovalModalTask] = useState(null);
  const [addToStandardTasks, setAddToStandardTasks] = useState(true);
  const [approvalComment, setApprovalComment] = useState('');
  const [approvalDiffWeight, setApprovalDiffWeight] = useState(1.0);
  const [isApproving, setIsApproving] = useState(false);

  // Acceptance & Feedback Modal State (Bước 1 - Nhánh 2 theo tài liệu V6)
  const [feedbackModalTask, setFeedbackModalTask] = useState(null);
  const [feedbackReason, setFeedbackReason] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // Reassign Modal State (Lãnh đạo điều chỉnh giao lại)
  const [reassignModalTask, setReassignModalTask] = useState(null);
  const [reassignForm, setReassignForm] = useState({
    deadline: '',
    task_name: '',
    output_result: '',
    difficulty_weight: 1.0,
    new_user_id: ''
  });
  const [isSubmittingReassign, setIsSubmittingReassign] = useState(false);

  // Return Task Modal State (Cán bộ trả lại công việc cho Lãnh đạo)
  const [returnModalTask, setReturnModalTask] = useState(null);
  const [returnTaskReason, setReturnTaskReason] = useState('');
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);

  // Extension Modal States
  // 1. CBNV xin gia hạn (chỉ hiển thị khi công việc đã đến hạn hoặc quá hạn)
  const [extensionRequestModalTask, setExtensionRequestModalTask] = useState(null);
  const [requestedDeadline, setRequestedDeadline] = useState('');
  const [extensionReason, setExtensionReason] = useState('');
  const [isSubmittingExtensionRequest, setIsSubmittingExtensionRequest] = useState(false);

  // 2. Lãnh đạo xem xét duyệt/từ chối yêu cầu gia hạn
  const [extensionReviewModalTask, setExtensionReviewModalTask] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isReviewingExtension, setIsReviewingExtension] = useState(false);

  // 3. Lãnh đạo chủ động gia hạn tiến độ
  const [leaderExtendModalTask, setLeaderExtendModalTask] = useState(null);
  const [leaderNewDeadline, setLeaderNewDeadline] = useState('');
  const [leaderExtendReason, setLeaderExtendReason] = useState('');
  const [isSubmittingLeaderExtend, setIsSubmittingLeaderExtend] = useState(false);

  // Modal State for Assigning / Registering Tasks
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('assign'); // 'assign' or 'register'

  // User Groups state
  const [userGroups, setUserGroups] = useState([]);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  // Assignment Target Mode: 'users' | 'job_title' | 'user_group'
  const [assignTargetType, setAssignTargetType] = useState('users');
  const [selectedJobTitles, setSelectedJobTitles] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    user_id: '',
    task_source: 'standard', // 'standard' or 'custom'
    standard_task_id: '',
    task_name: '',
    output_result: OUTPUT_RESULT_OPTIONS[0],
    deadline: '2026-09-30',
    task_type: 'Thường xuyên',
    standard_score: 10,
    difficulty_weight: 1.0,
    axis_code: 'TRUC_1'
  });

  // Multi-user selection state for CBQL
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [modalUserSearch, setModalUserSearch] = useState('');
  const [stdTaskSearch, setStdTaskSearch] = useState('');

  const isAdmin = Boolean(
    currentUser?.role === 'admin' || 
    currentUser?.role_code === 'admin' || 
    currentUser?.role_id === 'role-admin' || 
    currentUser?.role_id === 'role-admin-donvi' || 
    currentUser?.target_role === 'admin_donvi' || 
    currentUser?.target_role === 'admin' ||
    currentUser?.username === 'admin' ||
    currentUser?.username === 'mnhy.andong'
  );

  const isCBQL = isAdmin || currentUser?.role === 'cbql' || currentUser?.role === 'admin' || (currentUser?.data_scope && currentUser?.data_scope !== 'personal');
  const assignableUsers = isCBQL 
    ? users.filter(u => u.role !== 'admin') 
    : (currentUser && currentUser.role !== 'admin' ? [currentUser] : []);

  // Distinct job titles
  const distinctJobTitles = useMemo(() => {
    const titles = new Set();
    users.forEach(u => {
      if (u.gov_title && u.gov_title.trim()) titles.add(u.gov_title.trim());
      if (u.party_title && u.party_title.trim()) titles.add(u.party_title.trim());
    });
    if (titles.size === 0) {
      return ['Giáo viên', 'Chuyên viên', 'Nhân viên', 'Hiệu trưởng', 'Phó Hiệu trưởng'];
    }
    return Array.from(titles);
  }, [users]);

  const loadUserGroups = async () => {
    try {
      const groups = await api.getUserGroups();
      setUserGroups(groups || []);
    } catch (e) {
      console.error('Error loading user groups in AssignmentTab:', e);
    }
  };

  useEffect(() => {
    loadUserGroups();
  }, []);

  useEffect(() => {
    loadData();
  }, [selectedPeriod, currentUser, users]);

  useEffect(() => {
    if (prefillTask) {
      setFormData(prev => ({
        ...prev,
        task_source: 'standard',
        standard_task_id: prefillTask.id,
        task_name: prefillTask.task_name,
        output_result: prefillTask.output_result || '',
        deadline: prefillTask.deadline || '2026-09-30',
        task_type: prefillTask.task_type || 'Thường xuyên',
        standard_score: prefillTask.standard_score || 10,
        difficulty_weight: prefillTask.difficulty_weight || 1.0,
        axis_code: prefillTask.axis_code || 'TRUC_1'
      }));
      setModalMode(isCBQL ? 'assign' : 'register');
      setIsModalOpen(true);
      clearPrefillTask();
    }
  }, [prefillTask]);

  async function loadData() {
    try {
      setLoading(true);
      const [stdData, assignData] = await Promise.all([
        api.getStandardTasks({ period_id: selectedPeriod }),
        api.getAssignedTasks({ period_id: selectedPeriod })
      ]);
      setStandardTasks(stdData);
      setAssignedTasks(assignData);

      // Default assigned users for CBQL / Manager: pick first subordinate or keep existing
      if (isCBQL && assignableUsers.length > 0) {
        const validSelected = selectedUserIds.filter(id => assignableUsers.some(u => u.id === id));
        if (validSelected.length > 0) {
          setSelectedUserIds(validSelected);
        } else {
          const firstSub = assignableUsers.find(u => u.id !== currentUser?.id) || assignableUsers[0];
          setSelectedUserIds(firstSub ? [firstSub.id] : []);
        }
      } else if (!isCBQL && currentUser) {
        setSelectedUserIds([currentUser.id]);
      }
    } catch (err) {
      console.error('Error loading assignment data:', err);
    } finally {
      setLoading(false);
    }
  }

  function openModal(mode = 'assign') {
    setModalMode(mode);
    setIsModalOpen(true);
    if (mode === 'register' && currentUser) {
      setSelectedUserIds([currentUser.id]);
    } else if (mode === 'assign' && selectedUserIds.length === 0) {
      const firstSub = assignableUsers.find(u => u.id !== currentUser?.id) || assignableUsers[0];
      if (firstSub) setSelectedUserIds([firstSub.id]);
    }
  }

  function closeModal() {
    setIsModalOpen(false);
    setCustomOutputResult('');
    setAssignTargetType('users');
    setSelectedJobTitles([]);
    setSelectedGroupId('');
    setFormData({
      user_id: '',
      task_source: 'standard',
      standard_task_id: '',
      task_name: '',
      output_result: OUTPUT_RESULT_OPTIONS[0],
      deadline: '2026-09-30',
      task_type: 'Thường xuyên',
      standard_score: 10,
      difficulty_weight: 1.0,
      axis_code: 'TRUC_1'
    });
  }

  // Danh sách các cán bộ đã có nhiệm vụ này trong kỳ (để chặn giao trùng lặp)
  const duplicateUserIds = useMemo(() => {
    if (!selectedPeriod || modalMode !== 'assign') return new Set();
    const stdId = formData.standard_task_id;
    const normName = (formData.task_name || '').trim().toLowerCase();
    if (!stdId && !normName) return new Set();

    const dupIds = new Set();
    (assignedTasks || []).forEach(t => {
      if (t.period_id === selectedPeriod && !['rejected', 'cancelled'].includes(t.status)) {
        const matchStd = stdId && t.standard_task_id === stdId;
        const matchName = normName && (t.task_name || '').trim().toLowerCase() === normName;
        if (matchStd || matchName) {
          dupIds.add(t.user_id);
        }
      }
    });
    return dupIds;
  }, [selectedPeriod, modalMode, formData.standard_task_id, formData.task_name, assignedTasks]);

  function toggleUser(userId) {
    if (duplicateUserIds.has(userId)) {
      const u = assignableUsers.find(usr => usr.id === userId);
      alert(`Cán bộ ${u ? u.full_name : ''} đã có đầu việc này trong kỳ đánh giá. Không thể chọn giao trùng!`);
      return;
    }
    setSelectedUserIds(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  }

  function selectAllUsers() {
    const availableUsers = assignableUsers.filter(u => !duplicateUserIds.has(u.id));
    if (availableUsers.length === 0 && assignableUsers.length > 0) {
      alert('Tất cả các cán bộ đều đã được giao đầu việc này trong kỳ đánh giá!');
      return;
    }
    setSelectedUserIds(availableUsers.map(u => u.id));
  }

  function clearAllUsers() {
    setSelectedUserIds([]);
    setSelectedJobTitles([]);
    setSelectedGroupId('');
  }

  // Auto-select users matching chosen job titles
  const handleToggleJobTitle = (title) => {
    const isChecked = selectedJobTitles.includes(title);
    const nextTitles = isChecked
      ? selectedJobTitles.filter(t => t !== title)
      : [...selectedJobTitles, title];
    setSelectedJobTitles(nextTitles);

    const matchingUsers = assignableUsers.filter(u => 
      nextTitles.some(t => u.gov_title === t || u.party_title === t)
    );
    const nonDupIds = matchingUsers.filter(u => !duplicateUserIds.has(u.id)).map(u => u.id);
    setSelectedUserIds(nonDupIds);
  };

  // Auto-select users matching chosen user group
  const handleSelectGroup = (groupId) => {
    setSelectedGroupId(groupId);
    const grp = userGroups.find(g => g.id === groupId);
    if (grp && grp.members) {
      const memberUserIds = grp.members.map(m => m.user_id);
      const matchingUsers = assignableUsers.filter(u => memberUserIds.includes(u.id));
      const nonDupIds = matchingUsers.filter(u => !duplicateUserIds.has(u.id)).map(u => u.id);
      setSelectedUserIds(nonDupIds);
    } else {
      setSelectedUserIds([]);
    }
  };

  function handleStandardTaskSelect(stdTaskId) {
    const std = standardTasks.find(s => s.id === stdTaskId);
    if (std) {
      setFormData(prev => ({
        ...prev,
        standard_task_id: std.id,
        task_name: std.task_name,
        output_result: std.output_result || '',
        deadline: std.deadline || '2026-09-30',
        task_type: std.task_type || 'Thường xuyên',
        standard_score: std.standard_score || 10,
        difficulty_weight: std.difficulty_weight || 1.0,
        axis_code: std.axis_code || 'TRUC_1'
      }));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const finalOutput = formData.output_result === 'Khác' && customOutputResult.trim()
        ? `Khác: ${customOutputResult.trim()}`
        : formData.output_result;

      if (modalMode === 'assign') {
        if (selectedUserIds.length === 0) {
          alert('Vui lòng chọn ít nhất 1 cán bộ/nhân viên nhận việc!');
          setIsSubmitting(false);
          return;
        }

        // Kiểm tra chặn giao việc trùng lặp
        const dupSelected = selectedUserIds.filter(id => duplicateUserIds.has(id));
        if (dupSelected.length > 0) {
          const dupNames = dupSelected.map(id => {
            const u = assignableUsers.find(usr => usr.id === id);
            return u ? u.full_name : id;
          }).join(', ');
          alert(`CẢNH BÁO TRÙNG LẶP:\nCác cán bộ sau đã được giao đầu việc này trong kỳ đánh giá:\n👉 ${dupNames}\n\nHệ thống không cho phép giao trùng cùng 1 đầu việc. Vui lòng bỏ chọn cán bộ đã có việc để tiếp tục!`);
          setIsSubmitting(false);
          return;
        }

        const payload = {
          ...formData,
          output_result: finalOutput,
          period_id: selectedPeriod,
          user_ids: selectedUserIds,
          target_type: assignTargetType,
          job_titles: selectedJobTitles,
          group_id: selectedGroupId,
          assigned_by: currentUser?.id
        };

        const res = await api.assignTask(payload);
        alert(res.message || `Đã giao việc thành công cho ${selectedUserIds.length} cán bộ/nhân viên!`);
      } else {
        // Staff self-registers
        const payload = {
          ...formData,
          output_result: finalOutput,
          period_id: selectedPeriod,
          user_id: currentUser?.id
        };
        await api.registerSelfTask(payload);
        alert('Đã gửi đăng ký công việc thành công! Vui lòng chờ CBQL phê duyệt.');
      }

      // Reset & close
      setCustomOutputResult('');
      setAssignTargetType('users');
      setSelectedJobTitles([]);
      setSelectedGroupId('');
      setFormData(prev => ({
        ...prev,
        task_name: '',
        output_result: OUTPUT_RESULT_OPTIONS[0],
        standard_task_id: ''
      }));
      closeModal();
      loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function openApprovalModal(task) {
    setApprovalModalTask(task);
    setAddToStandardTasks(!task.standard_task_id || task.origin === 'registered');
    setApprovalDiffWeight(task.difficulty_weight || 1.0);
    setApprovalComment('');
  }

  function closeApprovalModal() {
    setApprovalModalTask(null);
    setIsApproving(false);
  }

  async function handleConfirmApproval(approved) {
    if (!approvalModalTask) return;
    try {
      setIsApproving(true);
      const payload = {
        is_approved: approved,
        approved: approved,
        cbql_comment: approvalComment.trim(),
        difficulty_weight: approvalDiffWeight,
        add_to_standard_tasks: approved ? addToStandardTasks : false
      };
      const res = await api.approveTask(approvalModalTask.id, payload);
      alert(res.message || (approved ? 'Đã duyệt công việc thành công!' : 'Đã từ chối công việc.'));
      closeApprovalModal();
      loadData();
    } catch (err) {
      alert(err.message || 'Lỗi khi phê duyệt công việc');
    } finally {
      setIsApproving(false);
    }
  }

  async function handleRejectTask(task) {
    const reason = window.prompt(`Nhập lý do từ chối công việc "${task.task_name}":`, '');
    if (reason === null) return;
    try {
      await api.approveTask(task.id, { is_approved: false, approved: false, cbql_comment: reason });
      alert('Đã từ chối công việc.');
      loadData();
    } catch (err) {
      alert(err.message);
    }
  }

  // Bước 1: Xác nhận tiếp nhận nhiệm vụ (Chuyển vào công việc cá nhân)
  async function handleAcceptTask(taskId) {
    try {
      await api.acceptTask(taskId);
      alert('Đã tiếp nhận nhiệm vụ thành công! Nhiệm vụ đã được chuyển vào mục "Nhiệm vụ cá nhân" của bạn để thực hiện và nộp minh chứng.');
      loadData();
    } catch (err) {
      alert('Lỗi xác nhận: ' + err.message);
    }
  }

  // Thu hồi công việc đã giao nhầm (Dành cho Lãnh đạo/Người giao)
  async function handleRecallTask(task) {
    if (!task) return;
    const confirmMsg = `Bạn có chắc chắn muốn THU HỒI nhiệm vụ "${task.task_name}" đã giao cho ${task.user_name || 'cán bộ'}?\n\n(Lưu ý: Thao tác này sẽ hủy giao việc và xóa nhiệm vụ khỏi danh sách của cán bộ).`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await api.deleteAssignedTask(task.id);
      alert(`Đã thu hồi công việc "${task.task_name}" thành công!`);
      setSelectedTaskIds(prev => prev.filter(id => id !== task.id));
      loadData();
    } catch (err) {
      alert('Lỗi thu hồi công việc: ' + (err.message || err));
    }
  }

  // Admin xóa công việc đã giao (Xóa hoàn toàn mọi trạng thái)
  async function handleDeleteTask(task) {
    if (!task) return;
    const confirmMsg = `Bạn có chắc chắn muốn XÓA công việc "${task.task_name}" (Giao cho: ${task.user_name || 'cán bộ'})?\n\n(Lưu ý: Thao tác này sẽ xóa hoàn toàn công việc khỏi hệ thống).`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await api.deleteAssignedTask(task.id);
      alert(`Đã xóa công việc "${task.task_name}" thành công!`);
      setSelectedTaskIds(prev => prev.filter(id => id !== task.id));
      loadData();
    } catch (err) {
      alert('Lỗi xóa công việc: ' + (err.message || err));
    }
  }

  // Admin xóa hàng loạt công việc đã chọn
  async function handleBulkDeleteAssignedTasks() {
    if (!selectedTaskIds || selectedTaskIds.length === 0) return;
    const confirmMsg = `CẢNH BÁO: Bạn đang chọn XÓA ${selectedTaskIds.length} công việc đã giao.\n\nBạn có chắc chắn muốn xóa vĩnh viễn các công việc đã chọn khỏi hệ thống không?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await api.bulkDeleteAssignedTasks(selectedTaskIds);
      alert(`Đã xóa thành công ${res?.deletedCount || selectedTaskIds.length} công việc đã giao!`);
      setSelectedTaskIds([]);
      loadData();
    } catch (err) {
      alert('Lỗi xóa hàng loạt công việc: ' + (err.message || err));
    }
  }

  // Bước 1: Cán bộ mở modal trả lại công việc cho Lãnh đạo
  function openReturnModal(task) {
    setReturnModalTask(task);
    setReturnTaskReason('');
  }

  // Bước 1: Cán bộ xác nhận gửi trả lại công việc
  async function handleSubmitReturn() {
    if (!returnModalTask) return;
    if (!returnTaskReason.trim()) {
      alert('Vui lòng nhập lý do trả lại công việc');
      return;
    }
    try {
      setIsSubmittingReturn(true);
      await api.returnTaskToAssigner(returnModalTask.id, { return_reason: returnTaskReason.trim() });
      alert('Đã trả lại công việc cho Lãnh đạo/Người giao việc thành công!');
      setReturnModalTask(null);
      setReturnTaskReason('');
      loadData();
    } catch (err) {
      alert('Lỗi trả lại công việc: ' + (err.message || err));
    } finally {
      setIsSubmittingReturn(false);
    }
  }

  // Bước 1 - Nhánh 2: Mở modal phản hồi nhiệm vụ
  function openFeedbackModal(task) {
    if ((task.feedback_count || 0) >= 1) {
      alert('Theo quy định Hướng dẫn số 06-HD/BTCTU, mỗi nhiệm vụ cán bộ chỉ được phản hồi tối đa 1 lần!');
      return;
    }
    setFeedbackModalTask(task);
    setFeedbackReason('');
  }

  // Bước 1 - Nhánh 2: Gửi phản hồi nhiệm vụ
  async function handleSubmitFeedback() {
    if (!feedbackModalTask) return;
    if (!feedbackReason.trim()) {
      alert('Vui lòng nhập lý do phản hồi nhiệm vụ');
      return;
    }
    try {
      setIsSubmittingFeedback(true);
      await api.feedbackTask(feedbackModalTask.id, { feedback_reason: feedbackReason.trim() });
      alert('Đã gửi phản hồi về công việc cho Lãnh đạo xem xét thành công!');
      setFeedbackModalTask(null);
      setFeedbackReason('');
      loadData();
    } catch (err) {
      alert('Lỗi gửi phản hồi: ' + err.message);
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  // Bước 1 - Nhánh 2: Lãnh đạo mở form điều chỉnh & giao lại
  function openReassignModal(task) {
    setReassignModalTask(task);
    setReassignForm({
      deadline: task.deadline ? toInputDateFormat(task.deadline) : '2026-09-30',
      task_name: task.task_name,
      output_result: task.output_result || '',
      difficulty_weight: task.difficulty_weight || 1.0,
      new_user_id: task.user_id
    });
  }

  // Bước 1 - Nhánh 2: Lãnh đạo xác nhận giao lại
  async function handleSubmitReassign() {
    if (!reassignModalTask) return;
    try {
      setIsSubmittingReassign(true);
      await api.reassignTask(reassignModalTask.id, reassignForm);
      alert('Đã điều chỉnh và giao lại nhiệm vụ thành công! Nhiệm vụ đã được chuyển vào danh sách thực hiện của cán bộ.');
      setReassignModalTask(null);
      loadData();
    } catch (err) {
      alert('Lỗi giao lại: ' + err.message);
    } finally {
      setIsSubmittingReassign(false);
    }
  }

  function toggleExpandUser(userId) {
    setExpandedUserIds(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  }

  // Helper date checking
  function checkDeadlineStatus(deadline, status) {
    if (status === 'approved') {
      return { text: 'Đã duyệt KQ', color: 'emerald', isOverdue: false, isNear: false };
    }
    if (!deadline) {
      return { text: 'Chưa có hạn', color: 'slate', isOverdue: false, isNear: false };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = parseDateOnly(deadline) || new Date(deadline);
    d.setHours(0, 0, 0, 0);
    const diffTime = d - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: `Quá hạn ${Math.abs(diffDays)} ngày`, color: 'rose', isOverdue: true, isNear: false, days: diffDays };
    }
    if (diffDays === 0) {
      return { text: 'Đến hạn hôm nay', color: 'amber', isOverdue: false, isNear: true, days: 0 };
    }
    if (diffDays <= 3) {
      return { text: `Còn ${diffDays} ngày`, color: 'amber', isOverdue: false, isNear: true, days: diffDays };
    }
    return { text: `Còn ${diffDays} ngày`, color: 'slate', isOverdue: false, isNear: false, days: diffDays };
  }

  const todayStr = useMemo(() => {
    return new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
  }, []);

  function isTaskDueOrOverdue(task) {
    if (!task || !task.deadline || task.status === 'approved') return false;
    return task.deadline <= todayStr;
  }

  // 1. CBNV Mở modal xin gia hạn
  function openExtensionRequestModal(task) {
    if (!isTaskDueOrOverdue(task)) {
      alert('Theo quy định, chỉ được gửi yêu cầu xin gia hạn khi công việc đã đến hạn hoặc quá hạn!');
      return;
    }
    setExtensionRequestModalTask(task);
    const base = new Date();
    base.setDate(base.getDate() + 7);
    setRequestedDeadline(toInputDateFormat(base.toISOString().split('T')[0]));
    setExtensionReason('');
  }

  // 1. CBNV Gửi yêu cầu xin gia hạn
  async function handleSubmitExtensionRequest() {
    if (!extensionRequestModalTask) return;
    if (!requestedDeadline) {
      alert('Vui lòng chọn thời hạn hoàn thành mới đề xuất!');
      return;
    }
    if (requestedDeadline <= extensionRequestModalTask.deadline) {
      alert('Thời hạn mới đề xuất phải sau thời hạn hiện tại của nhiệm vụ!');
      return;
    }
    if (!extensionReason.trim()) {
      alert('Vui lòng nhập lý do xin gia hạn công việc!');
      return;
    }

    try {
      setIsSubmittingExtensionRequest(true);
      const res = await api.requestTaskExtension(extensionRequestModalTask.id, {
        requested_deadline: requestedDeadline,
        reason: extensionReason.trim()
      });
      alert(res.message || 'Đã gửi yêu cầu xin gia hạn tới Lãnh đạo xem xét thành công!');
      setExtensionRequestModalTask(null);
      loadData();
    } catch (err) {
      alert('Lỗi gửi yêu cầu gia hạn: ' + (err.message || err));
    } finally {
      setIsSubmittingExtensionRequest(false);
    }
  }

  // 2. Lãnh đạo mở modal xem xét yêu cầu gia hạn
  function openExtensionReviewModal(task) {
    setExtensionReviewModalTask(task);
    setRejectReason('');
  }

  // 2. Lãnh đạo phê duyệt hoặc từ chối yêu cầu gia hạn
  async function handleReviewExtension(action) {
    if (!extensionReviewModalTask) return;
    if (action === 'reject' && !rejectReason.trim()) {
      alert('Vui lòng nhập lý do từ chối gia hạn!');
      return;
    }
    try {
      setIsReviewingExtension(true);
      const res = await api.reviewTaskExtension(extensionReviewModalTask.id, {
        action,
        reject_reason: rejectReason.trim()
      });
      alert(res.message || (action === 'approve' ? 'Đã phê duyệt gia hạn nhiệm vụ thành công!' : 'Đã từ chối gia hạn nhiệm vụ.'));
      setExtensionReviewModalTask(null);
      loadData();
    } catch (err) {
      alert('Lỗi xử lý gia hạn: ' + (err.message || err));
    } finally {
      setIsReviewingExtension(false);
    }
  }

  // 3. Lãnh đạo mở modal chủ động gia hạn tiến độ
  function openLeaderExtendModal(task) {
    setLeaderExtendModalTask(task);
    const curr = task.deadline || todayStr;
    const next = new Date(curr);
    next.setDate(next.getDate() + 7);
    setLeaderNewDeadline(toInputDateFormat(next.toISOString().split('T')[0]));
    setLeaderExtendReason('Điều chỉnh tiến độ hoàn thành');
  }

  // 3. Lãnh đạo xác nhận chủ động gia hạn
  async function handleSubmitLeaderExtend() {
    if (!leaderExtendModalTask) return;
    if (!leaderNewDeadline) {
      alert('Vui lòng chọn thời hạn hoàn thành mới!');
      return;
    }
    try {
      setIsSubmittingLeaderExtend(true);
      const res = await api.extendTaskDeadline(leaderExtendModalTask.id, {
        new_deadline: leaderNewDeadline,
        reason: leaderExtendReason.trim()
      });
      alert(res.message || `Đã gia hạn nhiệm vụ đến ngày ${leaderNewDeadline} thành công!`);
      setLeaderExtendModalTask(null);
      loadData();
    } catch (err) {
      alert('Lỗi gia hạn nhiệm vụ: ' + (err.message || err));
    } finally {
      setIsSubmittingLeaderExtend(false);
    }
  }

  // --- SUBSETS OF TASKS ---
  // 1. Tasks assigned out (Nhiệm vụ đã giao):
  const assignedOutTasks = useMemo(() => {
    return assignedTasks.filter(t => {
      if (filterMyAssignedOnly) {
        return t.assigned_by === currentUser?.id;
      }
      return t.assigned_by === currentUser?.id || (isCBQL && t.origin === 'assigned');
    });
  }, [assignedTasks, currentUser, filterMyAssignedOnly, isCBQL]);

  // 2. Tasks assigned (Nhiệm vụ được giao):
  const assignedInTasks = useMemo(() => {
    if (isCBQL && assignedInScope === 'all') {
      return assignedTasks.filter(t => t.origin === 'assigned');
    }
    return assignedTasks.filter(t => t.user_id === currentUser?.id && t.origin === 'assigned');
  }, [assignedTasks, currentUser, isCBQL, assignedInScope]);

  // Personnel summary for 'assigned_in' view (Tổng hợp theo nhân sự)
  const personnelSummary = useMemo(() => {
    const map = new Map();
    assignedInTasks.forEach(t => {
      const uid = t.user_id;
      if (!map.has(uid)) {
        map.set(uid, {
          userId: uid,
          userName: t.user_name || 'Cán bộ',
          deptName: t.dept_name || 'Cơ quan',
          userRole: t.user_role || 'cbnv',
          tasks: [],
          total: 0,
          inProgress: 0,
          submitted: 0,
          approved: 0,
          overdue: 0,
          nearDeadline: 0,
          totalStandardScore: 0,
          totalMaxConverted: 0
        });
      }
      const item = map.get(uid);
      item.tasks.push(t);
      item.total++;
      if (t.status === 'in_progress') item.inProgress++;
      else if (t.status === 'submitted') item.submitted++;
      else if (t.status === 'approved') item.approved++;

      const dl = checkDeadlineStatus(t.deadline, t.status);
      if (dl.isOverdue) item.overdue++;
      if (dl.isNear) item.nearDeadline++;

      item.totalStandardScore += (t.standard_score || 0);
      item.totalMaxConverted += (t.max_converted_score || (t.standard_score * t.difficulty_weight) || 0);
    });

    let list = Array.from(map.values()).map(p => ({
      ...p,
      totalStandardScore: Number(p.totalStandardScore.toFixed(2)),
      totalMaxConverted: Number(p.totalMaxConverted.toFixed(2)),
      completionRate: p.total > 0 ? Math.round((p.approved / p.total) * 100) : 0
    }));

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(p => 
        p.userName.toLowerCase().includes(q) || 
        p.deptName.toLowerCase().includes(q) ||
        p.tasks.some(t => t.task_name?.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => b.total - a.total || a.userName.localeCompare(b.userName));
    return list;
  }, [assignedInTasks, searchTerm]);

  // 3. Personal tasks (Nhiệm vụ cá nhân - bao gồm việc tự đăng ký và việc được giao đã tiếp nhận):
  const personalTasks = useMemo(() => {
    return assignedTasks.filter(t => {
      if (t.user_id !== currentUser?.id) return false;
      if (t.origin === 'registered') return true;
      if (t.origin === 'assigned' && t.status !== 'pending_acceptance' && t.status !== 'returned') return true;
      return false;
    });
  }, [assignedTasks, currentUser]);

  // 4. Pending approval tasks:
  const pendingApprovalTasks = useMemo(() => {
    return assignedTasks.filter(t => t.status === 'pending_approval');
  }, [assignedTasks]);

  // 5. Overdue and Near Deadline Tasks:
  const overdueTasks = useMemo(() => {
    return assignedTasks.filter(t => {
      const st = checkDeadlineStatus(t.deadline, t.status);
      return st.isOverdue;
    });
  }, [assignedTasks]);

  const nearDeadlineTasks = useMemo(() => {
    return assignedTasks.filter(t => {
      const st = checkDeadlineStatus(t.deadline, t.status);
      return st.isNear;
    });
  }, [assignedTasks]);

  // Metrics for dashboard
  const metrics = useMemo(() => {
    const total = assignedTasks.length;
    const inProgress = assignedTasks.filter(t => t.status === 'in_progress').length;
    const submitted = assignedTasks.filter(t => t.status === 'submitted').length;
    const approved = assignedTasks.filter(t => t.status === 'approved').length;
    const pending = pendingApprovalTasks.length;
    const overdue = overdueTasks.length;

    const rate = total > 0 ? Math.round((approved / total) * 100) : 0;

    // By axis
    const axisCounts = {};
    axes.forEach(a => { axisCounts[a.code] = 0; });
    assignedTasks.forEach(t => {
      if (t.axis_code && axisCounts[t.axis_code] !== undefined) {
        axisCounts[t.axis_code]++;
      }
    });

    // By origin
    const assignedOriginCount = assignedTasks.filter(t => t.origin === 'assigned').length;
    const registeredOriginCount = assignedTasks.filter(t => t.origin === 'registered').length;

    return {
      total,
      inProgress,
      submitted,
      approved,
      pending,
      overdue,
      rate,
      axisCounts,
      assignedOriginCount,
      registeredOriginCount,
      assignedOutTotal: assignedOutTasks.length,
      assignedInTotal: assignedInTasks.length,
      personalTotal: personalTasks.length
    };
  }, [assignedTasks, pendingApprovalTasks, overdueTasks, axes, assignedOutTasks, assignedInTasks, personalTasks]);

  // Filter tasks based on current active view
  const currentViewTasks = useMemo(() => {
    let list = [];
    if (activeView === 'assigned_out') {
      list = assignedOutTasks;
    } else if (activeView === 'assigned_in') {
      list = assignedInTasks;
    } else if (activeView === 'personal') {
      list = personalTasks;
    } else {
      list = assignedTasks;
    }

    return list.filter(t => {
      // Search
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = t.task_name?.toLowerCase().includes(q);
        const matchUser = t.user_name?.toLowerCase().includes(q);
        const matchAssigner = t.assigner_name?.toLowerCase().includes(q);
        const matchOutput = t.output_result?.toLowerCase().includes(q);
        if (!matchName && !matchUser && !matchAssigner && !matchOutput) return false;
      }
      // Status
      if (statusFilter !== 'all') {
        if (statusFilter === 'overdue') {
          if (!checkDeadlineStatus(t.deadline, t.status).isOverdue) return false;
        } else if (t.status !== statusFilter) {
          return false;
        }
      }
      // Axis
      if (axisFilter !== 'all' && t.axis_code !== axisFilter) {
        return false;
      }
      // Assignee
      if (assigneeFilter !== 'all' && t.user_id !== assigneeFilter) {
        return false;
      }
      return true;
    });
  }, [activeView, assignedOutTasks, assignedInTasks, personalTasks, assignedTasks, searchTerm, statusFilter, axisFilter, assigneeFilter]);

  return (
    <div className="space-y-6">
      
      {/* 1. TOP HEADER & MAIN CONTROLS */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-red-800 text-white flex items-center justify-center shadow-md shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Quản lý & Theo dõi Nhiệm vụ
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
                Kỳ {selectedPeriod}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Theo dõi nhiệm vụ đã giao, nhiệm vụ được giao, nhiệm vụ cá nhân và dashboard tổng hợp tiến độ thực hiện
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-red-600' : ''}`} />
          </button>

          {isCBQL && (
            <button
              type="button"
              onClick={() => setIsGroupModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition"
              title="Quản lý nhóm người dùng tự tạo để giao việc nhanh"
            >
              <Users className="w-4 h-4 text-slate-600" />
              <span>Nhóm tự tạo ({userGroups.length})</span>
            </button>
          )}

          {isCBQL && (
            <button
              type="button"
              onClick={() => openModal('assign')}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-xs rounded-xl shadow-md transition"
            >
              <UserPlus className="w-4 h-4" />
              <span>Giao việc mới</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => openModal('register')}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold text-xs rounded-xl shadow-xs transition"
          >
            <Plus className="w-4 h-4 text-red-600" />
            <span>Tự đăng ký việc</span>
          </button>
        </div>
      </div>

      {/* 2. PENDING APPROVAL ALERT BANNER (If any) */}
      {isCBQL && pendingApprovalTasks.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-900">
                Có {pendingApprovalTasks.length} nhiệm vụ cấp dưới tự đăng ký đang chờ bạn phê duyệt!
              </h4>
              <p className="text-xs text-amber-700 mt-0.5">
                Vui lòng xem xét duyệt hoặc từ chối để cán bộ có căn cứ thực hiện và tính điểm chuẩn theo quy chế.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveView('all');
              setStatusFilter('pending_approval');
            }}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition shrink-0"
          >
            Xem & Phê duyệt ngay ({pendingApprovalTasks.length})
          </button>
        </div>
      )}

      {/* 3. NAVIGATION TABS (5 VIEW MODES) */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveView('dashboard')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
            activeView === 'dashboard'
              ? 'bg-red-700 text-white shadow-md font-semibold'
              : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Dashboard Tổng hợp</span>
          <span className={`px-2 py-0.2 rounded-full text-xs font-semibold ${
            activeView === 'dashboard' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {metrics.total}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView('assigned_out')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
            activeView === 'assigned_out'
              ? 'bg-red-700 text-white shadow-md font-semibold'
              : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
          }`}
        >
          <ArrowUpRight className="w-4 h-4 text-indigo-300" />
          <span>Nhiệm vụ đã giao</span>
          <span className={`px-2 py-0.2 rounded-full text-xs font-semibold ${
            activeView === 'assigned_out' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-800'
          }`}>
            {metrics.assignedOutTotal}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView('assigned_in')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
            activeView === 'assigned_in'
              ? 'bg-red-700 text-white shadow-md font-semibold'
              : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
          }`}
        >
          <ArrowDownLeft className="w-4 h-4 text-emerald-300" />
          <span>Nhiệm vụ được giao</span>
          <span className={`px-2 py-0.2 rounded-full text-xs font-semibold ${
            activeView === 'assigned_in' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {metrics.assignedInTotal}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView('personal')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
            activeView === 'personal'
              ? 'bg-red-700 text-white shadow-md font-semibold'
              : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
          }`}
        >
          <User className="w-4 h-4 text-amber-300" />
          <span>Nhiệm vụ cá nhân</span>
          <span className={`px-2 py-0.2 rounded-full text-xs font-semibold ${
            activeView === 'personal' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
          }`}>
            {metrics.personalTotal}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView('all')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
            activeView === 'all'
              ? 'bg-red-700 text-white shadow-md font-semibold'
              : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Tất cả nhiệm vụ</span>
          <span className={`px-2 py-0.2 rounded-full text-xs font-semibold ${
            activeView === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {metrics.total}
          </span>
        </button>
      </div>

      {/* 4. VIEW CONTENT */}
      {activeView === 'dashboard' ? (
        /* ============================================================== */
        /* MODE 1: DASHBOARD TỔNG HỢP                                    */
        /* ============================================================== */
        <div className="space-y-6">
          {/* 4 KPI METRIC CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Tổng số nhiệm vụ */}
            <div 
              onClick={() => setActiveView('all')}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-red-400 hover:shadow-md transition cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Tổng số nhiệm vụ</span>
                <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center group-hover:bg-red-600 group-hover:text-white transition">
                  <Layers className="w-5 h-5" />
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-900">{metrics.total}</div>
              <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                <span>Đang làm: <strong className="text-slate-800 font-semibold">{metrics.inProgress}</strong></span>
                <span>Hoàn thành: <strong className="text-emerald-700 font-semibold">{metrics.approved}</strong></span>
              </div>
            </div>

            {/* Card 2: Nhiệm vụ đã giao */}
            <div 
              onClick={() => setActiveView('assigned_out')}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-400 hover:shadow-md transition cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Nhiệm vụ đã giao</span>
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition">
                  <ArrowUpRight className="w-5 h-5" />
                </div>
              </div>
              <div className="text-3xl font-bold text-indigo-700">{metrics.assignedOutTotal}</div>
              <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                <span>Cấp dưới thực hiện</span>
                <span className="text-indigo-600 font-medium group-hover:underline flex items-center">
                  Xem chi tiết <ChevronRight className="w-3 h-3 ml-0.5" />
                </span>
              </div>
            </div>

            {/* Card 3: Nhiệm vụ được giao */}
            <div 
              onClick={() => setActiveView('assigned_in')}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-md transition cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Nhiệm vụ được giao</span>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition">
                  <ArrowDownLeft className="w-5 h-5" />
                </div>
              </div>
              <div className="text-3xl font-bold text-blue-700">{metrics.assignedInTotal}</div>
              <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                <span>Cấp trên giao cho tôi</span>
                <span className="text-blue-600 font-medium group-hover:underline flex items-center">
                  Xem chi tiết <ChevronRight className="w-3 h-3 ml-0.5" />
                </span>
              </div>
            </div>

            {/* Card 4: Nhiệm vụ cá nhân */}
            <div 
              onClick={() => setActiveView('personal')}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-amber-400 hover:shadow-md transition cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Nhiệm vụ cá nhân</span>
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition">
                  <User className="w-5 h-5" />
                </div>
              </div>
              <div className="text-3xl font-bold text-amber-700">{metrics.personalTotal}</div>
              <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                <span>Tự đăng ký trong kỳ</span>
                <span className="text-amber-600 font-medium group-hover:underline flex items-center">
                  Xem chi tiết <ChevronRight className="w-3 h-3 ml-0.5" />
                </span>
              </div>
            </div>
          </div>

          {/* STATUS BREAKDOWN & COMPLETION RATE */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-xs text-slate-500 font-medium">Đang thực hiện</div>
              <div className="text-2xl font-bold text-slate-800 mt-1">{metrics.inProgress}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Chiếm {metrics.total > 0 ? Math.round((metrics.inProgress / metrics.total) * 100) : 0}% tổng số việc
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-xs text-blue-700 font-medium">Đã nộp minh chứng</div>
              <div className="text-2xl font-bold text-blue-700 mt-1">{metrics.submitted}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Chờ thẩm định & chấm điểm</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-xs text-amber-700 font-medium">Chờ duyệt việc</div>
              <div className="text-2xl font-bold text-amber-700 mt-1">{metrics.pending}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Đăng ký mới chờ CBQL duyệt</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-xs text-emerald-700 font-medium">Đã duyệt kết quả</div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">{metrics.approved}</div>
              <div className="text-[11px] text-emerald-600 mt-0.5 font-bold">
                Tỷ lệ hoàn thành: {metrics.rate}%
              </div>
            </div>
          </div>

          {/* TWO-COLUMN ANALYTICS SECTION */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Origin & Deadline Summary (5 cols) */}
            <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-5">
              <h3 className="text-sm font-bold text-slate-900 flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-red-600" />
                  Cơ cấu Nguồn việc & Hạn định
                </span>
                <span className="text-xs font-semibold text-slate-500">Tỷ lệ %</span>
              </h3>

              {/* Progress bar: Origin */}
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                    Lãnh đạo giao: {metrics.assignedOriginCount} việc
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    Tự đăng ký: {metrics.registeredOriginCount} việc
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex">
                  <div 
                    className="bg-indigo-600 h-full transition-all duration-500"
                    style={{ width: `${metrics.total > 0 ? (metrics.assignedOriginCount / metrics.total) * 100 : 0}%` }}
                    title={`Lãnh đạo giao: ${metrics.assignedOriginCount}`}
                  />
                  <div 
                    className="bg-amber-500 h-full transition-all duration-500"
                    style={{ width: `${metrics.total > 0 ? (metrics.registeredOriginCount / metrics.total) * 100 : 0}%` }}
                    title={`Tự đăng ký: ${metrics.registeredOriginCount}`}
                  />
                </div>
              </div>

              {/* Deadline & Overdue alerts */}
              <div className="space-y-2.5 pt-2">
                <div className={`p-3 rounded-xl border flex items-center justify-between ${
                  metrics.overdue > 0 ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <AlertTriangle className={`w-4 h-4 ${metrics.overdue > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
                    <span>Nhiệm vụ trễ hạn (Quá hạn chót)</span>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    metrics.overdue > 0 ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {metrics.overdue}
                  </span>
                </div>

                <div className={`p-3 rounded-xl border flex items-center justify-between ${
                  nearDeadlineTasks.length > 0 ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <Clock className={`w-4 h-4 ${nearDeadlineTasks.length > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
                    <span>Nhiệm vụ cận hạn (≤ 3 ngày tới)</span>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    nearDeadlineTasks.length > 0 ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {nearDeadlineTasks.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: By 6 Result Axes (7 cols) */}
            <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-red-600" />
                  Phân bổ theo 6 Trục kết quả (QĐ 366 & HD 06)
                </span>
                <span className="text-xs font-semibold text-slate-500">Số lượng & Tỷ trọng</span>
              </h3>

              <div className="space-y-3">
                {axes.map((ax) => {
                  const count = metrics.axisCounts[ax.code] || 0;
                  const pct = metrics.total > 0 ? Math.round((count / metrics.total) * 100) : 0;
                  return (
                    <div key={ax.code} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-800 truncate max-w-md">
                          {ax.name}
                        </span>
                        <span className="font-mono font-bold text-slate-700 shrink-0 ml-2">
                          {count} việc ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-red-600 h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* URGENT / ATTENTION TASKS (Overdue, Near Deadline & Pending Approval) */}
          {(overdueTasks.length > 0 || nearDeadlineTasks.length > 0 || pendingApprovalTasks.length > 0) && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                  <span>Danh sách nhiệm vụ cần ưu tiên xử lý ngay</span>
                </h3>
                <span className="text-xs font-semibold text-slate-500">
                  {overdueTasks.length} quá hạn • {nearDeadlineTasks.length} cận hạn • {pendingApprovalTasks.length} chờ duyệt
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {[...overdueTasks, ...nearDeadlineTasks, ...pendingApprovalTasks]
                  .slice(0, 6)
                  .map((task, idx) => {
                    const dl = checkDeadlineStatus(task.deadline, task.status);
                    const isPending = task.status === 'pending_approval';

                    return (
                      <div 
                        key={task.id || idx}
                        className={`p-4 rounded-xl border transition flex flex-col justify-between gap-3 ${
                          isPending
                            ? 'bg-amber-50/70 border-amber-200'
                            : dl.isOverdue
                            ? 'bg-rose-50/70 border-rose-200'
                            : 'bg-orange-50/70 border-orange-200'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="text-xs font-bold text-slate-900 truncate">
                              👤 {task.user_name}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                              isPending
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : dl.isOverdue
                                ? 'bg-rose-100 text-rose-800 border-rose-300'
                                : 'bg-orange-100 text-orange-800 border-orange-300'
                            }`}>
                              {isPending ? 'Chờ duyệt việc' : dl.text}
                            </span>
                          </div>

                          <div className="text-sm font-bold text-slate-900 line-clamp-2">
                            {task.task_name}
                          </div>

                          <div className="text-xs text-slate-600 mt-1">
                            Hạn chót: <strong>{formatDate(task.deadline)}</strong> • {task.standard_score}đ (HS: {task.difficulty_weight})
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/60">
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDeleteTask(task)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-lg shadow-2xs transition-colors"
                              title="Admin xóa công việc này"
                            >
                              <Trash2 size={13} className="text-rose-600" />
                              <span>Xóa</span>
                            </button>
                          )}
                          {isPending && isCBQL ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openApprovalModal(task)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-2xs"
                              >
                                Duyệt
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRejectTask(task)}
                                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-2xs"
                              >
                                Từ chối
                              </button>
                            </>
                          ) : task.user_id === currentUser?.id ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (setCurrentTab) setCurrentTab('execution');
                              }}
                              className="px-3 py-1 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-lg shadow-2xs"
                            >
                              Nộp minh chứng →
                            </button>
                          ) : !isAdmin && (
                            <span className="text-[11px] text-slate-500 italic">Đang theo dõi</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ============================================================== */
        /* MODE 2, 3, 4, 5: DANH SÁCH BẢNG CHI TIẾT                       */
        /* ============================================================== */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          {/* Table Header Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  {activeView === 'assigned_out' && <ArrowUpRight className="w-5 h-5 text-indigo-600" />}
                  {activeView === 'assigned_in' && <ArrowDownLeft className="w-5 h-5 text-emerald-600" />}
                  {activeView === 'personal' && <User className="w-5 h-5 text-amber-600" />}
                  {activeView === 'all' && <Layers className="w-5 h-5 text-slate-600" />}

                  <span>
                    {activeView === 'assigned_out' && 'Danh sách Nhiệm vụ đã giao cho cấp dưới'}
                    {activeView === 'assigned_in' && (assignedInSubView === 'summary' ? 'Tổng hợp Nhiệm vụ được giao theo Nhân sự' : 'Danh sách Chi tiết Nhiệm vụ được giao')}
                    {activeView === 'personal' && 'Danh sách Nhiệm vụ cá nhân tự đăng ký'}
                    {activeView === 'all' && 'Toàn bộ danh sách nhiệm vụ trong kỳ'}
                  </span>
                </h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-700">
                  {activeView === 'assigned_in' && assignedInSubView === 'summary' 
                    ? `${personnelSummary.length} nhân sự • ${assignedInTasks.length} việc` 
                    : `${currentViewTasks.length} nhiệm vụ`}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {activeView === 'assigned_out' && 'Quản lý các công việc do Lãnh đạo/Quản lý phân công cho cán bộ, nhân viên thực hiện'}
                {activeView === 'assigned_in' && (assignedInSubView === 'summary' 
                  ? 'Bảng tổng hợp tình hình phân công, tiến độ thực hiện và điểm số KPI của từng cán bộ, nhân viên' 
                  : 'Theo dõi chi tiết các công việc được cấp trên trực tiếp giao phó và cập nhật minh chứng')}
                {activeView === 'personal' && 'Theo dõi các công việc do bản thân chủ động đăng ký trong kế hoạch công tác quý'}
                {activeView === 'all' && 'Tổng hợp tất cả công việc đã giao, được giao và tự đăng ký trong kỳ đánh giá'}
              </p>
            </div>

            {/* Quick Controls / Toggles */}
            <div className="flex items-center gap-2.5 flex-wrap shrink-0">
              {/* If assigned_in: Switch between Summary and List + Scope */}
              {activeView === 'assigned_in' && (
                <>
                  {isCBQL && (
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setAssignedInScope('all')}
                        className={`px-2.5 py-1.5 rounded-lg transition ${
                          assignedInScope === 'all' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Tất cả nhân sự
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssignedInScope('me')}
                        className={`px-2.5 py-1.5 rounded-lg transition ${
                          assignedInScope === 'me' ? 'bg-emerald-600 text-white shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Chỉ của tôi
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setAssignedInSubView('summary')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                        assignedInSubView === 'summary' 
                          ? 'bg-red-700 text-white shadow-xs font-bold' 
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Tổng hợp theo nhân sự</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignedInSubView('list')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                        assignedInSubView === 'list' 
                          ? 'bg-red-700 text-white shadow-xs font-bold' 
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Danh sách việc ({assignedInTasks.length})</span>
                    </button>
                  </div>
                </>
              )}

              {/* Quick Filter toggle for Assigned Out */}
              {activeView === 'assigned_out' && isCBQL && (
                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl text-xs font-semibold shrink-0">
                  <button
                    type="button"
                    onClick={() => setFilterMyAssignedOnly(false)}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      !filterMyAssignedOnly ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tất cả việc lãnh đạo giao
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMyAssignedOnly(true)}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      filterMyAssignedOnly ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-indigo-700'
                    }`}
                  >
                    Chỉ việc tôi giao
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* VIEW BRANCH: IF assigned_in AND assignedInSubView === 'summary' => SHOW PERSONNEL SUMMARY */}
          {activeView === 'assigned_in' && assignedInSubView === 'summary' ? (
            <div className="space-y-4">
              {/* PERSONNEL SUMMARY METRIC STRIP */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div className="text-xs text-slate-500 font-medium">Cán bộ nhận nhiệm vụ</div>
                  <div className="text-2xl font-bold text-slate-800 mt-1">{personnelSummary.length} cán bộ</div>
                </div>
                <div className="bg-blue-50 p-3.5 rounded-xl border border-blue-200">
                  <div className="text-xs text-blue-700 font-medium">Tổng nhiệm vụ được giao</div>
                  <div className="text-2xl font-bold text-blue-700 mt-1">{assignedInTasks.length} việc</div>
                </div>
                <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200">
                  <div className="text-xs text-amber-700 font-medium">Đang làm / Đã nộp MC</div>
                  <div className="text-2xl font-bold text-amber-700 mt-1">
                    {assignedInTasks.filter(t => t.status !== 'approved').length} việc
                  </div>
                </div>
                <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200">
                  <div className="text-xs text-emerald-700 font-medium">Đã hoàn thành (Duyệt KQ)</div>
                  <div className="text-2xl font-bold text-emerald-700 mt-1">
                    {assignedInTasks.filter(t => t.status === 'approved').length} việc
                  </div>
                </div>
              </div>

              {/* Search filter for personnel */}
              <div className="relative max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tìm kiếm cán bộ, phòng ban hoặc tên nhiệm vụ..."
                  className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-normal"
                />
              </div>

              {/* Table for Personnel Summary (hidden lg:block) */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full min-w-[1300px] text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 font-semibold text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3.5 w-14 text-center">STT</th>
                      <th className="px-4 py-3.5 min-w-[260px]">Cán bộ / Nhân sự</th>
                      <th className="px-4 py-3.5 min-w-[180px]">Đơn vị / Chức danh</th>
                      <th className="px-4 py-3.5 min-w-[120px] text-center">Số việc giao</th>
                      <th className="px-4 py-3.5 min-w-[240px]">Tình trạng thực hiện</th>
                      <th className="px-4 py-3.5 min-w-[160px] text-center">Tình trạng hạn</th>
                      <th className="px-4 py-3.5 min-w-[160px] text-center">Tổng ĐC & Điểm QĐ</th>
                      <th className="px-4 py-3.5 min-w-[180px]">Tiến độ hoàn thành</th>
                      <th className="px-4 py-3.5 min-w-[150px] text-center">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-normal">
                    {personnelSummary.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="text-center py-12 text-slate-400 italic">
                          Chưa có dữ liệu nhiệm vụ được giao cho nhân sự.
                        </td>
                      </tr>
                    ) : (
                      personnelSummary.map((p, idx) => {
                        const isExpanded = expandedUserIds.includes(p.userId);
                        const initials = p.userName.split(' ').map(n => n[0]).slice(-2).join('');
                        return (
                          <React.Fragment key={p.userId}>
                            <tr 
                              onClick={() => toggleExpandUser(p.userId)}
                              className={`hover:bg-red-50/40 transition cursor-pointer ${isExpanded ? 'bg-red-50/30' : ''}`}
                            >
                              <td className="px-4 py-3.5 text-center font-normal text-slate-400">
                                {idx + 1}
                              </td>

                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-600 to-red-800 text-white font-medium text-xs flex items-center justify-center shrink-0 shadow-2xs">
                                    {initials}
                                  </div>
                                  <div>
                                    <div className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                                      <span>{p.userName}</span>
                                      {currentUser?.id === p.userId && (
                                        <span className="px-2 py-0.2 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800">
                                          Tôi
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-0.5">
                                      Mã NV: {p.userId.slice(0, 8)}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="px-4 py-3.5">
                                <div className="font-medium text-slate-800 text-xs">{p.deptName}</div>
                                <div className="text-xs text-slate-400 mt-0.5">{p.userRole === 'cbql' ? 'Lãnh đạo/Quản lý' : 'Công chức/Viên chức'}</div>
                              </td>

                              <td className="px-4 py-3.5 text-center">
                                <span className="inline-flex items-center justify-center px-3 py-1 rounded-xl text-sm font-semibold bg-blue-100 text-blue-900 border border-blue-200">
                                  {p.total}
                                </span>
                              </td>

                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold" title="Đang thực hiện">
                                    ● Đang làm: <strong>{p.inProgress}</strong>
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-semibold" title="Đã nộp minh chứng">
                                    ⏳ Đã nộp: <strong>{p.submitted}</strong>
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold" title="Đã duyệt kết quả">
                                    ✓ Đã duyệt: <strong>{p.approved}</strong>
                                  </span>
                                </div>
                              </td>

                              <td className="px-4 py-3.5 text-center whitespace-nowrap">
                                {p.overdue > 0 ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                    <AlertTriangle className="w-3 h-3 text-rose-600" />
                                    {p.overdue} trễ hạn
                                  </span>
                                ) : p.nearDeadline > 0 ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                    <Clock className="w-3 h-3 text-amber-600" />
                                    {p.nearDeadline} cận hạn
                                  </span>
                                ) : (
                                  <span className="text-xs text-emerald-700 font-semibold">
                                    ✓ Đúng hạn
                                  </span>
                                )}
                              </td>

                              <td className="px-4 py-3.5 text-center">
                                <div className="font-bold text-slate-900 text-sm">
                                  {p.totalStandardScore} đ
                                </div>
                                <div className="text-xs text-slate-400 mt-0.5 font-medium">
                                  QĐ: {p.totalMaxConverted} đ
                                </div>
                              </td>

                              <td className="px-4 py-3.5">
                                <div className="space-y-1">
                                  <div className="flex justify-between text-xs font-bold text-slate-700">
                                    <span>{p.completionRate}%</span>
                                    <span className="text-slate-400 font-normal">{p.approved}/{p.total} việc</span>
                                  </div>
                                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full transition-all duration-500 ${
                                        p.completionRate >= 80 ? 'bg-emerald-600' : p.completionRate >= 50 ? 'bg-amber-500' : 'bg-red-600'
                                      }`}
                                      style={{ width: `${p.completionRate}%` }}
                                    />
                                  </div>
                                </div>
                              </td>

                              <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => toggleExpandUser(p.userId)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-red-300 bg-white hover:bg-red-50 text-xs font-bold text-slate-700 hover:text-red-700 transition shadow-2xs"
                                >
                                  <span>{isExpanded ? 'Thu gọn' : `Xem việc (${p.total})`}</span>
                                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                              </td>
                            </tr>

                            {/* EXPANDED SUB-TABLE FOR THIS PERSONNEL */}
                            {isExpanded && (
                              <tr className="bg-slate-50/80">
                                <td colSpan="9" className="p-4 pl-14">
                                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                                      <div className="flex items-center gap-2">
                                        <Layers className="w-4 h-4 text-red-600" />
                                        <h4 className="text-xs font-bold text-slate-900">
                                          Danh sách nhiệm vụ cụ thể giao cho: <strong>{p.userName}</strong> ({p.tasks.length} nhiệm vụ)
                                        </h4>
                                      </div>
                                      <span className="text-xs text-slate-500">
                                        Tổng điểm quy đổi kế hoạch: <strong className="text-slate-800">{p.totalMaxConverted} điểm</strong>
                                      </span>
                                    </div>

                                    <div className="overflow-x-auto">
                                      <table className="w-full text-xs text-left">
                                        <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200">
                                          <tr>
                                            <th className="py-2.5 px-3 w-10 text-center">#</th>
                                            <th className="py-2.5 px-3 min-w-[280px]">Tên nhiệm vụ</th>
                                            <th className="py-2.5 px-3 min-w-[140px]">Loại việc</th>
                                            <th className="py-2.5 px-3 min-w-[160px]">Đầu ra yêu cầu</th>
                                            <th className="py-2.5 px-3 min-w-[130px]">Hạn chót</th>
                                            <th className="py-2.5 px-3 min-w-[100px] text-center">Điểm & HS</th>
                                            <th className="py-2.5 px-3 min-w-[120px] text-center">Trạng thái</th>
                                            <th className="py-2.5 px-3 min-w-[110px] text-center">Thao tác</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {p.tasks.map((task, sIdx) => {
                                            const dl = checkDeadlineStatus(task.deadline, task.status);
                                            return (
                                              <tr key={task.id} className="hover:bg-slate-50 transition">
                                                <td className="py-2 px-3 text-center text-slate-400 font-normal">
                                                  {sIdx + 1}
                                                </td>
                                                <td className="py-2 px-3">
                                                  <div className="font-semibold text-slate-900">{task.task_name}</div>
                                                  <div className="text-[11px] text-slate-400 mt-0.5">Trục: {task.axis_code}</div>
                                                </td>
                                                <td className="py-2 px-3">
                                                  <span className={`text-[11px] font-semibold ${task.task_type === 'Đột xuất' ? 'text-amber-700' : 'text-slate-600'}`}>
                                                    {task.task_type}
                                                  </span>
                                                </td>
                                                <td className="py-2 px-3 text-slate-700 text-[11px]">
                                                  {task.output_result}
                                                </td>
                                                <td className="py-2 px-3 whitespace-nowrap">
                                                  <div className="text-slate-800 font-medium">{formatDate(task.deadline)}</div>
                                                  <div className="text-[10px] text-slate-400">{dl.text}</div>
                                                </td>
                                                <td className="py-2 px-3 text-center">
                                                  <span className="font-bold text-slate-900">{task.standard_score}đ</span>
                                                  <span className="text-[10px] text-slate-400 block">HS: {task.difficulty_weight}</span>
                                                </td>
                                                <td className="py-2 px-3 text-center whitespace-nowrap">
                                                  <span className={`inline-block px-2 py-0.5 rounded-full font-semibold text-[11px] ${
                                                    task.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                                                    task.status === 'submitted' ? 'bg-blue-100 text-blue-800' :
                                                    task.status === 'pending_acceptance' ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                                                    task.status === 'feedback_submitted' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                                                    'bg-slate-100 text-slate-700'
                                                  }`}>
                                                    {task.status === 'approved' ? '✓ Đã duyệt' :
                                                     task.status === 'submitted' ? '⏳ Đã nộp' :
                                                     task.status === 'pending_acceptance' ? '⏳ Chờ nhận việc' :
                                                     task.status === 'feedback_submitted' ? '⚠️ Đã phản hồi' : '● Đang làm'}
                                                  </span>
                                                  {task.feedback_reason && (
                                                    <div className="text-[10px] text-rose-700 max-w-[120px] truncate mx-auto mt-0.5" title={`Lý do phản hồi: ${task.feedback_reason}`}>
                                                      "{task.feedback_reason}"
                                                    </div>
                                                  )}
                                                </td>
                                                <td className="py-2 px-3 text-center whitespace-nowrap">
                                                  <div className="flex items-center justify-center gap-1 flex-wrap">
                                                    {task.status === 'pending_acceptance' && currentUser?.id === task.user_id ? (
                                                      <>
                                                        <button
                                                          type="button"
                                                          onClick={() => handleAcceptTask(task.id)}
                                                          className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded shadow-2xs"
                                                          title="Xác nhận tiếp nhận nhiệm vụ (chuyển vào Công việc cá nhân)"
                                                        >
                                                          Nhận việc
                                                        </button>
                                                        <button
                                                          type="button"
                                                          onClick={() => openReturnModal(task)}
                                                          className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] rounded shadow-2xs"
                                                          title="Trả lại việc cho cấp trên với lý do"
                                                        >
                                                          Trả lại
                                                        </button>
                                                        <button
                                                          type="button"
                                                          onClick={() => openFeedbackModal(task)}
                                                          className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] rounded shadow-2xs"
                                                          title="Phản hồi lý do chưa hợp lý (tối đa 1 lần)"
                                                        >
                                                          Phản hồi
                                                        </button>
                                                      </>
                                                    ) : task.status === 'feedback_submitted' && isCBQL ? (
                                                      <>
                                                        <button
                                                          type="button"
                                                          onClick={() => openReassignModal(task)}
                                                          className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] rounded shadow-2xs"
                                                          title="Điều chỉnh thông tin và giao lại nhiệm vụ"
                                                        >
                                                          Giao lại
                                                        </button>
                                                        {!isAdmin && (
                                                          <button
                                                            type="button"
                                                            onClick={() => handleRecallTask(task)}
                                                            className="px-2 py-0.5 bg-slate-100 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-[10px] rounded shadow-2xs"
                                                            title="Thu hồi công việc đã giao nhầm"
                                                          >
                                                            Thu hồi
                                                          </button>
                                                        )}
                                                      </>
                                                    ) : currentUser?.id === task.user_id ? (
                                                      <button
                                                        type="button"
                                                        onClick={() => { if (setCurrentTab) setCurrentTab('execution'); }}
                                                        className="px-2.5 py-1 bg-red-700 hover:bg-red-800 text-white font-bold text-[11px] rounded-lg shadow-2xs"
                                                      >
                                                        Nộp MC →
                                                      </button>
                                                    ) : !isAdmin && (((currentUser?.id === task.assigned_by) || isCBQL) && task.origin === 'assigned' && task.status !== 'approved') ? (
                                                      <button
                                                        type="button"
                                                        onClick={() => handleRecallTask(task)}
                                                        className="px-2 py-0.5 bg-slate-100 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-[10px] rounded shadow-2xs"
                                                        title="Thu hồi công việc đã giao nhầm"
                                                      >
                                                        Thu hồi
                                                      </button>
                                                    ) : !isAdmin && (
                                                      <span className="text-slate-400 italic text-[11px]">Theo dõi</span>
                                                    )}

                                                    {isAdmin && (
                                                      <button
                                                        type="button"
                                                        onClick={() => handleDeleteTask(task)}
                                                        className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-[10px] rounded shadow-2xs transition-colors"
                                                        title="Admin xóa công việc đã giao này"
                                                      >
                                                        <Trash2 size={11} className="text-rose-600" />
                                                        <span>Xóa</span>
                                                      </button>
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
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile & Tablet Cards for Personnel Summary (lg:hidden) */}
              <div className="lg:hidden space-y-3">
                {personnelSummary.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200 italic text-xs">
                    Chưa có dữ liệu nhiệm vụ được giao cho nhân sự.
                  </div>
                ) : (
                  personnelSummary.map((p) => {
                    const isExpanded = expandedUserIds.includes(p.userId);
                    const initials = p.userName.split(' ').map(n => n[0]).slice(-2).join('');
                    return (
                      <div 
                        key={p.userId}
                        className={`bg-white rounded-2xl border p-4 shadow-2xs space-y-3 transition-all ${
                          isExpanded ? 'border-red-300 ring-1 ring-red-200 bg-red-50/10' : 'border-slate-200'
                        }`}
                      >
                        {/* Header: Avatar, Name, Role, Dept */}
                        <div className="flex items-start justify-between gap-2.5 border-b border-slate-100 pb-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-600 to-red-800 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5 flex-wrap">
                                <span>{p.userName}</span>
                                {currentUser?.id === p.userId && (
                                  <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                    Tôi
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 truncate mt-0.5">
                                {p.deptName} • <span className="font-medium text-slate-600">{p.userRole === 'cbql' ? 'LĐ/QL' : 'CBNV'}</span>
                              </div>
                            </div>
                          </div>

                          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-xl text-xs font-bold bg-blue-100 text-blue-900 border border-blue-200 shrink-0">
                            {p.total} việc
                          </span>
                        </div>

                        {/* Metrics Grid */}
                        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-medium">Tình trạng:</span>
                            <div className="space-y-0.5 mt-0.5">
                              <div className="text-[11px] text-slate-700 font-semibold">● Đang làm: {p.inProgress}</div>
                              <div className="text-[11px] text-blue-700 font-semibold">⏳ Đã nộp: {p.submitted}</div>
                              <div className="text-[11px] text-emerald-700 font-bold">✓ Đã duyệt: {p.approved}</div>
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block font-medium">Hạn định & Điểm:</span>
                            <div className="mt-0.5">
                              {p.overdue > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                  ⚠️ {p.overdue} trễ hạn
                                </span>
                              ) : p.nearDeadline > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  🕒 {p.nearDeadline} cận hạn
                                </span>
                              ) : (
                                <span className="text-[11px] text-emerald-700 font-bold">✓ Đúng hạn</span>
                              )}
                            </div>
                            <div className="mt-1 font-bold text-slate-900 text-xs">
                              {p.totalStandardScore}đ <span className="text-slate-400 font-normal text-[10px]">(QĐ: {p.totalMaxConverted}đ)</span>
                            </div>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-bold text-slate-700">
                            <span>Tiến độ hoàn thành</span>
                            <span className="text-red-700">{p.completionRate}% ({p.approved}/{p.total} việc)</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                p.completionRate >= 80 ? 'bg-emerald-600' : p.completionRate >= 50 ? 'bg-amber-500' : 'bg-red-600'
                              }`}
                              style={{ width: `${p.completionRate}%` }}
                            />
                          </div>
                        </div>

                        {/* Toggle Expand Button */}
                        <button
                          type="button"
                          onClick={() => toggleExpandUser(p.userId)}
                          className="w-full py-2 px-3 rounded-xl border border-slate-200 hover:border-red-300 bg-slate-50 hover:bg-red-50 text-xs font-bold text-slate-700 hover:text-red-700 transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                        >
                          <span>{isExpanded ? 'Thu gọn danh sách việc' : `Xem chi tiết ${p.tasks.length} nhiệm vụ`}</span>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {/* Expanded Tasks on Mobile */}
                        {isExpanded && (
                          <div className="space-y-2 pt-2 border-t border-slate-100 animate-in fade-in">
                            {p.tasks.map((task, sIdx) => {
                              const dl = checkDeadlineStatus(task.deadline, task.status);
                              return (
                                <div key={task.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="font-bold text-slate-900 text-xs leading-snug">
                                      #{sIdx + 1}. {task.task_name}
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] shrink-0 ${
                                      task.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                                      task.status === 'submitted' ? 'bg-blue-100 text-blue-800' :
                                      task.status === 'pending_acceptance' ? 'bg-amber-100 text-amber-900' :
                                      task.status === 'feedback_submitted' ? 'bg-rose-100 text-rose-800' :
                                      'bg-slate-200 text-slate-700'
                                    }`}>
                                      {task.status === 'approved' ? '✓ Đã duyệt' :
                                       task.status === 'submitted' ? '⏳ Đã nộp' :
                                       task.status === 'pending_acceptance' ? '⏳ Chờ nhận' :
                                       task.status === 'feedback_submitted' ? '⚠️ Phản hồi' : '● Đang làm'}
                                    </span>
                                  </div>

                                  <div className="text-[11px] text-slate-500 space-y-0.5">
                                    <div>Hạn chót: <strong>{formatDate(task.deadline)}</strong> ({dl.text})</div>
                                    <div>Đầu ra: <strong>{task.output_result}</strong></div>
                                    <div>Điểm chuẩn: <strong>{task.standard_score}đ</strong> (HS: {task.difficulty_weight})</div>
                                  </div>

                                  {/* Action */}
                                  <div className="pt-1 flex items-center justify-end gap-1.5">
                                    {task.status === 'pending_acceptance' && currentUser?.id === task.user_id ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleAcceptTask(task.id)}
                                          className="px-2.5 py-1 bg-emerald-600 text-white font-bold text-xs rounded-lg shadow-2xs"
                                        >
                                          Nhận việc
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => openFeedbackModal(task)}
                                          className="px-2.5 py-1 bg-amber-600 text-white font-bold text-xs rounded-lg shadow-2xs"
                                        >
                                          Phản hồi
                                        </button>
                                      </>
                                    ) : currentUser?.id === task.user_id ? (
                                      <button
                                        type="button"
                                        onClick={() => { if (setCurrentTab) setCurrentTab('execution'); }}
                                        className="px-3 py-1 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-lg shadow-2xs"
                                      >
                                        Nộp MC →
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            /* ELSE: DETAILED FLAT TABLE & FILTERS */
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Search Input */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Tìm tên công việc, cán bộ..."
                    className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  />
                </div>

                {/* Status Filter */}
                <div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-medium"
                  >
                    <option value="all">Tất cả trạng thái</option>
                    <option value="in_progress">Đang thực hiện</option>
                    <option value="submitted">Đã nộp minh chứng</option>
                    <option value="pending_approval">Chờ duyệt việc</option>
                    <option value="approved">Đã duyệt kết quả</option>
                    <option value="overdue">Quá hạn chót</option>
                  </select>
                </div>

                {/* Axis Filter */}
                <div>
                  <select
                    value={axisFilter}
                    onChange={(e) => setAxisFilter(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-medium"
                  >
                    <option value="all">Tất cả 6 trục kết quả</option>
                    {axes.map(ax => (
                      <option key={ax.code} value={ax.code}>{ax.name.split(' - ')[0]}</option>
                    ))}
                  </select>
                </div>

                {/* Assignee Filter (for assigned_out or all) */}
                {activeView !== 'assigned_in' && activeView !== 'personal' && (
                  <div>
                    <select
                      value={assigneeFilter}
                      onChange={(e) => setAssigneeFilter(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-medium"
                    >
                      <option value="all">Tất cả cán bộ nhận việc</option>
                      {assignableUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.full_name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Bulk Delete Actions Bar for Admin */}
              {isAdmin && selectedTaskIds.length > 0 && (
                <div className="flex items-center justify-between p-3 bg-rose-50 border border-rose-200 rounded-xl animate-in fade-in duration-150">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-600 text-white text-xs font-bold">
                      {selectedTaskIds.length}
                    </span>
                    <span className="text-sm font-bold text-rose-900">
                      Đã chọn {selectedTaskIds.length} công việc đã giao
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedTaskIds([])}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs hover:bg-slate-50 transition"
                    >
                      Hủy chọn
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkDeleteAssignedTasks}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-2xs transition active:scale-95 cursor-pointer"
                    >
                      <Trash2 size={14} />
                      <span>Xóa {selectedTaskIds.length} công việc đã chọn</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Detailed Table (hidden lg:block) */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full min-w-[1350px] text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200">
                    <tr>
                      {isAdmin && (
                        <th className="px-3 py-3.5 w-10 text-center">
                          <input
                            type="checkbox"
                            className="w-4 h-4 text-red-600 rounded border-slate-300 focus:ring-red-500 cursor-pointer"
                            checked={currentViewTasks.length > 0 && currentViewTasks.every(t => selectedTaskIds.includes(t.id))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const allIds = currentViewTasks.map(t => t.id);
                                setSelectedTaskIds(prev => Array.from(new Set([...prev, ...allIds])));
                              } else {
                                const pageIds = new Set(currentViewTasks.map(t => t.id));
                                setSelectedTaskIds(prev => prev.filter(id => !pageIds.has(id)));
                              }
                            }}
                            title="Chọn tất cả công việc đang hiển thị"
                          />
                        </th>
                      )}
                      <th className="px-4 py-3.5 w-14 text-center">STT</th>
                      {activeView !== 'personal' && activeView !== 'assigned_in' && (
                        <th className="px-4 py-3.5 min-w-[220px]">Người thực hiện</th>
                      )}
                      {activeView !== 'assigned_out' && (
                        <th className="px-4 py-3.5 min-w-[180px]">Nguồn việc / Người giao</th>
                      )}
                      <th className="px-4 py-3.5 min-w-[360px]">Nhiệm vụ & Trục kết quả</th>
                      <th className="px-4 py-3.5 min-w-[180px]">Kết quả đầu ra yêu cầu</th>
                      <th className="px-4 py-3.5 min-w-[160px]">Thời hạn & Hạn định</th>
                      <th className="px-4 py-3.5 min-w-[130px] text-center">Điểm chuẩn & HS</th>
                      <th className="px-4 py-3.5 min-w-[160px] text-center">Trạng thái</th>
                      <th className="px-4 py-3.5 min-w-[140px] text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentViewTasks.length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 10 : 9} className="text-center py-12 text-slate-400 italic">
                          Không tìm thấy công việc nào phù hợp với bộ lọc hiện tại.
                        </td>
                      </tr>
                    ) : (
                      currentViewTasks.map((t, idx) => {
                        const dl = checkDeadlineStatus(t.deadline, t.status);
                        const isPending = t.status === 'pending_approval';
                        const isApproved = t.status === 'approved';
                        const isSubmitted = t.status === 'submitted';

                        return (
                          <tr key={t.id} className="hover:bg-slate-50 transition">
                            {isAdmin && (
                              <td className="px-3 py-3.5 text-center">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 text-red-600 rounded border-slate-300 focus:ring-red-500 cursor-pointer"
                                  checked={selectedTaskIds.includes(t.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedTaskIds(prev => [...prev, t.id]);
                                    } else {
                                      setSelectedTaskIds(prev => prev.filter(id => id !== t.id));
                                    }
                                  }}
                                />
                              </td>
                            )}
                            <td className="px-4 py-3.5 text-center font-semibold text-slate-400">
                              {idx + 1}
                            </td>

                            {/* Assignee (If applicable) */}
                            {activeView !== 'personal' && activeView !== 'assigned_in' && (
                              <td className="px-4 py-3.5">
                                <div className="font-bold text-slate-900 text-sm">{t.user_name}</div>
                                <div className="text-xs text-slate-400 mt-0.5">{t.dept_name || 'Cơ quan'}</div>
                              </td>
                            )}

                            {/* Origin / Assigner */}
                            {activeView !== 'assigned_out' && (
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                {t.origin === 'assigned' ? (
                                  <div>
                                    <span className="inline-block px-2.5 py-0.5 rounded-full font-bold text-xs bg-indigo-100 text-indigo-800">
                                      Lãnh đạo giao
                                    </span>
                                    {t.assigner_name && (
                                      <div className="text-xs text-slate-500 mt-1 font-medium">Bởi: {t.assigner_name}</div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="inline-block px-2.5 py-0.5 rounded-full font-bold text-xs bg-amber-100 text-amber-800">
                                    Cá nhân tự đăng ký
                                  </span>
                                )}
                              </td>
                            )}

                            {/* Task name & Axis */}
                            <td className="px-4 py-3.5">
                              <div className="font-bold text-slate-900 text-sm">{t.task_name}</div>
                              <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                                <span className="px-2 py-0.2 rounded bg-slate-100 text-slate-700 font-semibold">
                                  {t.axis_code}
                                </span>
                                <span>•</span>
                                <span className={t.task_type === 'Đột xuất' ? 'text-amber-700 font-bold' : 'text-slate-600'}>
                                  {t.task_type}
                                </span>
                                {t.document_id && (
                                  <>
                                    <span>•</span>
                                    <span className="px-2 py-0.2 rounded bg-red-100 text-red-800 font-bold text-[10px] inline-flex items-center gap-1">
                                      <FileText className="w-3 h-3 text-red-700" />
                                      <span>Từ Văn bản</span>
                                    </span>
                                  </>
                                )}
                              </div>
                            </td>

                            {/* Output */}
                            <td className="px-4 py-3.5">
                              <span className="font-medium text-slate-800 text-xs">
                                {t.output_result}
                              </span>
                            </td>

                            {/* Deadline & Warning */}
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <div className="font-medium text-slate-800 text-sm">{formatDate(t.deadline)}</div>
                              <div className="mt-1 flex flex-col gap-0.5">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                                  dl.isOverdue ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                                  dl.isNear ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                  'text-slate-400'
                                }`}>
                                  {dl.text}
                                </span>
                                {t.extension_count > 0 && (
                                  <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200 w-fit">
                                    Đã gia hạn: {t.extension_count} lần
                                  </span>
                                )}
                                {t.extension_status === 'pending' && (
                                  <span 
                                    className="text-[10px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300 w-fit"
                                    title={`Đề xuất hạn mới: ${formatDate(t.requested_deadline)} - Lý do: ${t.extension_reason || ''}`}
                                  >
                                    ⏳ Chờ duyệt GH
                                  </span>
                                )}
                                {t.extension_status === 'rejected' && (
                                  <span 
                                    className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200 w-fit"
                                    title={`Lý do từ chối: ${t.extension_reject_reason || ''}`}
                                  >
                                    ✕ Bị từ chối GH
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Score & Weight */}
                            <td className="px-4 py-3.5 text-center">
                              <div className="font-bold text-slate-900">{t.standard_score} đ</div>
                              <div className="text-xs text-slate-400 mt-0.5">HS: {t.difficulty_weight}</div>
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3.5 text-center whitespace-nowrap">
                              <span className={`inline-block px-3 py-1 rounded-full font-semibold text-xs ${
                                isApproved ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                isSubmitted ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                                isPending ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                t.status === 'pending_acceptance' ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold' :
                                t.status === 'feedback_submitted' ? 'bg-rose-100 text-rose-800 border border-rose-300 font-bold' :
                                t.status === 'rejected' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                                'bg-slate-100 text-slate-700'
                              }`}>
                                {isApproved ? '✓ Đã duyệt KQ' :
                                 isSubmitted ? '⏳ Đã nộp MC' :
                                 isPending ? '⏳ Chờ duyệt việc' :
                                 t.status === 'pending_acceptance' ? '⏳ Chờ nhận việc' :
                                 t.status === 'feedback_submitted' ? '⚠️ Đã phản hồi' :
                                 t.status === 'rejected' ? '✕ Bị từ chối' : '● Đang làm'}
                              </span>
                              {t.feedback_reason && (
                                <div className="text-[10px] text-rose-700 max-w-[140px] truncate mx-auto mt-1" title={`Lý do phản hồi: ${t.feedback_reason}`}>
                                  "{t.feedback_reason}"
                                </div>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3.5 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                {/* Lãnh đạo duyệt gia hạn nếu có yêu cầu pending */}
                                {t.extension_status === 'pending' && (isCBQL || currentUser?.id === t.assigned_by) && (
                                  <button
                                    type="button"
                                    onClick={() => openExtensionReviewModal(t)}
                                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow-2xs transition animate-pulse"
                                    title="Xem xét duyệt / từ chối yêu cầu gia hạn"
                                  >
                                    Duyệt GH
                                  </button>
                                )}

                                {t.status === 'pending_acceptance' && currentUser?.id === t.user_id ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleAcceptTask(t.id)}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-2xs"
                                      title="Xác nhận tiếp nhận nhiệm vụ (chuyển vào Công việc cá nhân)"
                                    >
                                      Nhận việc
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openReturnModal(t)}
                                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-2xs"
                                      title="Trả lại việc cho cấp trên với lý do"
                                    >
                                      Trả lại
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openFeedbackModal(t)}
                                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow-2xs"
                                      title="Phản hồi chưa hợp lý (tối đa 1 lần)"
                                    >
                                      Phản hồi
                                    </button>
                                  </>
                                ) : t.status === 'feedback_submitted' && isCBQL ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openReassignModal(t)}
                                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-2xs"
                                      title="Điều chỉnh thông tin và giao lại nhiệm vụ"
                                    >
                                      Giao lại
                                    </button>
                                    {!isAdmin && (
                                      <button
                                        type="button"
                                        onClick={() => handleRecallTask(t)}
                                        className="px-2.5 py-1 bg-slate-100 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs rounded-lg shadow-2xs"
                                        title="Thu hồi công việc đã giao nhầm"
                                      >
                                        Thu hồi
                                      </button>
                                    )}
                                  </>
                                ) : isPending && isCBQL ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openApprovalModal(t)}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-2xs"
                                    >
                                      Duyệt
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRejectTask(t)}
                                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-2xs"
                                    >
                                      Từ chối
                                    </button>
                                  </>
                                ) : t.user_id === currentUser?.id ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (setCurrentTab) setCurrentTab('execution');
                                      }}
                                      className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs rounded-lg transition"
                                    >
                                      Nộp MC
                                    </button>

                                    {/* Nút xin gia hạn: CHỈ HIỂN THỊ KHI VIỆC ĐÃ ĐẾN HẠN HOẶC QUÁ HẠN */}
                                    {isTaskDueOrOverdue(t) && (
                                      t.extension_status === 'pending' ? (
                                        <span className="px-2 py-1 bg-amber-50 text-amber-800 border border-amber-300 font-bold text-[11px] rounded-lg">
                                          ⏳ Chờ duyệt GH
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => openExtensionRequestModal(t)}
                                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg shadow-2xs transition active:scale-95"
                                          title="Yêu cầu xin gia hạn tới Lãnh đạo (chỉ khả dụng khi việc đã đến hạn hoặc quá hạn)"
                                        >
                                          Xin gia hạn
                                        </button>
                                      )
                                    )}

                                    {/* Lãnh đạo chủ động gia hạn */}
                                    {t.extension_status !== 'pending' && t.status !== 'approved' && ((currentUser?.id === t.assigned_by) || isCBQL) && (
                                      <button
                                        type="button"
                                        onClick={() => openLeaderExtendModal(t)}
                                        className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold text-xs rounded-lg shadow-2xs"
                                        title="Chủ động gia hạn thời gian hoàn thành"
                                      >
                                        Gia hạn
                                      </button>
                                    )}

                                    {!isAdmin && (((currentUser?.id === t.assigned_by) || isCBQL) && t.origin === 'assigned' && t.status !== 'approved') && (
                                      <button
                                        type="button"
                                        onClick={() => handleRecallTask(t)}
                                        className="px-2.5 py-1 bg-slate-100 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs rounded-lg shadow-2xs"
                                        title="Thu hồi công việc đã giao nhầm"
                                      >
                                        Thu hồi
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {/* Lãnh đạo chủ động gia hạn cho việc của người khác */}
                                    {t.extension_status !== 'pending' && t.status !== 'approved' && ((currentUser?.id === t.assigned_by) || isCBQL) && (
                                      <button
                                        type="button"
                                        onClick={() => openLeaderExtendModal(t)}
                                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold text-xs rounded-lg shadow-2xs"
                                        title="Chủ động gia hạn thời gian hoàn thành"
                                      >
                                        Gia hạn
                                      </button>
                                    )}

                                    {!isAdmin && (((currentUser?.id === t.assigned_by) || isCBQL) && t.origin === 'assigned' && t.status !== 'approved') ? (
                                      <button
                                        type="button"
                                        onClick={() => handleRecallTask(t)}
                                        className="px-2.5 py-1 bg-slate-100 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs rounded-lg shadow-2xs"
                                        title="Thu hồi công việc đã giao nhầm"
                                      >
                                        Thu hồi
                                      </button>
                                    ) : !isAdmin && t.extension_status !== 'pending' && (
                                      <span className="text-xs text-slate-400 italic">Theo dõi</span>
                                    )}
                                  </>
                                )}

                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTask(t)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-lg shadow-2xs transition-colors cursor-pointer active:scale-95"
                                    title="Admin xóa công việc này"
                                  >
                                    <Trash2 size={13} className="text-rose-600" />
                                    <span>Xóa</span>
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

              {/* Mobile & Tablet Card View for Tasks (lg:hidden) */}
              <div className="lg:hidden space-y-3">
                {currentViewTasks.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200 italic text-xs">
                    Không tìm thấy công việc nào phù hợp với bộ lọc hiện tại.
                  </div>
                ) : (
                  currentViewTasks.map((t, idx) => {
                    const dl = checkDeadlineStatus(t.deadline, t.status);
                    const isPending = t.status === 'pending_approval';
                    const isApproved = t.status === 'approved';
                    const isSubmitted = t.status === 'submitted';

                    return (
                      <div 
                        key={t.id}
                        className={`bg-white rounded-2xl border p-4 shadow-2xs space-y-3 transition-all ${
                          dl.isOverdue ? 'border-rose-300' : 'border-slate-200'
                        }`}
                      >
                        {/* Header: Number, Assignee / Origin, Status */}
                        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-400 text-xs">#{idx + 1}</span>
                              {t.origin === 'assigned' ? (
                                <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-indigo-100 text-indigo-800">
                                  LĐ giao {t.assigner_name ? `• ${t.assigner_name}` : ''}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-amber-100 text-amber-800">
                                  Tự đăng ký
                                </span>
                              )}
                              {t.document_id && (
                                <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-bold text-[10px] inline-flex items-center gap-1">
                                  <FileText className="w-3 h-3 text-red-700" />
                                  <span>Văn bản</span>
                                </span>
                              )}
                            </div>
                            {activeView !== 'personal' && activeView !== 'assigned_in' && (
                              <div className="text-xs font-bold text-slate-800 mt-1">
                                👤 {t.user_name} <span className="font-normal text-slate-400">({t.dept_name || 'Cơ quan'})</span>
                              </div>
                            )}
                          </div>

                          {/* Status Badge */}
                          <span className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] shrink-0 ${
                            isApproved ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                            isSubmitted ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                            isPending ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            t.status === 'pending_acceptance' ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold' :
                            t.status === 'feedback_submitted' ? 'bg-rose-100 text-rose-800 border border-rose-300 font-bold' :
                            t.status === 'rejected' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {isApproved ? '✓ Đã duyệt KQ' :
                             isSubmitted ? '⏳ Đã nộp MC' :
                             isPending ? '⏳ Chờ duyệt việc' :
                             t.status === 'pending_acceptance' ? '⏳ Chờ nhận việc' :
                             t.status === 'feedback_submitted' ? '⚠️ Đã phản hồi' :
                             t.status === 'rejected' ? '✕ Bị từ chối' : '● Đang làm'}
                          </span>
                        </div>

                        {/* Task Title */}
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm leading-snug">
                            {t.task_name}
                          </h4>
                          <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className="px-2 py-0.2 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                              {t.axis_code}
                            </span>
                            <span>•</span>
                            <span className={t.task_type === 'Đột xuất' ? 'text-amber-700 font-bold text-[11px]' : 'text-slate-600 text-[11px]'}>
                              {t.task_type}
                            </span>
                            <span>•</span>
                            <span className="text-[11px] text-slate-600">Sản phẩm: <strong>{t.output_result}</strong></span>
                          </div>
                          {t.feedback_reason && (
                            <div className="mt-1.5 p-2 bg-rose-50 rounded-lg border border-rose-200 text-rose-800 text-xs">
                              <strong>Lý do phản hồi:</strong> "{t.feedback_reason}"
                            </div>
                          )}
                        </div>

                        {/* Metrics Grid */}
                        <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl text-xs border border-slate-100">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-medium">Hạn chót:</span>
                            <span className="font-bold text-slate-800">{formatDate(t.deadline)}</span>
                            <div className="mt-0.5 flex flex-col gap-0.5">
                              <span className={`text-[10px] font-bold ${
                                dl.isOverdue ? 'text-rose-600' : dl.isNear ? 'text-amber-600' : 'text-slate-400'
                              }`}>
                                {dl.text}
                              </span>
                              {t.extension_count > 0 && (
                                <span className="text-[10px] font-semibold text-indigo-700">
                                  Đã gia hạn: {t.extension_count} lần
                                </span>
                              )}
                              {t.extension_status === 'pending' && (
                                <span className="text-[10px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300 w-fit">
                                  ⏳ Chờ duyệt GH
                                </span>
                              )}
                              {t.extension_status === 'rejected' && (
                                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200 w-fit">
                                  ✕ Bị từ chối GH
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block font-medium">Điểm chuẩn & HS:</span>
                            <span className="font-bold text-slate-900">{t.standard_score} đ</span>
                            <span className="text-[10px] text-slate-500 ml-1 font-medium">(HS: {t.difficulty_weight})</span>
                          </div>
                        </div>

                        {/* Actions for Mobile Touch */}
                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 flex-wrap">
                          {/* Lãnh đạo duyệt gia hạn */}
                          {t.extension_status === 'pending' && (isCBQL || currentUser?.id === t.assigned_by) && (
                            <button
                              type="button"
                              onClick={() => openExtensionReviewModal(t)}
                              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-2xs cursor-pointer active:scale-95 animate-pulse"
                              title="Xem xét duyệt / từ chối yêu cầu gia hạn"
                            >
                              Duyệt GH
                            </button>
                          )}

                          {t.status === 'pending_acceptance' && currentUser?.id === t.user_id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleAcceptTask(t.id)}
                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-2xs cursor-pointer active:scale-95"
                              >
                                Nhận việc
                              </button>
                              <button
                                type="button"
                                onClick={() => openReturnModal(t)}
                                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-2xs cursor-pointer active:scale-95"
                              >
                                Trả lại
                              </button>
                              <button
                                type="button"
                                onClick={() => openFeedbackModal(t)}
                                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-2xs cursor-pointer active:scale-95"
                              >
                                Phản hồi
                              </button>
                            </>
                          ) : t.status === 'feedback_submitted' && isCBQL ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openReassignModal(t)}
                                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-2xs cursor-pointer active:scale-95"
                              >
                                Giao lại
                              </button>
                              {!isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handleRecallTask(t)}
                                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs rounded-xl shadow-2xs cursor-pointer active:scale-95"
                                >
                                  Thu hồi
                                </button>
                              )}
                            </>
                          ) : isPending && isCBQL ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openApprovalModal(t)}
                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-2xs cursor-pointer active:scale-95"
                              >
                                Duyệt
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRejectTask(t)}
                                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-2xs cursor-pointer active:scale-95"
                              >
                                Từ chối
                              </button>
                            </>
                          ) : t.user_id === currentUser?.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  if (setCurrentTab) setCurrentTab('execution');
                                }}
                                className="px-4 py-1.5 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl shadow-2xs cursor-pointer active:scale-95"
                              >
                                Nộp MC →
                              </button>

                              {/* Nút xin gia hạn: CHỈ HIỂN THỊ KHI VIỆC ĐÃ ĐẾN HẠN HOẶC QUÁ HẠN */}
                              {isTaskDueOrOverdue(t) && (
                                t.extension_status === 'pending' ? (
                                  <span className="px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-300 font-bold text-xs rounded-xl">
                                    ⏳ Chờ duyệt GH
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openExtensionRequestModal(t)}
                                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-2xs cursor-pointer active:scale-95"
                                    title="Yêu cầu xin gia hạn tới Lãnh đạo"
                                  >
                                    Xin gia hạn
                                  </button>
                                )
                              )}

                              {/* Lãnh đạo chủ động gia hạn */}
                              {t.extension_status !== 'pending' && t.status !== 'approved' && ((currentUser?.id === t.assigned_by) || isCBQL) && (
                                <button
                                  type="button"
                                  onClick={() => openLeaderExtendModal(t)}
                                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold text-xs rounded-xl shadow-2xs cursor-pointer active:scale-95"
                                  title="Chủ động gia hạn thời gian"
                                >
                                  Gia hạn
                                </button>
                              )}

                              {!isAdmin && (((currentUser?.id === t.assigned_by) || isCBQL) && t.origin === 'assigned' && t.status !== 'approved') && (
                                <button
                                  type="button"
                                  onClick={() => handleRecallTask(t)}
                                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs rounded-xl shadow-2xs cursor-pointer active:scale-95"
                                >
                                  Thu hồi
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              {/* Lãnh đạo chủ động gia hạn */}
                              {t.extension_status !== 'pending' && t.status !== 'approved' && ((currentUser?.id === t.assigned_by) || isCBQL) && (
                                <button
                                  type="button"
                                  onClick={() => openLeaderExtendModal(t)}
                                  className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold text-xs rounded-xl shadow-2xs cursor-pointer active:scale-95"
                                  title="Chủ động gia hạn thời gian"
                                >
                                  Gia hạn
                                </button>
                              )}

                              {!isAdmin && (((currentUser?.id === t.assigned_by) || isCBQL) && t.origin === 'assigned' && t.status !== 'approved') ? (
                                <button
                                  type="button"
                                  onClick={() => handleRecallTask(t)}
                                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs rounded-xl shadow-2xs cursor-pointer active:scale-95"
                                >
                                  Thu hồi
                                </button>
                              ) : !isAdmin && t.extension_status !== 'pending' && (
                                <span className="text-xs text-slate-400 italic">Theo dõi</span>
                              )}
                            </>
                          )}

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDeleteTask(t)}
                              className="inline-flex items-center gap-1 px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl shadow-2xs cursor-pointer active:scale-95 transition-colors"
                              title="Admin xóa công việc này"
                            >
                              <Trash2 size={13} className="text-rose-600" />
                              <span>Xóa</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* 5. MODAL: GIAO VIỆC / ĐĂNG KÝ VIỆC */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl w-[95%] sm:max-w-2xl shadow-2xl border border-slate-200 overflow-hidden my-4 sm:my-8 animate-in fade-in zoom-in duration-200 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-red-700 via-red-800 to-red-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {modalMode === 'assign' ? <UserPlus className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                <h3 className="text-base font-bold">
                  {modalMode === 'assign' ? 'Giao việc cho Cán bộ, Nhân viên' : 'Đăng ký Công việc Cá nhân trong kỳ'}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto">
              
              {/* Notice: Nguyên tắc thẩm định & chấm điểm */}
              <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Nguyên tắc thẩm định & chấm điểm hoàn thành công việc:</span>
                </div>
                <p className="leading-relaxed text-[11px] text-amber-900">
                  • <strong>Nếu cá nhân tự đăng ký:</strong> Mặc định người thẩm định và chấm điểm là <strong>Lãnh đạo đơn vị</strong> (Trưởng phòng/ban hoặc Lãnh đạo phụ trách).
                </p>
              </div>

              {/* If assigning: Target selection (Cá nhân, Chức danh, hoặc Nhóm tự tạo) */}
              {modalMode === 'assign' && (
                <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-800">
                      Chọn cán bộ / đối tượng nhận nhiệm vụ *
                    </label>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={selectAllUsers}
                        className="text-red-700 hover:underline font-bold cursor-pointer"
                      >
                        Chọn tất cả ({assignableUsers.length})
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={clearAllUsers}
                        className="text-slate-500 hover:underline font-medium cursor-pointer"
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  </div>

                  {/* 3 Sub-tabs for target selection */}
                  <div className="flex border-b border-slate-200 gap-3">
                    <button
                      type="button"
                      onClick={() => setAssignTargetType('users')}
                      className={`pb-2 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                        assignTargetType === 'users'
                          ? 'border-red-600 text-red-700'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Chỉ định từng cá nhân</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAssignTargetType('job_title')}
                      className={`pb-2 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                        assignTargetType === 'job_title'
                          ? 'border-red-600 text-red-700'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Briefcase className="w-3.5 h-3.5" />
                      <span>Theo chức danh / chức vụ</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAssignTargetType('user_group')}
                      className={`pb-2 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                        assignTargetType === 'user_group'
                          ? 'border-red-600 text-red-700'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Theo nhóm tự tạo ({userGroups.length})</span>
                    </button>
                  </div>

                  {/* Tab 1: Users Checklist */}
                  {assignTargetType === 'users' && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={modalUserSearch}
                        onChange={(e) => setModalUserSearch(e.target.value)}
                        placeholder="Tìm tên cán bộ, phòng ban..."
                        className="w-full text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-red-500"
                      />

                      <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg bg-white p-2 space-y-1 divide-y divide-slate-100">
                        {assignableUsers
                          .filter(u => !modalUserSearch.trim() || u.full_name?.toLowerCase().includes(modalUserSearch.toLowerCase()) || u.dept_name?.toLowerCase().includes(modalUserSearch.toLowerCase()))
                          .map(u => {
                            const isChecked = selectedUserIds.includes(u.id);
                            const isDup = duplicateUserIds.has(u.id);
                            return (
                              <label
                                key={u.id}
                                className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition text-xs ${
                                  isDup
                                    ? 'bg-amber-50/70 border border-amber-200 text-slate-700'
                                    : isChecked ? 'bg-red-50/80 font-bold text-red-900' : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isDup}
                                  onChange={() => {
                                    if (isDup) {
                                      alert(`Cán bộ ${u.full_name} đã có đầu việc này trong kỳ đánh giá. Không thể chọn giao trùng!`);
                                      return;
                                    }
                                    toggleUser(u.id);
                                  }}
                                  className={`rounded w-4 h-4 ${isDup ? 'cursor-not-allowed text-slate-300' : 'text-red-600 focus:ring-red-500'}`}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <span className={`truncate block ${isChecked ? 'font-bold' : 'font-semibold'}`}>{u.full_name}</span>
                                    {isDup && (
                                      <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.2 rounded font-medium flex items-center gap-1 shrink-0">
                                        <span>⚠️ Đã có nhiệm vụ này</span>
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[11px] text-slate-400 truncate block">{u.dept_name || 'Cơ quan'} • {u.gov_title || 'Chuyên viên'}</span>
                                </div>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Tab 2: Job Titles */}
                  {assignTargetType === 'job_title' && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-slate-500">
                        Tích chọn chức danh bên dưới để tự động chọn nhanh tất cả cán bộ, nhân viên tương ứng:
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {distinctJobTitles.map(title => {
                          const count = assignableUsers.filter(u => u.gov_title === title || u.party_title === title).length;
                          const isChecked = selectedJobTitles.includes(title);
                          return (
                            <label
                              key={title}
                              className={`p-2.5 rounded-lg border flex items-center gap-2 cursor-pointer transition text-xs ${
                                isChecked
                                  ? 'bg-red-50 border-red-500 font-bold text-red-900'
                                  : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleJobTitle(title)}
                                className="rounded text-red-600 focus:ring-red-500 w-3.5 h-3.5"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="truncate">{title}</div>
                                <div className="text-[10px] text-slate-400 font-normal">{count} cán bộ</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Tab 3: Custom User Groups */}
                  {assignTargetType === 'user_group' && (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] font-bold text-slate-700">
                          Chọn nhóm người dùng tự tạo:
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsGroupModalOpen(true)}
                          className="text-xs font-bold text-red-700 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Quản lý nhóm tự tạo</span>
                        </button>
                      </div>

                      {userGroups.length === 0 ? (
                        <div className="p-4 bg-white rounded-xl border border-slate-200 text-center text-slate-400 italic">
                          Chưa có nhóm người dùng nào được tạo.
                          <button
                            type="button"
                            onClick={() => setIsGroupModalOpen(true)}
                            className="block mx-auto mt-2 text-xs font-bold text-red-700 hover:underline cursor-pointer"
                          >
                            + Tạo nhóm người dùng mới ngay
                          </button>
                        </div>
                      ) : (
                        <select
                          value={selectedGroupId}
                          onChange={(e) => handleSelectGroup(e.target.value)}
                          className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-red-500"
                        >
                          <option value="">-- Chọn nhóm người dùng để nạp danh sách --</option>
                          {userGroups.map(g => (
                            <option key={g.id} value={g.id}>
                              {g.name} ({g.members?.length || 0} thành viên) {g.description ? ` - ${g.description}` : ''}
                            </option>
                          ))}
                        </select>
                      )}

                      {selectedGroupId && (
                        (() => {
                          const selectedGroup = userGroups.find(g => g.id === selectedGroupId);
                          if (!selectedGroup) return null;
                          return (
                            <div className="p-3 bg-white rounded-xl border border-red-200 space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <strong className="text-red-900 font-bold">{selectedGroup.name}</strong>
                                <span className="text-slate-500 font-medium">{selectedGroup.members?.length || 0} thành viên</span>
                              </div>
                              <div className="flex flex-wrap gap-1 pt-1">
                                {selectedGroup.members?.map(m => (
                                  <span key={m.user_id} className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-semibold text-slate-700">
                                    {m.user_name || m.user_id}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })()
                      )}
                    </div>
                  )}

                  {/* Summary of currently selected assignees */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-500 font-medium pt-2 border-t border-slate-200">
                    <span className="text-slate-600">
                      {assignTargetType === 'job_title' && selectedJobTitles.length > 0 && (
                        <span>Nhóm chức danh: <strong>{selectedJobTitles.join(', ')}</strong> • </span>
                      )}
                      {assignTargetType === 'user_group' && selectedGroupId && (
                        <span>Nhóm: <strong>{userGroups.find(g => g.id === selectedGroupId)?.name}</strong> • </span>
                      )}
                      Chuyển sang tab "Chỉ định từng cá nhân" để xem hoặc chỉnh sửa danh sách cán bộ được chọn.
                    </span>
                    <span className="shrink-0 text-right">
                      Đã chọn: <strong className="text-red-700 text-xs font-bold">{selectedUserIds.length}</strong> / {assignableUsers.length} cán bộ
                    </span>
                  </div>
                </div>
              )}

              {/* Source selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nguồn công việc</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, task_source: 'standard' })}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      formData.task_source === 'standard'
                        ? 'bg-red-50 border-red-500 text-red-700 shadow-2xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Chọn từ Danh mục chuẩn</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, task_source: 'custom', standard_task_id: '' })}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      formData.task_source === 'custom'
                        ? 'bg-red-50 border-red-500 text-red-700 shadow-2xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Nhiệm vụ đột xuất / Tự nhập</span>
                  </button>
                </div>
              </div>

              {/* Standard Task Selector */}
              {formData.task_source === 'standard' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Chọn công việc từ Danh mục chuẩn *
                  </label>
                  <input
                    type="text"
                    value={stdTaskSearch}
                    onChange={(e) => setStdTaskSearch(e.target.value)}
                    placeholder="Lọc danh mục công việc chuẩn..."
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg mb-1"
                  />
                  <select
                    value={formData.standard_task_id}
                    onChange={(e) => handleStandardTaskSelect(e.target.value)}
                    required={formData.task_source === 'standard'}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-medium focus:ring-1 focus:ring-red-500"
                  >
                    <option value="">-- Chọn công việc trong danh mục chuẩn --</option>
                    {standardTasks
                      .filter(s => !stdTaskSearch.trim() || s.task_name.toLowerCase().includes(stdTaskSearch.toLowerCase()))
                      .map(s => (
                        <option key={s.id} value={s.id}>
                          [{s.axis_code}] {s.task_name} ({s.standard_score}đ - HS: {s.difficulty_weight})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Task Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên công việc / Nhiệm vụ cụ thể *
                </label>
                <textarea
                  value={formData.task_name}
                  onChange={(e) => setFormData({ ...formData, task_name: e.target.value })}
                  required
                  rows={2}
                  placeholder="Nhập tên nhiệm vụ chi tiết..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-red-500 font-medium"
                />
              </div>

              {/* Task Type: Thường xuyên / Đột xuất */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-red-600" />
                    <span>Phân loại nhiệm vụ (Loại hình công việc) *</span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    Theo QĐ 366 & Hướng dẫn 06
                  </span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div
                    onClick={() => setFormData(prev => ({ 
                      ...prev, 
                      task_type: 'Thường xuyên',
                      standard_score: prev.task_type === 'Đột xuất' && prev.standard_score === 12 ? 10 : prev.standard_score,
                      difficulty_weight: prev.task_type === 'Đột xuất' && prev.difficulty_weight === 1.1 ? 1.0 : prev.difficulty_weight
                    }))}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition flex items-start gap-2.5 ${
                      formData.task_type === 'Thường xuyên'
                        ? 'border-red-600 bg-red-50/80 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      formData.task_type === 'Thường xuyên' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                        <span>Thường xuyên</span>
                        {formData.task_type === 'Thường xuyên' && <Check className="w-3.5 h-3.5 text-red-600" />}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                        Nhiệm vụ định kỳ theo chức năng (ĐC: 10đ • HS: 1.0)
                      </p>
                    </div>
                  </div>

                  <div
                    onClick={() => setFormData(prev => ({ 
                      ...prev, 
                      task_type: 'Đột xuất',
                      standard_score: prev.task_type === 'Thường xuyên' && prev.standard_score === 10 ? 12 : prev.standard_score,
                      difficulty_weight: prev.task_type === 'Thường xuyên' && prev.difficulty_weight === 1.0 ? 1.1 : prev.difficulty_weight
                    }))}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition flex items-start gap-2.5 ${
                      formData.task_type === 'Đột xuất'
                        ? 'border-amber-600 bg-amber-50/80 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      formData.task_type === 'Đột xuất' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      <Zap className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                        <span>Đột xuất</span>
                        {formData.task_type === 'Đột xuất' && <Check className="w-3.5 h-3.5 text-amber-600" />}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                        Nhiệm vụ phát sinh, cấp bách (ĐC: 12đ • HS: 1.1)
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Grid fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Axis Code */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Trục kết quả
                  </label>
                  <select
                    value={formData.axis_code}
                    onChange={(e) => setFormData({ ...formData, axis_code: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg font-medium"
                  >
                    {axes.map(ax => (
                      <option key={ax.code} value={ax.code}>{ax.name}</option>
                    ))}
                  </select>
                </div>

                {/* Output Result */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kết quả đầu ra yêu cầu *
                  </label>
                  <select
                    value={formData.output_result}
                    onChange={(e) => setFormData({ ...formData, output_result: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg font-medium"
                  >
                    {OUTPUT_RESULT_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>

              {formData.output_result === 'Khác' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mô tả kết quả đầu ra khác
                  </label>
                  <input
                    type="text"
                    value={customOutputResult}
                    onChange={(e) => setCustomOutputResult(e.target.value)}
                    placeholder="Mô tả cụ thể sản phẩm đầu ra..."
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                  />
                </div>
              )}

              {/* Deadline & Scores */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Thời hạn chót (Deadline) *
                  </label>
                  <input
                    type="date"
                    value={toInputDateFormat(formData.deadline)}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    required
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Điểm chuẩn (ĐC)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.standard_score}
                    onChange={(e) => setFormData({ ...formData, standard_score: parseFloat(e.target.value) || 0 })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Hệ số độ khó (HSĐK)
                  </label>
                  <select
                    value={formData.difficulty_weight}
                    onChange={(e) => setFormData({ ...formData, difficulty_weight: parseFloat(e.target.value) || 1.0 })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg font-bold"
                  >
                    <option value="1.0">100% (Thông thường - 1.0)</option>
                    <option value="1.1">110% (Phối hợp - 1.1)</option>
                    <option value="1.2">120% (Phức tạp / quan trọng - 1.2)</option>
                  </select>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-xl transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl shadow-md transition flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>{modalMode === 'assign' ? 'Xác nhận Giao việc' : 'Gửi đăng ký việc'}</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL: PHÊ DUYỆT CÔNG VIỆC & QUYẾT ĐỊNH GHI VÀO DANH MỤC CHUNG */}
      {approvalModalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl w-[95%] sm:max-w-xl shadow-2xl border border-slate-200 overflow-hidden my-4 sm:my-8 animate-in fade-in zoom-in duration-200 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shadow-xs">
                  <CheckCircle2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Phê duyệt Nhiệm vụ Cán bộ</h3>
                  <p className="text-xs text-emerald-100 mt-0.5">Xác nhận phê duyệt và quyết định ghi nhận danh mục</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeApprovalModal}
                className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto">
              {/* Task Summary Card */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    <span>{approvalModalTask.user_name}</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-200 text-slate-700">
                      {approvalModalTask.dept_name || 'Cơ quan'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                      approvalModalTask.task_type === 'Đột xuất' 
                        ? 'bg-amber-100 text-amber-800 border border-amber-300' 
                        : 'bg-blue-100 text-blue-800 border border-blue-300'
                    }`}>
                      {approvalModalTask.task_type || 'Thường xuyên'}
                    </span>
                  </div>
                </div>

                <div className="text-sm font-bold text-slate-900 leading-snug">
                  {approvalModalTask.task_name}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-2.5 border-t border-slate-200/70">
                  <div>
                    Trục kết quả: <strong>{approvalModalTask.axis_code}</strong>
                  </div>
                  <div>
                    Hạn chót: <strong>{formatDate(approvalModalTask.deadline)}</strong>
                  </div>
                  <div>
                    Đầu ra: <strong>{approvalModalTask.output_result}</strong>
                  </div>
                  <div>
                    Điểm chuẩn: <strong>{approvalModalTask.standard_score}đ</strong> (HS: {approvalModalTask.difficulty_weight || 1.0})
                  </div>
                </div>
              </div>

              {/* Highlighted Question Box: Ghi vào danh mục chung */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50/60 p-4 rounded-xl border border-amber-200 space-y-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                      Quyết định Ghi vào Danh mục chung
                    </h4>
                    <p className="text-xs text-amber-900 font-semibold mt-0.5">
                      Bạn có cho phép ghi nhiệm vụ này vào Danh mục công việc chung (Danh mục chuẩn của đơn vị) không?
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {/* Option 1: Có ghi vào danh mục chung */}
                  <div
                    onClick={() => setAddToStandardTasks(true)}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition flex items-start gap-2.5 ${
                      addToStandardTasks
                        ? 'border-emerald-600 bg-emerald-50/90 text-emerald-950 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      addToStandardTasks ? 'bg-emerald-600 text-white' : 'border border-slate-300'
                    }`}>
                      {addToStandardTasks && <Check className="w-3.5 h-3.5" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold">Có, ghi vào danh mục chung</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                        Lưu vào Danh mục chuẩn để các cán bộ khác và các kỳ sau có thể tái sử dụng
                      </div>
                    </div>
                  </div>

                  {/* Option 2: Không ghi vào danh mục chung */}
                  <div
                    onClick={() => setAddToStandardTasks(false)}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition flex items-start gap-2.5 ${
                      !addToStandardTasks
                        ? 'border-red-600 bg-red-50/90 text-red-950 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      !addToStandardTasks ? 'bg-red-600 text-white' : 'border border-slate-300'
                    }`}>
                      {!addToStandardTasks && <Check className="w-3.5 h-3.5" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold">Không, chỉ duyệt kỳ này</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                        Chỉ duyệt cho cán bộ này trong kỳ hiện tại, không đưa vào danh mục chung
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Adjust Difficulty Weight if needed */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Hệ số độ khó duyệt (HSĐK)
                  </label>
                  <select
                    value={approvalDiffWeight}
                    onChange={(e) => setApprovalDiffWeight(parseFloat(e.target.value) || 1.0)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg font-bold"
                  >
                    <option value="1.0">100% (Thông thường - 1.0)</option>
                    <option value="1.1">110% (Phối hợp - 1.1)</option>
                    <option value="1.2">120% (Phức tạp / quan trọng - 1.2)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Điểm quy đổi tối đa kế hoạch
                  </label>
                  <div className="w-full text-xs p-2 bg-slate-100 border border-slate-200 rounded-lg font-bold text-red-700">
                    {Number(((approvalModalTask.standard_score || 10) * approvalDiffWeight).toFixed(2))} điểm
                  </div>
                </div>
              </div>

              {/* Leader Comment */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ý kiến chỉ đạo / Nhận xét của Lãnh đạo (Tùy chọn)
                </label>
                <textarea
                  value={approvalComment}
                  onChange={(e) => setApprovalComment(e.target.value)}
                  rows={2}
                  placeholder="Nhập ghi chú hoặc yêu cầu chỉ đạo thêm khi phê duyệt nhiệm vụ..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 font-medium"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between gap-2 px-6 py-4 bg-slate-50 border-t border-slate-200">
              <button
                type="button"
                onClick={() => handleConfirmApproval(false)}
                disabled={isApproving}
                className="px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl transition"
              >
                Từ chối duyệt việc
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeApprovalModal}
                  disabled={isApproving}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition"
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmApproval(true)}
                  disabled={isApproving}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>{isApproving ? 'Đang xử lý...' : 'Xác nhận Phê duyệt'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PHẢN HỒI NHIỆM VỤ CHƯA HỢP LÝ (BƯỚC 1 - NHÁNH 2 THEO V6) */}
      {feedbackModalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-amber-50/50">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">Phản hồi nhiệm vụ được giao (Bước 1 - Nhánh 2)</h3>
              </div>
              <button
                type="button"
                onClick={() => setFeedbackModalTask(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="font-bold text-slate-800 text-sm">{feedbackModalTask.task_name}</div>
                <div className="text-slate-500 flex items-center gap-2">
                  <span>Hạn chót: <strong>{formatDate(feedbackModalTask.deadline)}</strong></span>
                  <span>•</span>
                  <span>Người giao: <strong>{feedbackModalTask.assigner_name || 'Lãnh đạo'}</strong></span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                <strong>Lưu ý quy định (Hướng dẫn V6):</strong> Mỗi nhiệm vụ bạn chỉ được phản hồi tối đa 1 lần. Lãnh đạo sẽ xem xét lý do để điều chỉnh hoặc giao lại.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Lý do phản hồi công việc chưa hợp lý <span className="text-red-500">*</span>:
                </label>
                <textarea
                  rows={3}
                  value={feedbackReason}
                  onChange={(e) => setFeedbackReason(e.target.value)}
                  placeholder="Ví dụ: Nhiệm vụ bị trùng lặp với nội dung đã được giao, hoặc khối lượng quá tải so với thời hạn, hoặc chưa phù hợp với chuyên môn công tác..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 bg-slate-50 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setFeedbackModalTask(null)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleSubmitFeedback}
                disabled={isSubmittingFeedback || !feedbackReason.trim()}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs disabled:opacity-50"
              >
                {isSubmittingFeedback ? 'Đang gửi...' : 'Gửi phản hồi cho Lãnh đạo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL LÃNH ĐẠO ĐIỀU CHỈNH & GIAO LẠI (BƯỚC 1 - NHÁNH 2 THEO V6) */}
      {reassignModalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-indigo-50/50">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Điều chỉnh & Giao lại nhiệm vụ (Bước 1 - Nhánh 2)</h3>
              </div>
              <button
                type="button"
                onClick={() => setReassignModalTask(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              {/* Phản hồi của cán bộ */}
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-1">
                <div className="font-bold text-rose-900 flex items-center gap-1">
                  <span>Ý kiến phản hồi của cán bộ:</span>
                </div>
                <div className="text-slate-800 italic bg-white p-2 rounded border border-rose-100">
                  "{reassignModalTask.feedback_reason || 'Chưa rõ lý do'}"
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên nhiệm vụ:</label>
                <input
                  type="text"
                  value={reassignForm.task_name}
                  onChange={(e) => setReassignForm(prev => ({ ...prev, task_name: e.target.value }))}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hạn chót mới:</label>
                  <input
                    type="date"
                    value={reassignForm.deadline}
                    onChange={(e) => setReassignForm(prev => ({ ...prev, deadline: e.target.value }))}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hệ số độ khó:</label>
                  <select
                    value={reassignForm.difficulty_weight}
                    onChange={(e) => setReassignForm(prev => ({ ...prev, difficulty_weight: parseFloat(e.target.value) || 1.0 }))}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg font-bold"
                  >
                    <option value="1.0">1.0 (Thông thường)</option>
                    <option value="1.1">1.1 (Phối hợp)</option>
                    <option value="1.2">1.2 (Quan trọng / Phức tạp)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Cán bộ thực hiện:</label>
                <select
                  value={reassignForm.new_user_id || ''}
                  onChange={(e) => setReassignForm(prev => ({ ...prev, new_user_id: e.target.value }))}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg font-semibold"
                >
                  {assignableUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.full_name} ({u.dept_name || 'Cơ quan'})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Đầu ra yêu cầu:</label>
                <input
                  type="text"
                  value={reassignForm.output_result}
                  onChange={(e) => setReassignForm(prev => ({ ...prev, output_result: e.target.value }))}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <p className="text-[11px] text-slate-500 italic">
                Lưu ý: Sau khi giao lại, nhiệm vụ sẽ tự động chuyển vào danh sách "Đang thực hiện" của cán bộ.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 bg-slate-50 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setReassignModalTask(null)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleSubmitReassign}
                disabled={isSubmittingReassign}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs disabled:opacity-50"
              >
                {isSubmittingReassign ? 'Đang lưu...' : 'Xác nhận Giao lại'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CÁN BỘ TRẢ LẠI VIỆC CHO LÃNH ĐẠO */}
      {returnModalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-rose-50/70">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="text-sm font-bold text-slate-900">Trả lại công việc cho Người giao việc</h3>
              </div>
              <button
                type="button"
                onClick={() => setReturnModalTask(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <div className="font-bold text-slate-800">{returnModalTask.task_name}</div>
                <div className="text-slate-500 flex items-center gap-2">
                  <span>Hạn chót: <strong>{formatDate(returnModalTask.deadline)}</strong></span>
                  <span>•</span>
                  <span>Người giao: <strong>{returnModalTask.assigner_name || 'Lãnh đạo'}</strong></span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Lý do trả lại công việc <span className="text-red-500">*</span>:
                </label>
                <textarea
                  rows={3}
                  value={returnTaskReason}
                  onChange={(e) => setReturnTaskReason(e.target.value)}
                  placeholder="Nhập chi tiết lý do bạn trả lại công việc này (ví dụ: công việc giao nhầm người, không đúng thẩm quyền chuyên môn, đã có cán bộ khác phụ trách...)"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 font-normal"
                />
              </div>

              <p className="text-[11px] text-slate-500 italic">
                Sau khi xác nhận trả lại, công việc sẽ được chuyển trả về cho Lãnh đạo / Người giao việc kèm lý do cụ thể và gỡ khỏi danh sách công việc của bạn.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 bg-slate-50 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setReturnModalTask(null)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleSubmitReturn}
                disabled={isSubmittingReturn || !returnTaskReason.trim()}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingReturn ? 'Đang gửi...' : 'Xác nhận Trả lại'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: CBNV XIN GIA HẠN CÔNG VIỆC (CHỈ HIỂN THỊ KHI ĐÃ ĐẾN HẠN HOẶC QUÁ HẠN) */}
      {extensionRequestModalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-amber-50/80">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">Yêu cầu xin gia hạn tiến độ công việc</h3>
              </div>
              <button
                type="button"
                onClick={() => setExtensionRequestModalTask(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <div className="font-bold text-slate-800">{extensionRequestModalTask.task_name}</div>
                <div className="text-slate-500 flex items-center gap-2 flex-wrap">
                  <span>Hạn hiện tại: <strong className="text-rose-600">{formatDate(extensionRequestModalTask.deadline)}</strong></span>
                  <span>•</span>
                  <span>Người giao / duyệt: <strong>{extensionRequestModalTask.assigner_name || 'Lãnh đạo đơn vị'}</strong></span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Thời hạn mới đề xuất <span className="text-red-500">*</span>:
                </label>
                <input
                  type="date"
                  value={requestedDeadline}
                  onChange={(e) => setRequestedDeadline(e.target.value)}
                  min={toInputDateFormat(new Date().toISOString().split('T')[0])}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-semibold text-slate-800"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Hạn mới phải sau ngày hạn hiện tại ({formatDate(extensionRequestModalTask.deadline)}).
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Lý do xin gia hạn <span className="text-red-500">*</span>:
                </label>
                <textarea
                  rows={3}
                  value={extensionReason}
                  onChange={(e) => setExtensionReason(e.target.value)}
                  placeholder="Nhập chi tiết khó khăn, vướng mắc hoặc nguyên nhân khách quan cần gia hạn tiến độ..."
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
                onClick={() => setExtensionRequestModalTask(null)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleSubmitExtensionRequest}
                disabled={isSubmittingExtensionRequest || !requestedDeadline || !extensionReason.trim()}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingExtensionRequest ? 'Đang gửi...' : 'Gửi yêu cầu gia hạn'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: LÃNH ĐẠO XEM XÉT DUYỆT / TỪ CHỐI GIA HẠN */}
      {extensionReviewModalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-indigo-50/80">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Xem xét yêu cầu xin gia hạn công việc</h3>
              </div>
              <button
                type="button"
                onClick={() => setExtensionReviewModalTask(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
                <div className="font-bold text-slate-900 text-sm">{extensionReviewModalTask.task_name}</div>
                <div className="text-slate-600">
                  Cán bộ xin gia hạn: <strong className="text-slate-900">{extensionReviewModalTask.user_name}</strong>
                </div>
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <span>Hạn hiện tại: <strong className="text-rose-600 line-through">{formatDate(extensionReviewModalTask.deadline)}</strong></span>
                  <span>→</span>
                  <span>Hạn mới đề xuất: <strong className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">{formatDate(extensionReviewModalTask.requested_deadline)}</strong></span>
                </div>
              </div>

              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs space-y-1">
                <span className="font-bold text-amber-900 block">Lý do xin gia hạn của cán bộ:</span>
                <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                  "{extensionReviewModalTask.extension_reason || 'Không có lý do cụ thể'}"
                </p>
                {extensionReviewModalTask.extension_requested_at && (
                  <span className="text-[10px] text-slate-400 block pt-1">
                    Gửi lúc: {new Date(extensionReviewModalTask.extension_requested_at).toLocaleString('vi-VN')}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ý kiến / Lý do từ chối (bắt buộc nếu từ chối):
                </label>
                <textarea
                  rows={2}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Nhập lý do không đồng ý gia hạn (nếu bấm Từ chối)..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-normal"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 border-t border-slate-200 gap-2">
              <button
                type="button"
                onClick={() => setExtensionReviewModalTask(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
              >
                Đóng
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleReviewExtension('reject')}
                  disabled={isReviewingExtension || !rejectReason.trim()}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
                  title="Từ chối yêu cầu gia hạn kèm lý do"
                >
                  Từ chối
                </button>
                <button
                  type="button"
                  onClick={() => handleReviewExtension('approve')}
                  disabled={isReviewingExtension}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
                  title="Đồng ý cập nhật hạn chót mới theo đề xuất của cán bộ"
                >
                  {isReviewingExtension ? 'Đang duyệt...' : '✓ Phê duyệt gia hạn'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: LÃNH ĐẠO CHỦ ĐỘNG GIA HẠN TIẾN ĐỘ */}
      {leaderExtendModalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-indigo-50/80">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Lãnh đạo điều chỉnh & Gia hạn tiến độ</h3>
              </div>
              <button
                type="button"
                onClick={() => setLeaderExtendModalTask(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <div className="font-bold text-slate-900">{leaderExtendModalTask.task_name}</div>
                <div className="text-slate-600 flex items-center gap-2 flex-wrap">
                  <span>Cán bộ thực hiện: <strong>{leaderExtendModalTask.user_name}</strong></span>
                  <span>•</span>
                  <span>Hạn hiện tại: <strong className="text-indigo-700">{formatDate(leaderExtendModalTask.deadline)}</strong></span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Thời hạn hoàn thành mới (Hạn chót mới) <span className="text-red-500">*</span>:
                </label>
                <input
                  type="date"
                  value={leaderNewDeadline}
                  onChange={(e) => setLeaderNewDeadline(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Lý do điều chỉnh / gia hạn:
                </label>
                <textarea
                  rows={3}
                  value={leaderExtendReason}
                  onChange={(e) => setLeaderExtendReason(e.target.value)}
                  placeholder="Nhập lý do điều chỉnh gia hạn tiến độ công việc..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-normal"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 bg-slate-50 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setLeaderExtendModalTask(null)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleSubmitLeaderExtend}
                disabled={isSubmittingLeaderExtend || !leaderNewDeadline}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingLeaderExtend ? 'Đang lưu...' : 'Xác nhận Gia hạn'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Quản lý Nhóm người dùng tự tạo */}
      <UserGroupManagementModal
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        users={users}
        departments={axes}
        onGroupsUpdated={(g) => setUserGroups(g)}
      />

    </div>
  );
}
