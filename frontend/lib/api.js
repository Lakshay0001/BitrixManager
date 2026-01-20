export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "/api";

export const buildUrl = (path, params = {}) => {
  const fullPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${API_BASE}${fullPath}`, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.append(key, value);
    }
  });
  return url.toString();
};
