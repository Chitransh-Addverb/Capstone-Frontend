/**
 * BpmnXmlTransformer
 *
 * Bidirectional transform between:
 *
 *  CANVAS XML (simple, no gateway):
 *    bpmn:Task with 2 direct conditioned outgoing flows
 *
 *  BACKEND XML (full, with gateway):
 *    bpmn:Task → bpmn:exclusiveGateway → [flow1, flow2]
 *    matching exactly the format the backend process-tree parser expects
 *
 * The backend XML format (from the working reference):
 *   <bpmn:Task id="..." name="...">
 *     <bpmn:incoming>...</bpmn:incoming>
 *     <bpmn:outgoing>Flow_internal_...</bpmn:outgoing>
 *   </bpmn:Task>
 *   <bpmn:exclusiveGateway id="Gateway_..." name="... Result">
 *     <bpmn:incoming>Flow_internal_...</bpmn:incoming>
 *     <bpmn:outgoing>Flow_xxx</bpmn:outgoing>
 *     <bpmn:outgoing>Flow_yyy</bpmn:outgoing>
 *   </bpmn:exclusiveGateway>
 *   <bpmn:sequenceFlow id="Flow_internal_..." sourceRef="taskId" targetRef="gatewayId"/>
 *   <bpmn:sequenceFlow id="Flow_xxx" name="Pass" sourceRef="gatewayId" targetRef="...">
 *     <bpmn:conditionExpression ...>var == true</bpmn:conditionExpression>
 *   </bpmn:sequenceFlow>
 */
export class BpmnXmlTransformer {

  /**
   * Canvas XML → Backend XML
   * Inserts Task + exclusiveGateway pairs for every Task that has
   * conditioned outgoing flows, producing XML the backend can parse unchanged.
   */
  static toBackendXml(canvasXml: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(canvasXml, 'application/xml');

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      console.error('BpmnXmlTransformer: parse error', parseError.textContent);
      return canvasXml;
    }

    const process = this.findElement(doc, ['bpmn:process', 'process']);
    const bpmnPlane = this.findElement(doc, ['bpmndi:BPMNPlane', 'BPMNPlane']);

    if (!process || !bpmnPlane) return canvasXml;

    // Collect all Tasks that have at least one conditioned outgoing flow
    const tasks = Array.from(process.children).filter(el =>
      el.localName === 'task' || el.localName === 'Task'
    );

    let gwCounter = 1;

    for (const task of tasks) {
      const taskId = task.getAttribute('id') || '';

      // Find conditioned outgoing flow IDs from this task
      const outgoingIds = Array.from(task.children)
        .filter(c => c.localName === 'outgoing')
        .map(c => c.textContent?.trim() || '');

      // Get the actual flow elements
      const allFlows = Array.from(process.children).filter(el =>
        el.localName === 'sequenceFlow'
      );

      const conditionedFlows = outgoingIds
        .map(id => allFlows.find(f => f.getAttribute('id') === id))
        .filter((f): f is Element => {
          if (!f) return false;
          return Array.from(f.children).some(c => c.localName === 'conditionExpression');
        });

      if (conditionedFlows.length === 0) continue;

      // ── Build the gateway and internal flow ───────────────────────────────

      const gwId = `Gateway_${taskId}_${gwCounter++}`;
      const internalFlowId = `Flow_internal_${taskId}`;

      // 1. Rename task element: task → Task (keep all attributes & children)
      //    We do this by changing the tag. Since DOM doesn't allow tag rename,
      //    we create a new element and copy everything over.
      const bpmnNS = task.namespaceURI || 'http://www.omg.org/spec/BPMN/20100524/MODEL';
      const prefix = task.prefix || 'bpmn';

      const Task = doc.createElementNS(bpmnNS, `${prefix}:Task`);
      Array.from(task.attributes).forEach(attr =>
        Task.setAttribute(attr.name, attr.value)
      );

      // Copy all children except the conditioned outgoing elements
      // (those will move to the gateway)
      const conditionedFlowIds = new Set(conditionedFlows.map(f => f.getAttribute('id')));

      Array.from(task.children).forEach(child => {
        if (child.localName === 'outgoing' && conditionedFlowIds.has(child.textContent?.trim() || '')) {
          // Skip — these outgoing refs move to the gateway
          return;
        }
        Task.appendChild(child.cloneNode(true));
      });

      // Add the internal flow as the new outgoing for the Task
      const stOutgoing = doc.createElementNS(bpmnNS, `${prefix}:outgoing`);
      stOutgoing.textContent = internalFlowId;
      Task.appendChild(stOutgoing);

      // 2. Create exclusiveGateway element
      const gateway = doc.createElementNS(bpmnNS, `${prefix}:exclusiveGateway`);
      gateway.setAttribute('id', gwId);
      gateway.setAttribute('name', `${task.getAttribute('name') || ''} Result`);

      const gwIncoming = doc.createElementNS(bpmnNS, `${prefix}:incoming`);
      gwIncoming.textContent = internalFlowId;
      gateway.appendChild(gwIncoming);

      conditionedFlows.forEach(flow => {
        const gwOut = doc.createElementNS(bpmnNS, `${prefix}:outgoing`);
        gwOut.textContent = flow.getAttribute('id') || '';
        gateway.appendChild(gwOut);
      });

      // 3. Create the internal sequenceFlow: Task → gateway
      const internalFlow = doc.createElementNS(bpmnNS, `${prefix}:sequenceFlow`);
      internalFlow.setAttribute('id', internalFlowId);
      internalFlow.setAttribute('sourceRef', taskId);
      internalFlow.setAttribute('targetRef', gwId);

      // 4. Update conditioned flows: change sourceRef from taskId → gwId
      conditionedFlows.forEach(flow => {
        flow.setAttribute('sourceRef', gwId);
      });

      // 5. Replace original task with Task in process
      process.replaceChild(Task, task);

      // 6. Insert gateway immediately after Task
      const afterTask = Task.nextSibling;
      process.insertBefore(gateway, afterTask);

      // 7. Insert internal flow immediately after gateway
      const afterGateway = gateway.nextSibling;
      process.insertBefore(internalFlow, afterGateway);

      // 8. Add gateway BPMNShape to diagram section
      //    Find task shape by scanning all children (querySelector with attributes
      //    can be unreliable in XML DOMs across browsers)
      const taskShape = Array.from(bpmnPlane.children).find(
        el => el.getAttribute('bpmnElement') === taskId
      );
      if (taskShape) {
        const bounds = Array.from(taskShape.children).find(
          el => el.localName === 'Bounds'
        );
        const tx = parseFloat(bounds?.getAttribute('x') || '300');
        const ty = parseFloat(bounds?.getAttribute('y') || '100');
        const tw = parseFloat(bounds?.getAttribute('width') || '100');
        const th = parseFloat(bounds?.getAttribute('height') || '80');

        const diNS = bpmnPlane.namespaceURI || 'http://www.omg.org/spec/BPMN/20100524/DI';
        const dcNS = 'http://www.omg.org/spec/DD/20100524/DC';
        const diPrefix = bpmnPlane.prefix || 'bpmndi';

        // Gateway shape
        const gwShape = doc.createElementNS(diNS, `${diPrefix}:BPMNShape`);
        gwShape.setAttribute('id', `${gwId}_di`);
        gwShape.setAttribute('bpmnElement', gwId);
        gwShape.setAttribute('isMarkerVisible', 'true');

        const gwBounds = doc.createElementNS(dcNS, 'dc:Bounds');
        // Place gateway right of the task, vertically centred
        gwBounds.setAttribute('x', String(tx + tw + 30));
        gwBounds.setAttribute('y', String(ty + th / 2 - 25));
        gwBounds.setAttribute('width', '50');
        gwBounds.setAttribute('height', '50');
        gwShape.appendChild(gwBounds);
        bpmnPlane.appendChild(gwShape);

        // Internal flow edge (no waypoints needed — bpmn-js auto-routes)
        const gwEdge = doc.createElementNS(diNS, `${diPrefix}:BPMNEdge`);
        gwEdge.setAttribute('id', `${internalFlowId}_di`);
        gwEdge.setAttribute('bpmnElement', internalFlowId);
        bpmnPlane.appendChild(gwEdge);

        // Update conditioned flow edges: fix their waypoints to start from gateway
        conditionedFlows.forEach(flow => {
          const flowId = flow.getAttribute('id') || '';
          const flowEdge = Array.from(bpmnPlane.children).find(
            el => el.getAttribute('bpmnElement') === flowId
          );
          if (!flowEdge) return;

          // Update first waypoint to come from gateway centre
          const waypoints = Array.from(flowEdge.children).filter(
            el => el.localName === 'waypoint'
          );
          if (waypoints.length > 0) {
            const gwCentreX = tx + tw + 30 + 25;
            const gwCentreY = ty + th / 2;
            waypoints[0].setAttribute('x', String(Math.round(gwCentreX)));
            waypoints[0].setAttribute('y', String(Math.round(gwCentreY)));
          }
        });
      }
    }

    // Serialize back to string
    const serializer = new XMLSerializer();
    let result = serializer.serializeToString(doc);

    // Clean up: ensure XML declaration is present and clean
    if (!result.startsWith('<?xml')) {
      result = '<?xml version="1.0" encoding="UTF-8"?>\n' + result;
    }

    return result;
  }

  /**
   * Backend XML → Canvas XML
   * Collapses Task + exclusiveGateway pairs back into a single Task
   * so the canvas stays simple.
   */
  static toCanvasXml(backendXml: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(backendXml, 'application/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      console.error('BpmnXmlTransformer: parse error on load', parseError.textContent);
      return backendXml;
    }

    const process = this.findElement(doc, ['bpmn:process', 'process']);
    const bpmnPlane = this.findElement(doc, ['bpmndi:BPMNPlane', 'BPMNPlane']);

    if (!process || !bpmnPlane) return backendXml;

    const bpmnNS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';

    // Collect all exclusiveGateway IDs upfront — snapshot before mutation
    const gateways = Array.from(process.children).filter(el =>
      el.localName === 'exclusiveGateway'
    );

    // Track IDs to remove from diagram section
    const shapeIdsToRemove = new Set<string>();
    const edgeIdsToRemove  = new Set<string>();

    for (const gw of [...gateways]) {
      const gwId = gw.getAttribute('id') || '';

      // Get ALL incoming flow IDs to this gateway
      const incomingIds = Array.from(gw.children)
        .filter(c => c.localName === 'incoming')
        .map(c => c.textContent?.trim() || '');

      // Find which incoming flow comes from a Task — that's the internal flow
      let internalFlow: Element | undefined;
      let taskId = '';

      for (const fid of incomingIds) {
        const flow = Array.from(process.children).find(el =>
          el.localName === 'sequenceFlow' && el.getAttribute('id') === fid
        );
        if (!flow) continue;
        const srcId = flow.getAttribute('sourceRef') || '';
        const src = Array.from(process.children).find(el =>
          (el.localName === 'Task' || el.localName === 'task') &&
          el.getAttribute('id') === srcId
        );
        if (src) {
          internalFlow = flow;
          taskId = srcId;
          break;
        }
      }

      if (!internalFlow || !taskId) continue;

      const internalFlowId = internalFlow.getAttribute('id') || '';

      const Task = Array.from(process.children).find(el =>
        (el.localName === 'Task' || el.localName === 'task') &&
        el.getAttribute('id') === taskId
      );

      if (!Task) continue;

      // Gateway's outgoing conditioned flows
      const gwOutgoingIds = Array.from(gw.children)
        .filter(c => c.localName === 'outgoing')
        .map(c => c.textContent?.trim() || '');

      const gwFlows = gwOutgoingIds
        .map(id => Array.from(process.children).find(el =>
          el.localName === 'sequenceFlow' && el.getAttribute('id') === id
        ))
        .filter((f): f is Element => !!f);

      // Build plain bpmn:task replacing the Task
      const prefix = Task.prefix || 'bpmn';
      const task = doc.createElementNS(bpmnNS, `${prefix}:task`);

      Array.from(Task.attributes).forEach(attr =>
        task.setAttribute(attr.name, attr.value)
      );

      // Copy children except the internal outgoing ref
      Array.from(Task.children).forEach(child => {
        if (child.localName === 'outgoing' &&
            child.textContent?.trim() === internalFlowId) return;
        task.appendChild(child.cloneNode(true));
      });

      // Wire gateway's outgoing flows directly to the task
      gwFlows.forEach(flow => {
        flow.setAttribute('sourceRef', taskId);
        const outEl = doc.createElementNS(bpmnNS, `${prefix}:outgoing`);
        outEl.textContent = flow.getAttribute('id') || '';
        task.appendChild(outEl);
      });

      // Replace Task → task
      process.replaceChild(task, Task);

      // Remove gateway and internal flow from process
      try { process.removeChild(gw); } catch (_) {}
      try { process.removeChild(internalFlow); } catch (_) {}

      // Mark diagram elements for removal
      shapeIdsToRemove.add(gwId);
      edgeIdsToRemove.add(internalFlowId);

      // Fix waypoints: conditioned flow edges must start from task right-edge
      const taskShape = this.findShapeByElement(bpmnPlane, taskId);
      if (taskShape) {
        const bounds = Array.from(taskShape.children).find(
          el => el.localName === 'Bounds'
        );
        const tx = parseFloat(bounds?.getAttribute('x') || '300');
        const ty = parseFloat(bounds?.getAttribute('y') || '100');
        const tw = parseFloat(bounds?.getAttribute('width') || '100');
        const th = parseFloat(bounds?.getAttribute('height') || '80');

        const originX = Math.round(tx + tw);
        const originY = Math.round(ty + th / 2);

        gwFlows.forEach(flow => {
          const edge = this.findShapeByElement(bpmnPlane, flow.getAttribute('id') || '');
          if (!edge) return;
          const waypoints = Array.from(edge.children).filter(
            el => el.localName === 'waypoint'
          );
          if (waypoints.length > 0) {
            waypoints[0].setAttribute('x', String(originX));
            waypoints[0].setAttribute('y', String(originY));
          }
        });
      }
    }

    // Remove gateway shapes and internal flow edges from the diagram plane
    // Use deep search — they may not be direct children in all XML variants
    const allDiagramEls = Array.from(bpmnPlane.getElementsByTagName('*'));

    for (const el of allDiagramEls) {
      const bpmnEl = el.getAttribute('bpmnElement') || '';
      if (shapeIdsToRemove.has(bpmnEl) || edgeIdsToRemove.has(bpmnEl)) {
        try { el.parentNode?.removeChild(el); } catch (_) {}
      }
    }

    const serializer = new XMLSerializer();
    let result = serializer.serializeToString(doc);
    if (!result.startsWith('<?xml')) {
      result = '<?xml version="1.0" encoding="UTF-8"?>\n' + result;
    }
    return result;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Deep search for a BPMNShape/BPMNEdge by its bpmnElement attribute */
  private static findShapeByElement(plane: Element, bpmnElementId: string): Element | null {
    // Check direct children first (fast path)
    for (const child of Array.from(plane.children)) {
      if (child.getAttribute('bpmnElement') === bpmnElementId) return child;
    }
    // Fall back to deep search
    const all = plane.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      if (all[i].getAttribute('bpmnElement') === bpmnElementId) return all[i];
    }
    return null;
  }

  private static findElement(doc: Document, tagNames: string[]): Element | null {
    for (const tag of tagNames) {
      // Try direct getElementsByTagName first (works across all XML DOMs)
      const byTag = doc.getElementsByTagName(tag);
      if (byTag.length > 0) return byTag[0] as Element;
      // Also try local name scan on document element children
      const localName = tag.includes(':') ? tag.split(':')[1] : tag;
      const byLocal = doc.getElementsByTagName('*');
      for (let i = 0; i < byLocal.length; i++) {
        if (byLocal[i].localName === localName) return byLocal[i];
      }
    }
    return null;
  }
}