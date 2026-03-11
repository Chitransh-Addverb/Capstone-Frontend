import {
  HttpInterceptorFn, HttpRequest, HttpHandlerFn,
  HttpEvent, HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError, retry, timer } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

export const errorInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let message = 'An unexpected error occurred';

      switch (error.status) {
        case 0:
          message = 'Cannot connect to server';
          break;
        case 400:
          message = error.error?.message || 'Bad request';
          break;
        case 404:
          message = error.error?.message || 'Resource not found';
          break;
        case 409:
          message = error.error?.message || 'Conflict — resource already exists';
          break;
        case 500:
          message = 'Internal server error';
          break;
        default:
          message = error.error?.message || `Error ${error.status}`;
      }

      console.error(`[API Error] ${error.status} — ${message}`, error);

      return throwError(() => ({
        status: error.status,
        message,
        original: error,
      }));
    })
  );
};



