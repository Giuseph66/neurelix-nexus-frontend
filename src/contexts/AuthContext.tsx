import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { clearTokens, getTokens, setTokens } from "@/lib/authTokens";

interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
}

interface AuthContextType {
  user: AuthUser | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthResponse = {
  user: AuthUser;
  profile: Profile | null;
  tokens: { accessToken: string; refreshToken: string };
};

type MeResponse = {
  user: AuthUser;
  profile: Profile | null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const boot = async () => {
      try {
        const tokens = getTokens();
        if (!tokens) return;
        const me = await apiFetch<MeResponse>("/auth/me", { auth: true });
        setUser(me.user);
        setProfile(me.profile);
      } catch {
        // Try refresh once if we have tokens
        try {
          const tokens = getTokens();
          if (!tokens) return;
          const refreshed = await apiFetch<{ tokens: { accessToken: string; refreshToken: string } }>("/auth/refresh", {
            method: "POST",
            auth: false,
            body: { refreshToken: tokens.refreshToken },
          });
          setTokens(refreshed.tokens);
          const me = await apiFetch<MeResponse>("/auth/me", { auth: true });
          setUser(me.user);
          setProfile(me.profile);
        } catch {
          clearTokens();
          setUser(null);
          setProfile(null);
        }
      } finally {
      setLoading(false);
      }
    };

    void boot();
  }, []);

  async function signUp(email: string, password: string, fullName: string) {
    try {
      const data = await apiFetch<AuthResponse>("/auth/signup", {
        method: "POST",
        auth: false,
        body: { email, password, fullName },
    });
      setTokens(data.tokens);
      setUser(data.user);
      setProfile(data.profile);
      return { error: null };
    } catch (e) {
      return { error: e as Error };
    }
  }

  async function signIn(email: string, password: string) {
    try {
      const data = await apiFetch<AuthResponse>("/auth/login", {
        method: "POST",
        auth: false,
        body: { email, password },
    });
      setTokens(data.tokens);
      setUser(data.user);
      setProfile(data.profile);
      return { error: null };
    } catch (e) {
      return { error: e as Error };
    }
  }

  async function signOut() {
    clearTokens();
    setUser(null);
    setProfile(null);
  }

  const value = useMemo(
    () => ({
        user,
        profile,
        loading,
        signUp,
        signIn,
        signOut,
    }),
    [user, profile, loading]
  );

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
