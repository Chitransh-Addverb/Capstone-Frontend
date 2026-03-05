import {
  HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent
} from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Sets base headers (Content-Type / Accept) for all backend requests.
 * The instanceCode / tenantId header is handled separately by tenantInterceptor.
 */
export const apiInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {

  if (!req.url.includes('localhost:8080') && !req.url.includes('172.19')) {
    return next(req);
  }

  return next(req.clone({
    setHeaders: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    withCredentials: false,
  }));
};



