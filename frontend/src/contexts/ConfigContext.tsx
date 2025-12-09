import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { PublicConfig, FeatureFlags } from "../types/config";

// Default config values (used before API response)
const DEFAULT_CONFIG: PublicConfig = {
  app_name: "ScaledTest",
  version: "1.0.0",
  maintenance_mode: false,
  features: {
    registration_enabled: true,
    oauth_enabled: false,
    api_docs_enabled: true,
  },
};

interface ConfigContextType {
  config: PublicConfig;
  loading: boolean;
  error: string | null;
  refreshConfig: () => Promise<void>;
  isFeatureEnabled: (feature: keyof FeatureFlags) => boolean;
  isMaintenanceMode: boolean;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

// In production/K8s, use empty string so browser uses relative URLs via nginx proxy
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [config, setConfig] = useState<PublicConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE_URL}/api/v1/config`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.statusText}`);
      }
      
      const data = await response.json();
      setConfig(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load configuration";
      setError(message);
      // Keep using default config on error
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch config on mount
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Refresh config method
  const refreshConfig = useCallback(async () => {
    setLoading(true);
    await fetchConfig();
  }, [fetchConfig]);

  // Helper to check if a feature is enabled
  const isFeatureEnabled = useCallback(
    (feature: keyof FeatureFlags): boolean => {
      return config.features?.[feature] ?? false;
    },
    [config.features]
  );

  // Derived state for maintenance mode
  const isMaintenanceMode = config.maintenance_mode;

  return (
    <ConfigContext.Provider
      value={{
        config,
        loading,
        error,
        refreshConfig,
        isFeatureEnabled,
        isMaintenanceMode,
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error("useConfig must be used within a ConfigProvider");
  }
  return context;
};
