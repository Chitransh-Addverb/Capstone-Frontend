import { Injectable, signal, computed } from '@angular/core';

export type WorkflowStatus = 'active' | 'inactive' | 'draft';

export interface WorkflowDefinition {
  id: string;
  workflowKey: string;
  description: string;
  version: number;
  status: WorkflowStatus;
  bpmnXml: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable({ providedIn: 'root' })
export class WorkflowDefinitionService {
  private readonly STORAGE_KEY = 'wos-workflow-definitions';

  private _definitions = signal<WorkflowDefinition[]>(this.loadFromStorage());

  // All versions of all workflows
  definitions = computed(() => this._definitions());

  // Only latest version per key
  latestVersions = computed(() => {
    const map = new Map<string, WorkflowDefinition>();
    for (const def of this._definitions()) {
      const existing = map.get(def.workflowKey);
      if (!existing || def.version > existing.version) {
        map.set(def.workflowKey, def);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  });

  getByKey(key: string): WorkflowDefinition[] {
    return this._definitions()
      .filter(d => d.workflowKey === key)
      .sort((a, b) => b.version - a.version);
  }

  getById(id: string): WorkflowDefinition | undefined {
    return this._definitions().find(d => d.id === id);
  }

  getLatestByKey(key: string): WorkflowDefinition | undefined {
    const versions = this.getByKey(key);
    return versions[0]; // already sorted desc
  }

  getNextVersion(key: string): number {
    const versions = this.getByKey(key);
    if (versions.length === 0) return 1;
    return Math.max(...versions.map(d => d.version)) + 1;
  }

  /**
   * Called after successful backend deploy.
   * Saves this version to frontend store.
   */
  saveVersion(data: {
    workflowKey: string;
    description: string;
    bpmnXml: string;
  }): WorkflowDefinition {
    const version = this.getNextVersion(data.workflowKey);

    const def: WorkflowDefinition = {
      id: `${data.workflowKey}-v${version}-${Date.now()}`,
      workflowKey: data.workflowKey,
      description: data.description,
      version,
      status: 'draft',
      bpmnXml: data.bpmnXml,
      createdAt: version === 1 ? new Date() : (this.getLatestByKey(data.workflowKey)?.createdAt ?? new Date()),
      updatedAt: new Date(),
    };

    this._definitions.update(list => [...list, def]);
    this.persist();
    return def;
  }

  activate(id: string): void {
    const def = this.getById(id);
    if (!def) return;
    this._definitions.update(list =>
      list.map(d => {
        if (d.workflowKey === def.workflowKey) {
          return { ...d, status: d.id === id ? 'active' : 'inactive' };
        }
        return d;
      })
    );
    this.persist();
  }

  deactivate(id: string): void {
    this._definitions.update(list =>
      list.map(d => d.id === id ? { ...d, status: 'inactive' } : d)
    );
    this.persist();
  }

  delete(id: string): void {
    this._definitions.update(list => list.filter(d => d.id !== id));
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._definitions()));
    } catch {}
  }

  private loadFromStorage(): WorkflowDefinition[] {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw).map((d: any) => ({
        ...d,
        createdAt: new Date(d.createdAt),
        updatedAt: new Date(d.updatedAt),
      }));
    } catch {
      return [];
    }
  }
}


