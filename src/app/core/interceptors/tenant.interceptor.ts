import { inject } from '@angular/core';
import {
  HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { InstanceService } from '../services/instance.service';

/**
 * Injects the instanceCode header on every outgoing backend request.
 * Backend reads this header in TenantContext.require() and maps it to tenantId.
 *
 * Excluded endpoints (no tenant context available or required):
 *   - /api/v1/tenants  — public endpoint
 *   - /mock/v1/auth/login — pre-session login, no tenant yet
 */
export const tenantInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {

  const instanceService = inject(InstanceService);

  // Only apply to our backend
  if (!req.url.includes('localhost:8080') && !req.url.includes('172.19')) {
    return next(req);
  }

  // Public / pre-session endpoints — no tenant context required
  if (req.url.includes('/api/v1/tenants') || req.url.includes('/mock/v1/auth/login')) {
    return next(req);
  }

  const tenantId = instanceService.tenantId();
  if (!tenantId) {
    // Guard should have blocked navigation before any API call fires,
    // but if we ever get here without a session just pass through
    return next(req);
  }

  return next(req.clone({
    setHeaders: { 'instanceCode': tenantId },
  }));
};

