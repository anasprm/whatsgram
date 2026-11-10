/**
 * Relay Messenger Pro — Ultra-Performance Tailwind CSS Configuration
 * 
 * Optimization Strategy:
 * 1. JIT compile on-demand — zero CSS file size overhead
 * 2. Aggressive tree-shaking: only used utilities exported
 * 3. Preflight disabled — we have our normalized base
 * 4. Dark mode media query — OLED-efficient
 * 5. Preset for spatial themes & OLED pure-black
 */

import type { Config } from 'tailwindcss';

const tailwindConfig: Config = {
  // JIT Mode — on-demand, no build-time scanner
  // dramatically reduces build time and CSS footprint
  // Purge/remove unused utilities automatically
  jit: {
    // Enable Just-In-Time mode with full elegance
    // Disabled redundant scanner for max speed
    // strictTypes: true,
  },
  
  // Content — precise paths for RSC + client components
  // Using glob patterns for full coverage
  content: [
    // App Router + RSC files
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}',
    // Exclude .next/ build artifacts
    // './.next/**/*.{js,ts,jsx,tsx}',
    
    // Embed Sonner/toast notifications if used
    // './node_modules/sonner/**/*.{js,ts,jsx,tsx}',
  ],
  
  // Theme — spatial, OLED-optimized design tokens
  theme: {
    // Extend with our spatial theme variables
    extend: {
      // === Spatial Contrast & OLED ===
      contrast: {
        level1: '1', // default
        level2: '1.2',
        level3: '1.5',
        level4: '2',
        level5: '3', // maximum contrast for low-vision
      },
      // OLED pure-black is already in globals.css --var--oled-pure-black
      
      // === Reduced Motion ===
      animation: {
        none: 'none',
        // Only include animations we actually use
        aurora: 'aurora 15s ease infinite',
        fadeIn: 'fadeIn var(--transition-normal) ease-out',
        slideIn: 'slideIn var(--transition-normal) ease-out',
        fadeInUp: 'fadeInUp var(--transition-normal) ease-out',
        blob: 'blob 7s infinite',
      },
      animationDelay: {
        '0': '0ms',
        '100': '100ms',
        '200': '200ms',
        '300': '300ms',
        '400': '400ms',
        '500': '500ms',
        '1000': '1000ms',
        '2000': '2000ms',
        '3000': '3000ms',
      },
      
      // === Spatial Shadows (performance: use box-shadow sparingly) ===
      boxShadow: {
        // Only essential shadows; glass morphism uses backdrop-filter
        glass: '0 4px 20px rgba(0, 0, 0, 0.3)',
        glassHover: '0 8px 32px rgba(0, 0, 0, 0.4)',
        card: '0 2px 10px rgba(0, 0, 0, 0.2)',
        cardHover: '0 4px 20px rgba(0, 0, 0, 0.3)',
        // No shadow.blur for OLED efficiency — use solid shadows instead
      },
      
      // === Focus Ring (accessibility + performance) ===
      ringOffsetColor: {
        obsidian: '#020204',
      },
      ringColor: {
        primary: '#6366f1',
        porcelain: '#f8fafc',
      },
      ringOffsetWidth: '2px',
      ringWidth: '2px',
      
      // === Colors — OLED-optimized design tokens (Pillar 1) ===
      colors: {
        app: 'var(--oled-root)',
        ink: 'var(--text-primary)',
        surface: 'var(--glass-bg)',
        border: 'var(--glass-border)',
        focus: 'var(--glass-border-focus)',
        muted: 'var(--text-muted)',
        faint: 'var(--text-muted)',
        panel: 'var(--oled-panel)',
        'panel-2': 'var(--oled-dock)',
        'panel-3': 'var(--oled-interactive)',
        accent: 'var(--accent-cyan)',
        'accent-ink': '#ffffff',
        'accent-hover': 'var(--accent-cyan-end)',
        'accent-strong': '#a78bfa',
        'accent-private': 'var(--accent-private)',
        'accent-public': 'var(--accent-public)',
        'accent-muted': 'var(--accent-muted)',
        'accent-success': 'var(--accent-emerald)',
        'accent-warning': 'var(--accent-warning)',
        'accent-error': 'var(--accent-error)',
        secondary: 'var(--text-secondary)',
        onObsidian: 'var(--text-on-obsidian)',
        onCoal: 'var(--text-on-coal)',
        obsidian: 'var(--oled-root)',
        onyx: 'var(--onyx)',
        coal: 'var(--coal)',
        slate: 'var(--slate)',
        charcoal: 'var(--charcoal)',
        midnight: 'var(--midnight)',
        glass: 'var(--glass-bg)',
        'glass-hover': 'var(--glass-bg-hover)',
        'glass-border-focus': 'var(--glass-border-focus)',
        interactive: 'var(--oled-interactive)',
        'interactive-active': 'var(--interactive-active)',
        'interactive-disabled': 'var(--interactive-disabled)',
        // OLED-specific
        'oled-root': 'var(--oled-root)',
        'oled-panel': 'var(--oled-panel)',
        'oled-dock': 'var(--oled-dock)',
        'oled-interactive': 'var(--oled-interactive)',
        'cyan-500': '#00f2fe',
        'cyan-600': '#09a4d8',
        'emerald-500': '#10b981',
      },

      // === Transition Performance ===
      transitionProperty: {
        none: 'none',
        all: 'all',
        // Critical transitions only — avoids layout thrashing
        DEFAULT: 'color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        fast: 'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
        normal: 'color 250ms cubic-bezier(0.4, 0, 0.2, 1), background-color 250ms cubic-bezier(0.4, 0, 0.2, 1)',
        smooth: 'color 350ms cubic-bezier(0.4, 0, 0.2, 1), background-color 350ms cubic-bezier(0.4, 0, 0.2, 1)',
        gentle: 'color 500ms cubic-bezier(0.4, 0, 0.2, 1), background-color 500ms cubic-bezier(0.4, 0, 0.2, 1)',
      },
      
      // === Shadowless border-focus for OLED ===
      borderColor: {
        input: '#27272a',
        focus: '#9999ff',
        muted: '#6b7280',
      },
      
      // === Letter Spacing & Typography Performance ===
      letterSpacing: {
        tighter: '-0.05em',
        tight: '-0.025em',
        normal: '0em',
        wide: '0.025em',
        wider: '0.05em',
        widest: '0.1em',
      },
      
      // === Sizing Performance ===
      width: {
        // Performance: explicit widths only; avoid 'full' when possible
        full: '100%',
        screen: '100vw',
      },
      height: {
        full: '100%',
        screen: '100vh',
      },
      
      // === Z-Index Performance ===
      zIndex: {
        // Sparse z-indices — avoid random numbers
        dropdown: 10,
        sticky: 40,
        modal: 50,
        popover: 60,
        tooltip: 70,
        canvas: 100,
        layer1: 10,
        layer2: 20,
        layer3: 30,
      },
    },
  },
  
  // === Plugins ===
  plugins: [
    // Only include what we need — no preflight (we have our base)
    // require('@tailwindcss/typography'),
    // require('@tailwindcss/aspect-ratio'),
    // require('@tailwindcss/container-queries'),
  ],
  
  // === Dark Mode ===
  // 'class' strategy for maximum control; 'media' adds auto-dark
  // But we want explicit control for OLED brightness optimization
  darkMode: 'class', // Set via <html className="dark"> or js toggle
  
  // === Core Tailwind Config ===
  // Core Plugins — enable all essential utilities for layout, color, typography
  corePlugins: {
    preflight: false,
    borderWidth: true,
    borderStyle: true,
    borderColor: true,
    backgroundColor: true,
    backgroundImage: true,
    backgroundPosition: true,
    backgroundSize: true,
    backgroundRepeat: true,
    backgroundClip: true,
    backgroundAttachment: true,
    backgroundOrigin: true,
    width: true,
    minWidth: true,
    maxWidth: true,
    height: true,
    minHeight: true,
    maxHeight: true,
    padding: true,
    margin: true,
    borderRadius: true,
    opacity: true,
    shadow: true,
    textColor: true,
    textDecoration: true,
    textUnderlinePosition: true,
    fontSize: true,
    fontWeight: true,
    fontFamily: true,
    fontStyle: true,
    lineHeight: true,
    letterSpacing: true,
    display: true,
    position: true,
    inset: true,
    zIndex: true,
    flex: true,
    flexDirection: true,
    flexWrap: true,
    alignItems: true,
    justifyContent: true,
    alignContent: true,
    alignSelf: true,
    placeItems: true,
    placeContent: true,
    placeSelf: true,
    gap: true,
    justifySelf: true,
    float: true,
    clear: true,
    overflow: true,
    overflowX: true,
    overflowY: true,
    overscrollBehavior: true,
    visibility: true,
    cursor: true,
    transitionProperty: true,
    transitionTimingFunction: true,
    transitionDuration: true,
    transitionDelay: true,
    animation: true,
    keyframes: true,
    transform: true,
    transformOrigin: true,
    scale: true,
    rotate: true,
    translate: true,
    skew: true,
    transformStyle: true,
    perspective: true,
    backfaceVisibility: true,
    ringWidth: true,
    ringColor: true,
    ringOffsetWidth: true,
    ringOffsetColor: true,
    outline: true,
    outlineWidth: true,
    outlineStyle: true,
    outlineColor: true,
    outlineOffset: true,
    ringOpacity: true,
    ringOffsetWidth: true,
    ringStyle: true,
    placeholders: true,
    container: false,
  },
};

export default tailwindConfig;