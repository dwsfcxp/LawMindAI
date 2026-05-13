import { useState } from 'react';
import { Search as SearchIcon, Scale, BookOpen, FileText, Loader2 } from 'lucide-react';
import { searchApi } from '@/lib/api';
import type { SearchResults } from '@/lib/api';
import { cn } from '@/lib/utils';

type SearchSource = 'all' | 'laws' | 'cases';

const sourceTabs: { value: SearchSource; label: string; icon: React.ElementType }[] = [
  { value: 'all', label: '全部', icon: SearchIcon },
  { value: 'laws', label: '法规', icon: Scale },
  { value: 'cases', label: '案例', icon: BookOpen },
];

const sourceBadge: Record<string, { label: string; color: string }> = {
  law: { label: '法律法规', color: 'bg-blue-100 text-blue-700' },
  case: { label: '司法案例', color: 'bg-emerald-100 text-emerald-700' },
  regulation: { label: '行政法规', color: 'bg-violet-100 text-violet-700' },
  judicial_interpretation: { label: '司法解释', color: 'bg-orange-100 text-orange-700' },
};

export default function Search() {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<SearchSource>('all');
  const [searchData, setSearchData] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  // Combine laws and cases into a flat result list for display
  const allResults = searchData
    ? [
        ...(searchData.laws || []).map((item: any) => ({ ...item, source: 'law' })),
        ...(searchData.cases || []).map((item: any) => ({ ...item, source: 'case' })),
      ]
    : [];

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    setError('');
    try {
      const data = await searchApi.search({
        query: query.trim(),
        result_type: source === 'all' ? undefined : source,
        top_k: 20,
      });
      setSearchData(data);
    } catch {
      setSearchData(null);
      setError('搜索失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">法律检索</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          搜索法律法规、司法案例、司法解释等法律资源
        </p>
      </div>

      {/* Search Bar */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入关键词，如：民间借贷、劳动合同、知识产权..."
              className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <button
            onClick={() => handleSearch()}
            disabled={loading || !query.trim()}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchIcon className="h-4 w-4" />}
            搜索
          </button>
        </div>

        {/* Source Tabs */}
        <div className="mt-3 flex gap-1 rounded-lg bg-muted p-1">
          {sourceTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setSource(tab.value)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                source === tab.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p>{error}</p>
          <button onClick={() => setError('')} className="ml-auto shrink-0 hover:text-red-900">&times;</button>
        </div>
      )}

      {/* Results */}
      {loading && (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {!loading && searched && allResults.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16">
          <FileText className="mb-3 h-12 w-12 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">未找到相关结果，请尝试其他关键词</p>
        </div>
      )}

      {!loading && allResults.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            共找到 <span className="font-medium text-foreground">{searchData?.total ?? allResults.length}</span> 条结果
          </p>
          {allResults.map((result: any, idx: number) => {
            const badge = sourceBadge[result.source] || {
              label: result.source,
              color: 'bg-gray-100 text-gray-700',
            };
            return (
              <div
                key={idx}
                className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', badge.color)}>
                    {badge.label}
                  </span>
                </div>
                <h3 className="mb-2 text-sm font-semibold leading-snug">{result.title}</h3>
                <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {result.content || result.snippet || ''}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Initial State */}
      {!loading && !searched && (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-20">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <SearchIcon className="h-8 w-8 text-primary/60" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-muted-foreground">开始检索</h3>
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            输入关键词搜索法律法规、司法案例、司法解释等法律资源
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {['民间借贷', '劳动合同纠纷', '知识产权侵权', '合同违约'].map((tag) => (
              <button
                key={tag}
                onClick={() => {
                  setQuery(tag);
                }}
                className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
