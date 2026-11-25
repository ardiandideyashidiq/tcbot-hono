import { Lock, Paperclip, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import type { CaseStatus, LedgerCase } from '../types';

interface CaseDossierProps {
  selectedCase: LedgerCase | null;
  onDecide: (
    caseId: string,
    nextStatus: Extract<CaseStatus, 'approved' | 'rejected'>,
    note: string,
  ) => void;
}

function initialsFromName(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function CaseDossier({ selectedCase, onDecide }: CaseDossierProps) {
  const [decisionNote, setDecisionNote] = useState('');

  if (!selectedCase) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center p-8 text-center">
        <div className="max-w-xs space-y-2">
          <p className="text-sm font-medium text-foreground">
            Pilih satu kasus dari daftar
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Detail identitas, bukti pelanggaran, dan tombol keputusan akan
            tampil di panel ini.
          </p>
        </div>
      </div>
    );
  }

  const isResolved =
    selectedCase.status === 'approved' || selectedCase.status === 'rejected';

  const handleConfirm = (
    nextStatus: Extract<CaseStatus, 'approved' | 'rejected'>,
  ) => {
    onDecide(selectedCase.id, nextStatus, decisionNote.trim());
    setDecisionNote('');
  };

  return (
    <ScrollArea className="h-full">
      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-12 lg:gap-8">
        <div className="space-y-5 lg:col-span-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <Avatar className="size-11 rounded-sm border border-border">
                <AvatarFallback className="rounded-sm bg-muted text-sm font-medium text-foreground">
                  {initialsFromName(selectedCase.displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <h2 className="text-base leading-none font-semibold text-foreground">
                  {selectedCase.displayName}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{selectedCase.username}</span>
                  <span>•</span>
                  <span className="font-mono tabular-nums">
                    {selectedCase.userId}
                  </span>
                </div>
              </div>
            </div>

            <Badge
              variant={
                selectedCase.ruleTier === 'Sangat berat' ||
                selectedCase.ruleTier === 'Berat'
                  ? 'destructive'
                  : 'secondary'
              }
              className="rounded-sm"
            >
              {selectedCase.ruleTier}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-sm border border-border bg-muted/50 px-2.5 py-1 font-mono text-foreground tabular-nums">
              {selectedCase.externalRef}
            </span>
            <span className="rounded-sm border border-border px-2.5 py-1">
              {selectedCase.originGroup}
            </span>
            <span className="rounded-sm border border-border px-2.5 py-1 tabular-nums">
              {selectedCase.submittedAt}
            </span>
          </div>

          {selectedCase.status === 'locked' && selectedCase.lockedBy && (
            <div className="flex items-start gap-3 rounded-sm border border-border bg-muted/40 p-4 text-sm">
              <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">
                  Sedang ditinjau oleh {selectedCase.lockedBy}
                </p>
                <p className="text-xs text-muted-foreground">
                  Kunci peninjau 12 jam aktif ({selectedCase.lockExpiresIn}).
                </p>
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-2.5">
            <div className="flex items-center gap-2 font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              <ShieldAlert className="size-3.5" />
              <span>Catatan pelanggaran</span>
            </div>
            <p className="text-sm font-medium text-foreground">
              {selectedCase.ruleTitle}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {selectedCase.reason}
            </p>
          </div>

          <div className="space-y-2.5">
            <p className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              Pernyataan banding
            </p>
            <div className="rounded-sm border border-border bg-muted/25 p-4">
              <p className="text-sm leading-relaxed text-foreground">
                {selectedCase.appealText}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-sm border border-border px-4 py-3">
            <div className="flex items-center gap-2.5 text-sm text-foreground tabular-nums">
              <Paperclip className="size-4 text-muted-foreground" />
              <span>{selectedCase.proofCount} lampiran bukti tersimpan</span>
            </div>
            <Button variant="outline" size="sm" disabled className="rounded-sm">
              Buka arsip
            </Button>
          </div>
        </div>

        <Separator className="lg:hidden" />

        <div className="flex flex-col justify-between gap-5 lg:col-span-5 lg:border-l lg:border-border lg:pl-8">
          <div className="space-y-2.5">
            <label
              htmlFor="decision-note"
              className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
            >
              Catatan keputusan (opsional)
            </label>
            <Textarea
              id="decision-note"
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder="Tuliskan alasan singkat untuk log audit..."
              className="min-h-28 resize-none rounded-sm lg:min-h-40"
              disabled={isResolved}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    disabled={isResolved}
                    className="flex-1 rounded-sm sm:flex-none"
                  >
                    Setujui banding
                  </Button>
                }
              />
              <AlertDialogContent className="rounded-sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Setujui banding dan cabut ban?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Akses {selectedCase.displayName} ({selectedCase.username})
                    akan dipulihkan di seluruh grup terhubung.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-sm">
                    Batal
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="rounded-sm"
                    onClick={() => handleConfirm('approved')}
                  >
                    Setujui banding
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="destructive"
                    disabled={isResolved}
                    className="flex-1 rounded-sm sm:flex-none"
                  >
                    Tolak banding
                  </Button>
                }
              />
              <AlertDialogContent className="rounded-sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>Tolak banding ini?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Status ban akan tetap aktif dan pengguna memasuki masa
                    tunggu 24 jam sebelum dapat mengajukan banding ulang.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-sm">
                    Batal
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="rounded-sm"
                    onClick={() => handleConfirm('rejected')}
                  >
                    Tolak banding
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
