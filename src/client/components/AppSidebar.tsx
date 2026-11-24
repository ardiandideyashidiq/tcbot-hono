import {
  AlertTriangle,
  BookOpen,
  Gavel,
  MessageSquareWarning,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import type { LedgerSection } from '../types';

interface AppSidebarProps {
  activeSection: LedgerSection;
  onSelectSection: (section: LedgerSection) => void;
  pendingCount: number;
  healthStatus: 'loading' | 'ok' | 'degraded';
}

const NAV_ITEMS: Array<{
  id: LedgerSection;
  label: string;
  icon: typeof MessageSquareWarning;
}> = [
  { id: 'appeals', label: 'Banding', icon: MessageSquareWarning },
  { id: 'bans', label: 'Daftar Ban', icon: Gavel },
  { id: 'warns', label: 'Peringatan', icon: AlertTriangle },
  { id: 'groups', label: 'Grup Terhubung', icon: Users },
  { id: 'rules', label: 'Aturan', icon: BookOpen },
  { id: 'staff', label: 'Staf & Peran', icon: ShieldCheck },
];

export function AppSidebar({
  activeSection,
  onSelectSection,
  pendingCount,
  healthStatus,
}: AppSidebarProps) {
  return (
    <Sidebar className="border-r border-border">
      <SidebarHeader className="px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold tracking-tight text-foreground">
              tcbot
            </p>
            <p className="text-xs text-muted-foreground">
              Konsol moderasi federasi
            </p>
          </div>
          <Badge
            variant={healthStatus === 'ok' ? 'secondary' : 'outline'}
            className="text-[11px] font-normal"
          >
            {healthStatus === 'ok'
              ? 'Edge aktif'
              : healthStatus === 'loading'
                ? 'Memeriksa'
                : 'Terbatas'}
          </Badge>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-2">
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 pb-2 text-xs font-medium text-muted-foreground">
            Ruang kerja
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => onSelectSection(item.id)}
                      className="h-10 px-3"
                    >
                      <Icon className="size-4 shrink-0" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {item.id === 'appeals' && pendingCount > 0 && (
                      <SidebarMenuBadge>{pendingCount}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border px-5 py-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Mode Worker</span>
          <span className="font-mono">Hono v4</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
