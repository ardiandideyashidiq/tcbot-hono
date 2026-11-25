import {
  AlertTriangle,
  BookOpen,
  Gavel,
  MessageSquareWarning,
  ShieldCheck,
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
} from '@/components/ui/sidebar';
import type { LedgerSection } from '../types';

interface AppSidebarProps {
  activeSection: LedgerSection;
  onSelectSection: (section: LedgerSection) => void;
  pendingCount: number;
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
}: AppSidebarProps) {
  return (
    <Sidebar className="border-r border-border">
      <SidebarContent className="px-3 py-4">
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
    </Sidebar>
  );
}
