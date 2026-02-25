import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from './api.config';

/* ── Request DTOs ── */
export interface DeployWorkflowRequest {
  workflowKey: string;
  bpmnXml: string;
  description: string;
}

export interface ActivateWorkflowRequest {
  workflowKey: string;
  version: number;
}

/* ── Response DTOs ── */
export interface WorkflowDefinitionDto {
  id: number;
  workflowKey: string;
  version: number;
  isActive: boolean;
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class WorkflowApiService {
  private http = inject(HttpClient);

  /** POST /api/workflow/deploy */
  deploy(payload: DeployWorkflowRequest): Observable<ApiResponse<WorkflowDefinitionDto>> {
    return this.http.post<ApiResponse<WorkflowDefinitionDto>>(
      API_ENDPOINTS.workflow.deploy,
      payload
    );
  }

  /** POST /api/workflow/activate */
  activate(payload: ActivateWorkflowRequest): Observable<ApiResponse<WorkflowDefinitionDto>> {
    return this.http.post<ApiResponse<WorkflowDefinitionDto>>(
      API_ENDPOINTS.workflow.activate,
      payload
    );
  }

  /** GET /api/workflow/list */
  list(): Observable<ApiResponse<WorkflowDefinitionDto[]>> {
    return this.http.get<ApiResponse<WorkflowDefinitionDto[]>>(
      API_ENDPOINTS.workflow.list
    );
  }

  /** GET /api/workflow/:id */
  getById(id: string): Observable<ApiResponse<WorkflowDefinitionDto>> {
    return this.http.get<ApiResponse<WorkflowDefinitionDto>>(
      API_ENDPOINTS.workflow.getById(id)
    );
  }

  /** DELETE /api/workflow/:id */
  delete(id: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(
      API_ENDPOINTS.workflow.delete(id)
    );
  }

  /** GET /api/workflow/instances */
  listInstances(): Observable<ApiResponse<any[]>> {
    return this.http.get<ApiResponse<any[]>>(
      API_ENDPOINTS.instance.list
    );
  }
}




