import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Search,
  FileCode,
  LogOut,
  Menu,
  X,
  Scale,
  Upload,
  BookOpen,
  Settings,
  ShieldCheck,
  Library,
  ChevronRight,
  User,
  Bell,
  ChevronDown,
  Loader2,
  Sun,
  Moon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGlobalLoading } from '@/lib/loading';
import { clearSensitiveData, savePreferences, loadPreferences } from '@/lib/storage';

const navItems = [
  { to: '/', label: '仪表盘', icon: LayoutDashboard },
  { to: '/cases', label: '案件管理', icon: Briefcase },
  { to: '/evidence', label: '证据管理', icon: Upload },
  { to: '/documents', label: '文书生成', icon: FileText },
  { to: '/contracts', label: '合同审查', icon: ShieldCheck },
  { to: '/research', label: '法律研究', icon: BookOpen },
  { to: '/knowledge', label: '知识库', icon: Library },
  { to: '/search', label: '法律检索', icon: Search },
  { to: '/templates', label: '模板管理', icon: FileCode },
  { to: '/settings', label: '系统设置', icon: Settings },
];

/** Build breadcrumb segments from pathname */
function useBreadcrumbs() {
  const location = useLocation();
  const pathMap: Record<string, string> = {
    '/': '仪表盘',
    '/cases': '案件管理',
    '/evidence': '证据管理',
    '/documents': '文书生成',
    '/contracts': '合同审查',
    '/research': '法律研究',
    '/knowledge': '知识库',
    '/search': '法律检索',
    '/templates': '模板管理',
    '/settings': '系统设置',
  };

  const segments = location.pathname
    .split('/')
    .filter(Boolean)
    .reduce<Array<{ path: string; label: string }>>((acc, seg, idx) => {
      const path = '/' + location.pathname.split('/').filter(Boolean).slice(0, idx + 1).join('/');
      const label = pathMap[path] || seg;
      acc.push({ path, label });
      return acc;
    }, []);

  // Always start with home
  if (segments.length === 0 || segments[0].path !== '/') {
    return [{ path: '/', label: '首页' }, ...segments];
  }
  return segments.length > 0 ? segments : [{ path: '/', label: '首页' }];
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userDropdown, setUserDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { isLoading } = useGlobalLoading();

  // Dark mode support
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  // Initialize dark mode from localStorage or system preference
  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    } else if (stored === 'light') {
      document.documentElement.classList.remove('dark');
      setIsDark(false);
    } else {
      // No stored preference: follow system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        document.documentElement.classList.add('dark');
        setIsDark(true);
      }
    }
  }, []);

  const toggleDarkMode = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  // Save last page preference on navigation
  useEffect(() => {
    savePreferences({ lastPage: location.pathname });
  }, [location.pathname]);

  const userStr = localStorage.getItem('user');
  const user = useMemo<{ name?: string; email?: string } | null>(() => {
    try {
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  }, [userStr]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setUserDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    clearSensitiveData();
    navigate('/login');
  };

  const breadcrumbs = useBreadcrumbs();

  const linkClass = useCallback(({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
      isActive
        ? 'bg-primary text-primary-foreground shadow-sm'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
    ), []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-card transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <Scale className="h-7 w-7 text-primary" />
          <span className="text-lg font-bold tracking-tight">LawMind AI</span>
          {/* Close button on mobile */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto rounded p-1 hover:bg-accent lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="主导航">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={linkClass}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t p-3" ref={dropdownRef}>
          <button
            onClick={() => setUserDropdown(!userDropdown)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="truncate text-sm font-medium">{user?.name || '用户'}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email || ''}</p>
            </div>
            <ChevronDown className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              userDropdown && 'rotate-180',
            )} />
          </button>

          {/* Dropdown menu */}
          {userDropdown && (
            <div className="mt-1 rounded-lg border bg-card py-1 shadow-lg">
              <button
                onClick={() => {
                  setUserDropdown(false);
                  navigate('/settings');
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <User className="h-4 w-4" />
                个人设置
              </button>
              <button
                onClick={() => {
                  setUserDropdown(false);
                  navigate('/settings');
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Bell className="h-4 w-4" />
                通知设置
              </button>
              <div className="my-1 border-t" />
              <button
                onClick={() => {
                  setUserDropdown(false);
                  handleLogout();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center gap-3 border-b bg-card px-4 lg:px-6" role="banner">
          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-md p-2 hover:bg-accent lg:hidden"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <Scale className="h-5 w-5 text-primary" />
            <span className="text-sm font-bold">LawMind AI</span>
          </div>

          {/* Breadcrumb (desktop) */}
          <nav className="hidden items-center gap-1 text-sm lg:flex">
            {breadcrumbs.map((crumb, idx) => (
              <span key={crumb.path} className="flex items-center gap-1">
                {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                {idx === breadcrumbs.length - 1 ? (
                  <span className="font-medium text-foreground">{crumb.label}</span>
                ) : (
                  <button
                    onClick={() => navigate(crumb.path)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {crumb.label}
                  </button>
                )}
              </span>
            ))}
          </nav>

          {/* Breadcrumb (mobile - show only current page) */}
          <span className="flex-1 text-center text-sm font-medium lg:hidden">
            {breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].label : ''}
          </span>

          {/* Right side actions */}
          <div className="ml-auto flex items-center gap-2">
            {/* Global loading spinner */}
            {isLoading && (
              <div role="status" aria-label="加载中" className="flex items-center gap-1.5">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground hidden sm:inline">加载中</span>
              </div>
            )}
            {/* Notification bell */}
            <button
              className="relative rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="通知"
              onClick={() => navigate('/settings')}
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 flex h-2 w-2 items-center justify-center rounded-full bg-red-500">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              </span>
            </button>

            {/* Dark mode toggle */}
            <button
              onClick={toggleDarkMode}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title={isDark ? '切换到亮色模式' : '切换到暗色模式'}
              aria-label={isDark ? '切换到亮色模式' : '切换到暗色模式'}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* User avatar (desktop) */}
            <button
              onClick={() => navigate('/settings')}
              className="hidden items-center gap-2 rounded-md p-1.5 hover:bg-accent lg:flex"
              title="个人设置"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main id="main-content" className="flex-1 overflow-y-auto p-4 lg:p-8" role="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
