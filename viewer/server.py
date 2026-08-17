#!/usr/bin/env python3
"""Local live-viewer server for the homelab dashboard plugin.

Serves a single self-contained HTML page and a JSON endpoint that shells the
bb CLI's `homepage-dashboard snapshot --json` (which runs the plugin's real
probes on the bb server). No bb SDK import here — just a thin bridge so the
HTML page can render live data over a normal HTTP fetch.

Usage:
    python3 server.py [--port 8788] [--bb /path/to/bb]

The page auto-refreshes every 15s. Expose it remotely with:
    bb connect expose 8788
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
PAGE = HERE / "index.html"

DEFAULT_BB = "/home/hermes/.bb-machines/iris.getbb.app/npm/lib/node_modules/bb-app/host-daemon/dist/bb"


def get_snapshot(bb_bin: str) -> dict:
    try:
        proc = subprocess.run(
            [bb_bin, "homepage-dashboard", "snapshot", "--json"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=30,
        )
    except Exception as exc:  # noqa: BLE001 - surface any failure as 502 payload
        return {"error": f"failed to invoke bb CLI: {exc}"}
    if proc.returncode != 0:
        return {"error": (proc.stderr or proc.stdout).strip()[:500]}
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        return {"error": f"invalid JSON from bb CLI: {exc}"}


class Handler(BaseHTTPRequestHandler):
    bb_bin = DEFAULT_BB

    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 (http.server API)
        if self.path.split("?")[0] == "/api/snapshot":
            payload = get_snapshot(self.bb_bin)
            self._send(200, json.dumps(payload).encode("utf-8"), "application/json")
            return
        if self.path.split("?")[0] in ("/", "/index.html"):
            try:
                body = PAGE.read_bytes()
            except OSError as exc:
                self._send(500, f"page missing: {exc}".encode(), "text/plain")
                return
            self._send(200, body, "text/html; charset=utf-8")
            return
        self._send(404, b"not found", "text/plain")

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 (match base signature)
        return


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8788)
    parser.add_argument("--bb", default=DEFAULT_BB)
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()

    Handler.bb_bin = args.bb
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"homelab live viewer on http://{args.host}:{args.port}/  (bb={args.bb})")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
