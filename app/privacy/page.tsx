/**
 * What this site measures, and for how long.
 *
 * Written because the analytics work records click positions and
 * visitor-typed chat questions, and the repo had nowhere to say so. The
 * retention periods are the part that needs room to be legible, which is why
 * this is a page rather than a line in the footer.
 *
 * Keep it true: if a field is added to the event log, this page changes in the
 * same commit.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { RETENTION_DAYS } from '@/lib/analytics/schema';
import { AnalyticsOptOut } from '@/components/portfolio/AnalyticsOptOut';

export const metadata: Metadata = {
  title: 'Privacy · Alex Rivera',
  description:
    'What this portfolio measures, how long it keeps it, and how to turn it off.',
};

export default function PrivacyPage() {
  return (
    <div className="privacy">
      <header>
        <Link href="/" className="privacy-back">
          ← Back to the portfolio
        </Link>
        <h1>Privacy</h1>
        <p className="privacy-lede">
          This site measures how people use it, with its own code and no
          third-party service. No Google Analytics, no Tag Manager, no
          Microsoft Clarity, no advertising or social pixels, and no
          cross-site tracking of any kind.
        </p>
      </header>

      <section>
        <h2>What is recorded</h2>
        <ul>
          <li>
            <strong>Which sections you read, and for how long.</strong> The
            site is one long page, so the unit is a section rather than a page
            view.
          </li>
          <li>
            <strong>Clicks, including where on the page they landed.</strong>{' '}
            Positions are stored as a fraction of the page, together with the
            page height they were a fraction of. Clicks that hit nothing, and
            repeated clicks in one spot, are recorded separately. They are how
            a broken control is spotted.
          </li>
          <li>
            <strong>How far down you scrolled</strong> and the deepest point
            reached.
          </li>
          <li>
            <strong>How long the visit lasted</strong>, and whether you
            switched to Experience mode.
          </li>
          <li>
            <strong>Questions typed into the chat panel.</strong> See below.
          </li>
          <li>
            <strong>Campaign parameters</strong> from the link you arrived on
            (<code>utm_source</code> and friends), if it carried any.
          </li>
          <li>
            <strong>The page you arrived from</strong>, when your browser sends
            one, the full referring address, plus just its domain so reports
            can group by it. A link you followed from a search engine or a
            social post says so here.
          </li>
          <li>
            <strong>Device type, browser and operating system</strong>, worked
            out from the request your browser sends, coarsely, as &ldquo;mobile,
            Chrome, Android&rdquo;, not a version number.
          </li>
          <li>
            <strong>An approximate location</strong>, city, region and country,
            derived from your network by the host. It is a regional hint, not
            a position: mobile networks routinely route a whole state through
            one city.
          </li>
          <li>
            <strong>The name of your network operator</strong>, the internet
            provider or mobile carrier the request came through, as the host
            reports it. It is how a visit from a company network is told apart
            from one on a home connection; it is not an address, and it does
            not identify you.
          </li>
        </ul>
      </section>

      <section>
        <h2>Your IP address is not stored</h2>
        <p>
          The server sees it, as every web server must, and then keeps only two
          things: a one-way salted hash, used to rate-limit abuse and to count
          distinct visitors, and a coarse network prefix, the first three
          groups of an address, so <code>203.0.113.47</code> becomes{' '}
          <code>203.0.113.0/24</code>. The address itself is never written
          anywhere.
        </p>
      </section>

      <section>
        <h2>Chat questions</h2>
        <p>
          The chat panel answers from a fixed set of approved facts about my
          work. Questions are recorded so I can see what the guide fails to
          answer and write those answers.
        </p>
        <p>
          Before anything is stored, the text is screened. Anything containing
          an email address, a long run of digits, or a link is discarded{' '}
          <em>whole</em> rather than edited. A partly-redacted question still
          reads like a real one, and nobody would notice what it had been. When
          that happens the site keeps only the length of what you typed and the
          reason it was dropped.
        </p>
        <p>
          Some questions are sent to NVIDIA&rsquo;s hosted model service, which
          writes the reply. That happens when no approved answer matches what you
          asked, and when you are several questions into a conversation and the
          question only makes sense in the light of the earlier ones. Up to four
          previous turns go with it, because &ldquo;why wasn&rsquo;t that one in
          production?&rdquo; means nothing on its own.
        </p>
        <p>
          Those turns exist only in the tab you have open. They are never
          written to the server, never put in storage, and never tied to
          anything else about you. After ten minutes with no question the
          panel forgets them and says so in the transcript, so the next thing
          you ask is read on its own rather than as a follow-up to something
          you said before lunch.
        </p>
        <p>
          The model is given a handful of my approved answers and is instructed to
          use nothing else, so the reply is assembled from text I wrote rather than
          from what a model happens to believe about me. It is a language model
          though, and the wording is its own. A question stopped by the screening
          above, or by the guardrails on personal and sensitive topics, is never
          sent at all. Nothing else about you goes with it: no name, no address,
          no identifier.
        </p>
        <p>
          Each answer has a Listen button that reads it aloud, using the speech
          built into your own browser. Nothing is ever spoken until you press it,
          and this site sends nothing anywhere to produce the sound. One caveat worth stating plainly: on some browsers the
          voices themselves are generated by the browser vendor&rsquo;s own
          service rather than on your device, so the text being read may reach
          them. Which voices are local is the browser&rsquo;s business, not mine,
          and I prefer a local one where the browser offers it. Nothing listens:
          there is no microphone, and this site cannot request one.
        </p>
      </section>

      <section>
        <h2>How long it is kept</h2>
        <ul>
          <li>
            <strong>Question text: {RETENTION_DAYS.questionText} days.</strong>{' '}
            The counts and rates outlive the words.
          </li>
          <li>
            <strong>Click positions: {RETENTION_DAYS.clickPoints} days.</strong>
          </li>
          <li>
            <strong>Everything else: {RETENTION_DAYS.events} days.</strong>
          </li>
        </ul>
        <p>
          Deletion is automatic. Nothing is sold, shared, or sent anywhere: the
          data sits in a database attached to this site and is read by nobody
          but me.
        </p>
      </section>

      <section>
        <h2>Turning it off</h2>
        <AnalyticsOptOut />
        <p>
          Two identifiers make this work, and neither carries anything about
          you: a random id for the current browser tab, and a random id for
          this browser so a second visit is not counted as a stranger. Both are
          stored by your browser, not in a cookie, and clearing site data
          removes them.
        </p>
      </section>

      <section>
        <h2>Getting in touch</h2>
        <p>
          If you want to know what is recorded against your browser, or want it
          removed, email me and say roughly when you visited at{' '}
          <a href="mailto:alex@example.com">
            alex@example.com
          </a>
          . There is no account to look you up by, so an approximate time is
          genuinely what I need.
        </p>
      </section>
    </div>
  );
}
