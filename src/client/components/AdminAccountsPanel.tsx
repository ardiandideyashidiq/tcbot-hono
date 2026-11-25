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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-5 py-3.5">
        <div className="flex items-center gap-2.5 text-sm">
          <ShieldAlert className="size-4 text-primary" />
          <span className="text-muted-foreground">
            Hanya satu <strong className="text-foreground">superadmin</strong>{' '}
            aktif yang diizinkan. Superadmin dapat menambah atau menonaktifkan
            akun admin lain.
          </span>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-4" />
          Tambah admin
        </Button>
      </div>

      <div className="ledger-table-wrap min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card">
        {loading && items.length === 0 ? (
          <div className="flex flex-col gap-3 p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama pengguna</TableHead>
                <TableHead>Nama tampilan</TableHead>
                <TableHead>Peran</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Login terakhir</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
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
                    <TableCell className="font-mono text-xs font-medium">
                      {row.username}
                    </TableCell>
                    <TableCell>{row.displayName}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.role === 'superadmin' ? 'default' : 'secondary'
                        }
                      >
                        {row.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={row.isActive ? 'secondary' : 'destructive'}
                      >
                        {row.isActive ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.lastLoginAt
                        ? new Date(row.lastLoginAt).toLocaleString('id-ID')
                        : 'Belum pernah'}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.role === 'superadmin' ? (
                        <span className="text-xs text-muted-foreground">
                          Terkunci
                        </span>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
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
                            className="gap-1"
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
        <DialogContent className="max-w-md p-6">
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
                className="text-xs font-medium text-muted-foreground"
              >
                Nama pengguna (a-z, 0-9, ., _, -)
              </label>
              <Input
                id="new-admin-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="misal: moderator_budi"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="new-admin-name"
                className="text-xs font-medium text-muted-foreground"
              >
                Nama tampilan
              </label>
              <Input
                id="new-admin-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Budi Santoso"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="new-admin-password"
                className="text-xs font-medium text-muted-foreground"
              >
                Kata sandi awal (minimal 8 karakter)
              </label>
              <Input
                id="new-admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button onClick={() => void handleCreate()} disabled={saving}>
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
        <DialogContent className="max-w-sm p-6">
          <DialogHeader className="gap-1.5">
            <DialogTitle>Reset sandi {resetTarget?.username}</DialogTitle>
            <DialogDescription>
              Sesi aktif admin ini akan otomatis dicabut setelah sandi diubah.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5 py-2">
            <label
              htmlFor="reset-admin-password"
              className="text-xs font-medium text-muted-foreground"
            >
              Kata sandi baru (minimal 8 karakter)
            </label>
            <Input
              id="reset-admin-password"
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => setResetTarget(null)}
              disabled={resetting}
            >
              Batal
            </Button>
            <Button onClick={() => void handleReset()} disabled={resetting}>
              {resetting ? 'Menyimpan...' : 'Simpan sandi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
