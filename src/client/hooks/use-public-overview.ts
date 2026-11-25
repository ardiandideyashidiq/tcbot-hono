import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export interface PublicRule {
  id: number;
  ruleKey: string;
  categoryTitle: string;
  title: string;
  body: string;
  isMandatory: boolean;
}

export interface PublicGroup {
  chatId: number;
  title: string;
  chatType: string;
  addedAt: string;
}

export interface PublicOverview {
  configured: boolean;
  communityName: string;
  stats: {
    connectedGroups: number;
    publishedRules: number;
    resolvedAppeals: number;
    activeModerations: number;
  };
  rules: PublicRule[];
  groups: PublicGroup[];
}

let cachedOverview: PublicOverview | null = null;

export function usePublicOverview() {
  const [data, setData] = useState<PublicOverview | null>(cachedOverview);
  const [loading, setLoading] = useState(!cachedOverview);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    if (!force && cachedOverview) {
      setData(cachedOverview);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.api.public.overview.$get();
      if (!res.ok) {
        throw new Error('Gagal memuat data komunitas');
      }
      const payload = (await res.json()) as PublicOverview;
      cachedOverview = payload;
      setData(payload);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  return {
    data,
    loading,
    error,
    refresh: () => refresh(true),
  };
}
