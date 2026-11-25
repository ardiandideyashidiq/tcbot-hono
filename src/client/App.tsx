import { Loader2, Moon, RefreshCw, Search, Sun } from 'lucide-react';
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
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
import { TooltipProvider } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { AppSidebar } from './components/AppSidebar';
import { CaseDossier } from './components/CaseDossier';
import { PaginationBar, type PaginationMeta } from './components/PaginationBar';
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
import { api } from './lib/api';
import type { CaseStatus, LedgerCase, LedgerSection } from './types';

const SECTION_TITLES: Record<LedgerSection, string> = {
  appeals: 'Antrean banding',
  bans: 'Daftar ban',
  warns: 'Catatan peringatan',
  groups: 'Grup terhubung',
  rules: 'Aturan komunitas',
  staff: 'Staf dan peran',
};

const STATUS_LABELS: Record<CaseStatus, string> = {
  pending: 'Menunggu',
  locked: 'Ditinjau',
  approved: 'Disetujui',
  rejected: 'Ditolak',
};

export function App() {
  const isMobile = useIsMobile();
  const [darkMode, setDarkMode] = useState(false);
  const [activeSection, setActiveSection] = useState<LedgerSection>('appeals');

  const [cases, setCases] = useState<LedgerCase[]>([]);
  const [bans, setBans] = useState<BanRow[]>([]);
  const [warns, setWarns] = useState<WarnRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);

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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const loadSectionData = useCallback(
    async (
      section: LedgerSection,
      targetPage: number,
      appealStatus: 'all' | 'pending' | 'history',
    ) => {
      setLoadingSection(true);
      const query = { page: String(targetPage), limit: '15' };
      try {
        if (section === 'appeals') {
          const res = await api.api.ledger.appeals.$get({
            query: { ...query, status: appealStatus },
          });
          if (!res.ok) throw new Error('Gagal memuat data banding');
          const data = await res.json();
          setCases(data.items);
          setPagination(data.pagination);
          setSelectedId(data.items[0]?.id ?? null);
        } else if (section === 'bans') {
          const res = await api.api.ledger.bans.$get({ query });
          if (!res.ok) throw new Error('Gagal memuat daftar ban');
          const data = await res.json();
          setBans(data.items);
          setPagination(data.pagination);
        } else if (section === 'warns') {
          const res = await api.api.ledger.warns.$get({ query });
          if (!res.ok) throw new Error('Gagal memuat daftar peringatan');
          const data = await res.json();
          setWarns(data.items);
          setPagination(data.pagination);
        } else if (section === 'groups') {
          const res = await api.api.ledger.groups.$get({ query });
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
          if (!res.ok) throw new Error('Gagal memuat daftar staf');
          const data = await res.json();
          setStaff(data.items);
          setPagination(data.pagination);
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
    [],
  );

  useEffect(() => {
    void loadSectionData(
      activeSection,
      page,
      activeSection === 'appeals' ? statusTab : 'all',
    );
  }, [activeSection, page, statusTab, loadSectionData]);

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
      if (isMobile) {
        setDrawerOpen(false);
      }
    } catch (err) {
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
      toast('Ban dicabut', {
        description: 'Status ban diperbarui dan dicatat ke log audit.',
      });
    } catch (err) {
      toast('Gagal mencabut ban', {
        description:
          err instanceof Error ? err.message : 'Terjadi kesalahan server.',
      });
    }
  };

  const handleToggleTheme = (event: MouseEvent<HTMLButtonElement>) => {
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
      document.documentElement.classList.toggle('dark', nextDark);
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
          duration: 420,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    });
  };

  return (
    <TooltipProvider>
      <SidebarProvider>
        <div className="flex min-h-dvh w-full bg-background text-foreground">
          <AppSidebar
            activeSection={activeSection}
            onSelectSection={handleSelectSection}
            pendingCount={pendingCount}
          />

          <SidebarInset className="flex min-w-0 flex-1 flex-col">
            <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4 pt-[env(safe-area-inset-top,0px)] sm:px-6">
              <div className="flex items-center gap-3">
                <SidebarTrigger />
                <Separator orientation="vertical" className="h-5" />
                <h1 className="text-base font-semibold tracking-tight text-foreground">
                  {SECTION_TITLES[activeSection]}
                </h1>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Muat ulang data"
                  onClick={() =>
                    void loadSectionData(
                      activeSection,
                      page,
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
                  aria-label="Ubah tema warna"
                  onClick={handleToggleTheme}
                >
                  {darkMode ? (
                    <Sun className="size-4" />
                  ) : (
                    <Moon className="size-4" />
                  )}
                </Button>
              </div>
            </header>

            <div className="flex flex-1 flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] sm:gap-6 sm:p-6">
              {activeSection === 'appeals' ? (
                <>
                  {pendingCount > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card px-5 py-3.5">
                      <p className="text-sm text-foreground">
                        <span className="font-semibold">
                          {pendingCount} banding
                        </span>{' '}
                        menunggu peninjauan moderator.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setStatusTab('pending')}
                      >
                        Tampilkan antrean aktif
                      </Button>
                    </div>
                  )}

                  <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-12">
                    <section className="flex flex-col rounded-lg border border-border bg-card lg:col-span-7">
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
                        aria-label="Daftar banding"
                        className="ledger-table-wrap flex-1 overflow-x-auto"
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

                    <aside className="hidden rounded-lg border border-border bg-card lg:col-span-5 lg:block">
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
                <section
                  aria-label={SECTION_TITLES[activeSection]}
                  className="ledger-table-wrap overflow-x-auto rounded-lg border border-border bg-card"
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
                    <GroupsTable items={groups} loading={loadingSection} />
                  )}
                  {activeSection === 'rules' && (
                    <RulesTable items={rules} loading={loadingSection} />
                  )}
                  {activeSection === 'staff' && (
                    <StaffTable items={staff} loading={loadingSection} />
                  )}

                  <PaginationBar
                    pagination={pagination}
                    disabled={loadingSection}
                    onPageChange={setPage}
                  />
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

        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  );
}
