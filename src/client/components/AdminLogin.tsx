import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ArrowLeft, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '../lib/api';
import { Spine } from './public/Spine';

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
      className="public-scope relative flex h-dvh flex-col items-center justify-center overflow-hidden bg-[var(--paper)] px-4 py-6 text-[var(--ink)] sm:px-6"
    >
      <div aria-hidden="true" className="paper-grain fixed inset-0 z-0" />

      <div className="relative z-10 flex w-full max-w-4xl flex-col gap-4">
        <div className="login-reveal flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackPublic}
            className="inline-flex min-h-11 items-center gap-1.5 border border-[var(--rule-line)] bg-card/80 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-[var(--ink)] sm:min-h-9"
          >
            <ArrowLeft className="size-3.5" />
            Kembali ke arsip publik
          </button>

          <span className="stamp hidden px-2 py-0.5 font-mono text-[10px] font-semibold tracking-widest text-primary uppercase sm:inline-block">
            AKSES TERBATAS
          </span>
        </div>

        <div className="grid grid-cols-1 border border-[var(--rule-line)] bg-card shadow-sm lg:grid-cols-12">
          {/* Left archival dossier brief */}
          <div className="login-reveal ledger-rule flex flex-col justify-between gap-4 border-b border-[var(--rule-line)] bg-[var(--paper)]/75 p-5 sm:p-7 lg:col-span-5 lg:border-r lg:border-b-0">
            <div className="flex flex-col gap-4 lg:h-full lg:flex-row lg:gap-4">
              <Spine code="TCB / AUTH 00" label="KONSOL STAF" />

              <div className="flex flex-1 flex-col justify-between gap-4">
                <div className="flex flex-col gap-2.5">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                    OTENTIKASI STAF &amp; SUPERADMIN
                  </p>
                  <h1 className="font-display text-3xl leading-[1.06] tracking-tight text-[var(--ink)] sm:text-4xl">
                    Gerbang Konsol <span className="tape">Moderasi</span>
                  </h1>
                  <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    Masuk untuk meninjau antrean banding, mengelola sanksi
                    federasi, dan memperbarui piagam aturan komunitas.
                  </p>
                </div>

                <ul className="hidden flex-col gap-1.5 border-t border-dashed border-[var(--rule-line)] pt-3 font-mono text-[11px] text-muted-foreground lg:flex">
                  <li>01 · Sesi cookie HttpOnly terenkripsi</li>
                  <li>02 · Proteksi CSRF &amp; batas percobaan login</li>
                  <li>03 · Setiap mutasi tercatat di audit ledger</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Right login form */}
          <div className="login-reveal flex flex-col justify-center p-5 sm:p-8 lg:col-span-7">
            <div className="mb-5 flex items-center justify-between gap-3 border-b border-dashed border-[var(--rule-line)] pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center border border-[var(--rule-line)] bg-[var(--tape-blue)] text-[var(--ink)]">
                  <ShieldCheck className="size-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-[var(--ink)]">
                    Berkas Identitas Admin
                  </h2>
                  <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                    CREDENTIAL VERIFICATION
                  </p>
                </div>
              </div>
            </div>

            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="flex flex-col gap-4"
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
                  className="h-11 rounded-none border-[var(--rule-line)] bg-background/60 sm:h-10"
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
                    className="h-11 rounded-none border-[var(--rule-line)] bg-background/60 pr-11 sm:h-10"
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
                    className="absolute right-0 inline-flex h-full min-w-11 items-center justify-center text-muted-foreground transition-colors hover:text-[var(--ink)]"
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
                  className="border border-destructive/40 bg-[var(--tape-crimson)] px-3.5 py-2.5 text-xs font-medium text-destructive"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="mt-1 h-11 w-full gap-2 rounded-none font-medium sm:h-10"
                disabled={submitting}
              >
                <Lock className="size-4" />
                {submitting ? 'Memeriksa sesi...' : 'Masuk ke konsol'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
