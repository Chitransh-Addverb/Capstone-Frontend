export class RestrictedContextPadProvider {
  static $inject = ['contextPad', 'config.contextPadProvider'];

  constructor(contextPad: any) {
    // Priority 5000 runs AFTER bpmn-js's own ContextPadProvider (priority 1000)
    // so our deletions win
    contextPad.registerProvider(5000, this);
  }

  getContextPadEntries(_element: any): (entries: any) => any {
    return function removeUnsupportedEntries(entries: any) {

      // ── "Change element" wrench — bpmn-js registers this as 'replace'
      // Delete every possible key the library uses across versions
      delete entries['replace'];
      delete entries['replace-shape'];
      delete entries['morphing'];

      // Wildcard catch for any version-specific key name
      Object.keys(entries)
        .filter(k =>
          k.includes('replace') ||
          k.includes('morph')   ||
          k.includes('change')
        )
        .forEach(k => delete entries[k]);

      delete entries['append.intermediate-event'];
      delete entries['append.end-event'];
      delete entries['append.gateway'];
      delete entries['append.append-task'];

      // ── Remove auto-append shortcuts (keep only explicit palette drags)
      Object.keys(entries)
        .filter(k => 
          k.startsWith('append') ||
          k.includes('intermediate') ||
          k.includes('boundary')
        )
        .forEach(k => delete entries[k]);

      return entries;
    };
  }
}




