import { hc } from 'hono/client';
import { Moon, Search, Sun } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import type { AppType } from '../index';
import { AppSidebar } from './components/AppSidebar';
import { CaseDossier } from './components/CaseDossier';
import { INITIAL_CASES } from './data/mock-ledger';
import type { CaseStatus, LedgerCase, LedgerSection } from './types';

const api = hc<AppType>('/');

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
  const [cases, setCases] = useState<LedgerCase[]>(INITIAL_CASES);
  const [statusTab, setStatusTab] = useState<'all' | 'pending' | 'history'>(
    'all',
  );
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(
    INITIAL_CASES[0]?.id ?? null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [healthStatus, setHealthStatus] = useState<
    'loading' | 'ok' | 'degraded'
  >('loading');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    let active = true;
    api.api.health
      .$get({ query: {} })
      .then(async (res) => {
        if (!active) return;
        setHealthStatus(res.ok ? 'ok' : 'degraded');
      })
      .catch(() => {
        if (!active) return;
        setHealthStatus('degraded');
      });
    return () => {
      active = false;
    };
  }, []);

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

  const handleDecide = (
    caseId: string,
    nextStatus: Extract<CaseStatus, 'approved' | 'rejected'>,
    note: string,
  ) => {
    setCases((prev) =>
      prev.map((item) =>
        item.id === caseId
          ? {
              ...item,
              status: nextStatus,
              reason: note ? `${item.reason} — Catatan: ${note}` : item.reason,
            }
          : item,
      ),
    );
    toast(nextStatus === 'approved' ? 'Banding disetujui' : 'Banding ditolak', {
      description:
        nextStatus === 'approved'
          ? 'Ban dicabut dan dicatat ke log audit.'
          : 'Ban tetap aktif dengan masa tunggu 24 jam.',
    });
    if (isMobile) {
      setDrawerOpen(false);
    }
  };

  return (
    <TooltipProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background text-foreground">
          <AppSidebar
            activeSection={activeSection}
            onSelectSection={setActiveSection}
            pendingCount={pendingCount}
            healthStatus={healthStatus}
          />

          <SidebarInset className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-6">
              <div className="flex items-center gap-3">
                <SidebarTrigger />
                <Separator orientation="vertical" className="h-5" />
                <div>
                  <h1 className="text-base font-semibold tracking-tight text-foreground">
                    Antrean banding
                  </h1>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                aria-label="Ubah tema warna"
                onClick={() => setDarkMode((prev) => !prev)}
              >
                {darkMode ? (
                  <Sun className="size-4" />
                ) : (
                  <Moon className="size-4" />
                )}
              </Button>
            </header>

            <div className="flex flex-1 flex-col gap-6 p-6">
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
                        onValueChange={(val) =>
                          setStatusTab(val as 'all' | 'pending' | 'history')
                        }
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
                        <SelectTrigger className="w-40">
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

                  <div className="flex-1 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="px-5 py-3.5">Anggota</TableHead>
                          <TableHead className="px-4 py-3.5">Tingkat</TableHead>
                          <TableHead className="px-4 py-3.5">Status</TableHead>
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
                              className="h-32 px-5 text-center text-sm text-muted-foreground"
                            >
                              Tidak ada kasus yang cocok dengan filter saat ini.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredCases.map((item) => {
                            const isSelected = item.id === selectedId;
                            return (
                              <TableRow
                                key={item.id}
                                data-state={isSelected ? 'selected' : undefined}
                                onClick={() => handleSelectRow(item)}
                                className="cursor-pointer"
                              >
                                <TableCell className="px-5 py-4">
                                  <div className="space-y-1">
                                    <p className="font-medium text-foreground">
                                      {item.displayName}
                                    </p>
                                    <p className="font-mono text-xs text-muted-foreground">
                                      {item.externalRef} · {item.username}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell className="px-4 py-4">
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
                                <TableCell className="px-4 py-4">
                                  <Badge variant="outline">
                                    {STATUS_LABELS[item.status]}
                                  </Badge>
                                </TableCell>
                                <TableCell className="px-5 py-4 text-right text-xs text-muted-foreground">
                                  {item.submittedAt}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </section>

                <aside className="hidden rounded-lg border border-border bg-card lg:col-span-5 lg:block">
                  <CaseDossier
                    selectedCase={selectedCase}
                    onDecide={handleDecide}
                  />
                </aside>
              </div>
            </div>
          </SidebarInset>
        </div>

        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent className="max-h-[88vh]">
            <DrawerHeader className="border-b border-border px-6 py-4 text-left">
              <DrawerTitle>Detail kasus</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto">
              <CaseDossier
                selectedCase={selectedCase}
                onDecide={handleDecide}
              />
            </div>
          </DrawerContent>
        </Drawer>

        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  );
}
