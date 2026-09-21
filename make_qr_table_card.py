#!/usr/bin/env python3
"""
The Booth — venue QR card.

Geometry, tracking and kerning were measured from GigiCard_gigiprahran_print_CMYK.pdf
and reproduce it to within 0.003pt on every text element.

Type is drawn as vector outlines rather than embedded fonts: nothing for the
printer to substitute, and no font licensing to clear with them. The QR is
vector too, so it stays crisp at any size.

    pip install fonttools qrcode reportlab
    python3 make_qr_table_card.py

This is the printed QR card that sits on the venue's table. It is NOT the
verdict share card a guest posts — that is drawn by src/lib/shareCard.ts in
the browser and functions/src/card.mjs on the server.

Per venue, change the COPY block only. The geometry below is measured and
should not be edited without re-checking the printed proof.
"""

import qrcode
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from reportlab.pdfgen import canvas
from reportlab.lib.colors import CMYKColor

# ─── COPY ────────────────────────────────────────────────────────────────────
HERO_LINES = ["GIGI", "ALREADY", "KNOWS."]
GUIDANCE   = "Confess."
LOCKUP     = "GIGI × THE BOOTH"
QR_URL     = "https://theboothrecord.com/confess?source=gigiprahran&venue=Gigi"
OUTFILE    = "GigiTableCard_gigiprahran_print.pdf"

FONT_DISPLAY = "fonts/ControlUpright-BoldTNT.otf"
FONT_MONO    = "fonts/SohneMono-Kraftig.otf"

# ─── MEASURED GEOMETRY (points) ──────────────────────────────────────────────
PAGE_W, PAGE_H = 172.913, 272.126       # 61 x 96 mm = 55 x 90 trim + 3 mm bleed
CX = PAGE_W / 2

BONE   = CMYKColor(0.075, 0.082, 0.157, 0)
BRASS  = CMYKColor(0.306, 0.498, 0.784, 0.102)
MAROON = CMYKColor(0.322, 0.871, 0.922, 0.412)
QR_INK = CMYKColor(0.537, 0.749, 0.749, 0.780)   # richer black than the type; scans better

BORDER_OUT, BORDER_OUT_W = (17.0078, 17.0078, 138.897, 238.110), 0.90
BORDER_IN,  BORDER_IN_W  = (20.4094, 20.4094, 132.095, 231.307), 0.35
DIAMOND_R = 3.207

LOCKUP_SIZE, LOCKUP_Y, LOCKUP_TRACK = 6.40, 217.519, 2.00
RULE = (63.7797, 209.084, 45.3543, 0.35)

HERO_SIZE, HERO_LEAD, HERO_TRACK = 20.0, 20.4, 0.00
HERO_TOP, HERO_BOT = 209.084, 141.354   # hero block centres in this gap
HERO_CAP = 0.750                        # Control Upright cap height / em

# QR sizing is a scan-reliability decision, not a layout one. The original card
# used a 72.23pt frame, giving 0.449mm modules — above the ~0.4mm floor for phone
# scanning, but marginal in low light, at arm's length, or on a tilt. That is
# exactly the condition on a restaurant table at 8pm. The frame was enlarged to
# 83pt on 22 Sep 2026, giving 0.527mm modules (+17%), and this is now the standard
# for every venue card. Do not shrink it back for visual balance.
#
# Module size at this frame, by QR version (49 modules incl. the 4-module quiet
# zone at v6): 0.527mm. A longer QR_URL pushes the version up and the modules
# down, so keep URLs short. A short redirect path (/g/<venue>) would reach
# 0.595mm at this frame size if one is ever added to the app.
QR_FRAME, QR_FRAME_W = (44.9565, 58.3540, 83.0000, 83.0000), 0.40
QR_IMG    = (49.8919, 63.2894, 73.1293)
QR_BORDER = 4

GUID_SIZE, GUID_Y, GUID_TRACK = 7.40, 50.109, 0.20


class _PathPen(BasePen):
    """Replays a glyph outline onto a reportlab path, scaled and offset."""

    def __init__(self, glyphSet, path, scale, dx, dy):
        super().__init__(glyphSet)
        self.p, self.s, self.dx, self.dy = path, scale, dx, dy

    def _pt(self, pt):
        return pt[0] * self.s + self.dx, pt[1] * self.s + self.dy

    def _moveTo(self, pt):     self.p.moveTo(*self._pt(pt))
    def _lineTo(self, pt):     self.p.lineTo(*self._pt(pt))
    def _closePath(self):      self.p.close()

    def _curveToOne(self, p1, p2, p3):
        self.p.curveTo(*self._pt(p1), *self._pt(p2), *self._pt(p3))


class Face:
    """An OTF/TTF face that can measure and draw kerned, tracked, centred text."""

    def __init__(self, path):
        self.font = TTFont(path)
        self.cmap = self.font.getBestCmap()
        self.hmtx = self.font["hmtx"]
        self.glyphs = self.font.getGlyphSet()
        self.upem = self.font["head"].unitsPerEm
        self.kern = self._kern_map()

    def _kern_map(self):
        out = {}
        if "GPOS" not in self.font:
            return out
        for lu in self.font["GPOS"].table.LookupList.Lookup:
            if lu.LookupType != 2:
                continue
            for st in lu.SubTable:
                if st.Format == 1:
                    cov = st.Coverage.glyphs
                    for i, ps in enumerate(st.PairSet):
                        for r in ps.PairValueRecord:
                            v = getattr(r.Value1, "XAdvance", 0) or 0
                            if v:
                                out[(cov[i], r.SecondGlyph)] = v
                elif st.Format == 2:
                    cov = set(st.Coverage.glyphs)
                    c1, c2 = st.ClassDef1.classDefs, st.ClassDef2.classDefs
                    by1, by2 = {}, {}
                    for g in cov:
                        by1.setdefault(c1.get(g, 0), []).append(g)
                    for g in self.font.getGlyphOrder():
                        by2.setdefault(c2.get(g, 0), []).append(g)
                    for i, r1 in enumerate(st.Class1Record):
                        for j, r2 in enumerate(r1.Class2Record):
                            v = getattr(r2.Value1, "XAdvance", 0) or 0
                            if not v:
                                continue
                            for g1 in by1.get(i, []):
                                for g2 in by2.get(j, []):
                                    out[(g1, g2)] = v
        return out

    def _glyphs(self, text):
        return [self.cmap[ord(ch)] for ch in text]

    def advance(self, text, size, track=0.0):
        """Layout width, CSS-style: includes a trailing track after the last glyph."""
        gs = self._glyphs(text)
        units = sum(self.hmtx[g][0] for g in gs)
        units += sum(self.kern.get((gs[i], gs[i + 1]), 0) for i in range(len(gs) - 1))
        return units / self.upem * size + track * len(gs)

    def draw(self, c, text, size, track, cx, y):
        """Draw text centred on cx with its baseline at y, as filled outlines."""
        gs = self._glyphs(text)
        scale = size / self.upem
        x = cx - self.advance(text, size, track) / 2
        path = c.beginPath()
        for i, g in enumerate(gs):
            self.glyphs[g].draw(_PathPen(self.glyphs, path, scale, x, y))
            x += self.hmtx[g][0] * scale + track
            if i + 1 < len(gs):
                x += self.kern.get((g, gs[i + 1]), 0) * scale
        c.drawPath(path, stroke=0, fill=1)


def band(c, x, y, w, h, width, color):
    c.setStrokeColor(color)
    c.setLineWidth(width)
    c.rect(x + width / 2, y + width / 2, w - width, h - width, stroke=1, fill=0)


def main():
    display, mono = Face(FONT_DISPLAY), Face(FONT_MONO)
    c = canvas.Canvas(OUTFILE, pagesize=(PAGE_W, PAGE_H))

    c.setFillColor(BONE)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

    band(c, *BORDER_OUT, BORDER_OUT_W, BRASS)
    band(c, *BORDER_IN, BORDER_IN_W, BRASS)

    c.setFillColor(BRASS)
    ox, oy, ow, oh = BORDER_OUT
    for px, py in ((ox, oy), (ox + ow, oy), (ox, oy + oh), (ox + ow, oy + oh)):
        p = c.beginPath()
        p.moveTo(px, py + DIAMOND_R)
        p.lineTo(px + DIAMOND_R, py)
        p.lineTo(px, py - DIAMOND_R)
        p.lineTo(px - DIAMOND_R, py)
        p.close()
        c.drawPath(p, stroke=0, fill=1)

    mono.draw(c, LOCKUP, LOCKUP_SIZE, LOCKUP_TRACK, CX, LOCKUP_Y)
    c.rect(*RULE, stroke=0, fill=1)

    c.setFillColor(MAROON)
    cap = HERO_SIZE * HERO_CAP
    block = (len(HERO_LINES) - 1) * HERO_LEAD + cap
    first = (HERO_TOP + HERO_BOT) / 2 + block / 2 - cap
    for i, line in enumerate(HERO_LINES):
        display.draw(c, line, HERO_SIZE, HERO_TRACK, CX, first - i * HERO_LEAD)

    band(c, *QR_FRAME, QR_FRAME_W, BRASS)

    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_Q,
                      border=QR_BORDER, box_size=1)
    q.add_data(QR_URL)
    q.make(fit=True)
    m = q.get_matrix()
    qx, qy, side = QR_IMG
    pitch = side / len(m)
    c.setFillColor(QR_INK)
    for row, cells in enumerate(m):
        for col, on in enumerate(cells):
            if on:
                c.rect(qx + col * pitch, qy + side - (row + 1) * pitch,
                       pitch, pitch, stroke=0, fill=1)

    c.setFillColor(MAROON)
    mono.draw(c, GUIDANCE, GUID_SIZE, GUID_TRACK, CX, GUID_Y)

    c.showPage()
    c.save()

    widest = max(display.advance(l, HERO_SIZE, HERO_TRACK) for l in HERO_LINES)
    print(f"wrote {OUTFILE}")
    pitch_mm = side / len(m) / 72 * 25.4
    verdict = "OK" if pitch_mm >= 0.50 else ("MARGINAL" if pitch_mm >= 0.40 else "TOO SMALL")
    print(f"  QR   v{q.version}, {len(m)} modules, {pitch_mm:.4f} mm pitch  ({verdict}; 0.50mm is the standard)")
    print(f"  hero widest {widest:.2f}pt / {BORDER_IN[2]:.2f}pt inner border"
          f"  ({'fits' if widest < BORDER_IN[2] - 8 else 'TIGHT'})")


if __name__ == "__main__":
    main()
