// frontend/lib/api.js
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api/v1";

/**
 * Helper to build URL with query params
 * @param {string} path - endpoint path (e.g., '/get/single')
 * @param {Object} params - query parameters as key/value
 * @returns {string} full URL
 */
export const buildUrl = (path, params = {}) => {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.append(key, value);
    }
  });
  return url.toString();
};
