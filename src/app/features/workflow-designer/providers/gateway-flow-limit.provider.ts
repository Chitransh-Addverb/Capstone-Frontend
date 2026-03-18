export class GatewayFlowLimitProvider {
  static $inject = ['eventBus'];

  constructor(eventBus: any) {

    // ── Layer 1: rules.canExecute ────────────────────────────────────────────
    eventBus.on('rules.canExecute', 5000, (event: any) => {
      if (event.rule !== 'connection.create') return;

      const context = event.context || {};
      const source  = context.source;
      const target  = context.target;
      if (!source || !target) return;

      // Task: outgoing must go to EndEvent or another Task only
      if (source.type === 'bpmn:Task') {
        const allowedTargets = ['bpmn:EndEvent', 'bpmn:Task'];
        if (!allowedTargets.includes(target.type)) {
          event.result = false;
          return;
        }
        // Task: max 2 outgoing
        if ((source.outgoing || []).length >= 2) {
          event.result = false;
          return;
        }
      }

      // Task: max 1 incoming
      if (target.type === 'bpmn:Task' && (target.incoming || []).length >= 1) {
        event.result = false;
        return;
      }

      // Block connecting directly to a hidden ExclusiveGateway
      if (target.type === 'bpmn:ExclusiveGateway' || source.type === 'bpmn:ExclusiveGateway') {
        event.result = false;
        return;
      }

      // StartEvent: max 1 outgoing
      if (source.type === 'bpmn:StartEvent' && (source.outgoing || []).length >= 1) {
        event.result = false;
        return;
      }
    });

    // ── Layer 2: preExecute ──────────────────────────────────────────────────
    eventBus.on('commandStack.connection.create.preExecute', 5000, (event: any) => {
      const context = event.context;
      const source  = context?.connection?.source ?? context?.source;
      const target  = context?.connection?.target ?? context?.target;
      if (!source || !target) return;

      if (source.type === 'bpmn:Task') {
        const allowedTargets = ['bpmn:EndEvent', 'bpmn:Task'];
        if (!allowedTargets.includes(target.type)) {
          event.stopPropagation(); event.preventDefault(); return;
        }
        if ((source.outgoing || []).length >= 2) {
          event.stopPropagation(); event.preventDefault(); return;
        }
      }

      if (target.type === 'bpmn:Task' && (target.incoming || []).length >= 1) {
        event.stopPropagation(); event.preventDefault(); return;
      }

      if (target.type === 'bpmn:ExclusiveGateway' || source.type === 'bpmn:ExclusiveGateway') {
        event.stopPropagation(); event.preventDefault(); return;
      }

      if (source.type === 'bpmn:StartEvent' && (source.outgoing || []).length >= 1) {
        event.stopPropagation(); event.preventDefault(); return;
      }
    });

    // ── Layer 3: postExecute rollback ────────────────────────────────────────
    eventBus.on('commandStack.connection.create.postExecute', 5000, (event: any) => {
      const context = event.context;
      const source  = context?.connection?.source;
      const target  = context?.connection?.target;
      if (!source || !target) return;

      let shouldRollback = false;

      if (source.type === 'bpmn:Task') {
        const allowedTargets = ['bpmn:EndEvent', 'bpmn:Task'];
        if (!allowedTargets.includes(target.type)) shouldRollback = true;
        if ((source.outgoing || []).length > 2) shouldRollback = true;
      }
      if (target.type === 'bpmn:Task' && (target.incoming || []).length > 1) shouldRollback = true;
      if (source.type === 'bpmn:StartEvent' && (source.outgoing || []).length > 1) shouldRollback = true;

      if (shouldRollback) {
        setTimeout(() => {
          try { eventBus.fire('commandStack.undo', {}); } catch (_) {}
        }, 0);
      }
    });
  }
}