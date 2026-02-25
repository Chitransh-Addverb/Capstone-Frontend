import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from './api.config';

/* ── DTOs ── */
export interface ScannerConfigRequest {
  scannerId: string;
  workflowKey: string;
  activeVersion: number;
}

export interface ScannerConfigResponse {
  id: string;
  scannerId: string;
  workflowKey: string;
  activeVersion: number;
}

export interface ScannerEventRequest {
  scannerId: string;
  payload: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class ScannerApiService {
  private http = inject(HttpClient);

  /** GET /api/scanner/list */
  list(): Observable<ScannerConfigResponse[]> {
    return this.http.get<ScannerConfigResponse[]>(
      API_ENDPOINTS.scanner.list
    );
  }

  /** POST /api/scanner/create */
  create(payload: ScannerConfigRequest): Observable<ScannerConfigResponse> {
    return this.http.post<ScannerConfigResponse>(
      API_ENDPOINTS.scanner.create,
      payload
    );
  }

  /** PUT /api/scanner/:id */
  update(id: string, payload: ScannerConfigRequest): Observable<ScannerConfigResponse> {
    return this.http.put<ScannerConfigResponse>(
      API_ENDPOINTS.scanner.update(id),
      payload
    );
  }

  /** DELETE /api/scanner/:id */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(
      API_ENDPOINTS.scanner.delete(id)
    );
  }

  /** POST /api/scanner/event */
  sendEvent(payload: ScannerEventRequest): Observable<unknown> {
    return this.http.post<unknown>(
      API_ENDPOINTS.scanner.event,
      payload
    );
  }
}



