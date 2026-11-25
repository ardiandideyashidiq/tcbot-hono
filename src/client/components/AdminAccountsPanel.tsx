import { KeyRound, Plus, ShieldAlert, UserCheck, UserX } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface AdminAccountRow {
  id: number;
  username: string;
  displayName: string;
  role: 'superadmin' | 'admin';
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface AdminAccountsPanelProps {
  items: AdminAccountRow[];
  loading: boolean;
  onCreateAdmin: (input: {
    username: string;
    displayName: string;
    password: string;
  }) => Promise<boolean>;
  onToggleActive: (id: number, nextActive: boolean) => Promise<void>;
  onResetPassword: (id: number, newPassword: string) => Promise<boolean>;
}

export function AdminAccountsPanel({
  items,
  loading,
  onCreateAdmin,
  onToggleActive,
  onResetPassword,
}: AdminAccountsPanelProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const [resetTarget, setResetTarget] = useState<AdminAccountRow | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const ok = await onCreateAdmin({
        username: username.trim().toLowerCase(),
        displayName: displayName.trim(),
        password,
      });
      if (ok) {
        setCreateOpen(false);
        setUsername('');
        setDisplayName('');
        setPassword('');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      const ok = await onResetPassword(resetTarget.id, resetPassword);
      if (ok) {
        setResetTarget(null);
        setResetPassword('');
      }
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border bg-card px-5 py-3.5">
        <div className="flex items-center gap-2.5 text-sm">
          <ShieldAlert className="size-4 shrink-0 text-primary" />
          <span className="text-muted-foreground">
            Hanya satu <strong className="text-foreground">superadmin</strong>{' '}
            aktif yang diizinkan. Superadmin dapat menambah atau menonaktifkan
            akun admin lain.
          </span>
        </div>
        <Button
          size="sm"
          className="gap-1.5 rounded-sm"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-4" />
          Tambah admin
        </Button>
      </div>

      <div className="ledger-table-wrap min-h-0 flex-1 overflow-auto rounded-sm border border-border bg-card">
        {loading && items.length === 0 ? (
          <div className="flex flex-col gap-3 p-5">
            <Skeleton className="h-10 w-full rounded-sm" />
            <Skeleton className="h-10 w-full rounded-sm" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-6 py-3.5">Nama pengguna</TableHead>
                <TableHead className="px-4 py-3.5">Nama tampilan</TableHead>
                <TableHead className="px-4 py-3.5">Peran</TableHead>
                <TableHead className="px-4 py-3.5">Status</TableHead>
                <TableHead className="px-4 py-3.5">Login terakhir</TableHead>
                <TableHead className="px-6 py-3.5 text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Belum ada akun admin terdaftar.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell
                      data-label="Nama pengguna"
                      className="px-6 py-4 font-mono text-xs font-medium"
                    >
                      {row.username}
                    </TableCell>
                    <TableCell data-label="Nama tampilan" className="px-4 py-4">
                      {row.displayName}
                    </TableCell>
                    <TableCell data-label="Peran" className="px-4 py-4">
                      <Badge
                        variant={
                          row.role === 'superadmin' ? 'default' : 'secondary'
                        }
                        className="rounded-sm"
                      >
                        {row.role}
                      </Badge>
                    </TableCell>
                    <TableCell data-label="Status" className="px-4 py-4">
                      <Badge
                        variant={row.isActive ? 'secondary' : 'destructive'}
                        className="rounded-sm"
                      >
                        {row.isActive ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </TableCell>
                    <TableCell
                      data-label="Login terakhir"
                      className="px-4 py-4 text-xs text-muted-foreground tabular-nums"
                    >
                      {row.lastLoginAt
                        ? new Date(row.lastLoginAt).toLocaleString('id-ID')
                        : 'Belum pernah'}
                    </TableCell>
                    <TableCell
                      data-label="Aksi"
                      className="px-6 py-4 text-right"
                    >
                      {row.role === 'superadmin' ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          Terkunci
                        </span>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 rounded-sm"
                            onClick={() => {
                              setResetTarget(row);
                              setResetPassword('');
                            }}
                          >
                            <KeyRound className="size-3.5" />
                            Reset sandi
                          </Button>
                          <Button
                            variant={row.isActive ? 'destructive' : 'outline'}
                            size="sm"
                            className="gap-1.5 rounded-sm"
                            onClick={() =>
                              void onToggleActive(row.id, !row.isActive)
                            }
                          >
                            {row.isActive ? (
                              <>
                                <UserX className="size-3.5" />
                                Nonaktifkan
                              </>
                            ) : (
                              <>
                                <UserCheck className="size-3.5" />
                                Aktifkan
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md rounded-sm p-6">
          <DialogHeader className="gap-1.5">
            <DialogTitle>Tambah akun admin</DialogTitle>
            <DialogDescription>
              Akun baru mendapat peran admin untuk moderasi dan pengelolaan
              aturan.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="new-admin-username"
                className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
              >
                Nama pengguna (a-z, 0-9, ., _, -)
              </label>
              <Input
                id="new-admin-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="misal: moderator_budi"
                className="h-10 rounded-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="new-admin-name"
                className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
              >
                Nama tampilan
              </label>
              <Input
                id="new-admin-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Budi Santoso"
                className="h-10 rounded-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="new-admin-password"
                className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
              >
                Kata sandi awal (minimal 8 karakter)
              </label>
              <Input
                id="new-admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-10 rounded-sm"
              />
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={saving}
              className="rounded-sm"
            >
              Batal
            </Button>
            <Button
              onClick={() => void handleCreate()}
              disabled={saving}
              className="rounded-sm"
            >
              {saving ? 'Menyimpan...' : 'Buat akun'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(resetTarget)}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null);
        }}
      >
        <DialogContent className="max-w-sm rounded-sm p-6">
          <DialogHeader className="gap-1.5">
            <DialogTitle>Reset sandi {resetTarget?.username}</DialogTitle>
            <DialogDescription>
              Sesi aktif admin ini akan otomatis dicabut setelah sandi diubah.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5 py-2">
            <label
              htmlFor="reset-admin-password"
              className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
            >
              Kata sandi baru (minimal 8 karakter)
            </label>
            <Input
              id="reset-admin-password"
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="••••••••"
              className="h-10 rounded-sm"
            />
          </div>
          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => setResetTarget(null)}
              disabled={resetting}
              className="rounded-sm"
            >
              Batal
            </Button>
            <Button
              onClick={() => void handleReset()}
              disabled={resetting}
              className="rounded-sm"
            >
              {resetting ? 'Menyimpan...' : 'Simpan sandi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
