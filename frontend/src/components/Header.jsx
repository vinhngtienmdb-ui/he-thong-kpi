import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, 
  Moon, 
  Sun, 
  HelpCircle, 
  ChevronDown, 
  ChevronRight,
  Menu,
  Check, 
  CheckCheck, 
  Trash2, 
  ExternalLink, 
  BookOpen, 
  Calculator, 
  HelpCircle as FaqIcon, 
  PhoneCall, 
  Clock, 
  AlertTriangle, 
  FileCheck2, 
  Vote, 
  Sparkles, 
  Layers, 
  X, 
  FileText,
  User,
  ClipboardList,
  History,
  Shield,
  ShieldCheck,
  LogOut,
  Users,
  Search,
  CheckCircle2,
  Building2,
  Mail,
  Phone,
  Briefcase,
  Award,
  ArrowRight,
  Calendar,
  KeyRound,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';
import { formatDate } from '../constants';
import { api } from '../api';

export default function Header({ 
  currentUser, 
  users = [], 
  setCurrentUser, 
  departments = [], 
  onOpenMobileMenu,
  setCurrentTab,
  onLogout
}) {
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [isDark, setIsDark] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpActiveTab, setHelpActiveTab] = useState('process'); // 'process' | 'formula' | 'faq' | 'contact'
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showChangelogModal, setShowChangelogModal] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState('');
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');

  const notifRef = useRef(null);
  const userMenuRef = useRef(null);

  // Notifications State (Clean empty state for production)
  const [notifications, setNotifications] = useState([]);

  // Realtime Clock & Date
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      setTimeStr(`${hours}:${minutes}:${seconds}`);

      const days = ['CHỦ NHẬT', 'THỨ HAI', 'THỨ BA', 'THỨ TƯ', 'THỨ NĂM', 'THỨ SÁU', 'THỨ BẢY'];
      const dayName = days[now.getDay()];
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      setDateStr(`${dayName}, ${day}/${month}/${year}`);
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Dark Mode Initialization & Sync
  useEffect(() => {
    const savedTheme = localStorage.getItem('kpi_dark_mode');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialDark = savedTheme === 'true' || (savedTheme === null && prefersDark);
    
    setIsDark(initialDark);
    if (initialDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Toggle Dark Mode
  const toggleDarkMode = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    if (newDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('kpi_dark_mode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('kpi_dark_mode', 'false');
    }
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotificationsDropdown(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadNotifsCount = notifications.filter(n => !n.read).length;

  const markAllNotifsAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const handleNotificationClick = (notif) => {
    // Mark as read
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
    setShowNotificationsDropdown(false);
    if (notif.tab && setCurrentTab) {
      setCurrentTab(notif.tab);
    }
  };

  const closeChangePasswordModal = () => {
    setShowChangePasswordModal(false);
    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmPasswordInput('');
    setShowCurrentPass(false);
    setShowNewPass(false);
    setShowConfirmPass(false);
    setPasswordChangeError('');
    setPasswordChangeSuccess('');
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordChangeError('');
    setPasswordChangeSuccess('');

    if (!currentPasswordInput || !newPasswordInput || !confirmPasswordInput) {
      setPasswordChangeError('Vui lòng điền đầy đủ các trường mật khẩu');
      return;
    }

    if (newPasswordInput.length < 6) {
      setPasswordChangeError('Mật khẩu mới phải có tối thiểu 6 ký tự');
      return;
    }

    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordChangeError('Mật khẩu xác nhận không trùng khớp với mật khẩu mới');
      return;
    }

    if (currentPasswordInput === newPasswordInput) {
      setPasswordChangeError('Mật khẩu mới không được trùng với mật khẩu hiện tại');
      return;
    }

    setPasswordChangeLoading(true);
    try {
      const res = await api.changePassword({
        current_password: currentPasswordInput,
        new_password: newPasswordInput,
        confirm_password: confirmPasswordInput
      });
      setPasswordChangeSuccess(res.message || 'Đổi mật khẩu thành công!');
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      setTimeout(() => {
        closeChangePasswordModal();
      }, 2000);
    } catch (err) {
      setPasswordChangeError(err.message || 'Đã có lỗi xảy ra khi đổi mật khẩu');
    } finally {
      setPasswordChangeLoading(false);
    }
  };

  const currentDept = departments.find(d => d.id === currentUser?.dept_id);
  const unitName = currentDept?.name || currentUser?.dept_name || 'BAN TỔ CHỨC THÀNH ỦY TP. HỒ CHÍ MINH';

  const userInitial = currentUser?.full_name 
    ? currentUser.full_name.split(' ').pop().charAt(0).toUpperCase() 
    : 'N';

  return (
    <>
      <header className="no-print h-16 lg:h-18 sticky top-0 z-40 shadow-md border-b border-red-300/40 relative flex items-center justify-between px-3 sm:px-6 bg-gradient-to-r from-[#ed1c24] via-[#f43f5e] via-45% to-[#fce7f3] select-none">
        
        {/* Background Dong Son Bronze Drum Motif Ribbon (Dải hoa văn Trống Đồng chạy xuyên suốt) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
          <svg 
            className="w-full h-full object-cover" 
            viewBox="0 0 1600 72" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
          >
            <defs>
              {/* Repeating Dong Son geometric band pattern for top & bottom borders */}
              <pattern id="dongson-band" width="40" height="8" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="4" r="2.5" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" fill="none" />
                <circle cx="10" cy="4" r="0.8" fill="rgba(255,255,255,0.45)" />
                <line x1="12.5" y1="4" x2="17.5" y2="4" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
                <circle cx="20" cy="4" r="2.5" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" fill="none" />
                <circle cx="20" cy="4" r="0.8" fill="rgba(255,255,255,0.45)" />
                <line x1="22.5" y1="4" x2="27.5" y2="4" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
                <circle cx="30" cy="4" r="2.5" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" fill="none" />
                <circle cx="30" cy="4" r="0.8" fill="rgba(255,255,255,0.45)" />
                <line x1="32.5" y1="4" x2="37.5" y2="4" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
              </pattern>

              {/* Saw-tooth zigzag pattern */}
              <pattern id="sawtooth-band" width="16" height="5" patternUnits="userSpaceOnUse">
                <path d="M0,5 L4,0 L8,5 L12,0 L16,5" stroke="rgba(255,255,255,0.32)" strokeWidth="0.75" fill="none" />
              </pattern>
            </defs>

            {/* Top Running Border */}
            <rect x="0" y="0" width="1600" height="5" fill="url(#sawtooth-band)" />
            <rect x="0" y="5" width="1600" height="8" fill="url(#dongson-band)" />
            <line x1="0" y1="13" x2="1600" y2="13" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />

            {/* Bottom Running Border */}
            <line x1="0" y1="59" x2="1600" y2="59" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
            <rect x="0" y="60" width="1600" height="8" fill="url(#dongson-band)" />
            <rect x="0" y="67" width="1600" height="5" fill="url(#sawtooth-band)" />

            {/* DRUM 1 (Left - center at x=320, y=36) */}
            <g transform="translate(320, 36)" stroke="rgba(255,255,255,0.25)">
              <circle r="160" strokeWidth="1.2" fill="none" />
              <circle r="138" strokeWidth="0.8" strokeDasharray="3 3" fill="none" />
              <circle r="118" strokeWidth="1.2" fill="none" />
              <circle r="98" strokeWidth="0.8" strokeDasharray="4 2" fill="none" />
              <circle r="78" strokeWidth="1.2" fill="none" />
              <circle r="58" strokeWidth="0.8" strokeDasharray="2 2" fill="none" />
              <circle r="38" strokeWidth="1.2" fill="none" />
              <circle r="18" strokeWidth="1" fill="none" />

              {/* 14-Pointed Solar Star */}
              <g fill="rgba(255,255,255,0.35)">
                {[...Array(14)].map((_, i) => (
                  <polygon
                    key={i}
                    points="0,-24 3,-5 0,0 -3,-5"
                    transform={`rotate(${(i * 360) / 14})`}
                  />
                ))}
              </g>

              {/* Flying Cranes on ring r=108 */}
              {[0, 60, 120, 180, 240, 300].map((deg, i) => (
                <g key={i} transform={`rotate(${deg}) translate(108, 0)`} fill="rgba(255,255,255,0.28)">
                  <path d="M-10,-2 Q-2,-8 12,-3 Q4,-1 1,-1 Q6,3 10,6 Q2,4 -3,2 Q-6,5 -10,6 Q-7,2 -10,-2 Z" />
                </g>
              ))}
            </g>

            {/* DRUM 2 (Center - center at x=850, y=36) */}
            <g transform="translate(850, 36)" stroke="rgba(255,255,255,0.22)">
              <circle r="145" strokeWidth="1.2" fill="none" />
              <circle r="125" strokeWidth="0.8" strokeDasharray="3 3" fill="none" />
              <circle r="105" strokeWidth="1.2" fill="none" />
              <circle r="85" strokeWidth="0.8" strokeDasharray="4 2" fill="none" />
              <circle r="65" strokeWidth="1.2" fill="none" />
              <circle r="45" strokeWidth="0.8" strokeDasharray="2 2" fill="none" />
              <circle r="25" strokeWidth="1" fill="none" />

              <g fill="rgba(255,255,255,0.3)">
                {[...Array(14)].map((_, i) => (
                  <polygon
                    key={i}
                    points="0,-22 3,-4 0,0 -3,-4"
                    transform={`rotate(${(i * 360) / 14})`}
                  />
                ))}
              </g>

              {[30, 90, 150, 210, 270, 330].map((deg, i) => (
                <g key={i} transform={`rotate(${deg}) translate(95, 0)`} fill="rgba(255,255,255,0.25)">
                  <path d="M-9,-2 Q-2,-7 10,-3 Q3,-1 1,-1 Q5,3 9,5 Q2,3 -3,2 Q-5,4 -9,5 Q-6,2 -9,-2 Z" />
                </g>
              ))}
            </g>

            {/* DRUM 3 (Right - center at x=1380, y=36) */}
            <g transform="translate(1380, 36)" stroke="rgba(185,28,28,0.18)">
              <circle r="150" strokeWidth="1.2" fill="none" />
              <circle r="128" strokeWidth="0.8" strokeDasharray="3 3" fill="none" />
              <circle r="108" strokeWidth="1.2" fill="none" />
              <circle r="88" strokeWidth="0.8" strokeDasharray="4 2" fill="none" />
              <circle r="68" strokeWidth="1.2" fill="none" />
              <circle r="48" strokeWidth="0.8" strokeDasharray="2 2" fill="none" />
              <circle r="28" strokeWidth="1" fill="none" />

              <g fill="rgba(185,28,28,0.22)">
                {[...Array(14)].map((_, i) => (
                  <polygon
                    key={i}
                    points="0,-22 3,-4 0,0 -3,-4"
                    transform={`rotate(${(i * 360) / 14})`}
                  />
                ))}
              </g>

              {[0, 60, 120, 180, 240, 300].map((deg, i) => (
                <g key={i} transform={`rotate(${deg}) translate(98, 0)`} fill="rgba(185,28,28,0.2)">
                  <path d="M-9,-2 Q-2,-7 10,-3 Q3,-1 1,-1 Q5,3 9,5 Q2,3 -3,2 Q-5,4 -9,5 Q-6,2 -9,-2 Z" />
                </g>
              ))}
            </g>

            {/* Continuous Flying Cranes across the ribbon */}
            <g fill="rgba(255,255,255,0.22)">
              <path d="M80,30 Q92,20 110,26 Q98,28 94,28 Q100,34 106,38 Q95,35 88,32 Q84,36 78,38 Q83,32 80,30 Z" />
              <path d="M560,26 Q572,16 590,22 Q578,24 574,24 Q580,30 586,34 Q575,31 568,28 Q564,32 558,34 Q563,28 560,26 Z" />
              <path d="M1120,24 Q1132,14 1150,20 Q1138,22 1134,22 Q1140,28 1146,32 Q1135,29 1128,26 Q1124,30 1118,32 Q1123,26 1120,24 Z" />
            </g>
          </svg>
        </div>

        {/* Left Unit Branding Area */}
        <div className="flex items-center gap-3 relative z-10">
          {/* Mobile menu trigger */}
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden p-2.5 rounded-xl bg-white/20 text-white hover:bg-white/30 transition shadow-xs"
            title="Mở menu điều hướng"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Brand Crest & Texts */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Star Crest */}
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-white flex items-center justify-center text-base sm:text-xl font-bold shadow-md border-2 border-white/40 shrink-0">
              ★
            </div>

            <div className="min-w-0">
              <div className="text-[10px] sm:text-xs font-medium text-amber-200 uppercase tracking-wider drop-shadow-xs truncate max-w-[140px] xs:max-w-[200px] sm:max-w-[340px] md:max-w-none">
                {unitName}
              </div>
              <h1 className="hidden sm:block text-xs sm:text-base font-semibold text-white drop-shadow-md leading-tight truncate tracking-tight">
                Hệ thống quản lý công việc và chấm điểm hiệu suất
              </h1>
              <div className="sm:hidden text-[11px] font-bold text-white truncate drop-shadow-sm">
                Quản lý KPI Ban Tổ chức
              </div>
            </div>
          </div>
        </div>

        {/* Right Controls & Profile Area */}
        <div className="flex items-center gap-1.5 sm:gap-3 relative z-10">
          
          {/* Realtime Clock & Vietnamese Date in Frosted Glass Pill */}
          <div className="hidden md:flex flex-col items-end px-3.5 py-1 rounded-xl bg-white/85 backdrop-blur-sm border border-white/90 shadow-2xs">
            <div className="text-sm font-semibold text-red-950 tracking-wider font-mono leading-tight">
              {timeStr || '09:16:22'}
            </div>
            <div className="text-[10px] font-medium text-red-700 uppercase tracking-tight">
              {dateStr || 'THỨ TƯ, 09/09/2026'}
            </div>
          </div>

          {/* Action Icons in Frosted Glass */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            
            {/* 1. DARK MODE TOGGLE BUTTON */}
            <button 
              type="button"
              onClick={toggleDarkMode}
              className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/85 hover:bg-white border border-white/90 shadow-2xs flex items-center justify-center transition ${
                isDark ? 'text-amber-500 hover:text-amber-600' : 'text-slate-700 hover:text-slate-900'
              }`}
              title={isDark ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Ban đêm (Dark Mode)'}
            >
              {isDark ? <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </button>

            {/* 2. NOTIFICATIONS BELL WITH DROPDOWN */}
            <div className="relative" ref={notifRef}>
              <button 
                type="button"
                onClick={() => setShowNotificationsDropdown(!showNotificationsDropdown)}
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/85 hover:bg-white text-red-900 hover:text-red-950 border border-white/90 shadow-2xs flex items-center justify-center transition relative ${
                  showNotificationsDropdown ? 'ring-2 ring-red-500 bg-white' : ''
                }`}
                title="Thông báo hệ thống"
              >
                <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {unreadNotifsCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] sm:min-w-[18px] h-[16px] sm:h-[18px] px-1 bg-red-600 text-white text-[9px] sm:text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white shadow-xs animate-pulse">
                    {unreadNotifsCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown Panel */}
              {showNotificationsDropdown && (
                <div className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 mt-2 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in duration-150 text-slate-800">
                  {/* Dropdown Header */}
                  <div className="px-4 py-3 bg-gradient-to-r from-red-700 to-red-800 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4" />
                      <span className="font-semibold text-sm">Thông báo hệ thống</span>
                      {unreadNotifsCount > 0 && (
                        <span className="px-2 py-0.2 rounded-full text-[10px] font-semibold bg-white/20 text-white">
                          {unreadNotifsCount} mới
                        </span>
                      )}
                    </div>
                    {unreadNotifsCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllNotifsAsRead}
                        className="text-[11px] font-medium text-red-100 hover:text-white underline transition flex items-center gap-1"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Đọc tất cả</span>
                      </button>
                    )}
                  </div>

                  {/* Dropdown List */}
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-xs italic">
                        Không có thông báo mới nào
                      </div>
                    ) : (
                      notifications.map(notif => (
                        <div
                          key={notif.id}
                          onClick={() => handleNotificationClick(notif)}
                          className={`p-3.5 hover:bg-slate-50 transition cursor-pointer flex gap-3 items-start ${
                            !notif.read ? 'bg-red-50/40' : ''
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-2xs ${
                            notif.type === 'task_assigned' ? 'bg-indigo-100 text-indigo-700' :
                            notif.type === 'task_approved' ? 'bg-emerald-100 text-emerald-700' :
                            notif.type === 'deadline_warning' ? 'bg-rose-100 text-rose-700' :
                            notif.type === 'voting_result' ? 'bg-purple-100 text-purple-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {notif.type === 'task_assigned' ? <Layers className="w-4 h-4" /> :
                             notif.type === 'task_approved' ? <FileCheck2 className="w-4 h-4" /> :
                             notif.type === 'deadline_warning' ? <AlertTriangle className="w-4 h-4" /> :
                             notif.type === 'voting_result' ? <Vote className="w-4 h-4" /> :
                             <Sparkles className="w-4 h-4" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <h5 className={`text-xs font-semibold truncate ${!notif.read ? 'text-red-950 font-bold' : 'text-slate-700'}`}>
                                {notif.title}
                              </h5>
                              {!notif.read && (
                                <span className="w-2 h-2 rounded-full bg-red-600 shrink-0"></span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                              {notif.message}
                            </p>
                            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1.5">
                              <span>{notif.time}</span>
                              <span className="font-semibold text-red-700 hover:underline flex items-center gap-0.5">
                                Xem ngay →
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Dropdown Footer */}
                  {notifications.length > 0 && (
                    <div className="p-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={clearAllNotifications}
                        className="text-slate-500 hover:text-rose-600 font-semibold flex items-center gap-1 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa tất cả</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNotificationsDropdown(false);
                          if (setCurrentTab) setCurrentTab('assignment');
                        }}
                        className="font-bold text-red-700 hover:underline"
                      >
                        Xem trung tâm nhiệm vụ
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. HELP & USER GUIDE MODAL TRIGGER BUTTON */}
            <button 
              type="button"
              onClick={() => setShowHelpModal(true)}
              className="w-9 h-9 rounded-full bg-white/85 hover:bg-white text-red-900 hover:text-red-950 border border-white/90 shadow-2xs flex items-center justify-center transition hidden sm:flex"
              title="Hướng dẫn sử dụng & Trợ giúp Nghiệp vụ"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>

          {/* User Profile Card & Dropdown */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="flex items-center gap-2.5 p-1 pl-3 bg-white/90 hover:bg-white border border-white/95 rounded-xl shadow-2xs transition backdrop-blur-sm cursor-pointer"
            >
              <div className="text-right hidden sm:block">
                <div className="text-sm font-semibold text-slate-900 leading-tight">
                  {currentUser?.full_name || 'Thái Thị Bích Liên'}
                </div>
                <div className="text-xs font-normal text-slate-500 truncate max-w-[170px]">
                  {currentUser?.gov_title || currentUser?.party_title || 'Phó Trưởng ban Thường trực'}
                </div>
              </div>

              {/* Dark Navy Avatar Circle */}
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-900 to-slate-900 text-white flex items-center justify-center font-semibold text-sm shadow-xs border border-white shrink-0">
                {userInitial}
              </div>

              <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 hidden sm:block ${showUserDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu - EXACTLY as shown in the uploaded screenshot plus Switch User */}
            {showUserDropdown && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 z-[100] overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-150 divide-y divide-slate-100">
                
                {/* 1. Profile mini summary & Switch User header */}
                <div className="p-3 bg-gradient-to-br from-slate-50 to-red-50/40">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-900 to-slate-900 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                      {userInitial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {currentUser?.full_name}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {currentUser?.gov_title || currentUser?.party_title || 'Cán bộ'}
                      </div>
                      <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded font-semibold mt-0.5 ${
                        currentUser?.role === 'admin' ? 'bg-rose-100 text-rose-800' :
                        currentUser?.role === 'cbql' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {currentUser?.role === 'admin' ? 'Quản trị viên' : currentUser?.role === 'cbql' ? 'Lãnh đạo / CBQL' : 'Cán bộ nhân viên'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. MENU ITEMS */}

                {/* 3. MENU ITEMS - Khớp chính xác thiết kế trong hình ảnh */}
                <div className="py-1">
                  {/* Thông tin cá nhân */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserDropdown(false);
                      setShowProfileModal(true);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-normal text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-3 transition cursor-pointer"
                  >
                    <User className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Thông tin cá nhân</span>
                  </button>

                  {/* Đổi mật khẩu */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserDropdown(false);
                      setShowChangePasswordModal(true);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-normal text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-3 transition cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Đổi mật khẩu</span>
                  </button>

                  {/* Hướng dẫn sử dụng */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserDropdown(false);
                      setShowHelpModal(true);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-normal text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-3 transition cursor-pointer"
                  >
                    <ClipboardList className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Hướng dẫn sử dụng</span>
                  </button>

                  {/* Lịch sử cập nhật */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserDropdown(false);
                      setShowChangelogModal(true);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-normal text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-3 transition cursor-pointer"
                  >
                    <History className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Lịch sử cập nhật</span>
                  </button>

                  {/* Lịch sử đồng ý */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserDropdown(false);
                      setShowConsentModal(true);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-normal text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-3 transition cursor-pointer"
                  >
                    <Shield className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Lịch sử đồng ý</span>
                  </button>
                </div>

                {/* 4. Đăng xuất */}
                <div className="py-1 bg-slate-50/50">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserDropdown(false);
                      setShowLogoutModal(true);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-700 flex items-center gap-3 transition cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Đăng xuất</span>
                  </button>
                </div>

              </div>
            )}
          </div>

        </div>
      </header>

      {/* ============================================================== */}
      {/* 3. MODAL HƯỚNG DẪN SỬ DỤNG & TRỢ GIÚP NGHIỆP VỤ                */}
      {/* ============================================================== */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in duration-200 text-slate-800 flex flex-col max-h-[90vh]">
            
            {/* Modal Top Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-red-700 via-red-800 to-red-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center font-bold text-xl shadow-xs">
                  ★
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight">
                    Trung tâm Trợ giúp & Hướng dẫn Sử dụng Hệ thống
                  </h3>
                  <p className="text-xs text-red-200 mt-0.5">
                    Chuẩn hóa theo Quy định số 366-QĐ/TW & Hướng dẫn số 06-HD/BTCTU Ban Tổ chức Thành ủy
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tab Navigation */}
            <div className="px-6 pt-3 border-b border-slate-200 bg-slate-50 flex gap-2 overflow-x-auto shrink-0">
              <button
                type="button"
                onClick={() => setHelpActiveTab('process')}
                className={`flex items-center gap-2 px-4 py-2.5 font-medium text-xs rounded-t-xl transition-all border-b-2 ${
                  helpActiveTab === 'process'
                    ? 'bg-white text-red-700 border-red-600 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 border-transparent'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Quy trình 6 bước</span>
              </button>

              <button
                type="button"
                onClick={() => setHelpActiveTab('formula')}
                className={`flex items-center gap-2 px-4 py-2.5 font-medium text-xs rounded-t-xl transition-all border-b-2 ${
                  helpActiveTab === 'formula'
                    ? 'bg-white text-red-700 border-red-600 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 border-transparent'
                }`}
              >
                <Calculator className="w-4 h-4" />
                <span>Công thức tính điểm</span>
              </button>

              <button
                type="button"
                onClick={() => setHelpActiveTab('faq')}
                className={`flex items-center gap-2 px-4 py-2.5 font-medium text-xs rounded-t-xl transition-all border-b-2 ${
                  helpActiveTab === 'faq'
                    ? 'bg-white text-red-700 border-red-600 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 border-transparent'
                }`}
              >
                <FaqIcon className="w-4 h-4" />
                <span>Câu hỏi thường gặp</span>
              </button>

              <button
                type="button"
                onClick={() => setHelpActiveTab('contact')}
                className={`flex items-center gap-2 px-4 py-2.5 font-medium text-xs rounded-t-xl transition-all border-b-2 ${
                  helpActiveTab === 'contact'
                    ? 'bg-white text-red-700 border-red-600 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 border-transparent'
                }`}
              >
                <PhoneCall className="w-4 h-4" />
                <span>Đầu mối hỗ trợ & Tài liệu</span>
              </button>
            </div>

            {/* Modal Body Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-slate-700">
              
              {/* TAB 1: QUY TRÌNH 6 BƯỚC */}
              {helpActiveTab === 'process' && (
                <div className="space-y-4">
                  <div className="bg-red-50 p-4 rounded-2xl border border-red-200">
                    <h4 className="font-bold text-red-900 text-base flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-red-600" />
                      Quy trình Đánh giá KPI Cán bộ Hàng Quý
                    </h4>
                    <p className="text-xs text-red-800 mt-1 leading-relaxed">
                      Mỗi chu kỳ quý bao gồm 6 bước thực hiện nghiêm ngặt theo đúng Hướng dẫn số 06-HD/BTCTU:
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {[
                      {
                        step: 'Bước 1',
                        name: 'Đăng ký & Giao việc',
                        desc: 'Lãnh đạo giao việc cho nhân viên hoặc cá nhân tự đề xuất đăng ký công việc kế hoạch trong quý.',
                        tab: 'assignment',
                        color: 'indigo'
                      },
                      {
                        step: 'Bước 2',
                        name: 'Nộp Minh chứng & Báo cáo',
                        desc: 'Cán bộ cập nhật ngày hoàn thành thực tế, tải file tài liệu nghiệm thu và tự đánh giá sản phẩm.',
                        tab: 'execution',
                        color: 'blue'
                      },
                      {
                        step: 'Bước 3',
                        name: 'Thẩm định & Chấm điểm',
                        desc: 'Lãnh đạo trực tiếp đánh giá Tiến độ (30%), Chất lượng (70%) và đề xuất điểm thưởng sáng tạo 5%.',
                        tab: 'grading',
                        color: 'emerald'
                      },
                      {
                        step: 'Bước 4',
                        name: 'Tự đánh giá Phần I (30đ)',
                        desc: 'Cán bộ tự chấm 17 tiêu chuẩn chính trị, tư tưởng, đạo đức theo Quy định số 366-QĐ/TW.',
                        tab: 'self_eval',
                        color: 'amber'
                      },
                      {
                        step: 'Bước 5',
                        name: 'Biểu quyết & Kết luận xếp loại',
                        desc: 'Tập thể bỏ phiếu biểu quyết tín nhiệm, Lãnh đạo ghi nhận xét và kết luận mức xếp loại quý.',
                        tab: 'voting',
                        color: 'purple'
                      },
                      {
                        step: 'Bước 6',
                        name: 'Xuất Báo cáo & Tổng hợp Mẫu 02',
                        desc: 'Hệ thống tự động lập Báo cáo công việc, Mẫu 01-A (CBQL), Mẫu 01-B (CBNV) và Mẫu 02 toàn cơ quan.',
                        tab: 'reports',
                        color: 'rose'
                      }
                    ].map(st => (
                      <div key={st.step} className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-red-300 transition flex flex-col justify-between gap-3 shadow-2xs">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                              {st.step}
                            </span>
                            <span className="text-xs font-medium text-slate-400">Hướng dẫn 06</span>
                          </div>
                          <h5 className="font-bold text-slate-900 text-sm mt-2">{st.name}</h5>
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">{st.desc}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setShowHelpModal(false);
                            if (setCurrentTab) setCurrentTab(st.tab);
                          }}
                          className="text-xs font-bold text-red-700 hover:underline flex items-center gap-1 self-start"
                        >
                          Đi tới tính năng này <ChevronDown className="w-3 h-3 -rotate-90" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 2: CÔNG THỨC TÍNH ĐIỂM */}
              {helpActiveTab === 'formula' && (
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      <Calculator className="w-5 h-5 text-red-600" />
                      Công thức Chuẩn theo Phụ lục 5 Hướng dẫn 06-HD/BTCTU
                    </h4>
                    
                    {/* Formula box */}
                    <div className="p-4 bg-white rounded-xl border border-red-200 font-mono text-xs space-y-2 text-slate-900">
                      <div className="font-bold text-red-700">
                        1. Điểm thực hiện = Điểm chuẩn × (30% Tiến độ + 70% Chất lượng)
                      </div>
                      <div className="font-bold text-emerald-700">
                        2. Điểm quy đổi = Điểm thực hiện × Hệ số độ khó (HSĐK)
                      </div>
                      <div className="font-bold text-blue-700">
                        3. Điểm thưởng vượt mức/sáng tạo = 5% Điểm quy đổi (Tối đa 7.0 điểm toàn kỳ)
                      </div>
                      <div className="font-bold text-purple-700">
                        4. Điểm KPI tổng = Điểm Phần I (tối đa 30đ) + Điểm Phần II (tối đa 70đ) + Điểm thưởng
                      </div>
                    </div>
                  </div>

                  {/* Rating Scales */}
                  <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-3">
                    <h5 className="font-bold text-slate-900 text-sm">4 Khung Mức Xếp loại Cán bộ Hàng Quý:</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950">
                        <strong className="block text-emerald-800 text-sm">Hoàn thành xuất sắc nhiệm vụ</strong>
                        <div className="mt-1">Điểm tổng ≥ 90 điểm. Tỷ lệ tối đa không quá 20% tổng số cán bộ toàn cơ quan/đơn vị.</div>
                      </div>

                      <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-950">
                        <strong className="block text-blue-800 text-sm">Hoàn thành tốt nhiệm vụ</strong>
                        <div className="mt-1">Điểm tổng từ 70 đến dưới 90 điểm. Đạt đầy đủ tiến độ và chất lượng theo yêu cầu.</div>
                      </div>

                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950">
                        <strong className="block text-amber-800 text-sm">Hoàn thành nhiệm vụ</strong>
                        <div className="mt-1">Điểm tổng từ 50 đến dưới 70 điểm. Có nhiệm vụ chậm hạn hoặc phải sửa đổi.</div>
                      </div>

                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-950">
                        <strong className="block text-rose-800 text-sm">Không hoàn thành nhiệm vụ</strong>
                        <div className="mt-1">Điểm tổng dưới 50 điểm hoặc vi phạm kỷ luật, bị xử lý theo quy định của Đảng.</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: FAQ */}
              {helpActiveTab === 'faq' && (
                <div className="space-y-3">
                  {[
                    {
                      q: '1. Cán bộ Lãnh đạo quản lý và Chuyên viên áp dụng biểu mẫu nào?',
                      a: 'Theo HD 06, Cán bộ lãnh đạo quản lý (CBQL) áp dụng Mẫu 01-A (gồm 17 tiêu chuẩn Phần I và Phần II lãnh đạo điều hành). Công chức, viên chức không giữ chức vụ lãnh đạo (CBNV) áp dụng Mẫu 01-B (gồm 16 tiêu chuẩn).'
                    },
                    {
                      q: '2. Khi nào hệ thống cảnh báo vượt trần Hoàn thành xuất sắc 20%?',
                      a: 'Theo Điều 12 Quy định 366-QĐ/TW, số lượng cán bộ xếp loại "Hoàn thành xuất sắc nhiệm vụ" không được vượt quá 20% tổng số cán bộ được xếp loại của cơ quan, đơn vị. Bảng Mẫu 02 và Biểu quyết sẽ tự động tính tỷ lệ % và báo động đỏ nếu đơn vị đề xuất vượt trần 20%.'
                    },
                    {
                      q: '3. Làm thế nào để giao cùng 1 công việc cho nhiều cán bộ?',
                      a: 'Tại phân hệ "Quản lý nhiệm vụ" hoặc "Danh mục công việc chuẩn", khi bấm nút Giao việc, hộp thoại hỗ trợ chọn đồng thời nhiều cán bộ, có nút "Chọn tất cả" và thanh tìm kiếm nhanh.'
                    },
                    {
                      q: '4. Nộp tài liệu minh chứng như thế nào?',
                      a: 'Tại tab "Nộp sản phẩm công việc", bấm vào nhiệm vụ tương ứng, nhập ngày hoàn thành thực tế và đính kèm file văn bản PDF/Word hoặc đường link nghiệm thu sản phẩm.'
                    }
                  ].map((faq, i) => (
                    <div key={i} className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
                      <h5 className="font-bold text-slate-900 text-sm">{faq.q}</h5>
                      <p className="text-xs text-slate-600 leading-relaxed">{faq.a}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 4: CONTACT & DOWNLOAD */}
              {helpActiveTab === 'contact' && (
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      <PhoneCall className="w-5 h-5 text-red-600" />
                      Đầu mối Hỗ trợ Nghiệp vụ & Kỹ thuật
                    </h4>
                    <div className="space-y-2 text-xs text-slate-700">
                      <div>🏢 <strong>Cơ quan chủ quản:</strong> Ban Tổ chức Thành ủy TP. Hồ Chí Minh</div>
                      <div>📍 <strong>Địa chỉ:</strong> Số 89 Trương Định, Phường Võ Thị Sáu, Quận 3, TP. Hồ Chí Minh</div>
                      <div>📞 <strong>Hotline hỗ trợ kỹ thuật:</strong> (028) 3829.xxxx (Nhánh 102 - 105)</div>
                      <div>✉️ <strong>Email tiếp nhận yêu cầu:</strong> bantocthanhuy@tphcm.gov.vn</div>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-red-50 border border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <FileText className="w-8 h-8 text-red-700 shrink-0" />
                      <div>
                        <h5 className="font-bold text-red-950 text-sm">Văn bản Hướng dẫn số 06-HD/BTCTU</h5>
                        <p className="text-xs text-red-800 mt-0.5">Tài liệu hướng dẫn toàn diện 65 trang của Ban Tổ chức Thành ủy TP.HCM</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        alert('Tài liệu Hướng dẫn số 06-HD/BTCTU đã được tích hợp sẵn trong thư viện tài liệu hệ thống!');
                      }}
                      className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl shadow-xs transition shrink-0 flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Xem tài liệu PDF</span>
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="px-5 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl shadow-xs transition"
              >
                Đã hiểu & Đóng
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. MODAL THÔNG TIN CÁ NHÂN (PROFILE MODAL)                     */}
      {/* ============================================================== */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in duration-200 text-slate-800 flex flex-col">
            
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-red-700 via-red-800 to-red-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-white shadow-xs">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight">Hồ sơ Cán bộ / Thông tin Cá nhân</h3>
                  <p className="text-xs text-red-200 mt-0.5">Dữ liệu định danh & phân quyền trên Hệ thống Quản lý công việc và KPI</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              
              {/* Profile Card Top */}
              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-gradient-to-br from-slate-50 to-red-50/40 rounded-2xl border border-slate-200">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-900 to-slate-900 text-white flex items-center justify-center font-bold text-2xl shadow-md border-2 border-white shrink-0">
                  {userInitial}
                </div>
                <div className="text-center sm:text-left flex-1 min-w-0">
                  <h4 className="text-lg font-bold text-slate-900">{currentUser?.full_name}</h4>
                  <p className="text-sm font-medium text-red-700 mt-0.5">{currentUser?.gov_title || 'Chuyên viên'}</p>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-red-100 text-red-800 border border-red-200">
                      {currentUser?.role === 'admin' ? 'Quản trị viên Hệ thống' : currentUser?.role === 'cbql' ? 'Lãnh đạo / Cán bộ Quản lý (CBQL)' : 'Cán bộ Nhân viên (CBNV)'}
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                      Đang hoạt động (Active)
                    </span>
                  </div>
                </div>
              </div>

              {/* Detail Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-400 font-semibold block text-[11px] uppercase">Mã số cán bộ (ID)</span>
                  <span className="font-mono font-bold text-slate-800 text-sm">{currentUser?.id || '—'}</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-400 font-semibold block text-[11px] uppercase">Tên đăng nhập (Username)</span>
                  <span className="font-mono font-bold text-slate-800 text-sm">{currentUser?.username || '—'}</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-400 font-semibold block text-[11px] uppercase">Đơn vị / Phòng ban công tác</span>
                  <span className="font-semibold text-slate-900">{currentDept?.name || currentUser?.dept_name || 'Ban Tổ chức Thành ủy TP. Hồ Chí Minh'}</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-400 font-semibold block text-[11px] uppercase">Chức danh Đảng</span>
                  <span className="font-semibold text-slate-900">{currentUser?.party_title || 'Đảng viên'}</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-400 font-semibold block text-[11px] uppercase">Chức vụ Chính quyền</span>
                  <span className="font-semibold text-slate-900">{currentUser?.gov_title || 'Chuyên viên'}</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-400 font-semibold block text-[11px] uppercase">Ngày sinh (dd/mm/yyyy)</span>
                  <span className="font-semibold text-slate-900">{formatDate(currentUser?.birth_date, '15/05/1985')}</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-400 font-semibold block text-[11px] uppercase">Giới tính</span>
                  <span className="font-semibold text-slate-900">{currentUser?.gender || 'Nam'}</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-400 font-semibold block text-[11px] uppercase">Số điện thoại liên hệ</span>
                  <span className="font-semibold text-slate-900">{currentUser?.phone || '0901234567'}</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1 sm:col-span-2">
                  <span className="text-slate-400 font-semibold block text-[11px] uppercase">Hộp thư công vụ điện tử</span>
                  <span className="font-semibold text-slate-900">{currentUser?.email || 'canbo@tphcm.gov.vn'}</span>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setShowProfileModal(false);
                  setShowChangePasswordModal(true);
                }}
                className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                <span>Đổi mật khẩu tài khoản</span>
              </button>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="px-5 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
              >
                Đóng
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 5. MODAL LỊCH SỬ CẬP NHẬT HỆ THỐNG (CHANGELOG)                 */}
      {/* ============================================================== */}
      {showChangelogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in duration-200 text-slate-800 flex flex-col">
            
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-red-700 via-red-800 to-red-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-white shadow-xs">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight">Lịch sử Cập nhật Hệ thống</h3>
                  <p className="text-xs text-red-200 mt-0.5">Nhật ký phiên bản & tính năng mới theo Quy định 366-QĐ/TW & Hướng dẫn 06-HD/BTCTU</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowChangelogModal(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body Timeline */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              
              {/* Version 3.4 */}
              <div className="relative pl-6 border-l-2 border-red-600 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-red-600 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-bold">Phiên bản 3.4</span>
                  <span className="text-xs text-slate-500 font-medium">10/09/2026 (Bản phát hành hiện tại)</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Tối Ưu Triển Khai Render Cloud, Khắc Phục Triệt Để Lỗi Kết Nối Máy Chủ & Bảo Vệ Khóa Ngoại Kỳ Đánh Giá
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Tối ưu hóa triển khai Render Cloud tự động:</strong> Bổ sung tệp cấu hình <code>render.yaml</code> chuẩn Blueprint, tự động cấu hình chu trình <code>npm run build</code>, <code>postinstall</code> cài đặt dependencies đa tầng, thiết lập máy chủ bind lắng nghe <code>0.0.0.0</code> đáp ứng mọi kiến trúc container đám mây.</li>
                  <li><strong>Cơ chế tự động thử lại kết nối (Auto-retry & Retry Button):</strong> Tự động gửi lại yêu cầu sau 2.5 giây khi phát hiện máy chủ Render đang khởi động lại hoặc sau trạng thái ngủ (cold-start); bổ sung nút <em>"Thử lại ngay"</em> trực tiếp trong hộp cảnh báo lỗi để người dùng thao tác tức thì.</li>
                  <li><strong>Kiểm soát an toàn ràng buộc Khóa Ngoại (Foreign Key) Kỳ Đánh Giá:</strong> Cơ chế tự kiểm tra và fallback thông minh gán kỳ đánh giá hiện hành nếu file Excel hoặc tham số gửi lên không khớp với CSDL, loại bỏ hoàn toàn lỗi <code>FOREIGN KEY constraint failed</code>.</li>
                  <li><strong>Khả năng dự phòng tệp mẫu demo đa tầng:</strong> Hỗ trợ tìm kiếm tệp dữ liệu mẫu chuẩn ở mọi cấp thư mục (gốc, backend, current working directory), bảo đảm tính năng nạp nhanh luôn hoạt động trơn tru.</li>
                </ul>
              </div>

              {/* Version 3.3 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-400 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">Phiên bản 3.3</span>
                  <span className="text-xs text-slate-500 font-medium">10/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Đồng Bộ Giao Diện & Trải Nghiệm Nhập Danh Mục Công Việc Chuẩn Tương Đồng Với Phân Hệ Nhập Cán Bộ
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Chuẩn hóa giao diện Modal Nhập File Excel (.xlsx):</strong> Tái thiết kế toàn diện modal nạp Danh mục công việc chuẩn đồng nhất 100% với modal Nhập danh sách CBNV (khung modal bo góc lớn, icon huy hiệu FileSpreadsheet, khung kéo thả file dropzone trực quan, hiển thị tên tệp và dung lượng KB).</li>
                  <li><strong>Tùy chọn kiểm soát trùng lặp dữ liệu (update_existing):</strong> Bổ sung ô tích chọn linh hoạt: <em>Cập nhật thông tin công việc nếu tên công việc đã tồn tại trong danh mục</em>; cho phép Quản trị viên và CBQL chủ động ghi đè hoặc giữ nguyên dữ liệu gốc khi nạp file.</li>
                  <li><strong>Bảng thống kê kết quả nhập liệu trực quan (Result Summary Box):</strong> Hiển thị báo cáo kết quả nạp file với 3 ô chỉ số rõ ràng (Thêm mới, Cập nhật, Bỏ qua) cùng danh sách cảnh báo chi tiết theo từng dòng nếu file Excel có sai sót.</li>
                  <li><strong>Hỗ trợ Nạp nhanh bản Demo & Tải biểu mẫu chuẩn:</strong> Tích hợp nút <em>⚡ Nạp bản demo</em> giúp thử nghiệm nhanh dữ liệu mẫu; liên kết tải trực tiếp biểu mẫu chuẩn 5 sheet đầy đủ công thức tự tính điểm và 6 trục trọng tâm.</li>
                </ul>
              </div>

              {/* Version 3.2 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-400 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">Phiên bản 3.2</span>
                  <span className="text-xs text-slate-500 font-medium">10/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Tách biệt CSDL & Bảo vệ Dữ liệu Tuyệt đối khi Cập nhật Code, Tối ưu Triển khai Render & Supabase Cloud
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Tự phục hồi CSDL thông minh (Self-healing Auto Recovery):</strong> Tự động quét và khôi phục CSDL từ các bản snapshot trong thư mục <code>backend/backups/</code> nếu tệp <code>kpi.db</code> bị thiếu hoặc xóa sau lệnh <code>git pull</code>; cách ly CSDL hoàn toàn khỏi Git.</li>
                  <li><strong>Tách biệt cập nhật code khỏi Supabase Cloud:</strong> Quá trình cập nhật phần mềm hoặc khởi động máy chủ tuyệt đối KHÔNG tự ý ghi đè hay xóa dữ liệu trên Supabase. Mọi hoạt động sao lưu và khôi phục đám mây đều chuyển sang cơ chế chủ động (On-demand) do Quản trị viên kiểm soát.</li>
                  <li><strong>Phân hệ Đồng bộ Đám mây Supabase (PostgreSQL Cloud):</strong> Tích hợp thẻ giám sát trạng thái kết nối, bảng so sánh số lượng bản ghi thời gian thực giữa SQLite và Supabase, cùng các nút thao tác: <em>Sao lưu lên Supabase (Push)</em> và <em>Khôi phục từ Supabase (Pull)</em> tại tab Cấu hình hệ thống.</li>
                  <li><strong>Bộ công cụ dòng lệnh (CLI Tools):</strong> Cung cấp các lệnh terminal tiện lợi: <code>npm run db:status</code>, <code>npm run db:push-supabase</code>, <code>npm run db:pull-supabase</code>.</li>
                  <li><strong>Khắc phục lỗi Foreign Key & Unique Constraint trên Render:</strong> Tối ưu hóa thứ tự phụ thuộc bảng dữ liệu khi khởi tạo CSDL mới; loại bỏ ràng buộc <code>UNIQUE</code> trên mã tiêu chí để cả CBQL và CBNV cùng sử dụng các mã nhánh chuyên môn <code>2.1, 2.2, 2.3</code> (Mẫu 01-A & Mẫu 01-B) mà không gây xung đột khóa.</li>
                </ul>
              </div>

              {/* Version 3.1 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-400 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">Phiên bản 3.1</span>
                  <span className="text-xs text-slate-500 font-medium">10/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Quy định Tài khoản Admin Nghiệp vụ, Nhập liệu Excel Thông minh & Chuẩn hóa Xếp loại Ban đầu
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Quy định tài khoản Admin nghiệp vụ:</strong> Các tài khoản quyền Quản trị cơ quan / Quản trị đơn vị là tài khoản điều hành kỹ thuật, không tham gia tự đánh giá hay chấm điểm KPI; tự động loại trừ khỏi danh sách giao việc và biểu quyết xếp loại.</li>
                  <li><strong>Khắc phục xếp loại ban đầu:</strong> Khi import danh sách nhân sự mới hoặc tạo mới cán bộ, trạng thái xếp loại luôn mặc định là <em>"Chưa tự đánh giá" / "Chưa có kết luận"</em>; khắc phục lỗi tự động hiển thị "Hoàn thành tốt nhiệm vụ" khi chưa thực hiện chấm điểm và biểu quyết.</li>
                  <li><strong>Nâng cấp Bộ nhập liệu Excel thông minh:</strong> Tự động nhận diện linh hoạt các cấu trúc cột dữ liệu đa dạng trong file Excel Danh mục công việc chuẩn và Danh sách cán bộ nhân viên; khắc phục triệt để lỗi xác thực thẩm quyền <code>x-viewer-id</code>.</li>
                </ul>
              </div>

              {/* Version 3.0 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-400 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">Phiên bản 3.0</span>
                  <span className="text-xs text-slate-500 font-medium">09/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Quản lý Hồ sơ Văn bản Đến & Đi Gắn liền KPI, Thiết lập Khóa KPI & Cơ chế Phúc tra
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Quản lý Văn bản điều hành gắn liền KPI:</strong> Phân hệ theo dõi văn bản đến/đi, giao việc trực tiếp từ văn bản chỉ đạo, phân công cán bộ chủ trì & phối hợp, tự động liên kết thành nhiệm vụ KPI.</li>
                  <li><strong>Thời điểm khóa chấm điểm KPI tự động:</strong> Cho phép cán bộ quản trị cấu hình ngày giờ khóa tự động cho từng kỳ đánh giá quý; quá thời hạn quy định, hệ thống tự động khóa tính năng chấm điểm để đảm bảo tính kỷ luật.</li>
                  <li><strong>Cơ chế hoàn trả hồ sơ (Feedback / Return):</strong> Cán bộ quản lý có thể trả lại nhiệm vụ hoặc phiếu đánh giá yêu cầu bổ sung sản phẩm minh chứng nếu chưa đạt yêu cầu.</li>
                  <li><strong>Lưu trữ tệp minh chứng đa tầng:</strong> Hỗ trợ lưu trữ đám mây Cloudflare R2 không giới hạn kết hợp lưu trữ đĩa cục bộ tự động dự phòng.</li>
                </ul>
              </div>

              {/* Version 2.5 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-400 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">Phiên bản 2.5</span>
                  <span className="text-xs text-slate-500 font-medium">09/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Chuẩn hóa Ngày tháng dd/mm/yyyy, Menu Tài khoản Cá nhân hóa & Báo cáo Giám sát
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Chuẩn hóa định dạng ngày tháng:</strong> Áp dụng định dạng chuẩn <code>dd/mm/yyyy</code> trên toàn bộ hệ thống (bảng dữ liệu, thẻ tóm tắt, modal thao tác và file Excel xuất ra).</li>
                  <li><strong>Khắc phục hiển thị menu người dùng:</strong> Loại bỏ lỗi tràn giao diện, đảm bảo menu tài khoản và tính năng chuyển đổi người dùng hoạt động mượt mà, không bị che khuất.</li>
                  <li><strong>Trung tâm tài khoản người dùng:</strong> Bổ sung 5 tính năng: Thông tin cá nhân, Hướng dẫn sử dụng, Lịch sử cập nhật, Lịch sử đồng ý, Đăng xuất.</li>
                  <li><strong>Tối ưu hóa Typography:</strong> Chuyển sang font tiếng Việt thanh mảnh <code>Be Vietnam Pro</code>, loại bỏ in đậm thô, tinh chỉnh thẻ báo cáo nền trắng sang trọng.</li>
                  <li><strong>Báo cáo Giám sát đa cấp:</strong> Tích hợp báo cáo KPI cá nhân, KPI đơn vị và toàn cơ quan chủ quản theo phân quyền trực tiếp trên Bảng giám sát.</li>
                </ul>
              </div>

              {/* Version 2.4 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-400 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">Phiên bản 2.4</span>
                  <span className="text-xs text-slate-500 font-medium">08/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Cập nhật Quy chế Đánh giá & Chấm điểm theo Hướng dẫn số 06-HD/BTCTU
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Hệ số độ khó (HSĐK):</strong> Bổ sung 3 mức hệ số độ khó chuẩn: 100%, 110%, 120% cho từng nhóm công việc.</li>
                  <li><strong>Tiến độ công việc:</strong> Căn cứ thời hạn thực tế tính theo ngày làm việc (trừ Thứ 7 & Chủ nhật): Đúng/trước hạn (100%), trễ 1–3 ngày (80%), trễ 4–5 ngày (60%), trễ trên 5 ngày (0%).</li>
                  <li><strong>Chất lượng sản phẩm:</strong> Đạt yêu cầu đầy đủ (100%), đạt yêu cầu chỉnh sửa nhỏ (80%), hoàn thành cơ bản (60%), không đạt yêu cầu (0%).</li>
                </ul>
              </div>

              {/* Version 2.3 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-400 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">Phiên bản 2.3</span>
                  <span className="text-xs text-slate-500 font-medium">07/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Chuẩn hóa Biểu mẫu Báo cáo & Xuất File Font Times New Roman 14pt
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li>Đồng bộ mẫu báo cáo Mẫu 01-A (CBQL), Mẫu 01-B (CBNV), Báo cáo công việc và Mẫu 02 theo quy chuẩn văn bản hành chính Việt Nam.</li>
                  <li>Liên kết động tên Cơ quan chủ quản, Đơn vị, Địa phương và Người ký từ tab Cấu hình hệ thống.</li>
                </ul>
              </div>

              {/* Version 2.0 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-400 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">Phiên bản 2.0</span>
                  <span className="text-xs text-slate-500 font-medium">01/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Triển khai Hệ thống Đánh giá Hiệu quả Công việc theo Quy định 366-QĐ/TW
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li>Phân chia cơ cấu đánh giá: Phần I (30 điểm - 17 tiêu chuẩn chính trị, đạo đức) và Phần II (70 điểm - 6 Trục kết quả trọng tâm).</li>
                  <li>Quy trình 6 bước khép kín: Danh mục chuẩn → Giao việc → Thực hiện → Tự đánh giá → Chấm điểm → Biểu quyết tập thể.</li>
                </ul>
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500">Ban Tổ chức Thành ủy Thành phố Hồ Chí Minh</span>
              <button
                type="button"
                onClick={() => setShowChangelogModal(false)}
                className="px-5 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
              >
                Đóng
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 6. MODAL LỊCH SỬ ĐỒNG Ý & CAM KẾT (CONSENT HISTORY)            */}
      {/* ============================================================== */}
      {showConsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in duration-200 text-slate-800 flex flex-col">
            
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-red-700 via-red-800 to-red-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-white shadow-xs">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight">Lịch sử Đồng ý & Cam kết Quy chế</h3>
                  <p className="text-xs text-red-200 mt-0.5">Nhật ký ghi nhận cam kết trách nhiệm và bảo vệ dữ liệu cá nhân</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConsentModal(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              
              <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <h4 className="font-bold text-slate-900 text-sm">
                      1. Cam kết tuân thủ Quy chế đánh giá hiệu quả công việc
                    </h4>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                    ✓ Đã chấp thuận
                  </span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Cán bộ cam kết tuân thủ nghiêm túc Quy định số 366-QĐ/TW của Ban Bí thư và Hướng dẫn số 06-HD/BTCTU của Ban Tổ chức Thành ủy; thực hiện kê khai công việc trung thực, nộp sản phẩm minh chứng đầy đủ đúng hạn và tự chấm điểm khách quan.
                </p>
                <div className="text-[11px] text-slate-500 pt-1 border-t border-emerald-200/60 flex flex-wrap justify-between gap-2">
                  <span>Cán bộ: <strong>{currentUser?.full_name}</strong></span>
                  <span>Thời gian: <strong>01/07/2026 08:30:00</strong></span>
                </div>
              </div>

              <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <h4 className="font-bold text-slate-900 text-sm">
                      2. Chấp thuận Chính sách Bảo vệ Dữ liệu Cá nhân
                    </h4>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                    ✓ Đã chấp thuận
                  </span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Đồng ý cho phép hệ thống thu thập, lưu trữ và xử lý thông tin cá nhân cùng dữ liệu đánh giá hiệu quả công việc theo đúng quy định tại Nghị định số 13/2023/NĐ-CP của Chính phủ về bảo vệ dữ liệu cá nhân phục vụ công tác cán bộ.
                </p>
                <div className="text-[11px] text-slate-500 pt-1 border-t border-emerald-200/60 flex flex-wrap justify-between gap-2">
                  <span>Căn cứ: <strong>Nghị định 13/2023/NĐ-CP</strong></span>
                  <span>Thời gian: <strong>01/07/2026 08:30:15</strong></span>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-700" />
                    <h4 className="font-bold text-slate-900 text-sm">
                      3. Xác thực Quyền hạn & Phân cấp Thẩm định
                    </h4>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px]">
                    ✓ Đã kích hoạt
                  </span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Tài khoản được gán phân quyền <strong>{currentUser?.role === 'admin' ? 'Quản trị viên Hệ thống' : currentUser?.role === 'cbql' ? 'Lãnh đạo / Cán bộ Quản lý đơn vị' : 'Cán bộ Nhân viên'}</strong> với phạm vi dữ liệu tương ứng, chịu trách nhiệm pháp lý về tính chính xác của các kết quả phê duyệt trên hệ thống.
                </p>
                <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200 flex flex-wrap justify-between gap-2">
                  <span>Trạng thái: <strong>Phiên xác thực hợp lệ</strong></span>
                  <span>Thời gian: <strong>01/09/2026 09:00:00</strong></span>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500">Nhật ký bảo mật được lưu trữ an toàn</span>
              <button
                type="button"
                onClick={() => setShowConsentModal(false)}
                className="px-5 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
              >
                Đóng
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 8. MODAL ĐỔI MẬT KHẨU TÀI KHOẢN (CHANGE PASSWORD)               */}
      {/* ============================================================== */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200 text-slate-800 my-8">
            
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-red-700 via-red-800 to-red-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-white shadow-xs">
                  <KeyRound className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight">Đổi Mật Khẩu Tài Khoản</h3>
                  <p className="text-xs text-red-200 mt-0.5">
                    {currentUser?.username} • {currentUser?.full_name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeChangePasswordModal}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handlePasswordSubmit} className="p-6 space-y-4">
              {passwordChangeError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-700 animate-in fade-in duration-200">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{passwordChangeError}</span>
                </div>
              )}

              {passwordChangeSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-700 animate-in fade-in duration-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">{passwordChangeSuccess}</p>
                    <p className="text-[11px] text-emerald-600">Đang đóng cửa sổ...</p>
                  </div>
                </div>
              )}

              {/* Mật khẩu hiện tại */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Mật khẩu hiện tại <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    required
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    placeholder="Nhập mật khẩu đang sử dụng"
                    className="w-full px-3.5 py-2.5 pr-10 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-50/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Mật khẩu mới */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Mật khẩu mới <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    required
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    placeholder="Tối thiểu 6 ký tự"
                    className="w-full px-3.5 py-2.5 pr-10 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-50/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">Mật khẩu nên chứa cả chữ và số để tăng tính bảo mật.</p>
              </div>

              {/* Xác nhận mật khẩu mới */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Xác nhận mật khẩu mới <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    required
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    className="w-full px-3.5 py-2.5 pr-10 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-50/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                  >
                    {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Buttons */}
              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeChangePasswordModal}
                  disabled={passwordChangeLoading}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={passwordChangeLoading || !!passwordChangeSuccess}
                  className="px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {passwordChangeLoading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4 text-amber-300" />
                      <span>Cập nhật mật khẩu</span>
                    </>
                  )}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 7. MODAL XÁC NHẬN ĐĂNG XUẤT (LOGOUT CONFIRMATION)              */}
      {/* ============================================================== */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200 text-slate-800 p-6 space-y-5 text-center">
            
            <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center mx-auto shadow-xs">
              <LogOut className="w-7 h-7 stroke-[2.5]" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-slate-900">Xác nhận Đăng xuất</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Đồng chí có chắc chắn muốn đăng xuất khỏi phiên làm việc của cán bộ <strong className="text-slate-900">{currentUser?.full_name}</strong> ({currentUser?.gov_title || 'Cán bộ'})?
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutModal(false);
                  if (onLogout) {
                    onLogout();
                  }
                }}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
              >
                Đăng xuất
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}