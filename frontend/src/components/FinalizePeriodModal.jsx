import React, { useState, useEffect } from 'react';
import { Lock, Unlock, Calendar, CheckCircle2, AlertTriangle, X, Sparkles, ShieldAlert } from 'lucide-react';
import { api } from '../api';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('T')[0].split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

export default function FinalizePeriodModal({
  isOpen,
  onClose,
  periods = [],
  currentPeriodId,
  onSelectPeriod,
  onReloadPeriods,
  currentUser
}) {
  // Only active periods (KPI đang hoạt động)
  const activePeriods = periods.filter(p => p.is_active === 1 || p.is_active === true);
  const [selectedId, setSelectedId] = useState(currentPeriodId || (activePeriods[0]?.id || ''));
  const [isProcessing, setIsProcessing] = useState(false);
  const [switchOnSuccess, setSwitchOnSuccess] = useState(true);

  useEffect(() => {
    if (currentPeriodId && activePeriods.some(p => p.id === currentPeriodId)) {
      setSelectedId(currentPeriodId);
    } else if (activePeriods.length > 0 && !selectedId) {
      setSelectedId(activePeriods[0].id);
    }
  }, [currentPeriodId, periods]);

  if (!isOpen) return null;

  const targetPeriod = periods.find(p => p.id === selectedId) || activePeriods[0];
  const isLocked = targetPeriod?.is_locked === 1;

  async function handleFinalize() {
    if (!targetPeriod) return;
    const confirmMsg = `XÁC NHẬN CHỐT & KHÓA SỔ KPI THEO QUÝ:\n\n👉 "${targetPeriod.name}" (${targetPeriod.code})\n\nThời hạn đánh giá: ${formatDate(targetPeriod.start_date)} đến ${formatDate(targetPeriod.end_date)}\n\nCăn cứ Quy định số 366-QĐ/TW & Hướng dẫn số 06-HD/BTCTU:\n- Toàn bộ điểm số tự đánh giá, thẩm định và kết quả chấm điểm của tất cả cán bộ trong quý sẽ được khóa sổ chính thức.\n- Tỷ lệ hoàn thành xuất sắc nhiệm vụ được bảo đảm khống chế không quá 20%.\n- Sau khi chốt, cán bộ không thể tự sửa điểm trừ khi Lãnh đạo mở khóa.\n\nBạn có chắc chắn muốn chốt KPI cho kỳ "${targetPeriod.name}"?`;
    
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsProcessing(true);
      await api.finalizePeriod(targetPeriod.id, {
        finalized_by: currentUser?.full_name || 'Lãnh đạo cơ quan'
      });
      alert(`Đã Chốt & Khóa Sổ KPI toàn cơ quan thành công cho "${targetPeriod.name}"!`);
      if (switchOnSuccess && onSelectPeriod) {
        onSelectPeriod(targetPeriod.id);
      }
      if (onReloadPeriods) await onReloadPeriods();
      onClose();
    } catch (err) {
      alert('Lỗi khi chốt KPI: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleUnfinalize() {
    if (!targetPeriod) return;
    const confirmMsg = `XÁC NHẬN MỞ KHÓA KPI CHO KỲ:\n\n👉 "${targetPeriod.name}" (${targetPeriod.code})\n\nSau khi mở khóa, Cán bộ Quản lý và Lãnh đạo có thể tiếp tục cập nhật, điều chỉnh điểm và thẩm định lại kết quả.\n\nBạn có chắc chắn muốn mở khóa cho kỳ "${targetPeriod.name}"?`;
    
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsProcessing(true);
      await api.unfinalizePeriod(targetPeriod.id);
      alert(`Đã mở khóa KPI thành công cho kỳ "${targetPeriod.name}"!`);
      if (switchOnSuccess && onSelectPeriod) {
        onSelectPeriod(targetPeriod.id);
      }
      if (onReloadPeriods) await onReloadPeriods();
      onClose();
    } catch (err) {
      alert('Lỗi khi mở khóa KPI: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-red-700 to-red-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <Lock className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold">
                Chốt & Khóa Sổ Đánh Giá KPI Theo Quý
              </h3>
              <p className="text-[11px] text-red-100">
                Quy định số 366-QĐ/TW & Hướng dẫn số 06-HD/BTCTU
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Regulatory guidance note */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 text-slate-700">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-red-600" />
              <span>Chốt KPI định kỳ theo từng Quý đánh giá</span>
            </div>
            <p className="text-[11.5px] leading-relaxed text-slate-600">
              Hệ thống đánh giá KPI được thực hiện <strong>theo Quý</strong> (Quý I, Quý II, Quý III, Quý IV). Vui lòng chọn kỳ đánh giá đang hoạt động mà đơn vị muốn <strong>Chốt kết quả</strong> hoặc <strong>Mở khóa điều chỉnh</strong>.
            </p>
          </div>

          {/* Period Selector (Choose active KPI) */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              Chọn Kỳ Đánh Giá Đang Hoạt Động Để Thao Tác *
            </label>
            <div className="space-y-2">
              {activePeriods.map(p => {
                const isSelected = p.id === selectedId;
                const pLocked = p.is_locked === 1;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition flex items-start justify-between gap-3 ${
                      isSelected
                        ? 'border-red-600 bg-red-50/50 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <input
                        type="radio"
                        name="active_period_select"
                        checked={isSelected}
                        onChange={() => setSelectedId(p.id)}
                        className="mt-0.5 text-red-600 focus:ring-red-500 w-4 h-4 cursor-pointer"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                          <span className="truncate">{p.name}</span>
                          <span className="font-mono text-[10px] bg-white px-1.5 py-0.2 rounded border border-slate-200 text-slate-600">
                            {p.code}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>Thời hạn: {formatDate(p.start_date)} - {formatDate(p.end_date)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {pLocked ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                          <Lock className="w-3 h-3" />
                          <span>Đã Chốt</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                          <Unlock className="w-3 h-3 text-blue-600" />
                          <span>Đang mở</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Period Status Card */}
          {targetPeriod && (
            <div className={`p-4 rounded-xl border ${
              isLocked ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-amber-50 border-amber-200 text-amber-950'
            }`}>
              <div className="flex items-center gap-2 text-xs font-bold">
                {isLocked ? <Lock className="w-4 h-4 text-emerald-700" /> : <Unlock className="w-4 h-4 text-amber-700" />}
                <span>Trạng thái hiện tại của {targetPeriod.name}:</span>
              </div>
              <p className="text-xs mt-1.5 leading-relaxed">
                {isLocked ? (
                  <>
                    Kỳ này <strong>ĐÃ ĐƯỢC CHỐT VÀ KHÓA SỔ</strong> toàn cơ quan. Dữ liệu điểm số và xếp loại hiện được lưu trữ chính thức.
                    {targetPeriod.finalized_at && (
                      <span className="block mt-0.5 text-[11px] text-emerald-800">
                        Thời điểm chốt: {formatDate(targetPeriod.finalized_at)} {targetPeriod.finalized_by ? `(bởi ${targetPeriod.finalized_by})` : ''}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    Kỳ này <strong>ĐANG MỞ ĐÁNH GIÁ</strong>. Cán bộ nhân viên đang nộp sản phẩm, tự đánh giá và CBQL đang thẩm định điểm số.
                  </>
                )}
              </p>
            </div>
          )}

          {/* Switch current period checkbox */}
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={switchOnSuccess}
              onChange={(e) => setSwitchOnSuccess(e.target.checked)}
              className="rounded text-red-600 focus:ring-red-500 w-4 h-4 cursor-pointer"
            />
            <span>Đồng thời chuyển màn hình làm việc sang kỳ này sau khi thao tác</span>
          </label>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            Đóng
          </button>

          {isLocked ? (
            <button
              type="button"
              onClick={handleUnfinalize}
              disabled={isProcessing}
              className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Unlock className="w-4 h-4" />
              <span>{isProcessing ? 'Đang mở khóa...' : `Mở khóa KPI (${targetPeriod?.name || 'Quý'})`}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinalize}
              disabled={isProcessing}
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Lock className="w-4 h-4" />
              <span>{isProcessing ? 'Đang chốt...' : `Xác nhận Chốt KPI (${targetPeriod?.name || 'Quý'})`}</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
