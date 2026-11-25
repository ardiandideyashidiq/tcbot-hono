import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '../lib/api';

gsap.registerPlugin(useGSAP);

interface AdminLoginProps {
  onSuccess: (session: {
    username: string;
    role: 'superadmin' | 'admin';
  }) => void;
  onBackPublic: () => void;
}

export function AdminLogin({ onSuccess, onBackPublic }: AdminLoginProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.login-reveal', {
          opacity: 0,
          y: 18,
          scale: 0.98,
          duration: 0.45,
          stagger: 0.06,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        });
      });
      return () => mm.revert();
    },
    { scope: cardRef },
  );

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
    <div
      ref={cardRef}
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-5 py-10 text-foreground"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_75%_55%_at_50%_0%,rgba(37,99,235,0.16),transparent)] dark:bg-[radial-gradient(ellipse_75%_55%_at_50%_0%,rgba(59,130,246,0.22),transparent)]"
      />

      <div className="w-full max-w-sm">
        <button
          type="button"
          onClick={onBackPublic}
          className="login-reveal mb-5 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Kembali ke halaman publik
        </button>

        <div className="login-reveal rounded-2xl border border-border/80 bg-card/95 p-6 shadow-lg backdrop-blur-md sm:p-8">
          <div className="mb-6 flex items-center gap-3.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                Konsol Admin Moderasi
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
                className="h-11 rounded-xl sm:h-10"
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
                className="h-11 rounded-xl sm:h-10"
                disabled={submitting}
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="mt-1 h-11 w-full gap-2 rounded-xl font-medium sm:h-10"
              disabled={submitting}
            >
              <Lock className="size-4" />
              {submitting ? 'Memeriksa sesi...' : 'Masuk ke konsol'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
