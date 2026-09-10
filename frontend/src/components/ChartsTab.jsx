import React, { useEffect, useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  PieChart, 
  Clock, 
  Award, 
  CheckCircle2, 
  Layers, 
  Users,
  Target
} from 'lucide-react';
import { api } from '../api';

export default function ChartsTab({ selectedPeriod, currentUser, setCurrentTab }) {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCharts();
  }, [selectedPeriod, currentUser]);

  async function loadCharts() {
    try {
      setLoading(true);
      const data = await api.getChartsStats(selectedPeriod);
      setChartData(data);
    } catch (err) {
      console.error('Error loading charts:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-700 mx-auto mb-2"></div>
        Đang tổng hợp số liệu biểu đồ KPI...
      </div>
    );
  }

  const byAxis = chartData?.byAxis || [];
  const onTimeStats = chartData?.onTimeStats || {};
  const scoreDist = chartData?.scoreDistribution || [];
  const rankDist = chartData?.rankDistribution || [];
  const totalEvaluated = chartData?.totalEvaluated || 0;

  // Max task count for axis bar width calculation
  const maxAxisTasks = Math.max(...byAxis.map(a => a.task_count), 1);
  const maxScoreCount = Math.max(...scoreDist.map(s => s.count), 1);

  return (
    <div className="space-y-6">
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
        <div className="flex items-center gap-1 font-semibold">
          <span 
            onClick={() => setCurrentTab ? setCurrentTab('dashboard') : null}
            className="text-slate-500 hover:text-red-700 cursor-pointer transition"
            title="Về Bảng điều khiển"
          >
            Trang chủ
          </span>
          <span className="text-slate-400">&gt;</span>
          <span className="text-red-700 font-bold">Biểu đồ thống kê kết quả KPI toàn đơn vị</span>
        </div>
      </div>

      {/* 2. Key Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase">Cán bộ đánh giá</span>
            <Users className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">
            {totalEvaluated} <span className="text-xs text-slate-400 font-normal">người</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Thuộc phạm vi quản lý đơn vị</p>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase">Tiến độ hoàn thành</span>
            <Clock className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-2">
            {onTimeStats.onTimePct || 100}%
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {onTimeStats.onTime || 0} đúng hạn / {onTimeStats.totalCompleted || 0} việc đã nộp
          </p>
        </div>

        {/* Metric 3 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase">Đạt loại Xuất sắc</span>
            <Award className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 mt-2">
            {rankDist.find(r => r.rank.includes('xuất sắc'))?.count || 0}
            <span className="text-xs text-slate-400 font-normal"> / {Math.floor(totalEvaluated * 0.2)} trần</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Kiểm soát trần $\le 20\%$ đơn vị</p>
        </div>

        {/* Metric 4 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase">Trọng tâm nhiệm vụ</span>
            <Target className="w-5 h-5 text-red-600" />
          </div>
          <div className="text-2xl font-bold text-red-700 mt-2">
            6 <span className="text-xs text-slate-400 font-normal">Trục kết quả</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Chuẩn hóa theo Hướng dẫn 06</p>
        </div>
      </div>

      {/* 3. Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Chart 1: Cơ cấu 6 Trục (7 cols) */}
        <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-red-700" />
                <span>Cơ cấu Công việc theo 6 Trục Kết quả Trọng tâm</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Số lượng nhiệm vụ và tổng điểm quy đổi đạt được theo từng nhóm nội dung
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            {byAxis.map((ax, idx) => {
              const widthPct = Math.round((ax.task_count / maxAxisTasks) * 100);
              return (
                <div key={ax.code} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">
                      Trục {idx + 1}: {ax.name.replace(`TRỤC ${idx + 1} - `, '')}
                    </span>
                    <span className="font-bold text-red-700">
                      {ax.task_count} việc ({ax.total_converted_score}đ)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex">
                    <div 
                      className="bg-gradient-to-r from-red-700 to-rose-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(widthPct, 4)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 2: Tỷ lệ Đúng hạn & Phổ điểm (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Box 1: Đúng hạn vs Trễ hạn */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
              <Clock className="w-4 h-4 text-emerald-700" />
              <span>Tiến độ Hoàn thành Công việc</span>
            </h3>

            <div className="grid grid-cols-2 gap-3 text-center pt-2">
              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                <div className="text-2xl font-bold text-emerald-800">
                  {onTimeStats.onTime || 0}
                </div>
                <div className="text-xs font-medium text-emerald-700 mt-1">Đúng / Trước hạn</div>
                <div className="text-[10px] text-emerald-600 mt-0.5">{onTimeStats.onTimePct || 100}%</div>
              </div>

              <div className="bg-rose-50 p-3 rounded-xl border border-rose-200">
                <div className="text-2xl font-bold text-rose-800">
                  {onTimeStats.late || 0}
                </div>
                <div className="text-xs font-medium text-rose-700 mt-1">Chậm tiến độ</div>
                <div className="text-[10px] text-rose-600 mt-0.5">
                  {100 - (onTimeStats.onTimePct || 100)}%
                </div>
              </div>
            </div>
          </div>

          {/* Box 2: Phân bố Xếp loại */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
              <Award className="w-4 h-4 text-amber-600" />
              <span>Cơ cấu Xếp loại Cán bộ</span>
            </h3>

            <div className="space-y-2 pt-1">
              {rankDist.map(r => {
                const pct = totalEvaluated > 0 ? Math.round((r.count / totalEvaluated) * 100) : 0;
                const isXs = r.rank.includes('xuất sắc');
                return (
                  <div key={r.rank} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-700 font-medium">{r.rank}</span>
                      <span className="font-semibold text-slate-900">{r.count} người ({pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          isXs ? 'bg-amber-500' :
                          r.rank.includes('tốt') ? 'bg-blue-600' :
                          r.rank.includes('Không') ? 'bg-rose-600' : 'bg-slate-500'
                        }`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>

      {/* 4. Score Distribution Histogram */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <BarChart3 className="w-4 h-4 text-indigo-700" />
          <span>Phổ điểm Đánh giá KPI Cán bộ Toàn Đơn vị (Thang điểm 100)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2">
          {scoreDist.map(s => {
            const pct = maxScoreCount > 0 ? Math.round((s.count / maxScoreCount) * 100) : 0;
            return (
              <div key={s.range} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-center">
                <span className="text-xs font-semibold text-slate-700 block">{s.range}</span>
                <div className="text-2xl font-bold text-slate-900">{s.count}</div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-indigo-600 h-full rounded-full" 
                    style={{ width: `${Math.max(pct, 4)}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-400 block">Số lượng cán bộ</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}