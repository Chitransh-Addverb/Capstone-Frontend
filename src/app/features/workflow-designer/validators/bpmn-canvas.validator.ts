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
  'bpmn:Task',
  'bpmn:ExclusiveGateway', // still valid in XML / imported diagrams
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

    const startEvents = elements.filter((el: any) => el.type === 'bpmn:StartEvent');
    const endEvents   = elements.filter((el: any) => el.type === 'bpmn:EndEvent');
    const tasks       = elements.filter((el: any) => el.type === 'bpmn:Task');
    const flows       = elements.filter((el: any) => el.type === 'bpmn:SequenceFlow');
    const shapes      = elements.filter((el: any) =>
      el.type !== 'bpmn:SequenceFlow' &&
      el.type !== 'label' &&
      el.type !== 'bpmn:Process' &&
      el.type !== '__implicitroot'
    );

    // ── Rule 1: Exactly one Trigger ───────────────────────────────────────────
    if (startEvents.length === 0) {
      errors.push({
        elementId: null, elementName: null,
        rule: 'MISSING_START_EVENT',
        message: 'Your workflow has no Trigger. Add a Trigger (the circle shape) to show where it starts.',
        severity: 'error',
      });
    } else if (startEvents.length > 1) {
      errors.push({
        elementId: null, elementName: null,
        rule: 'MULTIPLE_START_EVENTS',
        message: `You have ${startEvents.length} Triggers. A workflow can only have one starting point. Remove the extra ones.`,
        severity: 'error',
      });
    }

    // ── Rule 2: At least one Endpoint ─────────────────────────────────────────
    if (endEvents.length === 0) {
      errors.push({
        elementId: null, elementName: null,
        rule: 'MISSING_END_EVENT',
        message: 'Your workflow has no Endpoint. Add at least one Endpoint (the thick circle) to show where it finishes.',
        severity: 'error',
      });
    }

    // ── Rule 3: No unsupported element types ──────────────────────────────────
    for (const el of shapes) {
      if (!SUPPORTED_TYPES.has(el.type)) {
        errors.push({
          elementId: el.id,
          elementName: el.businessObject?.name || null,
          rule: 'UNSUPPORTED_ELEMENT',
          message: `The element type "${el.type}" is not allowed in this designer. Please remove it.`,
          severity: 'error',
        });
      }
    }

    // ── Rule 4: No floating / unconnected elements ────────────────────────────
    for (const shape of shapes) {
      if (shape.type === 'bpmn:StartEvent') continue;
      if (shape.type === 'bpmn:EndEvent')   continue;
      if (shape.type === 'bpmn:ExclusiveGateway') continue; // auto-injected, skip

      const hasIncoming = shape.incoming && shape.incoming.length > 0;
      const hasOutgoing = shape.outgoing && shape.outgoing.length > 0;
      const friendlyName = shape.businessObject?.name?.trim() || shape.id;

      if (!hasIncoming) {
        errors.push({
          elementId: shape.id,
          elementName: friendlyName,
          rule: 'DISCONNECTED_INCOMING',
          message: `"${friendlyName}" has no incoming connection. Connect an arrow into it.`,
          severity: 'error',
        });
      }
      if (!hasOutgoing) {
        errors.push({
          elementId: shape.id,
          elementName: friendlyName,
          rule: 'DISCONNECTED_OUTGOING',
          message: `"${friendlyName}" has no outgoing connection. Connect an arrow out of it.`,
          severity: 'error',
        });
      }
    }

    // ── Rule 5: Trigger connectivity ──────────────────────────────────────────
    for (const el of startEvents) {
      if (el.incoming && el.incoming.length > 0) {
        errors.push({
          elementId: el.id, elementName: 'Trigger',
          rule: 'START_HAS_INCOMING',
          message: 'The Trigger cannot have arrows coming into it — it is the starting point.',
          severity: 'error',
        });
      }
      if (!el.outgoing || el.outgoing.length === 0) {
        errors.push({
          elementId: el.id, elementName: 'Trigger',
          rule: 'START_NOT_CONNECTED',
          message: 'The Trigger has no outgoing connection. Draw an arrow from it to the first Check Step.',
          severity: 'error',
        });
      }
    }

    // ── Rule 6: Endpoint connectivity ─────────────────────────────────────────
    for (const el of endEvents) {
      if (el.outgoing && el.outgoing.length > 0) {
        errors.push({
          elementId: el.id, elementName: 'Endpoint',
          rule: 'END_HAS_OUTGOING',
          message: 'An Endpoint cannot have outgoing connections — it is the finishing point.',
          severity: 'error',
        });
      }
      if (!el.incoming || el.incoming.length === 0) {
        errors.push({
          elementId: el.id, elementName: 'Endpoint',
          rule: 'END_NOT_CONNECTED',
          message: 'An Endpoint has no incoming connection. Connect a path to it.',
          severity: 'error',
        });
      }
    }

    // ── Rule 7: Tasks must have a handler chosen ──────────────────────────────
    for (const task of tasks) {
      const name = task.businessObject?.name?.trim();
      if (!name) {
        errors.push({
          elementId: task.id, elementName: null,
          rule: 'TASK_NO_HANDLER',
          message: `A Check Step (${task.id}) has no rule selected. Click it and choose a rule from the properties panel.`,
          severity: 'error',
        });
      }
    }

    // ── Rule 8: Tasks must have exactly 2 outgoing paths ─────────────────────
    for (const task of tasks) {
      const outgoing: any[] = task.outgoing || [];
      const name = task.businessObject?.name?.trim() || task.id;

      if (outgoing.length < 2) {
        errors.push({
          elementId: task.id,
          elementName: name,
          rule: 'TASK_NEEDS_TWO_PATHS',
          message: `Check Step "${name}" needs exactly 2 outgoing paths (one for Success, one for Failure). Currently has ${outgoing.length}.`,
          severity: 'error',
        });
      } else if (outgoing.length > 2) {
        errors.push({
          elementId: task.id,
          elementName: name,
          rule: 'TASK_TOO_MANY_PATHS',
          message: `Check Step "${name}" has ${outgoing.length} outgoing paths but only 2 are allowed. Delete the extra connection.`,
          severity: 'error',
        });
      }

      // Each outgoing flow must have a condition expression set
      for (const flow of outgoing) {
        const condition = flow.businessObject?.conditionExpression?.body?.trim();
        if (!condition) {
          errors.push({
            elementId: flow.id,
            elementName: flow.businessObject?.name || flow.id,
            rule: 'MISSING_PATH_CONDITION',
            message: `A path from Check Step "${name}" has no Success/Failure label. Click the Check Step and set both paths in its properties.`,
            severity: 'error',
          });
        }
      }
    }

    // ── Rule 9: Endpoint labels must be set and unique ────────────────────────
    const endLabelsSeen = new Map<string, string>();
    for (const el of endEvents) {
      const name = el.businessObject?.name?.trim();
      if (!name) {
        errors.push({
          elementId: el.id,
          elementName: 'Endpoint',
          rule: 'MISSING_ENDPOINT_LABEL',
          message: `An Endpoint (${el.id}) has no lane name. Click it and give it a name like "Lane 1".`,
          severity: 'error',
        });
        continue;
      }
      const key = name.toLowerCase();
      if (endLabelsSeen.has(key)) {
        errors.push({
          elementId: el.id,
          elementName: name,
          rule: 'DUPLICATE_ENDPOINT_LABEL',
          message: `Two Endpoints share the name "${name}". Each Endpoint must have a unique lane name.`,
          severity: 'error',
        });
      } else {
        endLabelsSeen.set(key, el.id);
      }
    }

    // ── Rule 10: Gateway name check (for auto-injected gateways, skip) ────────
    // Gateways on the visual canvas that were explicitly placed by user
    const explicitGateways = elements.filter((el: any) =>
      el.type === 'bpmn:ExclusiveGateway' &&
      !(el.businessObject?.id || '').startsWith('__agw_')
    );
    for (const gw of explicitGateways) {
      const name = gw.businessObject?.name?.trim();
      if (!name) {
        errors.push({
          elementId: gw.id, elementName: null,
          rule: 'GATEWAY_NO_NAME',
          message: `A Gateway (${gw.id}) has no name. Open its properties and add a name.`,
          severity: 'error',
        });
      }
    }

    // ── Empty canvas ──────────────────────────────────────────────────────────
    if (shapes.length === 0) {
      errors.push({
        elementId: null, elementName: null,
        rule: 'EMPTY_DIAGRAM',
        message: 'The canvas is empty. Drag a Trigger, then a Check Step, then an Endpoint onto the canvas to build your workflow.',
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