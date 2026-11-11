import type { APIRequestContext, APIResponse } from '@playwright/test';

/** Request body for POST /api/customers (see docs/SPEC.md). */
export type CustomerInput = {
  fullName: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  /** ISO-2 country code, e.g. "DK" */
  country: string;
  email: string;
  isPep: boolean;
};

/**
 * Thin wrapper over the REST API. Every method returns the raw APIResponse
 * so tests can assert on status codes and bodies themselves.
 * URLs are relative; baseURL comes from playwright.config.ts.
 */
export class ApiClient {
  constructor(private readonly request: APIRequestContext) {}

  health(): Promise<APIResponse> {
    return this.request.get('/health');
  }

  createCustomer(body: CustomerInput): Promise<APIResponse> {
    return this.request.post('/api/customers', { data: body });
  }

  getCustomer(id: number | string): Promise<APIResponse> {
    return this.request.get(`/api/customers/${id}`);
  }

  screenCustomer(id: number | string): Promise<APIResponse> {
    return this.request.post(`/api/customers/${id}/screen`);
  }

  getScreenings(id: number | string): Promise<APIResponse> {
    return this.request.get(`/api/customers/${id}/screenings`);
  }
}
