export class BpmnDiffUtil {

  /**
   * Returns true if the two BPMN XMLs are functionally identical.
   * Returns false if they differ in handlers, connections, conditions, names, etc.
   *
   * Key fix: sequence flows are NOT re-sorted during canonicalization because
   * swapping Pass/Fail conditions changes the conditionExpression body — that
   * difference must be preserved for the comparison to detect it.
   */
  static isIdentical(xmlA: string, xmlB: string): boolean {
    try {
      const normA = BpmnDiffUtil.normalize(xmlA);
      const normB = BpmnDiffUtil.normalize(xmlB);
      return normA === normB;
    } catch (e) {
      console.warn('BpmnDiffUtil: parse error, assuming changed', e);
      return false;
    }
  }

  private static normalize(xml: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');

    // Remove BPMNDiagram section — layout only, not functional
    const diagramEls = doc.getElementsByTagNameNS(
      'http://www.omg.org/spec/BPMN/20100524/DI', 'BPMNDiagram'
    );
    Array.from(diagramEls).forEach(el => el.parentNode?.removeChild(el));

    const diagEls2 = doc.getElementsByTagName('bpmndi:BPMNDiagram');
    Array.from(diagEls2).forEach(el => el.parentNode?.removeChild(el));

    // Strip only position/layout/id attributes — keep everything functional
    BpmnDiffUtil.stripNode(doc.documentElement);

    // Canonicalize — but preserve sequence flow order (conditions depend on it)
    BpmnDiffUtil.canonicalize(doc.documentElement);

    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc)
      .replace(/\s+/g, ' ')
      .replace(/> </g, '><')
      .trim();
  }

  /**
   * Attributes to strip — only layout/identity, never functional content.
   * NOTE: sourceRef and targetRef are intentionally NOT stripped here.
   * Stripping them caused swapped Pass/Fail flows to look identical.
   */
  private static readonly STRIP_ATTRS = new Set([
    'id',                              // element IDs (structural, not semantic)
    'x', 'y', 'width', 'height',      // positions / dimensions
  ]);

  private static stripNode(el: Element): void {
    const attrsToRemove: string[] = [];
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      if (BpmnDiffUtil.STRIP_ATTRS.has(attr.localName)) {
        attrsToRemove.push(attr.name);
      }
    }
    attrsToRemove.forEach(a => el.removeAttribute(a));

    Array.from(el.children).forEach(child => BpmnDiffUtil.stripNode(child));
  }

  private static canonicalize(el: Element): void {
    // Sort attributes alphabetically for stable serialization
    const attrs = Array.from(el.attributes).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    attrs.forEach(attr => {
      el.removeAttributeNode(attr);
      el.setAttributeNode(attr);
    });

    const children = Array.from(el.children);

    // Sequence flows must NOT be re-sorted — their order encodes which
    // condition (Pass/Fail) goes to which target. Sorting would make
    // "swap Pass and Fail" look like no change.
    const isSequenceFlow = (c: Element) =>
      c.localName === 'sequenceFlow' || c.localName === 'SequenceFlow';

    // Split children into sortable and order-preserving groups
    const sortable    = children.filter(c => !isSequenceFlow(c));
    const flowsInOrder = children.filter(c => isSequenceFlow(c));

    // Sort non-flow elements by tag + name for stable comparison
    sortable.sort((a, b) => {
      const tagCmp = a.tagName.localeCompare(b.tagName);
      if (tagCmp !== 0) return tagCmp;
      const nameA = a.getAttribute('name') ?? '';
      const nameB = b.getAttribute('name') ?? '';
      return nameA.localeCompare(nameB);
    });

    // Re-append: sorted non-flows first, then flows in original order
    [...sortable, ...flowsInOrder].forEach(child => {
      el.appendChild(child);
      BpmnDiffUtil.canonicalize(child);
    });
  }
}