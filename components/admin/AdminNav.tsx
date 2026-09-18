'use client';
/**
 * The panel's section nav, on the pre-stocked shadcn sidebar.
 *
 * `Sidebar` brings a Sheet-based mobile mode with it, which replaces both the
 * source system's hand-rolled collapse and its separate mobile pill strip.
 *
 * This is the component that made Phase 0 a prerequisite: `ui/sidebar.tsx`
 * references `--color-sidebar` and five siblings, and in Tailwind v4 a utility
 * with no matching `--color-*` emits nothing at all, silently. Without those
 * tokens defined, this renders as unstyled boxes with no CSS error to point at.
 */
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { ADMIN_SECTIONS } from './admin-sections';

export function AdminNav({ active }: { active: string | null }) {
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Analytics</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ADMIN_SECTIONS.map((section) => (
                <SidebarMenuItem key={section.id}>
                  <SidebarMenuButton
                    isActive={active === section.id}
                    render={
                      <a href={`#${section.id}`}>
                        <span>{section.label}</span>
                      </a>
                    }
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
