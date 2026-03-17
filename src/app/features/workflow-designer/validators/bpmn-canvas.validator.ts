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

    // ── Rule 8: ServiceTask outgoing must connect to ExclusiveGateway ────────
    for (const task of serviceTasks) {
      const outgoing: any[] = task.outgoing || [];

      if (outgoing.length > 1) {
        errors.push({
          elementId: task.id,
          elementName: task.businessObject?.name || task.id,
          rule: 'SERVICE_TASK_TOO_MANY_OUTGOING',
          message: `Service Task "${task.businessObject?.name || task.id}" has ${outgoing.length} outgoing connections. Only 1 is allowed.`,
          severity: 'error',
        });
      }

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

    // ── Rule 9: ExclusiveGateway must have exactly 2 outgoing flows ──────────
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

      // ── Rule 10: all outgoing flows must have conditionExpression ───────────
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

    // ── Rule 11: Every element must have a saved label ───────────────────────
    // End Events must have a Lane N label
    for (const el of endEvents) {
      const name = el.businessObject?.name?.trim();
      if (!name) {
        errors.push({
          elementId: el.id,
          elementName: 'End Event',
          rule: 'MISSING_LABEL',
          message: `An End Event (${el.id}) has no saved label. Open its properties and save a Lane label (e.g. "Lane 1").`,
          severity: 'error',
        });
      }
    }

    // Gateways must have a name
    for (const gw of gateways) {
      const name = gw.businessObject?.name?.trim();
      if (!name) {
        errors.push({
          elementId: gw.id,
          elementName: null,
          rule: 'MISSING_LABEL',
          message: `An Exclusive Gateway (${gw.id}) has no saved name. Open its properties and save a name.`,
          severity: 'error',
        });
      }
    }

    // Sequence flows must have a label saved
    for (const flow of flows) {
      const name = flow.businessObject?.name?.trim();
      // Gateway flows auto-label as "Success"/"Failure" — these are always set on save.
      // Plain flows require explicit "Flow N" label.
      // We check both: either the user saved a name, or it's a gateway flow with a condition
      // (which sets the label automatically).
      const fromGateway = flow.source?.type === 'bpmn:ExclusiveGateway';
      const hasCondition = !!flow.businessObject?.conditionExpression?.body?.trim();

      if (!name) {
        if (fromGateway && !hasCondition) {
          // Will already be caught by MISSING_CONDITION — skip duplicate
          continue;
        }
        if (!fromGateway) {
          errors.push({
            elementId: flow.id,
            elementName: null,
            rule: 'MISSING_LABEL',
            message: `A Sequence Flow (${flow.id}) has no saved label. Click the flow and save a label (e.g. "Flow 1").`,
            severity: 'error',
          });
        }
      }
    }

    // ── Rule 12: End Event labels must be unique ─────────────────────────────
    const endLabelsSeen = new Map<string, string>(); // label → first elementId
    for (const el of endEvents) {
      const name = el.businessObject?.name?.trim();
      if (!name) continue; // already caught by Rule 11
      const key = name.toLowerCase();
      if (endLabelsSeen.has(key)) {
        errors.push({
          elementId: el.id,
          elementName: name,
          rule: 'DUPLICATE_END_EVENT_LABEL',
          message: `Duplicate End Event label "${name}". Every End Event must have a unique lane label.`,
          severity: 'error',
        });
      } else {
        endLabelsSeen.set(key, el.id);
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




