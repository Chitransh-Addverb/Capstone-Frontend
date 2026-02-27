import { environment } from '../../../environments/environment';

export const API_BASE = environment.apiBase;

export const API_ENDPOINTS = {
  workflow: {
    deploy:     `${API_BASE}/workflows`,
    setActive:  (workflowKey: string, version: number) => `${API_BASE}/workflows/${workflowKey}/versions/${version}:setActive`,
    deactivate: `${API_BASE}/workflows/deactivate`,
    list:       `${API_BASE}/workflows/list`,
    getById:    (id: string) => `${API_BASE}/workflows/${id}`,
    delete:     (id: string) => `${API_BASE}/workflows/${id}`,
  },
  scanner: {
    list:       `${API_BASE}/scanners`,
    create:     `${API_BASE}/scanner/create`,
    update:     (id: string) => `${API_BASE}/scanner/${id}`,
    delete:     (id: string) => `${API_BASE}/scanner/${id}`,
    event:      `${API_BASE}/scanner/event`,
    all:        `${API_BASE}/scanner/all`,
    getById:    (id: string) => `${API_BASE}/scanners/${id}`,
    activate:    (id: string) => `${API_BASE}/scanners/${id}:activate`,
    config:     (id: string) => `${API_BASE}/scanners/${id}/config`,
  },
  instance: {
    list:       `${API_BASE}/instances`,
    getById:    (id: string) => `${API_BASE}/instances/${id}`,
  },
} as const;





