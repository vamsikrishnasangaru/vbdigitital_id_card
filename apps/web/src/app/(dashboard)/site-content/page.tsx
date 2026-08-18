'use client';

import { useNextPageParams, type NextClientPageProps } from '@/lib/next-page-params';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Upload, Palette } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { resolveMediaUrl } from '@/lib/utils';
import { useSiteContent } from '@/hooks/use-site-content';
import {
  DEFAULT_SITE_CONTENT,
  type SiteContentPayload,
  type SiteStep,
  type SiteStat,
} from '@/lib/site-content';

function StepEditor({
  title,
  items,
  onChange,
}: {
  title: string;
  items: SiteStep[];
  onChange: (next: SiteStep[]) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-black">{title}</h3>
        <button
          type="button"
          onClick={() => onChange([...items, { title: '', body: '' }])}
          className="text-xs font-bold px-3 py-1.5 rounded-lg border border-border hover:bg-muted flex items-center gap-1"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      {items.map((item, i) => (
        <div key={i} className="border border-border rounded-xl p-3 space-y-2">
          <div className="flex gap-2">
            <input
              value={item.title}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...item, title: e.target.value };
                onChange(next);
              }}
              placeholder="Title"
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-bold"
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <textarea
            value={item.body}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...item, body: e.target.value };
              onChange(next);
            }}
            placeholder="Description"
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
        </div>
      ))}
    </section>
  );
}

export default function SiteContentAdminPage({ params }: NextClientPageProps) {
  useNextPageParams(params);
  const router = useRouter();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { data, isLoading } = useSiteContent();
  const [form, setForm] = useState<SiteContentPayload>(DEFAULT_SITE_CONTENT);
  const [caption, setCaption] = useState('');
  const [placement, setPlacement] = useState<'gallery' | 'info'>('gallery');

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') router.replace('/dashboard');
  }, [user, router]);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { id: _id, updatedAt: _updatedAt, ...payload } = form;
      const { data: saved } = await api.put('/site-content', payload);
      return saved;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(['site-content'], saved);
      toast.success('Landing page updated');
    },
    onError: (err: { response?: { data?: { message?: string | string[] } } }) => {
      const raw = err.response?.data?.message;
      const message = Array.isArray(raw) ? raw.join(' · ') : raw;
      toast.error(message || 'Could not save');
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      if (!isVideo && !isImage) {
        throw new Error('Upload an image or video file');
      }

      const fd = new FormData();
      fd.append('file', file);
      const { data: uploaded } = await api.post<{ url: string }>('/uploads?dir=landing', fd);

      const nextMedia = [
        ...form.media,
        {
          id: crypto.randomUUID(),
          kind: (isVideo ? 'video' : 'image') as 'image' | 'video',
          url: uploaded.url,
          caption: caption.trim(),
          placement,
        },
      ];

      const { id: _id, updatedAt: _updatedAt, ...payload } = form;
      try {
        const { data: saved } = await api.put('/site-content', { ...payload, media: nextMedia });
        return saved as SiteContentPayload;
      } catch {
        return { ...form, media: nextMedia };
      }
    },
    onSuccess: (saved) => {
      setForm(saved);
      queryClient.setQueryData(['site-content'], saved);
      setCaption('');
      toast.success('Media added — click Save landing page if it is not live yet');
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) => {
      toast.error(err.response?.data?.message || err.message || 'Upload failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const nextMedia = form.media.filter((m) => m.id !== id);
      const { id: _id, updatedAt: _updatedAt, ...payload } = form;
      try {
        const { data: saved } = await api.put('/site-content', { ...payload, media: nextMedia });
        return saved as SiteContentPayload;
      } catch {
        return { ...form, media: nextMedia };
      }
    },
    onSuccess: (saved) => {
      setForm(saved);
      queryClient.setQueryData(['site-content'], saved);
      toast.success('Media removed');
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const updateStats = (i: number, patch: Partial<SiteStat>) => {
    const stats = [...form.stats];
    stats[i] = { ...stats[i], ...patch };
    setForm({ ...form, stats });
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Palette className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-black">Landing page</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Edit the public home and More info pages. Changes go live immediately.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="font-black">Hero</h3>
        <input
          value={form.heroTitle}
          onChange={(e) => setForm({ ...form, heroTitle: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-border bg-background font-bold"
        />
        <textarea
          value={form.heroSubtitle}
          onChange={(e) => setForm({ ...form, heroSubtitle: e.target.value })}
          rows={3}
          className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          {form.stats.map((stat, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={stat.value}
                onChange={(e) => updateStats(i, { value: e.target.value })}
                className="w-24 px-3 py-2 rounded-lg border border-border text-sm font-bold"
              />
              <input
                value={stat.label}
                onChange={(e) => updateStats(i, { label: e.target.value })}
                className="flex-1 px-3 py-2 rounded-lg border border-border text-sm"
              />
            </div>
          ))}
        </div>
      </section>

      <StepEditor
        title="How it works"
        items={form.howItWorks}
        onChange={(howItWorks) => setForm({ ...form, howItWorks })}
      />
      <StepEditor
        title="How ID cards are generated"
        items={form.generationSteps}
        onChange={(generationSteps) => setForm({ ...form, generationSteps })}
      />

      <section className="space-y-3">
        <h3 className="font-black">More info page</h3>
        <input
          value={form.moreInfoTitle}
          onChange={(e) => setForm({ ...form, moreInfoTitle: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-border bg-background font-bold"
        />
        <textarea
          value={form.moreInfoIntro}
          onChange={(e) => setForm({ ...form, moreInfoIntro: e.target.value })}
          rows={3}
          className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm"
        />
        <input
          value={form.ctaLabel}
          onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm"
          placeholder="CTA button label"
        />
      </section>

      <section className="space-y-3">
        <h3 className="font-black">Demo images & videos</h3>
        <p className="text-xs text-muted-foreground">Max 15MB. Gallery shows on the home page; Info shows on the More info page.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption (optional)"
            className="flex-1 px-3 py-2 rounded-lg border border-border text-sm"
          />
          <select
            value={placement}
            onChange={(e) => setPlacement(e.target.value as 'gallery' | 'info')}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-background"
          >
            <option value="gallery">Home gallery</option>
            <option value="info">More info page</option>
          </select>
          <label className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold cursor-pointer inline-flex items-center gap-2">
            {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              disabled={uploadMutation.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadMutation.mutate(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {form.media.map((item) => (
            <div key={item.id} className="border border-border rounded-xl overflow-hidden">
              {item.kind === 'video' ? (
                <video src={resolveMediaUrl(item.url)} className="w-full h-32 object-cover bg-black" />
              ) : (
                <img src={resolveMediaUrl(item.url)} alt="" className="w-full h-32 object-cover" />
              )}
              <div className="p-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground truncate">
                  {item.placement} · {item.caption || item.kind}
                </span>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(item.id)}
                  className="p-1 text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-black text-sm disabled:opacity-50 inline-flex items-center gap-2"
      >
        {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save landing page
      </button>
    </div>
  );
}
