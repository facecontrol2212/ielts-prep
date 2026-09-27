import type { Metadata } from 'next'

import { BandCalculator } from '@/components/marketing'

const title = 'IELTS band score calculator'
const description =
  'Work out your overall IELTS band from your Listening, Reading, Writing and Speaking scores, ' +
  'with the official rounding rule explained in plain language. Free, no sign-up, works offline.'

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    'IELTS band score calculator',
    'IELTS overall band',
    'IELTS rounding rule',
    'IELTS ball kalkulyatori',
    'calculate IELTS score',
  ],
  alternates: { canonical: '/calculator' },
  openGraph: {
    type: 'website',
    title: `${title} · IELTS Prep`,
    description,
    url: '/calculator',
  },
  twitter: { card: 'summary', title, description },
}

export default function CalculatorPage() {
  return <BandCalculator />
}
