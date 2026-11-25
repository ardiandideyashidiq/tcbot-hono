import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ArrowLeft, Eye, EyeOff, Lock } from 'lucide-react';
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.login-reveal', {
          opacity: 0,
          y: 12,
          duration: 0.36,
          stagger: 0.05,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        });
      });
      return () => mm.revert();
    },
    { scope: containerRef },
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
      ref={containerRef}
      className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-8 text-foreground sm:px-6"
    >
      <div className="flex w-full max-w-md flex-col gap-4">
        <div className="login-reveal flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBackPublic}
            className="gap-1.5 rounded-sm"
          >
            <ArrowLeft className="size-4" />
            Kembali ke beranda
          </Button>
        </div>

        <div className="login-reveal rounded-sm border border-border bg-card">
          <div className="border-b border-border px-6 py-5 sm:px-7 sm:py-6">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Konsol Moderasi
            </h1>
          </div>

          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="flex flex-col gap-4 px-6 py-6 sm:px-7"
          >
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="admin-username"
                className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
              >
                Nama pengguna
              </label>
              <Input
                id="admin-username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="h-11 rounded-sm border-border bg-background"
                disabled={submitting}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="admin-password"
                className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
              >
                Kata sandi
              </label>
              <div className="relative flex items-center">
                <Input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 rounded-sm border-border bg-background pr-11"
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={
                    showPassword
                      ? 'Sembunyikan kata sandi'
                      : 'Tampilkan kata sandi'
                  }
                  className="absolute right-0 inline-flex h-full min-w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-sm border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              className="mt-1 h-12 w-full gap-2 rounded-sm font-medium"
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
