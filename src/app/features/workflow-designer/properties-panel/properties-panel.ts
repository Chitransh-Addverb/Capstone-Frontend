import {
  Component, Input, Output, EventEmitter,
  signal, computed, OnChanges, SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface ConditionSaveEvent {
  elementId: string;
  condition: string;
  label: string;
}

export interface TaskNameSaveEvent {
  elementId: string;
  handlerName: string;
  label: string;
}

export interface NameSaveEvent {
  elementId: string;
  name: string;
}

export const HANDLER_OPTIONS = [
  { value: 'Container Validation', label: 'Container Check',   variable: 'containerValid',  description: 'Checks if the container ID is correct and registered.' },
  { value: 'Weight Validation',    label: 'Weight Check',      variable: 'weightValid',     description: 'Checks if the weight of the item is within allowed limits.' },
  { value: 'Dimension Validation', label: 'Dimension Check',        variable: 'dimensionValid',  description: 'Checks if the dimension of the item fits within the allowed range.' },
] as const;

function variableForHandler(handlerName: string): string {
  const opt = HANDLER_OPTIONS.find(o => o.value === handlerName);
  return opt?.variable ?? 'result';
}

interface OutgoingFlowSummary {
  id: string;
  targetName: string;
  targetType: string;
  hasCondition: boolean;
  conditionValue: 'true' | 'false' | '';
  label: string;
}

function normalizeLane(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  const match = trimmed.match(/^lane\s*(\d+)$/);
  if (!match) return null;
  return `Lane ${match[1]}`;
}

function normalizeScanner(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  const match = trimmed.match(/^scanner\s*(\d+)$/);
  if (!match) return null;
  return `Scanner ${match[1]}`;
}

@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './properties-panel.html',
  styleUrl: './properties-panel.scss',
})
export class PropertiesPanel implements OnChanges {
  @Input() element: any = null;

  @Output() conditionSaved = new EventEmitter<ConditionSaveEvent>();
  @Output() taskNameSaved  = new EventEmitter<TaskNameSaveEvent>();
  @Output() nameSaved      = new EventEmitter<NameSaveEvent>();
  @Output() deselected     = new EventEmitter<void>();

  readonly HANDLER_OPTIONS = HANDLER_OPTIONS;

  selectedElement = signal<any>(null);
  elementType     = signal<string>('');

  startLabel      = signal('');
  startLabelError = signal('');

  taskHandler        = signal('');
  taskDisplayLabel   = signal('');
  taskHandlerError   = signal('');
  taskFlowConditions = signal<Record<string, 'true' | 'false' | ''>>({});
  taskFlowErrors     = signal<Record<string, string>>({});
  taskOutgoingFlows  = signal<OutgoingFlowSummary[]>([]);

  endEventLabel      = signal('');
  endEventLabelError = signal('');

  isGatewayFlow   = signal(false);
  plainFlowSource = signal('');
  plainFlowTarget = signal('');

  elementTypeKey = computed(() => {
    const t = this.elementType();
    if (t === 'bpmn:StartEvent')   return 'start';
    if (t === 'bpmn:EndEvent')     return 'end';
    if (t === 'bpmn:Task')         return 'task';
    if (t === 'bpmn:SequenceFlow') return 'flow';
    return 'unknown';
  });

  elementTypeLabel = computed(() => {
    const t = this.elementType();
    if (t === 'bpmn:StartEvent')   return 'Starting Point';
    if (t === 'bpmn:EndEvent')     return 'End Point';
    if (t === 'bpmn:Task')         return 'Check Step';
    if (t === 'bpmn:SequenceFlow') return 'Arrow / Connection';
    return t;
  });

  elementTypeIcon = computed(() => {
    const t = this.elementType();
    if (t === 'bpmn:StartEvent')
      return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/></svg>`;
    if (t === 'bpmn:EndEvent')
      return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="3"><circle cx="8" cy="8" r="6"/></svg>`;
    if (t === 'bpmn:Task')
      return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="1.5" width="13" height="13" rx="2.5"/></svg>`;
    if (t === 'bpmn:SequenceFlow')
      return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 8h12M10 4l4 4-4 4"/></svg>`;
    return '';
  });

  selectedHandler = computed(() =>
    HANDLER_OPTIONS.find(o => o.value === this.taskHandler()) ?? null
  );

  allFlowConditionsSet = computed(() => {
    const flows = this.taskOutgoingFlows();
    if (flows.length === 0) return false;
    return flows.every(f => !!this.taskFlowConditions()[f.id]);
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['element']) this.loadElement(this.element);
  }

  loadElement(el: any): void {
    this.startLabelError.set('');
    this.taskHandlerError.set('');
    this.endEventLabelError.set('');
    this.taskFlowErrors.set({});

    if (!el) {
      this.selectedElement.set(null);
      this.elementType.set('');
      return;
    }

    this.selectedElement.set(el);
    this.elementType.set(el.type);
    const bo = el.businessObject;

    switch (el.type) {
      case 'bpmn:StartEvent':
        this.startLabel.set(bo?.name?.trim() || '');
        break;

      case 'bpmn:Task': {
        this.taskHandler.set(bo?.name?.trim() || '');
        const savedOpt = HANDLER_OPTIONS.find(o => o.value === bo?.name?.trim());
        this.taskDisplayLabel.set(savedOpt?.label ?? bo?.name?.trim() ?? '');

        // Resolve outgoing flows — if task has a paired gateway, get flows from it
        const directOutgoing: any[] = el.outgoing || [];

        // Check if any outgoing goes to a gateway (paired pattern)
        const internalFlow = directOutgoing.find(
          (f: any) => f.target?.type === 'bpmn:ExclusiveGateway'
        );

        // Use gateway's outgoing if paired, otherwise use direct outgoing
        const conditionFlows: any[] = internalFlow
          ? (internalFlow.target?.outgoing || [])
          : directOutgoing.filter((f: any) => f.target?.type !== 'bpmn:ExclusiveGateway');

        const summaries: OutgoingFlowSummary[] = conditionFlows.map((flow: any) => {
          const fbo = flow.businessObject;
          const condition = fbo?.conditionExpression?.body?.trim() || '';
          const match = condition.match(/==\s*(true|false)$/);
          const condVal = (match?.[1] as 'true' | 'false') || '';
          const targetName = flow.target?.businessObject?.name?.trim()
            || this.friendlyTypeName(flow.target?.type)
            || '?';
          return {
            id: flow.id,
            targetName,
            targetType: flow.target?.type || '',
            hasCondition: !!condition,
            conditionValue: condVal,
            label: fbo?.name?.trim() || '',
          };
        });

        this.taskOutgoingFlows.set(summaries);
        const condMap: Record<string, 'true' | 'false' | ''> = {};
        for (const s of summaries) condMap[s.id] = s.conditionValue;
        this.taskFlowConditions.set(condMap);
        break;
      }

      case 'bpmn:SequenceFlow': {
        const fromGateway = el.source?.type === 'bpmn:ExclusiveGateway';
        const fromTask    = el.source?.type === 'bpmn:Task';
        this.isGatewayFlow.set(fromGateway || fromTask);
        this.plainFlowSource.set(
          el.source?.businessObject?.name?.trim() || this.friendlyTypeName(el.source?.type) || '?'
        );
        this.plainFlowTarget.set(
          el.target?.businessObject?.name?.trim() || this.friendlyTypeName(el.target?.type) || '?'
        );
        break;
      }

      case 'bpmn:EndEvent':
        this.endEventLabel.set(bo?.name?.trim() || '');
        break;

      default:
        this.selectedElement.set(null);
        this.elementType.set('');
        break;
    }
  }

  private friendlyTypeName(type: string | undefined): string {
    if (!type) return '?';
    if (type === 'bpmn:StartEvent')   return 'Starting Point';
    if (type === 'bpmn:EndEvent')     return 'End Point';
    if (type === 'bpmn:Task')         return 'Check Step';
    return type.replace('bpmn:', '');
  }

  onStartLabelChange(e: Event): void {
    this.startLabel.set((e.target as HTMLInputElement).value);
    this.startLabelError.set('');
  }

  saveStartEvent(): void {
    const normalized = normalizeScanner(this.startLabel());
    if (!normalized) {
      this.startLabelError.set('Please write it like: Scanner 1  or  Scanner 2');
      return;
    }
    this.startLabel.set(normalized);
    this.startLabelError.set('');
    this.nameSaved.emit({ elementId: this.selectedElement()!.id, name: normalized });
  }

  onHandlerSelect(e: Event): void {
    const value = (e.target as HTMLSelectElement).value;
    this.taskHandler.set(value);
    if (value) {
      this.taskHandlerError.set('');
      const option = HANDLER_OPTIONS.find(o => o.value === value);
      this.taskDisplayLabel.set(option?.label ?? value);
    }
  }

  // Called by [(ngModel)] on the select — ensures selection persists on re-open
  onHandlerNgModelChange(value: string): void {
    this.taskHandler.set(value);
    if (value) {
      this.taskHandlerError.set('');
      const option = HANDLER_OPTIONS.find(o => o.value === value);
      this.taskDisplayLabel.set(option?.label ?? value);
    }
  }

  saveTask(): void {
    if (!this.taskHandler()) {
      this.taskHandlerError.set('Please pick a check from the list above.');
      return;
    }
    this.taskHandlerError.set('');
    this.taskNameSaved.emit({
      elementId: this.selectedElement()!.id,
      handlerName: this.taskHandler(),
      label: this.taskDisplayLabel().trim() || this.taskHandler(),
    });
    // Re-load the element so outgoing flows and conditions stay visible
    const el = this.selectedElement();
    if (el) this.loadElement(el);
  }

  onFlowConditionChange(flowId: string, value: 'true' | 'false' | ''): void {
    const current = { ...this.taskFlowConditions() };
    current[flowId] = value;

    // Auto-set the other arrow to the opposite result
    const flows = this.taskOutgoingFlows();
    if (flows.length === 2) {
      const sibling = flows.find(f => f.id !== flowId);
      if (sibling && value) {
        current[sibling.id] = value === 'true' ? 'false' : 'true';
      }
    }

    this.taskFlowConditions.set({ ...current });
    const errs = { ...this.taskFlowErrors() };
    errs[flowId] = '';
    this.taskFlowErrors.set(errs);
  }

  saveAllFlowConditions(): void {
    const flows = this.taskOutgoingFlows();
    let allValid = true;
    for (const flow of flows) {
      const val = this.taskFlowConditions()[flow.id];
      if (!val) {
        const errs = { ...this.taskFlowErrors() };
        errs[flow.id] = 'Please select Pass or Fail for this arrow.';
        this.taskFlowErrors.set(errs);
        allValid = false;
      }
    }
    if (!allValid) return;

    const variable = variableForHandler(this.taskHandler());
    for (const flow of flows) {
      const val = this.taskFlowConditions()[flow.id]!;
      this.conditionSaved.emit({
        elementId: flow.id,
        condition: `${variable} == ${val}`,
        label: val === 'true' ? 'Pass' : 'Fail',
      });
    }

    // Reload so saved badges stay visible immediately
    const el = this.selectedElement();
    if (el) setTimeout(() => this.loadElement(el), 50);
  }

  getFlowCondition(flowId: string): 'true' | 'false' | '' {
    return this.taskFlowConditions()[flowId] ?? '';
  }

  getFlowError(flowId: string): string {
    return this.taskFlowErrors()[flowId] ?? '';
  }

  onEndEventLabelChange(e: Event): void {
    this.endEventLabel.set((e.target as HTMLInputElement).value);
    this.endEventLabelError.set('');
  }

  saveEndEvent(): void {
    const normalized = normalizeLane(this.endEventLabel());
    if (!normalized) {
      this.endEventLabelError.set('Please write it like: Lane 1  or  Lane 2');
      return;
    }
    this.endEventLabel.set(normalized);
    this.endEventLabelError.set('');
    this.nameSaved.emit({ elementId: this.selectedElement()!.id, name: normalized });
  }

  clearSelection(): void {
    this.selectedElement.set(null);
    this.deselected.emit();
  }
}