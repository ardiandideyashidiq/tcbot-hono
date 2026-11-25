import {
  Globe,
  KeyRound,
  Loader2,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Sun,
} from 'lucide-react';
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
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
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  type AdminAccountRow,
  AdminAccountsPanel,
} from './components/AdminAccountsPanel';
import { AdminLogin } from './components/AdminLogin';
import { AppSidebar } from './components/AppSidebar';
import { CaseDossier } from './components/CaseDossier';
import { LedgerMiniChart } from './components/CommunityCharts';
import { PaginationBar, type PaginationMeta } from './components/PaginationBar';
import { PublicDashboard } from './components/PublicDashboard';
import {
  type BanRow,
  BansTable,
  type GroupRow,
  GroupsTable,
  type RuleRow,
  RulesTable,
  type StaffRow,
  StaffTable,
  type WarnRow,
  WarnsTable,
} from './components/SectionTables';
import { useDynamicPageSize } from './hooks/use-dynamic-page-size';
import { api } from './lib/api';
import { initTelegramMiniApp, triggerHaptic } from './lib/telegram-webapp';
import type { CaseStatus, LedgerCase, LedgerSection } from './types';

const SECTION_TITLES: Record<LedgerSection, string> = {
  appeals: 'Antrean banding',
  bans: 'Daftar ban',
  warns: 'Catatan peringatan',
  groups: 'Grup terhubung',
  rules: 'Aturan komunitas',
  staff: 'Staf dan peran',
  admins: 'Kelola akun admin',
};

const STATUS_LABELS: Record<CaseStatus, string> = {
  pending: 'Menunggu',
  locked: 'Ditinjau',
  approved: 'Disetujui',
  rejected: 'Ditolak',
};

interface AdminConsoleProps {
  adminUsername: string;
  adminRole: 'superadmin' | 'admin';
  darkMode: boolean;
  onToggleTheme: (event: MouseEvent<HTMLButtonElement>) => void;
  onLogout: () => void;
  onNavigatePublic: () => void;
  onUnauthorized: () => void;
}

function AdminConsole({
  adminUsername,
  adminRole,
  darkMode,
  onToggleTheme,
  onLogout,
  onNavigatePublic,
  onUnauthorized,
}: AdminConsoleProps) {
  const isMobile = useIsMobile();
  const [activeSection, setActiveSection] = useState<LedgerSection>('appeals');

  const [cases, setCases] = useState<LedgerCase[]>([]);
  const [bans, setBans] = useState<BanRow[]>([]);
  const [warns, setWarns] = useState<WarnRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [adminAccounts, setAdminAccounts] = useState<AdminAccountRow[]>([]);
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [loadingSection, setLoadingSection] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });
  const [statusTab, setStatusTab] = useState<'all' | 'pending' | 'history'>(
    'all',
  );
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleTitle, setRuleTitle] = useState('');
  const [ruleCategory, setRuleCategory] = useState('Umum');
  const [ruleBody, setRuleBody] = useState('');
  const [ruleMandatory, setRuleMandatory] = useState(true);
  const [savingRule, setSavingRule] = useState(false);
  const tableContainerRef = useRef<HTMLElement | null>(null);
  const dynamicLimit = useDynamicPageSize(tableContainerRef, 8);

  const loadSectionData = useCallback(
    async (
      section: LedgerSection,
      targetPage: number,
      targetLimit: number,
      appealStatus: 'all' | 'pending' | 'history',
    ) => {
      setLoadingSection(true);
      const query = { page: String(targetPage), limit: String(targetLimit) };
      try {
        if (section === 'appeals') {
          const res = await api.api.ledger.appeals.$get({
            query: { ...query, status: appealStatus },
          });
          if (res.status === 401) {
            onUnauthorized();
            return;
          }
          if (!res.ok) throw new Error('Gagal memuat data banding');
          const data = await res.json();
          setCases(data.items);
          setPagination(data.pagination);
          setSelectedId(data.items[0]?.id ?? null);
        } else if (section === 'bans') {
          const res = await api.api.ledger.bans.$get({ query });
          if (res.status === 401) {
            onUnauthorized();
            return;
          }
          if (!res.ok) throw new Error('Gagal memuat daftar ban');
          const data = await res.json();
          setBans(data.items);
          setPagination(data.pagination);
        } else if (section === 'warns') {
          const res = await api.api.ledger.warns.$get({ query });
          if (res.status === 401) {
            onUnauthorized();
            return;
          }
          if (!res.ok) throw new Error('Gagal memuat daftar peringatan');
          const data = await res.json();
          setWarns(data.items);
          setPagination(data.pagination);
        } else if (section === 'groups') {
          const res = await api.api.ledger.groups.$get({ query });
          if (res.status === 401) {
            onUnauthorized();
            return;
          }
          if (!res.ok) throw new Error('Gagal memuat grup terhubung');
          const data = await res.json();
          setGroups(data.items);
          setPagination(data.pagination);
        } else if (section === 'rules') {
          const res = await api.api.ledger.rules.$get({ query });
          if (!res.ok) throw new Error('Gagal memuat aturan');
          const data = await res.json();
          setRules(data.items);
          setPagination(data.pagination);
        } else if (section === 'staff') {
          const res = await api.api.ledger.staff.$get({ query });
          if (res.status === 401) {
            onUnauthorized();
            return;
          }
          if (!res.ok) throw new Error('Gagal memuat daftar staf');
          const data = await res.json();
          setStaff(data.items);
          setPagination(data.pagination);
        } else if (section === 'admins') {
          const res = await api.api.admin.users.$get();
          if (res.status === 401) {
            onUnauthorized();
            return;
          }
          if (!res.ok) throw new Error('Gagal memuat daftar admin');
          const data = await res.json();
          setAdminAccounts(data.items);
        }
      } catch (err) {
        toast('Gagal memuat data', {
          description:
            err instanceof Error
              ? err.message
              : 'Periksa koneksi API Hono dan Supabase.',
        });
      } finally {
        setLoadingSection(false);
      }
    },
    [onUnauthorized],
  );

  useEffect(() => {
    void loadSectionData(
      activeSection,
      page,
      dynamicLimit,
      activeSection === 'appeals' ? statusTab : 'all',
    );
  }, [activeSection, page, dynamicLimit, statusTab, loadSectionData]);

  const handleSelectSection = (section: LedgerSection) => {
    setPage(1);
    setActiveSection(section);
  };

  const filteredCases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return cases.filter((item) => {
      if (statusTab === 'pending') {
        if (item.status !== 'pending' && item.status !== 'locked') return false;
      } else if (statusTab === 'history') {
        if (item.status !== 'approved' && item.status !== 'rejected')
          return false;
      }

      if (tierFilter !== 'all' && item.ruleTier !== tierFilter) {
        return false;
      }

      if (!q) return true;
      return (
        item.displayName.toLowerCase().includes(q) ||
        item.username.toLowerCase().includes(q) ||
        item.externalRef.toLowerCase().includes(q) ||
        String(item.userId).includes(q)
      );
    });
  }, [cases, statusTab, tierFilter, searchQuery]);

  const selectedCase = useMemo(
    () => cases.find((item) => item.id === selectedId) ?? null,
    [cases, selectedId],
  );

  const pendingCount = useMemo(
    () => cases.filter((item) => item.status === 'pending').length,
    [cases],
  );

  const handleSelectRow = (item: LedgerCase) => {
    setSelectedId(item.id);
    if (isMobile) {
      setDrawerOpen(true);
    }
  };

  const handleDecide = async (
    caseId: string,
    nextStatus: Extract<CaseStatus, 'approved' | 'rejected'>,
    note: string,
  ) => {
    try {
      const res = await api.api.ledger.appeals[':id'].decide.$post({
        param: { id: caseId },
        json: { decision: nextStatus, note: note || undefined },
      });
      if (!res.ok) {
        throw new Error('Gagal menyimpan keputusan banding');
      }

      setCases((prev) =>
        prev.map((item) =>
          item.id === caseId
            ? {
                ...item,
                status: nextStatus,
                reason: note
                  ? `${item.reason} — Catatan: ${note}`
                  : item.reason,
              }
            : item,
        ),
      );

      toast(
        nextStatus === 'approved' ? 'Banding disetujui' : 'Banding ditolak',
        {
          description:
            nextStatus === 'approved'
              ? 'Ban dicabut di database.'
              : 'Ban tetap aktif.',
        },
      );
      triggerHaptic('success');
      if (isMobile) {
        setDrawerOpen(false);
      }
    } catch (err) {
      triggerHaptic('error');
      toast('Keputusan gagal disimpan', {
        description:
          err instanceof Error ? err.message : 'Terjadi kesalahan server.',
      });
    }
  };

  const handleRevokeBan = async (actionId: number) => {
    try {
      const res = await api.api.ledger.bans[':id'].revoke.$post({
        param: { id: String(actionId) },
        json: { reason: 'Revoked from web console' },
      });
      if (!res.ok) {
        throw new Error('Gagal mencabut ban');
      }

      setBans((prev) =>
        prev.map((row) =>
          row.id === actionId ? { ...row, status: 'revoked' } : row,
        ),
      );
      triggerHaptic('success');
      toast('Ban dicabut', {
        description: 'Status ban diperbarui dan dicatat ke log audit.',
      });
    } catch (err) {
      triggerHaptic('error');
      toast('Gagal mencabut ban', {
        description:
          err instanceof Error ? err.message : 'Terjadi kesalahan server.',
      });
    }
  };

  const handleToggleGroup = async (chatId: number) => {
    try {
      const res = await api.api.ledger.groups[':chatId'].toggle.$post({
        param: { chatId: String(chatId) },
      });
      if (!res.ok) {
        throw new Error('Gagal mengubah status grup');
      }
      const data = await res.json();
      setGroups((prev) =>
        prev.map((g) =>
          g.chatId === chatId ? { ...g, isActive: data.group.is_active } : g,
        ),
      );
      triggerHaptic('success');
      toast(data.group.is_active ? 'Grup diaktifkan' : 'Grup dinonaktifkan', {
        description: `Status grup #${chatId} diperbarui.`,
      });
    } catch (err) {
      triggerHaptic('error');
      toast('Gagal mengubah status grup', {
        description:
          err instanceof Error ? err.message : 'Terjadi kesalahan server.',
      });
    }
  };

  const handleCreateRule = async () => {
    if (!ruleTitle.trim() || !ruleBody.trim()) {
      toast('Lengkapi judul dan isi aturan');
      return;
    }
    setSavingRule(true);
    try {
      const res = await api.api.ledger.rules.$post({
        json: {
          title: ruleTitle.trim(),
          body: ruleBody.trim(),
          categoryTitle: ruleCategory.trim() || 'Umum',
          isMandatory: ruleMandatory,
        },
      });
      if (!res.ok) {
        throw new Error('Gagal menambahkan aturan');
      }
      const data = await res.json();
      const createdRule: RuleRow = {
        id: data.rule.id,
        ruleKey: data.rule.rule_key,
        categoryTitle: data.rule.category_title ?? data.rule.category_key,
        title: data.rule.title,
        body: data.rule.body,
        isMandatory: data.rule.is_mandatory,
        versionNumber: 1,
        versionStatus: 'published',
        locale: 'id',
      };
      setRules((prev) => [createdRule, ...prev]);
      setRuleDialogOpen(false);
      setRuleTitle('');
      setRuleBody('');
      triggerHaptic('success');
      toast('Aturan ditambahkan', {
        description: `Aturan "${createdRule.title}" disimpan ke versi aktif.`,
      });
    } catch (err) {
      triggerHaptic('error');
      toast('Gagal menambahkan aturan', {
        description:
          err instanceof Error ? err.message : 'Terjadi kesalahan server.',
      });
    } finally {
      setSavingRule(false);
    }
  };

  const handleCreateAdmin = async (input: {
    username: string;
    displayName: string;
    password: string;
  }): Promise<boolean> => {
    try {
      const res = await api.api.admin.users.$post({ json: input });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(errBody.message ?? 'Gagal membuat akun admin');
      }
      const data = await res.json();
      setAdminAccounts((prev) => [...prev, data.item]);
      triggerHaptic('success');
      toast('Akun admin dibuat', {
        description: `${data.item.username} ditambahkan sebagai admin.`,
      });
      return true;
    } catch (err) {
      triggerHaptic('error');
      toast('Gagal membuat akun admin', {
        description:
          err instanceof Error ? err.message : 'Terjadi kesalahan server.',
      });
      return false;
    }
  };

  const handleToggleAdminActive = async (id: number, nextActive: boolean) => {
    try {
      const res = await api.api.admin.users[':id'].$patch({
        param: { id: String(id) },
        json: { isActive: nextActive },
      });
      if (!res.ok) throw new Error('Gagal mengubah status akun');
      const data = await res.json();
      setAdminAccounts((prev) =>
        prev.map((a) => (a.id === id ? data.item : a)),
      );
      triggerHaptic('success');
      toast(nextActive ? 'Akun diaktifkan' : 'Akun dinonaktifkan');
    } catch (err) {
      triggerHaptic('error');
      toast('Gagal mengubah status akun', {
        description:
          err instanceof Error ? err.message : 'Terjadi kesalahan server.',
      });
    }
  };

  const handleResetAdminPassword = async (
    id: number,
    nextPw: string,
  ): Promise<boolean> => {
    try {
      const res = await api.api.admin.users[':id'].$patch({
        param: { id: String(id) },
        json: { newPassword: nextPw },
      });
      if (!res.ok) throw new Error('Gagal mereset kata sandi');
      triggerHaptic('success');
      toast('Kata sandi admin direset');
      return true;
    } catch (err) {
      triggerHaptic('error');
      toast('Gagal mereset kata sandi', {
        description:
          err instanceof Error ? err.message : 'Terjadi kesalahan server.',
      });
      return false;
    }
  };

  const handleChangeOwnPassword = async () => {
    if (!currentPassword || newPassword.length < 8) {
      toast('Kata sandi baru minimal 8 karakter');
      return;
    }
    setSavingPassword(true);
    try {
      const res = await api.api.auth.password.$post({
        json: { currentPassword, newPassword },
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errBody.error ?? 'Gagal mengganti kata sandi');
      }
      setPwDialogOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      triggerHaptic('success');
      toast('Kata sandi diperbarui');
    } catch (err) {
      triggerHaptic('error');
      toast('Gagal mengganti kata sandi', {
        description:
          err instanceof Error ? err.message : 'Terjadi kesalahan server.',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <TooltipProvider>
      <SidebarProvider>
        <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
          <AppSidebar
            activeSection={activeSection}
            onSelectSection={handleSelectSection}
            pendingCount={pendingCount}
            isSuperadmin={adminRole === 'superadmin'}
          />

          <SidebarInset className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4 pt-[env(safe-area-inset-top,0px)] sm:px-6">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="min-h-10 min-w-10 sm:min-h-8 sm:min-w-8" />
                <Separator orientation="vertical" className="h-5" />
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-semibold tracking-tight text-foreground">
                    {SECTION_TITLES[activeSection]}
                  </h1>
                  <Badge
                    variant={
                      adminRole === 'superadmin' ? 'default' : 'secondary'
                    }
                    className="hidden sm:inline-flex"
                  >
                    {adminUsername} · {adminRole}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeSection === 'rules' && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      triggerHaptic('impact');
                      setRuleDialogOpen(true);
                    }}
                  >
                    <Plus className="size-4" />
                    Tambah aturan
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Muat ulang data"
                  onClick={() =>
                    void loadSectionData(
                      activeSection,
                      page,
                      dynamicLimit,
                      activeSection === 'appeals' ? statusTab : 'all',
                    )
                  }
                  disabled={loadingSection}
                >
                  <RefreshCw
                    className={`size-4 ${loadingSection ? 'animate-spin' : ''}`}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Halaman publik"
                  onClick={onNavigatePublic}
                >
                  <Globe className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Ganti kata sandi"
                  onClick={() => setPwDialogOpen(true)}
                >
                  <KeyRound className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Ubah tema warna"
                  onClick={onToggleTheme}
                >
                  {darkMode ? (
                    <Sun className="size-4" />
                  ) : (
                    <Moon className="size-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Keluar dari konsol admin"
                  onClick={onLogout}
                >
                  <LogOut className="size-4" />
                </Button>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:gap-5 sm:p-6">
              {activeSection === 'appeals' ? (
                <>
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 rounded-xl border border-border/80 bg-card/95 px-4 py-3 shadow-xs sm:px-5">
                    <div className="flex items-center gap-3.5">
                      <LedgerMiniChart
                        labels={['Menunggu', 'Disetujui', 'Ditolak']}
                        values={[
                          cases.filter((c) => c.status === 'pending').length,
                          cases.filter((c) => c.status === 'approved').length,
                          cases.filter((c) => c.status === 'rejected').length,
                        ]}
                        colors={['#F59E0B', '#10B981', '#E11D48']}
                        darkMode={darkMode}
                        ariaLabel="Ringkasan status banding halaman ini"
                      />
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {pendingCount > 0
                            ? `${pendingCount} banding menunggu tinjauan`
                            : 'Semua banding pada halaman ini telah ditinjau'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Total {pagination.total.toLocaleString('id-ID')} entri
                          ·{' '}
                          {cases.filter((c) => c.status === 'approved').length}{' '}
                          disetujui ·{' '}
                          {cases.filter((c) => c.status === 'rejected').length}{' '}
                          ditolak
                        </p>
                      </div>
                    </div>
                    {pendingCount > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-10 sm:min-h-8"
                        onClick={() => {
                          setPage(1);
                          setStatusTab('pending');
                        }}
                      >
                        Tampilkan antrean aktif
                      </Button>
                    )}
                  </div>

                  <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-12">
                    <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card lg:col-span-7">
                      <div className="flex flex-col gap-4 border-b border-border p-5">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <Tabs
                            value={statusTab}
                            onValueChange={(val) => {
                              setPage(1);
                              setStatusTab(
                                val as 'all' | 'pending' | 'history',
                              );
                            }}
                          >
                            <TabsList>
                              <TabsTrigger value="all">Semua</TabsTrigger>
                              <TabsTrigger value="pending">Aktif</TabsTrigger>
                              <TabsTrigger value="history">Riwayat</TabsTrigger>
                            </TabsList>
                          </Tabs>

                          <Select
                            value={tierFilter}
                            onValueChange={(val) => setTierFilter(val ?? 'all')}
                          >
                            <SelectTrigger className="w-full sm:w-44">
                              <SelectValue placeholder="Semua tingkat" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Semua tingkat</SelectItem>
                              <SelectItem value="Ringan">Ringan</SelectItem>
                              <SelectItem value="Sedang">Sedang</SelectItem>
                              <SelectItem value="Berat">Berat</SelectItem>
                              <SelectItem value="Sangat berat">
                                Sangat berat
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="relative">
                          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Cari nama, username, ID pengguna, atau kode ban..."
                            className="pl-9"
                          />
                        </div>
                      </div>

                      <section
                        ref={tableContainerRef}
                        aria-label="Daftar banding"
                        className="ledger-table-wrap min-h-0 flex-1 overflow-auto"
                      >
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="px-5 py-3.5">
                                Anggota
                              </TableHead>
                              <TableHead className="px-4 py-3.5">
                                Tingkat
                              </TableHead>
                              <TableHead className="px-4 py-3.5">
                                Status
                              </TableHead>
                              <TableHead className="px-5 py-3.5 text-right">
                                Waktu
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredCases.length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={4}
                                  className="h-36 px-5 text-center text-sm text-muted-foreground"
                                >
                                  {loadingSection
                                    ? 'Memuat data banding dari Supabase...'
                                    : 'Belum ada banding yang cocok dengan filter saat ini.'}
                                </TableCell>
                              </TableRow>
                            ) : (
                              filteredCases.map((item) => {
                                const isSelected = item.id === selectedId;
                                return (
                                  <TableRow
                                    key={item.id}
                                    data-state={
                                      isSelected ? 'selected' : undefined
                                    }
                                    onClick={() => handleSelectRow(item)}
                                    className="cursor-pointer"
                                  >
                                    <TableCell
                                      data-label="Anggota"
                                      className="px-5 py-4"
                                    >
                                      <div className="space-y-1">
                                        <p className="font-medium text-foreground">
                                          {item.displayName}
                                        </p>
                                        <p className="font-mono text-xs text-muted-foreground">
                                          {item.externalRef} · {item.username}
                                        </p>
                                      </div>
                                    </TableCell>
                                    <TableCell
                                      data-label="Tingkat"
                                      className="px-4 py-4"
                                    >
                                      <Badge
                                        variant={
                                          item.ruleTier === 'Sangat berat' ||
                                          item.ruleTier === 'Berat'
                                            ? 'destructive'
                                            : 'secondary'
                                        }
                                      >
                                        {item.ruleTier}
                                      </Badge>
                                    </TableCell>
                                    <TableCell
                                      data-label="Status"
                                      className="px-4 py-4"
                                    >
                                      <Badge variant="outline">
                                        {STATUS_LABELS[item.status]}
                                      </Badge>
                                    </TableCell>
                                    <TableCell
                                      data-label="Waktu"
                                      className="px-5 py-4 text-right text-xs text-muted-foreground"
                                    >
                                      {item.submittedAt}
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                            )}
                          </TableBody>
                        </Table>
                      </section>

                      <PaginationBar
                        pagination={pagination}
                        disabled={loadingSection}
                        onPageChange={setPage}
                      />
                    </section>

                    <aside className="hidden min-h-0 overflow-hidden rounded-lg border border-border bg-card lg:col-span-5 lg:block">
                      <CaseDossier
                        selectedCase={selectedCase}
                        onDecide={(id, decision, note) =>
                          void handleDecide(id, decision, note)
                        }
                      />
                    </aside>
                  </div>
                </>
              ) : (
                <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card">
                  <div
                    ref={(el) => {
                      tableContainerRef.current = el;
                    }}
                    className="ledger-table-wrap min-h-0 flex-1 overflow-auto"
                  >
                    {activeSection === 'bans' && (
                      <BansTable
                        items={bans}
                        loading={loadingSection}
                        onRevokeBan={(id) => void handleRevokeBan(id)}
                      />
                    )}
                    {activeSection === 'warns' && (
                      <WarnsTable items={warns} loading={loadingSection} />
                    )}
                    {activeSection === 'groups' && (
                      <GroupsTable
                        items={groups}
                        loading={loadingSection}
                        onToggleGroup={(id) => void handleToggleGroup(id)}
                      />
                    )}
                    {activeSection === 'rules' && (
                      <RulesTable items={rules} loading={loadingSection} />
                    )}
                    {activeSection === 'staff' && (
                      <StaffTable items={staff} loading={loadingSection} />
                    )}
                    {activeSection === 'admins' && (
                      <AdminAccountsPanel
                        items={adminAccounts}
                        loading={loadingSection}
                        onCreateAdmin={handleCreateAdmin}
                        onToggleActive={handleToggleAdminActive}
                        onResetPassword={handleResetAdminPassword}
                      />
                    )}
                  </div>

                  {activeSection !== 'admins' && (
                    <PaginationBar
                      pagination={pagination}
                      disabled={loadingSection}
                      onPageChange={setPage}
                    />
                  )}
                </section>
              )}
            </div>
          </SidebarInset>
        </div>

        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent className="max-h-[88dvh] pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
            <DrawerHeader className="border-b border-border px-6 py-4 text-left">
              <DrawerTitle>Detail kasus</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto">
              <CaseDossier
                selectedCase={selectedCase}
                onDecide={(id, decision, note) =>
                  void handleDecide(id, decision, note)
                }
              />
            </div>
          </DrawerContent>
        </Drawer>

        <Dialog open={loadingSection}>
          <DialogContent
            showCloseButton={false}
            className="max-w-xs p-6 text-center"
          >
            <DialogHeader className="items-center gap-3 text-center">
              <div className="flex size-11 items-center justify-center rounded-full border border-border bg-muted/50">
                <Loader2 className="size-5 animate-spin text-primary" />
              </div>
              <DialogTitle className="text-base">
                Memuat {SECTION_TITLES[activeSection].toLowerCase()}
              </DialogTitle>
              <DialogDescription>
                Mengambil data terbaru dari Supabase...
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>

        <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
          <DialogContent className="max-w-md p-6">
            <DialogHeader className="gap-1.5">
              <DialogTitle>Tambah aturan komunitas</DialogTitle>
              <DialogDescription>
                Tambahkan butir aturan baru ke versi aturan aktif.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="rule-category"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Kategori
                </label>
                <Input
                  id="rule-category"
                  value={ruleCategory}
                  onChange={(e) => setRuleCategory(e.target.value)}
                  placeholder="Misal: Umum"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="rule-title"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Judul aturan
                </label>
                <Input
                  id="rule-title"
                  value={ruleTitle}
                  onChange={(e) => setRuleTitle(e.target.value)}
                  placeholder="Misal: Dilarang spam atau promosi berulang"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="rule-body"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Penjelasan lengkap
                </label>
                <Textarea
                  id="rule-body"
                  rows={3}
                  value={ruleBody}
                  onChange={(e) => setRuleBody(e.target.value)}
                  placeholder="Jelaskan batasan dan konsekuensi pelanggaran..."
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ruleMandatory}
                  onChange={(e) => setRuleMandatory(e.target.checked)}
                  className="size-4 rounded border-border accent-primary"
                />
                Wajib dipatuhi (mandatory)
              </label>
            </div>
            <DialogFooter className="mt-2">
              <Button
                variant="outline"
                onClick={() => setRuleDialogOpen(false)}
                disabled={savingRule}
              >
                Batal
              </Button>
              <Button
                onClick={() => void handleCreateRule()}
                disabled={savingRule}
              >
                {savingRule ? 'Menyimpan...' : 'Simpan aturan'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={pwDialogOpen} onOpenChange={setPwDialogOpen}>
          <DialogContent className="max-w-sm p-6">
            <DialogHeader className="gap-1.5">
              <DialogTitle>Ganti kata sandi ({adminUsername})</DialogTitle>
              <DialogDescription>
                Masukkan kata sandi saat ini dan kata sandi baru minimal 8
                karakter.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="own-current-pw"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Kata sandi saat ini
                </label>
                <Input
                  id="own-current-pw"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="own-new-pw"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Kata sandi baru
                </label>
                <Input
                  id="own-new-pw"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>
            <DialogFooter className="mt-2">
              <Button
                variant="outline"
                onClick={() => setPwDialogOpen(false)}
                disabled={savingPassword}
              >
                Batal
              </Button>
              <Button
                onClick={() => void handleChangeOwnPassword()}
                disabled={savingPassword}
              >
                {savingPassword ? 'Menyimpan...' : 'Simpan sandi'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  );
}

function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [pathname, setPathname] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/',
  );
  const [sessionState, setSessionState] = useState<
    'checking' | 'authenticated' | 'unauthenticated'
  >('checking');
  const [adminIdentity, setAdminIdentity] = useState<{
    username: string;
    role: 'superadmin' | 'admin';
  }>({ username: 'admin', role: 'admin' });

  useEffect(() => {
    const scheme = initTelegramMiniApp();
    if (scheme === 'dark') {
      setDarkMode(true);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    const handlePop = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const navigate = useCallback((to: '/' | '/admin') => {
    if (window.location.pathname !== to) {
      window.history.pushState({}, '', to);
      setPathname(to);
    }
  }, []);

  const handleUnauthorized = useCallback(() => {
    setSessionState('unauthenticated');
  }, []);

  const checkSession = useCallback(async () => {
    setSessionState('checking');
    try {
      const res = await api.api.auth.session.$get();
      if (!res.ok) {
        setSessionState('unauthenticated');
        return;
      }
      const data = await res.json();
      if (data.authenticated && data.username) {
        setAdminIdentity({
          username: data.username,
          role: data.role === 'superadmin' ? 'superadmin' : 'admin',
        });
        setSessionState('authenticated');
      } else {
        setSessionState('unauthenticated');
      }
    } catch {
      setSessionState('unauthenticated');
    }
  }, []);

  const onAdminRoute = isAdminPath(pathname);

  useEffect(() => {
    if (onAdminRoute) {
      void checkSession();
    }
  }, [onAdminRoute, checkSession]);

  const handleToggleTheme = (event: MouseEvent<HTMLButtonElement>) => {
    triggerHaptic('impact');
    const nextDark = !darkMode;
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    if (reducedMotion || typeof document.startViewTransition !== 'function') {
      document.documentElement.classList.add('theme-transition');
      setDarkMode(nextDark);
      window.setTimeout(() => {
        document.documentElement.classList.remove('theme-transition');
      }, 240);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX || rect.left + rect.width / 2;
    const y = event.clientY || rect.top + rect.height / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    const transition = document.startViewTransition(() => {
      flushSync(() => {
        setDarkMode(nextDark);
      });
    });

    void transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 340,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    });
  };

  const handleLogout = async () => {
    await api.api.auth.logout.$post().catch(() => {});
    setSessionState('unauthenticated');
    toast('Sesi admin diakhiri');
  };

  if (!onAdminRoute) {
    return (
      <>
        <PublicDashboard
          darkMode={darkMode}
          onToggleTheme={handleToggleTheme}
          onNavigateAdmin={() => navigate('/admin')}
        />
        <Toaster />
      </>
    );
  }

  if (sessionState === 'checking') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          Memeriksa sesi admin...
        </div>
      </div>
    );
  }

  if (sessionState !== 'authenticated') {
    return (
      <>
        <AdminLogin
          onSuccess={(identity) => {
            setAdminIdentity(identity);
            setSessionState('authenticated');
          }}
          onBackPublic={() => navigate('/')}
        />
        <Toaster />
      </>
    );
  }

  return (
    <AdminConsole
      adminUsername={adminIdentity.username}
      adminRole={adminIdentity.role}
      darkMode={darkMode}
      onToggleTheme={handleToggleTheme}
      onLogout={() => void handleLogout()}
      onNavigatePublic={() => navigate('/')}
      onUnauthorized={handleUnauthorized}
    />
  );
}
