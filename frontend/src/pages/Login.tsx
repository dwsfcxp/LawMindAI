import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Scale, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { authApi } from '@/lib/api';
import { announceToScreenReader } from '@/lib/accessibility';

const REMEMBER_KEY = 'lawmind_remember_email';

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Password strength: returns 0-3 */
function getPasswordStrength(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 6) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 3);
}

const STRENGTH_LABELS = ['', '弱', '中', '强'];
const STRENGTH_COLORS = ['', 'bg-red-400', 'bg-amber-400', 'bg-green-500'];

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [rememberMe, setRememberMe] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
  });

  // Load remembered email on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem(REMEMBER_KEY);
    if (savedEmail) {
      setForm((prev) => ({ ...prev, email: savedEmail }));
      setRememberMe(true);
    }
  }, []);

  const passwordStrength = isRegister ? getPasswordStrength(form.password) : 0;

  const clearFieldError = useCallback((field: keyof FieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const validate = (): boolean => {
    const errs: FieldErrors = {};

    if (isRegister && !form.name.trim()) {
      errs.name = '请输入姓名';
    }

    if (!form.email.trim()) {
      errs.email = '请输入邮箱地址';
    } else if (!validateEmail(form.email)) {
      errs.email = '请输入有效的邮箱地址';
    }

    if (!form.password) {
      errs.password = '请输入密码';
    } else if (form.password.length < 6) {
      errs.password = '密码长度不能少于6位';
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
    if (success) setSuccess('');
    clearFieldError(name as keyof FieldErrors);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const formEl = (e.target as HTMLElement).closest('form');
      formEl?.requestSubmit();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!validate()) return;

    setLoading(true);
    setError('');
    setSuccess('');
    announceToScreenReader(isRegister ? '正在注册...' : '正在登录...');

    try {
      let data;
      if (isRegister) {
        data = await authApi.register({
          email: form.email,
          password: form.password,
          name: form.name,
        });
      } else {
        data = await authApi.login(form.email, form.password);
      }

      // Handle remember me
      if (rememberMe) {
        localStorage.setItem(REMEMBER_KEY, form.email);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      announceToScreenReader(isRegister ? '注册成功' : '登录成功，正在跳转...');

      // Brief success state before navigation
      setSuccess(isRegister ? '注册成功，正在跳转...' : '登录成功，正在跳转...');

      // Redirect to the page user was trying to visit, or dashboard
      const from = (location.state as any)?.from?.pathname || '/';
      setTimeout(() => navigate(from, { replace: true }), 400);
    } catch (err: any) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        (isRegister ? '注册失败，请重试' : '登录失败，请检查邮箱和密码');
      setError(msg);
      announceToScreenReader(msg, 'assertive');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMode = () => {
    setIsRegister(!isRegister);
    setError('');
    setSuccess('');
    setFieldErrors({});
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 transition-colors duration-500">
      <div className="w-full max-w-md">
        {/* Logo & Branding */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/25 transition-transform duration-300 hover:scale-105">
            <Scale className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">LawMind AI</h1>
          <p className="mt-1 text-sm text-gray-500">智能法律文书助手</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200/80 bg-white p-8 shadow-xl shadow-gray-200/50 transition-all duration-300">
          <h2 className="mb-6 text-center text-xl font-semibold text-gray-900">
            {isRegister ? '创建账户' : '欢迎登录'}
          </h2>

          {/* Success Message */}
          {success && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 animate-in fade-in slide-in-from-top-2 duration-200" role="status">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <p>{success}</p>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 animate-in fade-in slide-in-from-top-2 duration-200" role="alert" aria-live="assertive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p>{error}</p>
              <button onClick={() => setError('')} className="ml-auto shrink-0 text-red-400 hover:text-red-600 transition-colors">&times;</button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" onKeyDown={handleKeyDown} noValidate>
            {isRegister && (
              <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                <label htmlFor="login-name" className="mb-1.5 block text-sm font-medium text-gray-700">
                  姓名
                </label>
                <input
                  id="login-name"
                  name="name"
                  type="text"
                  required
                  value={form.name}
                  onChange={handleChange}
                  placeholder="请输入您的姓名"
                  autoComplete="name"
                  autoFocus={isRegister}
                  className={`w-full rounded-lg border bg-gray-50/50 px-3.5 py-2.5 text-sm transition-all duration-200 placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                    fieldErrors.name ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-gray-200'
                  }`}
                />
                {fieldErrors.name && (
                  <p className="mt-1 text-xs text-red-500 animate-in fade-in duration-150">{fieldErrors.name}</p>
                )}
              </div>
            )}

            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-gray-700">
                邮箱
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                required
                value={form.email}
                onChange={handleChange}
                placeholder="请输入邮箱地址"
                autoComplete="email"
                autoFocus={!isRegister}
                className={`w-full rounded-lg border bg-gray-50/50 px-3.5 py-2.5 text-sm transition-all duration-200 placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                  fieldErrors.email ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-gray-200'
                }`}
              />
              {fieldErrors.email && (
                <p className="mt-1 text-xs text-red-500 animate-in fade-in duration-150">{fieldErrors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-gray-700">
                密码
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={form.password}
                  onChange={handleChange}
                  placeholder="请输入密码"
                  minLength={6}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  className={`w-full rounded-lg border bg-gray-50/50 px-3.5 py-2.5 pr-10 text-sm transition-all duration-200 placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                    fieldErrors.password ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-gray-200'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:rounded"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-red-500 animate-in fade-in duration-150">{fieldErrors.password}</p>
              )}
              {/* Password strength indicator for registration */}
              {isRegister && form.password.length > 0 && !fieldErrors.password && (
                <div className="mt-2 animate-in fade-in duration-200">
                  <div className="flex gap-1">
                    {[1, 2, 3].map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                          passwordStrength >= level ? STRENGTH_COLORS[passwordStrength] : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    密码强度: {STRENGTH_LABELS[passwordStrength] || '弱'}
                  </p>
                </div>
              )}
            </div>

            {/* Remember Me */}
            {!isRegister && (
              <div className="flex items-center gap-2">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 transition-colors focus:ring-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/40"
                />
                <label htmlFor="remember-me" className="cursor-pointer text-sm text-gray-600 select-none">
                  记住邮箱
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-blue-500/25 transition-all duration-200 hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg hover:shadow-blue-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:active:scale-100"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isRegister ? '注册中...' : '登录中...'}
                </span>
              ) : isRegister ? (
                '注册'
              ) : (
                '登录'
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            {isRegister ? '已有账户？' : '还没有账户？'}
            <button
              onClick={handleToggleMode}
              className="ml-1 font-medium text-blue-600 transition-colors hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:rounded"
            >
              {isRegister ? '立即登录' : '立即注册'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400 transition-colors duration-500">
          LawMind AI - 智能法律文书助手
        </p>
      </div>
    </div>
  );
}
