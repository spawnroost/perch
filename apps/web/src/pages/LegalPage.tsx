import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '@/components/atoms';

const UPDATED = '21 November 2026';
const ISSUES_URL = 'https://github.com/spawnroost/perch/issues';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-title text-lg text-fg">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-fg-muted">{children}</div>
    </section>
  );
}

function Privacy() {
  return (
    <>
      <Section title="The short version">
        <p>
          Perch keeps what it needs to recommend games to you and nothing more. No ads, no analytics
          trackers, no selling or sharing your data. Delete your account and it is gone.
        </p>
      </Section>
      <Section title="What we store">
        <ul className="list-disc pl-5">
          <li>Your account: email, a hashed password (if you set one), and sign-in sessions.</li>
          <li>
            Accounts you link: Steam ID, Xbox gamertag, PlayStation online ID, Google or Discord
            account id and email.
          </li>
          <li>
            Your library: games, status, hours played, last played, ratings, likes and dislikes.
          </li>
          <li>Your devices and their hardware, and your price watches.</li>
        </ul>
      </Section>
      <Section title="Who else sees anything">
        <ul className="list-disc pl-5">
          <li>
            Game data comes from IGDB, Steam, OpenXBL, PlayStation, CheapShark and iTunes. We look
            up your linked library on those services using the id you gave us.
          </li>
          <li>
            Recommendation reasons and review summaries are written by DeepSeek. It gets game
            titles, tags and public Steam reviews, never your email, name or account id.
          </li>
          <li>Emails (verification, password reset, price digests) are sent through Resend.</li>
          <li>
            Game covers load straight from IGDB&apos;s image servers, which see your IP address.
          </li>
          <li>The app runs on a server we rent from OVH.</li>
        </ul>
      </Section>
      <Section title="Cookies and local storage">
        <p>
          One session cookie keeps you signed in. Your browser also keeps a few small settings, like
          recent backlog roulette picks. Nothing is used to track you across sites.
        </p>
      </Section>
      <Section title="Your control">
        <p>
          You can edit or remove any game or device, and turn off price emails, from the app.
          Account settings → Delete account removes everything we store about you.
        </p>
      </Section>
    </>
  );
}

function Terms() {
  return (
    <>
      <Section title="Using Perch">
        <p>
          Perch is a free hobby project. Use it for your own game picks, don&apos;t abuse it (no
          scraping, spam or attempts to break it), and keep your password to yourself. We may
          suspend accounts that cause trouble.
        </p>
      </Section>
      <Section title="No guarantees">
        <p>
          Recommendations, &quot;will it run&quot; fits, prices and play times are best guesses from
          public data and can be wrong. Check a store page before you buy. Perch is provided as is,
          without warranty, and may change or shut down. We&apos;ll try to give notice so you can
          leave.
        </p>
      </Section>
      <Section title="Other people's stuff">
        <p>
          Game names, covers and art belong to their owners. Data comes from IGDB, Steam and the
          other services named in the privacy policy. Perch is not affiliated with Valve, Microsoft,
          Sony or any publisher.
        </p>
      </Section>
      <Section title="Tips">
        <p>
          Buy me a coffee tips are voluntary gifts. They don&apos;t buy any features or service.
        </p>
      </Section>
    </>
  );
}

export function LegalPage({ doc }: { doc: 'privacy' | 'terms' }) {
  const title = doc === 'privacy' ? 'Privacy' : 'Terms';
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-12">
      <Link to="/" className="flex items-center gap-2.5 font-title text-xl text-fg">
        <Logo aria-hidden className="size-8" />
        Perch
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="font-title text-3xl text-fg">{title}</h1>
        <p className="text-sm text-fg-muted">Last updated {UPDATED}</p>
      </header>
      {doc === 'privacy' ? <Privacy /> : <Terms />}
      <footer className="flex flex-wrap gap-4 border-t border-white/10 pt-6 text-sm text-fg-muted">
        <span>
          Questions?{' '}
          <a href={ISSUES_URL} className="text-fg underline underline-offset-4">
            Open an issue
          </a>
        </span>
        <Link
          to={doc === 'privacy' ? '/terms' : '/privacy'}
          className="text-fg underline underline-offset-4"
        >
          {doc === 'privacy' ? 'Terms' : 'Privacy'}
        </Link>
      </footer>
    </main>
  );
}
