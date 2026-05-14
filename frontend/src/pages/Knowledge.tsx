import { useState, useEffect } from 'react';
import { BookOpen, Plus, Trash2, Loader2, Tag, Search, FileText, X } from 'lucide-react';
import { knowledgeApi, type KnowledgeItem, type KnowledgeStats } from '@/lib/api';

export default function Knowledge() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [stats, setStats] = useState<KnowledgeStats>({ total: 0, tags: [] });
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterTag, setFilterTag] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const [form, setForm] = useState({ title: '', content: '', source: '', tags: '' });

  useEffect(() => { loadData(); }, [filterTag]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [data, s] = await Promise.all([
        knowledgeApi.list(filterTag ? { tag: filterTag } : undefined),
        knowledgeApi.stats(),
      ]);
      setItems(data);
      setStats(s);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    try {
      await knowledgeApi.create({
        title: form.title.trim(),
        content: form.content.trim(),
        source: form.source.trim() || undefined,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      });
      setShowCreate(false);
      setForm({ title: '', content: '', source: '', tags: '' });
      loadData();
    } catch (e) {
      alert('创建失败');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此知识条目？')) return;
    await knowledgeApi.delete(id);
    loadData();
  };

  const filtered = searchQuery
    ? items.filter(it =>
        it.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        it.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : items;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">知识库管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理法律知识、文书模板、办案笔记，构建个人/团队知识库</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm">
          <Plus className="h-4 w-4" /> 添加知识
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-sm text-muted-foreground">知识条目</p>
        </div>
        <div className="rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold">{stats.tags.length}</p>
          <p className="text-sm text-muted-foreground">标签分类</p>
        </div>
        <div className="rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold">{items.filter(i => i.embedding_id).length}</p>
          <p className="text-sm text-muted-foreground">已向量化</p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索知识库..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-sm"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterTag('')}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${!filterTag ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
          >
            全部
          </button>
          {stats.tags.slice(0, 8).map(tag => (
            <button key={tag} onClick={() => setFilterTag(tag)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${filterTag === tag ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
            >
              {tag}
            </button>
          ))}
          {filterTag && (
            <button onClick={() => setFilterTag('')} className="text-xs text-primary hover:underline">
              <X className="h-3 w-3 inline" /> 清除
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>{searchQuery ? '没有匹配的知识条目' : '知识库为空，点击添加知识开始'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <div key={item.id} className="rounded-lg border bg-card">
              <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/50"
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm truncate">{item.title}</span>
                    {item.embedding_id && (
                      <span className="text-xs text-green-600 shrink-0">已向量化</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {item.source && <span className="text-xs text-muted-foreground">来源: {item.source}</span>}
                    <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {item.tags && item.tags.map((t, i) => (
                    <span key={i} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                      <Tag className="h-3 w-3" />{t}
                    </span>
                  ))}
                  <button onClick={() => handleDelete(item.id)}
                    className="p-1.5 rounded-md text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {expandedId === item.id && (
                <div className="border-t p-4">
                  <pre className="text-sm whitespace-pre-wrap break-words max-h-96 overflow-y-auto">{item.content}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="bg-card rounded-xl shadow-lg p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">添加知识条目</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">标题 *</label>
                <input type="text" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="如：民间借贷纠纷裁判要点" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">内容 *</label>
                <textarea value={form.content} onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm min-h-[120px]" placeholder="输入法律知识、办案笔记、法规要点等" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">来源</label>
                <input type="text" value={form.source} onChange={(e) => setForm(f => ({ ...f, source: e.target.value }))}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="如：最高人民法院公报 2024年第3期" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">标签（逗号分隔）</label>
                <input type="text" value={form.tags} onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="如：民间借贷,利率,裁判规则" />
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg border text-sm hover:bg-accent">取消</button>
                <button onClick={handleCreate} disabled={!form.title.trim() || !form.content.trim()}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50">
                  添加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
