import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

export default function Layout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const userStr = localStorage.getItem('user');
  let user: { name?: string; email?: string } | null = null;
  try {
    user = userStr ? JSON.parse(userStr) : null;
  } catch {
    user = null;
  }

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
      isActive
        ? 'bg-primary text-primary-foreground shadow-sm'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
    );

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
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={linkClass}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">{user?.name || '用户'}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email || ''}</p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              title="退出登录"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar for mobile */}
        <header className="flex h-16 items-center gap-4 border-b px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-md p-2 hover:bg-accent"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" />
            <span className="font-bold">LawMind AI</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
