import React, { createContext, useContext, useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';

function getInitialPath() {
  if (typeof window !== 'undefined' && window.location) {
    if (window.location.hash && window.location.hash.startsWith('#/')) {
      return window.location.hash.slice(1).split('?')[0];
    }
    return window.location.pathname || '/superadmin/dashboard';
  }
  return '/superadmin/dashboard';
}

function getInitialParams() {
  if (typeof window !== 'undefined' && window.location) {
    let searchStr = window.location.search;
    if (!searchStr && window.location.hash && window.location.hash.includes('?')) {
      searchStr = window.location.hash.slice(window.location.hash.indexOf('?'));
    }
    if (searchStr) {
      const searchParams = new URLSearchParams(searchStr);
      const params = {};
      for (const [key, value] of searchParams.entries()) {
        params[key] = value;
      }
      return params;
    }
  }
  return {};
}

export const RouterContext = createContext({
  get pathname() { return getInitialPath(); },
  params: {},
  setRoute: () => {},
});

let globalSetRoute = null;

export const router = {
  push: (href) => {
    let path = typeof href === 'string' ? href : (href?.pathname || '/');
    let params = typeof href === 'object' && href?.params ? href.params : {};
    
    if (typeof window !== 'undefined' && window.history) {
      let url = path;
      const query = new URLSearchParams(params).toString();
      if (query) url += '?' + query;
      window.history.pushState({ path, params }, '', url);
    }

    if (globalSetRoute) {
      globalSetRoute({ pathname: path, params });
    }
  },
  replace: (href) => {
    let path = typeof href === 'string' ? href : (href?.pathname || '/');
    let params = typeof href === 'object' && href?.params ? href.params : {};
    
    if (typeof window !== 'undefined' && window.history) {
      let url = path;
      const query = new URLSearchParams(params).toString();
      if (query) url += '?' + query;
      window.history.replaceState({ path, params }, '', url);
    }

    if (globalSetRoute) {
      globalSetRoute({ pathname: path, params });
    }
  },
  back: () => {
    if (typeof window !== 'undefined' && window.history) {
      window.history.back();
    }
  },
};

export function useRouter() {
  return router;
}

export function RouterProvider({ children }) {
  const [route, setRoute] = useState({
    pathname: getInitialPath(),
    params: getInitialParams(),
  });

  useEffect(() => {
    globalSetRoute = setRoute;

    const update = () => {
      setRoute({
        pathname: getInitialPath(),
        params: getInitialParams(),
      });
    };

    const handlePopState = update;

    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', handlePopState);

      // Also intercept pushState / replaceState so programmatic navigation
      // (router.push / router.replace) triggers a re-render
      const origPush = window.history.pushState.bind(window.history);
      const origReplace = window.history.replaceState.bind(window.history);
      window.history.pushState = (...args) => { origPush(...args); update(); };
      window.history.replaceState = (...args) => { origReplace(...args); update(); };

      return () => {
        window.removeEventListener('popstate', handlePopState);
        window.history.pushState = origPush;
        window.history.replaceState = origReplace;
      };
    }
  }, []);

  return (
    <RouterContext.Provider value={{ ...route, setRoute }}>
      {children}
    </RouterContext.Provider>
  );
}

export function usePathname() {
  const ctx = useContext(RouterContext);
  return ctx.pathname || '/superadmin/dashboard';
}

export function useLocalSearchParams() {
  const ctx = useContext(RouterContext);
  return ctx.params || {};
}

export function Redirect({ href }) {
  useEffect(() => {
    if (href) {
      router.replace(href);
    }
  }, [href]);
  return null;
}

export function Slot() {
  return null;
}

export function Link({ href, children, ...props }) {
  return (
    <Pressable onPress={() => router.push(href)} {...props}>
      {children}
    </Pressable>
  );
}

export const DarkTheme = { dark: true, colors: {} };
export const DefaultTheme = { dark: false, colors: {} };
export function ThemeProvider({ children }) { return children; }
