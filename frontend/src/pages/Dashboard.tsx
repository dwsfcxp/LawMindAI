import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase, FileText, Search, Plus, ArrowRight,
  BookOpen, Scale, FileCode, AlertCircle, FilePlus, Upload,
  TrendingUp, TrendingDown, Calendar, Activity,
} from 'lucide-react';
import { caseApi, documentApi } from '@/lib/api';
import type { Case, Document } from '@/lib/api';

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  onClick?: () => void;
  loading?: boolean;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
}

function StatCard({ label, value, icon: Icon, color, onClick, loading, trend, trendLabel }: StatCardProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm">
        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div>
          <div className="h-7 w-12 animate-pulse rounded bg-muted" />
          <div className="mt-1 h-4 w-16 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm transition-colors ${
        onClick ? 'cursor-pointer hover:border-primary/50 hover:shadow-md' : ''
      }`}
    >
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      {trend && trend !== 'neutral' && trendLabel && (
        <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
          trend === 'up' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {trendLabel}
        </div>
      )}
    </div>
  );
}

/** Simple CSS bar chart for case status distribution */
function CaseChart({ cases }: { cases: Case[] }) {
  const statusGroups: Record<string, { label: string; color: string; count: number }> = {
    active: { label: '进行中', color: 'bg-blue-500', count: 0 },
    draft: { label: '草稿', color: 'bg-gray-400', count: 0 },
    closed: { label: '已结案', color: 'bg-green-500', count: 0 },
    archived: { label: '已归档', color: 'bg-yellow-500', count: 0 },
  };

  cases.forEach((c) => {
    if (statusGroups[c.status]) {
      statusGroups[c.status].count++;
    }
  });

  const total = cases.length || 1;
  const maxCount = Math.max(...Object.values(statusGroups).map((g) => g.count), 1);

  return (
    <div className="space-y-3">
      {Object.values(statusGroups).map((group) => {
        if (group.count === 0 && total <= 1) return null;
        return (
          <div key={group.label} className="flex items-center gap-3">
            <span className="w-14 text-xs text-muted-foreground text-right">{group.label}</span>
            <div className="flex-1 h-5 rounded-full bg-muted/50 overflow-hidden">
              <div
                className={`h-full rounded-full ${group.color} transition-all duration-500`}
                style={{ width: `${Math.max((group.count / maxCount) * 100, group.count > 0 ? 8 : 0)}%` }}
              />
            </div>
            <span className="w-6 text-xs font-medium text-right">{group.count}</span>
          </div>
        );
      })}
    </div>
  );
}

const statusLabel: Record<string, string> = {
  draft: '草稿', active: '进行中', closed: '已结案', archived: '已归档',
  generated: '已生成', reviewed: '已审校',
};

const caseTypeLabel: Record<string, string> = {
  civil_litigation: '民商事诉讼', criminal_defense: '刑事辩护',
  non_litigation: '非诉业务', administrative_labor: '行政/劳动',
  civil: '民事', criminal: '刑事', administrative: '行政',
  labor: '劳动', contract: '合同', ip: '知识产权', other: '其他',
};

const docTypeLabel: Record<string, string> = {
  complaint: '起诉状', answer: '答辩状', appeal: '上诉状',
  agency_opinion: '代理词', defense_opinion: '辩护词',
  legal_opinion: '法律意见书', lawyer_letter: '律师函',
  evidence_list: '证据清单', cross_examination: '质证意见',
  preservation_application: '保全申请',
};

const quickActions = [
  { label: '新建案件', icon: Briefcase, color: 'bg-blue-500', to: '/cases' },
  { label: '生成文书', icon: FilePlus, color: 'bg-emerald-500', to: '/documents' },
  { label: '法律检索', icon: Search, color: 'bg-violet-500', to: '/search' },
  { label: '合同审查', icon: Scale, color: 'bg-orange-500', to: '/contracts' },
  { label: '法律研究', icon: BookOpen, color: 'bg-pink-500', to: '/research' },
  { label: '证据上传', icon: Upload, color: 'bg-cyan-500', to: '/evidence' },
  { label: '模板管理', icon: FileCode, color: 'bg-amber-500', to: '/templates' },
];

interface ActivityItem {
  id: string;
  type: 'case' | 'document';
  action: string;
  title: string;
  time: string;
}

function buildActivityFeed(cases: Case[], docs: Document[]): ActivityItem[] {
  const items: ActivityItem[] = [];

  cases.forEach((c) => {
    items.push({
      id: `case-${c.id}`,
      type: 'case',
      action: c.status === 'draft' ? '创建了案件' : '更新了案件',
      title: c.title,
      time: c.updated_at,
    });
  });

  docs.forEach((d) => {
    items.push({
      id: `doc-${d.id}`,
      type: 'document',
      action: d.status === 'generated' ? '生成了文书' : '更新了文书',
      title: d.title,
      time: d.updated_at,
    });
  });

  // Sort by time descending and take top 5
  items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  return items.slice(0, 5);
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHr < 24) return `${diffHr}小时前`;
  if (diffDay < 30) return `${diffDay}天前`;
  return date.toLocaleDateString('zh-CN');
}

function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ cases: 0, docs: 0 });
  const [recentCases, setRecentCases] = useState<Case[]>([]);
  const [recentDocs, setRecentDocs] = useState<Document[]>([]);
  const [allCases, setAllCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    // Get user name from localStorage
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        setUserName(user.name || '');
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      setError('');
      try {
        const [allCasesData, allDocs] = await Promise.all([
          caseApi.list({ limit: 1000 }),
          documentApi.list({ limit: 1000 }),
        ]);
        setStats({ cases: allCasesData.length, docs: allDocs.length });
        setRecentCases(allCasesData.slice(0, 5));
        setRecentDocs(allDocs.slice(0, 5));
        setAllCases(allCasesData);
      } catch {
        setError('加载数据失败，请刷新页面重试');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const activityFeed = useMemo(
    () => buildActivityFeed(recentCases, recentDocs),
    [recentCases, recentDocs],
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-32 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-4 w-48 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-10 w-28 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="" value="" icon={Briefcase} color="bg-blue-500" loading />
          <StatCard label="" value="" icon={FileText} color="bg-emerald-500" loading />
          <StatCard label="" value="" icon={Search} color="bg-violet-500" loading />
        </div>
      </div>
    );
  }

  const isEmpty = recentCases.length === 0 && recentDocs.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header with user name */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {userName ? `欢迎回来，${userName}` : '仪表盘'}
          </h1>
          <p className="mt-1 text-muted-foreground">这是您的工作概览</p>
        </div>
        <button
          onClick={() => navigate('/documents')}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          生成文书
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{error}</p>
          <button onClick={() => setError('')} className="ml-auto shrink-0 hover:text-red-900">&times;</button>
        </div>
      )}

      {/* Stat Cards with trend indicators */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="案件总数"
          value={stats.cases}
          icon={Briefcase}
          color="bg-blue-500"
          onClick={() => navigate('/cases')}
          trend={stats.cases > 0 ? 'up' : 'neutral'}
          trendLabel={stats.cases > 0 ? '进行中' : undefined}
        />
        <StatCard
          label="文书总数"
          value={stats.docs}
          icon={FileText}
          color="bg-emerald-500"
          onClick={() => navigate('/documents')}
          trend={stats.docs > 0 ? 'up' : 'neutral'}
          trendLabel={stats.docs > 0 ? '已生成' : undefined}
        />
        <StatCard
          label="快速检索"
          value="检索"
          icon={Search}
          color="bg-violet-500"
          onClick={() => navigate('/search')}
        />
      </div>

      {/* Empty State */}
      {isEmpty && !error ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Scale className="h-8 w-8 text-primary/60" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-muted-foreground">开始使用 LawMind AI</h3>
          <p className="max-w-md text-center text-sm text-muted-foreground">
            您还没有案件或文书。创建第一个案件，开始智能法律工作。
          </p>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => navigate('/cases')}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Briefcase className="h-4 w-4" />
              新建案件
            </button>
            <button
              onClick={() => navigate('/search')}
              className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              <Search className="h-4 w-4" />
              法律检索
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Case Statistics Chart */}
          {allCases.length > 0 && (
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold">案件分布</h2>
              </div>
              <CaseChart cases={allCases} />
            </div>
          )}

          {/* Recent Activity Feed */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold">最近动态</h2>
              </div>
            </div>
            <div className="divide-y">
              {activityFeed.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">暂无动态</p>
              ) : activityFeed.map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-5 py-3">
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    item.type === 'case' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'
                  }`}>
                    {item.type === 'case' ? <Briefcase className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">
                      <span className="text-muted-foreground">{item.action}</span>
                      {' '}
                      <span className="font-medium">{item.title}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{formatRelativeTime(item.time)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Deadlines / Recent Cases */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold">近期案件</h2>
              </div>
              <button onClick={() => navigate('/cases')} className="flex items-center gap-1 text-xs text-primary hover:underline">
                查看全部 <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            <div className="divide-y">
              {recentCases.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">暂无案件</p>
              ) : recentCases.slice(0, 4).map((c) => (
                <div
                  key={c.id}
                  onClick={() => navigate('/cases')}
                  className="flex cursor-pointer items-center justify-between px-5 py-3 transition-colors hover:bg-accent/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="text-xs text-muted-foreground">{caseTypeLabel[c.case_type] || c.case_type} - {formatRelativeTime(c.updated_at)}</p>
                  </div>
                  <span className="ml-3 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                    {statusLabel[c.status] || c.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent Documents */}
      {!isEmpty && recentDocs.length > 0 && (
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-semibold">最近文书</h2>
            <button onClick={() => navigate('/documents')} className="flex items-center gap-1 text-xs text-primary hover:underline">
              查看全部 <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="divide-y">
            {recentDocs.map((d) => (
              <div
                key={d.id}
                onClick={() => navigate('/documents')}
                className="flex cursor-pointer items-center justify-between px-5 py-3 transition-colors hover:bg-accent/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">{docTypeLabel[d.type] || d.type}</p>
                </div>
                <span className="ml-3 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                  {statusLabel[d.status] || d.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-4 font-semibold">快捷操作</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
          {quickActions.map((action) => (
            <button
              key={action.to}
              onClick={() => navigate(action.to)}
              className="flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors hover:border-primary/50 hover:bg-accent/50"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${action.color}`}>
                <action.icon className="h-5 w-5 text-white" />
              </div>
              <span className="text-xs font-medium">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default React.memo(Dashboard);
