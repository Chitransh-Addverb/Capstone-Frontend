import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SidebarStateService } from '../../api/sidebar-state.service';

export interface NavSection {
  title: string;
  items: NavItem[];
}

export interface NavItem {
  label: string;
  icon: string;
  route: string;
  badge?: string;
}

@Component({
  selector: 'app-sidebar',
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  private sanitizer = inject(DomSanitizer);

  sidebarState = inject(SidebarStateService);
  collapsed    = this.sidebarState.collapsed;

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
        { label: 'Designer',    route: '/designer',    icon: 'designer'    },
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
        { label: 'Monitoring', route: '/monitoring', icon: 'monitoring' },
      ],
    },
  ]);

  // Raw SVG strings — sanitized via bypassSecurityTrustHtml so Angular doesn't strip them
  private readonly rawIcons: Record<string, string> = {
    dashboard: `<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>`,
    designer:    `<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="1" width="5" height="5" rx="1.5"/><rect x="10" y="1" width="5" height="5" rx="1.5"/><rect x="5.5" y="10" width="5" height="5" rx="1.5"/><path d="M3.5 6v2.5a2 2 0 002 2h1M10.5 6v1a2 2 0 01-2 2H8"/></svg>`,
    definitions: `<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V3a1 1 0 00-1-1z"/><path d="M5 5h6M5 8h6M5 11h4"/></svg>`,
    scanner:     `<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="M1 5V3a2 2 0 012-2h2M11 1h2a2 2 0 012 2v2M15 11v2a2 2 0 01-2 2h-2M5 15H3a2 2 0 01-2-2v-2"/><path d="M5 8h6"/></svg>`,
    monitoring:  `<svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="1" width="14" height="14" rx="2"/><path d="M1 10l3-4 3 2 3-5 3 3"/></svg>`,
  };

  readonly icons: Record<string, SafeHtml> = Object.fromEntries(
    Object.entries(this.rawIcons).map(([k, v]) => [
      k, this.sanitizer.bypassSecurityTrustHtml(v)
    ])
  );
}

