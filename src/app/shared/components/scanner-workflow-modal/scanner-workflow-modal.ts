import {
  Component, Input, Output, EventEmitter,
  OnChanges, SimpleChanges, OnDestroy,
  ElementRef, ViewChild, signal, inject,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkflowApiService } from '../../../core/api/workflow-api.service';
import { ScannerRow } from '../../../features/scanner-config/scanner-config';
import BpmnViewer from 'bpmn-js/lib/NavigatedViewer';

@Component({
  selector: 'app-scanner-workflow-modal',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scanner-workflow-modal.html',
  styleUrl: './scanner-workflow-modal.scss',
})
export class ScannerWorkflowModal implements OnChanges, OnDestroy {

  @Input()  visible = false;
  @Input()  row: ScannerRow | null = null;
  @Output() close = new EventEmitter<void>();
 
  @ViewChild('bpmnCanvas') canvasRef!: ElementRef<HTMLDivElement>;
 
  private workflowApi = inject(WorkflowApiService);
  private cdr         = inject(ChangeDetectorRef);
 
  loading   = signal(false);
  loadError = signal<string | null>(null);
 
  private viewer:  InstanceType<typeof BpmnViewer> | null = null;
  private lastKey = '';   // track what's currently rendered
 
  /* ── React to input changes ───────────────────────────── */
  ngOnChanges(changes: SimpleChanges): void {
    if (!this.visible || !this.row?.config) return;
 
    const key     = this.row.config.workflow_key;
    const version = this.row.config.version;
    const cacheId = `${key}@${version}`;
 
    // Only reload if the modal just opened or the workflow changed
    if (changes['visible']?.currentValue === true && this.lastKey !== cacheId) {
      // Wait for canvas element to be in the DOM
      setTimeout(() => this.load(), 50);
    }
  }
 
  ngOnDestroy(): void {
    this.destroyViewer();
  }
 
  /* ── Load BPMN XML from backend ───────────────────────── */
  load(): void {
    const cfg = this.row?.config;
    if (!cfg) return;
 
    this.loading.set(true);
    this.loadError.set(null);
    this.cdr.markForCheck();
 
    this.workflowApi.getByKeyAndVersion(cfg.workflow_key, cfg.version).subscribe({
      next: dto => {
        const xml = dto.bpmn_xml;
        if (!xml) {
          this.loadError.set('No BPMN diagram found for this workflow version.');
          this.loading.set(false);
          this.cdr.markForCheck();
          return;
        }
        this.renderBpmn(xml, cfg.workflow_key, cfg.version);
      },
      error: err => {
        this.loadError.set(
          err?.error?.message ?? err?.message ?? 'Failed to load workflow diagram.',
        );
        this.loading.set(false);
        this.cdr.markForCheck();
      },
    });
  }
 
  /* ── Render with bpmn-js ──────────────────────────────── */
  private async renderBpmn(xml: string, key: string, version: number): Promise<void> {
    // Ensure canvas is in the DOM
    await this.waitForCanvas();
 
    this.destroyViewer();
 
    try {
      this.viewer = new BpmnViewer({
        container: this.canvasRef.nativeElement,
        keyboard: { bindTo: document },
      });
 
      await (this.viewer as any).importXML(xml);
 
      // Fit the diagram to the canvas
      const canvas = (this.viewer as any).get('canvas');
      canvas.zoom('fit-viewport', 'auto');
 
      this.lastKey = `${key}@${version}`;
      this.loading.set(false);
      this.cdr.markForCheck();
    } catch (err: any) {
      this.loadError.set('Failed to render BPMN diagram: ' + (err?.message ?? 'Unknown error'));
      this.loading.set(false);
      this.cdr.markForCheck();
    }
  }
 
  private waitForCanvas(): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        if (this.canvasRef?.nativeElement) { resolve(); return; }
        setTimeout(check, 20);
      };
      check();
    });
  }
 
  private destroyViewer(): void {
    if (this.viewer) {
      try { (this.viewer as any).destroy(); } catch { /* ignore */ }
      this.viewer = null;
    }
  }
 
  /* ── Zoom helpers ─────────────────────────────────────── */
  zoomIn():    void { (this.viewer as any)?.get('zoomScroll')?.zoom(1,  { x: 400, y: 210 }); }
  zoomOut():   void { (this.viewer as any)?.get('zoomScroll')?.zoom(-1, { x: 400, y: 210 }); }
  zoomReset(): void { (this.viewer as any)?.get('canvas')?.zoom('fit-viewport', 'auto'); }

}



