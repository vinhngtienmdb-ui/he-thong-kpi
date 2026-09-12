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
  onNotificationClick,
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

  // Notifications State & Realtime Fetch
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeToastNotif, setActiveToastNotif] = useState(null);
  const shownToastNotifIdsRef = useRef(new Set());

  const fetchNotifications = async () => {
    if (!currentUser?.id) return;
    try {
      const res = await api.getNotifications({ user_id: currentUser.id, limit: 50 });
      if (res && res.success) {
        const list = res.data || [];
        setNotifications(list);
        setUnreadCount(res.unread_count || 0);

        // Phát hiện thông báo cần phê duyệt/xử lý gửi tới Lãnh đạo / CBQL
        const pendingActionNotifs = list.filter(n => 
          (!n.is_read && !n.read) && 
          ['standard_task_proposal', 'task_registered', 'extension_requested'].includes(n.type)
        );

        if (pendingActionNotifs.length > 0) {
          const newestToPop = pendingActionNotifs.find(n => !shownToastNotifIdsRef.current.has(n.id));
          if (newestToPop) {
            shownToastNotifIdsRef.current.add(newestToPop.id);
            setActiveToastNotif(newestToPop);
          }
        }
      }
    } catch (e) {
      console.warn('Error fetching notifications:', e);
    }
  };

  useEffect(() => {
    shownToastNotifIdsRef.current.clear();
    setActiveToastNotif(null);
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000); // Polling mỗi 10 giây để nhận thông báo tức thời
    return () => clearInterval(interval);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!activeToastNotif) return;
    const timer = setTimeout(() => {
      setActiveToastNotif(null);
    }, 15000); // Tự động đóng sau 15s nếu không click
    return () => clearTimeout(timer);
  }, [activeToastNotif]);

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

  const unreadNotifsCount = unreadCount !== undefined ? unreadCount : notifications.filter(n => !n.is_read && !n.read).length;

  const markAllNotifsAsRead = async () => {
    try {
      await api.markAllNotificationsAsRead({ user_id: currentUser?.id });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1, read: true })));
      setUnreadCount(0);
    } catch (e) {
      console.error('Error marking all read:', e);
    }
  };

  const clearAllNotifications = async () => {
    try {
      await api.clearNotifications({ user_id: currentUser?.id });
      setNotifications([]);
      setUnreadCount(0);
    } catch (e) {
      console.error('Error clearing notifications:', e);
    }
  };

  const handleNotificationClick = async (notif) => {
    try {
      if (!notif.is_read) {
        await api.markNotificationAsRead(notif.id);
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: 1, read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (e) {}

    setShowNotificationsDropdown(false);
    if (onNotificationClick) {
      onNotificationClick(notif);
    } else if (notif.tab && setCurrentTab) {
      setCurrentTab(notif.tab);
    }
  };

  const handleToastAction = () => {
    if (!activeToastNotif) return;
    const targetNotif = activeToastNotif;
    setActiveToastNotif(null);
    handleNotificationClick(targetNotif);
  };

  const handleCloseToast = () => {
    setActiveToastNotif(null);
  };

  const formatMessageDates = (text) => {
    if (!text) return '';
    return text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3/$2/$1');
  };

  const formatNotifTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now - d;
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'Vừa xong';
      if (diffMin < 60) return `${diffMin} phút trước`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `${diffHours} giờ trước`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays <= 3) return `${diffDays} ngày trước`;
      return formatDate(dateStr);
    } catch (e) {
      return dateStr;
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
                            (!notif.is_read && !notif.read) ? 'bg-red-50/40' : ''
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-2xs ${
                            notif.type === 'standard_task_proposal' ? 'bg-amber-100 text-amber-800' :
                            notif.type === 'task_registered' ? 'bg-blue-100 text-blue-800' :
                            notif.type === 'task_assigned' ? 'bg-indigo-100 text-indigo-700' :
                            notif.type === 'task_approved' ? 'bg-emerald-100 text-emerald-700' :
                            notif.type === 'extension_approved' ? 'bg-emerald-100 text-emerald-700' :
                            notif.type === 'extension_requested' ? 'bg-amber-100 text-amber-700' :
                            notif.type === 'extension_rejected' ? 'bg-rose-100 text-rose-700' :
                            notif.type === 'deadline_warning' ? 'bg-rose-100 text-rose-700' :
                            notif.type === 'voting_result' ? 'bg-purple-100 text-purple-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {notif.type === 'standard_task_proposal' ? <BookOpen className="w-4 h-4 text-amber-700" /> :
                             notif.type === 'task_registered' ? <ClipboardList className="w-4 h-4 text-blue-700" /> :
                             notif.type === 'task_assigned' ? <Layers className="w-4 h-4" /> :
                             notif.type === 'task_approved' ? <FileCheck2 className="w-4 h-4" /> :
                             notif.type === 'extension_approved' ? <CheckCircle2 className="w-4 h-4" /> :
                             notif.type === 'extension_requested' ? <Clock className="w-4 h-4" /> :
                             notif.type === 'extension_rejected' ? <AlertTriangle className="w-4 h-4" /> :
                             notif.type === 'deadline_warning' ? <AlertTriangle className="w-4 h-4" /> :
                             notif.type === 'voting_result' ? <Vote className="w-4 h-4" /> :
                             <Sparkles className="w-4 h-4" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <h5 className={`text-xs font-semibold truncate ${(!notif.is_read && !notif.read) ? 'text-red-950 font-bold' : 'text-slate-700'}`}>
                                {notif.title}
                              </h5>
                              {(!notif.is_read && !notif.read) && (
                                <span className="w-2 h-2 rounded-full bg-red-600 shrink-0"></span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                              {formatMessageDates(notif.message)}
                            </p>
                            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1.5">
                              <span>{notif.time || formatNotifTime(notif.created_at)}</span>
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
                  <span className="font-semibold text-slate-900">{currentUser?.party_title || (currentUser?.is_party_member ? 'Đảng viên' : 'Quần chúng')}</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-400 font-semibold block text-[11px] uppercase">Chức vụ / Vị trí việc làm</span>
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
              
              {/* Version 5.4 */}
              <div className="relative pl-6 border-l-2 border-red-600 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-red-600 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-bold">Phiên bản 5.4</span>
                  <span className="text-xs text-slate-500 font-medium">12/09/2026 - 09:10 (Bản phát hành mới nhất - Bổ sung Xuất Báo cáo theo file Word .docx chuẩn A4 Times New Roman 14pt)</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Bổ Sung Tính Năng Xuất Báo Cáo Theo File Word (DOCX) Cho Toàn Bộ Các Trường Xuất Báo Cáo, Tuân Thủ Tuyệt Đối Quy Chuẩn Thể Thức Văn Bản Quản Lý Nhà Nước
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Xuất file Word (.docx) cho Bản tự đánh giá (Mẫu 01-A cho CBQL, Mẫu 01-B cho CBNV):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Tự động nhận diện đối tượng cán bộ (Lãnh đạo quản lý &rarr; Mẫu 01-A, Chuyên viên/Nhân viên &rarr; Mẫu 01-B).</li>
                      <li>Trình bày đầy đủ thể thức: Quốc hiệu, Tiêu ngữ, Cơ quan cấp trên, Tên cơ quan, Ngày tháng hành chính, Thông tin cán bộ và 17 tiêu chuẩn chính trị, đạo đức, tác phong (30 điểm).</li>
                      <li>Kèm bảng tổng hợp kết quả công việc (70 điểm) theo công thức Hướng dẫn 06-HD/BTCTU, điểm thưởng (+5%), danh sách chi tiết các nhiệm vụ trong quý, ý kiến nhận xét của cấp quản lý và phần chữ ký 2 bên.</li>
                    </ul>
                  </li>
                  <li><strong>Xuất file Word (.docx) Báo cáo kết quả thực hiện nhiệm vụ công việc:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Trình bày phân nhóm chi tiết toàn bộ các nhiệm vụ theo 6 trục kết quả, thống kê số lượng nhiệm vụ thường xuyên / đột xuất, điểm quy đổi, điểm thưởng và trạng thái hoàn thành.</li>
                    </ul>
                  </li>
                  <li><strong>Xuất file Word (.docx) Báo cáo Mẫu 02 (Tổng hợp xếp loại toàn cơ quan):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Định dạng khổ giấy <strong>A4 nằm ngang (Landscape)</strong> dàn đều 13 cột tiêu chuẩn, phân tách 3 khối đối tượng: <em>Khối Công chức, Khối Viên chức, Khối Người lao động</em>.</li>
                      <li>Bao gồm bảng tổng hợp tỷ lệ xếp loại theo từng khối đối tượng và kiểm soát trần khống chế <strong>≤ 20%</strong> Hoàn thành xuất sắc nhiệm vụ.</li>
                    </ul>
                  </li>
                  <li><strong>Tích hợp vào nút menu gộp "🖨️ In & Xuất Báo cáo ▾":</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Người dùng có thể dễ dàng chọn <strong>"📝 Xuất Word (.docx)"</strong> ngay cạnh các chức năng <em>In báo cáo, Xuất PDF, Xuất Excel</em>, tự động tải đúng mẫu biểu tương ứng với màn hình đang xem.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* Version 5.3 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-400 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">Phiên bản 5.3</span>
                  <span className="text-xs text-slate-500 font-medium">12/09/2026 - 08:50 (Xuất Excel Người dùng, Gộp Nút Báo cáo & Khổ A4 14pt, Đổi tên Cấu hình & Nhật ký hoạt động (Logs))</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Xuất File Excel Danh Sách Người Dùng, Tối Ưu Nút Báo Cáo & Định Dạng Khổ Giấy A4 Times New Roman 14pt, Chuẩn Hóa Tên Chức Năng Cấu Hình & Nhật Ký Hoạt Động (Logs)
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Xuất file Excel danh sách người dùng & cán bộ nhân viên:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Bổ sung nút <strong>"Xuất file Excel"</strong> tại phân hệ Quản lý người dùng, hỗ trợ xuất đầy đủ 14 cột tiêu chuẩn thông tin cán bộ theo đúng các bộ lọc đang chọn (Đơn vị, Chức vụ, Trạng thái, Loại cán bộ).</li>
                      <li>File Excel được định dạng chuẩn font <em>Times New Roman</em>, bao gồm cả Chức vụ chính quyền, Chức danh Đảng, Đoàn thể, và toàn bộ <em>Chức vụ kiêm nhiệm</em> của cán bộ.</li>
                    </ul>
                  </li>
                  <li><strong>Gộp tính năng Báo cáo & Chuẩn hóa Định dạng Khổ giấy A4 14pt:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Gộp các nút In báo cáo / Xuất PDF / Tải Excel rời rạc thành 1 nút duy nhất <strong>"🖨️ In & Xuất Báo cáo ▾"</strong> với menu xổ xuống 3 tùy chọn: <em>🖨️ In báo cáo, 📄 Xuất PDF, 📊 Xuất Excel</em>.</li>
                      <li>Các mẫu biểu Báo cáo được cấu hình định dạng in ấn chuyên nghiệp: dàn đều 100% theo hàng ngang trên khổ giấy <strong>A4</strong> (hỗ trợ in nhiều trang liên tục mà không bị cắt mép hoặc tràn lề), sử dụng font chữ <strong>Times New Roman</strong>, kích cỡ chữ <strong>14pt</strong> đúng quy chuẩn thể thức văn bản quản lý nhà nước.</li>
                    </ul>
                  </li>
                  <li><strong>Chuẩn hóa Tên gọi Chức năng trong Module Cấu hình:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Đổi tên <em>Đơn vị và Phòng ban đa cấp</em> &rarr; <strong>Quản lý đơn vị</strong>.</li>
                      <li>Đổi tên <em>Vai trò & Phân quyền dữ liệu</em> &rarr; <strong>Quản lý phân quyền</strong>.</li>
                      <li>Đổi tên <em>Trọng số HD.06 & Chu kỳ quý</em> &rarr; <strong>Quản lý chu kỳ đánh giá</strong>.</li>
                      <li>Đổi tên <em>Sao lưu & Phục hồi CSDL</em> &rarr; <strong>Backup</strong>.</li>
                    </ul>
                  </li>
                  <li><strong>Chức năng Nhật ký hoạt động (Logs):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Bổ sung phân hệ <strong>5. Nhật ký hoạt động (Logs)</strong> trong module Cấu hình với chế độ <code>● LIVE (3s)</code> tự động cập nhật thời gian thực, có nút chuyển đổi Bật/Tạm dừng Live và Làm mới tức thì.</li>
                      <li>Ghi nhận kiểm toán tự động mọi thao tác trọng yếu: Đăng nhập/Đăng xuất, Đổi mật khẩu, Thêm/Sửa/Xóa/Khóa/Mở khóa/Cấp lại mật khẩu/Xuất Excel người dùng, Quản lý đơn vị & phân quyền, Giao việc & Chấm điểm KPI, Trình & Hoàn thành văn bản, Sao lưu & Phục hồi CSDL.</li>
                      <li>Tích hợp bộ lọc đa tiêu chí (theo Loại thao tác, Người thực hiện, Nội dung, Địa chỉ IP, Ngày thực hiện), modal xem chi tiết payload kỹ thuật và công cụ dọn dẹp nhật ký cũ tối ưu hiệu năng.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* Version 5.2 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-400 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">Phiên bản 5.2</span>
                  <span className="text-xs text-slate-500 font-medium">12/09/2026 - 00:20 (Hoàn thành Văn bản, Gán Quyền Văn thư, Khắc phục Quyền Động CBQL, Chuẩn hóa Danh mục theo Quý & Cây Đơn vị Thứ bậc)</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Cập Nhật Trạng Thái Hoàn Thành Sau Khi Xử Lý Văn Bản, Cơ Chế Phân Quyền Văn Thư Trình Lãnh Đạo, Khắc Phục Triệt Để Lỗi Phân Quyền Động CBQL, Chuẩn Hóa Danh Mục Theo Quý & Sắp Xếp Cây Đơn Vị Thứ Bậc
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Cho phép chọn trạng thái Hoàn thành sau khi xử lý xong văn bản:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Bổ sung nút bấm <strong>"Hoàn thành"</strong> trực tiếp trên từng dòng bảng danh sách văn bản, thẻ di động và trong Modal Xem chi tiết văn bản.</li>
                      <li>Hỗ trợ nhập ghi chú kết quả hoàn tất văn bản (tùy chọn) và tự động đồng bộ đánh dấu hoàn tất các lượt phân bổ cá nhân liên quan.</li>
                      <li>Tích hợp trường chọn Trạng thái văn bản (<em>Chờ phân bổ, Đã trình Lãnh đạo, Đang xử lý, Hoàn thành</em>) ngay trong Modal Thêm mới và Chỉnh sửa văn bản; cho phép "Mở lại" văn bản bất cứ lúc nào khi phát sinh công việc cần tiếp tục xử lý.</li>
                    </ul>
                  </li>
                  <li><strong>Cơ chế Phân quyền & Hướng dẫn gán quyền Cán bộ Văn thư:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Khởi tạo vai trò chuẩn <strong>Cán bộ Văn thư</strong> (<code>role-van-thu</code>) sở hữu quyền đặc thù <code>can_submit_documents</code> (Trình văn bản cho Lãnh đạo).</li>
                      <li>Chỉ cán bộ có quyền Văn thư mới hiển thị nút và tính năng "Trình LĐ" tại phân hệ Quản lý & Phân bổ văn bản; đồng thời bảo vệ API backend <code>POST /api/documents/:id/submit-to-leader</code>.</li>
                      <li><em>Cách gán quyền:</em> Quản trị viên vào <strong>Quản lý người dùng</strong> &rarr; Chỉnh sửa cán bộ &rarr; Chọn vai trò là <strong>"Cán bộ Văn thư"</strong> (hoặc vào <strong>Cấu hình hệ thống &rarr; Phân quyền vai trò</strong> &rarr; Bật quyền "Trình văn bản cho Lãnh đạo" cho vai trò bất kỳ).</li>
                    </ul>
                  </li>
                  <li><strong>Khắc phục triệt để lỗi phân quyền động CBQL truy cập Quản lý người dùng & Cấu hình hệ thống:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Loại bỏ hoàn toàn các rào cản kiểm tra tĩnh tại <code>UsersManagementTab</code> và <code>SystemConfigTab</code>; chuyển đổi thống nhất sang kiểm tra động theo <code>getUserPermissions(currentUser)</code>.</li>
                      <li>Khi Quản trị viên cấp thêm quyền <code>can_manage_users</code> hoặc <code>can_manage_system</code> cho vai trò CBQL, người dùng thuộc nhóm CBQL có quyền truy cập và thao tác ngay lập tức mà không gặp lỗi "Không đủ quyền" hay 403 Forbidden.</li>
                      <li>Tự động kích hoạt làm mới danh sách cán bộ và phân quyền hiện hành (<code>onReloadUsers</code>) ngay sau khi Quản trị viên lưu phân quyền vai trò.</li>
                      <li>Nâng cấp các API quản lý Đơn vị / Phòng ban (tạo, cập nhật, xóa, nhập Excel) tại backend từ <code>requireAdmin</code> sang <code>requireCanManageUsers</code> để cán bộ được giao quyền quản lý đơn vị/người dùng thao tác thuận tiện.</li>
                    </ul>
                  </li>
                  <li><strong>Danh mục công việc chuẩn áp dụng riêng biệt cho từng Quý:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Chuẩn hóa dữ liệu toàn bộ 78 nhiệm vụ công việc chuẩn áp dụng riêng cho Quý III/2026 (<code>period_id = 'p-2'</code>).</li>
                      <li>Quý IV/2026 (<code>period_id = 'p-3'</code>) hiện chưa phát hành danh mục, hiển thị trạng thái thông báo trực quan, ngăn chặn việc hiển thị sai lệch hoặc tràn danh mục giữa các quý khác nhau.</li>
                    </ul>
                  </li>
                  <li><strong>Sắp xếp Cây Danh mục Đơn vị / Phòng ban theo thứ bậc từ cao xuống thấp:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Tự động sắp xếp phân cấp theo hình cây (Topological Hierarchy): từ Đơn vị cao nhất (Thành ủy TP.HCM - Cấp 0) &rarr; Đơn vị trực thuộc (Đảng ủy Phường An Đông - Cấp 1) &rarr; Đơn vị cơ sở (Chi bộ Mầm non Hoàng Yến - Cấp 2).</li>
                      <li>Hiển thị thụt lề phân cấp trực quan, kèm nhãn cấp bậc trên cây quản lý cơ cấu tổ chức và danh mục phòng ban.</li>
                    </ul>
                  </li>
                  <li><strong>Phân định Thẩm quyền Phân công công việc & Bảo vệ Danh mục chuẩn:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Chỉ người dùng có chức danh Lãnh đạo hoặc Cán bộ Quản lý (CBQL) mới có thẩm quyền phân công công việc tại phân hệ Giao việc (B1).</li>
                      <li>Cán bộ nhân viên (CBNV) bị khóa các nút sửa, xóa danh mục công việc chuẩn để bảo toàn tính toàn vẹn của danh mục chung.</li>
                      <li>Sau khi Lãnh đạo đã phân công công việc từ văn bản, nút "Phân công" tự động ẩn để tránh thao tác trùng lặp.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* Version 5.1 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-300 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">Phiên bản 5.1</span>
                  <span className="text-xs text-slate-500 font-medium">11/09/2026 - 21:30 (Chuẩn Hóa Phân Quyền CBNV, Nhóm Đối Tượng Báo Cáo & Lọc Lãnh Đạo Trực Tiếp)</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Phân Loại Đối Tượng Công Chức / Viên Chức / Người Lao Động, Tách Nhóm & Tỷ Lệ Xếp Loại Báo Cáo Mẫu 02, Cơ Chế Phân Quyền Động, Phân Quyền Giao Diện CBNV, Lọc Lãnh Đạo Trực Tiếp Theo Đơn Vị & Tinh Gọn Danh Mục Báo Cáo
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Phân loại Người dùng Công chức / Viên chức / Người lao động & Tách nhóm Báo cáo Mẫu 02:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Bổ sung trường phân loại đối tượng nhân sự chuẩn (<code>employee_type</code>): Công chức, Viên chức, Người lao động trong Quản lý người dùng và bộ lọc tìm kiếm.</li>
                      <li>Báo cáo Mẫu 02 tự động phân tách danh sách và bảng thống kê tỷ lệ xếp loại (Hoàn thành xuất sắc, Tốt, Hoàn thành, Không hoàn thành) riêng biệt theo từng nhóm đối tượng Công chức / Viên chức / Người lao động.</li>
                      <li>Thống nhất loại bỏ "Chức vụ chính quyền", quy chuẩn về "Chức vụ / Vị trí việc làm"; sắp xếp lại giao diện chi tiết người dùng gọn gàng, khoa học.</li>
                    </ul>
                  </li>
                  <li><strong>Phân định quyền hạn cho Cán bộ Nhân viên (CBNV) & Phân quyền động:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Đồng bộ trường phân quyền động (<code>permissions</code>) từ vai trò người dùng vào API, giúp các quyền cấp thêm tại Cấu hình hệ thống lập tức có hiệu lực trên toàn bộ giao diện người dùng.</li>
                      <li>Tối ưu giao diện cho tài khoản CBNV thông thường: Ẩn các bước B4 (Chấm điểm CBQL), B5 (Tư vấn kết quả), B6 (Biểu quyết đánh giá) trên menu điều hướng; ẩn Báo cáo Mẫu 02 và các báo cáo tổng hợp toàn cơ quan; bảo vệ route tránh truy cập trực tiếp.</li>
                      <li>Tài khoản CBNV chỉ xem và thực hiện tự đánh giá cá nhân (Mẫu 01) và tiến độ công việc cá nhân (Bảng 1 - PL5).</li>
                    </ul>
                  </li>
                  <li><strong>Lọc Lãnh đạo trực tiếp theo Đơn vị công tác & Chuẩn hóa cấp bậc quản lý:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Khi chọn đơn vị công tác cho từng vị trí làm việc, danh sách chọn "LĐ trực tiếp vị trí này" và "Cán bộ Quản lý trực tiếp" chỉ lọc hiển thị cán bộ có chức danh lãnh đạo/quản lý trong chính đơn vị đó (Người đứng đầu, Cấp phó, Tổ trưởng, chức danh lãnh đạo thực tế), loại bỏ hoàn toàn danh sách toàn bộ cán bộ không liên quan.</li>
                      <li>Tự động reset và sắp xếp thứ bậc lãnh đạo ưu tiên trực quan (👑 Lãnh đạo đứng đầu → ⭐ Cấp phó → 🏷️ Tổ trưởng → Tên A-Z).</li>
                    </ul>
                  </li>
                  <li><strong>Tinh gọn Hệ thống Báo cáo & Bảng Danh sách Đơn vị:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Loại bỏ hoàn toàn báo cáo xếp loại Nghị quyết 98 TPHCM, tập trung tối ưu vào Mẫu 01, Mẫu 02 và Bảng 1 - PL5.</li>
                      <li>Loại bỏ hiển thị cột "Thẩm quyền ký (Chuẩn NĐ 30)" trên bảng Danh sách Đơn vị / Phòng ban theo cây phân cấp, giúp giao diện thông thoáng, vừa vặn không bị tràn ngang màn hình.</li>
                      <li>Chuẩn hóa dữ liệu Đảng viên / Đoàn viên: Không tự động gán mặc định cho toàn bộ tài khoản; chỉ hiển thị khi có phân công cụ thể.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* Version 5.0 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-300 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">Phiên bản 5.0</span>
                  <span className="text-xs text-slate-500 font-medium">11/09/2026 - 15:00 (Đổi Tên Quản Lý Người Dùng, Cây Phân Cấp Đơn Vị & Hỗ Trợ Đa Chức Vụ / Kiêm Nhiệm)</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Đổi Tên Quản Lý Phân Quyền Thành "Quản Lý Người Dùng", Quản Lý Người Dùng Theo Phân Cấp Đơn Vị (Hierarchical Organizational Unit Tree), Hỗ Trợ Cán Bộ Đa Chức Vụ / Kiêm Nhiệm Tại Một Hoặc Nhiều Đơn Vị Theo Chuẩn iCPV TP.HCM
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Đổi tên phân hệ Quản lý phân quyền thành "Quản lý người dùng":</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Đồng bộ tên gọi trên toàn bộ thanh điều hướng (Sidebar), tiêu đề trang (App title), biểu tượng và mô tả phân hệ.</li>
                    </ul>
                  </li>
                  <li><strong>Quản lý Người dùng theo Cây Phân Cấp Đơn vị (Hierarchical Unit Tree):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Tích hợp cây phân cấp tổ chức cơ quan ở cột bên trái: hiển thị mã phân cấp chuẩn iCPV (ví dụ: A29.xx, BTC.TU...), tên đơn vị, số lượng cán bộ và hỗ trợ mở rộng/thu gọn đa tầng.</li>
                      <li>Bộ lọc thông minh: Lựa chọn xem cán bộ theo đơn vị trực tiếp hoặc bật tùy chọn "Bao gồm cả các đơn vị cấp con trực thuộc" để xem toàn bộ cán bộ thuộc nhánh tổ chức.</li>
                      <li>Modal quản lý cơ cấu tổ chức: Thêm, sửa, xóa đơn vị, thiết lập đơn vị cấp trên, cơ quan chủ quản và lãnh đạo phụ trách.</li>
                    </ul>
                  </li>
                  <li><strong>Hỗ trợ Cán bộ Đa Chức Vụ / Kiêm nhiệm (Multi-position Support):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Tuân thủ đúng hướng dẫn triển khai iCPV TP.HCM và tài liệu hướng dẫn PM đánh giá cán bộ: 1 cán bộ có thể được phân công 1 hoặc nhiều chức vụ ở 1 hoặc nhiều đơn vị khác nhau.</li>
                      <li>Đánh dấu rõ ràng "Là chức vụ mặc định" (chức vụ chính) và các chức vụ kiêm nhiệm (chính quyền, Đảng, đoàn thể).</li>
                      <li>Bảng danh sách và thẻ di động hiển thị nổi bật Chức vụ chính kèm huy hiệu Chức vụ kiêm nhiệm tại các đơn vị liên quan.</li>
                      <li>Tương thích ngược 100% với hệ thống chấm điểm KPI, tự đánh giá và xuất báo cáo hiện hành.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* Version 4.9 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-300 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">Phiên bản 4.9</span>
                  <span className="text-xs text-slate-500 font-medium">11/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Thiết Kế Lại Toàn Diện Màn Hình Nộp Sản Phẩm Công Việc, Form Cập Nhật Dạng Accordion Trực Tiếp, Dự Báo Điểm KPI Thời Gian Thực, Tăng Cỡ Chữ Toàn Hệ Thống (+1 Size) & Tối Ưu Giao Diện Di Động / Máy Tính Bảng
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Thiết Kế Lại Giao Diện Màn Hình Nộp Sản Phẩm (Bước 2):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Bố cục card nhiệm vụ hiện đại với vòng tròn phần trăm tiến độ nổi bật (Circular Progress Badge 100%).</li>
                      <li>Bộ 3 khối thông tin riêng biệt, trực quan: <strong>THỜI GIAN</strong> (Hạn hoàn thành & Ngày hoàn thành thực tế kèm icon), <strong>ĐIỂM KPI</strong> (Điểm tối đa & Điểm tự đánh giá), <strong>NGƯỜI PHÂN CÔNG</strong> (Avatar tròn ký tự đầu & Họ tên cán bộ giao việc).</li>
                      <li>Nút thao tác viền đỏ thanh lịch: <code>[∨ Cập nhật]</code> (mở rộng accordion ngay bên dưới) và <code>[Xem phân công]</code> (mở popup chi tiết nhiệm vụ và văn bản).</li>
                    </ul>
                  </li>
                  <li><strong>Form Cập Nhật Kết Quả & Nộp Minh Chứng Dạng Accordion Mở Rộng Trực Tiếp:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Không dùng popup che khuất màn hình; mở rộng trực tiếp ngay dưới card nhiệm vụ giúp cán bộ dễ dàng đối chiếu thông tin công việc khi điền minh chứng.</li>
                      <li>Trường nhập thông tin chuyên nghiệp: Ngày hoàn thành thực tế, Tự đánh giá mức độ chất lượng (4 mức chuẩn: 100% Tốt/Đúng hạn, 80% Hoàn thành, 60% Cần cố gắng, 0% Không đạt), Số văn bản ban hành, Ngày ban hành, Mô tả chi tiết kết quả.</li>
                      <li>Dự báo điểm KPI thời gian thực (Real-time live KPI calculation preview) tính tự động theo quy chế: Điểm tối đa × Tiến độ % × Mức độ chất lượng % + Điểm thưởng đề xuất.</li>
                      <li>Hỗ trợ lưu bản nháp (<code>[Lưu bản nháp]</code>) giúp cán bộ lưu tiến trình mà không làm phiền gửi thông báo đánh giá sớm đến lãnh đạo.</li>
                      <li>Khu vực nộp minh chứng trực quan hỗ trợ Drag & Drop (tối đa 25MB) và tích hợp sẵn tab <em>Lấy kết quả của cấp dưới</em> cho cán bộ quản lý.</li>
                    </ul>
                  </li>
                  <li><strong>Tăng Cỡ Chữ Trong Toàn Hệ Thống Thêm 1 Size:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Nâng cỡ chữ gốc từ 15px lên 16.5px (tương đương +1 size chuẩn font scale), chiều cao dòng 1.6 giúp văn bản, số liệu và bảng biểu đọc cực kỳ rõ nét, không bị mỏi mắt.</li>
                    </ul>
                  </li>
                  <li><strong>Tối Ưu Giao Diện Cho Thiết Bị Di Động & Máy Tính Bảng:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Thanh lọc trạng thái cuộn ngang mượt mà trên màn hình nhỏ.</li>
                      <li>Bộ 3 khối thông tin tự động thích ứng chuyển 1 cột trên Mobile và 2-3 cột trên Tablet/Desktop.</li>
                      <li>Vùng bấm tối ưu cảm ứng (Touch target &gt;= 42px), các nút bấm trên mobile hiển thị đầy đủ và dễ thao tác.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* Version 4.8 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-300 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">Phiên bản 4.8</span>
                  <span className="text-xs text-slate-500 font-medium">11/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Điều Hướng Thao Tác Trực Tiếp Từ Thông Báo Gia Hạn, Cho Phép Lãnh Đạo Chọn Thời Điểm Mới & Chuẩn Hóa Định Dạng Ngày Tháng (DD/MM/YYYY)
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Tương Tác Trực Tiếp Từ Popup Thông Báo Xin Gia Hạn:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Khi Lãnh đạo bấm vào thông báo đề xuất gia hạn công việc, hệ thống tự động chuyển ngay đến màn hình giao việc và tự động mở modal xem xét duyệt gia hạn cho nhiệm vụ đó.</li>
                      <li>Tự động tải dữ liệu nhiệm vụ chính xác ngay cả khi danh sách công việc đang tải nền.</li>
                    </ul>
                  </li>
                  <li><strong>Cho Phép Lãnh Đạo Chọn Thời Điểm Hoàn Thành Mới:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Tại modal xem xét gia hạn, Lãnh đạo có thể trực tiếp chọn/điều chỉnh thời hạn hoàn thành mới (bằng date picker trực quan) thay vì chỉ duyệt cố định ngày cán bộ đề xuất.</li>
                      <li>Mặc định khởi tạo theo ngày cán bộ xin gia hạn, Lãnh đạo có toàn quyền linh hoạt thay đổi thời hạn được duyệt theo tình hình thực tế.</li>
                    </ul>
                  </li>
                  <li><strong>Chuẩn Hóa Quy Cách Định Dạng Ngày Tháng (DD/MM/YYYY):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Toàn bộ thông báo hệ thống (xin gia hạn, duyệt gia hạn, cảnh báo sắp đến hạn, quá hạn...) được hiển thị chuẩn thể thức hành chính Việt Nam theo định dạng DD/MM/YYYY (ví dụ: 15/09/2026 thay vì 2026-09-15).</li>
                      <li>Tự động chuyển đổi dữ liệu thông báo cũ trong cơ sở dữ liệu và bảo vệ 2 lớp tại tầng giao diện và backend.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* Version 4.7 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-300 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">Phiên bản 4.7</span>
                  <span className="text-xs text-slate-500 font-medium">11/09/2026 (Không Giới Hạn Điểm Tối Đa Mỗi Trục)</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Bỏ Giới Hạn Cứng Điểm Tối Đa Mỗi Trục Công Việc (Điểm Tối Đa Là Tổng Điểm Các Công Việc Được Giao) & Giữ Nguyên Cách Tính KPI Hiện Hữu Chuẩn Hướng Dẫn 06
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Không Giới Hạn Điểm Tối Đa Đối Với Mỗi Trục Công Việc:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Loại bỏ hoàn toàn mức trần cố định trước đây của 6 trục (10đ, 15đ, 10đ, 20đ, 10đ, 5đ).</li>
                      <li><strong>Điểm tối đa của mỗi trục:</strong> Được tính bằng chính <strong>tổng điểm các công việc được giao</strong> (hoặc tự đăng ký) thuộc trục đó của cán bộ trong kỳ (Tổng: Điểm chuẩn × Hệ số độ khó).</li>
                      <li>Trục nào cán bộ không được phân công việc sẽ hiển thị điểm tối đa là 0 đ và 0 việc (không còn hiển thị số giả mặc định).</li>
                    </ul>
                  </li>
                  <li><strong>Điểm Đạt Được Của Mỗi Trục & Tỷ Lệ Hoàn Thành:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Điểm đạt được của mỗi trục là tổng điểm quy đổi thực tế của các nhiệm vụ đã hoàn thành và được phê duyệt thuộc trục đó.</li>
                      <li>Tỷ lệ KPI của trục phản ánh chính xác tỷ lệ hoàn thành thực tế so với khối lượng công việc được giao của trục đó.</li>
                    </ul>
                  </li>
                  <li><strong>Điểm Tính KPI Giữ Nguyên Theo Cách Tính Hiện Hữu:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li><strong>Phần B (Kết quả công việc):</strong> Vẫn tính theo công thức chuẩn Hướng dẫn 06-HD/BTCTU: KPI Phần B = 70 × (Tổng điểm quy đổi hoàn thành B / Tổng điểm công việc được giao A) (tối đa 70 điểm).</li>
                      <li><strong>Phần A (Tiêu chí chung):</strong> Tối đa 30 điểm.</li>
                      <li><strong>Điểm thưởng:</strong> Tối đa 7 điểm (10% Phần B).</li>
                      <li><strong>Tổng điểm KPI:</strong> Thang 100 điểm, tự động xếp loại 4 mức theo quy định.</li>
                    </ul>
                  </li>
                  <li><strong>Chuẩn Hóa Giao Diện Bảng Giám Sát (Dashboard):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Cả hai chế độ xem dạng Thẻ (Grid) và dạng Bảng (Table) hiển thị minh bạch: Điểm quy đổi / Điểm được giao.</li>
                      <li>Hàng tổng kết Phần II hiển thị đầy đủ tổng điểm công việc được giao (A), tổng điểm quy đổi đạt được (B) và điểm KPI Phần II quy đổi theo thang 70.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* Version 4.6 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-300 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">Phiên bản 4.6</span>
                  <span className="text-xs text-slate-500 font-medium">11/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Hoàn Thành Việc Nào Gửi Đánh Giá Việc Đó, Tự Động Chuyển Tuyến Người Giao Việc / Lãnh Đạo Đơn Vị & Lãnh Đạo Chuyển Quyền Đánh Giá Cho Quản Lý
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Nộp Sản Phẩm & Gửi Đánh Giá Theo Từng Công Việc (B2 - Thực hiện công việc):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Cán bộ hoàn thành nhiệm vụ nào có thể tải minh chứng (file hoặc link) và gửi đánh giá độc lập ngay cho nhiệm vụ đó mà không cần đợi nộp toàn bộ bảng KPI cuối kỳ.</li>
                      <li>Hệ thống ghi nhận thời gian gửi đánh giá (`submitted_for_eval_at`) và hiển thị huy hiệu trạng thái rõ ràng: <em>"📤 Đã gửi đánh giá - Chờ [Tên người đánh giá] chấm"</em>.</li>
                    </ul>
                  </li>
                  <li><strong>Tự Động Phân Tuyến Người Đánh Giá (Auto-routing):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li><strong>Việc được giao:</strong> Tự động gửi thẳng đến đúng <strong>Người giao việc</strong> (Cán bộ Quản lý hoặc Lãnh đạo đã giao việc).</li>
                      <li><strong>Việc tự đăng ký:</strong> Tự động gửi đến <strong>Lãnh đạo đơn vị</strong> (Hiệu trưởng / Giám đốc đơn vị) để thẩm định kết quả.</li>
                      <li>Hệ thống tự động phát sinh thông báo tức thì đến người được phân công chấm điểm.</li>
                    </ul>
                  </li>
                  <li><strong>Lãnh Đạo Đơn Vị Chuyển Quyền (Ủy Quyền) Đánh Giá Cho Quản Lý (B4 - Đánh giá công việc):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Lãnh đạo đơn vị có quyền chuyển quyền thẩm định & chấm điểm từng công việc hoặc chuyển hàng loạt toàn bộ công việc của nhân viên cho Quản lý cấp dưới (Phó Hiệu trưởng, Tổ trưởng).</li>
                      <li>Cho phép nhập lời nhắn/chỉ đạo ủy quyền (`delegation_note`); Quản lý được ủy quyền sẽ nhận thông báo hệ thống và xuất hiện nhiệm vụ trong danh sách chấm điểm với đầy đủ thẩm quyền cho điểm.</li>
                      <li>Lãnh đạo đơn vị có thể <strong>thu hồi quyền đánh giá</strong> về lại cho Lãnh đạo bất kỳ lúc nào nếu cần thiết.</li>
                      <li>Đồng bộ hóa tức thì hai chiều giữa SQLite cục bộ và Supabase Cloud PostgreSQL.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* Version 4.5 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-300 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">Phiên bản 4.5</span>
                  <span className="text-xs text-slate-500 font-medium">11/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Chuẩn Hóa Điểm KPI Trung Bình Đơn Vị & Reset Toàn Bộ Đánh Giá Về Trạng Thái Chưa Đánh Giá (Bảng Giám Sát & Báo Cáo Mẫu 02)
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Reset Toàn Bộ Đánh Giá Về Trạng Thái "Chưa Đánh Giá":</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Đã thực hiện reset hoàn toàn dữ liệu đánh giá cá nhân (CSDL SQLite và Supabase Cloud PostgreSQL) về trạng thái khởi tạo ban đầu (Chưa đánh giá).</li>
                      <li>Xóa bỏ các điểm tự chấm hoặc dữ liệu chấm điểm thử nghiệm trước đó để bảo đảm tính khách quan, công bằng trước khi các đơn vị chính thức bước vào quy trình tự đánh giá và thẩm định.</li>
                    </ul>
                  </li>
                  <li><strong>Khắc Phục Lỗi Hiển Thị Điểm KPI Trung Bình Khi Chưa Ai Hoàn Thành Đánh Giá:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li><strong>Nguyên nhân:</strong> Do cơ chế khởi tạo mặc định trước đây tự động gán điểm Phần I (30 điểm) cho bản ghi nháp khi cán bộ mở xem màn hình, khiến công thức tính trung bình cộng toàn đơn vị bị cộng dồn điểm nháp.</li>
                      <li><strong>Xử lý triệt để:</strong> Tách biệt hoàn toàn trạng thái Nháp (Draft) với Đã đánh giá (Submitted / Approved). Chỉ khi cán bộ thực sự nộp bản tự đánh giá (B3) hoặc được Cán bộ Quản lý kết luận thẩm định (B4) thì điểm số mới được ghi nhận vào Bảng giám sát và Báo cáo Mẫu 02.</li>
                      <li>Khi chưa có cán bộ nào hoàn thành đánh giá, <strong>Điểm KPI trung bình đơn vị sẽ hiển thị chính xác là 0 điểm</strong> kèm thông báo rõ ràng <em>"Chưa có cán bộ nào thực hiện đánh giá xong"</em>.</li>
                    </ul>
                  </li>
                  <li><strong>Chuẩn Hóa Phân Bổ Xếp Loại Thi Đua:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Các chỉ số thống kê tỷ lệ Xuất sắc, Tốt, Hoàn thành, Không hoàn thành tại Bảng giám sát và Báo cáo tổng hợp Mẫu 02 chỉ tính trên số lượng cán bộ đã có kết quả đánh giá chính thức, không tự động gán cán bộ chưa đánh giá vào mức Hoàn thành.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* Version 4.4 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-300 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">Phiên bản 4.4</span>
                  <span className="text-xs text-slate-500 font-medium">11/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Đồng Bộ Dữ Liệu Tức Thì Khi Admin Xóa Công Việc Bị Giao Sai & Ưu Tiên Sắp Xếp Theo Trục (Trục 1 - 6) Rồi Đến Hạn Sớm Nhất Tại Màn Hình B2 Nộp Sản Phẩm
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Đồng bộ Xóa Dữ liệu Hai Chiều (SQLite & Supabase Cloud):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Khi Quản trị viên (Admin) hoặc Lãnh đạo xóa công việc bị giao sai (xóa đơn lẻ hoặc xóa hàng loạt), lệnh xóa sẽ lập tức được thực thi đồng thời trên SQLite cục bộ và xóa trực tiếp trên Supabase Cloud PostgreSQL.</li>
                      <li>Khắc phục triệt để hiện tượng nhiệm vụ đã xóa nhưng bị "hồi sinh" khi khởi động lại máy chủ hoặc khi kéo đồng bộ ngược từ Cloud.</li>
                      <li>Hủy liên kết tài liệu điều phối (dispatches) an toàn, tránh lỗi khóa ngoại (foreign key constraint).</li>
                    </ul>
                  </li>
                  <li><strong>Tự động Đồng bộ Phía Người dùng (Client-side Realtime Refresh):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Bổ sung cơ chế tự động cập nhật lại danh sách công việc khi người dùng chuyển đổi cửa sổ/tab trình duyệt quay lại hệ thống (Window Focus & Visibility Change).</li>
                      <li>Thêm cơ chế tự động thăm dò (polling) định kỳ và nút <em>"Đồng bộ"</em> thủ công (biểu tượng xoay) tại thanh công cụ Màn hình B2 giúp cán bộ cập nhật danh sách nhiệm vụ tức thì mà không cần tải lại toàn bộ trang.</li>
                    </ul>
                  </li>
                  <li><strong>Màn hình B2 Nộp Sản Phẩm Công Việc - Ưu tiên Sắp xếp Theo Trục & Ngày Đến Hạn:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li><strong>Ưu tiên 1 - Phân nhóm theo Trục:</strong> Toàn bộ nhiệm vụ được gom nhóm và sắp xếp tuần tự theo 6 Trục kết quả trọng tâm (Trục 1 → Trục 2 → Trục 3 → Trục 4 → Trục 5 → Trục 6).</li>
                      <li><strong>Ưu tiên 2 - Sắp đến hạn trước:</strong> Trong từng trục, các công việc có ngày đến hạn (deadline) sớm nhất sẽ tự động được xếp lên đầu để cán bộ ưu tiên xử lý trước.</li>
                      <li><strong>Bộ lọc Trục nhanh & Phân chia Trực quan:</strong> Bổ sung thanh công cụ lọc theo từng Trục (kèm số lượng nhiệm vụ) và tiêu đề phân chia ranh giới giữa các trục rõ ràng.</li>
                      <li><strong>Cảnh báo trực quan Hạn chót:</strong> Hiển thị huy hiệu đỏ nổi bật đối với việc <em>Đã quá hạn</em> và huy hiệu vàng đối với việc <em>Sắp đến hạn</em> (trong vòng 3 ngày).</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* Version 4.3 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-300 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">Phiên bản 4.3</span>
                  <span className="text-xs text-slate-500 font-medium">11/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Chuẩn Hóa Thứ Tự Ưu Tiên Hiển Thị Người Dùng Theo Chức Vụ (Lãnh Đạo - Quản Lý - Giáo Viên - Nhân Viên) & Sắp Xếp Theo Tên Chính Tiếng Việt
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Ưu tiên 1 - Phân tầng theo Chức vụ Hành chính:</strong>
                    <p className="text-slate-500 mt-0.5">Danh sách nhân sự toàn hệ thống được sắp xếp chặt chẽ theo phân cấp chức danh:</p>
                    <ol className="list-decimal pl-5 mt-1 space-y-0.5 text-slate-500">
                      <li><strong>Lãnh đạo:</strong> Hiệu trưởng, Thủ trưởng, Giám đốc đơn vị, Bí thư cấp ủy...</li>
                      <li><strong>Quản lý:</strong> Phó Hiệu trưởng, Phó Thủ trưởng, Cán bộ quản lý phòng/tổ, Tổ trưởng, Tổ phó chuyên môn...</li>
                      <li><strong>Giáo viên:</strong> Toàn thể đội ngũ giáo viên trực tiếp giảng dạy.</li>
                      <li><strong>Nhân viên:</strong> Chuyên viên, nhân viên kế toán, văn thư, thủ quỹ, y tế, phục vụ, bảo vệ...</li>
                      <li><strong>Quản trị viên / Khác:</strong> Tài khoản quản trị hệ thống.</li>
                    </ol>
                  </li>
                  <li><strong>Ưu tiên 2 - Sắp xếp theo Tên chính (không theo họ và chữ lót):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Trong từng nhóm chức vụ, hệ thống tự động bóc tách tên gọi chính cuối cùng để sắp xếp chuẩn mực theo thứ tự bảng chữ cái tiếng Việt (A, Ă, Â, B, C, D, Đ, E...).</li>
                      <li>Trường hợp cán bộ có cùng tên gọi chính, hệ thống tự động căn cứ vào họ và chữ lót để phân định thứ tự chính xác.</li>
                    </ul>
                  </li>
                  <li><strong>Đồng bộ toàn diện trên toàn bộ hệ sinh thái:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Áp dụng đồng bộ tại Phân hệ Quản lý Tài khoản & Nhân sự, Danh bạ liên hệ toàn hệ thống, Hộp chọn phân công / giao việc, Thẩm định chấm điểm và Báo cáo cá nhân.</li>
                      <li>Áp dụng chuẩn hóa vào Bảng tổng hợp xếp loại Mẫu 02 (cả trên bản xem trực tiếp và file xuất Excel chính thức).</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* Version 4.2 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-300 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">Phiên bản 4.2</span>
                  <span className="text-xs text-slate-500 font-medium">11/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Bổ Sung Cột Loại Công Việc & Đánh Số STT Theo Từng Trục (Báo Cáo Công Việc), Chuẩn Hóa Chữ Ký Mẫu 01 & Tinh Gọn Chữ Ký Mẫu 02 Tổng Hợp
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Chuẩn hóa Chữ ký Báo cáo Tự đánh giá Mẫu 01 (Mẫu 01-A & 01-B):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Loại bỏ chức danh ở mục <em>Cá nhân tự đánh giá</em> (chỉ hiển thị họ và tên cán bộ).</li>
                      <li>Loại bỏ chức danh ở mục <em>Xác nhận của Ban Thường vụ cấp ủy hoặc Tập thể lãnh đạo cơ quan, đơn vị</em> (chỉ hiển thị họ và tên Lãnh đạo đơn vị, tự động để trống nếu chính Lãnh đạo tự đánh giá).</li>
                      <li>Đồng bộ đồng nhất cả trên bản xem in HTML và file xuất Excel.</li>
                    </ul>
                  </li>
                  <li><strong>Nâng cấp Báo cáo Kết quả Thực hiện Công việc (Bảng 1 - Phụ lục 5):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Bổ sung cột <strong>Loại công việc</strong> độc lập ngay sau cột Tên công việc, nhiệm vụ (hiển thị rõ Chuyên môn, Định kỳ, Đột xuất...).</li>
                      <li>Cột <em>Tên công việc / Nhiệm vụ</em> được tinh gọn, không thêm bất kỳ ghi chú phụ hay chữ nhỏ nào bên dưới.</li>
                      <li>Ở mỗi trục kết quả trọng tâm, <strong>số thứ tự (STT) công việc được đánh số bắt đầu lại từ 1</strong> (1, 2, 3...) giúp theo dõi trực quan theo từng trục.</li>
                      <li>Loại bỏ chức danh ở mục Cá nhân tự đánh giá và Xác nhận của BTV / Lãnh đạo cơ quan đơn vị.</li>
                    </ul>
                  </li>
                  <li><strong>Chuẩn hóa Mẫu 02 Bảng Tổng hợp Xếp loại Toàn cơ quan:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Mục <em>Người lập biểu</em>: Để trống họ tên và chức danh để bộ phận phụ trách linh hoạt ký duyệt thực tế.</li>
                      <li>Loại bỏ hoàn toàn cột/chỗ ký của <em>Lãnh đạo phòng Tổ chức cán bộ</em>.</li>
                      <li>Mục <em>Thủ trưởng cơ quan, đơn vị</em>: Lấy thông tin họ tên Lãnh đạo đơn vị và loại bỏ chức danh in bên dưới chữ ký.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* Version 4.1 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-300 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">Phiên bản 4.1</span>
                  <span className="text-xs text-slate-500 font-medium">11/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Bổ Sung Trường "Ghi Chú Chi Tiết Kết Quả" Khi Nộp Minh Chứng & Loại Bỏ Ghi Chú Ràng Buộc Thẩm Quyền Chấm Điểm
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Bổ sung trường Ghi chú chi tiết kết quả khi Nộp Minh chứng:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Tại màn hình <em>Nộp sản phẩm công việc (B2)</em>: Bổ sung ô nhập liệu chuyên biệt <em>"Ghi chú chi tiết kết quả"</em> (Textarea) giúp cán bộ giải trình, nêu rõ các kết quả định lượng, sản phẩm cụ thể hoặc thông tin bổ trợ trong quá trình thực hiện nhiệm vụ.</li>
                      <li>Lưu trữ bền vững tại cơ sở dữ liệu SQLite và tự động đồng bộ hai chiều với Supabase Cloud PostgreSQL.</li>
                      <li>Hiển thị trực quan tại Thẻ công việc cá nhân, Thẻ di động, Bảng thẩm định chấm điểm của Quản lý (B4) và Modal chấm điểm hoàn thành giúp người thẩm định nắm bắt đầy đủ thông tin trước khi cho điểm.</li>
                      <li>Tự động liên thông đưa thông tin ghi chú chi tiết kết quả vào file xuất Excel Báo cáo thực hiện công việc (Phụ lục 5).</li>
                    </ul>
                  </li>
                  <li><strong>Tinh gọn Giao diện & Loại bỏ Ghi chú Cũ:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Loại bỏ toàn bộ thông báo ghi chú <em>"Việc ai giao thì người đó chấm điểm hoàn thành trong hệ thống"</em> tại các phân hệ Giao việc, Nộp sản phẩm công việc và Đánh giá, chấm điểm (B4).</li>
                      <li>Giúp giao diện người dùng trở nên thông thoáng, thanh lịch, tập trung vào trọng tâm nghiệp vụ theo đúng quy định.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* Version 4.0 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-300 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">Phiên bản 4.0</span>
                  <span className="text-xs text-slate-500 font-medium">11/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Gia Hạn Tiến Độ Công Việc (Lãnh Đạo Gia Hạn, CBNV Xin Gia Hạn Khi Đến/Quá Hạn) & Hệ Thống Quét Tự Động Thông Báo Hàng Ngày Việc Đến Hạn / Quá Hạn
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Lãnh đạo Chủ động Gia hạn Tiến độ:</strong> Cho phép Lãnh đạo / Người giao việc chủ động cập nhật thời hạn hoàn thành mới (deadline) kèm lý do điều chỉnh trực tiếp trên giao diện Giao việc.</li>
                  <li><strong>CBNV Yêu cầu Gia hạn Gửi Lãnh đạo Duyệt:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Cán bộ nhân viên có nút <em>Xin gia hạn</em> tại mục Nhiệm vụ cá nhân và Nộp sản phẩm công việc để đề xuất hạn mới và nêu rõ lý do.</li>
                      <li><strong>Ràng buộc bảo đảm kỷ cương hành chính:</strong> Nút <em>Xin gia hạn</em> <strong>chỉ hiển thị khi công việc đã đến hạn hôm nay hoặc đã quá hạn</strong> theo đúng thời gian thực.</li>
                      <li>Lãnh đạo nhận được thông báo yêu cầu gia hạn và có thể chọn <em>Phê duyệt</em> (tự động cập nhật hạn mới vào nhiệm vụ) hoặc <em>Từ chối</em> kèm lý do.</li>
                    </ul>
                  </li>
                  <li><strong>Hệ thống Quét Định kỳ Tự động & Thông báo Nhắc hạn Hàng ngày:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Hệ thống backend tự động quét định kỳ mỗi ngày các nhiệm vụ đang thực hiện: gửi cảnh báo đỏ đối với việc đã quá hạn và nhắc nhở vàng đối với việc đến hạn hôm nay hoặc còn 1-3 ngày.</li>
                      <li>Cơ chế thông minh chống gửi lặp thông báo trong ngày (idempotency), lưu trữ bền vững tại cơ sở dữ liệu và đồng bộ lên Supabase Cloud.</li>
                      <li>Kết nối trực tiếp Chuông thông báo trên Header với cơ sở dữ liệu: hiển thị số lượng chưa đọc theo thời gian thực, xem chi tiết và click để chuyển ngay tới nhiệm vụ cần xử lý.</li>
                    </ul>
                  </li>
                  <li><strong>Hoàn thiện Báo cáo Đánh giá & Chức vụ Đoàn thể:</strong> Bổ sung mục Chức vụ đoàn thể trong hồ sơ người dùng và các báo cáo; tự động bỏ trống người ký xác nhận nếu cá nhân được đánh giá là Lãnh đạo đơn vị; phân nhóm 6 Trục kết quả trọng tâm trong Báo cáo thực hiện công việc.</li>
                </ul>
              </div>

              {/* Version 3.9 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-300 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">Phiên bản 3.9</span>
                  <span className="text-xs text-slate-500 font-medium">11/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Chuẩn Hóa Đánh Số Quy Trình 6 Bước (B1 - B6), Phân Quyền Admin Xóa Công Việc Đã Giao, Thu Hồi & Trả Lại Nhiệm Vụ, Loại Bỏ Tài Khoản Chức Năng Khỏi Hội Đồng Biểu Quyết
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Chuẩn hóa & Đánh số Quy trình Đánh giá 6 Bước Liền Mạch (B1 - B6):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Đánh số rõ ràng thứ tự các bước trên Sidebar menu: <em>B1. Giao & Tiếp nhận việc</em> → <em>B2. Nộp sản phẩm công việc</em> → <em>B3. Tự đánh giá cuối kỳ</em> → <em>B4. Đánh giá, nhận xét (CBQL)</em> → <em>B5. Tổng hợp tham mưu</em> → <em>B6. Biểu quyết xếp loại</em>.</li>
                      <li>Đồng bộ toàn diện các điều kiện tiên quyết và thông báo liên thông giữa Bước 4 và Bước 5: CBQL chỉ được kết luận Bước 4 khi cán bộ hoàn tất nộp tự đánh giá (B3) và nộp đủ minh chứng sản phẩm (B2); hoàn tất Bước 4 dữ liệu mới được đẩy lên Bước 5 (Tổng hợp tham mưu).</li>
                    </ul>
                  </li>
                  <li><strong>Phân quyền Admin Xóa & Xóa Hàng Loạt Công Việc Đã Giao:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Cho phép Quản trị viên (Admin hệ thống và Admin đơn vị) được phép xóa các công việc đã giao ở bất kỳ trạng thái nào (kể cả đã duyệt kết quả) và không bị giới hạn phạm vi người giao.</li>
                      <li>Bổ sung nút <em>Xóa</em> riêng biệt (màu đỏ kèm biểu tượng thùng rác) trên Bảng tổng hợp theo nhân sự, Bảng chi tiết dạng phẳng, Thẻ di động và Danh sách gần đây tại Dashboard.</li>
                      <li>Tích hợp hộp chọn Checkbox và thanh công cụ Xóa hàng loạt (Bulk Delete) giúp Admin xử lý nhanh nhiều công việc cùng lúc.</li>
                    </ul>
                  </li>
                  <li><strong>Tính năng Thu Hồi Công Việc Giao Nhầm & Trả Lại Công Việc:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Bổ sung tính năng cho phép Lãnh đạo / Người giao thu hồi kịp thời các nhiệm vụ đã giao nhầm hoặc cần điều chỉnh.</li>
                      <li>Cho phép Cán bộ nhận việc gửi <em>Trả lại việc</em> kèm lý do về người giao nếu nhiệm vụ chưa phù hợp. Khi cán bộ bấm <em>Nhận việc</em>, công việc sẽ tự động chuyển vào mục Công việc cá nhân để tiến hành thực hiện và nộp minh chứng.</li>
                    </ul>
                  </li>
                  <li><strong>Chuẩn hóa Danh Mục Công Việc Chuẩn Toàn Cơ Quan:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Danh mục công việc chuẩn được hiển thị dùng chung cho toàn bộ CBQL và CBNV trong cùng cơ quan/đơn vị.</li>
                      <li>Phân quyền chặt chẽ: Chỉ Admin và Lãnh đạo có quyền Duyệt / Sửa / Xóa; người dùng khác chỉ được đề xuất thêm mới hoặc sửa, sau khi Lãnh đạo duyệt mới được cập nhật vào danh mục chung.</li>
                    </ul>
                  </li>
                  <li><strong>Loại bỏ Tài khoản Chức năng Khỏi Hội Đồng Biểu Quyết:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Tự động sàng lọc loại trừ các tài khoản quản trị chức năng / miễn đánh giá (Admin, Admin đơn vị) ra khỏi hội đồng biểu quyết xếp loại tại Bước 6, đảm bảo tính khách quan và quy chế bỏ phiếu.</li>
                    </ul>
                  </li>
                  <li><strong>Chuẩn Hóa Chữ Ký Báo Cáo & Xử Lý Trường Hợp Lãnh Đạo Đơn Vị Tự Đánh Giá:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Tại Bản tự đánh giá (Mẫu 01-A, 01-B) và Báo cáo thực hiện công việc: Mục Xác nhận của Ban Thường vụ / Tập thể lãnh đạo hiển thị họ tên Lãnh đạo đơn vị.</li>
                      <li>Trường hợp cá nhân tự đánh giá chính là Lãnh đạo đơn vị: Hệ thống tự động <em>bỏ trống người ký</em> tại mục Xác nhận để sẵn sàng trình cấp trên có thẩm quyền ký duyệt, đóng dấu.</li>
                    </ul>
                  </li>
                  <li><strong>Cải Tiến Báo Cáo Kết Quả Thực Hiện Công Việc (Bảng 1 - Phụ Lục 5):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Loại bỏ cột <em>Nguồn việc</em> khỏi bảng in/xuất báo cáo, tinh gọn biểu mẫu theo đúng thể thức Hướng dẫn 06-HD/BTCTU.</li>
                      <li>Tự động phân nhóm công việc theo từng trụ cột kết quả, hiển thị dòng tiêu đề nhóm nêu rõ nội dung trụ cột, số lượng nhiệm vụ và tổng điểm quy đổi của trục.</li>
                    </ul>
                  </li>
                  <li><strong>Hoàn Thiện Mẫu 02 Tổng Hợp Toàn Cơ Quan & Bổ Sung Chức Vụ Đoàn Thể:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Loại bỏ dòng ghi chú mẫu đánh giá dưới tên cán bộ tại Mẫu 02 Tổng hợp xếp loại toàn đơn vị.</li>
                      <li>Bổ sung mục <em>Chức vụ đoàn thể</em> trong cấu hình người dùng và tự động liên thông đưa thông tin chức vụ đoàn thể vào toàn bộ hệ thống báo cáo in ấn và xuất file Excel.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* Version 3.8 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-400 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">Phiên bản 3.8</span>
                  <span className="text-xs text-slate-500 font-medium">10/09/2026 (Tối ưu hóa Toàn diện Mobile & Tablet)</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Thanh Điều Hướng Đáy Tiện Dụng (Bottom Nav Dock) & Hệ Thống Thẻ Cảm Ứng (Card Views) Thay Thế Bảng Ngang Trên Di Động
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Thanh điều hướng đáy tiện dụng (Mobile Bottom Navigation Dock):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Bổ sung thanh điều hướng đáy dạng kính mờ cố định ở cạnh dưới màn hình trên điện thoại và máy tính bảng: Chuyển đổi 1 chạm nhanh giữa <em>Tổng quan</em>, <em>Văn bản</em>, <em>Giao việc</em>, <em>Đánh giá/Nộp việc</em> và <em>Menu mở rộng</em>.</li>
                      <li>Tự động căn chỉnh khoảng trống an toàn (Safe Area Inset) cho iPhone và thiết bị màn hình tai thỏ/nốt ruồi, triệt tiêu tình trạng che khuất nội dung.</li>
                    </ul>
                  </li>
                  <li><strong>Giao diện Thẻ Cảm ứng (Card Views) thay thế bảng cuộn 1400px:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li><em>Phân hệ Giao việc:</em> Thẻ nhiệm vụ và Thẻ tổng hợp nhân sự trực quan, hiển thị rõ hạn định, điểm chuẩn/quy đổi, tiến độ % và nút nộp minh chứng / duyệt kết quả to rõ, chạm nhẹ bằng ngón tay.</li>
                      <li><em>Phân hệ Quản lý Cán bộ:</em> Thẻ hồ sơ cán bộ hiển thị đầy đủ chức danh, phòng ban, tuyến quản lý và khối nút thao tác nhanh: Sửa, Cấp lại MK, Khóa/Mở, Xóa.</li>
                      <li><em>Phân hệ Danh mục Chuẩn:</em> Thẻ công việc chuẩn hiển thị mã, đầu ra, điểm quy đổi kèm nút Giao việc và Chỉnh sửa cảm ứng.</li>
                    </ul>
                  </li>
                  <li><strong>Tối ưu hóa Hộp thoại (Modals) & Chống lỗi Auto-Zoom:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Chuẩn hóa kích thước nút bấm tối thiểu 42px - 44px ngăn ngừa bấm nhầm trên màn hình nhỏ.</li>
                      <li>Cấu hình kích thước ô nhập liệu từ 16px trên mobile, ngăn ngừa hiện tượng màn hình tự động phóng to (auto-zoom) phiền toái trên trình duyệt Safari iOS.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* Version 3.7 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-400 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">Phiên bản 3.7</span>
                  <span className="text-xs text-slate-500 font-medium">10/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Quy Trình Văn Thư Trình Lãnh Đạo, Phân Bổ Văn Bản Đọc Tham Khảo / Giao Xử Lý & Phân Bổ Theo Nhóm Chức Danh, Nhóm Tự Tạo
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Quy trình Văn thư trình Lãnh đạo chỉ đạo (Submit to Leader):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Bổ sung tính năng cho phép Văn thư tiếp nhận văn bản và gửi tờ trình / ý kiến trình Lãnh đạo cơ quan/đơn vị xem xét, cho ý kiến chỉ đạo trước khi phân phối.</li>
                      <li>Trạng thái văn bản chuyển sang <em>"Chờ LĐ chỉ đạo"</em> (thẻ thống kê tím nổi bật), kèm ghi chú tờ trình văn thư, thời gian trình và chỉ đạo của lãnh đạo.</li>
                    </ul>
                  </li>
                  <li><strong>Đa dạng hóa hình thức Phân bổ Văn bản:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li><strong>Giao nhiệm vụ xử lý (Process):</strong> Phân công cán bộ phụ trách chính hoặc phối hợp xử lý, tự động tạo nhiệm vụ gắn KPI trong hệ thống đánh giá.</li>
                      <li><strong>Chuyển văn bản đọc tham khảo (Reference Only):</strong> Phân phối văn bản để cán bộ nhân viên nghiên cứu, nắm bắt thông tin chỉ đạo mà <em>không bắt buộc tạo KPI</em> hay chấm điểm.</li>
                    </ul>
                  </li>
                  <li><strong>3 Hình thức phân bổ đối tượng thông minh (Cá nhân / Chức danh / Nhóm tự tạo):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li><em>Chỉ định từng cá nhân:</em> Chọn lọc đích danh từng cán bộ thực hiện hoặc phối hợp.</li>
                      <li><em>Theo nhóm chức danh / chức vụ:</em> Một chạm chọn toàn bộ cán bộ thuộc chức danh (ví dụ: toàn bộ Giáo viên, Nhân viên...).</li>
                      <li><em>Theo nhóm người dùng tự tạo:</em> Cho phép quản lý và tạo các tổ, ban, hội đồng hoặc nhóm công tác chuyên trách theo nhu cầu thực tế của cơ quan.</li>
                    </ul>
                  </li>
                  <li><strong>Tương thích hoàn toàn với Module Giao việc:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Tại tab <em>Giao việc</em>, người lãnh đạo/quản lý có thể nhanh chóng giao nhiệm vụ cho hàng loạt cán bộ theo nhóm chức danh hoặc nhóm người dùng tự tạo.</li>
                    </ul>
                  </li>
                  <li><strong>Đồng bộ Realtime 100% 16/16 Bảng với Supabase Cloud PostgreSQL:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Bổ sung 2 bảng <code>user_groups</code> và <code>user_group_members</code> cùng các trường dữ liệu chỉ đạo của lãnh đạo vào cơ chế đồng bộ tức thời hai chiều giữa SQLite và Supabase Cloud.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* Version 3.6 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-400 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">Phiên bản 3.6</span>
                  <span className="text-xs text-slate-500 font-medium">10/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Khắc Phục Triệt Để Phân Quyền Cán Bộ & Kích Hoạt Đồng Bộ Dữ Liệu Tức Thời 100% Lên Supabase Cloud và Cloudflare R2
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Khắc phục triệt để lỗi phân quyền & Mẫu đánh giá cán bộ (Role & Evaluation Template Persistence):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Sửa đổi cơ chế nhận diện vai trò trong phân hệ Quản lý Cán bộ: Cán bộ được phân công vai trò Phó Hiệu trưởng (<code>hieu_pho</code>), Tổ trưởng chuyên môn (<code>to_truong</code>), Lãnh đạo Phòng/Đơn vị (<code>cbql_phong</code>), Lãnh đạo Cơ quan (<code>ld_coquan</code>) hoặc Quản trị đơn vị (<code>admin_donvi</code>) đều giữ vững 100% vai trò quản lý và thẩm quyền dữ liệu tương ứng.</li>
                      <li>Tôn trọng tuyệt đối lựa chọn <strong>Mẫu đánh giá KPI</strong> (Mẫu 01-A của Lãnh đạo/Quản lý vs Mẫu 01-B của CBNV), loại bỏ hoàn toàn tình trạng bị hệ thống tự động trả về CBNV sau khi tải lại trang.</li>
                    </ul>
                  </li>
                  <li><strong>Cơ chế Ghi trực tiếp tức thời (Write-Through Synchronous Sync):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Khi Quản trị viên cập nhật thông tin cán bộ, cấp lại mật khẩu, tạo mới hoặc vô hiệu hóa tài khoản, máy chủ đồng thời ghi trực tiếp xuống cả SQLite và Supabase PostgreSQL Cloud trước khi phản hồi thành công về giao diện. Đảm bảo 0 delay và độ tin cậy tuyệt đối.</li>
                    </ul>
                  </li>
                  <li><strong>Tầng Middleware Đồng bộ Tự động Liên tục (Continuous Live Realtime Sync):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Thiết lập Middleware tự động lắng nghe 100% các thao tác thay đổi dữ liệu (<code>POST</code>, <code>PUT</code>, <code>PATCH</code>, <code>DELETE</code>) trên toàn bộ hệ thống (giao việc, nộp minh chứng, chấm điểm, tự đánh giá, biểu quyết xếp loại, ban hành văn bản, cấu hình hệ thống).</li>
                      <li>Tự động kích hoạt đồng bộ ngầm lên Supabase Cloud với độ trễ siêu tốc chỉ <strong>300ms</strong>, bảo đảm dữ liệu trên hệ thống thật luôn sống realtime và an toàn tuyệt đối.</li>
                    </ul>
                  </li>
                  <li><strong>Khởi động Đồng bộ Hai chiều Toàn vẹn 14/14 Bảng (<code>syncWithSupabaseOnStartup</code>):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Khi container máy chủ Render khởi động lại hoặc deploy mới, hệ thống tự động xác định Supabase Cloud là <strong>Nguồn chân lý duy nhất (Single Source of Truth)</strong> và nạp toàn bộ dữ liệu sống của <strong>14 bảng</strong> theo đúng chuẩn ràng buộc khóa ngoại (users, departments, roles, periods, axes, common_criteria, standard_tasks, documents, assigned_tasks, document_dispatches, evaluations, criteria_details, votes, system_configs).</li>
                      <li>Dữ liệu sống trên môi trường thật 100% không bao giờ bị mất hoặc bị ghi đè bởi file database cũ trong git khi Render restart.</li>
                    </ul>
                  </li>
                  <li><strong>Bảo toàn Lưu trữ Tệp tin trên Đám mây Cloudflare R2:</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li>Toàn bộ hồ sơ văn bản hành chính, quyết định và minh chứng công việc tải lên được đẩy trực tiếp lên Cloudflare R2 bucket <code>kpi-storage</code> và phân phối qua CDN công khai vĩnh viễn, không phụ thuộc vào bộ nhớ cục bộ của server.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* Version 3.5 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-400 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">Phiên bản 3.5</span>
                  <span className="text-xs text-slate-500 font-medium">10/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Bổ Sung Phân Quyền Quản Trị Đơn Vị (User Chức Năng - Miễn Đánh Giá), Tái Cấu Trúc Bố Cục Chi Tiết Cán Bộ & Hệ Thống Hoạt Động 24/7 Không Sleep
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Phân quyền Quản trị đơn vị (admin_donvi - User chức năng):</strong> Bổ sung vai trò quản trị viên cấp đơn vị/phòng ban. Tài khoản này đóng vai trò tài khoản chức năng chuyên trách quản lý danh sách cán bộ và danh mục công việc của đơn vị trực thuộc, được <em>miễn hoàn toàn việc tự đánh giá, chấm điểm KPI và lấy phiếu tín nhiệm</em> (tương tự như Quản trị hệ thống).</li>
                  <li><strong>Tái cấu trúc bố cục Chi tiết Người dùng (Modal Add/Edit User):</strong> Tái thiết kế toàn diện modal quản lý cán bộ khoa học, mạch lạc thành 3 khối thẻ chuyên biệt:
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li><em>Tài khoản & Phân quyền Hệ thống:</em> Tên đăng nhập, mật khẩu, vai trò kèm nhãn cảnh báo User chức năng tự động, mẫu phiếu KPI thông minh tự khóa đối với tài khoản miễn đánh giá.</li>
                      <li><em>Đơn vị công tác & Tuyến Quản lý:</em> Phòng ban trực thuộc, chức vụ quản lý, người quản lý trực tiếp và người đánh giá cuối cùng.</li>
                      <li><em>Thông tin Cá nhân & Chức danh:</em> Họ và tên, chức vụ / vị trí việc làm, chức vụ Đảng, ngày sinh (bộ chọn ngày), giới tính (Nam/Nữ), điện thoại, email.</li>
                    </ul>
                  </li>
                  <li><strong>Cơ chế 24/7 Anti-Sleep & High-Availability (Hệ thống chạy ổn định liên tục, không ngủ):</strong>
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li><strong>Tự động gửi nhịp tim giữ sóng ngầm (Keep-Alive Heartbeat Daemon):</strong> Tự động gửi ping kiểm tra sức khỏe mỗi 8 phút tới URL công khai của dịch vụ Render (qua endpoint <code>/api/health</code>), liên tục làm mới bộ đếm thời gian, triệt tiêu hoàn toàn độ trễ khởi động lại (cold-start) và hiện tượng máy chủ rơi vào trạng thái ngủ khi vắng người truy cập.</li>
                      <li><strong>Cấu hình điểm kiểm tra sức khỏe dịch vụ (Health Check Path):</strong> Tích hợp <code>healthCheckPath: /api/health</code> trong <code>render.yaml</code> phục vụ giám sát tình trạng máy chủ tự động.</li>
                      <li><strong>Lớp màng bảo vệ tiến trình & Dọn dẹp bộ đệm định kỳ:</strong> Tích hợp bộ bắt lỗi toàn cục <code>uncaughtException</code> và <code>unhandledRejection</code> ngăn ngừa crash tiến trình Node.js; tự động checkpoint cơ sở dữ liệu SQLite WAL mỗi 30 phút duy trì hiệu năng tối đa.</li>
                    </ul>
                  </li>
                  <li><strong>Quy tắc Thẩm định & Chấm điểm hoàn thành công việc:</strong> Bổ sung chỉ dẫn và cơ chế phân định thẩm quyền chấm điểm hoàn thành trong module cập nhật công việc:
                    <ul className="list-[circle] pl-4 mt-1 space-y-0.5 text-slate-500">
                      <li><em>Nhiệm vụ được phân công:</em> <strong>Việc ai giao thì người đó chấm điểm hoàn thành</strong> (người giao việc trực tiếp theo dõi, thẩm định sản phẩm và chấm điểm).</li>
                      <li><em>Nhiệm vụ tự đăng ký:</em> Mặc định người thẩm định và chấm điểm là <strong>Lãnh đạo đơn vị</strong> (Trưởng phòng/ban hoặc Lãnh đạo phụ trách).</li>
                      <li>Tích hợp huy hiệu nhận diện người chấm điểm, thông báo nhắc việc tại màn hình nộp minh chứng và bảng thẩm định chấm điểm.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* Version 3.4 */}
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-2">
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-400 border-2 border-white shadow-xs"></span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">Phiên bản 3.4</span>
                  <span className="text-xs text-slate-500 font-medium">10/09/2026</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Tự Động Đồng Bộ & Khôi Phục CSDL Supabase Cloud, Bảo Toàn Tuyệt Đối Dữ Liệu Cán Bộ Sau Khi Update Code
                </h4>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Tự động sao lưu ngầm lên Supabase Cloud (Auto-Sync Background):</strong> Khi nhập danh sách cán bộ, tạo/sửa người dùng hoặc nạp danh mục công việc chuẩn từ Excel, hệ thống lập tức tự động đồng bộ ngầm lên đám mây Supabase PostgreSQL, bảo đảm dữ liệu luôn được lưu trữ vĩnh viễn trên đám mây.</li>
                  <li><strong>Tự động khôi phục dữ liệu khi máy chủ khởi động lại (Auto-Restore on Boot):</strong> Khi Render tạo container mới hoặc khởi động lại (ephemeral container), hệ thống tự động kiểm tra và kéo toàn bộ dữ liệu cán bộ, phân công, điểm đánh giá từ Supabase Cloud về SQLite cục bộ, bảo toàn 100% dữ liệu mà không lo bị mất sau mỗi lần cập nhật mã nguồn.</li>
                  <li><strong>Cơ chế tự động thử lại kết nối (Auto-retry & Retry Button):</strong> Tự động gửi lại yêu cầu sau 2.5 giây khi phát hiện máy chủ Render đang khởi động lại hoặc sau trạng thái ngủ (cold-start); bổ sung nút <em>"Thử lại ngay"</em> trực tiếp trong hộp cảnh báo lỗi.</li>
                  <li><strong>Kiểm soát an toàn ràng buộc Khóa Ngoại (Foreign Key) Kỳ Đánh Giá:</strong> Cơ chế tự kiểm tra và fallback thông minh gán kỳ đánh giá hiện hành nếu file Excel hoặc tham số gửi lên không khớp với CSDL, loại bỏ hoàn toàn lỗi <code>FOREIGN KEY constraint failed</code>.</li>
                  <li><strong>Cấu hình Render Blueprint chuẩn (render.yaml):</strong> Bổ sung tệp cấu hình Blueprint tự động thiết lập biến môi trường, chu trình build và host binding <code>0.0.0.0</code> đáp ứng mọi hạ tầng đám mây.</li>
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

      {/* ============================================================== */}
      {/* 8. REALTIME FLOATING POPUP NOTIFICATION FOR CBQL / LÃNH ĐẠO    */}
      {/* ============================================================== */}
      {activeToastNotif && (
        <div className="fixed top-20 right-4 sm:right-6 z-50 max-w-md w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 border-2 border-red-500 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-4 duration-300">
          <div className="bg-gradient-to-r from-red-700 via-red-800 to-slate-900 text-white px-4 py-2.5 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-300 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
              </span>
              <span className="text-xs font-bold uppercase tracking-wider">
                🔔 Thông báo gửi tới Lãnh đạo / CBQL
              </span>
            </div>
            <button
              type="button"
              onClick={handleCloseToast}
              className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
              title="Đóng thông báo nổi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 flex items-center justify-center shrink-0 shadow-xs font-bold text-base">
                {activeToastNotif.type === 'standard_task_proposal' ? '✨' : 
                 activeToastNotif.type === 'task_registered' ? '📋' : '⏳'}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                  {activeToastNotif.title}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed line-clamp-3">
                  {formatMessageDates(activeToastNotif.message)}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400">
                {activeToastNotif.time || formatNotifTime(activeToastNotif.created_at)}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCloseToast}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                >
                  Để sau
                </button>
                <button
                  type="button"
                  onClick={handleToastAction}
                  className="px-4 py-1.5 text-xs font-bold bg-red-700 hover:bg-red-800 text-white rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer animate-pulse"
                >
                  <span>Xem & Phê duyệt ngay</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}