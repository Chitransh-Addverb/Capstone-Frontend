import {
  Component, OnDestroy, ViewChild, ElementRef,
  signal, AfterViewInit, inject, OnInit, computed
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

  ngOnInit(): void {

    this.workflowStore.definitions();

    const key = this.route.snapshot.queryParamMap.get('key');
    const version = this.route.snapshot.queryParamMap.get('version');

    if (key) {

      this.isEditMode.set(true);
      this.editKey.set(key);

      if (version) {
        this.editVersion.set(Number(version));
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
          }

        ],
      });

      const eventBus = this.modeler.get('eventBus');
      const elementRegistry = this.modeler.get('elementRegistry');
      const modeling = this.modeler.get('modeling');

      eventBus.on('import.done', () => {

        const startEvents = elementRegistry.filter(
          (el: any) => el.type === 'bpmn:StartEvent'
        );

        startEvents.forEach((el: any) => {

          const currentName = el.businessObject?.name?.trim();

          if (currentName !== 'Scanner') {
            modeling.updateProperties(el, { name: 'Scanner' });
          }

        });

      });

      /**
       * If user drags new Start Event → rename automatically
       */
      eventBus.on('commandStack.shape.create.postExecute', (event: any) => {

        const shape = event.context.shape;

        if (shape.type === 'bpmn:StartEvent') {
          modeling.updateProperties(shape, { name: 'Scanner' });
        }

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

        } catch (err) {

          this.toast.error(
            'Load failed',
            'Could not fetch workflow. Starting blank.'
          );

          await this.modeler.createDiagram();

        }

      } else {

        await this.modeler.createDiagram();

      }

      this.modeler.get('canvas').zoom('fit-viewport');

      this.loading.set(false);

      const elementRegistry2 = this.modeler.get('elementRegistry');

      this.elementCount.set(Math.max(0, elementRegistry2.size - 1));

      this.modeler.get('eventBus').on('elements.changed', () => {
        this.elementCount.set(Math.max(0, elementRegistry2.size - 1));
      });

      const selection = this.modeler.get('selection');

      this.modeler.get('eventBus').on('selection.changed', (event: any) => {

        const selected = event.newSelection;

        if (selected && selected.length === 1) {

          const el = selected[0];

          if (el.type === 'bpmn:StartEvent') {

            this.selectedElement.set(null);
            return;

          }

          const editableTypes = [
            'bpmn:EndEvent',
            'bpmn:ServiceTask',
            'bpmn:ExclusiveGateway',
            'bpmn:SequenceFlow'
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

  // ── Properties panel handlers ─────────────────────────────

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

    this.toast.success('Condition saved', 'Flow condition updated.');

  }

  onTaskNameSaved(event: TaskNameSaveEvent): void {

    if (!this.modeler) return;

    const elementRegistry = this.modeler.get('elementRegistry');
    const modeling = this.modeler.get('modeling');

    const element = elementRegistry.get(event.elementId);

    if (!element) return;

    modeling.updateProperties(element, {
      name: event.handlerName,
    });

    this.toast.success('Service Task saved', `Handler: ${event.handlerName}`);

  }

  onNameSaved(event: NameSaveEvent): void {

    if (!this.modeler) return;

    const elementRegistry = this.modeler.get('elementRegistry');
    const modeling = this.modeler.get('modeling');

    const element = elementRegistry.get(event.elementId);

    if (!element) return;

    modeling.updateProperties(element, { name: event.name });

    this.toast.success('Saved', 'Label updated.');

  }

  onPanelDeselected(): void {

    if (!this.modeler) return;

    const selection = this.modeler.get('selection');

    selection.select([]);

    this.selectedElement.set(null);

  }

  // ── Deploy flow ───────────────────────────────────────────

  async openDeployModal(): Promise<void> {

    if (!this.modeler) return;

    const result = this.validator.validate(this.modeler);

    // existingWorkflowKeys = computed(() =>
    //   new Set(this.workflowStore.latestVersions().map(d => d.workflow_key.toLowerCase()))
    // );

    if (!result.valid) {

      this.validationErrors.set(result.errors);
      this.validationWarnings.set(result.warnings);

      this.showValidationModal.set(true);

      return;

    }

    try {

      const { xml } = await this.modeler.saveXML({ format: true });

      if (this.isEditMode() && this.originalXml) {

        const unchanged = BpmnDiffUtil.isIdentical(this.originalXml, xml);

        if (unchanged) {

          this.toast.warning(
            'No changes detected',
            'Make changes before deploying.'
          );

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
          err.message || 'Backend error.'
        );

        this.deployModalRef?.resetDeploying();

      }

    });

  }

  onDeployCancel(): void {
    this.showDeployModal.set(false);
  }

  onValidationModalClose(): void {
    this.showValidationModal.set(false);
  }

  // ── Canvas controls ───────────────────────────────────────

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

        this.toast.error(
          'Reset failed',
          'Could not reload workflow.'
        );

      }

    } else {

      await this.modeler.createDiagram();

    }

    this.modeler.get('canvas').zoom('fit-viewport');

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

    } catch {

      this.toast.error('Export failed', 'Could not export BPMN XML.');

    }

  }

  ngOnDestroy(): void {
    this.modeler?.destroy();
  }

}



