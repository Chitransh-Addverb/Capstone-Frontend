export class GatewayFlowLimitProvider {
  static $inject = ['eventBus'];

  constructor(eventBus: any) {

    // ── Layer 1: rules.canExecute — fires while user is still dragging ────────
    // This is the ghost-arrow phase. Returning false here prevents the arrow
    // from snapping to the target at all.
    eventBus.on('rules.canExecute', 5000, (event: any) => {
      if (event.rule !== 'connection.create') return;

      const context = event.context || {};
      const source  = context.source;
      const target  = context.target;

      if (!source || !target) return;

      // ServiceTask: outgoing must go to ExclusiveGateway only
      if (source.type === 'bpmn:ServiceTask' && target.type !== 'bpmn:ExclusiveGateway') {
        event.result = false;
        return;
      }

      // ServiceTask: max 1 outgoing
      if (source.type === 'bpmn:ServiceTask' && (source.outgoing || []).length >= 1) {
        event.result = false;
        return;
      }

      // ServiceTask: max 1 incoming
      if (target.type === 'bpmn:ServiceTask' && (target.incoming || []).length >= 1) {
        event.result = false;
        return;
      }

      // ExclusiveGateway: max 2 outgoing
      if (source.type === 'bpmn:ExclusiveGateway' && (source.outgoing || []).length >= 2) {
        event.result = false;
        return;
      }
    });

    // ── Layer 2: preExecute — fires just before command is committed ──────────
    // Belt-and-suspenders. Catches anything that slipped past layer 1.
    eventBus.on('commandStack.connection.create.preExecute', 5000, (event: any) => {
      const context = event.context;
      const source  = context?.connection?.source ?? context?.source;
      const target  = context?.connection?.target ?? context?.target;

      if (!source || !target) return;

      if (source.type === 'bpmn:ServiceTask' && target.type !== 'bpmn:ExclusiveGateway') {
        event.stopPropagation();
        event.preventDefault();
        return;
      }

      if (source.type === 'bpmn:ServiceTask' && (source.outgoing || []).length >= 1) {
        event.stopPropagation();
        event.preventDefault();
        return;
      }

      if (target.type === 'bpmn:ServiceTask' && (target.incoming || []).length >= 1) {
        event.stopPropagation();
        event.preventDefault();
        return;
      }

      if (source.type === 'bpmn:ExclusiveGateway' && (source.outgoing || []).length >= 2) {
        event.stopPropagation();
        event.preventDefault();
        return;
      }
    });

    // ── Layer 3: postExecute rollback — absolute last resort ─────────────────
    // If somehow a connection was committed despite layers 1 & 2, undo it
    // immediately via the command stack.
    eventBus.on('commandStack.connection.create.postExecute', 5000, (event: any) => {
      const context = event.context;
      const source  = context?.connection?.source;
      const target  = context?.connection?.target;

      if (!source || !target) return;

      let shouldRollback = false;

      if (source.type === 'bpmn:ServiceTask' && target.type !== 'bpmn:ExclusiveGateway') {
        shouldRollback = true;
      }
      // After this event fires, outgoing already includes the new connection,
      // so we check > 1 (not >= 1) for ServiceTask and > 2 for gateway
      if (source.type === 'bpmn:ServiceTask' && (source.outgoing || []).length > 1) {
        shouldRollback = true;
      }
      if (target.type === 'bpmn:ServiceTask' && (target.incoming || []).length > 1) {
        shouldRollback = true;
      }
      if (source.type === 'bpmn:ExclusiveGateway' && (source.outgoing || []).length > 2) {
        shouldRollback = true;
      }

      if (shouldRollback) {
        // Use setTimeout to let the current command stack frame finish,
        // then undo the last action
        setTimeout(() => {
          try {
            eventBus.fire('commandStack.undo', {});
          } catch (_) {
            // If direct fire doesn't work, the canvas will show it on next action
          }
        }, 0);
      }
    });
  }
}


