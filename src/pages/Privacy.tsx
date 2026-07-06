import { Link } from "react-router-dom";

const Privacy = () => (
  <div className="min-h-[100dvh] bg-background text-foreground px-6 py-12">
    <div className="max-w-[680px] mx-auto font-mono-light leading-relaxed">
      <Link
        to="/"
        className="text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground transition-colors"
      >
        ← Back
      </Link>

      <h1 className="font-control text-3xl font-bold mt-8 mb-1">The Booth — Privacy</h1>
      <p className="text-muted-foreground text-sm mb-8">Effective: 29 June 2026</p>

      <p className="mb-6">
        The Booth is run by Stabl Nutrition Pty Ltd (ABN 31 674 471 553), trading as House of Guilty
        ("GUILTY", "we", "us"). This is what happens to what you tell us. No fine-print games.
      </p>

      <p className="mb-6">
        <strong className="text-foreground">The Booth is anonymous by default.</strong> You can confess
        without telling us who you are. We don't ask for your name.
      </p>

      <h2 className="font-control text-lg font-bold mt-8 mb-2">What we collect</h2>
      <ul className="list-disc pl-5 space-y-1 text-muted-foreground mb-2">
        <li>Your confession — the text you submit.</li>
        <li>
          The venue tag — which venue's code you scanned, so we know where a confession came from. This
          identifies the venue, not you.
        </li>
        <li>Your email — only if you choose to leave one to claim your case. Optional and skippable.</li>
        <li>
          Limited technical data — such as your IP address, used briefly to prevent spam and abuse. We
          don't use it to identify you.
        </li>
      </ul>

      <h2 className="font-control text-lg font-bold mt-8 mb-2">Why we collect it</h2>
      <ul className="list-disc pl-5 space-y-1 text-muted-foreground mb-2">
        <li>To generate your verdict.</li>
        <li>To run and improve The Booth.</li>
        <li>To understand which venues confessions come from.</li>
        <li>If you left an email, to contact you about GUILTY. You can opt out any time.</li>
      </ul>

      <h2 className="font-control text-lg font-bold mt-8 mb-2">Who else sees it</h2>
      <ul className="list-disc pl-5 space-y-1 text-muted-foreground mb-2">
        <li>
          Your confession is sent to our AI provider (OpenAI) to generate the verdict and run a safety
          check. We don't permit it to be used to train their models.
        </li>
        <li>We store data with our database provider (Supabase).</li>
        <li>These providers may store or process data overseas, including in the United States.</li>
        <li>We don't sell your data.</li>
      </ul>

      <h2 className="font-control text-lg font-bold mt-8 mb-2">What's public, and what isn't</h2>
      <p className="mb-6 text-muted-foreground">
        We do not publish your confession. After you confess, you get a verdict and a shareable card.
        Whether that card goes anywhere public is entirely your choice — if you share it, you're the one
        publishing it, to whatever you choose. We keep your confession in our own records; we don't post it.
      </p>

      <h2 className="font-control text-lg font-bold mt-8 mb-2">How long we keep it</h2>
      <p className="mb-6 text-muted-foreground">
        We keep confessions while The Booth operates. You can ask us to delete yours (see below).
      </p>

      <h2 className="font-control text-lg font-bold mt-8 mb-2">Children</h2>
      <p className="mb-6 text-muted-foreground">
        The Booth is for people 18 and over. We don't knowingly collect data from anyone under 18.
      </p>

      <h2 className="font-control text-lg font-bold mt-8 mb-2">Your choices</h2>
      <p className="mb-6 text-muted-foreground">
        You can ask what we hold about you, ask us to correct it, or ask us to delete it. To delete a
        specific confession, quote the subject number printed on your verdict card. Email{" "}
        <a href="mailto:contact@houseofguilty.com" className="text-foreground underline underline-offset-4">
          contact@houseofguilty.com
        </a>
        .
      </p>

      <h2 className="font-control text-lg font-bold mt-8 mb-2">Want your confession gone?</h2>
      <p className="mb-6 text-muted-foreground">
        Email{" "}
        <a href="mailto:contact@houseofguilty.com" className="text-foreground underline underline-offset-4">
          contact@houseofguilty.com
        </a>{" "}
        and quote the subject number printed on your verdict card (e.g. "SUBJECT #21"), and we'll delete it.
        Because The Booth is anonymous, if you didn't save your card and left no subject number, we may not
        be able to find a single confession among the rest — that's the anonymity working as intended.
      </p>

      <h2 className="font-control text-lg font-bold mt-8 mb-2">Changes</h2>
      <p className="mb-6 text-muted-foreground">
        We may update this policy. The date above shows the last change.
      </p>

      <h2 className="font-control text-lg font-bold mt-8 mb-2">Contact</h2>
      <p className="mb-6 text-muted-foreground">
        <a href="mailto:contact@houseofguilty.com" className="text-foreground underline underline-offset-4">
          contact@houseofguilty.com
        </a>{" "}
        — Stabl Nutrition Pty Ltd (ABN 31 674 471 553).
      </p>

      <div className="mt-10 pt-6 border-t border-border/30 text-sm">
        <Link to="/terms" className="text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors">
          Terms →
        </Link>
      </div>
    </div>
  </div>
);

export default Privacy;
