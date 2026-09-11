import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  Send, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Plus, 
  Search, 
  Filter, 
  RotateCcw, 
  RefreshCw, 
  Download, 
  Paperclip, 
  Eye, 
  Edit, 
  Trash2, 
  X, 
  UserPlus, 
  Building2, 
  Calendar, 
  ShieldAlert, 
  Sparkles, 
  ChevronRight,
  Check,
  Layers,
  ArrowRight,
  Users,
  UserCheck,
  BookOpen,
  Briefcase,
  Share2,
  Info
} from 'lucide-react';
import { api } from '../api';
import { formatDate, toInputDateFormat } from '../constants';
import UserGroupManagementModal from './UserGroupManagementModal';
import { getUserPermissions } from '../permissions';

// Document Classifications (Phân loại văn bản chuẩn hành chính)
const DOC_TYPES = [
  'Nghị quyết',
  'Quyết định',
  'Chỉ thị',
  'Quy định',
  'Kế hoạch',
  'Hướng dẫn',
  'Công văn',
  'Thông báo',
  'Tờ trình',
  'Báo cáo',
  'Kết luận',
  'Khác'
];

// Document Fields (Lĩnh vực hoạt động)
const DOC_FIELDS = [
  'Công tác Đảng',
  'Chuyên môn - Nghiệp vụ',
  'Tổ chức - Cán bộ',
  'Tài chính - Kế toán',
  'Cơ sở vật chất - Thiết bị',
  'Thi đua - Khen thưởng',
  'Kiểm tra - Giám sát',
  'Khác'
];

// Urgency Levels
const URGENCIES = ['Thường', 'Khẩn', 'Thượng khẩn', 'Hỏa tốc'];
const SECURITY_LEVELS = ['Thường', 'Mật', 'Tối mật'];

export default function DocumentManagementTab({ 
  currentUser, 
  periods = [], 
  selectedPeriod, 
  users = [], 
  departments = [], 
  axes = [] 
}) {
  const [documents, setDocuments] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    pending_dispatch: 0,
    submitted_to_leader: 0,
    in_progress: 0,
    completed: 0,
    overdue: 0
  });
  const [loading, setLoading] = useState(true);

  // User Groups state
  const [userGroups, setUserGroups] = useState([]);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  // Submit to Leader Modal state
  const [submitModalDoc, setSubmitModalDoc] = useState(null);
  const [submitLeaderId, setSubmitLeaderId] = useState('');
  const [submitLeaderNote, setSubmitLeaderNote] = useState('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDocType, setFilterDocType] = useState('all');
  const [filterField, setFilterField] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterUrgency, setFilterUrgency] = useState('all');

  // Modals state
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [docFormData, setDocFormData] = useState({
    doc_number: '',
    doc_date: new Date().toISOString().split('T')[0],
    arrival_date: new Date().toISOString().split('T')[0],
    arrival_number: '',
    issuer: '',
    doc_type: 'Công văn',
    field: 'Chuyên môn - Nghiệp vụ',
    urgency: 'Thường',
    security_level: 'Thường',
    summary: '',
    deadline: ''
  });
  const [docFile, setDocFile] = useState(null);

  // Dispatch Modal state
  const [dispatchModalDoc, setDispatchModalDoc] = useState(null);
  const [dispatchFormData, setDispatchFormData] = useState({
    dispatch_type: 'process', // 'process' | 'reference'
    target_type: 'users', // 'users' | 'job_title' | 'user_group'
    department_id: '',
    assigned_to_user_id: '',
    coordinating_user_ids: [],
    job_titles: [],
    group_id: '',
    leader_instruction: '',
    instruction: '',
    deadline: '',
    create_kpi_task: true,
    period_id: selectedPeriod || (periods[0]?.id || ''),
    axis_code: 'TRUC_1',
    standard_score: 10,
    difficulty_weight: 1.0,
    output_result: 'Báo cáo / Kế hoạch'
  });

  // Detail Modal state
  const [detailModalDoc, setDetailModalDoc] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Complete Dispatch Modal state
  const [completingDispatch, setCompletingDispatch] = useState(null);
  const [completionNote, setCompletionNote] = useState('');

  // Complete Document Modal state
  const [completingDoc, setCompletingDoc] = useState(null);
  const [completingDocNote, setCompletingDocNote] = useState('');

  // Submitting loaders
  const [submitting, setSubmitting] = useState(false);

  // Permissions (Chỉ Văn thư mới có quyền trình LĐ; chỉ Lãnh đạo/CBQL mới có quyền phân công)
  const userPerms = getUserPermissions(currentUser);
  const isAdmin = Boolean(userPerms.isAdmin);
  const isCBQL = Boolean(userPerms.isManager || userPerms.isAdmin || userPerms.canAssignTasks);
  const canSubmitToLeader = Boolean(userPerms.isVanThu || userPerms.isAdmin);

  // Leaders list for submitting documents
  const leaders = useMemo(() => {
    return users.filter(u => 
      u.role === 'admin' || 
      u.role === 'cbql' || 
      u.management_role === 'lanh_dao' || 
      u.management_role === 'quan_ly' || 
      ['ld_coquan', 'cbql_phong', 'admin', 'hieu_pho'].includes(u.role_code) ||
      (u.gov_title && (
        u.gov_title.toLowerCase().includes('hiệu trưởng') || 
        u.gov_title.toLowerCase().includes('phó hiệu trưởng') || 
        u.gov_title.toLowerCase().includes('trưởng phòng')
      ))
    );
  }, [users]);

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
      console.error('Error loading user groups:', e);
    }
  };

  useEffect(() => {
    loadUserGroups();
  }, []);

  useEffect(() => {
    loadData();
  }, [filterDocType, filterField, filterStatus, filterUrgency]);

  async function loadData() {
    try {
      setLoading(true);
      const [statsData, docsData] = await Promise.all([
        api.getDocumentStats(),
        api.getDocuments({
          search: searchTerm,
          doc_type: filterDocType,
          field: filterField,
          status: filterStatus,
          urgency: filterUrgency
        })
      ]);
      setStats(statsData);
      setDocuments(docsData);
    } catch (err) {
      console.error('Error loading documents:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleSearch = (e) => {
    e.preventDefault();
    loadData();
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setFilterDocType('all');
    setFilterField('all');
    setFilterStatus('all');
    setFilterUrgency('all');
  };

  // Open Add Document Modal
  const handleOpenAddDoc = () => {
    setEditingDoc(null);
    setDocFormData({
      doc_number: '',
      doc_date: new Date().toISOString().split('T')[0],
      arrival_date: new Date().toISOString().split('T')[0],
      arrival_number: '',
      issuer: 'Chi bộ Trường Mầm non Hoàng Yến',
      doc_type: 'Công văn',
      field: 'Chuyên môn - Nghiệp vụ',
      urgency: 'Thường',
      security_level: 'Thường',
      summary: '',
      deadline: '',
      status: 'pending_dispatch'
    });
    setDocFile(null);
    setIsDocModalOpen(true);
  };

  // Open Edit Document Modal
  const handleOpenEditDoc = (doc) => {
    setEditingDoc(doc);
    setDocFormData({
      doc_number: doc.doc_number || '',
      doc_date: toInputDateFormat(doc.doc_date) || '',
      arrival_date: toInputDateFormat(doc.arrival_date) || '',
      arrival_number: doc.arrival_number || '',
      issuer: doc.issuer || '',
      doc_type: doc.doc_type || 'Công văn',
      field: doc.field || 'Chuyên môn - Nghiệp vụ',
      urgency: doc.urgency || 'Thường',
      security_level: doc.security_level || 'Thường',
      summary: doc.summary || '',
      deadline: toInputDateFormat(doc.deadline) || '',
      status: doc.status || 'pending_dispatch'
    });
    setDocFile(null);
    setIsDocModalOpen(true);
  };

  // Submit Document Form (Add or Edit)
  const handleSubmitDoc = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const data = new FormData();
      Object.keys(docFormData).forEach(k => {
        if (docFormData[k] !== undefined && docFormData[k] !== null) {
          data.append(k, docFormData[k]);
        }
      });
      if (docFile) {
        data.append('file', docFile);
      }

      if (editingDoc) {
        await api.updateDocument(editingDoc.id, data);
        alert('Cập nhật thông tin văn bản thành công!');
      } else {
        await api.createDocument(data);
        alert('Tiếp nhận và lưu văn bản mới thành công!');
      }

      setIsDocModalOpen(false);
      loadData();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Document
  const handleDeleteDoc = async (doc) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa văn bản số ${doc.doc_number}?\nToàn bộ lịch sử phân bổ của văn bản này cũng sẽ bị xóa.`)) {
      return;
    }
    try {
      await api.deleteDocument(doc.id);
      alert('Đã xóa văn bản thành công!');
      loadData();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  };

  // Open Submit to Leader Modal (Văn thư trình Lãnh đạo)
  const handleOpenSubmitLeader = (doc) => {
    setSubmitModalDoc(doc);
    setSubmitLeaderId(doc.leader_id || leaders[0]?.id || '');
    setSubmitLeaderNote(doc.leader_instruction || `Kính trình Lãnh đạo xem xét và cho ý kiến chỉ đạo đối với văn bản số ${doc.doc_number}`);
  };

  // Submit to Leader Handler
  const handleSubmitToLeader = async (e) => {
    e.preventDefault();
    if (!submitModalDoc) return;
    if (!submitLeaderId) {
      alert('Vui lòng chọn Lãnh đạo nhận trình duyệt!');
      return;
    }
    try {
      setSubmitting(true);
      await api.submitDocumentToLeader(submitModalDoc.id, {
        leader_id: submitLeaderId,
        leader_instruction: submitLeaderNote
      });
      alert('Đã trình Lãnh đạo xin ý kiến chỉ đạo thành công!');
      setSubmitModalDoc(null);
      loadData();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Open Dispatch Modal (Lãnh đạo phân bổ văn bản)
  const handleOpenDispatch = (doc) => {
    setDispatchModalDoc(doc);
    setDispatchFormData({
      dispatch_type: 'process', // 'process' | 'reference'
      target_type: 'users', // 'users' | 'job_title' | 'user_group'
      department_id: departments[0]?.id || '',
      assigned_to_user_id: users.find(u => u.role !== 'admin')?.id || users[0]?.id || '',
      coordinating_user_ids: [],
      job_titles: [],
      group_id: userGroups[0]?.id || '',
      leader_instruction: doc.leader_instruction || '',
      instruction: doc.leader_instruction 
        ? `${doc.leader_instruction} - Triển khai thực hiện theo văn bản số ${doc.doc_number}`
        : `Nghiên cứu, tham mưu và tổ chức triển khai thực hiện theo nội dung văn bản số ${doc.doc_number}`,
      deadline: toInputDateFormat(doc.deadline) || new Date().toISOString().split('T')[0],
      create_kpi_task: true,
      period_id: selectedPeriod || (periods[0]?.id || ''),
      axis_code: 'TRUC_1',
      standard_score: 10,
      difficulty_weight: doc.urgency === 'Khẩn' || doc.urgency === 'Hỏa tốc' ? 1.1 : 1.0,
      output_result: 'Báo cáo / Kế hoạch triển khai'
    });
  };

  // Submit Dispatch Form
  const handleSubmitDispatch = async (e) => {
    e.preventDefault();
    if (!dispatchModalDoc) return;
    try {
      setSubmitting(true);
      const res = await api.dispatchDocument(dispatchModalDoc.id, dispatchFormData);
      alert(res.message || 'Đã phân bổ văn bản thành công!');
      setDispatchModalDoc(null);
      loadData();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Open Detail Modal
  const handleOpenDetail = async (docId) => {
    try {
      setDetailLoading(true);
      const doc = await api.getDocument(docId);
      setDetailModalDoc(doc);
    } catch (err) {
      alert('Lỗi tải chi tiết: ' + err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  // Open Complete Dispatch Modal
  const handleOpenCompleteDispatch = (dispatch) => {
    setCompletingDispatch(dispatch);
    setCompletionNote('');
  };

  // Submit Complete Dispatch
  const handleSubmitCompleteDispatch = async (e) => {
    e.preventDefault();
    if (!completingDispatch) return;
    try {
      setSubmitting(true);
      await api.completeDocumentDispatch(completingDispatch.id, {
        completion_note: completionNote
      });
      alert('Đã cập nhật hoàn tất xử lý văn bản!');
      setCompletingDispatch(null);
      if (detailModalDoc) {
        handleOpenDetail(detailModalDoc.id);
      }
      loadData();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Open Complete Document Modal
  const handleOpenCompleteDoc = (doc) => {
    setCompletingDoc(doc);
    setCompletingDocNote('');
  };

  // Submit Complete Document
  const handleSubmitCompleteDoc = async (e) => {
    e.preventDefault();
    if (!completingDoc) return;
    try {
      setSubmitting(true);
      await api.completeDocument(completingDoc.id, {
        completion_note: completingDocNote
      });
      alert('Đã cập nhật trạng thái văn bản thành Hoàn thành!');
      const docId = completingDoc.id;
      setCompletingDoc(null);
      if (detailModalDoc && detailModalDoc.id === docId) {
        handleOpenDetail(docId);
      }
      loadData();
    } catch (err) {
      alert('Lỗi: ' + (err.message || err.error));
    } finally {
      setSubmitting(false);
    }
  };

  // Reopen Document (chuyển lại Đang xử lý)
  const handleReopenDoc = async (doc) => {
    if (!window.confirm(`Bạn có chắc chắn muốn mở lại văn bản số "${doc.doc_number}" và chuyển trạng thái sang "Đang xử lý"?`)) return;
    try {
      setSubmitting(true);
      await api.updateDocumentStatus(doc.id, 'in_progress', 'Mở lại xử lý tiếp');
      alert('Đã chuyển trạng thái văn bản sang Đang xử lý!');
      if (detailModalDoc && detailModalDoc.id === doc.id) {
        handleOpenDetail(doc.id);
      }
      loadData();
    } catch (err) {
      alert('Lỗi: ' + (err.message || err.error));
    } finally {
      setSubmitting(false);
    }
  };

  // Status badge helper
  const renderStatusBadge = (status, isOverdue) => {
    if (isOverdue) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 shadow-2xs">
          <AlertTriangle className="w-3 h-3 text-rose-600" />
          <span>Quá hạn</span>
        </span>
      );
    }
    switch (status) {
      case 'pending_dispatch':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            <span>Chờ phân bổ</span>
          </span>
        );
      case 'submitted_to_leader':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs">
            <Send className="w-3 h-3 text-purple-600 rotate-[-45deg]" />
            <span>Chờ LĐ chỉ đạo</span>
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <Send className="w-3 h-3 text-blue-600" />
            <span>Đang xử lý</span>
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Đã hoàn tất</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  // Urgency badge helper
  const renderUrgencyBadge = (urgency) => {
    if (urgency === 'Hỏa tốc' || urgency === 'Thượng khẩn') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-600 text-white animate-pulse">
          ⚡ {urgency}
        </span>
      );
    }
    if (urgency === 'Khẩn') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500 text-white">
          Khẩn
        </span>
      );
    }
    return null;
  };

  return (
    <div className="space-y-5">
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-700 to-red-900 text-white flex items-center justify-center shadow-md">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
                Quản lý & Phân bổ Văn bản Hành chính
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Tiếp nhận, trình Lãnh đạo cho ý kiến, phân bổ nhiệm vụ gắn với đánh giá KPI hoặc chuyển đọc tham khảo
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setIsGroupModalOpen(true)}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-300 transition active:scale-95 cursor-pointer shrink-0"
            title="Quản lý các nhóm người dùng tự tạo để giao việc & phân bổ văn bản nhanh"
          >
            <Users className="w-4 h-4 text-slate-600" />
            <span>Nhóm tự tạo ({userGroups.length})</span>
          </button>

          {isCBQL && (
            <button
              type="button"
              onClick={handleOpenAddDoc}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-xl shadow-sm transition active:scale-95 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Tiếp nhận Văn bản mới</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Summary Stat Cards (6 Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div 
          onClick={() => setFilterStatus('all')}
          className={`p-3.5 rounded-xl border cursor-pointer transition ${
            filterStatus === 'all' ? 'bg-slate-100 border-slate-400 shadow-xs' : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="text-xs text-slate-500 font-medium flex items-center justify-between">
            <span>Tổng văn bản</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Toàn bộ hồ sơ</div>
        </div>

        <div 
          onClick={() => setFilterStatus('pending_dispatch')}
          className={`p-3.5 rounded-xl border cursor-pointer transition ${
            filterStatus === 'pending_dispatch' ? 'bg-amber-100/70 border-amber-400 shadow-xs' : 'bg-amber-50/50 border-amber-200 hover:bg-amber-50'
          }`}
        >
          <div className="text-xs text-amber-800 font-semibold flex items-center justify-between">
            <span>Chờ phân bổ</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-900 mt-1">{stats.pending_dispatch}</div>
          <div className="text-[11px] text-amber-700 mt-0.5">Chưa phân công</div>
        </div>

        <div 
          onClick={() => setFilterStatus('submitted_to_leader')}
          className={`p-3.5 rounded-xl border cursor-pointer transition ${
            filterStatus === 'submitted_to_leader' ? 'bg-purple-100/70 border-purple-400 shadow-xs' : 'bg-purple-50/50 border-purple-200 hover:bg-purple-50'
          }`}
        >
          <div className="text-xs text-purple-800 font-semibold flex items-center justify-between">
            <span>Chờ LĐ chỉ đạo</span>
            <Send className="w-4 h-4 text-purple-600 rotate-[-45deg]" />
          </div>
          <div className="text-2xl font-bold text-purple-900 mt-1">{stats.submitted_to_leader || 0}</div>
          <div className="text-[11px] text-purple-700 mt-0.5">Đã trình Lãnh đạo</div>
        </div>

        <div 
          onClick={() => setFilterStatus('in_progress')}
          className={`p-3.5 rounded-xl border cursor-pointer transition ${
            filterStatus === 'in_progress' ? 'bg-blue-100/70 border-blue-400 shadow-xs' : 'bg-blue-50/50 border-blue-200 hover:bg-blue-50'
          }`}
        >
          <div className="text-xs text-blue-800 font-semibold flex items-center justify-between">
            <span>Đang xử lý</span>
            <Send className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-blue-900 mt-1">{stats.in_progress}</div>
          <div className="text-[11px] text-blue-700 mt-0.5">Đã phân bổ cán bộ</div>
        </div>

        <div 
          onClick={() => setFilterStatus('completed')}
          className={`p-3.5 rounded-xl border cursor-pointer transition ${
            filterStatus === 'completed' ? 'bg-emerald-100/70 border-emerald-400 shadow-xs' : 'bg-emerald-50/50 border-emerald-200 hover:bg-emerald-50'
          }`}
        >
          <div className="text-xs text-emerald-800 font-semibold flex items-center justify-between">
            <span>Đã hoàn tất</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-900 mt-1">{stats.completed}</div>
          <div className="text-[11px] text-emerald-700 mt-0.5">Đã có kết quả</div>
        </div>

        <div 
          onClick={() => setFilterStatus('overdue')}
          className={`p-3.5 rounded-xl border cursor-pointer transition ${
            filterStatus === 'overdue' ? 'bg-rose-100/70 border-rose-400 shadow-xs' : 'bg-rose-50/50 border-rose-200 hover:bg-rose-50'
          }`}
        >
          <div className="text-xs text-rose-800 font-semibold flex items-center justify-between">
            <span>Quá hạn</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-rose-900 mt-1">{stats.overdue}</div>
          <div className="text-[11px] text-rose-700 mt-0.5">Hạn chót đã qua</div>
        </div>
      </div>

      {/* 3. Search & Multi-Filters Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo Số hiệu văn bản, Cơ quan ban hành, Trích yếu nội dung..."
              className="w-full text-xs pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
          >
            Tìm kiếm
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs">
          <div className="flex items-center gap-1 text-slate-500 font-medium">
            <Filter className="w-3.5 h-3.5" />
            <span>Lọc nhanh:</span>
          </div>

          {/* Doc Type Filter */}
          <select
            value={filterDocType}
            onChange={(e) => setFilterDocType(e.target.value)}
            className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700 focus:ring-1 focus:ring-red-500"
          >
            <option value="all">-- Tất cả Phân loại --</option>
            {DOC_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* Field Filter */}
          <select
            value={filterField}
            onChange={(e) => setFilterField(e.target.value)}
            className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700 focus:ring-1 focus:ring-red-500"
          >
            <option value="all">-- Tất cả Lĩnh vực --</option>
            {DOC_FIELDS.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700 focus:ring-1 focus:ring-red-500"
          >
            <option value="all">-- Tất cả Trạng thái --</option>
            <option value="pending_dispatch">Chờ phân bổ</option>
            <option value="submitted_to_leader">Chờ Lãnh đạo chỉ đạo</option>
            <option value="in_progress">Đang xử lý</option>
            <option value="completed">Đã hoàn tất</option>
            <option value="overdue">Quá hạn</option>
          </select>

          {/* Urgency Filter */}
          <select
            value={filterUrgency}
            onChange={(e) => setFilterUrgency(e.target.value)}
            className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700 focus:ring-1 focus:ring-red-500"
          >
            <option value="all">-- Tất cả Độ khẩn --</option>
            {URGENCIES.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>

          {(searchTerm || filterDocType !== 'all' || filterField !== 'all' || filterStatus !== 'all' || filterUrgency !== 'all') && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="flex items-center gap-1 text-slate-500 hover:text-red-700 font-bold ml-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Xóa bộ lọc</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. Documents List: Desktop Table & Mobile Cards */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
          <div className="animate-spin w-6 h-6 border-2 border-red-700 border-t-transparent rounded-full mx-auto mb-2"></div>
          Đang tải dữ liệu hồ sơ văn bản...
        </div>
      ) : documents.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 italic space-y-2">
          <FileText className="w-8 h-8 mx-auto text-slate-300" />
          <p>Không tìm thấy văn bản nào phù hợp với điều kiện tìm kiếm.</p>
          {isCBQL && (
            <button
              type="button"
              onClick={handleOpenAddDoc}
              className="inline-flex items-center gap-1 text-xs font-bold text-red-700 hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm văn bản mới ngay</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* DESKTOP TABLE (hidden md:block) */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left text-xs text-slate-600 min-w-[1050px]">
                <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-3.5 py-3 w-12 text-center">STT</th>
                    <th className="px-3.5 py-3 min-w-[150px]">Số / Ký hiệu</th>
                    <th className="px-3.5 py-3 min-w-[160px]">Cơ quan ban hành</th>
                    <th className="px-3.5 py-3 min-w-[150px]">Phân loại & Lĩnh vực</th>
                    <th className="px-3.5 py-3 min-w-[320px]">Trích yếu nội dung</th>
                    <th className="px-3.5 py-3 min-w-[110px]">Hạn xử lý</th>
                    <th className="px-3.5 py-3 min-w-[120px] text-center">Tình trạng</th>
                    <th className="px-3.5 py-3 min-w-[160px]">Cán bộ xử lý</th>
                    <th className="px-3.5 py-3 min-w-[160px] text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {documents.map((doc, idx) => (
                    <tr key={doc.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-3.5 py-3 text-center text-slate-400 font-normal">
                        {idx + 1}
                      </td>

                      {/* Số hiệu & Ngày */}
                      <td className="px-3.5 py-3">
                        <div className="font-bold text-slate-900 font-mono text-xs">
                          {doc.doc_number}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{formatDate(doc.doc_date)}</span>
                        </div>
                        {doc.arrival_number && (
                          <div className="text-[10px] text-slate-500 font-medium">
                            Số đến: <strong>{doc.arrival_number}</strong> ({formatDate(doc.arrival_date)})
                          </div>
                        )}
                      </td>

                      {/* Cơ quan ban hành */}
                      <td className="px-3.5 py-3">
                        <div className="font-semibold text-slate-800 line-clamp-2">
                          {doc.issuer}
                        </div>
                      </td>

                      {/* Phân loại & Lĩnh vực */}
                      <td className="px-3.5 py-3">
                        <div className="font-bold text-red-800">
                          {doc.doc_type}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {doc.field || 'Chuyên môn'}
                        </div>
                      </td>

                      {/* Trích yếu nội dung */}
                      <td className="px-3.5 py-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {renderUrgencyBadge(doc.urgency)}
                            {doc.security_level && doc.security_level !== 'Thường' && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-800 text-white">
                                {doc.security_level}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-800 font-medium leading-relaxed line-clamp-3">
                            {doc.summary}
                          </p>
                          {doc.file_url && (
                            <div className="pt-0.5">
                              <a
                                href={doc.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-blue-700 hover:text-blue-900 font-bold hover:underline"
                              >
                                <Paperclip className="w-3 h-3" />
                                <span>{doc.file_name || 'Tải file đính kèm'}</span>
                              </a>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Hạn xử lý */}
                      <td className="px-3.5 py-3">
                        {doc.deadline ? (
                          <div className={`font-semibold ${doc.is_overdue ? 'text-rose-600 font-bold' : 'text-slate-700'}`}>
                            {formatDate(doc.deadline)}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Không quy định</span>
                        )}
                      </td>

                      {/* Tình trạng */}
                      <td className="px-3.5 py-3 text-center">
                        {renderStatusBadge(doc.status, doc.is_overdue)}
                      </td>

                      {/* Cán bộ xử lý */}
                      <td className="px-3.5 py-3">
                        {doc.status === 'submitted_to_leader' ? (
                          <div className="space-y-0.5">
                            <div className="text-[11px] font-bold text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 inline-flex items-center gap-1">
                              <Send className="w-2.5 h-2.5 rotate-[-45deg] text-purple-600" />
                              <span>Trình: {doc.leader_name || 'Lãnh đạo'}</span>
                            </div>
                            {doc.leader_instruction && (
                              <div className="text-[10px] text-purple-700 italic line-clamp-2" title={doc.leader_instruction}>
                                "{doc.leader_instruction}"
                              </div>
                            )}
                          </div>
                        ) : doc.assigned_officers ? (
                          <div className="font-semibold text-slate-800 line-clamp-2">
                            {doc.assigned_officers}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Chưa phân bổ</span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="px-3.5 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {/* Trình Lãnh đạo button (Chỉ người dùng có quyền Văn thư mới có tính năng này) */}
                          {canSubmitToLeader && (doc.status === 'pending_dispatch' || !doc.status) && (
                            <button
                              type="button"
                              onClick={() => handleOpenSubmitLeader(doc)}
                              className="px-2 py-1 bg-purple-700 hover:bg-purple-800 text-white font-bold text-[11px] rounded-lg shadow-2xs transition flex items-center gap-1 cursor-pointer"
                              title="Văn thư trình Lãnh đạo xin ý kiến chỉ đạo"
                            >
                              <Send className="w-3 h-3 rotate-[-45deg]" />
                              <span>Trình LĐ</span>
                            </button>
                          )}

                          {/* Phân công / Chỉ đạo button (Chỉ Lãnh đạo/CBQL; Sau khi Lãnh đạo đã phân công => không còn hiển thị nút Phân công) */}
                          {isCBQL && (doc.status === 'pending_dispatch' || doc.status === 'submitted_to_leader') && (!doc.dispatches_count || doc.dispatches_count === 0) && (
                            <button
                              type="button"
                              onClick={() => handleOpenDispatch(doc)}
                              className="px-2.5 py-1 bg-red-700 hover:bg-red-800 text-white font-bold text-[11px] rounded-lg shadow-2xs transition flex items-center gap-1 cursor-pointer"
                              title="Lãnh đạo phân công xử lý văn bản và giao việc KPI hoặc chuyển đọc tham khảo"
                            >
                              <Send className="w-3 h-3" />
                              <span>{doc.status === 'submitted_to_leader' ? 'Chỉ đạo' : 'Phân công'}</span>
                            </button>
                          )}

                          {/* Hoàn thành văn bản sau khi xử lý xong */}
                          {doc.status !== 'completed' ? (
                            <button
                              type="button"
                              onClick={() => handleOpenCompleteDoc(doc)}
                              className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px] rounded-lg shadow-2xs transition flex items-center gap-1 cursor-pointer"
                              title="Xác nhận hoàn thành xử lý văn bản"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Hoàn thành</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleReopenDoc(doc)}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[10px] rounded-lg border border-slate-200 transition flex items-center gap-1 cursor-pointer"
                              title="Mở lại văn bản (chuyển sang Đang xử lý)"
                            >
                              <RefreshCw className="w-2.5 h-2.5 text-slate-500" />
                              <span>Mở lại</span>
                            </button>
                          )}

                          {/* Chi tiết button */}
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(doc.id)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            title="Xem chi tiết & Lịch sử phân bổ"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Sửa / Xóa for Admin / CBQL */}
                          {isCBQL && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEditDoc(doc)}
                                className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                                title="Chỉnh sửa văn bản"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteDoc(doc)}
                                className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                title="Xóa văn bản"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* MOBILE CARDS (md:hidden) */}
          <div className="md:hidden space-y-3">
            {documents.map((doc, idx) => (
              <div 
                key={doc.id}
                className={`bg-white rounded-xl border p-4 shadow-xs space-y-3 ${
                  doc.is_overdue ? 'border-rose-300' : 'border-slate-200'
                }`}
              >
                {/* Header card */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-bold text-xs text-red-900 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                        {doc.doc_number}
                      </span>
                      {renderUrgencyBadge(doc.urgency)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {doc.issuer} • {formatDate(doc.doc_date)}
                    </div>
                  </div>
                  <div>
                    {renderStatusBadge(doc.status, doc.is_overdue)}
                  </div>
                </div>

                {/* Body: Trích yếu */}
                <div className="space-y-1 text-xs">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                    {doc.doc_type} • {doc.field}
                  </div>
                  <p className="font-semibold text-slate-900 leading-snug">
                    {doc.summary}
                  </p>
                </div>

                {/* Extra details */}
                <div className="grid grid-cols-2 gap-2 text-[11px] p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div>
                    <span className="text-slate-400 block">Hạn xử lý:</span>
                    <strong className={doc.is_overdue ? 'text-rose-600' : 'text-slate-700'}>
                      {doc.deadline ? formatDate(doc.deadline) : 'Không'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Người xử lý:</span>
                    <strong className="text-slate-700 truncate block">
                      {doc.status === 'submitted_to_leader' 
                        ? `Trình LĐ: ${doc.leader_name || 'Lãnh đạo'}` 
                        : (doc.assigned_officers || 'Chưa phân bổ')}
                    </strong>
                  </div>
                </div>

                {doc.file_url && (
                  <div className="pt-0.5">
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-700 font-bold hover:underline"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>{doc.file_name || 'Tải file đính kèm'}</span>
                    </a>
                  </div>
                )}

                {/* Mobile action buttons */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleOpenDetail(doc.id)}
                    className="flex-1 min-w-[75px] py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-lg transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Chi tiết</span>
                  </button>

                  {canSubmitToLeader && (doc.status === 'pending_dispatch' || !doc.status) && (
                    <button
                      type="button"
                      onClick={() => handleOpenSubmitLeader(doc)}
                      className="flex-1 min-w-[85px] py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-lg shadow-xs transition flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5 rotate-[-45deg]" />
                      <span>Trình LĐ</span>
                    </button>
                  )}

                  {isCBQL && (doc.status === 'pending_dispatch' || doc.status === 'submitted_to_leader') && (!doc.dispatches_count || doc.dispatches_count === 0) && (
                    <button
                      type="button"
                      onClick={() => handleOpenDispatch(doc)}
                      className="flex-1 min-w-[85px] py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-lg shadow-xs transition flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{doc.status === 'submitted_to_leader' ? 'Chỉ đạo' : 'Phân công'}</span>
                    </button>
                  )}

                  {/* Nút Hoàn thành mobile */}
                  {doc.status !== 'completed' ? (
                    <button
                      type="button"
                      onClick={() => handleOpenCompleteDoc(doc)}
                      className="flex-1 min-w-[85px] py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg shadow-xs transition flex items-center justify-center gap-1 cursor-pointer"
                      title="Xác nhận hoàn thành xử lý văn bản"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Hoàn thành</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleReopenDoc(doc)}
                      className="flex-1 min-w-[85px] py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg border border-slate-200 transition flex items-center justify-center gap-1 cursor-pointer"
                      title="Mở lại văn bản"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                      <span>Mở lại</span>
                    </button>
                  )}

                  {isCBQL && (
                    <button
                      type="button"
                      onClick={() => handleOpenEditDoc(doc)}
                      className="p-2 text-blue-700 bg-blue-50 rounded-lg cursor-pointer"
                      title="Sửa"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ===================================================================== */}
      {/* 5. MODAL: TIẾP NHẬN / CHỈNH SỬA VĂN BẢN (DocumentModal)              */}
      {/* ===================================================================== */}
      {isDocModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl w-[95%] sm:max-w-2xl shadow-2xl border border-slate-200 overflow-hidden my-4 sm:my-8 animate-in fade-in zoom-in duration-200 max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 bg-gradient-to-r from-red-700 via-red-800 to-red-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5" />
                <h3 className="text-base font-bold">
                  {editingDoc ? `Chỉnh sửa Văn bản: ${editingDoc.doc_number}` : 'Tiếp nhận & Vào sổ Văn bản mới'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDocModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitDoc} className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Số / Ký hiệu văn bản <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={docFormData.doc_number}
                    onChange={(e) => setDocFormData({ ...docFormData, doc_number: e.target.value })}
                    placeholder="VD: 15-HD/BTCTU hoặc 120/QĐ-UBND"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-mono font-medium focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Cơ quan ban hành <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={docFormData.issuer}
                    onChange={(e) => setDocFormData({ ...docFormData, issuer: e.target.value })}
                    placeholder="VD: Thành ủy, UBND Quận, Sở GD&ĐT..."
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ngày ban hành</label>
                  <input
                    type="date"
                    value={docFormData.doc_date}
                    onChange={(e) => setDocFormData({ ...docFormData, doc_date: e.target.value })}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ngày đến / Tiếp nhận</label>
                  <input
                    type="date"
                    value={docFormData.arrival_date}
                    onChange={(e) => setDocFormData({ ...docFormData, arrival_date: e.target.value })}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Số đến (Sổ tiếp nhận)</label>
                  <input
                    type="text"
                    value={docFormData.arrival_number}
                    onChange={(e) => setDocFormData({ ...docFormData, arrival_number: e.target.value })}
                    placeholder="VD: 45"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Phân loại văn bản <span className="text-rose-600">*</span>
                  </label>
                  <select
                    value={docFormData.doc_type}
                    onChange={(e) => setDocFormData({ ...docFormData, doc_type: e.target.value })}
                    required
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-bold text-red-900 focus:ring-2 focus:ring-red-500"
                  >
                    {DOC_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Lĩnh vực chuyên đề</label>
                  <select
                    value={docFormData.field}
                    onChange={(e) => setDocFormData({ ...docFormData, field: e.target.value })}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-medium"
                  >
                    {DOC_FIELDS.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Độ khẩn</label>
                  <select
                    value={docFormData.urgency}
                    onChange={(e) => setDocFormData({ ...docFormData, urgency: e.target.value })}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-medium"
                  >
                    {URGENCIES.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Độ mật</label>
                  <select
                    value={docFormData.security_level}
                    onChange={(e) => setDocFormData({ ...docFormData, security_level: e.target.value })}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-medium"
                  >
                    {SECURITY_LEVELS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Trích yếu nội dung */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Trích yếu nội dung văn bản <span className="text-rose-600">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={docFormData.summary}
                  onChange={(e) => setDocFormData({ ...docFormData, summary: e.target.value })}
                  placeholder="Tóm tắt ngắn gọn mục đích, nội dung chính, yêu cầu chỉ đạo của văn bản..."
                  className="w-full text-xs p-3 border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-red-500 leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Trạng thái văn bản</label>
                  <select
                    value={docFormData.status || 'pending_dispatch'}
                    onChange={(e) => setDocFormData({ ...docFormData, status: e.target.value })}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-bold text-slate-800 bg-white"
                  >
                    <option value="pending_dispatch">Chờ phân bổ</option>
                    <option value="submitted_to_leader">Đã trình Lãnh đạo</option>
                    <option value="in_progress">Đang xử lý</option>
                    <option value="completed">✓ Hoàn thành</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Hạn xử lý (nếu có)</label>
                  <input
                    type="date"
                    value={docFormData.deadline}
                    onChange={(e) => setDocFormData({ ...docFormData, deadline: e.target.value })}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tệp đính kèm văn bản gốc</label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx"
                    onChange={(e) => setDocFile(e.target.files[0])}
                    className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                  />
                  {editingDoc?.file_name && !docFile && (
                    <p className="text-[11px] text-slate-500 mt-1 truncate">
                      File: <strong>{editingDoc.file_name}</strong>
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDocModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingDoc ? 'Lưu cập nhật' : 'Tiếp nhận văn bản'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 6. MODAL: PHÂN BỔ VĂN BẢN (DispatchModal)                           */}
      {/* ===================================================================== */}
      {dispatchModalDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl w-[95%] sm:max-w-2xl shadow-2xl border border-slate-200 overflow-hidden my-4 sm:my-8 animate-in fade-in zoom-in duration-200 max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 bg-gradient-to-r from-red-800 via-rose-800 to-red-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shadow-xs">
                  <Send className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Phân bổ Văn bản & Giao chỉ đạo</h3>
                  <p className="text-xs text-red-100">
                    Phân công cán bộ xử lý (hoặc nhóm chức danh/nhóm tự tạo) hoặc chuyển đọc tham khảo
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDispatchModalDoc(null)}
                className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitDispatch} className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto">
              {/* Document Summary Preview Card */}
              <div className="p-3.5 bg-red-50/60 rounded-xl border border-red-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-xs text-red-900">
                    Số: {dispatchModalDoc.doc_number}
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {dispatchModalDoc.issuer}
                  </span>
                </div>
                <p className="text-xs text-slate-800 font-semibold leading-relaxed">
                  {dispatchModalDoc.summary}
                </p>
                {dispatchModalDoc.leader_instruction && (
                  <div className="pt-1 text-[11px] text-purple-800 font-medium border-t border-red-200/60 flex items-center gap-1">
                    <Send className="w-3 h-3 text-purple-600 rotate-[-45deg]" />
                    <span>Ý kiến trình Lãnh đạo trước đó: <em>"{dispatchModalDoc.leader_instruction}"</em></span>
                  </div>
                )}
              </div>

              {/* 1. Dispatch Type (Mục đích / Hình thức phân bổ) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  Mục đích & Hình thức phân bổ <span className="text-rose-600">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div
                    onClick={() => setDispatchFormData({ ...dispatchFormData, dispatch_type: 'process', create_kpi_task: true })}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition flex items-start gap-2.5 ${
                      dispatchFormData.dispatch_type === 'process'
                        ? 'bg-red-50/70 border-red-600 shadow-xs'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg ${dispatchFormData.dispatch_type === 'process' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <span className="text-xs font-bold text-slate-900 block">Giao nhiệm vụ xử lý</span>
                      <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                        Phân công cán bộ thực hiện, theo dõi tiến độ và đánh giá điểm KPI
                      </span>
                    </div>
                  </div>

                  <div
                    onClick={() => setDispatchFormData({ ...dispatchFormData, dispatch_type: 'reference', create_kpi_task: false })}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition flex items-start gap-2.5 ${
                      dispatchFormData.dispatch_type === 'reference'
                        ? 'bg-blue-50/70 border-blue-600 shadow-xs'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg ${dispatchFormData.dispatch_type === 'reference' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <span className="text-xs font-bold text-slate-900 block">Chuyển đọc tham khảo</span>
                      <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                        Phổ biến để nghiên cứu, tra cứu, không giao chỉ tiêu KPI
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Target Selection (Đối tượng nhận phân bổ) */}
              <div className="space-y-2.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-800">
                  Đối tượng nhận phân bổ <span className="text-rose-600">*</span>
                </label>
                <div className="flex border-b border-slate-200 gap-3">
                  <button
                    type="button"
                    onClick={() => setDispatchFormData({ ...dispatchFormData, target_type: 'users' })}
                    className={`pb-2 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                      dispatchFormData.target_type === 'users'
                        ? 'border-red-600 text-red-700'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Chỉ định cán bộ</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDispatchFormData({ ...dispatchFormData, target_type: 'job_title' })}
                    className={`pb-2 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                      dispatchFormData.target_type === 'job_title'
                        ? 'border-red-600 text-red-700'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                    <span>Theo nhóm chức danh</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDispatchFormData({ ...dispatchFormData, target_type: 'user_group' })}
                    className={`pb-2 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                      dispatchFormData.target_type === 'user_group'
                        ? 'border-red-600 text-red-700'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Theo nhóm tự tạo ({userGroups.length})</span>
                  </button>
                </div>

                {/* Sub-tab 1: Individual Assignees */}
                {dispatchFormData.target_type === 'users' && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Đơn vị / Phòng ban chủ trì
                        </label>
                        <select
                          value={dispatchFormData.department_id}
                          onChange={(e) => setDispatchFormData({ ...dispatchFormData, department_id: e.target.value })}
                          className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg font-medium"
                        >
                          {departments.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          {dispatchFormData.dispatch_type === 'process' ? 'Cán bộ phụ trách chính *' : 'Người nhận chính *'}
                        </label>
                        <select
                          required
                          value={dispatchFormData.assigned_to_user_id}
                          onChange={(e) => setDispatchFormData({ ...dispatchFormData, assigned_to_user_id: e.target.value })}
                          className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-red-500"
                        >
                          <option value="">-- Chọn cán bộ --</option>
                          {users.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.full_name} ({u.dept_name || 'Cơ quan'} • {u.gov_title || 'Chuyên viên'})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Cán bộ cùng xử lý / phối hợp / nhận cùng (chọn nhiều người):
                      </label>
                      <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-white grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {users
                          .filter(u => u.id !== dispatchFormData.assigned_to_user_id)
                          .map(u => {
                            const isChecked = dispatchFormData.coordinating_user_ids.includes(u.id);
                            return (
                              <label key={u.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded cursor-pointer text-xs">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    const current = dispatchFormData.coordinating_user_ids;
                                    setDispatchFormData({
                                      ...dispatchFormData,
                                      coordinating_user_ids: isChecked
                                        ? current.filter(id => id !== u.id)
                                        : [...current, u.id]
                                    });
                                  }}
                                  className="rounded text-red-600 focus:ring-red-500 w-3.5 h-3.5"
                                />
                                <span className="truncate">{u.full_name} <span className="text-slate-400 text-[10px]">({u.gov_title || 'CB'})</span></span>
                              </label>
                            );
                          })}
                      </div>
                      {dispatchFormData.coordinating_user_ids.length > 0 && (
                        <p className="text-[11px] text-slate-500 mt-1">
                          Đã chọn <strong>{dispatchFormData.coordinating_user_ids.length}</strong> cán bộ phối hợp / nhận cùng
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Sub-tab 2: Job Titles */}
                {dispatchFormData.target_type === 'job_title' && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] text-slate-500">
                      Tất cả cán bộ, giáo viên, nhân viên giữ chức danh được tích chọn sẽ tự động nhận văn bản này:
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {distinctJobTitles.map(title => {
                        const count = users.filter(u => u.gov_title === title || u.party_title === title).length;
                        const isChecked = dispatchFormData.job_titles.includes(title);
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
                              onChange={() => {
                                const current = dispatchFormData.job_titles;
                                setDispatchFormData({
                                  ...dispatchFormData,
                                  job_titles: isChecked
                                    ? current.filter(t => t !== title)
                                    : [...current, title]
                                });
                              }}
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
                    {dispatchFormData.job_titles.length > 0 && (
                      <div className="p-2.5 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-700">
                        ⚡ Ước tính có <strong>{
                          users.filter(u => dispatchFormData.job_titles.some(t => u.gov_title === t || u.party_title === t)).length
                        }</strong> cán bộ thuộc các chức danh đã chọn sẽ nhận văn bản này.
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-tab 3: Custom User Groups */}
                {dispatchFormData.target_type === 'user_group' && (
                  <div className="space-y-2.5 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold text-slate-700">
                        Chọn nhóm người dùng tự tạo *
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsGroupModalOpen(true)}
                        className="text-xs font-bold text-red-700 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Quản lý danh sách nhóm</span>
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
                        value={dispatchFormData.group_id}
                        onChange={(e) => setDispatchFormData({ ...dispatchFormData, group_id: e.target.value })}
                        className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-red-500"
                      >
                        <option value="">-- Chọn nhóm người dùng --</option>
                        {userGroups.map(g => (
                          <option key={g.id} value={g.id}>
                            {g.name} ({g.members?.length || 0} thành viên) {g.description ? ` - ${g.description}` : ''}
                          </option>
                        ))}
                      </select>
                    )}

                    {dispatchFormData.group_id && (
                      (() => {
                        const selectedGroup = userGroups.find(g => g.id === dispatchFormData.group_id);
                        if (!selectedGroup) return null;
                        return (
                          <div className="p-3 bg-white rounded-xl border border-red-200 space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <strong className="text-red-900 font-bold">{selectedGroup.name}</strong>
                              <span className="text-slate-500 font-medium">{selectedGroup.members?.length || 0} thành viên</span>
                            </div>
                            {selectedGroup.description && (
                              <p className="text-[11px] text-slate-600">{selectedGroup.description}</p>
                            )}
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
              </div>

              {/* 3. Instruction / Direction from Leader */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Ý kiến chỉ đạo của Lãnh đạo / Yêu cầu cụ thể *
                </label>
                <textarea
                  required
                  rows={3}
                  value={dispatchFormData.instruction}
                  onChange={(e) => setDispatchFormData({ ...dispatchFormData, instruction: e.target.value })}
                  placeholder="Ghi rõ ý kiến chỉ đạo của Lãnh đạo đối với cán bộ: VD: Nghiên cứu tham mưu Kế hoạch thực hiện trước ngày..."
                  className="w-full text-xs p-3 border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-red-500"
                />
              </div>

              {/* 4. Deadline */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Hạn chót xử lý của cán bộ *
                </label>
                <input
                  type="date"
                  required
                  value={dispatchFormData.deadline}
                  onChange={(e) => setDispatchFormData({ ...dispatchFormData, deadline: e.target.value })}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-medium"
                />
              </div>

              {/* 5. Reference Info Banner or KPI Task Options */}
              {dispatchFormData.dispatch_type === 'reference' ? (
                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
                  <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold">Hình thức Chuyển đọc tham khảo</strong>
                    <span className="text-[11px] text-blue-800">
                      Văn bản sẽ được gửi đến hộp thư tiếp nhận của các cán bộ được chọn để nghiên cứu, tra cứu. Hệ thống không tạo chỉ tiêu KPI bắt buộc đối với hình thức này.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dispatchFormData.create_kpi_task}
                      onChange={(e) => setDispatchFormData({ ...dispatchFormData, create_kpi_task: e.target.checked })}
                      className="rounded text-red-600 focus:ring-red-500 w-4 h-4"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        Đồng thời tạo Nhiệm vụ KPI trong kỳ đánh giá cho cán bộ
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        Công việc sẽ tự động xuất hiện trong Tab "Quản lý nhiệm vụ" và "Nộp sản phẩm" của cán bộ
                      </span>
                    </div>
                  </label>

                  {dispatchFormData.create_kpi_task && (
                    <div className="pt-2 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Kỳ đánh giá</label>
                        <select
                          value={dispatchFormData.period_id}
                          onChange={(e) => setDispatchFormData({ ...dispatchFormData, period_id: e.target.value })}
                          className="w-full text-xs p-2 border border-slate-300 rounded-lg font-medium"
                        >
                          {periods.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Trục kết quả</label>
                        <select
                          value={dispatchFormData.axis_code}
                          onChange={(e) => setDispatchFormData({ ...dispatchFormData, axis_code: e.target.value })}
                          className="w-full text-xs p-2 border border-slate-300 rounded-lg font-medium"
                        >
                          {axes.map(a => (
                            <option key={a.code} value={a.code}>{a.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Điểm chuẩn & HS</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={dispatchFormData.standard_score}
                            onChange={(e) => setDispatchFormData({ ...dispatchFormData, standard_score: e.target.value })}
                            className="w-16 text-xs p-2 border border-slate-300 rounded-lg text-center font-bold"
                            title="Điểm chuẩn"
                          />
                          <span className="text-slate-400">×</span>
                          <input
                            type="number"
                            step="0.1"
                            value={dispatchFormData.difficulty_weight}
                            onChange={(e) => setDispatchFormData({ ...dispatchFormData, difficulty_weight: e.target.value })}
                            className="w-16 text-xs p-2 border border-slate-300 rounded-lg text-center font-bold"
                            title="Hệ số"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDispatchModalDoc(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{dispatchFormData.dispatch_type === 'reference' ? 'Chuyển đọc tham khảo' : 'Xác nhận Phân bổ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 6.1 MODAL: VĂN THƯ TRÌNH LÃNH ĐẠO (SubmitToLeaderModal)               */}
      {/* ===================================================================== */}
      {submitModalDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl w-[95%] sm:max-w-lg shadow-2xl border border-slate-200 overflow-hidden my-4 sm:my-8 animate-in fade-in zoom-in duration-200 flex flex-col">
            <div className="px-6 py-4 bg-gradient-to-r from-purple-800 via-purple-700 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Send className="w-5 h-5 rotate-[-45deg]" />
                <div>
                  <h3 className="text-base font-bold">Văn thư Trình Lãnh đạo</h3>
                  <p className="text-xs text-purple-200">Xin ý kiến chỉ đạo và phân bổ xử lý văn bản</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSubmitModalDoc(null)}
                className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitToLeader} className="p-5 sm:p-6 space-y-4 text-xs">
              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-purple-900">Số: {submitModalDoc.doc_number}</span>
                  <span className="text-slate-500 font-medium">{submitModalDoc.issuer}</span>
                </div>
                <p className="font-semibold text-slate-800 line-clamp-2 leading-relaxed">
                  {submitModalDoc.summary}
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Chọn Lãnh đạo nhận trình duyệt <span className="text-rose-600">*</span>
                </label>
                <select
                  required
                  value={submitLeaderId}
                  onChange={(e) => setSubmitLeaderId(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- Chọn Lãnh đạo nhận trình --</option>
                  {leaders.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.full_name} ({l.gov_title || l.role_title || 'Lãnh đạo'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Ý kiến trình / Ghi chú của Văn thư
                </label>
                <textarea
                  rows={3}
                  value={submitLeaderNote}
                  onChange={(e) => setSubmitLeaderNote(e.target.value)}
                  placeholder="Kính trình Lãnh đạo xem xét và cho ý kiến chỉ đạo..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-purple-500 leading-relaxed"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSubmitModalDoc(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 rotate-[-45deg]" />
                  <span>Xác nhận Trình Lãnh đạo</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 7. MODAL: XEM CHI TIẾT VĂN BẢN & LỊCH SỬ PHÂN BỔ (DocumentDetailModal) */}
      {/* ===================================================================== */}
      {detailModalDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl w-[95%] sm:max-w-3xl shadow-2xl border border-slate-200 overflow-hidden my-4 sm:my-8 animate-in fade-in zoom-in duration-200 max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-red-400" />
                <div>
                  <h3 className="text-base font-bold">Hồ sơ Chi tiết Văn bản & Lịch sử Phân bổ</h3>
                  <p className="text-xs text-slate-400 font-mono">{detailModalDoc.doc_number}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalDoc(null)}
                className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-5 flex-1 overflow-y-auto text-xs">
              {/* Document Administrative Info Card */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Số / Ký hiệu:</span>
                    <strong className="text-slate-900 font-mono text-sm">{detailModalDoc.doc_number}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Ngày ban hành:</span>
                    <strong className="text-slate-800">{formatDate(detailModalDoc.doc_date)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Cơ quan ban hành:</span>
                    <strong className="text-slate-800">{detailModalDoc.issuer}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200/60">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Phân loại văn bản:</span>
                    <strong className="text-red-800 font-bold">{detailModalDoc.doc_type}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Lĩnh vực:</span>
                    <strong className="text-slate-800">{detailModalDoc.field || 'Chuyên môn'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Độ khẩn / Độ mật:</span>
                    <strong className="text-slate-800">{detailModalDoc.urgency} • {detailModalDoc.security_level}</strong>
                  </div>
                </div>

                {/* Trích yếu đầy đủ */}
                <div className="pt-2 border-t border-slate-200/60">
                  <span className="text-slate-400 block text-[11px] font-bold uppercase mb-1">Trích yếu nội dung:</span>
                  <div className="p-3 bg-white rounded-lg border border-slate-200 text-slate-800 font-medium leading-relaxed">
                    {detailModalDoc.summary}
                  </div>
                </div>

                {/* File đính kèm */}
                {detailModalDoc.file_url && (
                  <div className="flex items-center justify-between p-2.5 bg-blue-50/80 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 text-blue-900 font-bold">
                      <Paperclip className="w-4 h-4 text-blue-700" />
                      <span>{detailModalDoc.file_name || 'Văn bản đính kèm gốc'}</span>
                    </div>
                    <a
                      href={detailModalDoc.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1 bg-blue-700 hover:bg-blue-800 text-white rounded-md font-bold text-xs flex items-center gap-1 shadow-2xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Xem / Tải file</span>
                    </a>
                  </div>
                )}
              </div>

              {/* Leader Submission Info Banner */}
              {detailModalDoc.leader_name && (
                <div className="p-3.5 bg-purple-50 rounded-xl border border-purple-200 text-xs space-y-1">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="font-bold text-purple-900 flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5 rotate-[-45deg] text-purple-700" />
                      <span>Trình Lãnh đạo chỉ đạo: <strong>{detailModalDoc.leader_name}</strong></span>
                    </span>
                    {detailModalDoc.submitted_at && (
                      <span className="text-[11px] text-purple-700 font-medium">
                        Thời gian trình: {formatDate(detailModalDoc.submitted_at)} {detailModalDoc.submitted_by_name ? `• Bởi: ${detailModalDoc.submitted_by_name}` : ''}
                      </span>
                    )}
                  </div>
                  {detailModalDoc.leader_instruction && (
                    <p className="text-purple-950 font-medium italic pt-1 border-t border-purple-200/60">
                      Ý kiến trình / chỉ đạo: "{detailModalDoc.leader_instruction}"
                    </p>
                  )}
                </div>
              )}

              {/* Dispatch History Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <Send className="w-4 h-4 text-red-700" />
                    <span>Lịch sử Phân bổ & Kết quả Thực hiện ({detailModalDoc.dispatches?.length || 0})</span>
                  </h4>
                  {isCBQL && (detailModalDoc.status === 'pending_dispatch' || detailModalDoc.status === 'submitted_to_leader') && (!detailModalDoc.dispatches || detailModalDoc.dispatches.length === 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        const docToDispatch = detailModalDoc;
                        setDetailModalDoc(null);
                        handleOpenDispatch(docToDispatch);
                      }}
                      className="text-xs font-bold text-red-700 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Phân công văn bản</span>
                    </button>
                  )}
                </div>

                {(!detailModalDoc.dispatches || detailModalDoc.dispatches.length === 0) ? (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center text-slate-400 italic">
                    Chưa có lượt phân bổ nào cho văn bản này.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {detailModalDoc.dispatches.map((disp, idx) => (
                      <div 
                        key={disp.id}
                        className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-slate-900 text-xs flex items-center gap-2 flex-wrap">
                              <span>Lần {idx + 1}: Cán bộ phụ trách: <strong className="text-red-800">{disp.assigned_user_name}</strong> ({disp.department_name || 'Đơn vị'})</span>
                              {disp.dispatch_type === 'reference' ? (
                                <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                  Đọc tham khảo
                                </span>
                              ) : (
                                <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  Xử lý nhiệm vụ
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              Phân bổ bởi: {disp.dispatched_by_name || 'Lãnh đạo'} • {formatDate(disp.dispatched_at)}
                            </div>
                          </div>
                          <div>
                            {disp.status === 'completed' ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                ✓ Hoàn thành
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800">
                                ● Đang xử lý
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Instruction */}
                        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-slate-500 font-bold block text-[11px]">Ý kiến chỉ đạo:</span>
                          <p className="text-slate-800 italic mt-0.5">{disp.instruction}</p>
                        </div>

                        {/* Linked Task & Completion Report */}
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pt-1 border-t border-slate-100">
                          <div>
                            <span className="text-slate-500">Hạn chót: <strong>{formatDate(disp.deadline)}</strong></span>
                            {disp.task_name && (
                              <span className="ml-3 text-indigo-700 font-medium">
                                Nhiệm vụ KPI: {disp.task_name} ({disp.task_status})
                              </span>
                            )}
                          </div>

                          {disp.status !== 'completed' && (
                            <button
                              type="button"
                              onClick={() => handleOpenCompleteDispatch(disp)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-[11px] transition shadow-2xs cursor-pointer"
                            >
                              Xác nhận Hoàn tất
                            </button>
                          )}
                        </div>

                        {disp.completion_note && (
                          <div className="p-2 bg-emerald-50 rounded border border-emerald-200 text-emerald-900 text-[11px]">
                            <strong>Báo cáo kết quả:</strong> {disp.completion_note} ({formatDate(disp.completed_at)})
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap">
              <div>
                {detailModalDoc.status !== 'completed' ? (
                  <button
                    type="button"
                    onClick={() => handleOpenCompleteDoc(detailModalDoc)}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Xác nhận Hoàn thành văn bản</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleReopenDoc(detailModalDoc)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Mở lại văn bản (Đang xử lý)</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setDetailModalDoc(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg text-xs transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 8. MODAL: XÁC NHẬN HOÀN TẤT XỬ LÝ (CompleteDispatchModal)             */}
      {/* ===================================================================== */}
      {completingDispatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl w-[95%] sm:max-w-md shadow-2xl border border-slate-200 p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-base">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Báo cáo Hoàn tất Xử lý Văn bản</span>
              </div>
              <button
                type="button"
                onClick={() => setCompletingDispatch(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitCompleteDispatch} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Báo cáo kết quả xử lý / Số hiệu văn bản phản hồi
                </label>
                <textarea
                  required
                  rows={3}
                  value={completionNote}
                  onChange={(e) => setCompletionNote(e.target.value)}
                  placeholder="Ghi rõ kết quả: Đã ban hành Kế hoạch số... / Đã hoàn thành báo cáo số..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCompletingDispatch(null)}
                  className="px-3.5 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Xác nhận hoàn thành</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 8.1. MODAL: XÁC NHẬN HOÀN THÀNH VĂN BẢN (CompleteDocModal)           */}
      {/* ===================================================================== */}
      {completingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl w-[95%] sm:max-w-md shadow-2xl border border-slate-200 p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-base">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Hoàn Tất Xử Lý Văn Bản</span>
              </div>
              <button
                type="button"
                onClick={() => setCompletingDoc(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="font-bold text-slate-800">
                Số hiệu: <span className="text-red-700">{completingDoc.doc_number}</span>
              </div>
              <p className="text-slate-600 line-clamp-2 italic">
                {completingDoc.summary}
              </p>
            </div>

            <form onSubmit={handleSubmitCompleteDoc} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Ghi chú kết quả xử lý / Nội dung thực hiện (tùy chọn)
                </label>
                <textarea
                  rows={3}
                  value={completingDocNote}
                  onChange={(e) => setCompletingDocNote(e.target.value)}
                  placeholder="Ví dụ: Đã hoàn tất xử lý theo chỉ đạo / Đã ban hành văn bản phúc đáp số... / Đã giải quyết dứt điểm nội dung."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCompletingDoc(null)}
                  className="px-3.5 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Xác nhận Hoàn thành</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 9. MODAL: QUẢN LÝ NHÓM NGƯỜI DÙNG TỰ TẠO (UserGroupManagementModal)   */}
      {/* ===================================================================== */}
      <UserGroupManagementModal
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        users={users}
        departments={departments}
        onGroupsUpdated={(g) => setUserGroups(g)}
      />
    </div>
  );
}
