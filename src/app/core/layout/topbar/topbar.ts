import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ThemeService } from '../../theme/theme.service';
import { NotificationPanel } from '../../../shared/components/notification-panel/notification-panel';
import { InstanceService } from '../../../core/services/instance.service';
import { WorkflowDefinitionService } from '../../../core/services/workflow-definition.service';

@Component({
  selector: 'app-topbar',
  imports: [CommonModule, NotificationPanel],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
})
export class Topbar {
  themeService    = inject(ThemeService);
  instanceService = inject(InstanceService);

  private router          = inject(Router);
  private workflowService = inject(WorkflowDefinitionService);

  /**
   * Change instance:
   * 1. Clear the session (sessionStorage wiped)
   * 2. Reset all in-memory workflow state
   * 3. Navigate to the instance selector — all routed components are destroyed
   */
  changeInstance(): void {
    this.instanceService.clearSession();
    this.workflowService.clearAll();
    this.router.navigate(['/select-instance']);
  }
}

