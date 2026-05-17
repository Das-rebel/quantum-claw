"""
Vault Search Server - Keyword Search Only (No FAISS)
"""
import os, json, sqlite3
from flask import Flask, request, jsonify

app = Flask(__name__, static_folder='.', static_url_path='')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, 'learning_base', 'vault.db')

@app.route('/')
def index():
    return send_file('semantic_dashboard.html')

@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'faiss': 0})

@app.route('/stats')
def stats():
    try:
        conn = sqlite3.connect(DB_FILE)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM nodes WHERE type IN ('instagram_post', 'twitter_tweet')")
        total = cur.fetchone()[0]
        cur.execute("SELECT type, COUNT(*) FROM nodes GROUP BY type")
        types = dict(cur.fetchall())
        conn.close()
        return jsonify({
            'total': total,
            'types': types,
            'clip_vectors': 0,
            'has_clip': 0
        })
    except Exception as e:
        return jsonify({'error': str(e), 'total': 0})

@app.route('/search')
def search():
    query = request.args.get('q', '').lower()
    limit = int(request.args.get('limit', 10))
    search_type = request.args.get('type', None)
    
    if not query:
        return jsonify({'query': query, 'results': [], 'error': 'no query'})
    
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        where_clause = "WHERE (LOWER(name) LIKE ? OR LOWER(content) LIKE ? OR LOWER(metadata) LIKE ?)"
        params = [f'%{query}%', f'%{query}%', f'%{query}%']
        
        if search_type:
            where_clause += " AND type = ?"
            params.append(search_type)
        
        cur.execute(f"""
            SELECT id, type, name, content, url, timestamp, metadata
            FROM nodes 
            {where_clause}
            ORDER BY timestamp DESC
            LIMIT ?
        """, params + [limit])
        
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
        
        return jsonify({'query': query, 'results': results, 'count': len(results)})
    except Exception as e:
        return jsonify({'query': query, 'results': [], 'error': str(e)})

@app.route('/reload')@app.route('/sync')
def sync():
    return jsonify({'status': 'ok', 'message': 'Keyword search - no sync needed'})


@app.route('/api/search', methods=['POST'])
def api_search():
    """POST endpoint for Telegram bot compatibility"""
    data = request.get_json() or {}
    query = data.get('query', '')
    limit = int(data.get('options', {}).get('maxResults', 10))
    search_type = data.get('type', None)
    
    if not query:
        return jsonify({'query': query, 'results': [], 'error': 'no query'})
    
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        where_clause = "WHERE (LOWER(name) LIKE ? OR LOWER(content) LIKE ? OR LOWER(metadata) LIKE ?)"
        params = [f'%{query}%', f'%{query}%', f'%{query}%']
        
        if search_type:
            where_clause += " AND type = ?"
            params.append(search_type)
        
        cur.execute(f"""
            SELECT id, type, name, content, url, timestamp, metadata
            FROM nodes 
            {where_clause}
            ORDER BY timestamp DESC
            LIMIT ?
        """, params + [limit])
        
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
        
        return jsonify({'query': query, 'results': results, 'count': len(results)})
    except Exception as e:
        return jsonify({'query': query, 'results': [], 'error': str(e)})

if __name__ == '__main__':
    print('[Vault] Starting keyword search server on port 8766...')
    app.run(host='0.0.0.0', port=8766, debug=False, threaded=True)

# Version: 2026-05-16-22538
