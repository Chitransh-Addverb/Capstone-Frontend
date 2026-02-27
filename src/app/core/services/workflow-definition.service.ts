import { Injectable, signal, computed, inject } from '@angular/core';
import { WorkflowApiService } from '../api/workflow-api.service';
import { Observable, tap } from 'rxjs';

export type WorkflowStatus = 'active' | 'inactive' | 'draft';

export interface WorkflowDefinition {
  id: string;
  workflow_key: string;
  description: string;
  version: number;
  status: WorkflowStatus;
  bpmn_xml: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable({ providedIn: 'root' })
export class WorkflowDefinitionService {
  private readonly STORAGE_KEY = 'wos-workflow-definitions';
  private workflowApi = inject(WorkflowApiService);
  private _definitions = signal<WorkflowDefinition[]>(this.loadFromStorage());

  // All versions of all workflows
  definitions = computed(() => this._definitions());

  // Only latest version per key
  latestVersions = computed(() => {
    const map = new Map<string, WorkflowDefinition>();
    for (const def of this._definitions()) {
      const existing = map.get(def.workflow_key);
      if (!existing || def.version > existing.version) {
        map.set(def.workflow_key, def);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  });

  getByKey(key: string): WorkflowDefinition[] {
    return this._definitions()
      .filter(d => d.workflow_key === key)
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
    workflow_key: string;
    description: string;
    bpmn_xml: string;
  }): WorkflowDefinition {
    const version = this.getNextVersion(data.workflow_key);

    const def: WorkflowDefinition = {
      id: `${data.workflow_key}-v${version}-${Date.now()}`,
      workflow_key: data.workflow_key,
      description: data.description,
      version,
      status: 'draft',
      bpmn_xml: data.bpmn_xml,
      createdAt: version === 1 ? new Date() : (this.getLatestByKey(data.workflow_key)?.createdAt ?? new Date()),
      updatedAt: new Date(),
    };

    this._definitions.update(list => [...list, def]);
    this.persist();
    return def;
  }

  // CORRECT — returns Observable, caller subscribes
  activate(id: string): Observable<any> | undefined {
    const def = this.getById(id);
    if (!def) return undefined;

    return this.workflowApi.setActive(def.workflow_key, def.version, true).pipe(
      tap(() => {
        this._definitions.update(list =>
          list.map(d => {
            if (d.workflow_key === def.workflow_key) {
              return { ...d, status: d.id === id ? 'active' : 'inactive' };
            }
            return d;
          })
        );
        this.persist();
      })
    );
  }

  deactivate(id: string): Observable<any> | undefined {
    const def = this.getById(id);
    if (!def) return undefined;

    return this.workflowApi.setActive(def.workflow_key, def.version, false).pipe(
      tap(() => {
        this._definitions.update(list =>
          list.map(d => d.id === id ? { ...d, status: 'inactive' } : d)
        );
        this.persist();
      })
    );
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


