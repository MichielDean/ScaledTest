'use client';

import { ChevronRight, type LucideIcon } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';

export function NavMain({
  items,
}: {
  items: {
    title: string;
    onClick?: () => void;
    icon?: LucideIcon;
    isActive?: boolean;
    id?: string;
    items?: {
      title: string;
      onClick?: () => void;
      id?: string;
      isActive?: boolean;
    }[];
  }[];
}) {
  return (
    <nav aria-label="Main navigation">
      <SidebarGroup>
        <SidebarGroupLabel>Platform</SidebarGroupLabel>
        <SidebarMenu>
          {items.map(item => (
            <SidebarMenuItem key={item.title}>
              {item.items ? (
                <Collapsible asChild defaultOpen={item.isActive} className="group/collapsible">
                  <>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip={item.title}>
                        {item.icon && <item.icon />}
                        <span>{item.title}</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.items?.map(subItem => (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton asChild>
                              <button
                                onClick={subItem.onClick}
                                id={subItem.id}
                                className={`w-full text-left ${subItem.isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}`}
                              >
                                <span>{subItem.title}</span>
                              </button>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </>
                </Collapsible>
              ) : (
                <SidebarMenuButton asChild tooltip={item.title}>
                  <button
                    onClick={item.onClick}
                    id={item.id}
                    className={`w-full text-left ${item.isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}`}
                  >
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </button>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    </nav>
  );
}
