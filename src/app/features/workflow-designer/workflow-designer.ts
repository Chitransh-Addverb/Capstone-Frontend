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

@Component({
  selector: 'app-workflow-designer',
  standalone: true,
  imports: [CommonModule, DeployModal],
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

  // Edit mode state
  isEditMode = signal(false);
  editKey = signal('');
  editDescription = signal('');
  nextVersion = signal(1);

  private modeler: any = null;
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private workflowApi = inject(WorkflowApiService);
  private workflowStore = inject(WorkflowDefinitionService);
  private toast = inject(ToastService);

  private readonly defaultDiagram = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  targetNamespace="http://bpmn.io/schema/bpmn"
  id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Scan Received">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1"/>
    <bpmn:serviceTask id="Task_1" name="Container Validation">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Gateway_1"/>
    <bpmn:exclusiveGateway id="Gateway_1" name="Valid?">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="Flow_3" name="Yes" sourceRef="Gateway_1" targetRef="EndEvent_1"/>
    <bpmn:sequenceFlow id="Flow_4" name="No" sourceRef="Gateway_1" targetRef="EndEvent_2"/>
    <bpmn:endEvent id="EndEvent_1" name="Lane 1 — Valid">
      <bpmn:incoming>Flow_3</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:endEvent id="EndEvent_2" name="Lane 2 — Invalid">
      <bpmn:incoming>Flow_4</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="202" width="36" height="36"/>
        <bpmndi:BPMNLabel><dc:Bounds x="130" y="245" width="80" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="250" y="180" width="120" height="80"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1_di" bpmnElement="Gateway_1" isMarkerVisible="true">
        <dc:Bounds x="435" y="195" width="50" height="50"/>
        <bpmndi:BPMNLabel><dc:Bounds x="446" y="252" width="29" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="562" y="152" width="36" height="36"/>
        <bpmndi:BPMNLabel><dc:Bounds x="538" y="195" width="84" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_2_di" bpmnElement="EndEvent_2">
        <dc:Bounds x="562" y="252" width="36" height="36"/>
        <bpmndi:BPMNLabel><dc:Bounds x="536" y="295" width="88" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="220"/><di:waypoint x="250" y="220"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="370" y="220"/><di:waypoint x="435" y="220"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="460" y="195"/><di:waypoint x="460" y="170"/><di:waypoint x="562" y="170"/>
        <bpmndi:BPMNLabel><dc:Bounds x="503" y="152" width="18" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4">
        <di:waypoint x="460" y="245"/><di:waypoint x="460" y="270"/><di:waypoint x="562" y="270"/>
        <bpmndi:BPMNLabel><dc:Bounds x="503" y="253" width="15" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

  ngOnInit(): void {
    // Check if edit mode — route: /designer?key=scanner-1-workflow
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
      });

      if (this.isEditMode()) {
        const existing = this.workflowStore.getLatestByKey(this.editKey());
        if (existing?.bpmnXml) {
          await this.modeler.importXML(existing.bpmnXml);
        } else {
          await this.modeler.createDiagram();
        }
      } else {
        await this.modeler.createDiagram();
      }

      this.modeler.get('canvas').zoom('fit-viewport');
      this.loading.set(false);

      const elementRegistry = this.modeler.get('elementRegistry');
      this.elementCount.set(elementRegistry.size - 1);
      this.modeler.get('eventBus').on('elements.changed', () => {
        this.elementCount.set(elementRegistry.size - 1);
      });

    } catch (err) {
      console.error('BPMN Modeler init error:', err);
      this.loading.set(false);
    }
  }

  async openDeployModal(): Promise<void> {
    if (!this.modeler) return;
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
      workflowKey: data.workflowKey,
      bpmnXml: this.currentXml(),
      description: data.description ?? '',
    }).subscribe({
      next: (res) => {
        // Save to frontend version store
        const saved = this.workflowStore.saveVersion({
          workflowKey: data.workflowKey,
          description: data.description,
          bpmnXml: this.currentXml(),
        });

        this.toast.success(
          this.isEditMode() ? 'Workflow updated!' : 'Workflow deployed!',
          `Key: ${res.data.workflowKey} · Version: v${saved.version}`
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

  async resetDiagram(): Promise<void> {
    if (!this.modeler) return;

    if (this.isEditMode()) {
      // Reset to last saved version
      const existing = this.workflowStore.getLatestByKey(this.editKey());
      if (existing?.bpmnXml) {
        await this.modeler.importXML(existing.bpmnXml);
        this.modeler.get('canvas').zoom('fit-viewport');
      }
    } else {
      // Clear canvas completely for new workflow
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


