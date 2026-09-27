import type { Metadata } from 'next'

import { FinalCta, Hero, ScoringExplainer, SkillCards, StraightAnswers } from '@/components/marketing'

export const metadata: Metadata = {
  title: 'Free IELTS mock tests with instant band scores',
  description:
    'Sit a full-length, properly timed IELTS Academic mock test in your browser. Listening and ' +
    'Reading marked automatically against the official band tables, AI feedback on Writing, and a ' +
    'Speaking question bank. Free, in English and Uzbek.',
  alternates: { canonical: '/' },
}

export default function LandingPage() {
  return (
    <>
      <Hero />
      <SkillCards />
      <ScoringExplainer />
      <StraightAnswers />
      <FinalCta />
    </>
  )
}
