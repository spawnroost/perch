import { lazy, Suspense } from 'react';
import { LayoutGroup } from 'motion/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppLayout } from '@/components/organisms';
import {
  AccountPage,
  BrowsePage,
  DevicesPage,
  ForgotPasswordPage,
  ForYouShelfPage,
  GamePage,
  HomePage,
  LibraryPage,
  LoginPage,
  OnboardingPage,
  ResetPasswordPage,
  SignupPage,
  SimilarPage,
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
        <LayoutGroup>
          <Routes>
            <Route element={<RouteGuard />}>
              <Route element={<AppLayout />}>
                <Route index element={<HomePage />} />
                <Route path="for-you/like/:igdbId" element={<SimilarPage />} />
                <Route path="for-you/:shelfKey" element={<ForYouShelfPage />} />
                <Route path="browse" element={<BrowsePage />} />
                <Route path="library" element={<LibraryPage />} />
                <Route path="devices" element={<DevicesPage />} />
                <Route path="games/:id" element={<GamePage />} />
                <Route path="account" element={<AccountPage />} />
              </Route>
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
        </LayoutGroup>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
