import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { WorkflowDefinitionService } from '../../core/services/workflow-definition.service';

export interface QuickAction {
  label: string;
  desc: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {

  workflowService = inject(WorkflowDefinitionService);

  totalWorkflows = computed(() =>
    this.workflowService.latestVersions().length
  );

  activeWorkflows = computed(() =>
    this.workflowService.definitions().filter(d => d.status === 'active').length
  );

  totalVersions = computed(() =>
    this.workflowService.definitions().length
  );

  quickActions: QuickAction[] = [
    {
      label: 'Workflow Designer',
      desc: 'Create and edit BPMN workflows',
      route: '/designer',
      icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="11" y="1" width="6" height="6" rx="1.5"/><rect x="6" y="11" width="6" height="6" rx="1.5"/><path d="M4 7v2.5a2.5 2.5 0 002.5 2.5h1M14 7v1a2.5 2.5 0 01-2.5 2.5H11"/></svg>`,
    },
    {
      label: 'Scanner Mapping',
      desc: 'Map scanners to workflow definitions',
      route: '/scanner-config',
      icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M1 6V3a2 2 0 012-2h3M12 1h3a2 2 0 012 2v3M17 12v3a2 2 0 01-2 2h-3M6 17H3a2 2 0 01-2-2v-3"/><path d="M6 9h6"/></svg>`,
    },
    {
      label: 'Monitoring',
      desc: 'Track live workflow instances',
      route: '/monitoring',
      icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M1 11l4-5 4 3 4-6 4 4"/><rect x="1" y="1" width="16" height="16" rx="2"/></svg>`,
    },
    {
      label: 'Instances',
      desc: 'Browse all workflow instances',
      route: '/instances',
      icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="9" cy="9" r="3"/><path d="M9 1v2M9 15v2M1 9h2M15 9h2"/></svg>`,
    },
  ];

}


