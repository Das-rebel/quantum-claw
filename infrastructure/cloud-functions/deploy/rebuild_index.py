#!/usr/bin/env python3
"""
Daily FAISS Index Rebuild Script
Rebuilds CLIP embeddings from vault.db and syncs to GCS
"""
import os, json, sqlite3, time, sys
import numpy as np
import faiss

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VAULT_DB = os.path.join(BASE_DIR, 'learning_base', 'vault.db')
CLIP_FAISS = os.path.join(BASE_DIR, 'learning_base', 'clip.faiss')
CLIP_IDS = os.path.join(BASE_DIR, 'learning_base', 'clip_ids.json')
GCS_BUCKET = 'omniclaw-knowledge-graph'

def log(msg):
    print(f'[INDEX-REBUILD] {msg}', flush=True)

def get_db_posts():
    """Get all Instagram posts that need embeddings"""
    conn = sqlite3.connect(VAULT_DB)
    conn.row_factory = sqlite3.Row
    cur = conn.execute("""
        SELECT id, url, metadata 
        FROM nodes 
        WHERE type='instagram_post' 
        AND metadata IS NOT NULL 
        AND metadata != ''
    """)
    posts = []
    for row in cur.fetchall():
        meta = json.loads(row['metadata']) if row['metadata'] else {}
        if meta.get('clip_embedding'):
            posts.append({
                'id': row['id'],
                'url': row['url'],
                'embedding': meta['clip_embedding']
            })
    conn.close()
    return posts

def build_faiss_index(posts):
    """Build FAISS index from posts with embeddings"""
    if not posts:
        log("No posts with embeddings found")
        return None
    
    dim = len(posts[0]['embedding'])
    index = faiss.IndexFlatIP(dim)
    
    embeddings = []
    ids = []
    
    for post in posts:
        emb = np.array(post['embedding'], dtype=np.float32)
        emb = emb / np.linalg.norm(emb)
        embeddings.append(emb)
        ids.append(post['id'])
    
    index.add(np.array(embeddings))
    
    return index, ids

def main():
    log("=== Daily Index Rebuild Started ===")
    
    # Get posts with embeddings
    posts = get_db_posts()
    log(f"Found {len(posts)} posts with embeddings")
    
    if not posts:
        log("No posts to index, skipping")
        return {'status': 'skipped', 'reason': 'no posts'}
    
    # Build index
    result = build_faiss_index(posts)
    if not result:
        return {'status': 'error', 'reason': 'build failed'}
    
    index, ids = result
    log(f"Built FAISS index with {index.ntotal} vectors")
    
    # Save local
    faiss.write_index(index, CLIP_FAISS)
    with open(CLIP_IDS, 'w') as f:
        json.dump(ids, f)
    log(f"Saved to {CLIP_FAISS} and {CLIP_IDS}")
    
    # Upload to GCS
    import subprocess
    try:
        subprocess.run(['gsutil', 'cp', CLIP_FAISS, f'gs://{GCS_BUCKET}/learning_base/clip.faiss'], 
                      capture_output=True, check=True)
        subprocess.run(['gsutil', 'cp', CLIP_IDS, f'gs://{GCS_BUCKET}/learning_base/clip_ids.json'], 
                      capture_output=True, check=True)
        log("Uploaded to GCS")
    except Exception as e:
        log(f"GCS upload failed: {e}")
    
    return {'status': 'success', 'vectors': index.ntotal}

if __name__ == '__main__':
    result = main()
    print(json.dumps(result))
