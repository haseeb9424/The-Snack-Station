from pathlib import Path
import re

root = Path(r"e:\Course\AI Powered Web Dev\The Snack Station")
html_path = root / "index.html"
html = html_path.read_text(encoding="utf-8")

style_match = re.search(r"<style>(.*?)</style>", html, re.S)
if not style_match:
    raise SystemExit("Style block not found")

css_path = root / "css" / "style.css"
css_path.write_text(style_match.group(1), encoding="utf-8")
html = html[:style_match.start()] + '<link rel="stylesheet" href="css/style.css">' + html[style_match.end():]

script_match = re.search(r"<script type=\"module\">(.*?)</script>", html, re.S)
if not script_match:
    raise SystemExit("Module script block not found")

js_path = root / "js" / "app.js"
js_path.write_text(script_match.group(1), encoding="utf-8")
html = html[:script_match.start()] + '<script type="module" src="js/app.js"></script>' + html[script_match.end():]

html_path.write_text(html, encoding="utf-8")
print("Extracted style and module script into external files.")
