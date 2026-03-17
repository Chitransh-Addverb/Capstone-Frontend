export class BpmnDiffUtil {

  /**
   * Returns true if the two BPMN XMLs are functionally identical.
   * Returns false if they differ in handlers, connections, conditions, names, etc.
   */
  static isIdentical(xmlA: string, xmlB: string): boolean {
    try {
      const normA = BpmnDiffUtil.normalize(xmlA);
      const normB = BpmnDiffUtil.normalize(xmlB);
      return normA === normB;
    } catch (e) {
      // If parsing fails, assume they differ (safe default: allow deploy)
      console.warn('BpmnDiffUtil: parse error, assuming changed', e);
      return false;
    }
  }

  private static normalize(xml: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');

    // Remove BPMNDiagram section (layout only)
    const diagramEls = doc.getElementsByTagNameNS('http://www.omg.org/spec/BPMN/20100524/DI', 'BPMNDiagram');
    Array.from(diagramEls).forEach(el => el.parentNode?.removeChild(el));

    // Also try without namespace prefix
    const diagEls2 = doc.getElementsByTagName('bpmndi:BPMNDiagram');
    Array.from(diagEls2).forEach(el => el.parentNode?.removeChild(el));

    // Strip IDs and layout attributes from all elements
    BpmnDiffUtil.stripNode(doc.documentElement);

    // Canonicalize (sort children and attributes) for stable comparison
    BpmnDiffUtil.canonicalize(doc.documentElement);

    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc)
      .replace(/\s+/g, ' ')   // collapse whitespace
      .replace(/> </g, '><')  // remove spaces between tags
      .trim();
  }

  private static readonly STRIP_ATTRS = new Set([
    'id', 'sourceRef', 'targetRef',   // IDs and references
    'x', 'y', 'width', 'height',      // positions / dimensions
    'waypoint',                        // flow routing points
  ]);

  private static stripNode(el: Element): void {
    // Remove ID-like and layout attributes
    const attrsToRemove: string[] = [];
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      const localName = attr.localName;
      if (BpmnDiffUtil.STRIP_ATTRS.has(localName)) {
        attrsToRemove.push(attr.name);
      }
    }
    attrsToRemove.forEach(a => el.removeAttribute(a));

    // Recurse into children
    Array.from(el.children).forEach(child => BpmnDiffUtil.stripNode(child));
  }

  private static canonicalize(el: Element): void {
    // Sort attributes alphabetically for stable serialization
    const attrs = Array.from(el.attributes).sort((a, b) => a.name.localeCompare(b.name));
    attrs.forEach(attr => {
      el.removeAttributeNode(attr);
      el.setAttributeNode(attr);
    });

    // Sort child elements by tagName + name attribute for stable comparison
    const children = Array.from(el.children);
    children.sort((a, b) => {
      const tagCmp = a.tagName.localeCompare(b.tagName);
      if (tagCmp !== 0) return tagCmp;
      const nameA = a.getAttribute('name') ?? '';
      const nameB = b.getAttribute('name') ?? '';
      return nameA.localeCompare(nameB);
    });

    children.forEach(child => {
      el.appendChild(child); // re-append in sorted order
      BpmnDiffUtil.canonicalize(child);
    });
  }
}
