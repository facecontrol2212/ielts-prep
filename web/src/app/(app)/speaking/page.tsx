import type { Metadata } from 'next'

import { SpeakingPractice } from '@/components/speaking/speaking-practice'

export const metadata: Metadata = {
  title: 'Speaking practice',
  description:
    'IELTS Speaking Parts 1, 2 and 3 with a cue card timer and a recorder. Recordings stay in ' +
    'your browser — nothing is uploaded.',
}

export default function SpeakingPage() {
  return <SpeakingPractice />
}
