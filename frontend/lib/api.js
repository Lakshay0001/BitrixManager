// frontend/lib/api.js
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

export const buildUrl = (path, params = {}) => {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.append(key, value);
    }
  });
  return url.toString();
};
