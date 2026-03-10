import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { API_BASE } from '../api/api.config';

/* ── DTOs — mirror backend exactly ──────────────────────────── */

/**
 * variablesJson is @JsonRawValue on the backend — Spring serialises it as
 * a raw JSON object (not a string). Angular HttpClient parses it automatically,
 * so we type it as InstanceVariables | null (not string).
 */
export interface WorkflowInstanceDto {
  id:            number;
  definitionId:  number;
  status:        'ACTIVE' | 'COMPLETED' | 'FAILED';
  startedAt:     string;
  completedAt:   string | null;
  variablesJson: InstanceVariables | null;
}

/** Fields written by WorkflowExecutor into variablesJson */
export interface InstanceVariables {
  scanner_id?:    string;
  barcode?:       string;
  weight?:        number;
  length?:        number;
  width?:         number;
  height?:        number;
  executionPath?: string;   // "step1→step2→..."
  nextStep?:      string | null;   // name of next service task handler
  finalLane?:     string | null;   // EndEvent name on COMPLETED
  failReason?:    string | null;   // reason on FAILED
  [key: string]: unknown;
}

/** Matches ScanEventDto from ScanEventService.toDto() */
export interface ScanEventDto {
  id:               number;
  instance_id:      number;
  scanner_id:       string;
  barcode:          string;
  weight?:          number;
  length?:          number;
  width?:           number;
  height?:          number;
  workflow_key:     string;
  workflow_version: number;
  execution_status: string;
  lane_name?:       string;
  fail_reason?:     string;
  variables_json?:  string;
  execution_path?:  string;
  scanned_at:       string;
}

export interface PageResponse<T> {
  content:       T[];
  totalElements: number;
  totalPages:    number;
  number:        number;  // 0-based current page
  size:          number;
}

interface ApiResponse<T> {
  success: boolean;
  data:    T;
  message?: string;
}

/* ── Service ─────────────────────────────────────────────────── */
@Injectable({ providedIn: 'root' })
export class MonitoringApiService {

  private http = inject(HttpClient);

  /**
   * GET /api/v1/instances
   * GET /api/v1/instances?status=ACTIVE
   * All instances for the current tenant (instanceCode header added by TenantInterceptor).
   */
  listInstances(status?: string): Observable<WorkflowInstanceDto[]> {
    const url = status
      ? `${API_BASE}/instances?status=${status}`
      : `${API_BASE}/instances`;
    return this.http
      .get<ApiResponse<WorkflowInstanceDto[]>>(url)
      .pipe(map(r => r.data));
  }

  /**
   * GET /api/v1/instances/{id}
   * Fallback snapshot when SSE is unavailable.
   */
  getInstance(id: number): Observable<WorkflowInstanceDto> {
    return this.http
      .get<ApiResponse<WorkflowInstanceDto>>(`${API_BASE}/instances/${id}`)
      .pipe(map(r => r.data));
  }

  /**
   * GET /api/v1/scan-events
   * GET /api/v1/scan-events?scanner_id=SC1&page=0&size=20
   * Paginated audit log — newest first.
   */
  listScanEvents(
    page     = 0,
    size     = 20,
    scannerId?: string,
  ): Observable<PageResponse<ScanEventDto>> {
    let url = `${API_BASE}/scan-events?page=${page}&size=${size}`;
    if (scannerId) url += `&scanner_id=${encodeURIComponent(scannerId)}`;
    return this.http
      .get<ApiResponse<PageResponse<ScanEventDto>>>(url)
      .pipe(map(r => r.data));
  }

  /**
   * SSE stream for live tracking of one instance.
   *
   * EventSource doesn't support custom headers natively.
   * The instanceCode is injected via query param here so the backend
   * TenantInterceptor can read it as a fallback.
   *
   * NOTE: Update the backend TenantInterceptor to also read instanceCode
   * from query params for SSE routes — e.g.:
   *   String tenant = request.getHeader("instanceCode");
   *   if (tenant == null) tenant = request.getParameter("instanceCode");
   *
   * The tenant value is read from sessionStorage where the instance
   * selector stored it via InstanceService.
   */
  openSseStream(instanceId: number): EventSource {
    const tenant  = sessionStorage.getItem('instanceCode') ?? '';
    const url     = `${API_BASE}/instances/${instanceId}/stream`
                  + (tenant ? `?instanceCode=${encodeURIComponent(tenant)}` : '');
    return new EventSource(url);
  }
}




