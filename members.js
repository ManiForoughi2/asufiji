// brothers-only links: the list ships AES-GCM encrypted (assets/members.enc.json) and only
// decrypts in the browser with the passphrase. build it with tools/seal-members.mjs.
const form = document.getElementById("gate");
const msg = document.getElementById("gate-msg");
const vault = document.getElementById("vault");
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function open(pass) {
  const box = await fetch("assets/members.enc.json", { cache: "no-store" }).then((r) => r.json());
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64(box.salt), iterations: box.iter, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(box.iv) }, key, b64(box.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

function render(data) {
  vault.replaceChildren();
  for (const sec of data.sections) {
    const h = document.createElement("h2"); h.className = "vault-head"; h.textContent = sec.title;
    const ul = document.createElement("ul"); ul.className = "vault-list";
    for (const l of sec.links) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = l.url; a.target = "_blank"; a.rel = "noopener";
      const t = document.createElement("span"); t.textContent = l.label;
      const n = document.createElement("small"); n.textContent = l.note || "";
      a.append(t, n); li.append(a); ul.append(li);
    }
    vault.append(h, ul);
  }
  vault.hidden = false;
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "Checking...";
  try {
    render(await open(form.pass.value.trim()));
    form.hidden = true;
    msg.textContent = "";
  } catch {
    msg.textContent = "That passphrase didn't work.";
    form.pass.select();
  }
});
