import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import {
  ForgotPasswordPage,
  HomePage,
  LoginPage,
  OnboardingPage,
  ResetPasswordPage,
  SignupPage,
  VerifyEmailPage,
} from '@/pages';
import { shouldRetry } from '@/lib/retry';
import { RouteGuard } from './RouteGuard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: shouldRetry,
    },
  },
});

const Showcase = import.meta.env.DEV
  ? lazy(() => import('@/dev/Showcase').then((m) => ({ default: m.Showcase })))
  : null;

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<RouteGuard />}>
            <Route index element={<HomePage />} />
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="signup" element={<SignupPage />} />
            <Route path="verify-email" element={<VerifyEmailPage />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="reset-password" element={<ResetPasswordPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
          {Showcase && (
            <Route
              path="dev/showcase"
              element={
                <Suspense fallback={null}>
                  <Showcase />
                </Suspense>
              }
            />
          )}
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
