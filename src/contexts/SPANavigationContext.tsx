import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useRouter } from 'next/router';

// Define all possible views in our SPA
export type SPAView =
  | 'dashboard'
  | 'test-results'
  | 'modern-analytics'
  | 'visualization-playground'
  | 'simple-test-dashboard'
  | 'profile'
  | 'admin-users'
  | 'admin-teams';

interface SPANavigationContextType {
  currentView: SPAView;
  navigateTo: (view: SPAView) => void;
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
  const [viewHistory, setViewHistory] = useState<SPAView[]>([initialView]);

  // Handle initial view from URL parameters
  useEffect(() => {
    const viewFromUrl = router.query.view as SPAView;

    if (viewFromUrl && viewFromUrl !== currentView) {
      const validViews: SPAView[] = [
        'dashboard',
        'test-results',
        'modern-analytics',
        'visualization-playground',
        'simple-test-dashboard',
        'profile',
        'admin-users',
        'admin-teams',
      ];

      if (validViews.includes(viewFromUrl)) {
        setCurrentView(viewFromUrl);
        setViewHistory([viewFromUrl]);
      }
    }
  }, [router.query.view, currentView]);

  const navigateTo = (view: SPAView) => {
    if (view !== currentView) {
      setCurrentView(view);
      setViewHistory(prev => [...prev, view]);
      // Update URL without causing a page reload
      router.replace(`/dashboard?view=${view}`, undefined, { shallow: true });
    }
  };

  const goBack = () => {
    if (viewHistory.length > 1) {
      const newHistory = viewHistory.slice(0, -1);
      const previousView = newHistory[newHistory.length - 1];
      setViewHistory(newHistory);
      setCurrentView(previousView);
    }
  };

  const canGoBack = viewHistory.length > 1;

  return (
    <SPANavigationContext.Provider
      value={{
        currentView,
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
