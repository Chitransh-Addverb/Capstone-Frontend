import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { InstanceService } from '../services/instance.service';

/**
 * Blocks all main app routes if no instance session is active.
 * Session is stored in sessionStorage → expires when the browser tab closes.
 * Redirects to /select-instance which has no guard.
 */
export const instanceGuard: CanActivateFn = (_route, _state) => {
  const instanceService = inject(InstanceService);
  const router = inject(Router);

  if (instanceService.isReady()) {
    return true;
  }

  return router.createUrlTree(['/select-instance']);
};
