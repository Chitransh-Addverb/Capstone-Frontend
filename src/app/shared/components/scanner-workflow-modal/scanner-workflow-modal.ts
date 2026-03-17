import {
  Component, Input, Output, EventEmitter,
  OnChanges, OnDestroy, AfterViewChecked,
  ElementRef, ViewChild,
  signal, inject, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkflowApiService } from '../../../core/api/workflow-api.service';
import { ScannerRow } from '../../../features/scanner-config/scanner-config';

/**
 * Scanner Workflow Preview Modal
 *
 * Mirrors the designer's exact loading pattern:
 *   1. Fetch XML via getByKeyAndVersion() (same call the designer uses for edit mode)
 *   2. Dynamic-import bpmn-js Modeler (avoids SSR/static-import canvas issues)
 *   3. Call modeler.importXML(xml) — same as designer's edit path
 *   4. canvas.zoom('fit-viewport') — same final step
 *
 * The key insight from the designer:  it only touches bpmn-js inside
 * ngAfterViewInit, after Angular has rendered the canvas <div>.
 * Here we replicate that by waiting until `visible` flips true AND the
 * #bpmnCanvas ref is available in the DOM (AfterViewChecked guard).
 */
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

  /* ── Reactive state ─────────────────────────────────────── */
  loading   = signal(false);
  loadError = signal<string | null>(null);

  /* ── Internal ───────────────────────────────────────────── */
  private modeler:       any    = null;
  private renderedKey:   string = '';   // "workflowKey@version" of what's rendered
  private pendingRender: boolean = false; // XML fetched but canvas not ready yet
  private pendingXml:    string = '';

  /* ═══════════════════════════════════════════════════════════
     Angular lifecycle
  ═══════════════════════════════════════════════════════════ */

  /**
   * Called whenever @Input() changes.
   * When the modal becomes visible with a new workflow, fetch the XML.
   * We don't touch bpmn-js here — the canvas <div> might not exist yet.
   */
  ngOnChanges(): void {
    if (!this.visible) {
      // Modal closing — destroy viewer so next open starts clean
      this.destroyModeler();
      this.pendingRender = false;
      this.pendingXml    = '';
      return;
    }

    const cfg = this.row?.config;
    if (!cfg) return;  // unmapped scanner — template shows empty state

    const id = `${cfg.workflow_key}@${cfg.version}`;
    if (id === this.renderedKey) return;  // already showing this workflow

    // Fetch XML now — render when canvas is available (ngAfterViewChecked)
    this.fetchXml(cfg.workflow_key, cfg.version);
  }

  /**
   * Runs after every change detection cycle.
   * Once the canvas <div> is in the DOM AND we have pending XML, render it.
   * This mirrors ngAfterViewInit in the designer — we just can't use that
   * hook because the canvas is inside an @if block.
   */
  ngAfterViewChecked(): void {
    if (this.pendingRender && this.canvasRef?.nativeElement) {
      const xml = this.pendingXml;
      this.pendingRender = false;
      this.pendingXml    = '';
      // Run outside the current CD cycle to avoid ExpressionChangedAfterChecked
      setTimeout(() => this.renderBpmn(xml), 0);
    }
  }

  ngOnDestroy(): void {
    this.destroyModeler();
  }

  /* ═══════════════════════════════════════════════════════════
     Data fetch
  ═══════════════════════════════════════════════════════════ */

  /**
   * Exactly what the designer does in its edit-mode path:
   *   const dto = await this.workflowApi
   *     .getByKeyAndVersion(this.editKey(), this.editVersion()).toPromise();
   *   if (dto?.bpmn_xml) { await this.modeler.importXML(dto.bpmn_xml); }
   */
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
          this.loadError.set('No BPMN diagram stored for this workflow version.');
          this.cdr.markForCheck();
          return;
        }
        // Store XML and flag for rendering once canvas is in DOM
        this.pendingXml    = dto.bpmn_xml;
        this.pendingRender = true;
        this.cdr.markForCheck();   // triggers ngAfterViewChecked → renderBpmn
      },
      error: err => {
        this.loading.set(false);
        this.loadError.set(
          err?.error?.message ?? err?.message ?? 'Failed to load workflow diagram.',
        );
        this.cdr.markForCheck();
      },
    });
  }

  /* ═══════════════════════════════════════════════════════════
     BPMN rendering  — mirrors designer's initModeler() edit path
  ═══════════════════════════════════════════════════════════ */

  private async renderBpmn(xml: string): Promise<void> {
    if (!this.canvasRef?.nativeElement) return;

    this.destroyModeler();

    try {
      // ── Dynamic import, exactly like the designer ──────────
      // designer: const BpmnModeler = (await import('bpmn-js/lib/Modeler')).default;
      // We use NavigatedViewer (read-only + pan/zoom) since we don't need editing.
      const BpmnViewer = (await import('bpmn-js/lib/NavigatedViewer')).default;

      this.modeler = new BpmnViewer({
        container: this.canvasRef.nativeElement,
      });

      // ── importXML — exactly like the designer ──────────────
      // designer: await this.modeler.importXML(dto.bpmn_xml);
      await this.modeler.importXML(xml);

      // ── Fit viewport — exactly like the designer ───────────
      // designer: this.modeler.get('canvas').zoom('fit-viewport');

      this.modeler.get('canvas').zoom('fit-viewport');

      this.renderedKey = this.row?.config
        ? `${this.row.config.workflow_key}@${this.row.config.version}`
        : '';

      this.loading.set(false);
      this.cdr.markForCheck();

    } catch (err: any) {
      console.error('BPMN viewer init error:', err);
      this.loadError.set(
        'Failed to render BPMN diagram: ' + (err?.message ?? 'Unknown error'),
      );
      this.loading.set(false);
      this.cdr.markForCheck();
    }
  }

  /* ═══════════════════════════════════════════════════════════
     Cleanup
  ═══════════════════════════════════════════════════════════ */

  private destroyModeler(): void {
    if (this.modeler) {
      try { this.modeler.destroy(); } catch { /* ignore */ }
      this.modeler     = null;
      this.renderedKey = '';
    }
  }

  /* ═══════════════════════════════════════════════════════════
     Zoom controls  — mirrors designer's zoomFit / canvas controls
  ═══════════════════════════════════════════════════════════ */

  // designer: this.modeler.get('canvas').zoom('fit-viewport');
  zoomReset(): void { this.modeler?.get('canvas')?.zoom('fit-viewport'); }

  // bpmn-js NavigatedViewer exposes zoomScroll module
  zoomIn():  void { this.modeler?.get('zoomScroll')?.zoom( 1, { x: 380, y: 200 }); }
  zoomOut(): void { this.modeler?.get('zoomScroll')?.zoom(-1, { x: 380, y: 200 }); }

  /* ═══════════════════════════════════════════════════════════
     Public retry (used by template error state)
  ═══════════════════════════════════════════════════════════ */
  retry(): void {
    const cfg = this.row?.config;
    if (cfg) this.fetchXml(cfg.workflow_key, cfg.version);
  }
}



