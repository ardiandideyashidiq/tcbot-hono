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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface BanRow {
  id: number;
  externalRef: string;
  userId: number;
  displayName: string;
  username: string;
  originGroup: string;
  reason: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface WarnRow {
  id: number;
  externalRef: string;
  userId: number;
  displayName: string;
  username: string;
  groupTitle: string;
  reason: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface GroupRow {
  chatId: number;
  title: string;
  chatType: string;
  isActive: boolean;
  addedAt: string;
}

export interface RuleRow {
  id: number;
  ruleKey: string;
  categoryTitle: string;
  title: string;
  body: string;
  isMandatory: boolean;
  versionNumber: number;
  versionStatus: string;
  locale: string;
}

export interface StaffRow {
  id: number;
  userId: number;
  displayName: string;
  username: string;
  roleKey: string;
  roleDisplayName: string;
  priority: number;
  assignedAt: string;
}

function TableLoadingSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <TableRow>
      <TableCell
        colSpan={5}
        className="h-40 px-6 text-center text-sm text-muted-foreground"
      >
        {message}
      </TableCell>
    </TableRow>
  );
}

export function BansTable({
  items,
  loading,
  onRevokeBan,
}: {
  items: BanRow[];
  loading: boolean;
  onRevokeBan: (id: number) => void;
}) {
  if (loading) return <TableLoadingSkeleton />;

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="px-6 py-4">Pengguna</TableHead>
          <TableHead className="px-4 py-4">Grup asal</TableHead>
          <TableHead className="px-4 py-4">Alasan</TableHead>
          <TableHead className="px-4 py-4">Status</TableHead>
          <TableHead className="px-6 py-4 text-right">Tindakan</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <EmptyState message="Belum ada data ban di Supabase." />
        ) : (
          items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="px-6 py-4">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    {item.displayName}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {item.externalRef} · {item.username}
                  </p>
                </div>
              </TableCell>
              <TableCell className="px-4 py-4 text-sm text-muted-foreground">
                {item.originGroup}
              </TableCell>
              <TableCell className="max-w-xs px-4 py-4 text-sm text-muted-foreground">
                <p className="line-clamp-2">{item.reason}</p>
              </TableCell>
              <TableCell className="px-4 py-4">
                <Badge
                  variant={item.status === 'active' ? 'destructive' : 'outline'}
                >
                  {item.status === 'active' ? 'Aktif' : item.status}
                </Badge>
              </TableCell>
              <TableCell className="px-6 py-4 text-right">
                {item.status === 'active' ? (
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button variant="outline" size="sm">
                          Cabut ban
                        </Button>
                      }
                    />
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Cabut ban untuk {item.displayName}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Status ban akan diubah menjadi dicabut dan dicatat ke
                          audit log.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Batal</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onRevokeBan(item.id)}>
                          Cabut ban
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

export function WarnsTable({
  items,
  loading,
}: {
  items: WarnRow[];
  loading: boolean;
}) {
  if (loading) return <TableLoadingSkeleton />;

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="px-6 py-4">Pengguna</TableHead>
          <TableHead className="px-4 py-4">Grup</TableHead>
          <TableHead className="px-4 py-4">Alasan</TableHead>
          <TableHead className="px-4 py-4">Status</TableHead>
          <TableHead className="px-6 py-4 text-right">Tanggal</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <EmptyState message="Belum ada catatan peringatan di Supabase." />
        ) : (
          items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="px-6 py-4">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    {item.displayName}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {item.externalRef} · {item.username}
                  </p>
                </div>
              </TableCell>
              <TableCell className="px-4 py-4 text-sm text-muted-foreground">
                {item.groupTitle}
              </TableCell>
              <TableCell className="max-w-xs px-4 py-4 text-sm text-muted-foreground">
                <p className="line-clamp-2">{item.reason}</p>
              </TableCell>
              <TableCell className="px-4 py-4">
                <Badge variant="secondary">{item.status}</Badge>
              </TableCell>
              <TableCell className="px-6 py-4 text-right text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleDateString('id-ID')}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

export function GroupsTable({
  items,
  loading,
}: {
  items: GroupRow[];
  loading: boolean;
}) {
  if (loading) return <TableLoadingSkeleton />;

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="px-6 py-4">Nama grup</TableHead>
          <TableHead className="px-4 py-4">Chat ID</TableHead>
          <TableHead className="px-4 py-4">Tipe</TableHead>
          <TableHead className="px-4 py-4">Status</TableHead>
          <TableHead className="px-6 py-4 text-right">Terhubung</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <EmptyState message="Belum ada grup terhubung di Supabase." />
        ) : (
          items.map((item) => (
            <TableRow key={item.chatId}>
              <TableCell className="px-6 py-4 font-medium text-foreground">
                {item.title}
              </TableCell>
              <TableCell className="px-4 py-4 font-mono text-xs text-muted-foreground">
                {item.chatId}
              </TableCell>
              <TableCell className="px-4 py-4 text-sm text-muted-foreground">
                {item.chatType}
              </TableCell>
              <TableCell className="px-4 py-4">
                <Badge variant={item.isActive ? 'secondary' : 'outline'}>
                  {item.isActive ? 'Aktif' : 'Nonaktif'}
                </Badge>
              </TableCell>
              <TableCell className="px-6 py-4 text-right text-xs text-muted-foreground">
                {new Date(item.addedAt).toLocaleDateString('id-ID')}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

export function RulesTable({
  items,
  loading,
}: {
  items: RuleRow[];
  loading: boolean;
}) {
  if (loading) return <TableLoadingSkeleton />;

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="px-6 py-4">Aturan</TableHead>
          <TableHead className="px-4 py-4">Kategori</TableHead>
          <TableHead className="px-4 py-4">Isi ringkas</TableHead>
          <TableHead className="px-4 py-4">Versi</TableHead>
          <TableHead className="px-6 py-4 text-right">Sifat</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <EmptyState message="Belum ada aturan terpublikasi atau draft di Supabase." />
        ) : (
          items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="px-6 py-4">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{item.title}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {item.ruleKey}
                  </p>
                </div>
              </TableCell>
              <TableCell className="px-4 py-4 text-sm text-muted-foreground">
                {item.categoryTitle}
              </TableCell>
              <TableCell className="max-w-sm px-4 py-4 text-sm text-muted-foreground">
                <p className="line-clamp-2">{item.body}</p>
              </TableCell>
              <TableCell className="px-4 py-4">
                <Badge variant="outline">
                  v{item.versionNumber} · {item.versionStatus}
                </Badge>
              </TableCell>
              <TableCell className="px-6 py-4 text-right">
                <Badge variant={item.isMandatory ? 'default' : 'secondary'}>
                  {item.isMandatory ? 'Wajib' : 'Opsional'}
                </Badge>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

export function StaffTable({
  items,
  loading,
}: {
  items: StaffRow[];
  loading: boolean;
}) {
  if (loading) return <TableLoadingSkeleton />;

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="px-6 py-4">Nama staf</TableHead>
          <TableHead className="px-4 py-4">User ID</TableHead>
          <TableHead className="px-4 py-4">Peran</TableHead>
          <TableHead className="px-6 py-4 text-right">Ditugaskan</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <EmptyState message="Belum ada penetapan peran staf aktif di Supabase." />
        ) : (
          items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="px-6 py-4">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    {item.displayName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.username}
                  </p>
                </div>
              </TableCell>
              <TableCell className="px-4 py-4 font-mono text-xs text-muted-foreground">
                {item.userId}
              </TableCell>
              <TableCell className="px-4 py-4">
                <Badge
                  variant={item.roleKey === 'owner' ? 'default' : 'secondary'}
                >
                  {item.roleDisplayName}
                </Badge>
              </TableCell>
              <TableCell className="px-6 py-4 text-right text-xs text-muted-foreground">
                {new Date(item.assignedAt).toLocaleDateString('id-ID')}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
