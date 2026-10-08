# Rebuilds assets/fonts/recia-display.woff2 (titles only): J hook and Q tail raised onto the baseline.
# usage: python3 tools/build-display-font.py 0,0.3,0.6,0.9,1,1,1,1,1,1,1,0.8,0.5,0.2,0   then bump ?v= on its URL

import sys
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import ttProgram
from fontTools import subset
W=dict(zip(range(9,24),[float(v) for v in sys.argv[1].split(',')]))
f=TTFont('assets/fonts/recia-600.woff2'); glyf=f['glyf']
def edit(name, fn):
    g=glyf[name]; c,_,_=g.getCoordinates(glyf)
    for i,(x,y) in enumerate(c): c[i]=fn(i,x,y)
    g.coordinates=c; p=ttProgram.Program(); p.fromBytecode(b''); g.program=p; g.recalcBounds(glyf)
edit('J', lambda i,x,y: (x, y+196) if y<400 else (x,y))
DY={10:40,11:150,12:205,13:210,14:200,15:200,16:195,17:190,18:180,22:73}
edit('Q', lambda i,x,y: (x+150*W.get(i,0), y+DY.get(i,166)) if 10<=i<=22 else (x,y))
for r in f['name'].names:
    if r.nameID in (1,4,16):
        try: r.string=str(r.toUnicode()).replace('Recia','Recia Display')
        except Exception: pass
o=subset.Options(); o.flavor='woff2'; o.layout_features=['kern','liga','case']; o.hinting=False
s=subset.Subsetter(o); s.populate(text='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '); s.subset(f)
f['hmtx']['Q']=(max(791,glyf['Q'].xMax+28),50)
f.flavor='woff2'; f.save('assets/fonts/recia-display.woff2'); print('Q',glyf['Q'].yMin,glyf['Q'].xMax)
