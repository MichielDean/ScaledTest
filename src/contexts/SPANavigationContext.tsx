import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useRouter } from 'next/router';

// Define all possible views in our SPA
export type SPAView =
  | 'dashboard'
  | 'test-results'
  | 'report-detail'
  | 'modern-analytics'
  | 'visualization-playground'
  | 'simple-test-dashboard'
  | 'profile'
  | 'admin-users'
  | 'admin-teams'
  | 'executions';

// View parameters for parameterized views (e.g., report-detail needs a reportId)
export type SPAViewParams = Record<string, string>;

interface SPANavigationContextType {
  currentView: SPAView;
  viewParams: SPAViewParams;
  navigateTo: (view: SPAView, params?: SPAViewParams) => void;
  viewHistory: SPAView[];
  canGoBack: boolean;
  goBack: () => void;
}

const SPANavigationContext = createContext<SPANavigationContextType | undefined>(undefined);

interface SPANavigationProviderProps {
  children: ReactNode;
  initialView?: SPAView;
}

export const SPANavigationProvider: React.FC<SPANavigationProviderProps> = ({
  children,
  initialView = 'dashboard',
}) => {
  const router = useRouter();
  const [currentView, setCurrentView] = useState<SPAView>(initialView);
  const [viewParams, setViewParams] = useState<SPAViewParams>({});
  const [viewHistory, setViewHistory] = useState<SPAView[]>([initialView]);
  const [paramsHistory, setParamsHistory] = useState<SPAViewParams[]>([{}]);

  // Handle initial view from URL parameters
  useEffect(() => {
    const viewFromUrl = router.query.view as SPAView;

    if (viewFromUrl && viewFromUrl !== currentView) {
      const validViews: SPAView[] = [
        'dashboard',
        'test-results',
        'report-detail',
        'modern-analytics',
        'visualization-playground',
        'simple-test-dashboard',
        'profile',
        'admin-users',
        'admin-teams',
        'executions',
      ];

      if (validViews.includes(viewFromUrl)) {
        setCurrentView(viewFromUrl);
        setViewHistory([viewFromUrl]);
        // Extract view params from URL query (e.g., reportId)
        const params: SPAViewParams = {};
        if (router.query.reportId) params.reportId = router.query.reportId as string;
        setViewParams(params);
        setParamsHistory([params]);
      }
    }
  }, [router.query.view, currentView]);

  const navigateTo = (view: SPAView, params: SPAViewParams = {}) => {
    setCurrentView(view);
    setViewParams(params);
    setViewHistory(prev => [...prev, view]);
    setParamsHistory(prev => [...prev, params]);
    // Update URL without causing a page reload
    const queryParts = [`view=${view}`];
    Object.entries(params).forEach(([k, v]) => queryParts.push(`${k}=${v}`));
    router.replace(`/dashboard?${queryParts.join('&')}`, undefined, { shallow: true });
  };

  const goBack = () => {
    if (viewHistory.length > 1) {
      const newHistory = viewHistory.slice(0, -1);
      const newParamsHistory = paramsHistory.slice(0, -1);
      const previousView = newHistory[newHistory.length - 1];
      const previousParams = newParamsHistory[newParamsHistory.length - 1] || {};
      setViewHistory(newHistory);
      setParamsHistory(newParamsHistory);
      setCurrentView(previousView);
      setViewParams(previousParams);
    }
  };

  const canGoBack = viewHistory.length > 1;

  return (
    <SPANavigationContext.Provider
      value={{
        currentView,
        viewParams,
        navigateTo,
        viewHistory,
        canGoBack,
        goBack,
      }}
    >
      {children}
    </SPANavigationContext.Provider>
  );
};

export const useSPANavigation = () => {
  const context = useContext(SPANavigationContext);
  if (context === undefined) {
    throw new Error('useSPANavigation must be used within a SPANavigationProvider');
  }
  return context;
};
