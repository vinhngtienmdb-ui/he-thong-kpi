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
  FileText 
} from 'lucide-react';
import { api } from '../api';

export default function VotingTab({ selectedPeriod, currentUser, users = [] }) {
  const [votingList, setVotingList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [myVotes, setMyVotes] = useState({}); // userId -> voteRank

  useEffect(() => {
    loadVoting();
  }, [selectedPeriod, currentUser]);

  async function loadVoting() {
    try {
      setLoading(true);
      const data = await api.getVotingList(selectedPeriod);
      setVotingList(data || []);

      // initialize myVotes map
      const votesMap = {};
      (data || []).forEach(item => {
        if (item.my_vote) {
          votesMap[item.user_id] = item.my_vote;
        } else {
          votesMap[item.user_id] = item.superior_rank || item.rank_proposed || 'Hoàn thành tốt nhiệm vụ';
        }
      });
      setMyVotes(votesMap);
    } catch (err) {
      console.error('Error loading voting list:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleVoteChange = (userId, rank) => {
    setMyVotes(prev => ({ ...prev, [userId]: rank }));
  };

  const handleSubmitSingleVote = async (userId) => {
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
      setTimeout(() => setSuccessMsg(''), 3000);
      loadVoting();
    } catch (err) {
      alert('Lỗi gửi phiếu biểu quyết: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoteAll = async () => {
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
      setSuccessMsg('Đã ghi nhận toàn bộ phiếu biểu quyết!');
      setTimeout(() => setSuccessMsg(''), 3500);
      loadVoting();
    } catch (err) {
      alert('Lỗi gửi phiếu: ' + err.message);
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
    { label: 'Xuất sắc', full: 'Hoàn thành xuất sắc nhiệm vụ', color: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    { label: 'Tốt', full: 'Hoàn thành tốt nhiệm vụ', color: 'bg-blue-50 text-blue-700 border-blue-300' },
    { label: 'Hoàn thành', full: 'Hoàn thành nhiệm vụ', color: 'bg-slate-100 text-slate-700 border-slate-300' },
    { label: 'Không HT', full: 'Không hoàn thành nhiệm vụ', color: 'bg-rose-50 text-rose-700 border-rose-300' },
  ];

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
            <span className="text-red-700 font-bold">Biểu quyết xếp loại cán bộ cuối quý</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleVoteAll}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-bold transition shadow-sm self-end sm:self-auto"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{submitting ? 'Đang gửi...' : 'Gửi toàn bộ phiếu biểu quyết'}</span>
        </button>
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 2. Cap Alert Banner */}
      <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
        exceedsCap ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-blue-50 border-blue-200 text-blue-900'
      }`}>
        <div className="flex items-start gap-3">
          <Vote className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-xs sm:text-sm">
              Quy định về Tỷ lệ Biểu quyết "Hoàn thành xuất sắc nhiệm vụ" (Tối đa 20%)
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Theo Điều 12 Quy định số 366-QĐ/TW, tổng số cán bộ xếp loại Xuất sắc không vượt quá 20% tổng số cán bộ của đơn vị.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-xs font-semibold bg-white px-3.5 py-2 rounded-lg border border-slate-200 shadow-2xs">
          <span>Đang chọn Xuất sắc:</span>
          <span className={`px-2 py-0.5 rounded font-semibold ${
            exceedsCap ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {xuatSacVotesCount} / {maxAllowedXuatSac} người (tối đa 20%)
          </span>
        </div>
      </div>

      {/* 3. Voting Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1300px] text-left text-sm border-collapse">
            <thead className="bg-slate-50/90 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3.5 w-14 text-center">STT</th>
                <th className="px-4 py-3.5 min-w-[220px]">Họ và tên cán bộ</th>
                <th className="px-4 py-3.5 min-w-[200px]">Chức vụ & Đơn vị</th>
                <th className="px-4 py-3.5 min-w-[150px] w-36 text-center">Điểm KPI (100đ)</th>
                <th className="px-4 py-3.5 min-w-[340px]">Phiếu biểu quyết của bạn</th>
                <th className="px-4 py-3.5 min-w-[240px] text-center">Kết quả tập thể</th>
                <th className="px-4 py-3.5 min-w-[120px] w-28 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-12 text-slate-400 italic text-sm">
                    Đang tải danh sách biểu quyết...
                  </td>
                </tr>
              ) : votingList.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-12 text-slate-400 italic text-sm">
                    Chưa có cán bộ trong danh sách đánh giá.
                  </td>
                </tr>
              ) : (
                votingList.map((u, idx) => {
                  const currentVote = myVotes[u.user_id];
                  const totalVotes = u.total_votes || 0;
                  const pctXs = totalVotes > 0 ? Math.round((u.votes_xuat_sac / totalVotes) * 100) : 0;
                  const pctTot = totalVotes > 0 ? Math.round((u.votes_tot / totalVotes) * 100) : 0;

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
                        <div className="text-xs text-slate-400 mt-0.5">{u.dept_name}</div>
                      </td>

                      {/* Điểm KPI */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="font-semibold text-red-700 text-sm">
                          {u.total_score !== null && u.total_score !== undefined ? Number(u.total_score).toFixed(1) : 'Chưa chấm'}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          (P1: {u.part1_score || 0}đ • P2: {u.part2_score || 0}đ)
                        </div>
                      </td>

                      {/* Phiếu của bạn */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-2">
                          {ranks.map(r => {
                            const isSelected = currentVote === r.full;
                            return (
                              <button
                                key={r.full}
                                type="button"
                                onClick={() => handleVoteChange(u.user_id, r.full)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                                  isSelected 
                                    ? 'bg-red-700 text-white border-red-700 shadow-xs' 
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {r.label}
                              </button>
                            );
                          })}
                        </div>
                      </td>

                      {/* Kết quả tập thể */}
                      <td className="px-4 py-3.5">
                        {totalVotes > 0 ? (
                          <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-600 font-medium">Xuất sắc: {u.votes_xuat_sac} phiếu</span>
                              <span className="font-bold text-emerald-700">{pctXs}%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${pctXs}%` }} />
                            </div>
                            <div className="text-xs text-slate-400">
                              Tổng cộng: {totalVotes} phiếu đã bỏ
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-xs">Chưa có phiếu</span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="px-4 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleSubmitSingleVote(u.user_id)}
                          className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold transition"
                        >
                          Lưu phiếu
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}