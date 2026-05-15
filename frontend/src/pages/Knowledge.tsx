import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { BookOpen, Plus, Trash2, Loader2, Tag, Search, FileText, X, Upload, AlertCircle, Eye, CheckSquare, Square, BarChart3, Clock, Download, Layers } from 'lucide-react';
import { knowledgeApi, type KnowledgeItem, type KnowledgeStats } from '@/lib/api';
import { useToast } from '@/lib/toast';

function Knowledge() {
  const { toast } = useToast();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [stats, setStats] = useState<KnowledgeStats>({ total: 0, tags: [] });
  const [statsLoading, setStatsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterTag, setFilterTag] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const KNOWLEDGE_PAGE_SIZE = 15;

  // Bulk operations state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState('');

  // Detail view state
  const [detailItem, setDetailItem] = useState<KnowledgeItem | null>(null);

  // Drag-and-drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({ title: '', content: '', source: '', tags: '' });

  useEffect(() => { loadData(); setPage(1); }, [filterTag]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showCreate) setShowCreate(false);
        if (detailItem) setDetailItem(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showCreate, detailItem]);

  const loadData = async () => {
    setLoading(true);
    setStatsLoading(true);
    try {
      const [data, s] = await Promise.all([
        knowledgeApi.list(filterTag ? { tag: filterTag } : undefined),
        knowledgeApi.stats(),
      ]);
      setItems(data);
      setStats(s);
    } catch (e) { setError('加载知识库失败'); }
    finally { setLoading(false); setStatsLoading(false); }
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
      toast({ type: 'success', title: '知识条目已创建' });
    } catch (e) {
      setError('创建失败');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await doUpload(file);
    if (e.target) e.target.value = '';
  };

  /** Handle file upload with progress tracking */
  const doUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    // Simulate progress since axios doesn't easily support upload progress in this setup
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => Math.min(prev + Math.random() * 15, 90));
    }, 300);
    try {
      await knowledgeApi.uploadFile(file);
      clearInterval(progressInterval);
      setUploadProgress(100);
      loadData();
      toast({ type: 'success', title: '文件上传成功' });
    } catch (err: any) {
      clearInterval(progressInterval);
      setError(err.response?.data?.detail || '上传失败');
    } finally {
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 500);
    }
  };

  /** Drag-and-drop handlers */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await doUpload(file);
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此知识条目？')) return;
    try {
      await knowledgeApi.delete(id);
      loadData();
      toast({ type: 'success', title: '知识条目已删除' });
    } catch (e) {
      setError('删除失败');
    }
  };

  /** Bulk delete selected items */
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedIds.size} 个知识条目？`)) return;
    let deleted = 0;
    for (const id of selectedIds) {
      try {
        await knowledgeApi.delete(id);
        deleted++;
      } catch { /* skip failed */ }
    }
    setSelectedIds(new Set());
    setBulkMode(false);
    loadData();
    toast({ type: 'success', title: `已删除 ${deleted} 个条目` });
  };

  /** Bulk tag selected items */
  const handleBulkTag = async () => {
    if (selectedIds.size === 0 || !bulkTagInput.trim()) return;
    const newTags = bulkTagInput.split(',').map(t => t.trim()).filter(Boolean);
    let updated = 0;
    for (const id of selectedIds) {
      const item = items.find(i => i.id === id);
      if (item) {
        try {
          const existingTags = item.tags || [];
          const mergedTags = [...new Set([...existingTags, ...newTags])];
          await knowledgeApi.update(id, { tags: mergedTags });
          updated++;
        } catch { /* skip failed */ }
      }
    }
    setSelectedIds(new Set());
    setBulkTagInput('');
    setBulkMode(false);
    loadData();
    toast({ type: 'success', title: `已更新 ${updated} 个条目标签` });
  };

  /** Toggle selection of an item */
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Export knowledge list */
  const handleExportKnowledge = () => {
    const exportData = filtered.map(item => ({
      title: item.title,
      content: item.content,
      source: item.source || '',
      tags: item.tags?.join(', ') || '',
      created_at: new Date(item.created_at).toLocaleDateString(),
      embedding: item.embedding_id ? 'yes' : 'no',
    }));
    const csv = [
      Object.keys(exportData[0]).join(','),
      ...exportData.map(row => Object.values(row).map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const bom = '﻿';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `知识库_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ type: 'success', title: '知识库已导出' });
  };

  /** Get similar items based on shared tags */
  const getSimilarItems = (item: KnowledgeItem): KnowledgeItem[] => {
    if (!item.tags || item.tags.length === 0) return [];
    const itemTags = new Set(item.tags);
    return items
      .filter(i => i.id !== item.id && i.tags && i.tags.some(t => itemTags.has(t)))
      .map(i => ({
        ...i,
        similarity: i.tags!.filter(t => itemTags.has(t)).length,
      }))
      .sort((a, b) => (b as any).similarity - (a as any).similarity)
      .slice(0, 5);
  };

  const filtered = useMemo(() => searchQuery
    ? items.filter(it =>
        it.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        it.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : items, [items, searchQuery]);

  // Paginate filtered results
  const totalPages = Math.max(1, Math.ceil(filtered.length / KNOWLEDGE_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedFiltered = useMemo(
    () => filtered.slice((safePage - 1) * KNOWLEDGE_PAGE_SIZE, safePage * KNOWLEDGE_PAGE_SIZE),
    [filtered, safePage, KNOWLEDGE_PAGE_SIZE],
  );

  /** Select/deselect all visible items */
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === pagedFiltered.length && pagedFiltered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pagedFiltered.map(i => i.id)));
    }
  }, [selectedIds.size, pagedFiltered]);

  /** Statistics by tag for visualization */
  const { sortedTags, maxTagCount } = useMemo(() => {
    const tagCounts: Record<string, number> = {};
    items.forEach(item => {
      (item.tags || []).forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    return { sortedTags: sorted, maxTagCount: sorted.length > 0 ? sorted[0][1] : 1 };
  }, [items]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">知识库管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理法律知识、文书模板、办案笔记，构建个人/团队知识库</p>
        </div>
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 max-w-md">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto"><X className="h-4 w-4" /></button>
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm">
            <Plus className="h-4 w-4" /> 添加知识
          </button>
          <label className="flex items-center gap-2 px-4 py-2.5 border border-primary text-primary rounded-lg hover:bg-primary/10 text-sm cursor-pointer">
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,.docx,.doc,.txt,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tiff"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
            />
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? '处理中...' : '上传文件'}
          </label>
          <button onClick={() => setBulkMode(!bulkMode)}
            className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg text-sm ${bulkMode ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
            {bulkMode ? '取消批量' : '批量操作'}
          </button>
          {filtered.length > 0 && (
            <button onClick={handleExportKnowledge}
              className="flex items-center gap-2 px-4 py-2.5 border rounded-lg text-sm hover:bg-accent">
              <Download className="h-4 w-4" /> 导出
            </button>
          )}
        </div>
      </div>

      {/* Upload progress bar */}
      {uploading && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>文件上传中...</span>
            <span>{Math.round(uploadProgress)}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {/* Drag-and-drop zone */}
      <div
        ref={dropZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed p-6 text-center transition-all ${
          isDragOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-muted-foreground/15 hover:border-primary/30'
        } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <Upload className={`h-8 w-8 mx-auto mb-2 ${isDragOver ? 'text-primary' : 'text-muted-foreground/30'}`} />
        <p className={`text-sm ${isDragOver ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
          {isDragOver ? '松开以上传文件' : '拖拽文件到此处上传知识条目'}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        {statsLoading && <div className="col-span-3 flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
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

      {/* Tag distribution visualization */}
      {sortedTags.length > 0 && (
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-muted-foreground">标签分布</h3>
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {sortedTags.slice(0, 10).map(([tag, count]) => (
              <div key={tag} className="flex items-center gap-2">
                <span className="text-xs w-20 shrink-0 truncate text-right">{tag}</span>
                <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary/60 rounded-full transition-all" style={{ width: `${(count / maxTagCount) * 100}%` }} />
                </div>
                <span className="text-xs font-medium w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
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

      {/* Bulk operation bar */}
      {bulkMode && (
        <div className="rounded-lg border bg-muted/30 p-3 flex flex-wrap items-center gap-3">
          <button onClick={toggleSelectAll} className="flex items-center gap-1.5 text-xs">
            {selectedIds.size === pagedFiltered.length && pagedFiltered.length > 0 ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
            {selectedIds.size === pagedFiltered.length && pagedFiltered.length > 0 ? '取消全选' : '全选'}
          </button>
          <span className="text-xs text-muted-foreground">已选 {selectedIds.size} 项</span>
          {selectedIds.size > 0 && (
            <>
              <div className="flex items-center gap-2">
                <input className="rounded-md border bg-transparent px-3 py-1.5 text-xs w-40"
                  value={bulkTagInput} onChange={(e) => setBulkTagInput(e.target.value)} placeholder="批量添加标签（逗号分隔）" />
                <button onClick={handleBulkTag} disabled={!bulkTagInput.trim()}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  添加标签
                </button>
              </div>
              <button onClick={handleBulkDelete}
                className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                <Trash2 className="h-3 w-3 inline mr-1" />批量删除
              </button>
            </>
          )}
        </div>
      )}

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
          {pagedFiltered.map(item => (
            <div key={item.id} className="rounded-lg border bg-card">
              <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/50"
                onClick={() => !bulkMode && setExpandedId(expandedId === item.id ? null : item.id)}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* Bulk select checkbox */}
                  {bulkMode && (
                    <button onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }} className="shrink-0">
                      {selectedIds.has(item.id) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm truncate">{item.title}</span>
                      {item.embedding_id ? (
                        <span className="text-xs text-green-600 shrink-0">已向量化</span>
                      ) : (
                        <span className="text-xs text-gray-400 shrink-0">未向量化</span>
                      )}
                    </div>
                    {/* Content preview (first 200 chars) */}
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {item.content.slice(0, 200)}{item.content.length > 200 ? '...' : ''}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {item.source && <span className="text-xs text-muted-foreground">来源: {item.source}</span>}
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2" onClick={(e) => e.stopPropagation()}>
                  {item.tags && item.tags.map((t, i) => (
                    <span key={i} className="hidden sm:flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                      <Tag className="h-3 w-3" />{t}
                    </span>
                  ))}
                  <button onClick={() => setDetailItem(item)}
                    className="p-1.5 rounded-md text-primary hover:bg-primary/10" title="查看详情">
                    <Eye className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(item.id)}
                    className="p-1.5 rounded-md text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {expandedId === item.id && (
                <div className="border-t p-4 space-y-3">
                  <pre className="text-sm whitespace-pre-wrap break-words max-h-96 overflow-y-auto">{item.content}</pre>
                  {/* Similar items suggestions */}
                  {getSimilarItems(item).length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                        <Layers className="h-3 w-3" /> 相关知识条目
                      </h4>
                      <div className="space-y-1.5">
                        {getSimilarItems(item).map(similar => (
                          <button key={similar.id}
                            onClick={() => { setExpandedId(similar.id); setDetailItem(similar); }}
                            className="flex items-center gap-2 w-full rounded-md border p-2 text-left hover:bg-accent/50 text-xs">
                            <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="font-medium truncate">{similar.title}</span>
                            {similar.tags && similar.tags.filter(t => item.tags?.includes(t)).map((t, i) => (
                              <span key={i} className="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] shrink-0">{t}</span>
                            ))}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            第 {safePage} / {totalPages} 页，共 {filtered.length} 条
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="rounded-md border p-2 transition-colors hover:bg-accent disabled:opacity-40"
            >
              &#8249;
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .map((p, idx, arr) => (
                <span key={p} className="flex items-center">
                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                    <span className="px-1 text-xs text-muted-foreground">...</span>
                  )}
                  <button
                    onClick={() => setPage(p)}
                    className={`min-w-[32px] rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                      p === safePage
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'hover:bg-accent'
                    }`}
                  >
                    {p}
                  </button>
                </span>
              ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="rounded-md border p-2 transition-colors hover:bg-accent disabled:opacity-40"
            >
              &#8250;
            </button>
          </div>
        </div>
      )}

      {/* Detail View Modal */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto" onClick={() => setDetailItem(null)}>
          <div className="w-full max-w-2xl rounded-lg bg-background p-4 sm:p-6 shadow-xl my-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold">{detailItem.title}</h2>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {detailItem.source && <span className="text-xs text-muted-foreground">来源: {detailItem.source}</span>}
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(detailItem.created_at).toLocaleString()}
                  </span>
                  {detailItem.embedding_id && <span className="text-xs text-green-600">已向量化</span>}
                </div>
              </div>
              <button onClick={() => setDetailItem(null)} className="rounded-md p-1 hover:bg-accent">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tags */}
            {detailItem.tags && detailItem.tags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mb-4">
                {detailItem.tags.map((t, i) => (
                  <span key={i} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                    <Tag className="h-3 w-3" />{t}
                  </span>
                ))}
              </div>
            )}

            {/* Full content */}
            <div className="rounded-lg bg-muted/30 p-4 mb-4">
              <pre className="text-sm whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto">{detailItem.content}</pre>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground mb-4">
              <div className="rounded-md border p-2">
                <span className="font-medium">ID:</span> {detailItem.id}
              </div>
              <div className="rounded-md border p-2">
                <span className="font-medium">字符数:</span> {detailItem.content.length}
              </div>
              <div className="rounded-md border p-2">
                <span className="font-medium">创建时间:</span> {new Date(detailItem.created_at).toLocaleString()}
              </div>
              <div className="rounded-md border p-2">
                <span className="font-medium">向量化:</span> {detailItem.embedding_id ? '是' : '否'}
              </div>
            </div>

            {/* Similar items */}
            {getSimilarItems(detailItem).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1">
                  <Layers className="h-4 w-4" /> 相关知识条目
                </h3>
                <div className="space-y-2">
                  {getSimilarItems(detailItem).map(similar => (
                    <button key={similar.id}
                      onClick={() => setDetailItem(similar)}
                      className="flex items-center gap-2 w-full rounded-md border p-3 text-left hover:bg-accent/50">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate block">{similar.title}</span>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{similar.content.slice(0, 100)}...</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {similar.tags?.filter(t => detailItem.tags?.includes(t)).map((t, i) => (
                          <span key={i} className="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px]">{t}</span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
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
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="如：民间借贷,利率,裁判规则" onKeyDown={(e) => e.key === 'Enter' && handleCreate()} />
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

export default React.memo(Knowledge);
