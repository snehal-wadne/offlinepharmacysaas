import type { ReactNode } from 'react';

export declare const router: {
  push: (href: string | { pathname: string; params?: Record<string, any> }) => void;
  replace: (href: string | { pathname: string; params?: Record<string, any> }) => void;
  back: () => void;
};

export declare function useRouter(): typeof router;
export declare function RouterProvider(props: { children?: ReactNode }): JSX.Element;
export declare function usePathname(): string;
export declare function useLocalSearchParams<
  T extends Record<string, any> = Record<string, string>,
>(): T;
export declare function Redirect(props: { href: string }): null;
export declare function Slot(): null;
export declare function Link(
  props: { href: string | { pathname: string; params?: Record<string, any> }; children?: ReactNode } & Record<string, any>,
): JSX.Element;
export declare const DarkTheme: { dark: boolean; colors: Record<string, any> };
export declare const DefaultTheme: { dark: boolean; colors: Record<string, any> };
export declare function ThemeProvider(props: { children?: ReactNode }): ReactNode;
