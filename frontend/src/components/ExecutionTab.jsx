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
  X
} from 'lucide-react';
import { api } from '../api';
import { formatDate, toInputDateFormat, parseDateOnly } from '../constants';

export default function ExecutionTab({ selectedPeriod, currentUser, axes }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState(null); // Task currently opening evidence modal

  // Evaluation feedback modal state (Bước 4 V6)
  const [feedbackTask, setFeedbackTask] = useState(null);
  const [evalFeedbackText, setEvalFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  // Modal form state
  const [finishDate, setFinishDate] = useState(new Date().toISOString().split('T')[0]);
  const [evidenceText, setEvidenceText] = useState('');
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [quantityPct, setQuantityPct] = useState(1.0);
  const [selfQualityPct, setSelfQualityPct] = useState(1.0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadMyTasks();
  }, [selectedPeriod, currentUser]);

  async function loadMyTasks() {
    if (!currentUser) return;
    try {
      setLoading(true);
      const data = await api.getAssignedTasks({
        period_id: selectedPeriod,
        user_id: currentUser.id
      });
      setTasks(data);
    } catch (err) {
      console.error('Error fetching my tasks:', err);
    } finally {
      setLoading(false);
    }
  }

  function openEvidenceModal(task) {
    setActiveTask(task);
    setFinishDate(task.actual_finish_date || new Date().toISOString().split('T')[0]);
    setEvidenceText(task.evidence_text || '');
    setQuantityPct(task.quantity_pct !== undefined ? task.quantity_pct : 1.0);
    setSelfQualityPct(task.quality_pct !== undefined ? task.quality_pct : 1.0);
    setEvidenceFile(null);
  }

  async function handleSubmitEvidence(e) {
    e.preventDefault();
    if (!activeTask) return;

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('actual_finish_date', finishDate);
      formData.append('evidence_text', evidenceText);
      formData.append('quantity_pct', quantityPct);
      formData.append('self_quality_pct', selfQualityPct);
      if (evidenceFile) {
        formData.append('evidence_file', evidenceFile);
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

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Nhiệm vụ của tôi & Cập nhật Minh chứng
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cán bộ: <b className="text-slate-800">{currentUser?.full_name}</b> • Cập nhật ngày hoàn thành thực tế, đính kèm văn bản minh chứng và tự đánh giá
          </p>
        </div>
        <div className="text-xs text-slate-500">
          Tổng số công việc: <span className="font-bold text-red-700">{tasks.length}</span>
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-10 text-slate-500">Đang tải nhiệm vụ...</div>
        ) : tasks.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-xl border border-slate-200 text-slate-500">
            <CheckSquare className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="font-medium text-slate-700">Chưa có công việc nào được phân công trong kỳ này.</p>
            <p className="text-xs text-slate-400 mt-1">Hãy chuyển sang tab "Giao & Đăng ký việc" để đăng ký nhiệm vụ.</p>
          </div>
        ) : (
          tasks.map((task, idx) => {
            const isApproved = task.status === 'approved';
            const isSubmitted = task.status === 'submitted';
            const isPending = task.status === 'pending_approval';

            const axisObj = axes.find(a => a.code === task.axis_code);

            return (
              <div 
                key={task.id} 
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
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Hạn chót: <b>{formatDate(task.deadline)}</b></span>
                    </span>
                    {task.actual_finish_date && (
                      <span className="flex items-center space-x-1 text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Hoàn thành: <b>{formatDate(task.actual_finish_date)}</b></span>
                      </span>
                    )}
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
                  {(task.evidence_text || task.evidence_file_name) && (
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                      {task.evidence_text && (
                        <div className="text-slate-700">
                          <span className="font-semibold text-slate-900">Minh chứng: </span>
                          {task.evidence_text}
                        </div>
                      )}
                      {task.evidence_file_url && (
                        <div className="flex items-center space-x-1.5 text-blue-700">
                          <Paperclip className="w-3.5 h-3.5" />
                          <a 
                            href={task.evidence_file_url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="font-medium hover:underline"
                          >
                            Tệp đính kèm: {task.evidence_file_name || 'Tải file minh chứng'}
                          </a>
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
                      <button
                        onClick={() => openEvidenceModal(task)}
                        className="flex items-center space-x-1.5 text-xs font-bold px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white shadow-xs transition-colors"
                        title="Nộp lại minh chứng theo yêu cầu của Lãnh đạo"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Nộp lại minh chứng</span>
                      </button>
                    ) : isSubmitted ? (
                      <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 border border-slate-200 text-xs font-semibold">
                        <Lock className="w-3 h-3 text-slate-400" />
                        <span>Đã nộp (Khóa)</span>
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
                      <button
                        onClick={() => openEvidenceModal(task)}
                        className="flex items-center space-x-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white shadow-xs transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Nộp kết quả & Minh chứng</span>
                      </button>
                    )
                  )}
                </div>

              </div>
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
                  Cập nhật Kết quả & Minh chứng Hoàn thành
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

              {/* Evidence file upload */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tệp đính kèm (PDF, Word, Ảnh văn bản có dấu)
                </label>
                <input
                  type="file"
                  accept=".pdf, .doc, .docx, .png, .jpg, .jpeg, .xlsx"
                  onChange={(e) => setEvidenceFile(e.target.files[0])}
                  className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                />
                {activeTask.evidence_file_name && !evidenceFile && (
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

              <div className="pt-3 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveTask(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-md"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold bg-red-700 hover:bg-red-800 text-white rounded-md shadow-xs flex items-center space-x-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Đang lưu...' : 'Nộp kết quả'}</span>
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
