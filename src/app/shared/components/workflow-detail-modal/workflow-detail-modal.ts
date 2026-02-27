import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkflowDefinition } from '../../../core/services/workflow-definition.service';

@Component({
  selector: 'app-workflow-detail-modal',
  imports: [CommonModule],
  templateUrl: './workflow-detail-modal.html',
  styleUrl: './workflow-detail-modal.scss',
})
export class WorkflowDetailModal {

  @Input() visible = false;
  @Input() definition: WorkflowDefinition | null = null;
  @Output() close = new EventEmitter<void>();

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close.emit();
    }
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      active: 'badge-success',
      inactive: 'badge-neutral',
      draft: 'badge-warning',
    };
    return map[status] || 'badge-neutral';
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  }

}


