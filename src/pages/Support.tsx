import { Link } from "react-router-dom";

// /support — reachable from the permanent Support link beside Terms and
// Privacy (LegalLinks). Styled EXACTLY like /terms and /privacy: same shell,
// same type, nothing that marks it as different — no wordmark, no glow,
// nothing that makes it feel like part of the product. It is always
// reachable and never conditional, so opening it signals nothing about any
// particular confession (see the held/blocked note in round.ts).
const Support = () => (
  <div className="min-h-[100dvh] bg-background text-foreground px-6 py-12">
    <div className="max-w-[680px] mx-auto font-mono-light leading-relaxed">
      <Link
        to="/"
        className="text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground transition-colors"
      >
        ← Back
      </Link>

      <h1 className="font-control text-3xl font-bold mt-8 mb-8">Support</h1>

      {/* The opening line — the Booth's register: flat and honest, nothing
          that handles the reader. ONE sentence: an instruction ("talk to a
          person") implied the Booth had judged that they should, and the
          numbers underneath already say what they are — a second line
          explaining them is the page reassuring itself. */}
      <p className="text-muted-foreground mb-8">Some things are more than a confession.</p>

      <ul className="list-disc pl-5 space-y-4 text-muted-foreground">
        <li>
          Lifeline — call{" "}
          <a href="tel:131114" className="text-foreground underline underline-offset-4">
            13 11 14
          </a>{" "}
          or text{" "}
          <a href="sms:0477131114" className="text-foreground underline underline-offset-4">
            0477 13 11 14
          </a>
          , 24 hours.
        </li>
        <li>
          Beyond Blue — call{" "}
          <a href="tel:1300224636" className="text-foreground underline underline-offset-4">
            1300 22 4636
          </a>
          , 24 hours.
        </li>
        <li>
          Outside Australia —{" "}
          <a
            href="https://findahelpline.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-4"
          >
            findahelpline.com
          </a>{" "}
          lists crisis lines by country.
        </li>
      </ul>
    </div>
  </div>
);

export default Support;
