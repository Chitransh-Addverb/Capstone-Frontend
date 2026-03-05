import { Routes } from '@angular/router';
import { instanceGuard } from './core/guards/instance.guard';

export const routes: Routes = [

  // ── Instance selector — no guard ────────────────────────────────────
  {
    path: 'select-instance',
    loadComponent: () =>
      import('./features/instance-selector/instance-selector')
        .then(m => m.InstanceSelector),
  },

  // ── Main app layout — protected by instanceGuard ─────────────────────
  {
    path: '',
    canActivate: [instanceGuard],
    loadComponent: () =>
      import('./core/layout/main-layout/main-layout')
        .then(m => m.MainLayout),
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard')
            .then(m => m.Dashboard),
      },
      {
        path: 'designer',
        loadComponent: () =>
          import('./features/workflow-designer/workflow-designer')
            .then(m => m.WorkflowDesignerComponent),
      },
      {
        path: 'definitions',
        loadComponent: () =>
          import('./features/workflow-definitions/workflow-definitions')
            .then(m => m.WorkflowDefinitionsComponent),
      },
      {
        path: 'scanner-config',
        loadComponent: () =>
          import('./features/scanner-config/scanner-config')
            .then(m => m.ScannerConfig),
      },
      {
        path: 'monitoring',
        loadComponent: () =>
          import('./features/monitoring/monitoring')
            .then(m => m.Monitoring),
      },
      {
        path: 'instances',
        loadComponent: () =>
          import('./features/instances/instances')
            .then(m => m.Instances),
      },
    ],
  },

  // ── Fallback ──────────────────────────────────────────────────────────
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];



