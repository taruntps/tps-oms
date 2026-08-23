// Daily-rotating thoughts for the morning greeting popup.
// A curated mix: motivation, wellness / productivity tips, and the occasional
// TPS value or light regulatory nugget. Same one shown to everyone each day,
// chosen by day-of-year so it changes daily and repeats only after ~2 months.
//
// No external API — reliable, free, works offline.

export const dailyThoughts: string[] = [
  // — Motivation —
  'Small, steady progress beats a burst of effort you can’t sustain. Do one real thing today.',
  'Discipline is choosing what you want most over what you want now.',
  'You don’t have to be great to start, but you have to start to be great.',
  'The work you do quietly today becomes the reputation you enjoy tomorrow.',
  'Done is better than perfect — and shipping teaches faster than planning.',
  'A goal without a date is just a wish. Give today’s task a deadline.',
  'Motivation gets you started; habit keeps you going.',
  'The best time to fix a problem is while it is still small.',
  'Focus is saying no to a hundred good ideas so one gets finished.',
  'Every expert was once a beginner who refused to quit.',
  'Energy flows where attention goes — choose where it goes on purpose.',
  'You are one clear decision away from a very different day.',
  'Slow is smooth, smooth is fast. Rushing rarely saves time.',
  'Do the hard task first; the rest of the day feels lighter.',
  'Consistency compounds. Show up even when it is boring.',
  'Progress, not perfection, is the target today.',
  'Your future self is built by the promises you keep to yourself now.',
  'Difficult roads often lead to beautiful destinations.',
  'Start where you are, use what you have, do what you can.',
  'The person who moves a mountain begins by carrying away small stones.',

  // — Wellness / balance —
  'Drink a glass of water before your first coffee. Your focus will thank you.',
  'Stand up and stretch every hour — your back is not a chair.',
  'A short walk after lunch clears the mind better than a longer break at your desk.',
  'Protect your first hour: no notifications, just one important task.',
  'Sleep is not lost time — it is when tomorrow’s clarity is made.',
  'Take three slow breaths before a hard conversation. It changes the tone.',
  'Rest is productive. A tired mind makes expensive mistakes.',
  'Eat like you respect the work you have to do after the meal.',
  'Step outside for two minutes of sunlight — it resets your whole day.',
  'Silence your phone for one deep-work block. The world will wait.',
  'Gratitude turns what you have into enough. Name one good thing today.',
  'A calm mind is a competitive advantage. Guard yours.',
  'Say “no” kindly to protect a “yes” that matters more.',
  'Your posture shapes your mood. Sit tall, breathe deep.',

  // — Productivity / work craft —
  'Plan tomorrow before you leave today — start the morning already moving.',
  'If it takes less than two minutes, do it now.',
  'Clarity first: define “done” before you begin the task.',
  'Batch similar work together — switching costs you more than you think.',
  'Write it down. A short note beats a strong memory.',
  'Under-promise the timeline, over-deliver the work.',
  'One well-checked document saves ten follow-up emails.',
  'Close the loop: a quick “received, working on it” builds trust.',
  'Review before you send. Two minutes now, no apology later.',
  'The best system is the one you will actually follow tomorrow.',
  'Measure what matters, then improve it a little each week.',
  'A clean desk and a clear inbox make room for clear thinking.',
  'Ask “what is the real problem?” before jumping to the fix.',
  'Automate the boring, so you can focus on the valuable.',

  // — Client / service values (TPS) —
  'A client remembers how you handled the delay more than the delay itself.',
  'Trust is earned in drops and lost in buckets — protect every drop.',
  'Answer the question they asked, then the one they meant to ask.',
  'Quality is not an act, it is a habit — build it into every report.',
  'Compliance done well is a service, not a hurdle.',
  'Follow up before the client has to chase you. That is the whole game.',
  'Every file you touch carries the TPS name — make it worthy of it.',
  'Clear communication is half of good consulting.',
  'When in doubt, over-document. Future-you will be grateful.',
  'Serve the client’s goal, not just the client’s request.',
  'Reliability is the quietest form of excellence.',
  'A promised date kept is worth more than a fancy report late.',

  // — Light regulatory nuggets —
  'Good documentation is not paperwork — it is proof that the system works.',
  'A label is a legal document; treat every claim on it with care.',
  'Traceability turns a recall from a crisis into a controlled action.',
  'Audits reward the prepared, not the lucky. Keep records current.',
  'The strongest compliance culture is built between audits, not during them.',
  'Read the regulation once for the rule, twice for the intent.',
  'A corrective action without a root cause is just a temporary patch.',
  'Standards change — the habit of checking sources should not.',
  'Risk you have written down is risk you can manage.',
  'In regulatory work, “approximately” is rarely good enough.',
  'A well-kept register today is a smooth renewal tomorrow.',
  'Verify, then trust. Especially with data that leaves your hands.',
]

// IST "now", regardless of the viewer's timezone (staff are in India, but this
// keeps the daily thought and greeting consistent for everyone). Built from
// Intl parts — no fragile string re-parsing — so it's reliable on iOS Safari too.
function istNow(): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
  }).formatToParts(new Date())
  const g = (t: string) => Number(parts.find(x => x.type === t)?.value)
  const hour = g('hour') % 24 // some engines emit "24" for midnight
  // Constructed in local tz, but we only read Y/M/D and hour back off it — those
  // are the IST numbers passed in, so the viewer's own timezone never leaks in.
  return new Date(g('year'), g('month') - 1, g('day'), hour, g('minute'), g('second'))
}

// Day-of-year (1–366) in IST, used to pick the same thought for everyone each day.
function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0)
  const diff = d.getTime() - start.getTime()
  return Math.floor(diff / 86_400_000)
}

/** The thought for today — deterministic per calendar day (IST), same for all users. */
export function thoughtOfTheDay(): string {
  const idx = dayOfYear(istNow()) % dailyThoughts.length
  return dailyThoughts[idx]
}

/** Time-of-day greeting word in IST: morning (<12), afternoon (<17), else evening. */
export function greetWord(): 'morning' | 'afternoon' | 'evening' {
  const h = istNow().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

// A short, warm well-wish shown under the name in the greeting — rotates by day.
const warmLines: string[] = [
  'Hope you’re doing well today.',
  'Wishing you a productive day ahead.',
  'Hope you’re having a wonderful day.',
  'Here’s to a calm, focused day.',
  'Hope everything’s going smoothly.',
  'May today bring good progress.',
  'Glad to have you here — let’s make today count.',
]

/** The day's warm well-wish line for the greeting modal. */
export function warmLine(): string {
  return warmLines[dayOfYear(istNow()) % warmLines.length]
}
