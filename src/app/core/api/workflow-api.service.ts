import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { API_ENDPOINTS } from './api.config';

/* ── Request DTOs ── */
export interface DeployWorkflowRequest {
  workflow_key: string;
  bpmn_xml: string;
  description: string;
}

export interface SetActiveRequest {
  is_active: boolean;
}

/* ── Response DTOs ── */
export interface WorkflowDefinitionDto {
  workflow_key: string;
  version: number;
  is_active: boolean;
  description?: string;
  bpmn_xml?: string;         // only returned by getByKeyVersion
  created_at: string;
  updated_at?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class WorkflowApiService {
  private http = inject(HttpClient);

  /** POST /api/v1/workflows — deploy new version (returns inactive by default) */
  deploy(payload: DeployWorkflowRequest): Observable<ApiResponse<WorkflowDefinitionDto>> {
    return this.http.post<ApiResponse<WorkflowDefinitionDto>>(
      API_ENDPOINTS.workflow.deploy,
      payload,
    );
  }

  /**
   * GET /api/v1/workflows?workflowKey={key}
   * Returns all versions for a given key (bpmn_xml excluded — lightweight).
   */
  listVersionsByKey(workflowKey: string): Observable<WorkflowDefinitionDto[]> {
    return this.http
      .get<ApiResponse<WorkflowDefinitionDto[]>>(API_ENDPOINTS.workflow.listByKey(workflowKey))
      .pipe(map(r => r.data));
  }

  /**
   * GET /api/v1/workflows/all
   * Returns latest version per workflow key (for the definitions table).
   * If backend doesn't have this endpoint, caller can aggregate from listVersionsByKey.
   */
  listAll(): Observable<WorkflowDefinitionDto[]> {
    return this.http
      .get<ApiResponse<WorkflowDefinitionDto[]>>(API_ENDPOINTS.workflow.listAll)
      .pipe(map(r => r.data));
  }

  /**
   * GET /api/v1/workflows/{workflowKey}/versions/{version}
   * Returns full DTO including bpmn_xml — used when loading editor for edit.
   */
  getByKeyAndVersion(key: string, version: number): Observable<WorkflowDefinitionDto> {
    return this.http
      .get<ApiResponse<WorkflowDefinitionDto>>(API_ENDPOINTS.workflow.getByKeyVersion(key, version))
      .pipe(map(r => r.data));
  }

  /** PATCH /api/v1/workflows/{key}/versions/{version}:setActive */
  setActive(key: string, version: number, isActive: boolean): Observable<WorkflowDefinitionDto> {
    return this.http
      .patch<ApiResponse<WorkflowDefinitionDto>>(
        API_ENDPOINTS.workflow.setActive(key, version),
        { is_active: isActive } satisfies SetActiveRequest,
      )
      .pipe(map(r => r.data));
  }

  /** DELETE /api/v1/workflows/{key}/versions/{version} */
  delete(key: string, version: number): Observable<void> {
    return this.http
      .delete<ApiResponse<void>>(API_ENDPOINTS.workflow.delete(key, version))
      .pipe(map(() => undefined));
  }
}
