export class RestrictedPaletteProvider {
  static $inject = ['palette', 'create', 'elementFactory', 'lassoTool', 'handTool'];

  private _create: any;
  private _elementFactory: any;
  private _lassoTool: any;
  private _handTool: any;

  constructor(
    palette: any,
    create: any,
    elementFactory: any,
    lassoTool: any,
    handTool: any
  ) {
    this._create = create;
    this._elementFactory = elementFactory;
    this._lassoTool = lassoTool;
    this._handTool = handTool;

    palette.registerProvider(this);
  }

  getPaletteEntries(_element: any): any {
    const create = this._create;
    const elementFactory = this._elementFactory;
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
        action: { dragstart: createShape, click: createShape },
      };
    }

    const allowedEntries: Record<string, any> = {
      'hand-tool': {
        group: 'tools',
        className: 'bpmn-icon-hand-tool',
        title: 'Move around the canvas',
        action: { click(_e: any) { handTool.activateHand(_e); } },
      },
      'lasso-tool': {
        group: 'tools',
        className: 'bpmn-icon-lasso-tool',
        title: 'Select multiple items',
        action: { click(_e: any) { lassoTool.activateSelection(_e); } },
      },
      'tool-separator': { group: 'tools', separator: true },

      'create.start-event': createAction(
        'bpmn:StartEvent', 'event',
        'bpmn-icon-start-event-none',
        'Trigger — where the workflow starts'
      ),
      'create.task': createAction(
        'bpmn:Task', 'activity',
        'bpmn-icon-task',
        'Check Step — runs a validation rule'
      ),
      'create.end-event': createAction(
        'bpmn:EndEvent', 'event',
        'bpmn-icon-end-event-none',
        'Endpoint — where the workflow finishes'
      ),
    };

    return function replaceEntries(_entries: any) {
      return allowedEntries;
    };
  }
}