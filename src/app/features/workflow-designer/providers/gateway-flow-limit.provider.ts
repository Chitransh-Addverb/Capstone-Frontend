export class GatewayFlowLimitProvider {
  static $inject = ['eventBus'];

  constructor(eventBus: any) {
    // 'commandStack.connection.create.preExecute' fires before the command is committed
    // Using 'rules' evaluation via eventBus at 'connection.create' priority 1500
    eventBus.on('commandStack.connection.create.preExecute', 1500, (event: any) => {
      const context = event.context;
      const source = context?.connection?.source ?? context?.source;
      if (!source) return;

      if (source.type === 'bpmn:ExclusiveGateway') {
        const outgoingCount = (source.outgoing || []).length;
        if (outgoingCount >= 2) {
          // Stop the command from executing
          event.stopPropagation();
          event.preventDefault();
        }
      }
    });
  }
}


