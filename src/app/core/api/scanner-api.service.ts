import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { API_ENDPOINTS } from './api.config';

export interface ScannerDto {
  scanner_id: string;
  status: boolean;
}

export interface ScannerConfigDto {
  scanner_plc_id: string;
  workflow_key: string;
  version: number;
  status: boolean;
  created_at: string;
}

export interface CreateScannerRequest {
  scanner_id: string;
}

export interface ActivateWorkflowRequest {
  workflow_key: string;
  version: number;
  activate: boolean;
}

export interface ActivateWorkflowResponse {
  scanner_id: string;
  workflow_key: string;
  version: number;
  is_active: boolean;
  message: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class ScannerApiService {
  private http = inject(HttpClient);

  /** GET /api/v1/scanners */
  listScanners(): Observable<ScannerDto[]> {
    return this.http
      .get<ApiResponse<ScannerDto[]>>(API_ENDPOINTS.scanner.list)
      .pipe(map(r => r.data));
  }

  /** GET /api/v1/scanners/{scannerId} */
  getScanner(scannerId: string): Observable<ScannerDto> {
    return this.http
      .get<ApiResponse<ScannerDto>>(API_ENDPOINTS.scanner.getById(scannerId))
      .pipe(map(r => r.data));
  }

  /** POST /api/v1/scanners — Register a new scanner */
  createScanner(payload: CreateScannerRequest): Observable<ScannerDto> {
    return this.http
      .post<ApiResponse<ScannerDto>>(API_ENDPOINTS.scanner.list, payload)
      .pipe(map(r => r.data));
  }

  /**
   * GET /api/v1/scanners/{scannerId}/config
   * Returns null if no active mapping exists (404 handled by caller via catchError).
   */
  getActiveConfig(scannerId: string): Observable<ScannerConfigDto | null> {
    return this.http
      .get<ApiResponse<ScannerConfigDto>>(API_ENDPOINTS.scanner.config(scannerId))
      .pipe(map(r => r.data ?? null));
  }

  /**
   * POST /api/v1/scanners/{scannerId}:activate
   * activate: true  → attach workflow to scanner
   * activate: false → detach workflow from scanner
   */
  activateWorkflow(
    scannerId: string,
    payload: ActivateWorkflowRequest,
  ): Observable<ActivateWorkflowResponse> {
    return this.http
      .post<ApiResponse<ActivateWorkflowResponse>>(
        API_ENDPOINTS.scanner.activate(scannerId),
        payload,
      )
      .pipe(map(r => r.data));
  }
}




