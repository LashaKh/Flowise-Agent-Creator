import { useState, type FormEvent, type ChangeEvent } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

type AuthMode = 'signin' | 'signup';

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Authentication component with sign up and sign in forms
 */
export function Auth() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError(null);
  };

  const validateForm = (): string | null => {
    if (!email.trim()) {
      return 'Email is required';
    }
    if (!isValidEmail(email.trim())) {
      return 'Please enter a valid email address';
    }
    if (!password) {
      return 'Password is required';
    }
    if (password.length < 6) {
      return 'Password must be at least 6 characters';
    }
    return null;
  };

  const handleEmailChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (error) setError(null);
  };

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (error) setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (mode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (signUpError) {
          setError(signUpError.message);
        } else {
          toast.success('Account created! Please check your email to confirm.');
          setEmail('');
          setPassword('');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInError) {
          setError(signInError.message);
        } else {
          toast.success('Signed in successfully!');
        }
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      console.error('Auth error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center cosmic-bg px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="glass-strong rounded-3xl p-10 card-cosmic">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-cosmic-cyan to-cosmic-purple flex items-center justify-center glow-cyan">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h1 className="text-3xl font-display font-bold gradient-text mb-3">
              {mode === 'signin' ? 'Welcome Back' : 'Join the Magic'}
            </h1>
            <p className="text-gray-400 font-body">
              {mode === 'signin'
                ? 'Sign in to manage your AI personas'
                : 'Sign up to start creating AI personas'}
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 glass border border-red-500/50 rounded-xl">
              <p className="text-sm text-red-400 font-body">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Input */}
            <div className="space-y-3">
              <label
                htmlFor="email"
                className="block text-sm font-display font-semibold text-cosmic-cyan uppercase tracking-wide"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={handleEmailChange}
                placeholder="you@example.com"
                disabled={isLoading}
                autoComplete="email"
                className={`
                  w-full px-5 py-4 glass border rounded-xl
                  text-white font-body placeholder:text-gray-500
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all
                  ${error && !isValidEmail(email) ? 'border-red-500/50' : 'border-white/10 hover:border-cosmic-cyan/30'}
                `}
              />
            </div>

            {/* Password Input */}
            <div className="space-y-3">
              <label
                htmlFor="password"
                className="block text-sm font-display font-semibold text-cosmic-cyan uppercase tracking-wide"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={handlePasswordChange}
                placeholder="Min. 6 characters"
                disabled={isLoading}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                className={`
                  w-full px-5 py-4 glass border rounded-xl
                  text-white font-body placeholder:text-gray-500
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all
                  ${error && password.length < 6 ? 'border-red-500/50' : 'border-white/10 hover:border-cosmic-cyan/30'}
                `}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className={`
                w-full px-6 py-4 font-display font-bold rounded-xl text-lg
                transition-all
                ${isLoading
                  ? 'btn-cosmic opacity-70 cursor-not-allowed'
                  : 'btn-cosmic hover:scale-[1.02]'
                }
              `}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-3">
                  <svg
                    className="animate-spin h-6 w-6 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  {mode === 'signin' ? 'Entering the Realm...' : 'Creating Portal...'}
                </span>
              ) : (
                mode === 'signin' ? 'Enter the Realm' : 'Create Portal'
              )}
            </button>
          </form>

          {/* Mode Toggle */}
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-400 font-body">
              {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
              {' '}
              <button
                type="button"
                onClick={toggleMode}
                disabled={isLoading}
                className="text-cosmic-cyan hover:text-cosmic-magenta font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
