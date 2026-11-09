import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { AuthProvider } from '@/lib/AuthProvider';
import { ThemeProvider } from '@/lib/ThemeProvider';
import { UiStyleProvider } from '@/lib/UiStyleProvider';
import { ToastProvider } from '@/lib/ToastProvider';

export const metadata: Metadata = {
  title: {
    default: 'Relay — Secure Workspace Messaging',
    template: '%s · Relay',
  },
  description:
    'Relay is a focused realtime messaging workspace with direct threads, voice and video notes, secure calls, and server-side privacy controls.',
  applicationName: 'Relay',
  authors: [{ name: 'Muhammed Anas.v' }],
  creator: 'Muhammed Anas.v',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Relay',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/pwa/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/pwa/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/pwa/icon-180x180.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#000000' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

function bootstrapScript(): string {
  return `(window.__RELAY_BOOTSTRAP__ = ${JSON.stringify({ conversations: [], user: null })});`;
}

const bootstrapPayload = bootstrapScript();

const themeScript = `
(function () {
  try {
    var host = location.hostname;
    var site =
      host.indexOf('valiyakath') === 0
        ? 'whatsapp'
        : host.indexOf('relay-messengerpro') === 0
          ? 'formal'
          : 'whatsapp';
    document.documentElement.dataset.site = site;

    var storedTheme = localStorage.getItem('relay.theme');
    var dark = storedTheme
      ? storedTheme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';

    var storedUi = localStorage.getItem('relay.ui');
    var ui =
      storedUi === 'minimal' || storedUi === 'official'
        ? storedUi
        : site === 'formal'
          ? 'minimal'
          : 'official';
    document.documentElement.dataset.ui = ui;

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').catch(function(err) {
          console.log('SW registration failed: ', err);
        });
      });
    }
  } catch (error) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/pwa/icon-180x180.png" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="192x192" href="/pwa/icon-192x192.png" />
        <meta name="theme-color" content="#25D366" />
        <Script id="theme-script" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeScript }} />
        <Script id="bootstrap-script" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: bootstrapPayload }} />
      </head>
      <body className="min-h-screen bg-app text-ink antialiased">
        <ThemeProvider>
          <UiStyleProvider>
            <AuthProvider>
              <ToastProvider>{children}</ToastProvider>
            </AuthProvider>
          </UiStyleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
