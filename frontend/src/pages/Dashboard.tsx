import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, FileText, Search, Plus, ArrowRight } from 'lucide-react';
import { caseApi, documentApi } from '@/lib/api';
import type { Case, Document } from '@/lib/api';

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
}

function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm">
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
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
};

const docTypeLabel: Record<string, string> = {
  complaint: '起诉状', answer: '答辩状', appeal: '上诉状',
  agency_opinion: '代理词', defense_opinion: '辩护词',
  legal_opinion: '法律意见书', lawyer_letter: '律师函',
  evidence_list: '证据清单', cross_examination: '质证意见',
  preservation_application: '保全申请',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ cases: 0, docs: 0 });
  const [recentCases, setRecentCases] = useState<Case[]>([]);
  const [recentDocs, setRecentDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [cases, docs] = await Promise.all([
          caseApi.list({ limit: 5 }),
          documentApi.list({ limit: 5 }),
        ]);
        setStats({ cases: cases.length, docs: docs.length });
        setRecentCases(cases);
        setRecentDocs(docs);
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <svg className="h-8 w-8 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">仪表盘</h1>
          <p className="mt-1 text-muted-foreground">欢迎回来，这是您的工作概览</p>
        </div>
        <button
          onClick={() => navigate('/documents')}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          生成文书
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="案件总数" value={stats.cases} icon={Briefcase} color="bg-blue-500" />
        <StatCard label="文书总数" value={stats.docs} icon={FileText} color="bg-emerald-500" />
        <div
          onClick={() => navigate('/search')}
          className="flex cursor-pointer items-center gap-4 rounded-xl border bg-card p-5 shadow-sm hover:border-primary/50 transition-colors"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-violet-500">
            <Search className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-2xl font-bold">检索</p>
            <p className="text-sm text-muted-foreground">快速操作</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-semibold">最近案件</h2>
            <button onClick={() => navigate('/cases')} className="flex items-center gap-1 text-xs text-primary hover:underline">
              查看全部 <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="divide-y">
            {recentCases.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">暂无案件</p>
            ) : recentCases.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.title}</p>
                  <p className="text-xs text-muted-foreground">{caseTypeLabel[c.case_type] || c.case_type}</p>
                </div>
                <span className="ml-3 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                  {statusLabel[c.status] || c.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-semibold">最近文书</h2>
            <button onClick={() => navigate('/documents')} className="flex items-center gap-1 text-xs text-primary hover:underline">
              查看全部 <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="divide-y">
            {recentDocs.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">暂无文书</p>
            ) : recentDocs.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-5 py-3">
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
      </div>
    </div>
  );
}
