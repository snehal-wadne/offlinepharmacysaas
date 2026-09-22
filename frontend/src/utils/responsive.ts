import { useWindowDimensions } from 'react-native';

export const MOBILE_BREAKPOINT = 768;

export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT): boolean {
  const { width } = useWindowDimensions();
  return width < breakpoint;
}
