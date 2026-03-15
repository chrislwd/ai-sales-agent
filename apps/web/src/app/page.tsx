'use client'

import Link from 'next/link'

const features = [
  {
    icon: '✉️',
    title: 'AI Email Generation',
    description:
      'Claude-powered personalized emails crafted from prospect data, company signals, and your brand voice — at scale.',
  },
  {
    icon: '🔗',
    title: 'Multi-step Sequences',
    description:
      'Build automated outbound cadences with conditional branching, time delays, and multi-channel touchpoints.',
  },
  {
    icon: '🧠',
    title: 'Reply Classification',
    description:
      'AI detects intent instantly — interested, objection, OOO, unsubscribe — and routes each reply to the right workflow.',
  },
  {
    icon: '🎯',
    title: 'ICP Scoring',
    description:
      'Automatically score accounts and contacts against your ideal customer profile so reps focus on the best-fit leads.',
  },
  {
    icon: '🔄',
    title: 'CRM Integration',
    description:
      'Two-way HubSpot sync for contacts, companies, deals, and activities. Your CRM stays up to date — zero manual entry.',
  },
  {
    icon: '📊',
    title: 'Analytics Dashboard',
    description:
      'Track open rates, reply rates, meetings booked, and pipeline generated — all in real time with exportable reports.',
  },
]

const steps = [
  {
    num: '01',
    title: 'Define your ICP',
    description:
      'Set your ideal customer profile criteria. AI scores and prioritizes every account in your pipeline so reps work the highest-value prospects first.',
  },
  {
    num: '02',
    title: 'Build sequences',
    description:
      'Design multi-step outbound cadences. AI generates hyper-personalized emails, follow-ups, and conditional branches tailored to each prospect.',
  },
  {
    num: '03',
    title: 'Engage automatically',
    description:
      'Sequences run on autopilot. AI classifies every reply by intent, triggers the right next step, and books meetings directly on your calendar.',
  },
]

const techStack = [
  'Next.js',
  'Fastify',
  'PostgreSQL',
  'Redis',
  'Claude AI',
  'TypeScript',
]

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 z-50 w-full border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <span className="text-xl font-bold tracking-tight text-brand-600">
            AI&nbsp;Sales&nbsp;Agent
          </span>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 transition hover:text-brand-600"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden pt-28">
        {/* gradient background */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-50 via-white to-brand-100"
        />
        <div
          aria-hidden="true"
          className="absolute -top-40 right-0 -z-10 h-[500px] w-[500px] rounded-full bg-brand-500/10 blur-3xl"
        />

        <div className="mx-auto max-w-4xl px-6 pb-24 pt-20 text-center sm:pt-32">
          <p className="mb-4 inline-block rounded-full bg-brand-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-600">
            AI-powered outbound sales execution
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-6xl">
            Turn your pipeline into{' '}
            <span className="bg-gradient-to-r from-brand-600 to-brand-500 bg-clip-text text-transparent">
              revenue on autopilot
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-600">
            AI Sales Agent automates every step of B2B outbound — from
            prospecting and personalized email generation to reply handling and
            meeting booking — so your SDR team can focus on closing.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/register"
              className="w-full rounded-lg bg-brand-600 px-8 py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-brand-700 hover:shadow-lg sm:w-auto"
            >
              Get Started Free
            </Link>
            <a
              href="#features"
              className="w-full rounded-lg border border-gray-300 bg-white px-8 py-3.5 text-base font-semibold text-gray-700 shadow-sm transition hover:border-brand-300 hover:text-brand-600 sm:w-auto"
            >
              View Demo
            </a>
          </div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section id="features" className="scroll-mt-20 bg-gray-50 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
              Features
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Everything your outbound team needs
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              A complete platform that replaces a patchwork of point solutions
              with one intelligent system.
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition hover:border-brand-200 hover:shadow-md"
              >
                <span className="text-3xl">{f.icon}</span>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
              How it works
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Three steps to outbound on autopilot
            </h2>
          </div>

          <div className="mx-auto mt-16 grid max-w-5xl gap-12 lg:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.num} className="relative text-center lg:text-left">
                {/* connector line on desktop */}
                {i < steps.length - 1 && (
                  <div
                    aria-hidden="true"
                    className="absolute right-0 top-8 hidden h-0.5 w-12 translate-x-full bg-gradient-to-r from-brand-300 to-brand-100 lg:block"
                  />
                )}
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white shadow-md">
                  {s.num}
                </span>
                <h3 className="mt-6 text-xl font-semibold text-gray-900">
                  {s.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech Stack ── */}
      <section className="border-y border-gray-100 bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
            Built with
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900">
            Modern, production-grade stack
          </h2>
          <div className="mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-center gap-3">
            {techStack.map((t) => (
              <span
                key={t}
                className="rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-medium text-gray-700 shadow-sm"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative isolate overflow-hidden py-24">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-900 via-brand-700 to-brand-600"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-24 left-1/2 -z-10 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-white/5 blur-3xl"
        />

        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to automate your outbound?
          </h2>
          <p className="mt-4 text-lg leading-8 text-brand-100">
            Join SDR and BDR teams that are booking more meetings with less
            effort. Get started in minutes — no credit card required.
          </p>
          <Link
            href="/register"
            className="mt-8 inline-block rounded-lg bg-white px-8 py-3.5 text-base font-semibold text-brand-600 shadow-md transition hover:bg-brand-50"
          >
            Start for Free
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 bg-white py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} AI Sales Agent. All rights
            reserved.
          </p>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-500 transition hover:text-brand-600"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  )
}
