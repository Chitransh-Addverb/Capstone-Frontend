import { environment } from '../../../environments/environment';

export const API_BASE = environment.apiBase;

export const API_ENDPOINTS = {
  workflow: {
    deploy:     `${API_BASE}/workflow/deploy`,
    activate:   `${API_BASE}/workflow/activate`,
    deactivate: `${API_BASE}/workflow/deactivate`,
    list:       `${API_BASE}/workflow/list`,
    getById:    (id: string) => `${API_BASE}/workflow/${id}`,
    delete:     (id: string) => `${API_BASE}/workflow/${id}`,
  },
  scanner: {
    list:       `${API_BASE}/scanner/list`,
    create:     `${API_BASE}/scanner/create`,
    update:     (id: string) => `${API_BASE}/scanner/${id}`,
    delete:     (id: string) => `${API_BASE}/scanner/${id}`,
    event:      `${API_BASE}/scanner/event`,
  },
  instance: {
    list:       `${API_BASE}/instances`,
    getById:    (id: string) => `${API_BASE}/instances/${id}`,
  },
} as const;




