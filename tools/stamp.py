# stamps a content hash onto the css/js urls so every deploy gets fresh files from the cdn.
# run before each push: python3 tools/stamp.py
import hashlib, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
assets = ["styles.css", "main.js", "sea.js", "shaders.js"]
v = hashlib.sha1(b"".join((root / a).read_bytes() for a in assets)).hexdigest()[:8]
pat = re.compile(r'((?:/|\./)?(?:styles\.css|main\.js|sea\.js|shaders\.js|members\.js))(?:\?v=[0-9a-f]+)?(["\'])')
for f in list(root.glob("*.html")) + [root / "main.js"]:
    s = f.read_text()
    t = pat.sub(lambda m: f"{m.group(1)}?v={v}{m.group(2)}", s)
    if t != s:
        f.write_text(t)
print("stamped", v)
