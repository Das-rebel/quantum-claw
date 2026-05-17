#!/usr/bin/env python3
"""
Vault API - Flask REST API for querying bookmarks.

Endpoints:
    GET  /api/bookmarks          ?source=&q=&limit=50&offset=0
    GET  /api/bookmarks/<id>     single bookmark by DB id
    GET  /api/stats              counts per source, date ranges
    GET  /api/search?q=&source=  full-text search on content/title
    POST /api/sync/<source>      trigger scrape + ingest
    GET  /api/sync/status        last sync timestamps
"""

import json
import sys
import asyncio
from pathlib import Path
from datetime import datetime

from flask import Flask, request, jsonify, g

sys.path.insert(0, str(Path(__file__).parent))
from unified_schema import get_db, get_meta, DEFAULT_DB_PATH

app = Flask(__name__)
DB_PATH = DEFAULT_DB_PATH


@app.before_request
def before_request():
    g.db = get_db(DB_PATH)


@app.teardown_request
def teardown_request(exception):
    db = getattr(g, "db", None)
    if db:
        db.close()


@app.route("/api/stats")
def stats():
    """Counts per source, date ranges, tag counts."""
    rows = g.db.execute("""
        SELECT source, COUNT(*) as cnt,
               MIN(bookmarked_at), MAX(bookmarked_at)
        FROM bookmarks WHERE is_active = 1
        GROUP BY source
    """).fetchall()
    source_stats = {r[0]: {"count": r[1], "earliest": r[2], "latest": r[3]} for r in rows}
    total = sum(s["count"] for s in source_stats.values())
    tag_count = g.db.execute("SELECT COUNT(DISTINCT tag) FROM bookmarks_tags").fetchone()[0]
    last_sync = {k.replace("_last_scrape", ""): get_meta(g.db, k)
                 for k in ("twitter_last_scrape", "instagram_last_scrape")}
    return jsonify({"total": total, "sources": source_stats,
                    "unique_tags": tag_count, "last_sync": last_sync})


@app.route("/api/bookmarks")
def bookmarks_list():
    source = request.args.get("source")
    limit = min(int(request.args.get("limit", 50)), 500)
    offset = int(request.args.get("offset", 0))

    query = "SELECT * FROM bookmarks WHERE is_active = 1"
    params = []
    if source:
        query += " AND source = ?"
        params.append(source)
    query += " ORDER BY bookmarked_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    rows = g.db.execute(query, params).fetchall()
    items = []
    for r in rows:
        items.append({
            "id": r["id"], "source": r["source"], "source_id": r["source_id"],
            "url": r["url"], "title": r["title"], "content": r["content"],
            "bookmarked_at": r["bookmarked_at"], "scraped_at": r["scraped_at"],
            "metadata": json.loads(r["metadata"] or "{}"),
        })
    return jsonify({"items": items, "limit": limit, "offset": offset, "count": len(items)})


@app.route("/api/bookmarks/<int:bookmark_id>")
def bookmark_detail(bookmark_id):
    row = g.db.execute("SELECT * FROM bookmarks WHERE id = ?", (bookmark_id,)).fetchone()
    if not row:
        return jsonify({"error": "not found"}), 404
    tags = g.db.execute("SELECT tag, source FROM bookmarks_tags WHERE bookmark_id = ?",
                        (bookmark_id,)).fetchall()
    return jsonify({
        "id": row["id"], "source": row["source"], "source_id": row["source_id"],
        "url": row["url"], "title": row["title"], "content": row["content"],
        "bookmarked_at": row["bookmarked_at"], "scraped_at": row["scraped_at"],
        "metadata": json.loads(row["metadata"] or "{}"),
        "tags": [{"tag": t["tag"], "source": t["source"]} for t in tags],
    })


@app.route("/api/search")
def search():
    q = request.args.get("q", "").strip()
    source = request.args.get("source")
    limit = min(int(request.args.get("limit", 50)), 200)

    if not q:
        return jsonify({"error": "q parameter required"}), 400

    query = """SELECT * FROM bookmarks WHERE is_active = 1
               AND (content LIKE ? OR title LIKE ? OR url LIKE ?)"""
    params = [f"%{q}%", f"%{q}%", f"%{q}%"]
    if source:
        query += " AND source = ?"
        params.append(source)
    query += " ORDER BY bookmarked_at DESC LIMIT ?"
    params.append(limit)

    rows = g.db.execute(query, params).fetchall()
    items = [{"id": r["id"], "source": r["source"], "url": r["url"],
              "title": r["title"], "content": r["content"][:200],
              "bookmarked_at": r["bookmarked_at"]} for r in rows]
    return jsonify({"query": q, "results": items, "count": len(items)})


@app.route("/api/sync/<source>", methods=["POST"])
def trigger_sync(source):
    if source not in ("twitter", "instagram"):
        return jsonify({"error": f"unknown source: {source}"}), 400

    async def _run():
        if source == "twitter":
            from ingest_twitter import run as twitter_run
            return await twitter_run(DB_PATH)
        else:
            from ingest_instagram import run as instagram_run
            return await instagram_run(DB_PATH)

    result = asyncio.run(_run())
    return jsonify({"source": source, "result": result})


@app.route("/api/sync/status")
def sync_status():
    keys = ["twitter_last_scrape", "instagram_last_scrape"]
    status = {}
    for k in keys:
        v = get_meta(g.db, k)
        status[k] = v
    # Last 10 sync log entries
    rows = g.db.execute(
        "SELECT timestamp, source, action, count, status, notes FROM sync_log ORDER BY id DESC LIMIT 10"
    ).fetchall()
    status["recent_log"] = [dict(zip(["timestamp", "source", "action", "count", "status", "notes"], r))
                            for r in rows]
    return jsonify(status)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5100, debug=True)
