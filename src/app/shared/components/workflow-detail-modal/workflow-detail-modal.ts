import { Component, Input, Output, EventEmitter, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkflowDefinition } from '../../../core/services/workflow-definition.service';
import { ScannerApiService, ScannerDto, ScannerConfigDto } from '../../../core/api/scanner-api.service';
import { signal } from '@angular/core';

@Component({
  selector: 'app-workflow-detail-modal',
  imports: [CommonModule],
  templateUrl: './workflow-detail-modal.html',
  styleUrl: './workflow-detail-modal.scss',
})
export class WorkflowDetailModal implements OnChanges {

  @Input() visible = false;
  @Input() definition: WorkflowDefinition | null = null;
  @Output() close = new EventEmitter<void>();

  private scannerApi = inject(ScannerApiService);

  mappedScanners = signal<{ scanner: ScannerDto; config: ScannerConfigDto }[]>([]);
  loadingScanners = signal(false);
  xmlCopied = signal(false);

  ngOnChanges(): void {
    if (this.visible && this.definition) {
      this.loadMappedScanners();
    } else {
      this.mappedScanners.set([]);
    }
  }

  private loadMappedScanners(): void {
    if (!this.definition) return;
    this.loadingScanners.set(true);

    this.scannerApi.listScanners().subscribe({
      next: (scanners) => {
        const checks = scanners.map(scanner =>
          this.scannerApi.getActiveConfig(scanner.scanner_id).subscribe({
            next: (config) => {
              if (
                config &&
                config.workflow_key === this.definition!.workflow_key &&
                config.version === this.definition!.version
              ) {
                this.mappedScanners.update(list => [...list, { scanner, config }]);
              }
            },
            error: () => { /* scanner has no config, skip */ },
          })
        );
        // Mark loading done after all requests initiated
        // (responses stream in asynchronously)
        this.loadingScanners.set(false);
      },
      error: () => this.loadingScanners.set(false),
    });
  }

  async copyXml(): Promise<void> {
    if (!this.definition?.bpmn_xml) return;
    try {
      await navigator.clipboard.writeText(this.definition.bpmn_xml);
      this.xmlCopied.set(true);
      setTimeout(() => this.xmlCopied.set(false), 2000);
    } catch { /* ignore */ }
  }

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
      month: 'long', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(date));
  }
}



