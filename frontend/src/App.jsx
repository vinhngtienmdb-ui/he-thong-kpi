import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardTab from './components/DashboardTab';
import StandardTasksTab from './components/StandardTasksTab';
import DocumentManagementTab from './components/DocumentManagementTab';
import AssignmentTab from './components/AssignmentTab';
import ExecutionTab from './components/ExecutionTab';
import SelfEvaluationTab from './components/SelfEvaluationTab';
import GradingTab from './components/GradingTab';
import AdvisoryTab from './components/AdvisoryTab';
import VotingTab from './components/VotingTab';
import ChartsTab from './components/ChartsTab';
import ReportTab from './components/ReportTab';
import UsersManagementTab from './components/UsersManagementTab';
import SystemConfigTab from './components/SystemConfigTab';
import LoginScreen from './components/LoginScreen';
import { api, setViewerId } from './api';
import { Calendar, CheckCircle2 } from 'lucide-react';

const VALID_TABS = [
  'dashboard', 'standard', 'documents', 'assignment', 'execution',
  'self_eval', 'grading', 'advisory', 'voting', 'charts',
  'reports', 'users_mgmt', 'system_config'
];

function getInitialTab() {
  try {
    const hash = window.location.hash.replace(/^#/, '');
    if (hash && VALID_TABS.includes(hash)) {
      return hash;
    }
    const saved = localStorage.getItem('kpi_active_tab');
    if (saved && VALID_TABS.includes(saved)) {
      return saved;
    }
  } catch (e) {
    // ignore
  }
  return 'dashboard';
}

function getInitialPeriod() {
  try {
    return localStorage.getItem('kpi_selected_period') || '';
  } catch (e) {
    return '';
  }
}

export default function App() {
  const [currentTab, setCurrentTab] = useState(getInitialTab);
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(getInitialPeriod);
  const [users, setUsers] = useState([]);
  const [accessibleUsers, setAccessibleUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('kpi_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [departments, setDepartments] = useState([]);
  const [axes, setAxes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sidebar collapse and mobile state
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Cross-tab prefill task for assignment
  const [prefillTask, setPrefillTask] = useState(null);

  const loadInitialData = async () => {
    try {
      const [periodsData, usersData, axesData, deptsData] = await Promise.all([
        api.getPeriods(),
        api.getUsers(),
        api.getAxes(),
        api.getDepartments()
      ]);

      setPeriods(periodsData);
      const savedPeriod = localStorage.getItem('kpi_selected_period');
      const isSavedPeriodValid = periodsData.some(p => p.id === savedPeriod);

      if (isSavedPeriodValid) {
        setSelectedPeriod(savedPeriod);
      } else if (periodsData.length > 0 && !selectedPeriod) {
        const activePeriod = periodsData.find(p => p.is_active === 1 || p.is_active === true || p.status === 'active') || periodsData[0];
        setSelectedPeriod(activePeriod.id);
      }

      setUsers(usersData);
      setAxes(axesData);
      setDepartments(deptsData);

      // Đồng bộ thông tin currentUser từ server để loại bỏ triệt để cache lỗi font cũ trong localStorage
      if (currentUser?.id) {
        const freshUser = usersData.find(u => u.id === currentUser.id);
        if (freshUser) {
          setCurrentUser(freshUser);
          localStorage.setItem('kpi_user', JSON.stringify(freshUser));
        }
      }
    } catch (err) {
      console.error('Error initializing app:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('kpi_user');
    localStorage.removeItem('kpi_active_tab');
    setCurrentUser(null);
    setViewerId(null);
    setCurrentTab('dashboard');
    try {
      window.history.replaceState(null, '', '#dashboard');
    } catch (e) {}
    api.logout().catch(() => {});
  };

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setViewerId(user.id);
    loadInitialData();
  };

  const handlePeriodChange = (newPeriodId) => {
    setSelectedPeriod(newPeriodId);
    try {
      localStorage.setItem('kpi_selected_period', newPeriodId);
    } catch (e) {}
  };

  // Đồng bộ currentTab với localStorage và URL hash
  useEffect(() => {
    if (currentTab && VALID_TABS.includes(currentTab)) {
      try {
        localStorage.setItem('kpi_active_tab', currentTab);
        if (window.location.hash.replace(/^#/, '') !== currentTab) {
          window.history.replaceState(null, '', `#${currentTab}`);
        }
      } catch (e) {}
    }
  }, [currentTab]);

  // Lắng nghe sự kiện hashchange (back/forward browser hoặc thay đổi URL)
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash && VALID_TABS.includes(hash)) {
        setCurrentTab(hash);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Bảo vệ: Cán bộ không có quyền quản trị không ở lại các tab quản trị
  useEffect(() => {
    if (currentUser) {
      const canManageUsers = currentUser.role === 'admin' || currentUser.role_code === 'admin_donvi';
      const isFullAdmin = currentUser.role === 'admin' && currentUser.role_code !== 'admin_donvi';

      if (!canManageUsers && currentTab === 'users_mgmt') {
        setCurrentTab('dashboard');
      }
      if (!isFullAdmin && currentTab === 'system_config') {
        setCurrentTab('dashboard');
      }
    }
  }, [currentUser, currentTab]);

  // Đồng bộ selectedPeriod với localStorage
  useEffect(() => {
    if (selectedPeriod) {
      try {
        localStorage.setItem('kpi_selected_period', selectedPeriod);
      } catch (e) {}
    }
  }, [selectedPeriod]);

  useEffect(() => {
    loadInitialData();
  }, []);

  // Update viewer ID and accessible users when currentUser changes
  useEffect(() => {
    if (currentUser?.id) {
      setViewerId(currentUser.id);
      api.getUsers({ filter_accessible: 'true' })
        .then(accData => {
          setAccessibleUsers(accData);
        })
        .catch(err => {
          console.error('Error fetching accessible users:', err);
        });
    }
  }, [currentUser]);

  const handleReloadUsers = async () => {
    try {
      const [usersData, accData] = await Promise.all([
        api.getUsers(),
        currentUser?.id ? api.getUsers({ filter_accessible: 'true' }) : Promise.resolve([])
      ]);
      setUsers(usersData);
      if (accData && accData.length > 0) {
        setAccessibleUsers(accData);
      }
    } catch (err) {
      console.error('Error reloading users:', err);
    }
  };

  const handleReloadDepartments = async () => {
    try {
      const deptsData = await api.getDepartments();
      setDepartments(deptsData);
    } catch (err) {
      console.error('Error reloading departments:', err);
    }
  };

  const handleReloadPeriods = async () => {
    try {
      const periodsData = await api.getPeriods();
      setPeriods(periodsData);
    } catch (err) {
      console.error('Error reloading periods:', err);
    }
  };

  function handleAssignTaskFromCatalog(standardTask) {
    setPrefillTask(standardTask);
    setCurrentTab('assignment');
  }

  const currentPeriodObj = periods.find(p => p.id === selectedPeriod);

  const tabTitles = {
    dashboard: { 
      title: 'Bảng Điều Khiển Tổng Quan KPI', 
      subtitle: 'Theo dõi tiến độ thực hiện và thống kê đánh giá toàn diện cơ quan' 
    },
    standard: { 
      title: 'Danh mục công việc chuẩn', 
      subtitle: 'Khung định mức sản phẩm công việc đầu vào chuẩn hóa theo 6 trục kết quả' 
    },
    assignment: { 
      title: 'Quản lý nhiệm vụ (Giao việc & Tự đăng ký)', 
      subtitle: 'Phân công nhiệm vụ cho 1 hoặc nhiều người và phê duyệt danh mục đăng ký' 
    },
    execution: { 
      title: 'Nộp sản phẩm công việc', 
      subtitle: 'Cập nhật tiến độ, ngày hoàn thành và hồ sơ/minh chứng kèm theo' 
    },
    self_eval: {
      title: 'Tự đánh giá cuối quý (Phần I - 30 điểm)',
      subtitle: 'Cán bộ tự đánh giá 17 tiêu chuẩn chính trị, đạo đức, tác phong theo Quy định số 366-QĐ/TW'
    },
    grading: { 
      title: 'Đánh giá, nhận xét & Phê duyệt', 
      subtitle: 'CBQL thẩm định tiến độ (30%), chất lượng (70%), điểm thưởng (5%) và kết luận xếp loại' 
    },
    voting: {
      title: 'Biểu quyết xếp loại cán bộ cuối quý',
      subtitle: 'Tập thể bỏ phiếu biểu quyết tỷ lệ tín nhiệm, kiểm soát trần Hoàn thành xuất sắc ≤ 20%'
    },
    charts: {
      title: 'Biểu đồ thống kê kết quả KPI toàn đơn vị',
      subtitle: 'Phân tích cơ cấu 6 trục kết quả, tỷ lệ đúng hạn/chậm hạn, phổ điểm và cơ cấu xếp loại'
    },
    reports: { 
      title: 'Xuất báo cáo & Biểu mẫu tổng hợp', 
      subtitle: 'Biểu mẫu chuẩn Mẫu 01-A (CBQL), Mẫu 01-B (CBNV), Báo cáo công việc và Mẫu 02' 
    },
    users_mgmt: { 
      title: 'Quản lý phân quyền', 
      subtitle: 'Quản lý tài khoản, chức vụ, phân cấp vai trò Admin, CBQL, CBNV và mẫu đánh giá áp dụng' 
    },
    system_config: { 
      title: 'Cấu hình', 
      subtitle: 'Quản lý chu kỳ đánh giá hàng quý, cấu hình cây tổ chức phòng ban và các tiêu chuẩn' 
    },
  };

  const workflowSteps = [
    { step: 1, title: 'Đăng ký & Giao việc', desc: 'Cá nhân tự đăng ký hoặc LĐ giao việc', tab: 'assignment', role: 'Tất cả' },
    { step: 2, title: 'Nộp minh chứng', desc: 'Cập nhật ngày HT, file & văn bản', tab: 'execution', role: 'CBNV/LĐ' },
    { step: 3, title: 'Tự đánh giá cuối quý', desc: 'Chấm 17 tiêu chuẩn Đạo đức, chính trị (30đ)', tab: 'self_eval', role: 'Cá nhân' },
    { step: 4, title: 'Đánh giá, nhận xét', desc: 'CBQL chấm Tiến độ (30%) & Chất lượng (70%)', tab: 'grading', role: 'CBQL' },
    { step: 5, title: 'Biểu quyết tập thể', desc: 'Bỏ phiếu xếp loại & khống chế trần 20%', tab: 'voting', role: 'Tập thể' },
    { step: 6, title: 'Thống kê & Báo cáo', desc: 'Xuất Mẫu 01-A, 01-B, Mẫu 02 & Biểu đồ', tab: 'reports', role: 'Hệ thống' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-700 mx-auto"></div>
          <div className="text-sm font-semibold">Đang khởi tạo Hệ thống quản lý công việc và chấm điểm hiệu suất...</div>
        </div>
      </div>
    );
  }

  // If not logged in, display the Login Screen
  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        periods={periods}
        selectedPeriod={selectedPeriod}
        setSelectedPeriod={setSelectedPeriod}
        users={users}
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      {/* Main Area (Adjusts margin based on sidebar collapsed state) */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isCollapsed ? 'lg:ml-20' : 'lg:ml-80'} print:ml-0 print:m-0 print:p-0`}>
        
        {/* Real ICPV Header Bar */}
        <Header 
          currentUser={currentUser} 
          users={users} 
          setCurrentUser={setCurrentUser} 
          departments={departments} 
          onOpenMobileMenu={() => setMobileOpen(true)} 
          setCurrentTab={setCurrentTab}
          onLogout={handleLogout}
        />

        {/* 6-Step Evaluation Process Stepper (Hidden during print) */}
        <div className="no-print bg-white border-b border-slate-200 shadow-2xs py-2 px-3 sm:px-6 lg:px-8">
          <div className="w-full">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-700 text-white text-xs font-bold shrink-0">
                  ✓
                </span>
                <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-800 truncate">
                  Quy trình 6 bước Đánh giá KPI Hàng Quý
                </span>
                <span className="text-slate-400 text-xs hidden sm:inline truncate">
                  (Theo Hướng dẫn 06-HD/BTCTU)
                </span>
              </div>

              {/* Bộ chọn Kỳ KPI Hoạt động (Chọn Quý đang mở để đánh giá/chốt) */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200/80 border border-slate-300 rounded-lg px-2.5 py-1 text-xs transition shadow-2xs">
                  <Calendar className="w-3.5 h-3.5 text-red-700 shrink-0" />
                  <span className="font-semibold text-slate-600 hidden sm:inline">Kỳ KPI hoạt động:</span>
                  <select
                    value={selectedPeriod}
                    onChange={(e) => handlePeriodChange(e.target.value)}
                    className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer text-xs"
                    title="Chuyển đổi kỳ KPI đánh giá đang hoạt động"
                  >
                    {periods.filter(p => p.is_active === 1 || p.is_active === true).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.is_locked ? '🔒 [Đã chốt]' : '🔓 [Đang mở]'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Mobile & Tablet: Swipeable strip; Desktop (xl): 6-column grid */}
            <div className="flex xl:grid xl:grid-cols-6 gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-thin scrollbar-thumb-slate-200 snap-x snap-mandatory">
              {workflowSteps.map((ws) => {
                const isCurrent = currentTab === ws.tab;
                return (
                  <button
                    key={ws.step}
                    type="button"
                    onClick={() => setCurrentTab(ws.tab)}
                    className={`min-w-[155px] sm:min-w-[175px] xl:min-w-0 shrink-0 snap-start text-left p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                      isCurrent
                        ? 'bg-red-50/95 border-red-500 ring-2 ring-red-400/40 shadow-xs'
                        : 'bg-slate-50/80 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded ${
                        isCurrent ? 'bg-red-700 text-white shadow-2xs' : 'bg-slate-200 text-slate-700'
                      }`}>
                        Bước {ws.step}
                      </span>
                      <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase truncate">
                        {ws.role}
                      </span>
                    </div>
                    <div className={`text-xs sm:text-sm font-bold mt-1 truncate ${isCurrent ? 'text-red-900' : 'text-slate-900'}`}>
                      {ws.title}
                    </div>
                    <div className="text-[11px] text-slate-600 truncate mt-0.5">
                      {ws.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Tab Content */}
        <main className="flex-1 w-full px-2 sm:px-4 lg:px-6 py-3 sm:py-5 print:p-0 print:m-0 overflow-x-hidden">
          {currentTab === 'dashboard' && (
            <DashboardTab
              selectedPeriod={selectedPeriod}
              currentUser={currentUser}
              setCurrentTab={setCurrentTab}
              users={users}
              departments={departments}
              periods={periods}
              axes={axes}
              onReloadPeriods={loadInitialData}
              onPeriodChange={handlePeriodChange}
            />
          )}

          {currentTab === 'standard' && (
            <StandardTasksTab
              selectedPeriod={selectedPeriod}
              axes={axes}
              currentUser={currentUser}
              users={accessibleUsers.length > 0 ? accessibleUsers : users}
              departments={departments}
              onAssignTask={handleAssignTaskFromCatalog}
              setCurrentTab={setCurrentTab}
            />
          )}

          {currentTab === 'documents' && (
            <DocumentManagementTab
              currentUser={currentUser}
              periods={periods}
              selectedPeriod={selectedPeriod}
              users={accessibleUsers.length > 0 ? accessibleUsers : users}
              departments={departments}
              axes={axes}
              setCurrentTab={setCurrentTab}
            />
          )}

          {currentTab === 'assignment' && (
            <AssignmentTab
              selectedPeriod={selectedPeriod}
              currentUser={currentUser}
              users={accessibleUsers.length > 0 ? accessibleUsers : users}
              axes={axes}
              prefillTask={prefillTask}
              clearPrefillTask={() => setPrefillTask(null)}
              setCurrentTab={setCurrentTab}
            />
          )}

          {currentTab === 'execution' && (
            <ExecutionTab
              selectedPeriod={selectedPeriod}
              currentUser={currentUser}
              axes={axes}
              setCurrentTab={setCurrentTab}
            />
          )}

          {currentTab === 'self_eval' && (
            <SelfEvaluationTab
              selectedPeriod={selectedPeriod}
              currentUser={currentUser}
              users={accessibleUsers.length > 0 ? accessibleUsers : (currentUser ? [currentUser] : [])}
              setCurrentTab={setCurrentTab}
            />
          )}

          {currentTab === 'grading' && (
            <GradingTab
              selectedPeriod={selectedPeriod}
              currentUser={currentUser}
              users={accessibleUsers.length > 0 ? accessibleUsers : (currentUser ? [currentUser] : [])}
              axes={axes}
              periods={periods}
              onReloadPeriods={loadInitialData}
              onPeriodChange={handlePeriodChange}
              setCurrentTab={setCurrentTab}
            />
          )}

          {currentTab === 'advisory' && (
            <AdvisoryTab
              selectedPeriod={selectedPeriod}
              currentUser={currentUser}
              users={accessibleUsers.length > 0 ? accessibleUsers : (currentUser ? [currentUser] : [])}
              setCurrentTab={setCurrentTab}
            />
          )}

          {currentTab === 'voting' && (
            <VotingTab
              selectedPeriod={selectedPeriod}
              currentUser={currentUser}
              users={accessibleUsers.length > 0 ? accessibleUsers : (currentUser ? [currentUser] : [])}
              setCurrentTab={setCurrentTab}
            />
          )}

          {currentTab === 'charts' && (
            <ChartsTab
              selectedPeriod={selectedPeriod}
              currentUser={currentUser}
              setCurrentTab={setCurrentTab}
            />
          )}

          {currentTab === 'reports' && (
            <ReportTab
              selectedPeriod={selectedPeriod}
              onPeriodChange={setSelectedPeriod}
              periods={periods}
              currentUser={currentUser}
              users={accessibleUsers.length > 0 ? accessibleUsers : (currentUser ? [currentUser] : [])}
              departments={departments}
              axes={axes}
              setCurrentTab={setCurrentTab}
            />
          )}

          {currentTab === 'users_mgmt' && (
            <UsersManagementTab
              currentUser={currentUser}
              departments={departments}
              onReloadUsers={handleReloadUsers}
              setCurrentTab={setCurrentTab}
            />
          )}

          {currentTab === 'system_config' && (
            <SystemConfigTab
              currentPeriod={periods.find(p => p.id === selectedPeriod)}
              periods={periods}
              onReloadPeriods={handleReloadPeriods}
              users={users}
              departments={departments}
              onReloadDepartments={handleReloadDepartments}
              currentUser={currentUser}
              setCurrentTab={setCurrentTab}
            />
          )}
        </main>

        {/* Footer */}
        <footer className="no-print bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
          Hệ thống quản lý công việc và chấm điểm hiệu suất • Chuẩn hóa theo Quy định số 366-QĐ/TW & Hướng dẫn số 06-HD/BTCTU Ban Tổ chức Thành ủy
        </footer>
      </div>
    </div>
  );
}
