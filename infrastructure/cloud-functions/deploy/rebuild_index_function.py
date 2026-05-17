#!/usr/bin/env python3
"""
Cloud Function: Trigger index rebuild after daily processing
"""
import subprocess
import os
from datetime import datetime

def rebuild_index(event=None, context=None):
    """Triggered by Cloud Scheduler after bookmark processing"""
    log = lambda msg: print(f'[INDEX-REBUILD] {datetime.now().isoformat()} {msg}')
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    log('Starting daily index rebuild')
    
    # Sync bookmarks to nodes
    sync_script = os.path.join(base_dir, 'sync_bookmarks_to_nodes.py')
    result = subprocess.run(['python3', sync_script], capture_output=True, text=True)
    log(f'Sync result: {result.stdout.strip()}')
    
    if result.returncode != 0:
        log(f'Sync failed: {result.stderr}')
        return {'success': False, 'error': result.stderr}
    
    # Export to GCS
    export_script = os.path.join(base_dir, 'export_gcs.py')
    if os.path.exists(export_script):
        result = subprocess.run(['python3', export_script], capture_output=True, text=True)
        log(f'Export result: {result.stdout.strip()}')
    
    log('Daily index rebuild complete')
    return {'success': True}

if __name__ == '__main__':
    print(rebuild_index())
