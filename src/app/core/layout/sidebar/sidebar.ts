import { Component, signal, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../theme/theme.service';

export interface NavSection {
  title: string;
  items: NavItem[];
}

export interface NavItem {
  label: string;
  icon: string;
  route: string;
  badge?: string;
  badgeType?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
}

@Component({
  selector: 'app-sidebar',
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  private themeService = inject(ThemeService);
  collapsed = signal(false);

  toggleCollapse(): void {
    this.collapsed.update(v => !v);
  }

  navSections = computed<NavSection[]>(() => [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
      ],
    },
    {
      title: 'Workflow',
      items: [
        { label: 'Designer',    route: '/designer',    icon: 'designer' },
        { label: 'Definitions', route: '/definitions', icon: 'definitions' },
      ],
    },
    {
      title: 'Configuration',
      items: [
        { label: 'Scanner Mapping', route: '/scanner-config', icon: 'scanner' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { label: 'Monitoring', route: '/monitoring', icon: 'monitoring', badge: 'Live', badgeType: 'success' },
        { label: 'Instances',  route: '/instances',  icon: 'instances' },
      ],
    },
  ]);

  readonly icons: Record<string, string> = {
    dashboard: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>`,
    designer: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="1" width="5" height="5" rx="1.5"/><rect x="10" y="1" width="5" height="5" rx="1.5"/><rect x="5.5" y="10" width="5" height="5" rx="1.5"/><path d="M3.5 6v2.5a2 2 0 002 2h1M10.5 6v1a2 2 0 01-2 2H8"/></svg>`,
    definitions: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V3a1 1 0 00-1-1z"/><path d="M5 5h6M5 8h6M5 11h4"/></svg>`,
    scanner: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 5V3a2 2 0 012-2h2M11 1h2a2 2 0 012 2v2M15 11v2a2 2 0 01-2 2h-2M5 15H3a2 2 0 01-2-2v-2"/><path d="M5 8h6"/></svg>`,
    monitoring: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 10l3-4 3 2 3-5 3 3"/><rect x="1" y="1" width="14" height="14" rx="2"/></svg>`,
    instances: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/></svg>`,
  };
}

