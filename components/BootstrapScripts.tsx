'use client';

import { useEffect } from 'react';

export function BootstrapScripts() {
  useEffect(() => {
    // Theme script - runs on client only to avoid hydration mismatch
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
          if (process.env.NODE_ENV === 'production') {
            window.addEventListener('load', function () {
              navigator.serviceWorker.register('/sw.js').catch(function (err) {
                console.log('SW registration failed: ', err);
              });
            });
          } else {
            // In development, remove any previously-installed service worker so it
            // can never serve stale bundles while iterating locally.
            navigator.serviceWorker
              .getRegistrations()
              .then(function (regs) {
                regs.forEach(function (reg) {
                  reg.unregister();
                });
              })
              .catch(function () {});
          }
        }
      } catch (error) {}
    })();

    // Bootstrap payload
    (window.__RELAY_BOOTSTRAP__ = {
      conversations: [],
      user: null,
    });
  }, []);
  return null;
}
