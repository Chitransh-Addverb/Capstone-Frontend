import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { API_ENDPOINTS } from '../../core/api/api.config';

export interface DashboardSummary {
  total_workflows: number;
  active_workflows: number;
  total_scanners: number;
  mapped_scanners: number;
  total_workflow_instances: number;
}

type StatAccent = 'active' | 'live' | 'scanner' | 'version';
type StatBadge = 'neutral' | 'live';

export interface StatTile {
  key: keyof DashboardSummary;
  label: string;
  trend: string;
  accent: StatAccent;
  iconBg: string;
  iconColor: string;
  badge: StatBadge;
  badgeLabel: string;
  badgeLive: boolean;
  svgPath: string;
  trendIcon: string;
}

export interface QuickAction {
  label: string;
  desc: string;
  route: string;
  svgBody: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);

  private summary = signal<DashboardSummary>({
    total_workflows: 0,
    active_workflows: 0,
    total_scanners: 0,
    mapped_scanners: 0,
    total_workflow_instances: 0,
  });

  readonly tileDefs: StatTile[] = [
    {
      key: 'active_workflows',
      label: 'Active Workflows',
      trend: 'Running across all instances',
      accent: 'active',
      iconBg: 'rgba(79,70,229,0.1)',
      iconColor: '#4f46e5',
      badge: 'neutral',
      badgeLabel: 'Workflows',
      badgeLive: false,
      svgPath: `<rect x="1" y="1" width="6" height="6" rx="1.5"/>
                   <rect x="11" y="1" width="6" height="6" rx="1.5"/>
                   <rect x="5.5" y="11" width="7" height="6" rx="1.5"/>
                   <path d="M4 7v2a2 2 0 002 2h1M14 7v1a2 2 0 01-2 2H11"/>`,
      trendIcon: `<path d="M1 9l3-4 3 2 4-5"/>`,
    },
    {
      key: 'total_workflow_instances',
      label: 'Instances Running',
      trend: 'Real-time execution count',
      accent: 'live',
      iconBg: 'rgba(5,150,105,0.1)',
      iconColor: '#059669',
      badge: 'live',
      badgeLabel: 'Live',
      badgeLive: true,
      svgPath: `<circle cx="9" cy="9" r="7"/>
                   <path d="M9 5.5v3.5l2.5 2"/>`,
      trendIcon: `<circle cx="6" cy="6" r="4.5"/><path d="M6 3.5v2.5l1.5 1.5"/>`,
    },
    {
      key: 'mapped_scanners',
      label: 'Scanners Mapped',
      trend: 'Configure in scanner config',
      accent: 'scanner',
      iconBg: 'rgba(217,119,6,0.1)',
      iconColor: '#d97706',
      badge: 'neutral',
      badgeLabel: 'Setup',
      badgeLive: false,
      svgPath: `<path d="M1 6V3a2 2 0 012-2h3M12 1h3a2 2 0 012 2v3M17 12v3a2 2 0 01-2 2h-3M6 17H3a2 2 0 01-2-2v-3"/>
                   <path d="M6 9h6"/>`,
      trendIcon: `<path d="M6 1v4M6 7v4M1 6h4M7 6h4"/>`,
    },
    {
      key: 'total_workflows',
      label: 'Total Workflows',
      trend: 'Across all unique definitions',
      accent: 'version',
      iconBg: 'rgba(2,132,199,0.1)',
      iconColor: '#0284c7',
      badge: 'neutral',
      badgeLabel: 'Total',
      badgeLive: false,
      svgPath: `<path d="M9 1v5M9 12v5M1 9h5M12 9h5"/>
                   <circle cx="9" cy="9" r="3"/>`,
      trendIcon: `<path d="M2 9V5l4-3 4 3v4"/><path d="M5 12V9h2v3"/>`,
    },
  ];

  tileValue(key: keyof DashboardSummary): number {
    return this.summary()[key];
  }

  tileCardClass(accent: StatAccent): string {
    const base =
      'stat-card relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 transition duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900';
    const accentClasses: Record<StatAccent, string> = {
      active: 'stat-card-active hover:border-indigo-500 dark:hover:border-indigo-400',
      live: 'stat-card-live hover:border-emerald-600 dark:hover:border-emerald-400',
      scanner: 'stat-card-scanner hover:border-amber-600 dark:hover:border-amber-400',
      version: 'stat-card-version hover:border-sky-600 dark:hover:border-sky-400',
    };
    return `${base} ${accentClasses[accent]}`;
  }

  badgeClass(badge: StatBadge): string {
    if (badge === 'live') {
      return 'inline-flex items-center gap-1 rounded-full border border-emerald-600/25 bg-emerald-600/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300';
    }

    return 'inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200';
  }

  safe(svgInner: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(svgInner);
  }

  readonly quickActions: QuickAction[] = [
    {
      label: 'Workflow Designer',
      desc: 'Create and edit BPMN workflows visually',
      route: '/designer',
      svgBody: `<rect x="1" y="1" width="6" height="6" rx="1.5"/>
                <rect x="11" y="1" width="6" height="6" rx="1.5"/>
                <rect x="5.5" y="11" width="7" height="6" rx="1.5"/>
                <path d="M4 7v2a2 2 0 002 2h1M14 7v1a2 2 0 01-2 2H11"/>`,
    },
    {
      label: 'Scanner Mapping',
      desc: 'Map scanners to workflow definitions',
      route: '/scanner-config',
      svgBody: `<path d="M1 6V3a2 2 0 012-2h3M12 1h3a2 2 0 012 2v3M17 12v3a2 2 0 01-2 2h-3M6 17H3a2 2 0 01-2-2v-3"/>
                <path d="M6 9h6"/>`,
    },
    {
      label: 'Monitoring',
      desc: 'Track live workflow execution in real time',
      route: '/monitoring',
      svgBody: `<rect x="1" y="1" width="16" height="16" rx="2"/>
                <path d="M1 11l4-5 4 3 4-6 4 4"/>`,
    },
    {
      label: 'Definitions',
      desc: 'Browse, manage and deploy workflow versions',
      route: '/definitions',
      svgBody: `<path d="M15 3H3a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1z"/>
                <path d="M6 7h6M6 10h6M6 13h4"/>`,
    },
  ];

  ngOnInit(): void {
    this.http.get<{ data: DashboardSummary }>(API_ENDPOINTS.dashboard.summary).subscribe({
      next: (res) => this.summary.set(res.data),
      error: () => {
        /* keep all-zero defaults silently */
      },
    });
  }
}
