export interface ValidationError {
  elementId: string | null;
  elementName: string | null;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

const SUPPORTED_TYPES = new Set([
  'bpmn:StartEvent',
  'bpmn:EndEvent',
  'bpmn:ServiceTask',
  'bpmn:ExclusiveGateway',
  'bpmn:SequenceFlow',
  'bpmn:Process',
  'bpmn:Definitions',
  'label',
]);

export class BpmnCanvasValidator {
  validate(modeler: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const elementRegistry = modeler.get('elementRegistry');
    const elements = elementRegistry.getAll();

    // Separate by type
    const startEvents  = elements.filter((el: any) => el.type === 'bpmn:StartEvent');
    const endEvents    = elements.filter((el: any) => el.type === 'bpmn:EndEvent');
    const serviceTasks = elements.filter((el: any) => el.type === 'bpmn:ServiceTask');
    const gateways     = elements.filter((el: any) => el.type === 'bpmn:ExclusiveGateway');
    const flows        = elements.filter((el: any) => el.type === 'bpmn:SequenceFlow');
    const shapes       = elements.filter((el: any) =>
      el.type !== 'bpmn:SequenceFlow' &&
      el.type !== 'label' &&
      el.type !== 'bpmn:Process' &&
      el.type !== '__implicitroot'
    );

    // ── Rule 1: Exactly one Start Event ─────────────────────────────────────
    if (startEvents.length === 0) {
      errors.push({
        elementId: null, elementName: null,
        rule: 'MISSING_START_EVENT',
        message: 'Workflow must have exactly one Start Event.',
        severity: 'error',
      });
    } else if (startEvents.length > 1) {
      errors.push({
        elementId: null, elementName: null,
        rule: 'MULTIPLE_START_EVENTS',
        message: `Found ${startEvents.length} Start Events. Only one is allowed.`,
        severity: 'error',
      });
    }

    // ── Rule 2: At least one End Event ──────────────────────────────────────
    if (endEvents.length === 0) {
      errors.push({
        elementId: null, elementName: null,
        rule: 'MISSING_END_EVENT',
        message: 'Workflow must have at least one End Event.',
        severity: 'error',
      });
    }

    // ── Rule 3: No unsupported element types ─────────────────────────────────
    for (const el of shapes) {
      if (!SUPPORTED_TYPES.has(el.type)) {
        errors.push({
          elementId: el.id,
          elementName: el.businessObject?.name || null,
          rule: 'UNSUPPORTED_ELEMENT',
          message: `Element type "${el.type}" is not supported. Remove it.`,
          severity: 'error',
        });
      }
    }

    // ── Rule 4: No disconnected elements ────────────────────────────────────
    for (const shape of shapes) {
      if (shape.type === 'bpmn:StartEvent') continue;
      if (shape.type === 'bpmn:EndEvent')   continue;

      const hasIncoming = shape.incoming && shape.incoming.length > 0;
      const hasOutgoing = shape.outgoing && shape.outgoing.length > 0;

      if (!hasIncoming) {
        errors.push({
          elementId: shape.id,
          elementName: shape.businessObject?.name || shape.id,
          rule: 'DISCONNECTED_INCOMING',
          message: `"${shape.businessObject?.name || shape.id}" has no incoming connection.`,
          severity: 'error',
        });
      }
      if (!hasOutgoing) {
        errors.push({
          elementId: shape.id,
          elementName: shape.businessObject?.name || shape.id,
          rule: 'DISCONNECTED_OUTGOING',
          message: `"${shape.businessObject?.name || shape.id}" has no outgoing connection.`,
          severity: 'error',
        });
      }
    }

    // ── Rule 5: Start Event connectivity ────────────────────────────────────
    for (const el of startEvents) {
      if (el.incoming && el.incoming.length > 0) {
        errors.push({
          elementId: el.id, elementName: 'Start Event',
          rule: 'START_HAS_INCOMING',
          message: 'Start Event cannot have incoming connections.',
          severity: 'error',
        });
      }
      if (!el.outgoing || el.outgoing.length === 0) {
        errors.push({
          elementId: el.id, elementName: 'Start Event',
          rule: 'START_NOT_CONNECTED',
          message: 'Start Event has no outgoing connection.',
          severity: 'error',
        });
      }
    }

    // ── Rule 6: End Event connectivity ──────────────────────────────────────
    for (const el of endEvents) {
      if (el.outgoing && el.outgoing.length > 0) {
        errors.push({
          elementId: el.id, elementName: 'End Event',
          rule: 'END_HAS_OUTGOING',
          message: 'End Event cannot have outgoing connections.',
          severity: 'error',
        });
      }
      if (!el.incoming || el.incoming.length === 0) {
        errors.push({
          elementId: el.id, elementName: 'End Event',
          rule: 'END_NOT_CONNECTED',
          message: 'End Event has no incoming connection.',
          severity: 'error',
        });
      }
    }

    // ── Rule 7: Service Tasks must have a handler name ───────────────────────
    for (const task of serviceTasks) {
      const name = task.businessObject?.name?.trim();
      if (!name) {
        errors.push({
          elementId: task.id, elementName: null,
          rule: 'SERVICE_TASK_NO_NAME',
          message: `A Service Task (${task.id}) has no handler name set. Select a handler in the properties panel.`,
          severity: 'error',
        });
      }
    }

    // ── Rule 8 (NEW): ServiceTask outgoing must connect to ExclusiveGateway ──
    for (const task of serviceTasks) {
      const outgoing: any[] = task.outgoing || [];

      // Must have exactly 1 outgoing
      if (outgoing.length > 1) {
        errors.push({
          elementId: task.id,
          elementName: task.businessObject?.name || task.id,
          rule: 'SERVICE_TASK_TOO_MANY_OUTGOING',
          message: `Service Task "${task.businessObject?.name || task.id}" has ${outgoing.length} outgoing connections. Only 1 is allowed.`,
          severity: 'error',
        });
      }

      // Outgoing target must be an ExclusiveGateway
      for (const flow of outgoing) {
        const target = flow.target;
        if (!target) continue;
        if (target.type !== 'bpmn:ExclusiveGateway') {
          errors.push({
            elementId: task.id,
            elementName: task.businessObject?.name || task.id,
            rule: 'SERVICE_TASK_INVALID_TARGET',
            message: `Service Task "${task.businessObject?.name || task.id}" must connect to an Exclusive Gateway. ` +
                     `Currently connected to "${target.businessObject?.name || target.type?.replace('bpmn:', '') || target.id}".`,
            severity: 'error',
          });
        }
      }
    }

    // ── Rule 9 (NEW): ExclusiveGateway must have exactly 2 outgoing flows ────
    for (const gw of gateways) {
      const outgoing: any[] = gw.outgoing || [];

      if (outgoing.length !== 2) {
        errors.push({
          elementId: gw.id,
          elementName: gw.businessObject?.name || gw.id,
          rule: 'GATEWAY_WRONG_OUTGOING_COUNT',
          message: `Gateway "${gw.businessObject?.name || gw.id}" has ${outgoing.length} outgoing flow(s). ` +
                   `Exactly 2 are required (one for each condition branch).`,
          severity: 'error',
        });
      }

      // ── Rule 10 (existing): all outgoing flows must have conditionExpression
      for (const flow of outgoing) {
        const condition = flow.businessObject?.conditionExpression?.body?.trim();
        if (!condition) {
          errors.push({
            elementId: flow.id,
            elementName: flow.businessObject?.name || flow.id,
            rule: 'MISSING_CONDITION',
            message: `Sequence flow from gateway "${gw.businessObject?.name || gw.id}" is missing a condition expression. ` +
                     `Click the flow and set its condition in the properties panel.`,
            severity: 'error',
          });
        }
      }
    }

    // ── Warning: Empty canvas ────────────────────────────────────────────────
    if (shapes.length === 0) {
      errors.push({
        elementId: null, elementName: null,
        rule: 'EMPTY_DIAGRAM',
        message: 'The diagram is empty. Add at least a Start Event, Service Task, and End Event.',
        severity: 'error',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}


