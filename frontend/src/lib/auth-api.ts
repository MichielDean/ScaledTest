/**
 * Auth API using gRPC-Web transport
 *
 * This module provides authentication functions using the gRPC-Web client.
 * It wraps the generated proto types and handles session management.
 */

import { ConnectError } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import {
  getAuthClient,
  setAuthSession,
  clearAuthSession,
  getAccessToken,
  resetClients,
} from "./grpc-client";
import {
  type AuthResponse as ProtoAuthResponse,
  type UserResponse,
  type UserInfo,
  SignupRequestSchema,
  LoginRequestSchema,
  LogoutRequestSchema,
  GetCurrentUserRequestSchema,
} from "../gen/auth_pb";

// Re-export types that match the proto definitions for consistency
export type { UserResponse, UserInfo };

/**
 * User profile with converted timestamps
 */
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Auth response returned by sign up/sign in
 */
export interface AuthResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: UserProfile;
}

/**
 * Session data stored in memory/localStorage
 */
export interface AuthSession {
  accessToken: string;
  expiresAt: number;
  user: UserProfile;
}

/**
 * Convert proto UserInfo to UserProfile
 */
function userInfoToProfile(user: UserInfo): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: false, // UserInfo doesn't have this field
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Convert proto UserResponse to UserProfile
 */
function userResponseToProfile(user: UserResponse): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt ? timestampDate(user.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: user.updatedAt ? timestampDate(user.updatedAt).toISOString() : new Date().toISOString(),
  };
}

/**
 * Convert proto AuthResponse to our AuthResponse
 */
function convertAuthResponse(response: ProtoAuthResponse): AuthResponse {
  return {
    accessToken: response.accessToken,
    tokenType: response.tokenType,
    expiresIn: Number(response.expiresIn),
    user: response.user ? userInfoToProfile(response.user) : {
      id: "",
      email: "",
      name: "",
      role: "user",
      emailVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Extract error message from ConnectError
 */
function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConnectError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

class AuthAPI {
  private session: AuthSession | null = null;

  constructor() {
    // Load session from localStorage
    const storedSession = localStorage.getItem("auth_session");
    if (storedSession) {
      try {
        this.session = JSON.parse(storedSession);

        // Check if session is expired
        if (this.session && this.session.expiresAt < Date.now()) {
          this.clearSession();
        } else if (this.session) {
          // Sync with grpc-client session
          setAuthSession(
            this.session.accessToken,
            Math.floor((this.session.expiresAt - Date.now()) / 1000)
          );
        }
      } catch {
        this.clearSession();
      }
    }
  }

  private saveSession(session: AuthSession): void {
    this.session = session;
    localStorage.setItem("auth_session", JSON.stringify(session));
    setAuthSession(session.accessToken, Math.floor((session.expiresAt - Date.now()) / 1000));
    // Reset clients so they pick up the new auth token
    resetClients();
  }

  private clearSession(): void {
    this.session = null;
    localStorage.removeItem("auth_session");
    clearAuthSession();
    resetClients();
  }

  async signUp(
    email: string,
    password: string,
    name?: string
  ): Promise<AuthResponse> {
    try {
      const client = getAuthClient();
      const request = create(SignupRequestSchema, {
        email,
        password,
        name: name ?? "",
      });

      const response = await client.signup(request);
      const authResponse = convertAuthResponse(response);

      this.saveSession({
        accessToken: authResponse.accessToken,
        expiresAt: Date.now() + authResponse.expiresIn * 1000,
        user: authResponse.user,
      });

      return authResponse;
    } catch (error) {
      throw new Error(extractErrorMessage(error, "Sign up failed"));
    }
  }

  async signIn(email: string, password: string): Promise<AuthResponse> {
    try {
      const client = getAuthClient();
      const request = create(LoginRequestSchema, {
        email,
        password,
      });

      const response = await client.login(request);
      const authResponse = convertAuthResponse(response);

      this.saveSession({
        accessToken: authResponse.accessToken,
        expiresAt: Date.now() + authResponse.expiresIn * 1000,
        user: authResponse.user,
      });

      return authResponse;
    } catch (error) {
      throw new Error(extractErrorMessage(error, "Sign in failed"));
    }
  }

  async signOut(): Promise<void> {
    if (getAccessToken()) {
      try {
        const client = getAuthClient();
        const request = create(LogoutRequestSchema, {});
        await client.logout(request);
      } catch (error) {
        console.error("Logout request failed:", error);
      }
    }
    this.clearSession();
  }

  async getCurrentUser(): Promise<UserProfile | null> {
    if (!getAccessToken()) {
      return null;
    }

    try {
      const client = getAuthClient();
      const request = create(GetCurrentUserRequestSchema, {});
      const response = await client.getCurrentUser(request);
      return userResponseToProfile(response);
    } catch (error) {
      console.error("Failed to get current user:", error);
      this.clearSession();
      return null;
    }
  }

  getSession(): AuthSession | null {
    // Check if session is expired
    if (this.session && this.session.expiresAt < Date.now()) {
      this.clearSession();
      return null;
    }
    return this.session;
  }

  getAccessToken(): string | null {
    return getAccessToken();
  }
}

export const authAPI = new AuthAPI();

