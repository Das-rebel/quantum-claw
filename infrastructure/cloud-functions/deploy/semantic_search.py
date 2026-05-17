#!/usr/bin/env python3
"""
Vault Semantic Search Service
Uses FAISS + pre-computed CLIP image embeddings for semantic search.
Works alongside the Node.js Cloud Run app.
"""
import os, json, sqlite3, time
from pathlib import Path
from typing import Optional, List
import numpy as np
import faiss

try:
    from transformers import CLIPProcessor, CLIPModel
    import torch
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False

# ─── Configuration ────────────────────────────────────────────
BASE_DIR = Path(__file__).parent / 'learning_base'
INDEX_FILE = BASE_DIR / 'clip.faiss'
ID_MAP_FILE = BASE_DIR / 'clip_ids.json'
DB_FILE = BASE_DIR / 'vault.db'

INDEX: Optional[faiss.IndexFlatIP] = None
ID_MAP: List[str] = []
MODEL = None
PROCESSOR = None

# ─── Load on startup ────────────────────────────────────────────
def load_index():
    global INDEX, ID_MAP
    if INDEX_FILE.exists() and ID_MAP_FILE.exists():
        INDEX = faiss.read_index(str(INDEX_FILE))
        ID_MAP = json.load(open(ID_MAP_FILE))
        # Sanity check: sample first vector, reject if all zeros
        sample = np.zeros(768, dtype=np.float32)
        INDEX.reconstruct(0, sample)
        if np.linalg.norm(sample) > 0.001:
            print(f'[VaultSearch] FAISS loaded: {INDEX.ntotal} vectors')
        else:
            print(f'[VaultSearch] FAISS has all-zero vectors — semantic search disabled')
            INDEX = None
    else:
        print(f'[VaultSearch] FAISS files not found at {BASE_DIR}')

def load_clip_model():
    global MODEL, PROCESSOR, HAS_TRANSFORMERS
    if not HAS_TRANSFORMERS:
        print('[VaultSearch] transformers not available — text search only')
        return
    try:
        print('[VaultSearch] Loading CLIP model...')
        PROCESSOR = CLIPProcessor.from_pretrained('openai/clip-vit-large-patch14', use_fast=False)
        MODEL = CLIPModel.from_pretrained('openai/clip-vit-large-patch14')
        # Only move to CUDA if available, otherwise stay on CPU
        if torch.cuda.is_available():
            MODEL = MODEL.to('cuda', torch.float16).eval()
        else:
            MODEL = MODEL.cpu().eval()
            print('[VaultSearch] CLIP (CPU mode)')
        print('[VaultSearch] CLIP ready')
    except Exception as e:
        print(f'[VaultSearch] CLIP load failed: {e}')
        HAS_TRANSFORMERS = False

def load_db():
    if not DB_FILE.exists():
        print(f'[VaultSearch] vault.db not found at {DB_FILE}')
    return sqlite3.connect(str(DB_FILE))

# ─── Core search ─────────────────────────────────────────────────
def semantic_search(query: str, top_k: int = 10) -> dict:
    """
    Search vault posts by text query using CLIP text embeddings.
    Falls back to keyword search if FAISS vectors are all zeros.
    """
    if not HAS_TRANSFORMERS or MODEL is None:
        return {'error': 'CLIP not available', 'results': []}

    if INDEX is None or INDEX.ntotal == 0:
        return {'error': 'FAISS index empty', 'results': []}

    try:
        # Encode query text
        inputs = PROCESSOR(text=[query], return_tensors='pt', padding=True, truncation=True, max_length=77)
        # Move to CUDA if available, otherwise use CPU
        if torch.cuda.is_available():
            inputs = {k: v.to('cuda', torch.float16) if v.dtype in [torch.float32, torch.float16] else v
                      for k, v in inputs.items()}
        with torch.no_grad():
            text_emb = MODEL.get_text_features(**inputs)
            text_emb = text_emb / text_emb.norm(p=2, dim=-1, keepdim=True)
        text_emb = text_emb.cpu().float().numpy().astype('float32')

        # Search FAISS
        scores, indices = INDEX.search(text_emb, top_k)

        # Fetch from DB
        results = []
        db = load_db()
        for rank, (idx, score) in enumerate(zip(indices[0], scores[0])):
            if idx < 0 or idx >= len(ID_MAP):
                continue
            post_id = ID_MAP[idx]
            row = db.execute(
                "SELECT name, content, url, metadata FROM nodes WHERE id = ?",
                (post_id,)
            ).fetchone()
            if not row:
                continue
            meta = {}
            if row[3]:
                try:
                    meta = json.loads(row[3])
                except (json.JSONDecodeError, TypeError):
                    pass
            results.append({
                'rank': rank + 1,
                'id': post_id,
                'name': row[0] or '',
                'caption': row[1] or '',
                'url': row[2] or '',
                'score': float(score),
                'vlTags': meta.get('vlTags', []),
                'vlMood': meta.get('vlMood', ''),
                'vlStyle': meta.get('vlStyle', ''),
                'location': meta.get('location', ''),
                'language': meta.get('language', ''),
                'colabSummary': meta.get('colabSummary', ''),
            })
        db.close()
        return {'query': query, 'total': len(results), 'results': results}

    except Exception as e:
        return {'error': str(e), 'results': []}


def keyword_search(query: str, top_k: int = 10) -> dict:
    """
    Fallback keyword + tag search via SQLite FTS-like matching.
    Works even without CLIP embeddings.
    """
    db = load_db()
    cur = db.execute(
        "SELECT id, name, content, url, metadata FROM nodes WHERE type = 'instagram_post'"
    )
    rows = cur.fetchall()

    q = query.lower()
    scored = []
    for row in rows:
        name = (row[1] or '').lower()
        content = (row[2] or '').lower()
        meta = {}
        if row[4]:
            try: meta = json.loads(row[4])
            except: pass
        tags = ' '.join(meta.get('vlTags', [])).lower()
        summary = meta.get('colabSummary', '').lower()

        score = 0
        for token in q.split():
            score += (token in name) * 3
            score += (token in content) * 1
            score += (token in tags) * 2
            score += (token in summary) * 1.5

        if score > 0:
            scored.append((score, row[0], row[1], row[2], row[4]))

    scored.sort(key=lambda x: x[0], reverse=True)
    results = []
    for score, post_id, name, content, meta_json in scored[:top_k]:
        meta = json.loads(meta_json) if meta_json else {}
        results.append({
            'rank': len(results) + 1,
            'id': post_id,
            'name': name or '',
            'caption': content or '',
            'url': meta.get('url', ''),
            'score': score,
            'vlTags': meta.get('vlTags', []),
            'vlMood': meta.get('vlMood', ''),
            'vlStyle': meta.get('vlStyle', ''),
            'location': meta.get('location', ''),
            'language': meta.get('language', ''),
            'colabSummary': meta.get('colabSummary', ''),
        })

    db.close()
    return {'query': query, 'total': len(results), 'results': results}


def search(query: str, top_k: int = 10, mode: str = 'auto') -> dict:
    """
    Main entry point.
    mode='semantic': CLIP text embeddings (requires CLIP model)
    mode='keyword': SQLite text match
    mode='auto': semantic if available, keyword fallback
    """
    if mode == 'semantic':
        return semantic_search(query, top_k)
    elif mode == 'keyword':
        return keyword_search(query, top_k)
    else:  # auto
        if HAS_TRANSFORMERS and INDEX is not None and INDEX.ntotal > 0:
            return semantic_search(query, top_k)
        return keyword_search(query, top_k)


def get_stats() -> dict:
    """Return vault statistics."""
    db = load_db()
    cur = db.execute("SELECT COUNT(*) FROM nodes WHERE type = 'instagram_post'")
    total = cur.fetchone()[0]

    has_loc = has_lang = has_tags = has_clip = 0
    loc_samples = []
    cur = db.execute("SELECT metadata FROM nodes WHERE type = 'instagram_post'")
    for (meta_json,) in cur.fetchall():
        m = json.loads(meta_json) if meta_json else {}
        if m.get('location'): has_loc += 1
        if m.get('language') and m['language'] != 'unknown': has_lang += 1
        if m.get('vlTags'): has_tags += 1
        if m.get('hasClipEmbedding'): has_clip += 1
        if m.get('location') and len(loc_samples) < 5:
            loc_samples.append(m['location'])

    db.close()
    return {
        'total': total,
        'has_location': has_loc,
        'has_language': has_lang,
        'has_tags': has_tags,
        'has_clip': has_clip,
        'faiss_vectors': INDEX.ntotal if INDEX else 0,
        'location_samples': loc_samples,
    }


# ─── FastAPI app ─────────────────────────────────────────────────
try:
    from fastapi import FastAPI, Query
    from pydantic import BaseModel
    app = FastAPI(title='Vault Semantic Search')

    class SearchRequest(BaseModel):
        query: str
        top_k: int = 10
        mode: str = 'auto'

    @app.on_event('startup')
    def startup():
        load_index()
        load_clip_model()

    @app.post('/search')
    def search_endpoint(req: SearchRequest):
        return search(req.query, req.top_k, req.mode)

    @app.get('/search')
    def search_get(q: str = Query(...), top_k: int = 10, mode: str = 'auto'):
        return search(q, top_k, mode)

    @app.get('/stats')
    def stats_endpoint():
        return get_stats()

    @app.get('/health')
    def health():
        return {
            'status': 'ok',
            'clip_available': HAS_TRANSFORMERS and MODEL is not None,
            'faiss_loaded': INDEX is not None and INDEX.ntotal > 0,
        }

    print('[VaultSearch] FastAPI app ready')
except ImportError:
    print('[VaultSearch] FastAPI not available — CLI mode only')
    app = None

# ─── CLI for testing ──────────────────────────────────────────────
if __name__ == '__main__':
    import sys
    load_index()
    load_clip_model()

    queries = [
        'food cooking restaurant',
        'mumbai street fashion',
        'travel beach sunset',
        'art design creative',
        'technology coding python',
    ]

    for q in queries:
        print(f'\n=== Query: "{q}" ===')
        results = search(q, top_k=5)
        if 'error' in results:
            print(f'Error: {results["error"]}')
        else:
            for r in results['results']:
                print(f"  {r['rank']}. {r['name'][:50]} | loc={r['location']} | score={r['score']:.3f}")
                if r.get('colabSummary'):
                    print(f"     -> {r['colabSummary'][:60]}")
