import {
  Component, OnDestroy, ViewChild, ElementRef,
  signal, AfterViewInit, inject, OnInit
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
import { PropertiesPanel, ConditionSaveEvent, TaskNameSaveEvent, NameSaveEvent } from './properties-panel/properties-panel';
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

  loading         = signal(true);
  elementCount    = signal(0);
  showDeployModal = signal(false);
  currentXml      = signal('');

  // Edit mode
  isEditMode      = signal(false);
  editKey         = signal('');
  editVersion     = signal(0);
  editDescription = signal('');
  nextVersion     = signal(1);

  // Original XML loaded in edit mode — used to detect actual changes
  private originalXml = '';

  // Properties panel
  selectedElement = signal<any>(null);

  // Validation modal
  showValidationModal = signal(false);
  validationErrors    = signal<ValidationError[]>([]);
  validationWarnings  = signal<ValidationError[]>([]);

  private modeler:   any = null;
  private validator      = new BpmnCanvasValidator();

  private router       = inject(Router);
  private route        = inject(ActivatedRoute);
  private workflowApi  = inject(WorkflowApiService);
  private workflowStore = inject(WorkflowDefinitionService);
  private toast        = inject(ToastService);

  // ── Lifecycle ─────────────────────────────────────────────────────
  ngOnInit(): void {
    // Read key + version directly from query params.
    // Do NOT read from the in-memory store — it may be empty if the user
    // navigated directly to the designer URL without going through the
    // definitions page first.
    const key     = this.route.snapshot.queryParamMap.get('key');
    const version = this.route.snapshot.queryParamMap.get('version');
    if (key) {
      this.isEditMode.set(true);
      this.editKey.set(key);
      if (version) {
        this.editVersion.set(Number(version));
      }
      // description + nextVersion will be set after the API response in initModeler
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
          // Restrict palette to MVP elements only
          {
            __init__: ['restrictedPaletteProvider'],
            restrictedPaletteProvider: ['type', RestrictedPaletteProvider],
          },
          // Strip morph/replace from context pad
          {
            __init__: ['restrictedContextPadProvider'],
            restrictedContextPadProvider: ['type', RestrictedContextPadProvider],
          },
          // Block 3rd outgoing flow from ExclusiveGateway
          {
            __init__: ['gatewayFlowLimitProvider'],
            gatewayFlowLimitProvider: ['type', GatewayFlowLimitProvider],
          },
        ],
      });

      // Load XML: fetch from backend in edit mode, blank canvas otherwise
      if (this.isEditMode()) {
        try {
          const dto = await this.workflowApi
            .getByKeyAndVersion(this.editKey(), this.editVersion())
            .toPromise();

          if (dto?.bpmn_xml) {
            await this.modeler.importXML(dto.bpmn_xml);
            this.originalXml    = dto.bpmn_xml;
            this.editDescription.set(dto.description ?? '');
            this.nextVersion.set((dto.version ?? this.editVersion()) + 1);
          } else {
            // API returned no XML — start blank
            await this.modeler.createDiagram();
            this.originalXml = '';
          }
        } catch (fetchErr) {
          console.error('Failed to load workflow from API:', fetchErr);
          this.toast.error('Load failed', 'Could not fetch the saved workflow. Starting blank.');
          await this.modeler.createDiagram();
          this.originalXml = '';
        }
      } else {
        await this.modeler.createDiagram();
      }

      this.modeler.get('canvas').zoom('fit-viewport');
      this.loading.set(false);

      // Element count
      const elementRegistry = this.modeler.get('elementRegistry');
      this.elementCount.set(Math.max(0, elementRegistry.size - 1));
      this.modeler.get('eventBus').on('elements.changed', () => {
        this.elementCount.set(Math.max(0, elementRegistry.size - 1));
      });

      // ── Selection → properties panel ────────────────────────────
      const selection = this.modeler.get('selection');
      this.modeler.get('eventBus').on('selection.changed', (event: any) => {
        const selected = event.newSelection;
        if (selected && selected.length === 1) {
          const el = selected[0];
          // Only show panel for editable types
          const editableTypes = [
            'bpmn:StartEvent',
            'bpmn:EndEvent',
            'bpmn:ServiceTask',
            'bpmn:ExclusiveGateway',
            'bpmn:SequenceFlow',
          ];
          if (editableTypes.includes(el.type)) {
            this.selectedElement.set(el);
          } else {
            this.selectedElement.set(null);
          }
        } else {
          this.selectedElement.set(null);
        }
      });

    } catch (err) {
      console.error('BPMN Modeler init error:', err);
      this.loading.set(false);
    }
  }

  // ── Properties panel event handlers ───────────────────────────────

  /**
   * Called when user saves a SpEL condition on a gateway sequence flow.
   * Writes conditionExpression + name into the BPMN model via modeling API.
   */
  onConditionSaved(event: ConditionSaveEvent): void {
    if (!this.modeler) return;
    const elementRegistry = this.modeler.get('elementRegistry');
    const modeling = this.modeler.get('modeling');
    const moddle = this.modeler.get('moddle');

    const element = elementRegistry.get(event.elementId);
    if (!element) return;

    const conditionExpression = moddle.create('bpmn:FormalExpression', {
      body: event.condition,
    });

    modeling.updateProperties(element, {
      conditionExpression,
      name: event.label || undefined,
    });

    this.toast.success('Condition saved', `Flow condition updated.`);

    // Refresh gateway panel if gateway is still selected
    this.refreshSelectedIfGateway(element);
  }

  /**
   * Called when user picks a handler and/or sets a label on a Service Task.
   * Writes name = handlerName into the BPMN model.
   */
  onTaskNameSaved(event: TaskNameSaveEvent): void {
    if (!this.modeler) return;
    const elementRegistry = this.modeler.get('elementRegistry');
    const modeling = this.modeler.get('modeling');

    const element = elementRegistry.get(event.elementId);
    if (!element) return;

    // Strategy agreed with Dev A (LLD §3.5):
    // - `name`          = handlerName  → engine reads this to resolve HandlerRegistry
    // - canvas label    = handlerName  → bpmn-js renders name on canvas
    // Display label is a UX convenience shown only in the panel (not persisted separately).
    // Post-MVP: if custom labels are needed in XML, add a wos:displayLabel extension attr.
    modeling.updateProperties(element, {
      name: event.handlerName,
    });

    this.toast.success('Service Task saved', `Handler: ${event.handlerName}`);
  }

  /**
   * Called when user sets a name on Start Event, End Event, or Gateway.
   */
  onNameSaved(event: NameSaveEvent): void {
    if (!this.modeler) return;
    const elementRegistry = this.modeler.get('elementRegistry');
    const modeling = this.modeler.get('modeling');

    const element = elementRegistry.get(event.elementId);
    if (!element) return;

    modeling.updateProperties(element, { name: event.name });
    this.toast.success('Saved', `Label updated.`);
  }

  onPanelDeselected(): void {
    if (!this.modeler) return;
    const selection = this.modeler.get('selection');
    selection.select([]);
    this.selectedElement.set(null);
  }

  private refreshSelectedIfGateway(changedFlowElement: any): void {
    const currentSelected = this.selectedElement();
    if (!currentSelected) return;
    // If a gateway is open in the panel and one of its flows changed, refresh it
    if (currentSelected.type === 'bpmn:ExclusiveGateway') {
      // Re-set to trigger ngOnChanges in the panel
      this.selectedElement.set(null);
      setTimeout(() => this.selectedElement.set(currentSelected), 0);
    }
  }

  // ── Deploy flow with validation ────────────────────────────────────
  async openDeployModal(): Promise<void> {
    if (!this.modeler) return;

    // Run validation first
    const result = this.validator.validate(this.modeler);

    if (!result.valid) {
      this.validationErrors.set(result.errors);
      this.validationWarnings.set(result.warnings);
      this.showValidationModal.set(true);
      return;
    }

    // Warnings: allow deploy but show toast
    if (result.warnings.length > 0) {
      this.toast.warning(
        `${result.warnings.length} warning(s)`,
        'Workflow has warnings but can still be deployed.'
      );
    }

    try {
      const { xml } = await this.modeler.saveXML({ format: true });

      // ── Edit mode: block deploy if nothing functionally changed ──
      if (this.isEditMode() && this.originalXml) {
        const unchanged = BpmnDiffUtil.isIdentical(this.originalXml, xml);
        if (unchanged) {
          this.toast.warning(
            'No changes detected',
            'The workflow is identical to the deployed version. Make changes before deploying a new version.'
          );
          return;
        }
      }

      this.currentXml.set(xml);
      this.showDeployModal.set(true);
    } catch (err) {
      this.toast.error('Failed to read diagram', 'Could not extract BPMN XML.');
    }
  }

  onDeploy(data: DeployFormData): void {
    this.workflowApi.deploy({
      workflow_key: data.workflow_key,
      bpmn_xml: this.currentXml(),
      description: data.description ?? '',
    }).subscribe({
      next: (res) => {
        this.workflowStore.addDeployed(res.data);
        this.toast.success(
          this.isEditMode() ? 'Workflow updated!' : 'Workflow deployed!',
          `Key: ${res.data.workflow_key} · v${res.data.version}`
        );

        this.showDeployModal.set(false);
        this.router.navigate(['/definitions']);
      },
      error: (err) => {
        this.toast.error(
          'Deploy failed',
          err.message || 'Could not reach the backend.'
        );
        this.deployModalRef?.resetDeploying();
      },
    });
  }

  onDeployCancel(): void {
    this.showDeployModal.set(false);
  }

  onValidationModalClose(): void {
    this.showValidationModal.set(false);
  }

  // ── Canvas controls ───────────────────────────────────────────────
  async resetDiagram(): Promise<void> {
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
        this.toast.error('Reset failed', 'Could not reload the workflow from the server.');
      }
      this.modeler.get('canvas').zoom('fit-viewport');
    } else {
      await this.modeler.createDiagram();
      this.modeler.get('canvas').zoom('fit-viewport');
    }
  }

  zoomFit(): void {
    if (!this.modeler) return;
    this.modeler.get('canvas').zoom('fit-viewport');
  }

  async exportXml(): Promise<void> {
    if (!this.modeler) return;
    try {
      const { xml } = await this.modeler.saveXML({ format: true });
      const blob = new Blob([xml], { type: 'application/xml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `workflow-${this.editKey() || 'new'}-${Date.now()}.bpmn`;
      a.click();
    } catch (err) {
      this.toast.error('Export failed', 'Could not export BPMN XML.');
    }
  }

  ngOnDestroy(): void {
    this.modeler?.destroy();
  }
}


