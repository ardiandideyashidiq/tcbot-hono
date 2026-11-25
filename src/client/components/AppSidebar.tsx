import {
  AlertTriangle,
  BookOpen,
  ChevronsUpDown,
  Gavel,
  KeyRound,
  LogOut,
  MessageSquareWarning,
  ShieldCheck,
  User,
  UserCog,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import type { LedgerSection } from '../types';

interface AppSidebarProps {
  activeSection: LedgerSection;
  onSelectSection: (section: LedgerSection) => void;
  pendingCount: number;
  adminUsername: string;
  adminRole: 'superadmin' | 'admin';
  onOpenChangePassword: () => void;
  onLogout: () => void;
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
  adminUsername,
  adminRole,
  onOpenChangePassword,
  onLogout,
}: AppSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const isSuperadmin = adminRole === 'superadmin';

  const items = isSuperadmin
    ? [
        ...NAV_ITEMS,
        { id: 'admins' as const, label: 'Kelola Admin', icon: UserCog },
      ]
    : NAV_ITEMS;

  const handleSelect = (section: LedgerSection) => {
    onSelectSection(section);
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-sidebar">
      <SidebarContent className="p-0">
        <SidebarGroup className="p-2">
          <SidebarGroupLabel className="px-3 font-mono text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
            Ruang kerja
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1 group-data-[collapsible=icon]:items-center">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      onClick={() => handleSelect(item.id)}
                      className="h-10 rounded-sm px-3 text-sm font-medium group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="group-data-[collapsible=icon]:hidden">
                        {item.label}
                      </span>
                    </SidebarMenuButton>
                    {item.id === 'appeals' && pendingCount > 0 && (
                      <SidebarMenuBadge className="rounded-sm font-mono text-[11px] tabular-nums">
                        {pendingCount}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-border p-2">
        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton className="h-10 justify-between rounded-sm px-3 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!" />
                }
              >
                <div className="flex min-w-0 items-center gap-2.5 group-data-[collapsible=icon]:gap-0">
                  <User className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium text-foreground group-data-[collapsible=icon]:hidden">
                    {adminUsername}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 group-data-[collapsible=icon]:hidden">
                  <Badge
                    variant={isSuperadmin ? 'default' : 'secondary'}
                    className="rounded-sm font-mono text-[11px]"
                  >
                    {adminRole}
                  </Badge>
                  <ChevronsUpDown className="size-3.5 text-muted-foreground" />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="min-w-48 w-(--anchor-width) rounded-sm p-1.5"
              >
                <DropdownMenuItem
                  className="gap-2 rounded-sm px-2.5 py-2"
                  onClick={() => {
                    if (isMobile) {
                      setOpenMobile(false);
                    }
                    onOpenChangePassword();
                  }}
                >
                  <KeyRound className="size-4" />
                  <span>Ganti kata sandi</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  className="gap-2 rounded-sm px-2.5 py-2"
                  onClick={() => {
                    if (isMobile) {
                      setOpenMobile(false);
                    }
                    onLogout();
                  }}
                >
                  <LogOut className="size-4" />
                  <span>Keluar</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
