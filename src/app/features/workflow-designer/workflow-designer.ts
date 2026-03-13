import {
  Component, OnDestroy, ViewChild, ElementRef,
  signal, AfterViewInit, inject, OnInit, computed, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';

import { DeployModal, DeployFormData } from '../../shared/components/deploy-modal/deploy-modal';
import { WorkflowApiService } from '../../core/api/workflow-api.service';
import { WorkflowDefinitionService } from '../../core/services/workflow-definition.service';
import { ToastService } from '../../core/services/toast.service';

import { RestrictedPaletteProvider } from './providers/restricted-palette.provider';
import { RestrictedContextPadProvider } from './providers/restricted-context-pad.provider';
import { GatewayFlowLimitProvider } from './providers/gateway-flow-limit.provider';

import {
  PropertiesPanel,
  ConditionSaveEvent,
  TaskNameSaveEvent,
  NameSaveEvent
} from './properties-panel/properties-panel';

import { ValidationModal } from './validation-modal/validation-modal';
import { BpmnCanvasValidator, ValidationError } from './validators/bpmn-canvas.validator';
import { BpmnDiffUtil } from './utils/bpmn-diff.util';

@Component({
  selector: 'app-workflow-designer',
  standalone: true,
  imports: [CommonModule, DeployModal, PropertiesPanel, ValidationModal],
  templateUrl: './workflow-designer.html',
  styleUrl: './workflow-designer.scss',
})
export class WorkflowDesignerComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('bpmnCanvas') canvasRef!: ElementRef<HTMLDivElement>;
  @ViewChild(DeployModal) deployModalRef!: DeployModal;

  loading = signal(true);
  elementCount = signal(0);
  showDeployModal = signal(false);
  currentXml = signal('');

  isEditMode = signal(false);
  editKey = signal('');
  editVersion = signal(0);
  editDescription = signal('');
  nextVersion = signal(1);

  private originalXml = '';

  selectedElement = signal<any>(null);

  showValidationModal = signal(false);
  validationErrors = signal<ValidationError[]>([]);
  validationWarnings = signal<ValidationError[]>([]);

  /** True once the user has made any change to the diagram */
  hasUnsavedChanges = signal(false);

  /** Controls the reset-confirmation modal */
  showResetConfirm = signal(false);

  /** Controls the navigate-away confirmation modal */
  showLeaveConfirm = signal(false);

  /** Pending navigation URL captured when the user tries to leave */
  private pendingNavUrl: string | null = null;

  /** Set to true just before a successful deploy so we don't block navigation */
  private deployedSuccessfully = false;

  existingWorkflowKeys = computed(() =>
    new Set(this.workflowStore.latestVersions().map(d => d.workflow_key.toLowerCase()))
  );

  private modeler: any = null;
  private validator = new BpmnCanvasValidator();

  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private workflowApi = inject(WorkflowApiService);
  private workflowStore = inject(WorkflowDefinitionService);
  private toast = inject(ToastService);

  // ── Browser tab / window close guard ─────────────────────
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(e: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges() && !this.deployedSuccessfully) {
      e.preventDefault();
      // Modern browsers show their own generic message; setting returnValue
      // is required for the dialog to appear in some browsers.
      e.returnValue = '';
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────

  ngOnInit(): void {
    this.workflowStore.definitions();

    const key     = this.route.snapshot.queryParamMap.get('key');
    const version = this.route.snapshot.queryParamMap.get('version');

    if (key) {
      this.isEditMode.set(true);
      this.editKey.set(key);
      if (version) this.editVersion.set(Number(version));
    }
  }

  async ngAfterViewInit(): Promise<void> {
    await this.initModeler();
  }

  private async initModeler(): Promise<void> {
    try {
      const BpmnModeler = (await import('bpmn-js/lib/Modeler')).default;

      this.modeler = new BpmnModeler({
        container: this.canvasRef.nativeElement,
        additionalModules: [
          {
            __init__: ['restrictedPaletteProvider'],
            restrictedPaletteProvider: ['type', RestrictedPaletteProvider],
          },
          {
            __init__: ['restrictedContextPadProvider'],
            restrictedContextPadProvider: ['type', RestrictedContextPadProvider],
          },
          {
            __init__: ['gatewayFlowLimitProvider'],
            gatewayFlowLimitProvider: ['type', GatewayFlowLimitProvider],
          },
        ],
      });

      const eventBus        = this.modeler.get('eventBus');
      const elementRegistry = this.modeler.get('elementRegistry');
      const modeling        = this.modeler.get('modeling');

      // Auto-name start events "Scanner"
      eventBus.on('import.done', () => {
        elementRegistry
          .filter((el: any) => el.type === 'bpmn:StartEvent')
          .forEach((el: any) => {
            if (el.businessObject?.name?.trim() !== 'Scanner') {
              modeling.updateProperties(el, { name: 'Scanner' });
            }
          });
      });

      eventBus.on('commandStack.shape.create.postExecute', (event: any) => {
        if (event.context.shape.type === 'bpmn:StartEvent') {
          modeling.updateProperties(event.context.shape, { name: 'Scanner' });
        }
      });

      // ── Track unsaved changes ──────────────────────────────
      // commandStack.changed fires after every user edit
      eventBus.on('commandStack.changed', () => {
        this.hasUnsavedChanges.set(true);
      });

      if (this.isEditMode()) {
        try {
          const dto = await this.workflowApi
            .getByKeyAndVersion(this.editKey(), this.editVersion())
            .toPromise();

          if (dto?.bpmn_xml) {
            await this.modeler.importXML(dto.bpmn_xml);
            this.originalXml = dto.bpmn_xml;
            this.editDescription.set(dto.description ?? '');
            this.nextVersion.set((dto.version ?? this.editVersion()) + 1);
          } else {
            await this.modeler.createDiagram();
            this.originalXml = '';
          }
        } catch {
          this.toast.error('Load failed', 'Could not fetch workflow. Starting blank.');
          await this.modeler.createDiagram();
        }
      } else {
        await this.modeler.createDiagram();
      }

      // After initial load, reset the dirty flag — changes start from here
      this.hasUnsavedChanges.set(false);

      this.modeler.get('canvas').zoom('fit-viewport');
      this.loading.set(false);

      const elementRegistry2 = this.modeler.get('elementRegistry');
      this.elementCount.set(Math.max(0, elementRegistry2.size - 1));

      this.modeler.get('eventBus').on('elements.changed', () => {
        this.elementCount.set(Math.max(0, elementRegistry2.size - 1));
      });

      this.modeler.get('eventBus').on('selection.changed', (event: any) => {
        const selected = event.newSelection;
        if (selected && selected.length === 1) {
          const el = selected[0];
          if (el.type === 'bpmn:StartEvent') { this.selectedElement.set(null); return; }
          const editableTypes = [
            'bpmn:EndEvent', 'bpmn:ServiceTask',
            'bpmn:ExclusiveGateway', 'bpmn:SequenceFlow',
          ];
          this.selectedElement.set(editableTypes.includes(el.type) ? el : null);
        } else {
          this.selectedElement.set(null);
        }
      });

    } catch (err) {
      console.error('BPMN Modeler init error:', err);
      this.loading.set(false);
    }
  }

  // ── Properties panel handlers ─────────────────────────────

  onConditionSaved(event: ConditionSaveEvent): void {
    if (!this.modeler) return;
    const elementRegistry = this.modeler.get('elementRegistry');
    const modeling        = this.modeler.get('modeling');
    const moddle          = this.modeler.get('moddle');
    const element         = elementRegistry.get(event.elementId);
    if (!element) return;
    modeling.updateProperties(element, {
      conditionExpression: moddle.create('bpmn:FormalExpression', { body: event.condition }),
      name: event.label || undefined,
    });
    this.toast.success('Condition saved', 'Flow condition updated.');
  }

  onTaskNameSaved(event: TaskNameSaveEvent): void {
    if (!this.modeler) return;
    const element = this.modeler.get('elementRegistry').get(event.elementId);
    if (!element) return;
    this.modeler.get('modeling').updateProperties(element, { name: event.handlerName });
    this.toast.success('Service Task saved', `Handler: ${event.handlerName}`);
  }

  onNameSaved(event: NameSaveEvent): void {
    if (!this.modeler) return;
    const element = this.modeler.get('elementRegistry').get(event.elementId);
    if (!element) return;
    this.modeler.get('modeling').updateProperties(element, { name: event.name });
    this.toast.success('Saved', 'Label updated.');
  }

  onPanelDeselected(): void {
    if (!this.modeler) return;
    this.modeler.get('selection').select([]);
    this.selectedElement.set(null);
  }

  // ── Reset diagram ─────────────────────────────────────────

  /**
   * Called from the Reset button in the header.
   * If there are unsaved changes, show a confirmation modal first.
   * If the canvas is pristine, reset immediately (no point asking).
   */
  openResetConfirm(): void {
    if (this.hasUnsavedChanges()) {
      this.showResetConfirm.set(true);
    } else {
      // Nothing to lose — reset silently
      this.executeReset();
    }
  }

  cancelReset(): void {
    this.showResetConfirm.set(false);
  }

  async confirmReset(): Promise<void> {
    this.showResetConfirm.set(false);
    await this.executeReset();
  }

  private async executeReset(): Promise<void> {
    if (!this.modeler) return;
    this.selectedElement.set(null);

    if (this.isEditMode()) {
      try {
        const dto = await this.workflowApi
          .getByKeyAndVersion(this.editKey(), this.editVersion())
          .toPromise();
        if (dto?.bpmn_xml) {
          await this.modeler.importXML(dto.bpmn_xml);
          this.originalXml = dto.bpmn_xml;
        }
      } catch {
        this.toast.error('Reset failed', 'Could not reload workflow.');
      }
    } else {
      await this.modeler.createDiagram();
    }

    this.modeler.get('canvas').zoom('fit-viewport');
    // After reset, diagram matches saved state → no unsaved changes
    this.hasUnsavedChanges.set(false);
  }

  // ── Navigate-away guard ───────────────────────────────────

  /**
   * Called from every nav link / router-link that could take the user
   * away from the designer (sidebar links, breadcrumbs, etc.).
   *
   * Usage in template:
   *   (click)="navigateSafely('/definitions', $event)"
   *
   * For Angular Router programmatic navigation call navigateSafely() directly.
   */
  navigateSafely(url: string, event?: Event): void {
    event?.preventDefault();
    if (this.hasUnsavedChanges() && !this.deployedSuccessfully) {
      this.pendingNavUrl = url;
      this.showLeaveConfirm.set(true);
    } else {
      this.router.navigateByUrl(url);
    }
  }

  cancelLeave(): void {
    this.showLeaveConfirm.set(false);
    this.pendingNavUrl = null;
  }

  confirmLeave(): void {
    this.showLeaveConfirm.set(false);
    const url = this.pendingNavUrl ?? '/definitions';
    this.pendingNavUrl = null;
    // Bypass guard for this navigation
    this.hasUnsavedChanges.set(false);
    this.router.navigateByUrl(url);
  }

  // ── Deploy flow ───────────────────────────────────────────

  async openDeployModal(): Promise<void> {
    if (!this.modeler) return;

    const result = this.validator.validate(this.modeler);
    if (!result.valid) {
      this.validationErrors.set(result.errors);
      this.validationWarnings.set(result.warnings);
      this.showValidationModal.set(true);
      return;
    }

    try {
      const { xml } = await this.modeler.saveXML({ format: true });
      if (this.isEditMode() && this.originalXml) {
        if (BpmnDiffUtil.isIdentical(this.originalXml, xml)) {
          this.toast.warning('No changes detected', 'Make changes before deploying.');
          return;
        }
      }
      this.currentXml.set(xml);
      this.showDeployModal.set(true);
    } catch {
      this.toast.error('Failed', 'Could not read BPMN XML.');
    }
  }

  onDeploy(data: DeployFormData): void {
    this.workflowApi.deploy({
      workflow_key: data.workflow_key,
      bpmn_xml:     this.currentXml(),
      description:  data.description ?? '',
    }).subscribe({
      next: (res) => {
        this.workflowStore.addDeployed(res.data);
        this.toast.success(
          this.isEditMode() ? 'Workflow updated!' : 'Workflow deployed!',
          `Key: ${res.data.workflow_key} · v${res.data.version}`,
        );
        this.showDeployModal.set(false);
        // Mark as deployed so navigation guard doesn't fire
        this.deployedSuccessfully = true;
        this.hasUnsavedChanges.set(false);
        this.router.navigate(['/definitions']);
      },
      error: (err) => {
        this.toast.error('Deploy failed', err.message || 'Backend error.');
        this.deployModalRef?.resetDeploying();
      },
    });
  }

  onDeployCancel(): void { this.showDeployModal.set(false); }

  onValidationModalClose(): void { this.showValidationModal.set(false); }

  // ── Canvas controls ───────────────────────────────────────

  /** Kept for backward-compat if called elsewhere; now delegates to openResetConfirm */
  resetDiagram(): void { this.openResetConfirm(); }

  zoomFit(): void { this.modeler?.get('canvas').zoom('fit-viewport'); }

  async exportXml(): Promise<void> {
    if (!this.modeler) return;
    try {
      const { xml } = await this.modeler.saveXML({ format: true });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
      a.download = `workflow-${this.editKey() || 'new'}-${Date.now()}.bpmn`;
      a.click();
    } catch {
      this.toast.error('Export failed', 'Could not export BPMN XML.');
    }
  }

  ngOnDestroy(): void { this.modeler?.destroy(); }
}





