import os
import json
import sqlite3
from datetime import datetime
from flask import Flask, request, jsonify
from google.cloud import storage

app = Flask(__name__)

GCS_BUCKET = 'omniclaw-knowledge-graph'
DB_FILE = '/tmp/vault.db'

def download_db():
    """Download vault.db from GCS to /tmp"""
    try:
        client = storage.Client()
        bucket = client.bucket(GCS_BUCKET)
        blob = bucket.blob('learning_base/vault.db')
        blob.download_to_filename(DB_FILE)
        print(f'[Vault] Downloaded vault.db')
        return True
    except Exception as e:
        print(f'[Vault] Download failed: {e}')
        return False

@app.route('/')
def index():
    return jsonify({
        'service': 'serve-vault-search', 
        'version': 'v3-cloud-function',
        'time': datetime.now().isoformat()
    })

@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'time': datetime.now().isoformat()})

@app.route('/stats')
def stats():
    if not os.path.exists(DB_FILE):
        download_db()
    if not os.path.exists(DB_FILE):
        return jsonify({'total': 0, 'error': 'db_not_found'})
    try:
        conn = sqlite3.connect(DB_FILE)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM nodes")
        total = cur.fetchone()[0]
        cur.execute("SELECT type, COUNT(*) FROM nodes GROUP BY type")
        types = dict(cur.fetchall())
        conn.close()
        return jsonify({'total': total, 'types': types})
    except Exception as e:
        return jsonify({'error': str(e)})

@app.route('/search')
def search():
    q = request.args.get('q', '').lower()
    limit = min(int(request.args.get('limit', 10)), 50)
    
    if not os.path.exists(DB_FILE):
        download_db()
    
    if not os.path.exists(DB_FILE):
        return jsonify({'query': q, 'results': [], 'error': 'db_not_found'})
    
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, type, name, content, url, timestamp, metadata
            FROM nodes 
            WHERE LOWER(name) LIKE ? OR LOWER(content) LIKE ? OR LOWER(metadata) LIKE ?
            ORDER BY timestamp DESC
            LIMIT ?
        """, (f'%{q}%', f'%{q}%', f'%{q}%', limit))
        
        rows = cur.fetchall()
        conn.close()
        
        results = []
        for row in rows:
            try:
                metadata = json.loads(row['metadata']) if row['metadata'] else {}
            except:
                metadata = {}
            results.append({
                'id': row['id'],
                'type': row['type'],
                'name': row['name'],
                'content': (row['content'] or '')[:300],
                'url': row['url'] or '',
                'timestamp': row['timestamp'] or '',
                'score': 1.0,
                'metadata': metadata
            })
        
        return jsonify({'query': q, 'results': results, 'count': len(results)})
    except Exception as e:
        return jsonify({'query': q, 'results': [], 'error': str(e)})

@app.route('/reload')
def reload():
    if os.path.exists(DB_FILE):
        os.remove(DB_FILE)
    download_db()
    return jsonify({'status': 'ok', 'message': 'Reloaded from GCS'})

def search_app(request):
    """Entry point for Cloud Functions"""
    return app(request.environ, lambda status, headers=None: [b''])

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
