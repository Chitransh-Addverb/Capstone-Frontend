import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  WorkflowDefinitionService,
  WorkflowDefinition
} from '../../core/services/workflow-definition.service';

@Component({
  selector: 'app-workflow-definitions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './workflow-definitions.html',
  styleUrl: './workflow-definitions.scss',
})
export class WorkflowDefinitionsComponent {

  private service = inject(WorkflowDefinitionService);
  private router = inject(Router);

  // Latest version per unique workflowKey
  definitions = computed(() => this.service.latestVersions());

  // All versions across all keys
  allDefinitions = computed(() => this.service.definitions());

  // Active count across all versions
  activeCount = computed(() =>
    this.service.definitions().filter(d => d.status === 'active').length
  );

  selectedKey = signal<string | null>(null);
  confirmDeleteId = signal<string | null>(null);

  getVersionsForKey(key: string): WorkflowDefinition[] {
    return this.service.getByKey(key);
  }

  toggleVersions(key: string): void {
    this.selectedKey.update(v => v === key ? null : key);
  }

  goToDesigner(): void {
    this.router.navigate(['/designer']);
  }

  editWorkflow(key: string): void {
    this.router.navigate(['/designer'], { queryParams: { key } });
  }

  activate(id: string): void {
    this.service.activate(id);
  }

  deactivate(id: string): void {
    this.service.deactivate(id);
  }

  confirmDelete(id: string): void {
    this.confirmDeleteId.set(id);
  }

  cancelDelete(): void {
    this.confirmDeleteId.set(null);
  }

  deleteDefinition(): void {
    const id = this.confirmDeleteId();
    if (id) {
      this.service.delete(id);
      this.confirmDeleteId.set(null);
    }
  }

  getStatusLabel(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  getDisplayName(def: WorkflowDefinition): string {
    // Use description first word as display, fallback to workflowKey
    if (def.description?.trim()) {
      return def.description.length > 40
        ? def.description.substring(0, 40) + '...'
        : def.description;
    }
    return def.workflowKey;
  }

  getAvatarLetter(def: WorkflowDefinition): string {
    return def.workflowKey.charAt(0).toUpperCase();
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(date));
  }
}




