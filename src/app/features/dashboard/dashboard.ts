import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { WorkflowDefinitionService } from '../../core/services/workflow-definition.service';

export interface QuickAction {
  label:    string;
  desc:     string;
  route:    string;
  iconPath: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrl:    './dashboard.scss',
})
export class Dashboard {

  workflowService = inject(WorkflowDefinitionService);

  totalWorkflows = computed(() =>
    this.workflowService.latestVersions().length,
  );

  activeWorkflows = computed(() =>
    this.workflowService.definitions().filter(d => d.status === 'active').length,
  );

  totalVersions = computed(() =>
    this.workflowService.definitions().length,
  );

  quickActions: QuickAction[] = [
    {
      label:    'Workflow Designer',
      desc:     'Create and edit BPMN workflows visually',
      route:    '/designer',
      iconPath: `<rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="11" y="1" width="6" height="6" rx="1.5"/><rect x="5.5" y="11" width="7" height="6" rx="1.5"/><path d="M4 7v2a2 2 0 002 2h1M14 7v1a2 2 0 01-2 2H11"/>`,
    },
    {
      label:    'Scanner Mapping',
      desc:     'Map scanners to workflow definitions',
      route:    '/scanner-config',
      iconPath: `<path d="M1 6V3a2 2 0 012-2h3M12 1h3a2 2 0 012 2v3M17 12v3a2 2 0 01-2 2h-3M6 17H3a2 2 0 01-2-2v-3"/><path d="M6 9h6"/>`,
    },
    {
      label:    'Monitoring',
      desc:     'Track live workflow execution in real time',
      route:    '/monitoring',
      iconPath: `<rect x="1" y="1" width="16" height="16" rx="2"/><path d="M1 11l4-5 4 3 4-6 4 4"/>`,
    },
    {
      label:    'Definitions',
      desc:     'Browse, manage and deploy workflow versions',
      route:    '/definitions',
      iconPath: `<path d="M15 3H3a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1z"/><path d="M6 7h6M6 10h6M6 13h4"/>`,
    },
  ];
}



