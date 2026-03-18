import { environment } from '../../../environments/environment';

export const API_BASE = environment.apiBase;

export const API_ENDPOINTS = {
  auth: {
    login: 'mock/v1/auth/login',
  },
  workflow: {
    deploy:           `${API_BASE}/workflows`,
    listByKey:        (workflowKey: string) => `${API_BASE}/workflows?workflowKey=${workflowKey}`,
    listAll:          `${API_BASE}/workflows`,
    getByKeyVersion:  (key: string, version: number) => `${API_BASE}/workflows/${key}/versions/${version}`,
    setActive:        (key: string, version: number) => `${API_BASE}/workflows/${key}/versions/${version}:setActive`,
    delete:           (key: string, version: number) => `${API_BASE}/workflows/${key}/versions/${version}`,
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
    stream:    (id: number) => `${API_BASE}/instances/${id}/stream`,
  },
  scanEvents: {
    list:      `${API_BASE}/scan-events`,
  },
  dashboard: {
    summary: `${API_BASE}/dashboard/summary`,
  },
  tenants: {
    list: `${API_BASE}/tenants`,
  },
} as const;







