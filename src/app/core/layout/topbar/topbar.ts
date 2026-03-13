import { Component, inject, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ThemeService } from '../../theme/theme.service';
import { NotificationPanel } from '../../../shared/components/notification-panel/notification-panel';
import { InstanceService } from '../../../core/services/instance.service';
import { WorkflowDefinitionService } from '../../../core/services/workflow-definition.service';
import { SidebarStateService } from '../../api/sidebar-state.service';

@Component({
  selector: 'app-topbar',
  imports: [CommonModule, NotificationPanel],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
})
export class Topbar {
  themeService    = inject(ThemeService);
  instanceService = inject(InstanceService);
  sidebarState    = inject(SidebarStateService);

  private router          = inject(Router);
  private workflowService = inject(WorkflowDefinitionService);

  dropdownOpen    = false;
  logoutModalOpen = false;

  toggleDropdown(): void  { this.dropdownOpen = !this.dropdownOpen; }
  openLogoutModal(): void { this.dropdownOpen = false; this.logoutModalOpen = true; }
  closeLogoutModal(): void { this.logoutModalOpen = false; }

  confirmLogout(): void {
    this.logoutModalOpen = false;
    this.instanceService.clearSession();
    this.workflowService.clearAll();
    this.router.navigate(['/select-instance']);
  }

  // Close dropdown when clicking outside
  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-inst-wrapper]') && !target.closest('.instance-pill')) {
      this.dropdownOpen = false;
    }
  }
}



