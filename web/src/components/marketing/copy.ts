/**
 * Every user-facing string on the public site and the auth pages.
 *
 * One dictionary per language so a translation pass is a data change, not a
 * rewrite. English is the source of truth: `Copy` is derived from it, so a
 * missing or misspelt Uzbek key is a type error, not a blank label at runtime.
 */

export type Lang = 'en' | 'uz'

export const LANGS: readonly Lang[] = ['en', 'uz']

export const LANG_NAMES: Record<Lang, string> = { en: 'English', uz: "O'zbekcha" }

const en = {
  brand: {
    name: 'IELTS Prep',
    tagline: 'Free IELTS mock tests for Uzbek students',
  },

  nav: {
    calculator: 'Band calculator',
    scoring: 'How scoring works',
    skills: 'What you can practise',
    login: 'Log in',
    register: 'Start free',
    menu: 'Menu',
    closeMenu: 'Close menu',
    openMenu: 'Open menu',
    dashboard: 'Dashboard',
    tests: 'Tests',
    speaking: 'Speaking',
    results: 'Results',
    profile: 'Profile',
    account: 'Account',
    logout: 'Log out',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    language: 'Language',
    skipToContent: 'Skip to content',
  },

  hero: {
    eyebrow: 'Free · Full-length · Properly timed',
    title: 'Sit a real IELTS mock test. See your band the minute you finish.',
    subtitle:
      'Listening and Reading are marked automatically against the official conversion tables. ' +
      'Writing gets AI feedback on all four band descriptors. Speaking gives you the real question ' +
      'bank and a cue card timer. Everything is free.',
    ctaPrimary: 'Start a free mock test',
    ctaPrimarySignedIn: 'Go to my dashboard',
    ctaSecondary: 'Open the band calculator',
    note: 'No card, no trial, no paid tier. We ask for an email so your band history is still here next month.',
    points: [
      'Academic module, 4 skills',
      'Timer runs on the server',
      'English + Uzbek interface',
    ],
    sample: {
      label: 'Example result',
      test: 'Listening · Practice test 1',
      rawLabel: 'Correct answers',
      raw: '32 / 40',
      bandLabel: 'Band',
      band: '7.5',
      footnote: 'An illustration of the results screen, not a real student.',
    },
  },

  skills: {
    title: 'Four skills, the way the real exam runs them',
    subtitle: 'No shortened samples. Each test is the length and format you will sit on exam day.',
    aiBadge: 'AI feedback',
    autoBadge: 'Auto-marked',
    manualBadge: 'Self-review',
    items: [
      {
        key: 'listening',
        name: 'Listening',
        spec: '4 sections · 40 questions · 30 min + 2 min transfer',
        body: 'One continuous recording, one play-through, exactly like the test centre. Answers are marked against the answer key and converted with the published table.',
        badge: 'Auto-marked',
      },
      {
        key: 'reading',
        name: 'Reading',
        spec: '3 Academic passages · 40 questions · 60 min',
        body: 'Split screen with the passage on one side and the questions on the other. Highlight as you read. Every question type, including the word-limit rules that cost real marks.',
        badge: 'Auto-marked',
      },
      {
        key: 'writing',
        name: 'Writing',
        spec: 'Task 1 + Task 2 · 60 min · live word count',
        body: 'Write under the clock, then get a band for Task Achievement, Coherence and Cohesion, Lexical Resource and Grammatical Range, with the sentences that cost you marks pointed out.',
        badge: 'AI feedback',
      },
      {
        key: 'speaking',
        name: 'Speaking',
        spec: 'Parts 1–3 · 1 min cue-card prep · record in the browser',
        body: 'Real examiner questions with model answers and useful phrases. Record yourself and listen back. Your recordings stay on your device.',
        badge: 'Self-review',
      },
    ],
    speakingNote: 'Speaking has no AI examiner yet. When it does, we will say so here.',
  },

  scoring: {
    title: 'How a raw score becomes a band',
    subtitle:
      'Nothing here is a guess. Listening and Reading use the published conversion tables, and the ' +
      'overall band uses the official rounding rule. Move the slider and watch it work.',
    rawLabel: 'Correct answers out of 40',
    bandLabel: 'Band score',
    skillLabel: 'Test',
    listening: 'Listening',
    reading: 'Academic Reading',
    rangeNote: (min: number, max: number, band: string) =>
      `${min}–${max} correct answers is band ${band} on this table.`,
    tableNote:
      'These tables are indicative and are being checked against official Cambridge material before launch.',
    liveNote: 'Checked against the scoring service.',
    overallTitle: 'The overall band',
    overallBody:
      'Your four skill bands are averaged, then the average is pushed to the nearest half band — ' +
      'and a tie goes up. An average ending in .25 goes up to the next half band; .75 goes up to the next whole band.',
    overallExample: '6.5 + 6.5 + 5.0 + 7.0 = 25 ÷ 4 = 6.25 → overall 6.5',
    overallCta: 'Try it with your own scores',
  },

  honest: {
    title: 'Straight answers',
    items: [
      {
        q: 'Is it really free?',
        a: 'Yes. There is no paid tier, no trial and no card field anywhere in the product. If that ever changes, the tests you have already taken stay free.',
      },
      {
        q: 'Why do I need an account?',
        a: 'So your band history survives closing the tab. Attempts, answers and scores are stored against your account — that is the whole point of taking a mock test more than once.',
      },
      {
        q: 'How accurate is the band?',
        a: 'Listening and Reading are as accurate as the answer key and the conversion table, which are the published ones. Writing is an AI estimate against the official descriptors — treat it as useful feedback, not an official result.',
      },
      {
        q: 'Will it work on my phone?',
        a: 'Yes. The whole product, including the exam runner, is built for a 360px screen and a slow connection first.',
      },
    ],
  },

  finalCta: {
    title: 'Find out your band today, not on exam day.',
    body: 'Create an account, pick a test, and start the clock. It takes about a minute to sign up.',
    button: 'Create a free account',
    secondary: 'I already have an account',
  },

  footer: {
    blurb:
      'Free, full-length IELTS Academic mock tests with instant band scores. Built for students in Uzbekistan.',
    product: 'Product',
    tools: 'Tools',
    account: 'Account',
    calculator: 'Band calculator',
    scoring: 'How scoring works',
    skills: 'What you can practise',
    login: 'Log in',
    register: 'Create an account',
    forgot: 'Forgot your password',
    rights: 'Not affiliated with, endorsed by or connected to the IELTS partners.',
    madeFor: 'Made for Uzbek students.',
  },

  calculator: {
    metaTitle: 'IELTS band score calculator',
    metaDescription:
      'Work out your overall IELTS band from your Listening, Reading, Writing and Speaking scores, with the official rounding rule explained. Free, no sign-up.',
    title: 'IELTS band score calculator',
    intro:
      'Enter the band you got — or the band you are aiming for — in each skill. The overall band uses the official rounding rule: the average is moved to the nearest half band, and a tie goes up.',
    listening: 'Listening',
    reading: 'Reading',
    writing: 'Writing',
    speaking: 'Speaking',
    overall: 'Overall band',
    averageLabel: 'Average of your four scores',
    explanationTitle: 'Why this number',
    share: 'Copy a link to this result',
    shared: 'Link copied',
    shareFailed: 'Copying is blocked in this browser — the address bar already holds the link.',
    reset: 'Reset to 6.0',
    serverChecked: 'Checked against our scoring service.',
    serverOffline: 'Calculated in your browser — the scoring service is not reachable right now.',
    serverMismatch:
      'Our scoring service returned a different number. Trust the service, and please tell us: this is a bug.',
    rulesTitle: 'The rounding rule, in full',
    rules: [
      'Add the four skill bands and divide by four.',
      'If the average lands exactly on a half or whole band, that is your overall band.',
      'An average ending in .25 rounds up to the next half band (6.25 → 6.5).',
      'An average ending in .75 rounds up to the next whole band (6.75 → 7.0).',
      'Anything else goes to the nearer half band (6.125 → 6.0, 6.375 → 6.5).',
    ],
    ctaTitle: 'Want a real band instead of an estimate?',
    ctaBody: 'Take a full-length timed mock test and get a marked Listening or Reading band in under an hour.',
    ctaButton: 'Start a free mock test',
  },

  auth: {
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'Password',
    newPasswordLabel: 'New password',
    confirmLabel: 'Confirm password',
    nameLabel: 'Full name',
    nameOptional: 'optional',
    namePlaceholder: 'Sardor Karimov',
    show: 'Show password',
    hide: 'Hide password',
    strength: 'Password strength',
    strengthLevels: ['Too short', 'Weak', 'Fair', 'Good', 'Strong'],
    strengthHint: 'At least 8 characters. Mixing letters, numbers and a symbol makes it much harder to guess.',

    login: {
      title: 'Log in',
      subtitle: 'Pick up where you left off.',
      submit: 'Log in',
      submitting: 'Logging in…',
      forgot: 'Forgot your password?',
      noAccount: 'No account yet?',
      registerLink: 'Create one free',
    },
    register: {
      title: 'Create your account',
      subtitle: 'Free, and it takes about a minute.',
      submit: 'Create account',
      submitting: 'Creating your account…',
      haveAccount: 'Already have an account?',
      loginLink: 'Log in',
      verifyNote: 'We will email you a link to confirm your address. You can start a test before you confirm it.',
    },
    forgot: {
      title: 'Forgot your password',
      subtitle: 'Give us the email you signed up with and we will send a reset link.',
      submit: 'Send the reset link',
      submitting: 'Sending…',
      backToLogin: 'Back to log in',
      sentTitle: 'Check your inbox',
    },
    reset: {
      title: 'Choose a new password',
      subtitle: 'Pick something you have not used on another site.',
      submit: 'Save the new password',
      submitting: 'Saving…',
      doneTitle: 'Password changed',
      doneBody: 'You can log in with your new password now.',
      goToLogin: 'Go to log in',
      missingToken:
        'This link has no reset code in it. Reset links expire after an hour — ask for a fresh one.',
      requestNew: 'Request a new link',
    },
    verify: {
      title: 'Verify your email',
      checking: 'Checking your link…',
      doneTitle: 'Email verified',
      doneBody: 'Thanks — your address is confirmed.',
      goToDashboard: 'Go to my dashboard',
      goToLogin: 'Go to log in',
      missingToken:
        'This page needs the verification link from your email. Open the link we sent you, or log in and ask for a new one.',
      failedTitle: 'That link did not work',
    },

    errors: {
      emailRequired: 'Enter your email address.',
      emailInvalid: 'That does not look like an email address.',
      passwordRequired: 'Enter your password.',
      passwordShort: 'Passwords need at least 8 characters.',
      passwordLong: 'That password is too long — 128 characters maximum.',
      confirmMismatch: 'The two passwords do not match.',
      nameLong: 'That name is too long — 120 characters maximum.',
      invalidCredentials: 'Incorrect email or password. Check both and try again.',
      emailTaken: 'That email already has an account. Log in instead, or reset the password.',
      badToken: 'This link has expired or has already been used. Ask for a new one.',
      rateLimited: 'Too many attempts. Wait a minute and try again.',
      server: 'Something broke on our side. Try again in a moment.',
      offline: 'We could not reach the server. Check your connection and try again.',
      unknown: 'Something went wrong. Try again.',
    },
  },
}

export type Copy = typeof en

const uz: Copy = {
  brand: {
    name: 'IELTS Prep',
    tagline: "O'zbek talabalari uchun bepul IELTS sinov testlari",
  },

  nav: {
    calculator: 'Ball kalkulyatori',
    scoring: 'Ball qanday hisoblanadi',
    skills: 'Nimalarni mashq qilasiz',
    login: 'Kirish',
    register: 'Bepul boshlash',
    menu: 'Menyu',
    closeMenu: 'Menyuni yopish',
    openMenu: 'Menyuni ochish',
    dashboard: 'Boshqaruv paneli',
    tests: 'Testlar',
    speaking: 'Speaking',
    results: 'Natijalar',
    profile: 'Profil',
    account: 'Hisob',
    logout: 'Chiqish',
    theme: 'Mavzu',
    themeLight: 'Yorug‘',
    themeDark: 'Qorong‘i',
    themeSystem: 'Tizim',
    language: 'Til',
    skipToContent: 'Asosiy qismga o‘tish',
  },

  hero: {
    eyebrow: 'Bepul · To‘liq · Vaqt bilan',
    title: 'Haqiqiy IELTS sinov testini yeching. Ballingizni darrov ko‘ring.',
    subtitle:
      'Listening va Reading rasmiy konvertatsiya jadvallari bo‘yicha avtomatik tekshiriladi. ' +
      'Writing to‘rtta rasmiy mezon bo‘yicha sun’iy intellekt izohini oladi. Speaking uchun haqiqiy ' +
      'savollar bazasi va cue card taymeri bor. Hammasi bepul.',
    ctaPrimary: 'Bepul sinov testini boshlash',
    ctaPrimarySignedIn: 'Boshqaruv panelimga o‘tish',
    ctaSecondary: 'Ball kalkulyatorini ochish',
    note: 'Karta ham, sinov muddati ham, pullik tarif ham yo‘q. Email faqat natijalaringiz saqlanib qolishi uchun kerak.',
    points: [
      'Academic modul, 4 ta ko‘nikma',
      'Taymer serverda ishlaydi',
      'Interfeys o‘zbek va ingliz tilida',
    ],
    sample: {
      label: 'Namuna natija',
      test: 'Listening · 1-mashq testi',
      rawLabel: 'To‘g‘ri javoblar',
      raw: '32 / 40',
      bandLabel: 'Ball',
      band: '7.5',
      footnote: 'Bu natijalar ekranining namunasi, haqiqiy talaba natijasi emas.',
    },
  },

  skills: {
    title: 'To‘rtta ko‘nikma — imtihondagidek',
    subtitle: 'Qisqartirilgan namunalar yo‘q. Har bir test imtihon kunidagi uzunlik va formatda.',
    aiBadge: 'AI izohi',
    autoBadge: 'Avtomatik tekshiriladi',
    manualBadge: 'O‘zingiz tahlil qilasiz',
    items: [
      {
        key: 'listening',
        name: 'Listening',
        spec: '4 bo‘lim · 40 savol · 30 daqiqa + 2 daqiqa ko‘chirish',
        body: 'Bitta uzluksiz audio, faqat bir marta eshitiladi — xuddi imtihon markazidagidek. Javoblar kalit bo‘yicha tekshirilib, rasmiy jadval orqali ballga aylantiriladi.',
        badge: 'Avtomatik tekshiriladi',
      },
      {
        key: 'reading',
        name: 'Reading',
        spec: '3 ta Academic matn · 40 savol · 60 daqiqa',
        body: 'Ekranning bir tomonida matn, ikkinchisida savollar. O‘qiyotganda belgilab boring. Barcha savol turlari, jumladan haqiqiy ballga tushadigan so‘z chegarasi qoidalari.',
        badge: 'Avtomatik tekshiriladi',
      },
      {
        key: 'writing',
        name: 'Writing',
        spec: 'Task 1 + Task 2 · 60 daqiqa · so‘z hisoblagich',
        body: 'Vaqt bilan yozing, so‘ng Task Achievement, Coherence and Cohesion, Lexical Resource va Grammatical Range bo‘yicha ball oling — qaysi jumlalar ballni tushirgani ko‘rsatiladi.',
        badge: 'AI izohi',
      },
      {
        key: 'speaking',
        name: 'Speaking',
        spec: '1–3-qismlar · 1 daqiqa tayyorgarlik · brauzerda yozib olish',
        body: 'Haqiqiy imtihon savollari, namunaviy javoblar va foydali iboralar. O‘zingizni yozib oling va tinglang. Yozuvlar qurilmangizda qoladi.',
        badge: 'O‘zingiz tahlil qilasiz',
      },
    ],
    speakingNote: 'Speaking uchun hozircha AI imtihonchi yo‘q. Paydo bo‘lganda shu yerda yozamiz.',
  },

  scoring: {
    title: 'To‘g‘ri javoblar ballga qanday aylanadi',
    subtitle:
      'Bu yerda taxmin yo‘q. Listening va Reading e’lon qilingan jadvallardan foydalanadi, umumiy ball esa ' +
      'rasmiy yaxlitlash qoidasi bo‘yicha chiqadi. Slayderni suring va o‘zingiz ko‘ring.',
    rawLabel: '40 tadan nechtasi to‘g‘ri',
    bandLabel: 'Ball',
    skillLabel: 'Test',
    listening: 'Listening',
    reading: 'Academic Reading',
    rangeNote: (min: number, max: number, band: string) =>
      `Bu jadvalda ${min}–${max} ta to‘g‘ri javob ${band} ballga teng.`,
    tableNote:
      'Jadvallar taxminiy: ishga tushirishdan oldin rasmiy Cambridge materiallari bilan solishtirilmoqda.',
    liveNote: 'Ball xizmati bilan solishtirildi.',
    overallTitle: 'Umumiy ball',
    overallBody:
      'To‘rtta ballning o‘rtachasi olinadi, keyin eng yaqin yarim ballga suriladi — teng bo‘lsa yuqoriga. ' +
      'O‘rtacha .25 bilan tugasa keyingi yarim ballga, .75 bilan tugasa keyingi butun ballga ko‘tariladi.',
    overallExample: '6.5 + 6.5 + 5.0 + 7.0 = 25 ÷ 4 = 6.25 → umumiy 6.5',
    overallCta: 'O‘z ballaringiz bilan sinab ko‘ring',
  },

  honest: {
    title: 'Ochiq javoblar',
    items: [
      {
        q: 'Rostdan ham bepulmi?',
        a: 'Ha. Pullik tarif ham, sinov muddati ham yo‘q, hech qayerda karta so‘ralmaydi. Agar bu o‘zgarsa, siz yechgan testlar baribir bepul qoladi.',
      },
      {
        q: 'Nega hisob kerak?',
        a: 'Natijalaringiz brauzerni yopganingizda yo‘qolmasligi uchun. Urinishlar, javoblar va ballar hisobingizga bog‘lanadi — sinov testini bir necha marta yechishning ma’nosi ham shunda.',
      },
      {
        q: 'Ball qanchalik aniq?',
        a: 'Listening va Reading javob kaliti va konvertatsiya jadvali qanchalik aniq bo‘lsa, shunchalik aniq — ikkalasi ham e’lon qilingan manbalardan. Writing esa rasmiy mezonlar asosidagi AI bahosi: uni foydali izoh deb qarang, rasmiy natija emas.',
      },
      {
        q: 'Telefonimda ishlaydimi?',
        a: 'Ha. Butun mahsulot, imtihon ekrani ham, avvalo 360px ekran va sekin internet uchun qilingan.',
      },
    ],
  },

  finalCta: {
    title: 'Ballingizni imtihon kuni emas, bugun biling.',
    body: 'Hisob oching, test tanlang va taymerni ishga tushiring. Ro‘yxatdan o‘tish bir daqiqa oladi.',
    button: 'Bepul hisob ochish',
    secondary: 'Hisobim bor',
  },

  footer: {
    blurb:
      'Bepul, to‘liq IELTS Academic sinov testlari va darhol chiqadigan ballar. O‘zbekistondagi talabalar uchun.',
    product: 'Mahsulot',
    tools: 'Vositalar',
    account: 'Hisob',
    calculator: 'Ball kalkulyatori',
    scoring: 'Ball qanday hisoblanadi',
    skills: 'Nimalarni mashq qilasiz',
    login: 'Kirish',
    register: 'Hisob ochish',
    forgot: 'Parolni unutdingizmi',
    rights: 'IELTS hamkorlari bilan hech qanday aloqasi yo‘q va ular tomonidan tasdiqlanmagan.',
    madeFor: 'O‘zbek talabalari uchun qilingan.',
  },

  calculator: {
    metaTitle: 'IELTS ball kalkulyatori',
    metaDescription:
      'Listening, Reading, Writing va Speaking ballaringizdan umumiy IELTS ballini hisoblang — rasmiy yaxlitlash qoidasi tushuntirilgan holda. Bepul, ro‘yxatdan o‘tmasdan.',
    title: 'IELTS ball kalkulyatori',
    intro:
      'Har bir ko‘nikma uchun olgan — yoki mo‘ljallayotgan — ballingizni kiriting. Umumiy ball rasmiy qoida bo‘yicha chiqadi: o‘rtacha eng yaqin yarim ballga suriladi, teng bo‘lsa yuqoriga.',
    listening: 'Listening',
    reading: 'Reading',
    writing: 'Writing',
    speaking: 'Speaking',
    overall: 'Umumiy ball',
    averageLabel: 'To‘rtta ballning o‘rtachasi',
    explanationTitle: 'Nega shunday',
    share: 'Natija havolasini nusxalash',
    shared: 'Havola nusxalandi',
    shareFailed: 'Bu brauzerda nusxalash bloklangan — havola manzil satrida turibdi.',
    reset: '6.0 ga qaytarish',
    serverChecked: 'Ball xizmatimiz bilan solishtirildi.',
    serverOffline: 'Brauzeringizda hisoblandi — ball xizmati hozir mavjud emas.',
    serverMismatch:
      'Ball xizmatimiz boshqa natija qaytardi. Xizmatga ishoning va bizga xabar bering: bu xatolik.',
    rulesTitle: 'Yaxlitlash qoidasi to‘liq',
    rules: [
      'To‘rtta ballni qo‘shing va to‘rtga bo‘ling.',
      'O‘rtacha aniq yarim yoki butun ballga tushsa, o‘sha umumiy ballingiz.',
      '.25 bilan tugagan o‘rtacha keyingi yarim ballga ko‘tariladi (6.25 → 6.5).',
      '.75 bilan tugagan o‘rtacha keyingi butun ballga ko‘tariladi (6.75 → 7.0).',
      'Qolgan hollarda eng yaqin yarim ballga suriladi (6.125 → 6.0, 6.375 → 6.5).',
    ],
    ctaTitle: 'Taxmin emas, haqiqiy ball kerakmi?',
    ctaBody: 'To‘liq, vaqt bilan sinov testini yeching va bir soatdan kamroq vaqtda tekshirilgan Listening yoki Reading ballini oling.',
    ctaButton: 'Bepul sinov testini boshlash',
  },

  auth: {
    emailLabel: 'Email',
    emailPlaceholder: 'siz@example.com',
    passwordLabel: 'Parol',
    newPasswordLabel: 'Yangi parol',
    confirmLabel: 'Parolni takrorlang',
    nameLabel: 'To‘liq ism',
    nameOptional: 'ixtiyoriy',
    namePlaceholder: 'Sardor Karimov',
    show: 'Parolni ko‘rsatish',
    hide: 'Parolni yashirish',
    strength: 'Parol kuchi',
    strengthLevels: ['Juda qisqa', 'Zaif', 'O‘rtacha', 'Yaxshi', 'Kuchli'],
    strengthHint: 'Kamida 8 ta belgi. Harf, raqam va belgini aralashtirsangiz, topish ancha qiyinlashadi.',

    login: {
      title: 'Kirish',
      subtitle: 'To‘xtagan joyingizdan davom eting.',
      submit: 'Kirish',
      submitting: 'Kirilmoqda…',
      forgot: 'Parolni unutdingizmi?',
      noAccount: 'Hisobingiz yo‘qmi?',
      registerLink: 'Bepul oching',
    },
    register: {
      title: 'Hisob oching',
      subtitle: 'Bepul va bir daqiqa vaqt oladi.',
      submit: 'Hisob ochish',
      submitting: 'Hisob ochilmoqda…',
      haveAccount: 'Hisobingiz bormi?',
      loginLink: 'Kirish',
      verifyNote: 'Manzilingizni tasdiqlash uchun havola yuboramiz. Tasdiqlashdan oldin ham test boshlashingiz mumkin.',
    },
    forgot: {
      title: 'Parolni unutdingizmi',
      subtitle: 'Ro‘yxatdan o‘tgan emailingizni yozing, tiklash havolasini yuboramiz.',
      submit: 'Tiklash havolasini yuborish',
      submitting: 'Yuborilmoqda…',
      backToLogin: 'Kirishga qaytish',
      sentTitle: 'Pochtangizni tekshiring',
    },
    reset: {
      title: 'Yangi parol tanlang',
      subtitle: 'Boshqa saytlarda ishlatmagan parolni tanlang.',
      submit: 'Yangi parolni saqlash',
      submitting: 'Saqlanmoqda…',
      doneTitle: 'Parol o‘zgartirildi',
      doneBody: 'Endi yangi parol bilan kirishingiz mumkin.',
      goToLogin: 'Kirishga o‘tish',
      missingToken:
        'Bu havolada tiklash kodi yo‘q. Tiklash havolalari bir soatdan keyin eskiradi — yangisini so‘rang.',
      requestNew: 'Yangi havola so‘rash',
    },
    verify: {
      title: 'Emailni tasdiqlash',
      checking: 'Havola tekshirilmoqda…',
      doneTitle: 'Email tasdiqlandi',
      doneBody: 'Rahmat — manzilingiz tasdiqlandi.',
      goToDashboard: 'Boshqaruv panelimga o‘tish',
      goToLogin: 'Kirishga o‘tish',
      missingToken:
        'Bu sahifaga emailingizdagi tasdiqlash havolasi kerak. Biz yuborgan havolani oching yoki kirib, yangisini so‘rang.',
      failedTitle: 'Havola ishlamadi',
    },

    errors: {
      emailRequired: 'Email manzilingizni kiriting.',
      emailInvalid: 'Bu email manzilga o‘xshamayapti.',
      passwordRequired: 'Parolingizni kiriting.',
      passwordShort: 'Parol kamida 8 ta belgidan iborat bo‘lishi kerak.',
      passwordLong: 'Parol juda uzun — ko‘pi bilan 128 ta belgi.',
      confirmMismatch: 'Ikkala parol bir xil emas.',
      nameLong: 'Ism juda uzun — ko‘pi bilan 120 ta belgi.',
      invalidCredentials: 'Email yoki parol noto‘g‘ri. Ikkalasini tekshirib, qayta urinib ko‘ring.',
      emailTaken: 'Bu email bilan hisob allaqachon bor. Kiring yoki parolni tiklang.',
      badToken: 'Bu havola eskirgan yoki allaqachon ishlatilgan. Yangisini so‘rang.',
      rateLimited: 'Juda ko‘p urinish. Bir daqiqa kutib, qayta urinib ko‘ring.',
      server: 'Bizning tomonda xatolik yuz berdi. Birozdan keyin urinib ko‘ring.',
      offline: 'Serverga ulana olmadik. Internetni tekshirib, qayta urinib ko‘ring.',
      unknown: 'Nimadir xato ketdi. Qayta urinib ko‘ring.',
    },
  },
}

export const dictionary: Record<Lang, Copy> = { en, uz }
