export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

const ACCESS_KEY = 'neurelix.access_token';
const REFRESH_KEY = 'neurelix.refresh_token';

export function getTokens(): AuthTokens | null {
  const accessToken = localStorage.getItem(ACCESS_KEY) || '';
  const refreshToken = localStorage.getItem(REFRESH_KEY) || '';
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export function setTokens(tokens: AuthTokens) {
  localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}


