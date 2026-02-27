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

/**
 * A no-op module that overrides bpmn-js's built-in replaceMenuProvider.
 * Injecting this as 'replaceMenuProvider' with an empty getPopupMenuEntries
 * prevents the "Change element" wrench popup from ever appearing.
 */
class DisabledReplaceMenuProvider {
  static $inject = ['popupMenu'];

  constructor(popupMenu: any) {
    popupMenu.registerProvider('bpmn-replace', 1500, this);
  }

  getPopupMenuEntries() {
    // Return empty — no replace options for any element type
    return () => ({});
  }
}

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

  isEditMode      = signal(false);
  editKey         = signal('');
  editDescription = signal('');
  nextVersion     = signal(1);

  selectedElement = signal<any>(null);

  showValidationModal = signal(false);
  validationErrors    = signal<ValidationError[]>([]);
  validationWarnings  = signal<ValidationError[]>([]);

  private modeler:   any = null;
  private validator      = new BpmnCanvasValidator();

  private router        = inject(Router);
  private route         = inject(ActivatedRoute);
  private workflowApi   = inject(WorkflowApiService);
  private workflowStore = inject(WorkflowDefinitionService);
  private toast         = inject(ToastService);

  ngOnInit(): void {
    const key = this.route.snapshot.queryParamMap.get('key');
    if (key) {
      const existing = this.workflowStore.getLatestByKey(key);
      if (existing) {
        this.isEditMode.set(true);
        this.editKey.set(key);
        this.editDescription.set(existing.description);
        this.nextVersion.set(this.workflowStore.getNextVersion(key));
      }
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
          // Remove "Change element" from context pad entries
          {
            __init__: ['restrictedContextPadProvider'],
            restrictedContextPadProvider: ['type', RestrictedContextPadProvider],
          },
          // ── KEY FIX: override the replaceMenuProvider at the popup level ──
          // This kills the wrench popup itself, not just the context pad button.
          // Without this, bpmn-js re-adds the entry because the popup provider
          // is registered independently of the context pad.
          {
            __init__: ['disabledReplaceMenuProvider'],
            disabledReplaceMenuProvider: ['type', DisabledReplaceMenuProvider],
          },
        ],
      });

      if (this.isEditMode()) {
        const existing = this.workflowStore.getLatestByKey(this.editKey());
        if (existing?.bpmn_xml) {
          await this.modeler.importXML(existing.bpmn_xml);
        } else {
          await this.modeler.createDiagram();
        }
      } else {
        await this.modeler.createDiagram();
      }

      this.modeler.get('canvas').zoom('fit-viewport');
      this.loading.set(false);

      const elementRegistry = this.modeler.get('elementRegistry');
      this.elementCount.set(Math.max(0, elementRegistry.size - 1));
      this.modeler.get('eventBus').on('elements.changed', () => {
        this.elementCount.set(Math.max(0, elementRegistry.size - 1));
      });

      const selection = this.modeler.get('selection');
      this.modeler.get('eventBus').on('selection.changed', (event: any) => {
        const selected = event.newSelection;
        if (selected && selected.length === 1) {
          const el = selected[0];
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
    this.refreshSelectedIfGateway(element);
  }

  onTaskNameSaved(event: TaskNameSaveEvent): void {
    if (!this.modeler) return;
    const elementRegistry = this.modeler.get('elementRegistry');
    const modeling = this.modeler.get('modeling');

    const element = elementRegistry.get(event.elementId);
    if (!element) return;

    modeling.updateProperties(element, { name: event.handlerName });
    this.toast.success('Service Task saved', `Handler: ${event.handlerName}`);
  }

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
    if (currentSelected.type === 'bpmn:ExclusiveGateway') {
      this.selectedElement.set(null);
      setTimeout(() => this.selectedElement.set(currentSelected), 0);
    }
  }

  async openDeployModal(): Promise<void> {
    if (!this.modeler) return;

    const result = this.validator.validate(this.modeler);

    if (!result.valid) {
      this.validationErrors.set(result.errors);
      this.validationWarnings.set(result.warnings);
      this.showValidationModal.set(true);
      return;
    }

    if (result.warnings.length > 0) {
      this.toast.warning(
        `${result.warnings.length} warning(s)`,
        'Workflow has warnings but can still be deployed.'
      );
    }

    try {
      const { xml } = await this.modeler.saveXML({ format: true });
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
        const saved = this.workflowStore.saveVersion({
          workflow_key: data.workflow_key,
          description: data.description,
          bpmn_xml: this.currentXml(),
        });

        this.toast.success(
          this.isEditMode() ? 'Workflow updated!' : 'Workflow deployed!',
          `Key: ${res.data.workflow_key} · Version: v${saved.version}`
        );

        this.showDeployModal.set(false);
        this.router.navigate(['/definitions']);
      },
      error: (err) => {
        this.toast.error('Deploy failed', err.message || 'Could not reach the backend.');
        this.deployModalRef?.resetDeploying();
      },
    });
  }

  onDeployCancel(): void { this.showDeployModal.set(false); }
  onValidationModalClose(): void { this.showValidationModal.set(false); }

  async resetDiagram(): Promise<void> {
    if (!this.modeler) return;
    this.selectedElement.set(null);

    if (this.isEditMode()) {
      const existing = this.workflowStore.getLatestByKey(this.editKey());
      if (existing?.bpmn_xml) {
        await this.modeler.importXML(existing.bpmn_xml);
        this.modeler.get('canvas').zoom('fit-viewport');
      }
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





