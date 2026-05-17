#!/usr/bin/env python3
"""
Vault Search Cloud Function
Keyword search from vault.db in GCS
"""
import os
import json
import sqlite3
from flask import Flask, request, jsonify

app = Flask(__name__)

DB_FILE = '/tmp/vault.db'
GCS_BUCKET = 'omniclaw-knowledge-graph'

def download_db():
    """Download vault.db from GCS"""
    from google.cloud import storage
    client = storage.Client()
    bucket = client.bucket(GCS_BUCKET)
    blob = bucket.blob('learning_base/vault.db')
    if blob.exists():
        blob.download_to_filename(DB_FILE)
        return True
    return False

def init_db():
    if not os.path.exists(DB_FILE):
        download_db()
    if not os.path.exists(DB_FILE):
        # Create minimal in-memory database
        return None
    return DB_FILE

DB_PATH = init_db()

@app.route('/health')
def health():
    return jsonify({'status': 'ok'})

@app.route('/stats')
def stats():
    if not DB_PATH:
        return jsonify({'total': 0, 'error': 'no_db'})
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM nodes")
        total = cur.fetchone()[0]
        cur.execute("SELECT type, COUNT(*) FROM nodes GROUP BY type")
        types = dict(cur.fetchall())
        conn.close()
        return jsonify({'total': total, 'types': types})
    except Exception as e:
        return jsonify({'total': 0, 'error': str(e)})

@app.route('/search')
def search():
    q = request.args.get('q', '').lower()
    limit = int(request.args.get('limit', 10))
    
    if not DB_PATH:
        return jsonify({'query': q, 'results': [], 'error': 'no_db'})
    
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        # Search in name, content, metadata
        cur.execute("""
            SELECT id, type, name, content, url, timestamp, metadata
            FROM nodes 
            WHERE LOWER(name) LIKE ? OR LOWER(content) LIKE ? OR LOWER(metadata) LIKE ?
            LIMIT ?
        """, (f'%{q}%', f'%{q}%', f'%{q}%', limit))
        
        rows = cur.fetchall()
        conn.close()
        
        results = []
        for row in rows:
            metadata = json.loads(row['metadata']) if row['metadata'] else {}
            results.append({
                'id': row['id'],
                'type': row['type'],
                'name': row['name'],
                'content': row['content'][:200] if row['content'] else '',
                'url': row['url'],
                'timestamp': row['timestamp'],
                'score': 1.0,  # Simple keyword match = 1.0
                'metadata': metadata
            })
        
        return jsonify({'query': q, 'results': results})
    except Exception as e:
        return jsonify({'query': q, 'results': [], 'error': str(e)})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
