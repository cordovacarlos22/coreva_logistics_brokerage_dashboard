import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../contexts/AuthContext.jsx';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { user, loading } = useAuth();
  const [formError, setFormError] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: '', password: '' } });

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit({ email, password }) {
    setFormError(null);

    if (!supabase) {
      setFormError('Supabase is not configured for this app.');
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setFormError(signInError.message);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-8">
      <motion.form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm rounded border border-border bg-white p-8"
        noValidate
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <h1 className="text-xl font-semibold text-primary">Coreva Logistics Brokerage</h1>
        <p className="mt-1 text-sm text-text/70">Sign in to the dispatcher portal</p>

        <label className="mt-6 block text-sm font-medium text-text" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          aria-invalid={errors.email ? 'true' : 'false'}
          {...register('email', {
            required: 'Email is required',
            pattern: { value: EMAIL_PATTERN, message: 'Enter a valid email address' },
          })}
          className="mt-1 w-full rounded border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
        />
        {errors.email && <p className="mt-1 text-sm text-status-dropped">{errors.email.message}</p>}

        <label className="mt-4 block text-sm font-medium text-text" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          aria-invalid={errors.password ? 'true' : 'false'}
          {...register('password', { required: 'Password is required' })}
          className="mt-1 w-full rounded border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
        />
        {errors.password && <p className="mt-1 text-sm text-status-dropped">{errors.password.message}</p>}

        {formError && <p className="mt-4 text-sm text-status-dropped">{formError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 w-full rounded bg-primary py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
        >
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </motion.form>
    </main>
  );
}
