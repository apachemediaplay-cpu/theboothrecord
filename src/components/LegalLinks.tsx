// Terms · Privacy · Support — the legal-line anchor trio, factored into ONE
// component so a future screen can't render two of the three. Support is
// ALWAYS present and NEVER conditional — it must signal nothing about any
// particular confession, and someone who needs it can find it without being
// seen looking (the round collapses held/blocked to a neutral slot for exactly
// this reason — see the note in round.ts). Same anchor treatment as the
// original Terms/Privacy links; the surrounding consent sentence stays with
// each screen, only the trio lives here.
const anchor =
  "underline underline-offset-2 hover:text-foreground";

const LegalLinks = () => (
  <>
    <a href="/terms" target="_blank" rel="noopener noreferrer" className={anchor}>
      Terms
    </a>
    {" · "}
    <a href="/privacy" target="_blank" rel="noopener noreferrer" className={anchor}>
      Privacy
    </a>
    {" · "}
    <a href="/support" target="_blank" rel="noopener noreferrer" className={anchor}>
      Support
    </a>
  </>
);

export default LegalLinks;
