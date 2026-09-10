import React, { useEffect, useState } from 'react';
import { 
  Vote, 
  CheckCircle2, 
  AlertTriangle, 
  Award, 
  Users, 
  Save, 
  Check, 
  BarChart, 
  FileText,
  ChevronDown,
  ChevronUp,
  Clock,
  UserCheck,
  ShieldAlert,
  Eye,
  X,
  Sparkles
} from 'lucide-react';
import { api } from '../api';

function checkIsLeader(user) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'cbql') return true;
  if (user.target_role === 'cbql') return true;
  if (user.role_code && ['admin', 'cbql_phong', 'ld_coquan', 'to_truong', 'hieu_pho'].includes(user.role_code)) return true;
  if (user.data_scope && user.data_scope !== 'personal') return true;
  try {
    const perms = typeof user.permissions === 'string' ? JSON.parse(user.permissions || '{}') : (user.permissions || {});
    if (perms.can_manage_system || perms.can_assign_tasks || perms.can_grade_tasks || perms.can_conclude_evaluation) return true;
  } catch (e) {}
  const title = `${user.gov_title || ''} ${user.party_title || ''}`.toLowerCase();
  const leaderKeywords = [
    'hiệu trưởng', 'hiệu phó', 'phó hiệu trưởng', 'giám đốc', 'phó giám đốc', 
    'trưởng phòng', 'phó phòng', 'phó trưởng phòng', 'trưởng ban', 'phó ban', 
    'tổ trưởng', 'tổ phó', 'bí thư', 'phó bí thư', 'thường trực', 'thường vụ', 
    'cấp ủy', 'chi ủy', 'chủ tịch', 'phó chủ tịch', 'quản trị'
  ];
  return leaderKeywords.some(kw => title.includes(kw));
}

function formatDateDisplay(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${hours}:${minutes} ${day}/${month}/${year}`;
}

export default function VotingTab({ selectedPeriod, currentUser, users = [], setCurrentTab }) {
  const [votingList, setVotingList] = useState([]);
  const [progressData, setProgressData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [myVotes, setMyVotes] = useState({}); // userId -> voteRank
  const [expandLeaders, setExpandLeaders] = useState(true);
  const [selectedCandidateModal, setSelectedCandidateModal] = useState(null);

  const isLeader = checkIsLeader(currentUser) || progressData?.is_viewer_eligible_leader === true;

  useEffect(() => {
    loadVoting();
  }, [selectedPeriod, currentUser]);

  async function loadVoting() {
    try {
      setLoading(true);
      setErrorMsg('');
      const [listData, progressRes] = await Promise.all([
        api.getVotingList(selectedPeriod),
        api.getVotingProgress(selectedPeriod)
      ]);
      setVotingList((listData || []).filter(item => item.role !== 'admin'));
      setProgressData(progressRes || null);

      // initialize myVotes map
      const votesMap = {};
      (listData || []).forEach(item => {
        if (item.my_vote) {
          votesMap[item.user_id] = item.my_vote;
        } else {
          votesMap[item.user_id] = item.superior_rank || item.rank_proposed || 'Hoàn thành tốt nhiệm vụ';
        }
      });
      setMyVotes(votesMap);
    } catch (err) {
      console.error('Error loading voting list:', err);
      setErrorMsg('Không thể tải dữ liệu biểu quyết: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  const handleVoteChange = (userId, rank) => {
    if (!isLeader) return;
    setMyVotes(prev => ({ ...prev, [userId]: rank }));
  };

  const handleSubmitSingleVote = async (userId) => {
    if (!isLeader) {
      alert('Chỉ cán bộ Lãnh đạo / Quản lý mới có quyền biểu quyết xếp loại!');
      return;
    }
    const voteRank = myVotes[userId];
    if (!voteRank) return;
    try {
      setSubmitting(true);
      await api.submitVote({
        period_id: selectedPeriod,
        user_id: userId,
        vote_rank: voteRank
      });
      setSuccessMsg(`Đã lưu phiếu biểu quyết thành công!`);
      setTimeout(() => setSuccessMsg(''), 3500);
      loadVoting();
    } catch (err) {
      alert('Lỗi gửi phiếu biểu quyết: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoteAll = async () => {
    if (!isLeader) {
      alert('Chỉ cán bộ Lãnh đạo / Quản lý mới có quyền biểu quyết xếp loại!');
      return;
    }
    try {
      setSubmitting(true);
      for (const item of votingList) {
        const voteRank = myVotes[item.user_id];
        if (voteRank) {
          await api.submitVote({
            period_id: selectedPeriod,
            user_id: item.user_id,
            vote_rank: voteRank
          });
        }
      }
      setSuccessMsg('Đã ghi nhận toàn bộ phiếu biểu quyết của bạn!');
      setTimeout(() => setSuccessMsg(''), 4000);
      loadVoting();
    } catch (err) {
      alert('Lỗi gửi toàn bộ phiếu: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Check 20% excellence limit
  const totalCadres = votingList.length;
  const xuatSacVotesCount = Object.values(myVotes).filter(r => r === 'Hoàn thành xuất sắc nhiệm vụ').length;
  const maxAllowedXuatSac = Math.floor(totalCadres * 0.2);
  const exceedsCap = totalCadres > 0 && xuatSacVotesCount > maxAllowedXuatSac;

  const ranks = [
    { label: 'Xuất sắc', full: 'Hoàn thành xuất sắc nhiệm vụ', color: 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100', active: 'bg-emerald-600 text-white border-emerald-600' },
    { label: 'Tốt', full: 'Hoàn thành tốt nhiệm vụ', color: 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100', active: 'bg-blue-600 text-white border-blue-600' },
    { label: 'Hoàn thành', full: 'Hoàn thành nhiệm vụ', color: 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200', active: 'bg-slate-700 text-white border-slate-700' },
    { label: 'Không HT', full: 'Không hoàn thành nhiệm vụ', color: 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100', active: 'bg-rose-600 text-white border-rose-600' },
  ];

  const totalLeaders = progressData?.total_leaders || 0;
  const votedLeadersCount = progressData?.voted_leaders_count || 0;
  const completedLeadersCount = progressData?.completed_leaders_count || 0;
  const progressPct = progressData?.progress_pct || 0;
  const totalVotePct = progressData?.total_vote_pct || 0;
  const leadersList = progressData?.leaders || [];

  return (
    <div className="space-y-4">
      {/* 1. Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2 text-xs">
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
              title="Về Bảng điều khiển"
            >
              Trang chủ
            </span>
            <span className="text-slate-400">&gt;</span>
            <span className="text-red-700 font-bold">Biểu quyết xếp loại cán bộ cuối kỳ</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isLeader ? (
            <button
              type="button"
              onClick={handleVoteAll}
              disabled={submitting || loading || votingList.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 active:bg-red-900 text-white text-xs font-bold transition shadow-sm self-end sm:self-auto disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{submitting ? 'Đang gửi...' : 'Gửi toàn bộ phiếu biểu quyết'}</span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-300 text-xs font-medium">
              <UserCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>Chế độ theo dõi kết quả</span>
            </div>
          )}
        </div>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Non-leader Notice Banner */}
      {!isLeader && (
        <div className="bg-blue-50/90 border border-blue-200 text-blue-900 p-3.5 sm:p-4 rounded-xl flex items-start gap-3 shadow-2xs">
          <ShieldAlert className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-bold text-blue-950 text-xs sm:text-sm">
              Thông báo phân định quyền biểu quyết (Dành cho Cán bộ nhân viên)
            </div>
            <p className="text-slate-600 leading-relaxed">
              Theo Quy chế đánh giá & Quy định số 366-QĐ/TW, quyền biểu quyết xếp loại thuộc về{' '}
              <strong className="text-blue-900 font-semibold">Hội đồng Lãnh đạo & Cán bộ Quản lý</strong> đơn vị. 
              Bạn đang ở chế độ xem kết quả công khai, minh bạch của Hội đồng Lãnh đạo.
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. THANH TIẾN ĐỘ BIỂU QUYẾT CỦA HỘI ĐỒNG LÃNH ĐẠO (PROMINENT PROGRESS BAR) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        {/* Header section with toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-50 text-red-700 flex items-center justify-center border border-red-200 shrink-0">
              <Vote className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                <span>TIẾN ĐỘ BIỂU QUYẾT CỦA HỘI ĐỒNG LÃNH ĐẠO</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                  {totalLeaders} Lãnh đạo
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Chỉ cán bộ có chức danh Lãnh đạo / Quản lý biểu quyết xếp loại cán bộ kỳ này
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setExpandLeaders(!expandLeaders)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 transition self-start sm:self-auto"
          >
            <span>{expandLeaders ? 'Thu gọn danh sách' : 'Xem chi tiết Hội đồng'}</span>
            {expandLeaders ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Big visual progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Tiến độ tham gia của Hội đồng:</span>
              <span className="text-red-700 font-extrabold text-sm">{votedLeadersCount}/{totalLeaders} Lãnh đạo đã biểu quyết</span>
            </div>
            <div className="font-extrabold text-sm sm:text-base text-red-700 bg-red-50 px-2.5 py-0.5 rounded-lg border border-red-200">
              {progressPct}%
            </div>
          </div>

          <div className="w-full bg-slate-100 h-3.5 sm:h-4 rounded-full overflow-hidden p-0.5 border border-slate-200">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-red-600 via-amber-500 to-emerald-600"
              style={{ width: `${Math.max(progressPct, 0)}%` }}
            />
          </div>
        </div>

        {/* 4 Quick Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 pt-1">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Hội đồng Lãnh đạo</div>
            <div className="text-lg sm:text-xl font-black text-slate-900 mt-1 flex items-baseline gap-1">
              <span>{totalLeaders}</span>
              <span className="text-xs font-medium text-slate-500">người</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 truncate">Có thẩm quyền bỏ phiếu</div>
          </div>

          <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Đã tham gia</div>
            <div className="text-lg sm:text-xl font-black text-blue-900 mt-1 flex items-baseline gap-1">
              <span>{votedLeadersCount}</span>
              <span className="text-xs font-medium text-blue-600">/ {totalLeaders}</span>
            </div>
            <div className="text-[10px] text-blue-600 mt-0.5 font-medium truncate">Tỷ lệ tham gia: {progressPct}%</div>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Hoàn tất 100%</div>
            <div className="text-lg sm:text-xl font-black text-emerald-900 mt-1 flex items-baseline gap-1">
              <span>{completedLeadersCount}</span>
              <span className="text-xs font-medium text-emerald-600">/ {totalLeaders}</span>
            </div>
            <div className="text-[10px] text-emerald-600 mt-0.5 font-medium truncate">Đã bỏ đủ mọi cán bộ</div>
          </div>

          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Tỷ lệ phiếu bầu</div>
            <div className="text-lg sm:text-xl font-black text-amber-900 mt-1 flex items-baseline gap-1">
              <span>{totalVotePct}%</span>
            </div>
            <div className="text-[10px] text-amber-700 mt-0.5 font-medium truncate">Tổng số phiếu toàn kỳ</div>
          </div>
        </div>

        {/* Detailed Leader Voters List (Ai là người biểu quyết - Hoàn toàn minh bạch) */}
        {expandLeaders && (
          <div className="pt-3 border-t border-slate-100 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-red-700" />
                <span>Danh sách Cán bộ Lãnh đạo / Quản lý biểu quyết ({leadersList.length} đồng chí):</span>
              </div>
              <span className="text-[11px] text-slate-500 font-normal">Cập nhật theo thời gian thực</span>
            </div>

            {leadersList.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl">
                Chưa có cán bộ nào được phân quyền hoặc có chức danh Lãnh đạo / Quản lý trong hệ thống.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {leadersList.map((leader) => {
                  let badge = (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>Chưa biểu quyết ({leader.votes_cast}/{leader.total_candidates})</span>
                    </span>
                  );
                  if (leader.is_completed) {
                    badge = (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span>Đã hoàn thành ({leader.votes_cast}/{leader.total_candidates})</span>
                      </span>
                    );
                  } else if (leader.has_voted) {
                    badge = (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        <Clock className="w-3 h-3 text-amber-600" />
                        <span>Đang bỏ phiếu ({leader.votes_cast}/{leader.total_candidates})</span>
                      </span>
                    );
                  }

                  const isMe = currentUser?.id === leader.id;

                  return (
                    <div
                      key={leader.id}
                      className={`p-3 rounded-xl border transition ${
                        isMe 
                          ? 'bg-red-50/40 border-red-300 ring-1 ring-red-200' 
                          : 'bg-slate-50/70 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5 truncate">
                            <span>{leader.full_name}</span>
                            {isMe && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] bg-red-700 text-white font-bold shrink-0">
                                Bạn
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-600 font-medium truncate mt-0.5">
                            {leader.gov_title || 'Lãnh đạo'}
                          </div>
                          {leader.party_title && (
                            <div className="text-[10px] text-slate-500 truncate">
                              {leader.party_title}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0">{badge}</div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-slate-200/70 flex items-center justify-between text-[10px] text-slate-500">
                        <span className="truncate">{leader.dept_name}</span>
                        {leader.last_voted_at && (
                          <span className="text-slate-600 font-medium shrink-0">
                            {formatDateDisplay(leader.last_voted_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Cap Alert Banner (20% Excellence) */}
      <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
        exceedsCap ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-slate-50 border-slate-200 text-slate-800'
      }`}>
        <div className="flex items-start gap-3">
          <Award className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-xs sm:text-sm text-slate-900">
              Quy định về Tỷ lệ Biểu quyết "Hoàn thành xuất sắc nhiệm vụ" (Tối đa 20%)
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Theo Điều 12 Quy định số 366-QĐ/TW, tổng số cán bộ xếp loại Xuất sắc không vượt quá 20% tổng số cán bộ của đơn vị.
            </p>
          </div>
        </div>

        {isLeader && (
          <div className="flex items-center gap-3 shrink-0 text-xs font-semibold bg-white px-3.5 py-2 rounded-lg border border-slate-200 shadow-2xs">
            <span>Phiếu Xuất sắc bạn đang chọn:</span>
            <span className={`px-2 py-0.5 rounded font-bold ${
              exceedsCap ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {xuatSacVotesCount} / {maxAllowedXuatSac} người (tối đa 20%)
            </span>
          </div>
        )}
      </div>

      {/* 4. Voting Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1300px] text-left text-sm border-collapse">
            <thead className="bg-slate-50/90 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3.5 w-14 text-center">STT</th>
                <th className="px-4 py-3.5 min-w-[200px]">Họ và tên cán bộ</th>
                <th className="px-4 py-3.5 min-w-[180px]">Chức vụ & Đơn vị</th>
                <th className="px-4 py-3.5 min-w-[130px] w-32 text-center">Điểm KPI (100đ)</th>
                <th className="px-4 py-3.5 min-w-[220px]">Căn cứ đề xuất (B4, B5, B6)</th>
                <th className="px-4 py-3.5 min-w-[340px]">Phiếu biểu quyết của bạn</th>
                <th className="px-4 py-3.5 min-w-[240px] text-center">Kết quả biểu quyết tập thể</th>
                <th className="px-4 py-3.5 min-w-[120px] w-28 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-slate-400 italic text-sm">
                    Đang tải danh sách biểu quyết...
                  </td>
                </tr>
              ) : votingList.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-slate-400 italic text-sm">
                    Chưa có cán bộ trong danh sách đánh giá kỳ này.
                  </td>
                </tr>
              ) : (
                votingList.map((u, idx) => {
                  const currentVote = myVotes[u.user_id];
                  const totalVotes = u.total_votes || 0;
                  const pctXs = totalVotes > 0 ? Math.round((u.votes_xuat_sac / totalVotes) * 100) : 0;

                  return (
                    <tr key={u.user_id} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3.5 text-center font-medium text-slate-500">
                        {idx + 1}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900 text-sm">{u.full_name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{u.party_title || 'Đảng viên'}</div>
                      </td>

                      <td className="px-4 py-3.5 text-slate-600">
                        <div className="font-medium text-slate-800 text-sm">{u.gov_title || 'Chuyên viên'}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{u.dept_name || 'Cơ quan'}</div>
                      </td>

                      {/* Điểm KPI */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="font-bold text-red-700 text-sm">
                          {u.total_score !== null && u.total_score !== undefined ? Number(u.total_score).toFixed(1) : 'Chưa chấm'}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          (P1: {u.part1_score || 0}đ • P2: {u.part2_score || 0}đ)
                        </div>
                      </td>

                      {/* Căn cứ đề xuất 3 cấp (B4, B5, B6) */}
                      <td className="px-4 py-3.5 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-1 text-[11px]">
                          <span className="text-slate-400">B4 (Tự đề xuất):</span>
                          <span className="font-semibold text-slate-700 truncate max-w-[130px]" title={u.rank_proposed}>
                            {u.rank_proposed ? u.rank_proposed.replace(' nhiệm vụ', '') : '--'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-1 text-[11px]">
                          <span className="text-blue-600 font-medium">B5 (Lãnh đạo):</span>
                          <span className="font-bold text-blue-700 truncate max-w-[130px]" title={u.superior_rank}>
                            {u.superior_rank ? u.superior_rank.replace(' nhiệm vụ', '') : '--'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-1 text-[11px] pt-0.5 border-t border-slate-100">
                          <span className="text-red-600 font-semibold">B6 (Tham mưu):</span>
                          {u.is_advisory_submitted === 1 ? (
                            <span className="font-bold text-red-700 truncate max-w-[130px]" title={u.advisory_rank}>
                              {u.advisory_rank ? u.advisory_rank.replace(' nhiệm vụ', '') : 'Đã thẩm tra'}
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-600 font-medium bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                              Chờ B6
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Phiếu biểu quyết của bạn */}
                      <td className="px-4 py-3.5">
                        {isLeader ? (
                          <div className="flex flex-wrap gap-1.5">
                            {ranks.map(r => {
                              const isSelected = currentVote === r.full;
                              return (
                                <button
                                  key={r.full}
                                  type="button"
                                  onClick={() => handleVoteChange(u.user_id, r.full)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                                    isSelected 
                                      ? r.active + ' shadow-xs ring-1 ring-black/10' 
                                      : r.color
                                  }`}
                                >
                                  {r.label}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 text-xs italic">
                            <span>Chỉ dành cho Lãnh đạo</span>
                          </div>
                        )}
                      </td>

                      {/* Kết quả tập thể */}
                      <td className="px-4 py-3.5">
                        {totalVotes > 0 ? (
                          <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-700 font-semibold">Xuất sắc: {u.votes_xuat_sac} phiếu</span>
                              <span className="font-extrabold text-emerald-700">{pctXs}%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div className="bg-emerald-500 h-full rounded-full transition-all duration-300" style={{ width: `${pctXs}%` }} />
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                              <span>Tổng: {totalVotes} phiếu Lãnh đạo</span>
                              <button
                                type="button"
                                onClick={() => setSelectedCandidateModal(u)}
                                className="inline-flex items-center gap-1 text-red-700 hover:text-red-900 font-semibold hover:underline"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Xem ai đã bỏ phiếu</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center">
                            <span className="text-slate-400 italic text-xs">Chưa có phiếu</span>
                          </div>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="px-4 py-3.5 text-center">
                        {isLeader ? (
                          <button
                            type="button"
                            onClick={() => handleSubmitSingleVote(u.user_id)}
                            disabled={submitting}
                            className="px-3.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-700 border border-red-200 text-xs font-bold transition disabled:opacity-50"
                          >
                            Lưu phiếu
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSelectedCandidateModal(u)}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-semibold transition inline-flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Chi tiết</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. MODAL: CHI TIẾT DANH SÁCH LÃNH ĐẠO ĐÃ BIỂU QUYẾT CHO CÁN BỘ            */}
      {/* ========================================================================= */}
      {selectedCandidateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center font-bold">
                  <Vote className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    Chi tiết phiếu biểu quyết của Hội đồng Lãnh đạo
                  </h3>
                  <p className="text-xs text-slate-500">
                    Cán bộ: <strong className="text-slate-800">{selectedCandidateModal.full_name}</strong> - {selectedCandidateModal.gov_title} ({selectedCandidateModal.dept_name})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCandidateModal(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Summary Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                  <div className="text-[10px] text-emerald-700 font-semibold uppercase">Xuất sắc</div>
                  <div className="text-lg font-black text-emerald-900 mt-0.5">{selectedCandidateModal.votes_xuat_sac || 0}</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                  <div className="text-[10px] text-blue-700 font-semibold uppercase">Tốt</div>
                  <div className="text-lg font-black text-blue-900 mt-0.5">{selectedCandidateModal.votes_tot || 0}</div>
                </div>
                <div className="bg-slate-100 border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-700 font-semibold uppercase">Hoàn thành</div>
                  <div className="text-lg font-black text-slate-900 mt-0.5">{selectedCandidateModal.votes_hoan_thanh || 0}</div>
                </div>
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                  <div className="text-[10px] text-rose-700 font-semibold uppercase">Không HT</div>
                  <div className="text-lg font-black text-rose-900 mt-0.5">{selectedCandidateModal.votes_khong_ht || 0}</div>
                </div>
              </div>

              {/* Table of who voted */}
              <div className="space-y-2">
                <div className="font-bold text-xs text-slate-700">
                  Danh sách Lãnh đạo đã bỏ phiếu ({selectedCandidateModal.voters_breakdown?.length || 0} phiếu):
                </div>

                {(!selectedCandidateModal.voters_breakdown || selectedCandidateModal.voters_breakdown.length === 0) ? (
                  <div className="p-6 text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    Chưa có Lãnh đạo nào bỏ phiếu biểu quyết cho cán bộ này.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {selectedCandidateModal.voters_breakdown.map((vb, vidx) => {
                      let rankBadge = <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-xs">{vb.vote_rank}</span>;
                      if (vb.vote_rank === 'Hoàn thành xuất sắc nhiệm vụ') {
                        rankBadge = <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold px-2 py-0.5 rounded text-xs">Xuất sắc</span>;
                      } else if (vb.vote_rank === 'Hoàn thành tốt nhiệm vụ') {
                        rankBadge = <span className="bg-blue-100 text-blue-800 border border-blue-300 font-bold px-2 py-0.5 rounded text-xs">Tốt</span>;
                      } else if (vb.vote_rank === 'Hoàn thành nhiệm vụ') {
                        rankBadge = <span className="bg-slate-100 text-slate-800 border border-slate-300 font-bold px-2 py-0.5 rounded text-xs">Hoàn thành</span>;
                      } else if (vb.vote_rank === 'Không hoàn thành nhiệm vụ') {
                        rankBadge = <span className="bg-rose-100 text-rose-800 border border-rose-300 font-bold px-2 py-0.5 rounded text-xs">Không HT</span>;
                      }

                      return (
                        <div key={vidx} className="p-3 bg-white hover:bg-slate-50/80 transition flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 text-xs sm:text-sm">
                              {vb.voter_name}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {vb.gov_title} {vb.party_title ? `• ${vb.party_title}` : ''}
                            </div>
                            {vb.comment && (
                              <div className="text-xs text-slate-600 italic mt-1 bg-slate-50 p-1.5 rounded border border-slate-100">
                                "{vb.comment}"
                              </div>
                            )}
                          </div>

                          <div className="text-right shrink-0">
                            <div>{rankBadge}</div>
                            <div className="text-[10px] text-slate-400 mt-1">
                              {formatDateDisplay(vb.created_at)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedCandidateModal(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}