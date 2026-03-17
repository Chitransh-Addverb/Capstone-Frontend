import { Injectable, signal, computed, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { WorkflowApiService, WorkflowDefinitionDto } from '../api/workflow-api.service';

/** Only 2 statuses now — no draft */
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

/**
 * In-memory store for workflow definitions fetched from backend.
 * No localStorage — source of truth is always the backend.
 * The definitions page calls loadAll() on init.
 * The designer calls getByKeyAndVersion() for edit loading.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowDefinitionService {
  private workflowApi = inject(WorkflowApiService);

  /** All versions across all workflow keys */
  private _definitions = signal<WorkflowDefinition[]>([]);

  /** Public read-only computed views */
  definitions = computed(() => this._definitions());

  /** One row per unique workflow_key — latest version */
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

  /** All versions for a given key, sorted newest first */
  getByKey(key: string): WorkflowDefinition[] {
    return this._definitions()
      .filter(d => d.workflow_key === key)
      .sort((a, b) => b.version - a.version);
  }

  getLatestByKey(key: string): WorkflowDefinition | undefined {
    return this.getByKey(key)[0];
  }

  /** Find by key+version (our composite ID since backend has no UUID) */
  getByKeyVersion(key: string, version: number): WorkflowDefinition | undefined {
    return this._definitions().find(
      d => d.workflow_key === key && d.version === version,
    );
  }

  // ── Backend fetch ─────────────────────────────────────────────────

  /**
   * Loads all workflow definitions from backend.
   * Maps backend DTO → internal WorkflowDefinition.
   * Called by the definitions page on init.
   */
  loadAll(): Observable<WorkflowDefinitionDto[]> {
    return this.workflowApi.listAll().pipe(
      tap(dtos => this._definitions.set(dtos.map(this.mapDto))),
    );
  }

  /**
   * Loads all versions for a specific key.
   * Used when expanding version history or when the definitions page
   * needs full version history for a key.
   */
  loadVersionsForKey(key: string): Observable<WorkflowDefinitionDto[]> {
    return this.workflowApi.listVersionsByKey(key).pipe(
      tap(dtos => {
        const mapped = dtos.map(this.mapDto);
        // Merge into store: replace all versions for this key
        this._definitions.update(current => [
          ...current.filter(d => d.workflow_key !== key),
          ...mapped,
        ]);
      }),
    );
  }

  // ── Mutations (all hit backend first) ────────────────────────────

  activate(key: string, version: number): Observable<WorkflowDefinitionDto> {
    return this.workflowApi.setActive(key, version, true).pipe(
      tap(dto => {
        // Mark this version active, all others for same key inactive
        this._definitions.update(list =>
          list.map(d => {
            if (d.workflow_key !== key) return d;
            return { ...d, status: d.version === version ? 'active' : 'inactive' };
          }),
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

  /**
   * Called after a successful deploy to insert the new version into the
   * in-memory store without a full reload.
   */
  addDeployed(dto: WorkflowDefinitionDto): void {
    this._definitions.update(list => [...list, this.mapDto(dto)]);
  }

  /**
   * Clears all in-memory workflow data.
   * Called on instance change so the next session starts fresh.
   */
  clearAll(): void {
    this._definitions.set([]);
  }

  // ── Mapper ────────────────────────────────────────────────────────

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
