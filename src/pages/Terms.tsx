import { Link } from "react-router-dom";

const Terms = () => (
  <div className="min-h-[100dvh] bg-background text-foreground px-6 py-12">
    <div className="max-w-[680px] mx-auto font-mono-light leading-relaxed">
      <Link
        to="/"
        className="text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground transition-colors"
      >
        ← Back
      </Link>

      <h1 className="font-control text-3xl font-bold mt-8 mb-1">The Booth — the short version</h1>
      <p className="text-muted-foreground text-sm mb-8">Effective: 10 July 2026</p>

      <ul className="list-disc pl-5 space-y-4 text-muted-foreground">
        <li>You must be 18 or over to use The Booth.</li>
        <li>
          Confess your own stuff. Don't post other people's private information, and don't name real people
          or businesses.
        </li>
        <li>
          Your confession may be published — anonymously — on our public wall. We check every one first, and
          most aren't published. You also get a card to share yourself, if you want.
        </li>
        <li>Your verdict is for entertainment. The Booth is not advice.</li>
        <li>
          If you're in crisis, The Booth isn't the place — in Australia, Lifeline is{" "}
          <a href="tel:131114" className="text-foreground underline underline-offset-4">
            13 11 14
          </a>
          .
        </li>
      </ul>

      <div className="mt-10 pt-6 border-t border-border/30 text-sm">
        <Link to="/privacy" className="text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors">
          Privacy →
        </Link>
      </div>
    </div>
  </div>
);

export default Terms;
