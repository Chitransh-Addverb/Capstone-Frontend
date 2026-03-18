import {
  Component, Input, Output, EventEmitter,
  OnChanges, OnDestroy, AfterViewChecked,
  ElementRef, ViewChild,
  signal, inject, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkflowApiService } from '../../../core/api/workflow-api.service';
import { BpmnXmlTransformer } from '../../../features/workflow-designer/utils/bpmn-xml-transformer';
import { ScannerRow } from '../../../features/scanner-config/scanner-config';

@Component({
  selector: 'app-scanner-workflow-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './scanner-workflow-modal.html',
  styleUrl:    './scanner-workflow-modal.scss',
})
export class ScannerWorkflowModal implements OnChanges, AfterViewChecked, OnDestroy {

  @Input()  visible = false;
  @Input()  row: ScannerRow | null = null;
  @Output() close = new EventEmitter<void>();

  @ViewChild('bpmnCanvas') canvasRef?: ElementRef<HTMLDivElement>;

  private workflowApi = inject(WorkflowApiService);
  private cdr         = inject(ChangeDetectorRef);

  loading   = signal(false);
  loadError = signal<string | null>(null);

  private modeler:       any    = null;
  private renderedKey:   string = '';
  private pendingRender: boolean = false;
  private pendingXml:    string = '';

  /* ── Lifecycle ──────────────────────────────────────────── */

  ngOnChanges(): void {
    if (!this.visible) {
      this.destroyModeler();
      this.pendingRender = false;
      this.pendingXml    = '';
      return;
    }

    const cfg = this.row?.config;
    if (!cfg) return;

    const id = `${cfg.workflow_key}@${cfg.version}`;
    if (id === this.renderedKey) return;

    this.fetchXml(cfg.workflow_key, cfg.version);
  }

  ngAfterViewChecked(): void {
    if (this.pendingRender && this.canvasRef?.nativeElement) {
      const xml = this.pendingXml;
      this.pendingRender = false;
      this.pendingXml    = '';
      setTimeout(() => this.renderBpmn(xml), 0);
    }
  }

  ngOnDestroy(): void {
    this.destroyModeler();
  }

  /* ── Data fetch ─────────────────────────────────────────── */

  fetchXml(key: string, version: number): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.renderedKey   = '';
    this.pendingRender = false;
    this.cdr.markForCheck();

    this.workflowApi.getByKeyAndVersion(key, version).subscribe({
      next: dto => {
        if (!dto?.bpmn_xml) {
          this.loading.set(false);
          this.loadError.set('No diagram found for this workflow.');
          this.cdr.markForCheck();
          return;
        }

        // ── Transform backend XML → canvas XML ──────────────
        // Collapses ServiceTask + ExclusiveGateway pairs back into
        // a single Task so the viewer shows a clean diagram
        // (no diamond gateway shapes, no internal connecting arrows).
        const canvasXml = BpmnXmlTransformer.toCanvasXml(dto.bpmn_xml);

        this.pendingXml    = canvasXml;
        this.pendingRender = true;
        this.cdr.markForCheck();
      },
      error: err => {
        this.loading.set(false);
        this.loadError.set(
          err?.error?.message ?? err?.message ?? 'Could not load the workflow diagram.',
        );
        this.cdr.markForCheck();
      },
    });
  }

  /* ── BPMN rendering ─────────────────────────────────────── */

  private async renderBpmn(xml: string): Promise<void> {
    if (!this.canvasRef?.nativeElement) return;

    this.destroyModeler();

    try {
      const BpmnViewer = (await import('bpmn-js/lib/NavigatedViewer')).default;

      this.modeler = new BpmnViewer({
        container: this.canvasRef.nativeElement,
      });

      await this.modeler.importXML(xml);
      this.modeler.get('canvas').zoom('fit-viewport');

      this.renderedKey = this.row?.config
        ? `${this.row.config.workflow_key}@${this.row.config.version}`
        : '';

      this.loading.set(false);
      this.cdr.markForCheck();

    } catch (err: any) {
      console.error('BPMN viewer error:', err);
      this.loadError.set('Could not display the workflow diagram.');
      this.loading.set(false);
      this.cdr.markForCheck();
    }
  }

  /* ── Cleanup ────────────────────────────────────────────── */

  private destroyModeler(): void {
    if (this.modeler) {
      try { this.modeler.destroy(); } catch { /* ignore */ }
      this.modeler     = null;
      this.renderedKey = '';
    }
  }

  /* ── Zoom controls ──────────────────────────────────────── */

  zoomReset(): void { this.modeler?.get('canvas')?.zoom('fit-viewport'); }
  zoomIn():   void  { this.modeler?.get('zoomScroll')?.zoom( 1, { x: 380, y: 200 }); }
  zoomOut():  void  { this.modeler?.get('zoomScroll')?.zoom(-1, { x: 380, y: 200 }); }

  retry(): void {
    const cfg = this.row?.config;
    if (cfg) this.fetchXml(cfg.workflow_key, cfg.version);
  }
}