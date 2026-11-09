import React, { useState } from 'react';
import {
  Mail,
  Lock,
  User,
  KeyRound,
  CheckCircle,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
} from 'lucide-react';

// ============================================================
// ACCOUNT STORAGE (localStorage)
// ============================================================
const LS_ACCOUNTS = 'whatsgram_accounts';
const LS_SESSION = 'whatsgram_session';
const LS_RESETS = 'whatsgram_password_resets';

const readStore = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeStore = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const normalize = (value) => String(value || '').trim().toLowerCase();

const randomHex = (bytes) => {
  try {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    let out = '';
    for (let i = 0; i < bytes; i += 1) {
      out += Math.floor(Math.random() * 256)
        .toString(16)
        .padStart(2, '0');
    }
    return out;
  }
};

// SHA-256(salt:password). Falls back to a simple digest in non-secure contexts.
async function hashPassword(password, salt) {
  const input = `${salt}:${password}`;
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const data = new TextEncoder().encode(input);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    /* fall through */
  }
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  return `fallback_${(hash >>> 0).toString(16)}`;
}

function passwordScore(password) {
  const pw = String(password || '');
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(score, 4);
}

const STRENGTH_LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
const STRENGTH_COLORS = ['bg-red-500', 'bg-red-500', 'bg-amber-500', 'bg-emerald-500', 'bg-emerald-400'];

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
const isUsername = (value) => /^[a-zA-Z0-9_.]{3,24}$/.test(String(value || '').trim());

// ============================================================
// AUTH MODULE
// ============================================================
export default function AuthModule({ onLoginSuccess, onBack }) {
  const [authMode, setAuthMode] = useState('signin'); // 'signin' | 'signup' | 'forgot' | 'reset'

  // Form states
  const [identifier, setIdentifier] = useState(''); // username or email for sign in
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [optionalEmail, setOptionalEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [generatedReset, setGeneratedReset] = useState(null);

  // Feedback states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const resetFeedback = () => {
    setErrorMsg('');
    setSuccessMsg('');
  };

  const goTo = (mode) => {
    resetFeedback();
    setAuthMode(mode);
  };

  // ------------------------------------------------------------
  // SIGN IN — only accounts that were actually created can log in
  // ------------------------------------------------------------
  const handleSignIn = async (e) => {
    e.preventDefault();
    resetFeedback();

    const key = normalize(identifier);
    if (!key || !password) {
      setErrorMsg('Please enter your username and password.');
      return;
    }

    setLoading(true);
    try {
      const accounts = readStore(LS_ACCOUNTS, []);
      const account = accounts.find(
        (a) => normalize(a.username) === key || normalize(a.email) === key,
      );

      if (!account) {
        setErrorMsg('No account found with that username. Please sign up first.');
        setLoading(false);
        return;
      }

      const attemptedHash = await hashPassword(password, account.salt);
      if (attemptedHash !== account.passwordHash) {
        setErrorMsg('Incorrect password. Please try again.');
        setLoading(false);
        return;
      }

      const session = {
        userId: account.id,
        username: account.username,
        email: account.email,
        signedInAt: new Date().toISOString(),
      };
      writeStore(LS_SESSION, session);
      setLoading(false);
      if (onLoginSuccess) {
        onLoginSuccess(session);
      }
    } catch {
      setLoading(false);
      setErrorMsg('Something went wrong while signing in. Please try again.');
    }
  };

  // ------------------------------------------------------------
  // SIGN UP — creates a real, unique account
  // ------------------------------------------------------------
  const handleSignUp = async (e) => {
    e.preventDefault();
    resetFeedback();

    const cleanUsername = username.trim();
    const cleanEmail = email.trim();
    const cleanRecovery = optionalEmail.trim();

    if (!cleanUsername || !cleanEmail || !password) {
      setErrorMsg('Please fill in all mandatory fields.');
      return;
    }
    if (!isUsername(cleanUsername)) {
      setErrorMsg('Username must be 3–24 characters (letters, numbers, _ or .).');
      return;
    }
    if (!isEmail(cleanEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (cleanRecovery && !isEmail(cleanRecovery)) {
      setErrorMsg('The recovery email is not valid.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const accounts = readStore(LS_ACCOUNTS, []);

      if (accounts.some((a) => normalize(a.username) === normalize(cleanUsername))) {
        setErrorMsg('That username is already taken. Please choose another.');
        setLoading(false);
        return;
      }
      if (accounts.some((a) => normalize(a.email) === normalize(cleanEmail))) {
        setErrorMsg('An account already exists with that email. Try signing in.');
        setLoading(false);
        return;
      }

      const salt = randomHex(16);
      const passwordHash = await hashPassword(password, salt);
      const account = {
        id: `usr_${randomHex(8)}`,
        username: cleanUsername,
        email: cleanEmail,
        recoveryEmail: cleanRecovery || null,
        salt,
        passwordHash,
        createdAt: new Date().toISOString(),
      };

      const ok = writeStore(LS_ACCOUNTS, [...accounts, account]);
      if (!ok) {
        setErrorMsg('Could not save your account. Please check browser storage settings.');
        setLoading(false);
        return;
      }

      setLoading(false);
      setSuccessMsg('Account created successfully! You can now sign in.');
      setIdentifier(cleanUsername);
      setPassword('');
      setConfirmPassword('');
      setOptionalEmail('');
      setTimeout(() => {
        setSuccessMsg('');
        setAuthMode('signin');
      }, 1600);
    } catch {
      setLoading(false);
      setErrorMsg('Something went wrong while creating your account.');
    }
  };

  // ------------------------------------------------------------
  // FORGOT PASSWORD — issues a reset token for a real account
  // ------------------------------------------------------------
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    resetFeedback();

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Please enter your account email address.');
      return;
    }

    setLoading(true);
    try {
      const accounts = readStore(LS_ACCOUNTS, []);
      const account = accounts.find(
        (a) =>
          normalize(a.email) === normalize(cleanEmail) ||
          normalize(a.recoveryEmail) === normalize(cleanEmail),
      );

      if (!account) {
        setErrorMsg('No account found with that email address.');
        setLoading(false);
        return;
      }

      const token = `tok_${randomHex(6)}`;
      const resets = readStore(LS_RESETS, []).filter((r) => r.userId !== account.id);
      resets.push({
        token,
        userId: account.id,
        expiresAt: Date.now() + 15 * 60 * 1000,
      });
      writeStore(LS_RESETS, resets);

      setLoading(false);
      setGeneratedReset({ token, email: account.email, username: account.username });
      setResetToken(token);
      setSuccessMsg(`Reset link generated for ${account.email}. Use the code below.`);
    } catch {
      setLoading(false);
      setErrorMsg('Something went wrong while generating a reset link.');
    }
  };

  // ------------------------------------------------------------
  // RESET PASSWORD — validates the token and updates the hash
  // ------------------------------------------------------------
  const handleResetPassword = async (e) => {
    e.preventDefault();
    resetFeedback();

    if (!resetToken.trim()) {
      setErrorMsg('Please enter your reset code.');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMsg('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('New passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const resets = readStore(LS_RESETS, []);
      const reset = resets.find((r) => r.token === resetToken.trim());

      if (!reset) {
        setErrorMsg('That reset code is invalid. Please request a new one.');
        setLoading(false);
        return;
      }
      if (reset.expiresAt < Date.now()) {
        setErrorMsg('That reset code has expired. Please request a new one.');
        setLoading(false);
        return;
      }

      const accounts = readStore(LS_ACCOUNTS, []);
      const account = accounts.find((a) => a.id === reset.userId);
      if (!account) {
        setErrorMsg('The account for this reset code no longer exists.');
        setLoading(false);
        return;
      }

      const salt = randomHex(16);
      const passwordHash = await hashPassword(newPassword, salt);
      const updated = accounts.map((a) =>
        a.id === account.id ? { ...a, salt, passwordHash } : a,
      );
      writeStore(LS_ACCOUNTS, updated);
      writeStore(LS_RESETS, resets.filter((r) => r.token !== reset.token));

      setLoading(false);
      setSuccessMsg('Password updated successfully! You can now sign in.');
      setIdentifier(account.username);
      setTimeout(() => {
        setSuccessMsg('');
        setAuthMode('signin');
        setPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setResetToken('');
        setGeneratedReset(null);
      }, 1600);
    } catch {
      setLoading(false);
      setErrorMsg('Something went wrong while resetting your password.');
    }
  };

  const copyReset = async () => {
    if (!generatedReset) return;
    const link = `${window.location.origin}/?reset=${generatedReset.token}`;
    try {
      await navigator.clipboard.writeText(link);
      setSuccessMsg('Reset link copied to clipboard.');
    } catch {
      setSuccessMsg('Select the code above and copy it manually.');
    }
  };

  const score = passwordScore(password);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 selection:bg-indigo-500 selection:text-white font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.08)_0,transparent_70%)] pointer-events-none" />

      <div className="relative w-full max-w-md bg-zinc-900/80 backdrop-blur-xl border border-zinc-800/80 rounded-3xl p-8 shadow-2xl">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="absolute top-5 left-5 flex items-center space-x-1 text-xs font-medium text-zinc-400 hover:text-white transition"
          >
            <ArrowLeft size={14} />
            <span>Home</span>
          </button>
        )}

        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-4">
            <Sparkles className="w-7 h-7 text-white animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">WhatsGram Workspace</h1>
          <p className="text-sm text-zinc-400 mt-1">Secure authentication & account management</p>
        </div>

        {/* Error / Success Banners */}
        {errorMsg && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-xs flex items-center space-x-2 animate-shake">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-xl text-xs flex items-center space-x-2">
            <CheckCircle size={16} className="shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 1. SIGN IN VIEW */}
        {authMode === 'signin' && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Username</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 text-zinc-500 w-4 h-4" />
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="your username (or email)"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-10 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-zinc-400">Password</label>
                <button
                  type="button"
                  onClick={() => goTo('forgot')}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 text-zinc-500 w-4 h-4" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-10 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300 transition"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] transition font-medium py-2.5 rounded-xl text-sm text-white shadow-lg shadow-indigo-600/20 flex items-center justify-center space-x-2 disabled:opacity-60"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <span>Sign In</span>
              )}
            </button>

            <div className="text-center mt-6">
              <span className="text-xs text-zinc-500">Don't have an account? </span>
              <button
                type="button"
                onClick={() => goTo('signup')}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition ml-1"
              >
                Sign up
              </button>
            </div>
          </form>
        )}

        {/* 2. SIGN UP VIEW */}
        {authMode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Username</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 text-zinc-500 w-4 h-4" />
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="johndoe"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-10 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
              <p className="mt-1 text-[10px] text-zinc-600">3–24 characters: letters, numbers, _ or .</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Primary Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 text-zinc-500 w-4 h-4" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-10 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Optional Recovery Email <span className="text-zinc-600 font-normal">(Optional)</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 text-zinc-600 w-4 h-4" />
                <input
                  type="email"
                  value={optionalEmail}
                  onChange={(e) => setOptionalEmail(e.target.value)}
                  placeholder="recovery@example.com (optional)"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-10 py-2.5 text-sm text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 text-zinc-500 w-4 h-4" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-10 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300 transition"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {password && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full ${
                          i < score ? STRENGTH_COLORS[score] : 'bg-zinc-800'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-500">
                    Strength: <span className="text-zinc-300">{STRENGTH_LABELS[score]}</span>
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 text-zinc-500 w-4 h-4" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-10 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] transition font-medium py-2.5 rounded-xl text-sm text-white shadow-lg shadow-indigo-600/20 flex items-center justify-center space-x-2 disabled:opacity-60"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <span>Create Account</span>
              )}
            </button>

            <div className="text-center mt-6">
              <span className="text-xs text-zinc-500">Already have an account? </span>
              <button
                type="button"
                onClick={() => goTo('signin')}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition ml-1"
              >
                Sign in
              </button>
            </div>
          </form>
        )}

        {/* 3. FORGOT PASSWORD VIEW */}
        {authMode === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="text-center mb-2">
              <p className="text-xs text-zinc-400">
                Enter the email you registered with and we'll generate a secure reset link.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Account Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 text-zinc-500 w-4 h-4" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-10 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>

            {generatedReset && (
              <div className="bg-zinc-950 border border-indigo-500/40 rounded-xl p-4 space-y-2">
                <p className="text-[10px] uppercase tracking-wide text-indigo-400 font-semibold">
                  Your reset code
                </p>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm font-mono text-emerald-400 break-all">
                    {generatedReset.token}
                  </code>
                  <button
                    type="button"
                    onClick={copyReset}
                    className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition shrink-0"
                    title="Copy reset link"
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500">
                  Valid for 15 minutes. This demo shows the code instead of sending email.
                </p>
                <button
                  type="button"
                  onClick={() => goTo('reset')}
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
                >
                  Continue to reset password →
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] transition font-medium py-2.5 rounded-xl text-sm text-white shadow-lg shadow-indigo-600/20 flex items-center justify-center space-x-2 disabled:opacity-60"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <span>{generatedReset ? 'Generate New Code' : 'Generate Reset Link'}</span>
              )}
            </button>

            <div className="text-center mt-6">
              <button
                type="button"
                onClick={() => goTo('signin')}
                className="text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition flex items-center justify-center space-x-1 mx-auto"
              >
                <ArrowLeft size={14} />
                <span>Back to Sign In</span>
              </button>
            </div>
          </form>
        )}

        {/* 4. RESET PASSWORD VIEW */}
        {authMode === 'reset' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="text-center mb-2">
              <p className="text-xs text-zinc-400">
                Enter your reset code and choose a new secure password.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Reset Code</label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-3 text-zinc-500 w-4 h-4" />
                <input
                  type="text"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="tok_xxxxxxxxxxxx"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-10 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 text-zinc-500 w-4 h-4" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-10 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300 transition"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Confirm New Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 text-zinc-500 w-4 h-4" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-10 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] transition font-medium py-2.5 rounded-xl text-sm text-white shadow-lg shadow-indigo-600/20 flex items-center justify-center space-x-2 disabled:opacity-60"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <span>Update Password</span>
              )}
            </button>

            <div className="text-center mt-6">
              <button
                type="button"
                onClick={() => goTo('signin')}
                className="text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition flex items-center justify-center space-x-1 mx-auto"
              >
                <ArrowLeft size={14} />
                <span>Back to Sign In</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
