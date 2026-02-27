import { Routes } from '@angular/router';
import { MainLayout } from './core/layout/main-layout/main-layout';

export const routes: Routes = [
  {
    path: '',
    component: MainLayout,
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard').then(m => m.Dashboard),
      },
      {
        path: 'designer',
        loadComponent: () =>
          import('./features/workflow-designer/workflow-designer').then(
            m => m.WorkflowDesignerComponent
          ),
      },
      {
        path: 'definitions',
        loadComponent: () =>
          import('./features/workflow-definitions/workflow-definitions').then(
            m => m.WorkflowDefinitionsComponent
          ),
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
          import('./features/monitoring/monitoring').then(m => m.Monitoring),
      },
      {
        path: 'instances',
        loadComponent: () =>
          import('./features/instances/instances').then(m => m.Instances),
      },
      {
        path: '**',
        redirectTo: 'dashboard',
      },
    ],
  },
];



