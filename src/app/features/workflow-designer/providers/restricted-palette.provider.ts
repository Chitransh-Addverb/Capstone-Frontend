export class RestrictedPaletteProvider {
  static $inject = ['palette', 'create', 'elementFactory', 'spaceTool', 'lassoTool', 'handTool'];

  private _create: any;
  private _elementFactory: any;
  private _spaceTool: any;
  private _lassoTool: any;
  private _handTool: any;

  constructor(
    palette: any,
    create: any,
    elementFactory: any,
    spaceTool: any,
    lassoTool: any,
    handTool: any
  ) {
    this._create = create;
    this._elementFactory = elementFactory;
    this._spaceTool = spaceTool;
    this._lassoTool = lassoTool;
    this._handTool = handTool;

    // Register with priority 1500 to override the default provider (priority 1000)
    palette.registerProvider(this);
  }

  getPaletteEntries(_element: any): any {
    const create = this._create;
    const elementFactory = this._elementFactory;
    const spaceTool = this._spaceTool;
    const lassoTool = this._lassoTool;
    const handTool = this._handTool;

    function createAction(type: string, group: string, className: string, title: string, options?: any) {
      function createShape(event: any) {
        const shape = elementFactory.createShape({ type, ...options });
        create.start(event, shape);
      }
      return {
        group,
        className,
        title,
        action: {
          dragstart: createShape,
          click: createShape,
        },
      };
    }

    const allowedEntries: Record<string, any> =  {
      // ── Canvas tools ──────────────────────────────────────────────
      'hand-tool': {
        group: 'tools',
        className: 'bpmn-icon-hand-tool',
        title: 'Pan canvas',
        action: {
          click(_event: any) {
            handTool.activateHand(_event);
          },
        },
      },
      'lasso-tool': {
        group: 'tools',
        className: 'bpmn-icon-lasso-tool',
        title: 'Select area',
        action: {
          click(_event: any) {
            lassoTool.activateSelection(_event);
          },
        },
      },
      'space-tool': {
        group: 'tools',
        className: 'bpmn-icon-space-tool',
        title: 'Create/remove space',
        action: {
          click(_event: any) {
            spaceTool.activateSelection(_event);
          },
        },
      },

      // ── Separator ─────────────────────────────────────────────────
      'tool-separator': {
        group: 'tools',
        separator: true,
      },

      // ── Supported BPMN elements (MVP subset) ──────────────────────
      'create.start-event': createAction(
        'bpmn:StartEvent',
        'event',
        'bpmn-icon-start-event-none',
        'Start Event'
      ),

      'create.service-task': createAction(
        'bpmn:ServiceTask',
        'activity',
        'bpmn-icon-service-task',
        'Service Task'
      ),

      'create.exclusive-gateway': createAction(
        'bpmn:ExclusiveGateway',
        'gateway',
        'bpmn-icon-gateway-xor',
        'Exclusive Gateway'
      ),

      'create.end-event': createAction(
        'bpmn:EndEvent',
        'event',
        'bpmn-icon-end-event-none',
        'End Event'
      ),
    };

    return function replaceEntries(_entries: any) {
      return allowedEntries;
    };
  }
}





