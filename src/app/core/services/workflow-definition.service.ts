import { Injectable, signal, computed, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { WorkflowApiService, WorkflowDefinitionDto } from '../api/workflow-api.service';

export type WorkflowStatus = 'active' | 'inactive';

export interface WorkflowDefinition {
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
  private workflowApi = inject(WorkflowApiService);

  private _definitions = signal<WorkflowDefinition[]>([]);

  definitions = computed(() => this._definitions());

  /** One row per unique workflow_key — latest version only */
  latestVersions = computed(() => {
    const map = new Map<string, WorkflowDefinition>();
    for (const def of this._definitions()) {
      const existing = map.get(def.workflow_key);
      if (!existing || def.version > existing.version) {
        map.set(def.workflow_key, def);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
  });

  getByKey(key: string): WorkflowDefinition[] {
    return this._definitions()
      .filter(d => d.workflow_key === key)
      .sort((a, b) => b.version - a.version);
  }

  getLatestByKey(key: string): WorkflowDefinition | undefined {
    return this.getByKey(key)[0];
  }

  getByKeyVersion(key: string, version: number): WorkflowDefinition | undefined {
    return this._definitions().find(
      d => d.workflow_key === key && d.version === version,
    );
  }

  loadAll(): Observable<WorkflowDefinitionDto[]> {
    return this.workflowApi.listAll().pipe(
      tap(dtos => this._definitions.set(dtos.map(this.mapDto))),
    );
  }

  loadVersionsForKey(key: string): Observable<WorkflowDefinitionDto[]> {
    return this.workflowApi.listVersionsByKey(key).pipe(
      tap(dtos => {
        const mapped = dtos.map(this.mapDto);
        this._definitions.update(current => [
          ...current.filter(d => d.workflow_key !== key),
          ...mapped,
        ]);
      }),
    );
  }

  activate(key: string, version: number): Observable<WorkflowDefinitionDto> {
    return this.workflowApi.setActive(key, version, true).pipe(
      tap(() => {
        // Only update the specific version to active.
        // Multiple versions of the same workflow can be active simultaneously —
        // each can be mapped to a different scanner independently.
        this._definitions.update(list =>
          list.map(d =>
            d.workflow_key === key && d.version === version
              ? { ...d, status: 'active' }
              : d
          )
        );
      }),
    );
  }

  deactivate(key: string, version: number): Observable<WorkflowDefinitionDto> {
    return this.workflowApi.setActive(key, version, false).pipe(
      tap(() => {
        this._definitions.update(list =>
          list.map(d =>
            d.workflow_key === key && d.version === version
              ? { ...d, status: 'inactive' }
              : d,
          ),
        );
      }),
    );
  }

  delete(key: string, version: number): Observable<void> {
    return this.workflowApi.delete(key, version).pipe(
      tap(() => {
        this._definitions.update(list =>
          list.filter(d => !(d.workflow_key === key && d.version === version)),
        );
      }),
    );
  }

  addDeployed(dto: WorkflowDefinitionDto): void {
    this._definitions.update(list => [...list, this.mapDto(dto)]);
  }

  clearAll(): void {
    this._definitions.set([]);
  }

  private mapDto = (dto: WorkflowDefinitionDto): WorkflowDefinition => ({
    workflow_key: dto.workflow_key,
    description:  dto.description ?? '',
    version:      dto.version,
    status:       dto.is_active ? 'active' : 'inactive',
    bpmn_xml:     dto.bpmn_xml ?? '',
    createdAt:    new Date(dto.created_at),
    updatedAt:    new Date(dto.updated_at ?? dto.created_at),
  });
}