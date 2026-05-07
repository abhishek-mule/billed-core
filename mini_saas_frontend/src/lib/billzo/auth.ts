const ACCESS_KEY = "accessToken";
const REFRESH_KEY = "refreshToken";
const USER_KEY = "userId";
const TENANT_KEY = "tenantId";
const IS_PAID_KEY = "isPaid";

let refreshInterval: NodeJS.Timeout | null = null;

export interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  tenantId: string | null;
  isPaid: boolean;
  isLoading: boolean;
}

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ACCESS_KEY);
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(REFRESH_KEY);
}

export async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    sessionStorage.setItem(ACCESS_KEY, data.accessToken);
    sessionStorage.setItem(REFRESH_KEY, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export function startTokenRefresh(intervalMs: number = 5 * 60 * 1000) {
  if (refreshInterval) return;
  refreshInterval = setInterval(async () => {
    const token = getAccessToken();
    if (token) {
      await refreshAccessToken();
    }
  }, intervalMs);
}

export function stopTokenRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

export function getAuthState(): AuthState {
  if (typeof window === "undefined") {
    return { isAuthenticated: false, userId: null, tenantId: null, isPaid: false, isLoading: true };
  }

  const accessToken = sessionStorage.getItem(ACCESS_KEY);
  const tenantId = localStorage.getItem(TENANT_KEY);
  const isPaid = localStorage.getItem(IS_PAID_KEY) === "true";

  return {
    isAuthenticated: !!accessToken && !!tenantId,
    userId: localStorage.getItem(USER_KEY),
    tenantId,
    isPaid,
    isLoading: false,
  };
}

export function logout() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TENANT_KEY);
  localStorage.removeItem(IS_PAID_KEY);
  stopTokenRefresh();
  window.location.href = "/login";
}

export function getHeaders(): HeadersInit {
  const token = getAccessToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}