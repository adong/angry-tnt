#!/usr/bin/env python3
"""Inline every local <script src> of a game's index.html into one HTML file you can AirDrop, email or open anywhere.

Usage:  python3 kit/tools/bundle.py [game-dir] [--name NAME]   ->  <game-dir>/dist/<NAME>.html
        (game-dir defaults to the current folder; NAME defaults to the folder's name)
"""
import argparse
import pathlib
import re

ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("game", nargs="?", default=".")
ap.add_argument("--name")
args = ap.parse_args()

game = pathlib.Path(args.game).resolve()
name = args.name or game.name
html = (game / "index.html").read_text(encoding="utf-8")


def inline(match):
    src = match.group(1)
    if re.match(r"^(https?:)?//", src):
        return match.group(0)  # leave CDN scripts alone
    js = (game / src).read_text(encoding="utf-8")
    return "<script>\n" + js.replace("</script", "<\\/script") + "\n</script>"


out = re.sub(r'<script src="([^"]+)"></script>', inline, html)
leftover = [s for s in re.findall(r'<script src="([^"]+)"', out) if not re.match(r"^(https?:)?//", s)]
assert not leftover, f"not inlined: {leftover}"
dist = game / "dist"
dist.mkdir(exist_ok=True)
target = dist / f"{name}.html"
target.write_text(out, encoding="utf-8")
print(f"wrote {target.relative_to(game)} ({target.stat().st_size / 1024:.0f} KB)")
