# Rebuilds assets/fonts/recia-display.woff2, the face used only by the big page titles.
# Nothing may hang below the waterline, so: the J's hook is raised onto the baseline, and the Q
# is the O's bowl plus a drawn tail that tapers out along the baseline (inscriptional style).
# usage: python3 tools/build-display-font.py [out.woff2]   then bump ?v= on its URL (styles.css + preloads)
import sys
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import ttProgram
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools import subset

out = sys.argv[1] if len(sys.argv) > 1 else "assets/fonts/recia-display.woff2"
f = TTFont("assets/fonts/recia-600.woff2")
glyf = f["glyf"]
gs = f.getGlyphSet()

def finish(name, g):
    p = ttProgram.Program(); p.fromBytecode(b""); g.program = p
    glyf[name] = g; g.recalcBounds(glyf)

# J: hook points (all below y=400) lifted so the hook rests on the baseline
g = glyf["J"]; c, _, _ = g.getCoordinates(glyf)
for i, (x, y) in enumerate(c):
    if y < 400: c[i] = (x, y + 196)
g.coordinates = c; finish("J", g)

# Q: the O, then a tail. Clockwise like an outer contour so the overlap fills.
pen = TTGlyphPen(gs)
rec = DecomposingRecordingPen(gs); gs["O"].draw(rec); rec.replay(pen)
pen.moveTo((430, 150))                      # top edge, starting inside the bowl
pen.qCurveTo((560, 128), (690, 52))         # crosses the bowl's bottom stroke
pen.qCurveTo((820, 6), (965, 2))            # tip, on the baseline
pen.qCurveTo((800, -14), (640, -12))        # bottom edge back along the baseline
pen.qCurveTo((500, -6), (400, 110))         # up through the stroke
pen.closePath()
finish("Q", pen.glyph())
f["hmtx"]["Q"] = (glyf["Q"].xMax + 20, 48)

for r in f["name"].names:
    if r.nameID in (1, 4, 16):
        try: r.string = str(r.toUnicode()).replace("Recia", "Recia Display")
        except Exception: pass
o = subset.Options(); o.flavor = "woff2"; o.layout_features = ["kern", "liga", "case"]; o.hinting = False
s = subset.Subsetter(o); s.populate(text="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 "); s.subset(f)
f.flavor = "woff2"; f.save(out)
print("Q", glyf["Q"].yMin, glyf["Q"].xMax, f["hmtx"]["Q"])
