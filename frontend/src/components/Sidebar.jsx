import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  FileSpreadsheet, 
  UserCheck, 
  CheckSquare, 
  Award, 
  FileText, 
  Users, 
  Settings, 
  ChevronLeft, 
  ChevronRight, 
  ShieldCheck, 
  Layers, 
  ChevronDown,
  ChevronUp,
  Search,
  Vote,
  BarChart3,
  X,
  Files
} from 'lucide-react';

export default function Sidebar({ 
  currentTab, 
  setCurrentTab, 
  isCollapsed,
  setIsCollapsed,
  mobileOpen,
  setMobileOpen,
  currentUser
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({
    eval: true,
    admin: true
  });

  const toggleGroup = (key) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleTabClick = (tabId) => {
    setCurrentTab(tabId);
    if (setMobileOpen) setMobileOpen(false);
  };

  const evalModules = [
    { id: 'standard', label: 'Danh mục công việc chuẩn', icon: FileSpreadsheet },
    { id: 'documents', label: 'Quản lý & Phân bổ văn bản', icon: Files },
    { id: 'assignment', label: 'Quản lý nhiệm vụ', icon: UserCheck },
    { id: 'execution', label: 'Nộp sản phẩm công việc', icon: CheckSquare },
    { id: 'self_eval', label: 'Tự đánh giá cuối quý', icon: Award },
    { id: 'grading', label: 'Đánh giá, nhận xét', icon: ShieldCheck },
    { id: 'voting', label: 'Biểu quyết xếp loại', icon: Vote },
    { id: 'charts', label: 'Biểu đồ thống kê', icon: BarChart3 },
    { id: 'reports', label: 'Xuất báo cáo & biểu mẫu', icon: FileText }
  ];

  const adminModules = [
    { id: 'users_mgmt', label: 'Quản lý phân quyền', icon: Users },
    { id: 'system_config', label: 'Cấu hình', icon: Settings }
  ];

  const filteredEvalModules = evalModules.filter(m => 
    !searchTerm.trim() || m.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`no-print
        fixed top-0 bottom-0 left-0 z-40 text-white border-r border-red-400/30
        flex flex-col transition-all duration-300 ease-in-out shadow-2xl overflow-hidden
        bg-gradient-to-b from-[#ed1c24] via-[#db131a] to-[#be0f16]
        ${isCollapsed ? 'w-20' : 'w-80'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        
        {/* Floating Collapse / Expand Button */}
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden lg:flex absolute -right-3.5 top-20 w-7 h-7 bg-[#db131a] text-white rounded-full items-center justify-center shadow-lg border-2 border-white hover:bg-[#be0f16] transition z-50 text-xs font-bold"
          title={isCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        {/* Top Brand Header */}
        {!isCollapsed ? (
          <div className="px-4 py-3.5 border-b border-red-300/30 shrink-0 relative z-10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-white flex items-center justify-center text-xl font-bold shadow-md border-2 border-white/40 shrink-0">
                ★
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-amber-200 leading-snug">
                  Hệ thống Quản lý
                </h2>
                <p className="text-[13px] font-medium text-white leading-tight">
                  Công việc & Chấm điểm hiệu suất
                </p>
              </div>
            </div>
            {/* Mobile Close Button */}
            <button
              type="button"
              onClick={() => setMobileOpen && setMobileOpen(false)}
              className="lg:hidden p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/15 transition cursor-pointer shrink-0"
              title="Đóng thanh menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="p-3 border-b border-red-300/30 shrink-0 relative z-10 flex justify-center">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-white flex items-center justify-center text-xl font-bold shadow-md border-2 border-white/40 shrink-0 cursor-pointer" title="Hệ thống quản lý công việc và chấm điểm hiệu suất" onClick={() => setIsCollapsed(false)}>
              ★
            </div>
          </div>
        )}

        {/* Top Search Bar */}
        <div className="p-3.5 border-b border-red-300/30 shrink-0 relative z-10">
          {!isCollapsed ? (
            <div className="relative">
              <input
                type="text"
                placeholder="Tìm kiếm chức năng..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-red-950/20 border border-red-200/40 text-white placeholder-red-100/70 text-sm rounded-xl pl-9 pr-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-white/50 shadow-inner"
              />
              <Search className="w-4 h-4 text-red-100 absolute left-3 top-2.5 pointer-events-none" />
            </div>
          ) : (
            <div className="flex justify-center text-red-100 py-1">
              <Search className="w-5 h-5" />
            </div>
          )}
        </div>

        {/* Navigation Menu (Scrollable, placed above watermark) */}
        <nav className="flex-1 overflow-y-auto px-3 py-3.5 space-y-2 scrollbar-thin scrollbar-thumb-red-800 relative z-10">
          
          {/* 1. BẢNG GIÁM SÁT */}
          <button
            type="button"
            onClick={() => handleTabClick('dashboard')}
            className={`
              w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm transition-all
              ${isCollapsed ? 'justify-center px-0' : ''}
              ${currentTab === 'dashboard'
                ? 'bg-white text-slate-900 shadow-md font-semibold'
                : 'text-white/90 hover:bg-white/15 hover:text-white font-normal'
              }
            `}
            title={isCollapsed ? 'BẢNG GIÁM SÁT' : undefined}
          >
            <LayoutDashboard className={`w-5 h-5 shrink-0 ${currentTab === 'dashboard' ? 'text-[#db131a]' : 'text-red-100'}`} />
            {!isCollapsed && <span className="uppercase tracking-wider text-xs font-semibold">BẢNG GIÁM SÁT</span>}
          </button>

          {/* 2. QUẢN LÝ ĐÁNH GIÁ CÁN BỘ (8 Phân hệ Đánh giá Cốt lõi) */}
          <div className="space-y-1 pt-1">
            <button
              type="button"
              onClick={() => toggleGroup('eval')}
              className={`
                w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-sm font-semibold text-white hover:bg-white/15 transition
                ${isCollapsed ? 'justify-center px-0' : ''}
              `}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Layers className="w-5 h-5 text-amber-300 shrink-0" />
                {!isCollapsed && (
                  <span className="uppercase tracking-wider truncate font-semibold text-amber-200 text-xs">
                    QUẢN LÝ ĐÁNH GIÁ CÁN BỘ
                  </span>
                )}
              </div>
              {!isCollapsed && (
                expandedGroups.eval ? <ChevronUp className="w-4 h-4 text-red-200" /> : <ChevronDown className="w-4 h-4 text-red-200" />
              )}
            </button>

            {/* Sub-items list (The 8 Modules) */}
            {(expandedGroups.eval || isCollapsed) && (
              <div className="space-y-0.5 pl-1">
                {filteredEvalModules.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleTabClick(item.id)}
                      className={`
                        w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm transition-all text-left group
                        ${isCollapsed ? 'justify-center px-0' : ''}
                        ${isActive 
                          ? 'bg-white text-slate-900 shadow-md font-semibold' 
                          : 'text-white/85 hover:bg-white/15 hover:text-white font-normal'
                        }
                      `}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <Icon className={`w-4.5 h-4.5 shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-[#db131a]' : 'text-red-100'}`} />
                      {!isCollapsed && (
                        <span className={`truncate flex-1 leading-snug text-xs sm:text-sm ${isActive ? 'font-medium' : 'font-normal'}`}>{item.label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 8. QUẢN TRỊ HỆ THỐNG - Chỉ hiển thị cho Quản trị viên (Admin) */}
          {currentUser?.role === 'admin' && (
            <div className="pt-2.5 border-t border-red-400/30 mt-2">
              {!isCollapsed && (
                <div className="px-3.5 text-xs font-semibold tracking-wider text-amber-300 uppercase mb-1">
                  QUẢN TRỊ HỆ THỐNG
                </div>
              )}
              {adminModules.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleTabClick(item.id)}
                    className={`
                      w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm transition-all text-left group
                      ${isCollapsed ? 'justify-center px-0' : ''}
                      ${isActive 
                        ? 'bg-white text-slate-900 shadow-md font-semibold' 
                        : 'text-white/85 hover:bg-white/15 hover:text-white font-normal'
                      }
                    `}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <Icon className={`w-4.5 h-4.5 shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-[#db131a]' : 'text-red-100'}`} />
                    {!isCollapsed && (
                      <span className={`truncate flex-1 leading-snug text-xs sm:text-sm ${isActive ? 'font-medium' : 'font-normal'}`}>{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

        </nav>

        {/* Dong Son Bronze Drum & Flying Cranes Motif (Phong cách hoa văn Trống Đồng đồng bộ với Header) */}
        <div className="absolute bottom-0 left-0 right-0 h-[480px] pointer-events-none overflow-hidden z-0 select-none opacity-30">
          <svg
            className="w-full h-full text-white"
            viewBox="0 0 320 480"
            preserveAspectRatio="xMidYMax meet"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Dong Son repeating band pattern */}
              <pattern id="sidebar-dongson-band" width="40" height="8" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="4" r="2.5" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" fill="none" />
                <circle cx="10" cy="4" r="0.8" fill="rgba(254,240,138,0.7)" />
                <line x1="12.5" y1="4" x2="17.5" y2="4" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
                <circle cx="20" cy="4" r="2.5" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" fill="none" />
                <circle cx="20" cy="4" r="0.8" fill="rgba(254,240,138,0.7)" />
                <line x1="22.5" y1="4" x2="27.5" y2="4" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
                <circle cx="30" cy="4" r="2.5" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" fill="none" />
                <circle cx="30" cy="4" r="0.8" fill="rgba(254,240,138,0.7)" />
                <line x1="32.5" y1="4" x2="37.5" y2="4" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
              </pattern>

              {/* Sawtooth zigzag band */}
              <pattern id="sidebar-sawtooth-band" width="16" height="5" patternUnits="userSpaceOnUse">
                <path d="M0,5 L4,0 L8,5 L12,0 L16,5" stroke="rgba(255,255,255,0.32)" strokeWidth="0.75" fill="none" />
              </pattern>

              <radialGradient id="sidebarDrumAura" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fef08a" stopOpacity="0.28" />
                <stop offset="45%" stopColor="#f43f5e" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#991b1b" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Aura glow behind the drum */}
            <circle cx="160" cy="330" r="170" fill="url(#sidebarDrumAura)" />

            {/* Ascending Cranes (Đàn chim Lạc Đông Sơn bay vút lên cao dọc thân Sidebar) */}
            <g fill="rgba(255,255,255,0.32)">
              {/* Crane 1 - High soaring */}
              <g transform="translate(195, 35) rotate(-32) scale(0.75)">
                <path d="M-10,-2 Q-2,-8 12,-3 Q4,-1 1,-1 Q6,3 10,6 Q2,4 -3,2 Q-6,5 -10,6 Q-7,2 -10,-2 Z" />
              </g>
              {/* Crane 2 - Mid left */}
              <g transform="translate(75, 85) rotate(-22) scale(0.9)">
                <path d="M-12,-2 Q-3,-9 14,-3 Q5,-1 1,-1 Q7,4 12,7 Q3,5 -3,3 Q-7,6 -12,7 Q-9,2 -12,-2 Z" />
              </g>
              {/* Crane 3 - Mid right */}
              <g transform="translate(225, 140) rotate(-38) scale(1.05)">
                <path d="M-12,-2 Q-3,-9 14,-3 Q5,-1 1,-1 Q7,4 12,7 Q3,5 -3,3 Q-7,6 -12,7 Q-9,2 -12,-2 Z" />
              </g>
              {/* Crane 4 - Lower leader taking flight */}
              <g transform="translate(85, 195) rotate(-25) scale(1.2)">
                <path d="M-14,-3 Q-4,-11 16,-4 Q6,-2 2,-2 Q8,5 14,8 Q4,6 -4,3 Q-8,7 -14,8 Q-10,3 -14,-3 Z" />
              </g>
            </g>

            {/* Grand Dong Son Bronze Drum (Trống Đồng Đông Sơn trung tâm đáy Sidebar) */}
            <g transform="translate(160, 330)" stroke="rgba(255,255,255,0.3)">
              {/* Concentric Circles Rings */}
              <circle r="162" strokeWidth="1.4" fill="none" />
              <circle r="150" strokeWidth="0.8" strokeDasharray="3 3" fill="none" />
              <circle r="138" strokeWidth="1.2" fill="none" />
              <circle r="122" strokeWidth="0.8" strokeDasharray="4 2" fill="none" />
              <circle r="108" strokeWidth="1.2" fill="none" />
              <circle r="88" strokeWidth="0.8" strokeDasharray="3 3" fill="none" />
              <circle r="72" strokeWidth="1.2" fill="none" />
              <circle r="54" strokeWidth="0.8" strokeDasharray="2 2" fill="none" />
              <circle r="38" strokeWidth="1.2" fill="none" />
              <circle r="18" strokeWidth="1" fill="none" />

              {/* 14-Pointed Solar Star (Mặt trời 14 cánh biểu tượng Đông Sơn) */}
              <g fill="rgba(254,240,138,0.75)" stroke="none">
                {[...Array(14)].map((_, i) => (
                  <polygon
                    key={i}
                    points="0,-26 3.5,-6 0,0 -3.5,-6"
                    transform={`rotate(${(i * 360) / 14})`}
                  />
                ))}
              </g>

              {/* Inter-star feather / peacock motifs */}
              <g fill="rgba(255,255,255,0.32)" stroke="none">
                {[...Array(14)].map((_, i) => (
                  <polygon
                    key={i}
                    points="0,-6 2,-11 -2,-11"
                    transform={`rotate(${(i * 360) / 14 + (360 / 28)})`}
                  />
                ))}
              </g>

              {/* Tangent Dots Ring at r=63 */}
              <g fill="rgba(254,240,138,0.5)" stroke="none">
                {[...Array(18)].map((_, i) => (
                  <circle
                    key={i}
                    cx="0"
                    cy="-63"
                    r="1.6"
                    transform={`rotate(${(i * 360) / 18})`}
                  />
                ))}
              </g>

              {/* Circling Flying Cranes (Đàn chim Lạc bay vòng quanh tâm trống ở bán kính r=98) */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
                <g key={i} transform={`rotate(${deg}) translate(98, 0)`} fill="rgba(255,255,255,0.38)" stroke="none">
                  <path d="M-10,-2 Q-2,-8 12,-3 Q4,-1 1,-1 Q6,3 10,6 Q2,4 -3,2 Q-6,5 -10,6 Q-7,2 -10,-2 Z" />
                </g>
              ))}

              {/* Sawtooth Ring at r=130 */}
              <g fill="rgba(255,255,255,0.32)" stroke="none">
                {[...Array(28)].map((_, i) => (
                  <polygon
                    key={i}
                    points="-2.5,-130 0,-135 2.5,-130"
                    transform={`rotate(${(i * 360) / 28})`}
                  />
                ))}
              </g>

              {/* Outer Tangent Dot Ring at r=144 */}
              <g fill="rgba(255,255,255,0.35)" stroke="none">
                {[...Array(24)].map((_, i) => (
                  <circle
                    key={i}
                    cx="0"
                    cy="-144"
                    r="1.4"
                    transform={`rotate(${(i * 360) / 24})`}
                  />
                ))}
              </g>
            </g>

            {/* Bottom Geometric Running Border (Khớp viền chân Header) */}
            <g>
              <line x1="0" y1="465" x2="320" y2="465" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
              <rect x="0" y="466" width="320" height="8" fill="url(#sidebar-dongson-band)" />
              <rect x="0" y="474" width="320" height="5" fill="url(#sidebar-sawtooth-band)" />
            </g>
          </svg>
        </div>

      </aside>
    </>
  );
}
