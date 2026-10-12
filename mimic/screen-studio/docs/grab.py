import re, sys, html, urllib.request, pathlib
# Fetch public Screen Studio guide/changelog pages and keep readable text (no login, GET only).
out = pathlib.Path(__file__).parent
urls = [u.strip() for u in open(out / "urls.txt") if u.strip()]
for u in urls:
    name = u.rstrip("/").split("/")[-1] or "home"
    try:
        req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
        raw = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")
    except Exception as e:
        print("FAIL", u, e); continue
    body = re.sub(r"(?is)<(script|style|svg|noscript)[^>]*>.*?</\1>", " ", raw)
    m = re.search(r"(?is)<(article|main)[^>]*>(.*)</\1>", body)
    body = m.group(2) if m else body
    body = re.sub(r"(?i)<(br|/p|/li|/h\d|/div)[^>]*>", "\n", body)
    text = html.unescape(re.sub(r"<[^>]+>", " ", body))
    text = "\n".join(l.strip() for l in text.splitlines() if l.strip())
    (out / f"{name}.txt").write_text(f"URL: {u}\n\n{text}\n", encoding="utf-8")
    print("ok", name, len(text))
