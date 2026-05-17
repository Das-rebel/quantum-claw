"""
Vault Semantic Search - Cloud Run service
CLIP text embeddings + FAISS for semantic search over Instagram bookmarks.
"""
import os, json, faiss, numpy as np
from flask import Flask, request, jsonify

HAS_TRANSFORMERS = False
MODEL = None
PROCESSOR = None
INDEX = None
ID_MAP = []
DB_PATH = None

def load_models():
    global HAS_TRANSFORMERS, MODEL, PROCESSOR, INDEX, ID_MAP, DB_PATH
    base = os.path.dirname(os.path.abspath(__file__))
    DB_PATH = os.path.join(base, 'learning_base', 'vault.db')
    idx_path = os.path.join(base, 'learning_base', 'clip.faiss')
    ids_path = os.path.join(base, 'learning_base', 'clip_ids.json')

    # Load FAISS
    if os.path.exists(idx_path):
        INDEX = faiss.read_index(idx_path)
        # Check if vectors are real
        sample = np.zeros(768, dtype=np.float32)
        INDEX.reconstruct(0, sample)
        if np.linalg.norm(sample) > 0.001:
            print(f'[VaultSearch] FAISS: {INDEX.ntotal} real vectors')
        else:
            print(f'[VaultSearch] FAISS: {INDEX.ntotal} vectors (all zeros)')
    else:
        print(f'[VaultSearch] FAISS index not found at {idx_path}')

    if os.path.exists(ids_path):
        with open(ids_path) as f:
            ID_MAP = json.load(f)
        print(f'[VaultSearch] ID map: {len(ID_MAP)} entries')

    # Load CLIP
    try:
        from transformers import CLIPProcessor, CLIPModel
        import torch
        print('[VaultSearch] Loading CLIP...')
        PROCESSOR = CLIPProcessor.from_pretrained('openai/clip-vit-large-patch14', use_fast=False)
        MODEL = CLIPModel.from_pretrained('openai/clip-vit-large-patch14')
        if torch.cuda.is_available():
            MODEL = MODEL.to('cuda', torch.float16).eval()
        else:
            MODEL = MODEL.cpu().eval()
        HAS_TRANSFORMERS = True
        print('[VaultSearch] CLIP ready')
    except Exception as e:
        print(f'[VaultSearch] CLIP unavailable: {e}')

def semantic_search(query, top_k=10):
    if not HAS_TRANSFORMERS or MODEL is None or INDEX is None:
        return {'error': 'semantic_search_unavailable', 'results': []}

    try:
        from transformers import CLIPProcessor, CLIPModel
        import torch
        inputs = PROCESSOR(text=[query], return_tensors='pt', padding=True, truncation=True, max_length=77)
        if torch.cuda.is_available():
            inputs = {k: v.to('cuda', torch.float16) if v.dtype in [torch.float32, torch.float16] else v for k, v in inputs.items()}
        with torch.no_grad():
            emb = MODEL.get_text_features(**inputs)
            emb = emb / emb.norm(p=2, dim=-1, keepdim=True)
        q_vec = emb.cpu().float().numpy().astype('float32')
        scores, idxs = INDEX.search(q_vec, top_k)

        import sqlite3
        db = sqlite3.connect(DB_PATH)
        results = []
        for rank, (idx, score) in enumerate(zip(idxs[0], scores[0])):
            if idx < 0 or idx >= len(ID_MAP):
                continue
            pid = ID_MAP[idx]
            row = db.execute("SELECT name, content, url, metadata FROM nodes WHERE id=?", (pid,)).fetchone()
            if not row:
                continue
            try:
                meta = json.loads(row[3]) if row[3] else {}
            except:
                meta = {}
            results.append({
                'rank': rank+1, 'id': pid,
                'name': row[0] or '', 'caption': row[1] or '', 'url': row[2] or '',
                'score': float(score),
                'vlTags': meta.get('vlTags', []),
                'location': meta.get('location', ''),
                'colabSummary': meta.get('colabSummary', ''),
            })
        db.close()
        return {'query': query, 'total': len(results), 'results': results}
    except Exception as e:
        return {'error': str(e), 'results': []}

def keyword_search(query, top_k=10):
    import sqlite3
    db = sqlite3.connect(DB_PATH)
    cur = db.execute("SELECT id, name, content, url, metadata FROM nodes WHERE type='instagram_post'")
    q = query.lower()
    scored = []
    for row in cur:
        name = (row[1] or '').lower()
        content = (row[2] or '').lower()
        meta = {}
        if row[4]:
            try: meta = json.loads(row[4])
            except: pass
        tags = ' '.join(meta.get('vlTags', [])).lower()
        summary = (meta.get('colabSummary', '') or '').lower()
        score = 0
        for tok in q.split():
            score += (tok in name) * 3 + (tok in content) + (tok in tags) * 2 + (tok in summary) * 1.5
        if score > 0:
            scored.append((score, row[0], row[1], row[2], meta))
    scored.sort(key=lambda x: x[0], reverse=True)
    results = []
    for score, pid, name, content, meta in scored[:top_k]:
        results.append({
            'rank': len(results)+1, 'id': pid,
            'name': name or '', 'caption': content or '',
            'url': meta.get('url', ''),
            'score': score,
            'vlTags': meta.get('vlTags', []),
            'location': meta.get('location', ''),
            'colabSummary': meta.get('colabSummary', ''),
        })
    db.close()
    return {'query': query, 'total': len(results), 'results': results}

app = Flask(__name__)

@app.before_request
def init():
    if MODEL is None:
        load_models()

@app.route('/search', methods=['GET', 'POST'])
def search():
    if request.method == 'POST':
        data = request.json or {}
        query = data.get('query', '')
        top_k = min(int(data.get('top_k', 10)), 50)
        mode = data.get('mode', 'auto')
    else:
        query = request.args.get('q', '')
        top_k = min(int(request.args.get('k', 10)), 50)
        mode = request.args.get('mode', 'auto')

    if not query:
        return jsonify({'error': 'no query'}), 400

    if mode == 'semantic' and HAS_TRANSFORMERS:
        return jsonify(semantic_search(query, top_k))
    elif mode == 'keyword':
        return jsonify(keyword_search(query, top_k))
    elif mode == 'auto':
        if HAS_TRANSFORMERS and INDEX is not None:
            return jsonify(semantic_search(query, top_k))
        return jsonify(keyword_search(query, top_k))
    else:
        return jsonify(keyword_search(query, top_k))

@app.route('/stats')
def stats():
    import sqlite3
    db = sqlite3.connect(DB_PATH)
    cur = db.execute("SELECT COUNT(*) FROM nodes WHERE type='instagram_post'")
    total = cur.fetchone()[0]
    cur = db.execute("SELECT metadata FROM nodes WHERE type='instagram_post'")
    has_loc = has_clip = 0
    for (m,) in cur:
        if m:
            try:
                meta = json.loads(m)
                if meta.get('location'): has_loc += 1
                if meta.get('hasClipEmbedding'): has_clip += 1
            except: pass
    db.close()
    return jsonify({
        'total': total,
        'has_location': has_loc,
        'has_clip': has_clip,
        'clip_vectors': INDEX.ntotal if INDEX else 0,
        'has_transformers': HAS_TRANSFORMERS,
    })

@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'clip': HAS_TRANSFORMERS, 'faiss': INDEX.ntotal if INDEX else 0})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
