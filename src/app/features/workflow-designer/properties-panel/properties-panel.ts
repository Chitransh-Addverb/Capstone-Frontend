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
  { value: 'ContainerValidationHandler', label: 'Container Validation',  variable: 'containerValid'  },
  { value: 'WeightValidationHandler',    label: 'Weight Validation',     variable: 'weightValid'     },
  { value: 'DimensionValidationHandler', label: 'Dimension Validation',  variable: 'dimensionValid'  },
  // { value: 'LaneDiversionHandler',       label: 'Lane Diversion',        variable: 'laneDiverted'    },
] as const;

/** Derive the SpEL variable name from a handler name stored on a ServiceTask */
function variableForHandler(handlerName: string): string {
  const opt = HANDLER_OPTIONS.find(o => o.value === handlerName);
  return opt?.variable ?? 'result';
}

/**
 * Derive a human-readable gateway name from an incoming handler.
 * e.g. "WeightValidationHandler" → "Weight Valid?"
 */
function gatewayNameForHandler(handlerName: string): string {
  const opt = HANDLER_OPTIONS.find(o => o.value === handlerName);
  if (!opt) return 'Valid?';
  // Strip "Handler" suffix, add "?"
  // "Container Validation" → "Container Valid?"
  const base = opt.label.replace(/Validation/i, 'Valid').replace(/Handler/i, '').trim();
  return `${base}?`;
}

interface FlowSummary {
  id: string;
  targetName: string;
  condition: string;
  hasCondition: boolean;
}

// ── Label normalisation helpers ───────────────────────────────────────

/**
 * Normalise Scanner input.
 * Accepts: "scanner1", "scanner 1", "SCANNER1", "Scanner 1"
 * Rejects: "sc1", "s1", "scan1", "sc 1"   → returns null
 * Output:  "Scanner 1"
 */
function normalizeScanner(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  // Must start with full word "scanner" (not sc, s, scan, etc.)
  const match = trimmed.match(/^scanner\s*(\d+)$/);
  if (!match) return null;
  return `Scanner ${match[1]}`;
}

/**
 * Normalise Lane input.
 * Accepts: "lane1", "lane 1", "LANE1", "Lane 1"
 * Rejects: "l1", "ln1", "la1"   → returns null
 * Output:  "Lane 1"
 */
function normalizeLane(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  // Must start with full word "lane"
  const match = trimmed.match(/^lane\s*(\d+)$/);
  if (!match) return null;
  return `Lane ${match[1]}`;
}

/**
 * Normalise Flow label input (plain sequence flows only).
 * Accepts: "flow1", "flow 1", "FLOW1", "Flow 1"
 * Rejects: "f1", "fl1"   → returns null
 * Output:  "Flow 1"
 */
function normalizeFlow(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  const match = trimmed.match(/^flow\s*(\d+)$/);
  if (!match) return null;
  return `Flow ${match[1]}`;
}

/**
 * Auto-label for gateway sequence flows.
 * true  → "Success"
 * false → "Failure"
 */
function gatewayFlowLabel(boolValue: 'true' | 'false' | ''): string {
  if (boolValue === 'true')  return 'Success';
  if (boolValue === 'false') return 'Failure';
  return '';
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

  // ── Shared ────────────────────────────────────────────────────────
  selectedElement = signal<any>(null);
  elementType     = signal<string>('');

  // Start Event
  startLabel      = signal('');
  startLabelError = signal('');

  // Service Task
  taskHandler      = signal('');
  taskDisplayLabel = signal('');
  taskHandlerError = signal('');

  // Exclusive Gateway
  gatewayName      = signal('');
  gatewayNameError = signal('');
  gatewayFlows     = signal<FlowSummary[]>([]);

  // Sequence Flow (gateway)
  isGatewayFlow         = signal(false);
  gatewaySourceName     = signal('');
  flowTargetName        = signal('');
  flowIndex             = signal<1 | 2>(1);       // position hint only
  conditionVariable     = signal('');             // e.g. "containerValid"
  conditionBoolValue    = signal<'true' | 'false' | ''>(''); // user picks
  lockedBoolValue       = signal<'true' | 'false' | ''>(''); // locked by sibling
  conditionError        = signal('');
  siblingConditionSet   = signal(false);

  // Flow label — shared for both gateway and plain flows
  flowLabel           = signal('');
  flowLabelError      = signal('');

  // Sequence Flow (plain)
  plainFlowLabel      = signal('');
  plainFlowLabelError = signal('');

  // End Event
  endEventLabel      = signal('');
  endEventLabelError = signal('');

  // ── Computed ──────────────────────────────────────────────────────
  elementTypeKey = computed(() => {
    const t = this.elementType();
    if (t === 'bpmn:StartEvent')       return 'start';
    if (t === 'bpmn:EndEvent')         return 'end';
    if (t === 'bpmn:ServiceTask')      return 'task';
    if (t === 'bpmn:ExclusiveGateway') return 'gateway';
    if (t === 'bpmn:SequenceFlow')     return 'flow';
    return 'unknown';
  });

  elementTypeLabel = computed(() => {
    const t = this.elementType();
    if (t === 'bpmn:StartEvent')       return 'Start Event';
    if (t === 'bpmn:EndEvent')         return 'End Event';
    if (t === 'bpmn:ServiceTask')      return 'Service Task';
    if (t === 'bpmn:ExclusiveGateway') return 'Exclusive Gateway';
    if (t === 'bpmn:SequenceFlow')     return this.isGatewayFlow() ? 'Gateway Flow' : 'Sequence Flow';
    return t;
  });

  elementTypeIcon = computed(() => {
    const t = this.elementType();
    if (t === 'bpmn:StartEvent')
      return `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6.5" cy="6.5" r="5"/></svg>`;
    if (t === 'bpmn:EndEvent')
      return `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="6.5" cy="6.5" r="5"/></svg>`;
    if (t === 'bpmn:ServiceTask')
      return `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="11" height="11" rx="2"/><path d="M4 6.5h5M4 4.5h5M4 8.5h3"/></svg>`;
    if (t === 'bpmn:ExclusiveGateway')
      return `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.5 1l5.5 5.5-5.5 5.5L1 6.5 6.5 1z"/></svg>`;
    if (t === 'bpmn:SequenceFlow')
      return `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 6.5h9M8 3l3 3.5L8 10"/></svg>`;
    return '';
  });

  /** Full condition expression string shown in the panel e.g. "containerValid == false" */
  conditionPreview = computed(() => {
    const v = this.conditionVariable();
    const b = this.conditionBoolValue();
    if (!v || !b) return '';
    return `${v} == ${b}`;
  });

  /** The value the OTHER sibling flow must use */
  oppositeValue = computed((): 'true' | 'false' | '' => {
    const locked = this.lockedBoolValue();
    if (locked === 'true')  return 'false';
    if (locked === 'false') return 'true';
    return '';
  });

  /** Auto-derived label for the current gateway flow value */
  gatewayFlowAutoLabel = computed((): string => {
    return gatewayFlowLabel(this.conditionBoolValue());
  });

  // ── Lifecycle ─────────────────────────────────────────────────────
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['element']) {
      this.loadElement(this.element);
    }
  }

  private loadElement(el: any): void {
    this.startLabelError.set('');
    this.taskHandlerError.set('');
    this.gatewayNameError.set('');
    this.conditionError.set('');
    this.flowLabel.set('');
    this.flowLabelError.set('');
    this.plainFlowLabelError.set('');
    this.endEventLabelError.set('');

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

      case 'bpmn:ServiceTask':
        // FIX: reload handler from saved name so dropdown shows correct selection
        this.taskHandler.set(bo?.name?.trim() || '');
        // Auto-derive display label from HANDLER_OPTIONS so it shows the friendly name
        const savedOpt = HANDLER_OPTIONS.find(o => o.value === bo?.name?.trim());
        this.taskDisplayLabel.set(savedOpt?.label ?? bo?.name?.trim() ?? '');
        break;

      case 'bpmn:ExclusiveGateway': {
        const savedName = bo?.name?.trim() || '';
        if (savedName) {
          // Already saved — show as-is
          this.gatewayName.set(savedName);
        } else {
          // Pre-fill from incoming service task handler
          const incoming: any[] = el.incoming || [];
          let prefilled = '';
          for (const flow of incoming) {
            const src = flow.source;
            if (src?.type === 'bpmn:ServiceTask') {
              const handlerName = src.businessObject?.name?.trim();
              if (handlerName) {
                prefilled = gatewayNameForHandler(handlerName);
                break;
              }
            }
          }
          this.gatewayName.set(prefilled);
        }
        this.gatewayFlows.set(this.buildGatewayFlows(el));
        break;
      }

      case 'bpmn:SequenceFlow': {
        const fromGateway = el.source?.type === 'bpmn:ExclusiveGateway';
        this.isGatewayFlow.set(fromGateway);

        if (fromGateway) {
          this.loadGatewayFlow(el);
        } else {
          this.plainFlowLabel.set(bo?.name?.trim() || '');
          this.flowLabel.set('');
          this.flowLabelError.set('');
          this.gatewaySourceName.set(
            el.source?.businessObject?.name?.trim() || el.source?.id || ''
          );
          this.flowTargetName.set(
            el.target?.businessObject?.name?.trim() || el.target?.id || ''
          );
        }
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

  private loadGatewayFlow(el: any): void {
    const bo = el.businessObject;
    const gateway = el.source;

    // Determine flow index (1 or 2) based on position in gateway outgoing
    const outgoing: any[] = gateway?.outgoing || [];
    const idx = outgoing.findIndex((f: any) => f.id === el.id);
    this.flowIndex.set(idx === 0 ? 1 : 2);

    // Derive the SpEL variable from the INCOMING ServiceTask to the gateway.
    // The gateway evaluates the result of what came BEFORE it, not what comes after.
    const incomingHandler = this.resolveIncomingHandler(gateway);
    this.conditionVariable.set(incomingHandler ? variableForHandler(incomingHandler) : '');

    this.gatewaySourceName.set(
      gateway?.businessObject?.name?.trim() || gateway?.id || ''
    );
    this.flowTargetName.set(
      el.target?.businessObject?.name?.trim() || el.target?.id || ''
    );

    // Load existing saved condition value
    const savedCondition = bo?.conditionExpression?.body?.trim() || '';
    if (savedCondition) {
      const match = savedCondition.match(/==\s*(true|false)$/);
      this.conditionBoolValue.set((match?.[1] as 'true' | 'false') || '');
    } else {
      this.conditionBoolValue.set('');
    }

    // Load saved flow label
    this.flowLabel.set(bo?.name?.trim() || '');

    // Check sibling flow — if sibling already has a saved condition, lock the opposite
    this.loadSiblingLock(el, outgoing);
  }

  /**
   * Walk the INCOMING flows of a gateway to find the upstream ServiceTask's handler.
   * The gateway condition is based on what the previous task returned — not where
   * the outgoing flow is headed.
   *
   * Example: ServiceTask(ContainerValidationHandler) → Gateway → [Flow1, Flow2]
   * Both flows share variable "containerValid" from the incoming task.
   */
  private resolveIncomingHandler(gatewayEl: any): string | null {
    if (!gatewayEl) return null;
    const incoming: any[] = gatewayEl.incoming || [];
    for (const flow of incoming) {
      const source = flow.source;
      if (source?.type === 'bpmn:ServiceTask') {
        const handlerName = source.businessObject?.name?.trim();
        if (handlerName) return handlerName;
      }
    }
    return null;
  }

  private loadSiblingLock(currentFlow: any, outgoing: any[]): void {
    const sibling = outgoing.find((f: any) => f.id !== currentFlow.id);
    if (!sibling) {
      this.lockedBoolValue.set('');
      this.siblingConditionSet.set(false);
      return;
    }
    const siblingCondition = sibling.businessObject?.conditionExpression?.body?.trim() || '';
    if (siblingCondition) {
      const match = siblingCondition.match(/==\s*(true|false)$/);
      if (match) {
        // Sibling is set to X → this flow MUST be the opposite
        const siblingVal = match[1] as 'true' | 'false';
        this.lockedBoolValue.set(siblingVal); // we show the opposite
        this.siblingConditionSet.set(true);
        // Auto-select the opposite value
        this.conditionBoolValue.set(siblingVal === 'true' ? 'false' : 'true');
        return;
      }
    }
    this.lockedBoolValue.set('');
    this.siblingConditionSet.set(false);
  }

  private buildGatewayFlows(gatewayEl: any): FlowSummary[] {
    return (gatewayEl.outgoing || []).map((flow: any) => {
      const bo = flow.businessObject;
      const condition = bo?.conditionExpression?.body?.trim() || '';
      const targetBo = flow.target?.businessObject;
      return {
        id: flow.id,
        targetName: targetBo?.name?.trim() || flow.target?.id || '?',
        condition,
        hasCondition: condition.length > 0,
      };
    });
  }

  // ── Start Event ───────────────────────────────────────────────────
  onStartLabelChange(event: Event): void {
    this.startLabel.set((event.target as HTMLInputElement).value);
    this.startLabelError.set('');
  }

  saveStartEvent(): void {
    const normalized = normalizeScanner(this.startLabel());
    if (!normalized) {
      this.startLabelError.set(
        'Must be "Scanner N" (e.g. Scanner 1). Abbreviations like sc1 are not allowed.'
      );
      return;
    }
    this.startLabel.set(normalized);
    this.startLabelError.set('');
    this.nameSaved.emit({ elementId: this.selectedElement()!.id, name: normalized });
  }

  // ── Service Task ──────────────────────────────────────────────────
  onHandlerSelect(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.taskHandler.set(value);
    if (value) {
      this.taskHandlerError.set('');
      const option = HANDLER_OPTIONS.find(o => o.value === value);
      this.taskDisplayLabel.set(option?.label ?? value);
    }
  }

  onTaskDisplayLabelChange(event: Event): void {
    this.taskDisplayLabel.set((event.target as HTMLInputElement).value);
  }

  saveServiceTask(): void {
    if (!this.taskHandler()) {
      this.taskHandlerError.set('Handler name is required.');
      return;
    }
    this.taskHandlerError.set('');
    this.taskNameSaved.emit({
      elementId: this.selectedElement()!.id,
      handlerName: this.taskHandler(),
      label: this.taskDisplayLabel().trim() || this.taskHandler(),
    });
  }

  // ── Exclusive Gateway ─────────────────────────────────────────────
  onGatewayNameChange(event: Event): void {
    this.gatewayName.set((event.target as HTMLInputElement).value);
    this.gatewayNameError.set('');
  }

  saveGateway(): void {
    if (!this.gatewayName().trim()) {
      this.gatewayNameError.set('Gateway name is required.');
      return;
    }

    const el = this.selectedElement();
    const outgoingCount = (el?.outgoing || []).length;

    if (outgoingCount > 2) {
      this.gatewayNameError.set(
        `This gateway has ${outgoingCount} outgoing flows. Only 2 are allowed. ` +
        `Delete the extra flow(s) before saving.`
      );
      return;
    }

    if (outgoingCount < 2) {
      this.gatewayNameError.set(
        `Exactly 2 outgoing flows are required. Currently has ${outgoingCount}. ` +
        `Draw both flows first, then save.`
      );
      return;
    }

    this.gatewayNameError.set('');
    this.nameSaved.emit({ elementId: el!.id, name: this.gatewayName().trim() });
  }

  // ── Gateway Sequence Flow ─────────────────────────────────────────
  onConditionBoolChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as 'true' | 'false' | '';
    this.conditionBoolValue.set(value);
    if (value) this.conditionError.set('');
  }

  saveGatewayFlow(): void {
    const boolVal = this.conditionBoolValue();
    const variable = this.conditionVariable();

    if (!boolVal) {
      this.conditionError.set('Please select true or false.');
      return;
    }
    if (!variable) {
      this.conditionError.set('Cannot determine condition — connect this flow to a Service Task first.');
      return;
    }

    // Label is always auto-derived: true → "Success", false → "Failure"
    const label = gatewayFlowLabel(boolVal);

    this.conditionError.set('');
    this.flowLabelError.set('');

    this.conditionSaved.emit({
      elementId: this.selectedElement()!.id,
      condition: `${variable} == ${boolVal}`,
      label,
    });
  }

  // ── Plain Sequence Flow ───────────────────────────────────────────
  savePlainFlow(): void {
    const raw = this.plainFlowLabel().trim();
    if (!raw) {
      this.plainFlowLabelError.set('Flow label is required.');
      return;
    }
    const normalized = normalizeFlow(raw);
    if (!normalized) {
      this.plainFlowLabelError.set('Must be "Flow N" (e.g. Flow 1). Abbreviations like f1 are not allowed.');
      return;
    }
    this.plainFlowLabel.set(normalized);
    this.plainFlowLabelError.set('');
    this.nameSaved.emit({ elementId: this.selectedElement()!.id, name: normalized });
  }

  onFlowLabelChange(event: Event): void {
    this.flowLabel.set((event.target as HTMLInputElement).value);
    this.flowLabelError.set('');
  }

  onPlainFlowLabelChange(event: Event): void {
    this.plainFlowLabel.set((event.target as HTMLInputElement).value);
    this.plainFlowLabelError.set('');
  }

  // ── End Event ─────────────────────────────────────────────────────
  onEndEventLabelChange(event: Event): void {
    this.endEventLabel.set((event.target as HTMLInputElement).value);
    this.endEventLabelError.set('');
  }

  saveEndEvent(): void {
    const normalized = normalizeLane(this.endEventLabel());
    if (!normalized) {
      this.endEventLabelError.set(
        'Must be "Lane N" (e.g. Lane 1). Abbreviations like l1 or ln1 are not allowed.'
      );
      return;
    }
    this.endEventLabel.set(normalized);
    this.endEventLabelError.set('');
    this.nameSaved.emit({ elementId: this.selectedElement()!.id, name: normalized });
  }

  // ── Panel close ───────────────────────────────────────────────────
  clearSelection(): void {
    this.selectedElement.set(null);
    this.deselected.emit();
  }
}

