/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const FalahPalette = {
  midnightViolet: '#30243D',
  deepViolet: '#3D2E4D',
  dustyRose: '#B9829A',
  deepDustyRose: '#A66D86',
  softRose: '#E8D5DD',
  offWhite: '#F8F5F7',
  white: '#FFFFFF',
  charcoal: '#28242B',
  mutedGray: '#77717A',
  softGray: '#E5DFE4',
  secondaryBorder: '#D8C9D1',
  tableRose: '#F3E9EE',
  selectedRose: '#FCF7F9',
  sageGreen: '#4F8A72',
  sageTint: '#EAF2EE',
  warmGold: '#C49752',
  goldTint: '#F7F0E5',
  mutedRed: '#B85C64',
  redTint: '#F7EDEE',
  iconRose: '#A66D86',
  sidebarText: '#D9D2DE',
};

export const SuperAdminPalette = FalahPalette;

export const Colors = {
  light: {
    // Backgrounds
    background: FalahPalette.offWhite,
    backgroundElement: FalahPalette.white,

    // Borders
    border: FalahPalette.softGray,

    // Text
    textHeading: FalahPalette.charcoal,
    text: FalahPalette.mutedGray,
    textSecondary: FalahPalette.mutedGray,

    // Brand & UI
    primary: FalahPalette.dustyRose,
    primaryHover: FalahPalette.deepDustyRose,
    secondary: FalahPalette.white,
    secondaryText: FalahPalette.midnightViolet,
    accent: FalahPalette.softRose,
    sidebar: FalahPalette.midnightViolet,
    activeMenuBg: FalahPalette.deepViolet,
    activeMenu: FalahPalette.white,

    // Semantic Badges (Background, Text)
    statusActiveBg: FalahPalette.sageTint,
    statusActiveText: FalahPalette.sageGreen,
    statusPendingBg: FalahPalette.goldTint,
    statusPendingText: FalahPalette.warmGold,
    statusPaidBg: FalahPalette.softRose,
    statusPaidText: FalahPalette.deepDustyRose,
    statusExpiredBg: FalahPalette.redTint,
    statusExpiredText: FalahPalette.mutedRed,
    statusFailedBg: FalahPalette.redTint,
    statusFailedText: FalahPalette.mutedRed,
  },
  dark: {
    // Fallback/Dark mappings (can be adjusted later if dark mode is requested)
    background: '#000000',
    backgroundElement: '#212225',
    border: '#2E3135',
    textHeading: '#FFFFFF',
    text: '#B0B4BA',
    textSecondary: FalahPalette.mutedGray,
    primary: FalahPalette.dustyRose,
    primaryHover: FalahPalette.deepDustyRose,
    sidebar: FalahPalette.midnightViolet,
    activeMenu: FalahPalette.dustyRose,
    success: FalahPalette.sageGreen,
    warning: FalahPalette.warmGold,
    error: FalahPalette.mutedRed,
    info: FalahPalette.iconRose,
    bgImportant: FalahPalette.deepViolet,
    bgSuccess: '#14532d',
    bgWarning: '#78350f',
    bgError: '#7f1d1d',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
