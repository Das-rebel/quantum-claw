#!/usr/bin/env python3
"""
Cloud-Native Index Rebuild Function
Downloads vault.db from GCS, syncs NEW bookmarks to nodes (URL-based dedup), uploads back
"""
import os
import json
import sqlite3
from datetime import datetime
from google.cloud import storage

def log(msg):
    print(f'[INDEX-REBUILD] {datetime.now().isoformat()} {msg}', flush=True)

def index_rebuild(event=None, context=None):
    log('=== Daily Index Rebuild Started ===')
    
    BUCKET_NAME = 'omniclaw-knowledge-graph'
    TEMP_DIR = '/tmp'
    DB_FILE = os.path.join(TEMP_DIR, 'vault.db')
    
    try:
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        
        # Download vault.db from GCS
        log('Downloading vault.db from GCS...')
        vault_blob = bucket.blob('learning_base/vault.db')
        if vault_blob.exists():
            vault_blob.download_to_filename(DB_FILE)
            log(f'Downloaded vault.db ({os.path.getsize(DB_FILE)} bytes)')
        else:
            log('vault.db not found in GCS')
            return {'success': False, 'error': 'vault.db not found in GCS'}
        
        conn = sqlite3.connect(DB_FILE)
        cur = conn.cursor()
        
        # Stats before
        cur.execute("SELECT COUNT(*) FROM bookmarks WHERE is_active=1")
        bookmark_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM nodes WHERE type IN ('instagram_post', 'twitter_tweet')")
        node_count_before = cur.fetchone()[0]
        log(f'Bookmarks: {bookmark_count}, Nodes (before): {node_count_before}')
        
        # Get all existing node URLs to avoid duplicates
        cur.execute("SELECT url FROM nodes WHERE url IS NOT NULL AND url != ''")
        existing_urls = set(row[0] for row in cur.fetchall())
        log(f'Existing unique URLs: {len(existing_urls)}')
        
        # Sync only NEW bookmarks (URL doesn't exist in nodes)
        cur.execute("""
            SELECT b.id, b.source, b.url, b.title, b.content, b.metadata, b.bookmarked_at
            FROM bookmarks b
            WHERE b.is_active=1 
            LIMIT 10000
        """)
        
        all_bookmarks = cur.fetchall()
        synced = 0
        skipped_duplicate = 0
        
        for bm in all_bookmarks:
            bm_id, source, url, title, content, metadata, bookmarked_at = bm
            
            if not url:
                continue
                
            # Skip if URL already exists in nodes
            if url in existing_urls:
                skipped_duplicate += 1
                continue
            
            node_id = f'bm_{bm_id}'
            node_type = 'instagram_post' if source == 'instagram' else 'twitter_tweet'
            node_name = title or ''
            node_content = content or ''
            node_metadata = metadata or '{}'
            
            try:
                cur.execute("""
                    INSERT OR IGNORE INTO nodes (id, type, name, content, url, timestamp, metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (node_id, node_type, node_name, node_content, url, bookmarked_at, node_metadata))
                if cur.rowcount > 0:
                    synced += 1
                    existing_urls.add(url)
            except Exception as e:
                log(f'Error syncing bookmark {bm_id} ({url[:50]}): {e}')
        
        conn.commit()
        
        # Stats after
        cur.execute("SELECT COUNT(*) FROM nodes WHERE type IN ('instagram_post', 'twitter_tweet')")
        node_count_after = cur.fetchone()[0]
        conn.close()
        
        log(f'Synced: {synced} new bookmarks')
        log(f'Skipped: {skipped_duplicate} duplicates (URL already in nodes)')
        log(f'Nodes: {node_count_before} -> {node_count_after}')
        
        # Upload updated vault.db back to GCS
        log('Uploading updated vault.db to GCS...')
        vault_blob.upload_from_filename(DB_FILE)
        log(f'Uploaded vault.db ({os.path.getsize(DB_FILE)} bytes)')
        
        log('=== Daily Index Rebuild Complete ===')
        return {
            'success': True,
            'bookmark_count': bookmark_count,
            'node_count_before': node_count_before,
            'node_count_after': node_count_after,
            'synced': synced,
            'duplicates_skipped': skipped_duplicate
        }
        
    except Exception as e:
        log(f'Error: {e}')
        import traceback
        traceback.print_exc()
        return {'success': False, 'error': str(e)}

if __name__ == '__main__':
    print(json.dumps(index_rebuild()))
