import {
  AlertTriangle,
  BookOpen,
  Gavel,
  MessageSquareWarning,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
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
  isSuperadmin: boolean;
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
  isSuperadmin,
}: AppSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar();

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
    <Sidebar className="border-r border-border">
      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 pb-2 text-xs font-medium text-muted-foreground">
            Ruang kerja
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => handleSelect(item.id)}
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
    </Sidebar>
  );
}
