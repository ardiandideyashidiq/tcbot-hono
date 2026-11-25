import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '../lib/api';

interface AdminLoginProps {
  onSuccess: (session: {
    username: string;
    role: 'superadmin' | 'admin';
  }) => void;
  onBackPublic: () => void;
}

export function AdminLogin({ onSuccess, onBackPublic }: AdminLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Masukkan nama pengguna dan kata sandi.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await api.api.auth.login.$post({
        json: { username: username.trim(), password },
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        username?: string;
        role?: 'superadmin' | 'admin';
        error?: string;
      };

      if (!res.ok || !payload.ok || !payload.username) {
        setError(payload.error ?? 'Nama pengguna atau kata sandi salah.');
        return;
      }

      onSuccess({
        username: payload.username,
        role: payload.role === 'superadmin' ? 'superadmin' : 'admin',
      });
    } catch {
      setError('Tidak dapat terhubung ke server autentikasi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-5 py-10 text-foreground">
      <div className="w-full max-w-sm">
        <button
          type="button"
          onClick={onBackPublic}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Kembali ke halaman publik
        </button>

        <div className="rounded-xl border border-border bg-card p-6 sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-4" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">
                Konsol admin moderasi
              </h1>
              <p className="text-xs text-muted-foreground">
                Masuk untuk mengelola banding, sanksi, dan aturan.
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="admin-username"
                className="text-xs font-medium text-muted-foreground"
              >
                Nama pengguna
              </label>
              <Input
                id="admin-username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                disabled={submitting}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="admin-password"
                className="text-xs font-medium text-muted-foreground"
              >
                Kata sandi
              </label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={submitting}
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="mt-1 w-full gap-1.5"
              disabled={submitting}
            >
              <Lock className="size-3.5" />
              {submitting ? 'Memeriksa sesi...' : 'Masuk ke konsol'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
