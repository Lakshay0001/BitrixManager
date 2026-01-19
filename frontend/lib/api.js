// frontend/lib/api.js
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

export const buildUrl = (path, params = {}) => {
  // Ensure path always starts with /
  const fullPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${API_BASE}${fullPath}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.append(key, value);
    }
  });
  return url.toString();
};
