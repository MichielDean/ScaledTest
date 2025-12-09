// API client for Go backend authentication
// In production/K8s, use empty string so browser uses relative URLs via nginx proxy
// In development with `npm run dev`, Vite proxy handles the forwarding
const API_URL = import.meta.env.VITE_API_URL ?? "";

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  role: string;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
}

export interface AuthSession {
  access_token: string;
  expires_at: number;
  user: UserProfile;
}

class AuthAPI {
  private accessToken: string | null = null;
  private session: AuthSession | null = null;

  constructor() {
    // Load session from localStorage
    const storedSession = localStorage.getItem("auth_session");
    if (storedSession) {
      try {
        this.session = JSON.parse(storedSession);
        this.accessToken = this.session?.access_token || null;

        // Check if session is expired
        if (this.session && this.session.expires_at < Date.now()) {
          this.clearSession();
        }
      } catch {
        this.clearSession();
      }
    }
  }

  private saveSession(session: AuthSession) {
    this.session = session;
    this.accessToken = session.access_token;
    localStorage.setItem("auth_session", JSON.stringify(session));
  }

  private clearSession() {
    this.session = null;
    this.accessToken = null;
    localStorage.removeItem("auth_session");
  }

  async signUp(
    email: string,
    password: string,
    name?: string,
  ): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/api/v1/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: name || "" }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Sign up failed");
    }

    const data: AuthResponse = await response.json();

    this.saveSession({
      access_token: data.access_token,
      expires_at: Date.now() + data.expires_in * 1000,
      user: data.user,
    });

    return data;
  }

  async signIn(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Sign in failed");
    }

    const data: AuthResponse = await response.json();

    this.saveSession({
      access_token: data.access_token,
      expires_at: Date.now() + data.expires_in * 1000,
      user: data.user,
    });

    return data;
  }

  async signOut(): Promise<void> {
    if (this.accessToken) {
      try {
        await fetch(`${API_URL}/api/v1/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        });
      } catch (error) {
        console.error("Logout request failed:", error);
      }
    }
    this.clearSession();
  }

  async getCurrentUser(): Promise<UserProfile | null> {
    if (!this.accessToken) {
      return null;
    }

    try {
      const response = await fetch(`${API_URL}/api/v1/auth/user`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) {
        this.clearSession();
        return null;
      }

      const userData: UserProfile = await response.json();

      return userData;
    } catch (error) {
      console.error("Failed to get current user:", error);
      this.clearSession();
      return null;
    }
  }

  getSession(): AuthSession | null {
    // Check if session is expired
    if (this.session && this.session.expires_at < Date.now()) {
      this.clearSession();
      return null;
    }
    return this.session;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }
}

export const authAPI = new AuthAPI();
