import React, { createContext, useContext, useEffect, useState } from "react";
import { authAPI, UserProfile, AuthSession } from "../lib/auth-api";

interface AuthContextType {
  session: AuthSession | null;
  user: UserProfile | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    name?: string,
  ) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    const currentSession = authAPI.getSession();
    setSession(currentSession);
    setUser(currentSession?.user ?? null);
    setUserProfile(currentSession?.user ?? null);

    // Verify session is still valid by fetching current user
    if (currentSession) {
      authAPI.getCurrentUser().then((currentUser) => {
        if (currentUser) {
          setUser(currentUser);
          setUserProfile(currentUser);
          // Update the session with the latest user data including role
          const updatedSession = {
            ...currentSession,
            user: currentUser,
          };
          setSession(updatedSession);
        } else {
          // Session expired or invalid
          setSession(null);
          setUser(null);
          setUserProfile(null);
        }
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const response = await authAPI.signIn(email, password);
      setSession({
        accessToken: response.accessToken,
        expiresAt: Date.now() + response.expiresIn * 1000,
        user: response.user,
      });
      setUser(response.user);
      setUserProfile(response.user);
      return {};
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      };
    }
  };

  const signUp = async (email: string, password: string, name?: string) => {
    try {
      const response = await authAPI.signUp(email, password, name);
      setSession({
        accessToken: response.accessToken,
        expiresAt: Date.now() + response.expiresIn * 1000,
        user: response.user,
      });
      setUser(response.user);
      setUserProfile(response.user);
      return {};
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      };
    }
  };

  const signOut = async () => {
    await authAPI.signOut();
    setSession(null);
    setUser(null);
    setUserProfile(null);
  };

  const refreshSession = async () => {
    const currentUser = await authAPI.getCurrentUser();
    if (currentUser) {
      const currentSession = authAPI.getSession();
      setSession(currentSession);
      setUser(currentUser);
      setUserProfile(currentUser);
    } else {
      setSession(null);
      setUser(null);
      setUserProfile(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        userProfile,
        loading,
        signIn,
        signUp,
        signOut,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
