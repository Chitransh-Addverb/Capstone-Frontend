import { Component, Input, Output, EventEmitter, OnChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkflowDefinition } from '../../../core/services/workflow-definition.service';
import { ScannerApiService, ScannerDto, ScannerConfigDto } from '../../../core/api/scanner-api.service';
import { BpmnXmlTransformer } from '../../../features/workflow-designer/utils/bpmn-xml-transformer';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

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

  mappedScanners  = signal<{ scanner: ScannerDto; config: ScannerConfigDto }[]>([]);
  loadingScanners = signal(false);
  xmlCopied       = signal(false);

  /**
   * Canvas-friendly XML (gateways stripped) for display.
   * We store it separately so the copy button still copies the full backend XML.
   */
  canvasXml = signal('');

  ngOnChanges(): void {
    if (this.visible && this.definition) {
      this.mappedScanners.set([]);
      this.loadMappedScanners();

      // Transform backend XML → canvas XML for clean display
      if (this.definition.bpmn_xml) {
        this.canvasXml.set(
          BpmnXmlTransformer.toCanvasXml(this.definition.bpmn_xml)
        );
      } else {
        this.canvasXml.set('');
      }
    } else {
      this.mappedScanners.set([]);
      this.canvasXml.set('');
    }
  }

  private loadMappedScanners(): void {
    if (!this.definition) return;
    this.loadingScanners.set(true);

    // Load all scanners then check each config — use forkJoin for cleaner async
    this.scannerApi.listScanners().pipe(
      switchMap(scanners => {
        if (scanners.length === 0) return of([]);
        return forkJoin(
          scanners.map(scanner =>
            this.scannerApi.getActiveConfig(scanner.scanner_id).pipe(
              map(config => ({ scanner, config })),
              catchError(() => of({ scanner, config: null }))
            )
          )
        );
      })
    ).subscribe({
      next: (results) => {
        const mapped = results
          .filter(r =>
            r.config &&
            r.config.workflow_key === this.definition!.workflow_key &&
            r.config.version === this.definition!.version
          )
          .map(r => ({ scanner: r.scanner, config: r.config! }));

        this.mappedScanners.set(mapped);
        this.loadingScanners.set(false);
      },
      error: () => this.loadingScanners.set(false),
    });
  }

  async copyXml(): Promise<void> {
    if (!this.definition?.bpmn_xml) return;
    try {
      // Copy the original backend XML (complete, with gateways)
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
    return status === 'active' ? 'badge-success' : 'badge-neutral';
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(date));
  }

  getXmlCharCount(): number {
    return this.definition?.bpmn_xml?.length ?? 0;
  }
}