import { createIcons, icons } from 'lucide';
import { createClient } from '@supabase/supabase-js';
import { bootApp } from './app.js';

if (typeof window !== 'undefined') {
  window.lucide = {
    icons,
    createIcons: (opts = {}) => createIcons({ icons, ...opts })
  };
  window.supabase = { createClient };
}

const start = () => {
  try {
    bootApp();
  } catch (err) {
    console.error('[WhatsGram boot error]', err);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
