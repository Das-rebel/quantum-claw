#!/usr/bin/env python3
"""
OmniCloud Resilience DB
SQLite-based persistence for all JIDs, groups, accounts, and interactions.
Survives credential deletion, session loss, and service restarts.
"""

import sqlite3
import json
import time
import os
from datetime import datetime
from pathlib import Path

DB_PATH = os.path.expanduser("~/omniclaw-fresh/db/omniclaw.db")

def get_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db

def init_db():
    """Initialize all tables"""
    db = get_db()
    c = db.cursor()
    
    # Contacts table - individual WhatsApp users
    c.execute("""
        CREATE TABLE IF NOT EXISTS contacts (
            jid TEXT PRIMARY KEY,
            phone TEXT,
            name TEXT,
            first_seen TEXT,
            last_seen TEXT,
            interaction_count INTEGER DEFAULT 0,
            notes TEXT
        )
    """)
    
    # Groups table - WhatsApp groups
    c.execute("""
        CREATE TABLE IF NOT EXISTS groups (
            jid TEXT PRIMARY KEY,
            name TEXT,
            description TEXT,
            created_at TEXT,
            last_active TEXT,
            member_count INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            source TEXT
        )
    """)
    
    # Group members - who is in which group
    c.execute("""
        CREATE TABLE IF NOT EXISTS group_members (
            group_jid TEXT,
            contact_jid TEXT,
            role TEXT DEFAULT 'member',
            joined_at TEXT,
            PRIMARY KEY (group_jid, contact_jid),
            FOREIGN KEY (group_jid) REFERENCES groups(jid),
            FOREIGN KEY (contact_jid) REFERENCES contacts(jid)
        )
    """)
    
    # Accounts - WhatsApp accounts/devices linked
    c.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            account_id TEXT PRIMARY KEY,
            phone TEXT,
            device_name TEXT,
            linked_at TEXT,
            last_linked TEXT,
            is_active INTEGER DEFAULT 1,
            config TEXT
        )
    """)
    
    # Interactions log - every message in/out
    c.execute("""
        CREATE TABLE IF NOT EXISTS interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            direction TEXT,
            from_jid TEXT,
            to_jid TEXT,
            group_jid TEXT,
            message_type TEXT,
            content_preview TEXT,
            status TEXT,
            queue_id TEXT,
            response_time_ms INTEGER,
            metadata TEXT
        )
    """)
    
    # Queue - pending/unanswered messages
    c.execute("""
        CREATE TABLE IF NOT EXISTS queue (
            id TEXT PRIMARY KEY,
            query TEXT,
            from_jid TEXT,
            from_name TEXT,
            group_jid TEXT,
            channel TEXT DEFAULT 'whatsapp',
            timestamp TEXT,
            queued_at TEXT,
            status TEXT DEFAULT 'pending',
            retry_count INTEGER DEFAULT 0,
            last_error TEXT,
            response TEXT,
            responded_at TEXT
        )
    """)
    
    # Service health - track outages
    c.execute("""
        CREATE TABLE IF NOT EXISTS service_health (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            service TEXT,
            status TEXT,
            details TEXT,
            duration_s REAL
        )
    """)
    
    # Create indexes
    c.execute("CREATE INDEX IF NOT EXISTS idx_interactions_ts ON interactions(timestamp)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_interactions_from ON interactions(from_jid)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_interactions_to ON interactions(to_jid)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_interactions_group ON interactions(group_jid)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_health_ts ON service_health(timestamp)")
    
    db.commit()
    db.close()
    print(f"DB initialized at {DB_PATH}")

# ─── CONTACTS ───────────────────────────────────────────────

def upsert_contact(jid, phone=None, name=None, notes=None):
    db = get_db()
    now = datetime.now().isoformat()
    c = db.cursor()
    existing = c.execute("SELECT * FROM contacts WHERE jid=?", (jid,)).fetchone()
    if existing:
        c.execute("""
            UPDATE contacts SET last_seen=?, interaction_count=interaction_count+1,
            name=COALESCE(?,name), notes=COALESCE(?,notes)
            WHERE jid=?
        """, (now, name, notes, jid))
    else:
        c.execute("""
            INSERT INTO contacts (jid, phone, name, first_seen, last_seen, interaction_count, notes)
            VALUES (?, ?, ?, ?, ?, 1, ?)
        """, (jid, phone or jid.split('@')[0], name, now, now, notes))
    db.commit()
    db.close()

def get_contact(jid):
    db = get_db()
    row = db.execute("SELECT * FROM contacts WHERE jid=?", (jid,)).fetchone()
    db.close()
    return dict(row) if row else None

def list_contacts():
    db = get_db()
    rows = db.execute("SELECT * FROM contacts ORDER BY last_seen DESC").fetchall()
    db.close()
    return [dict(r) for r in rows]

# ─── GROUPS ─────────────────────────────────────────────────

def upsert_group(jid, name=None, description=None, source=None):
    db = get_db()
    now = datetime.now().isoformat()
    c = db.cursor()
    existing = c.execute("SELECT * FROM groups WHERE jid=?", (jid,)).fetchone()
    if existing:
        c.execute("""
            UPDATE groups SET last_active=?, name=COALESCE(?,name),
            description=COALESCE(?,description), source=COALESCE(?,source)
            WHERE jid=?
        """, (now, name, description, source, jid))
    else:
        c.execute("""
            INSERT INTO groups (jid, name, description, created_at, last_active, source)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (jid, name, description, now, now, source))
    db.commit()
    db.close()

def get_group(jid):
    db = get_db()
    row = db.execute("SELECT * FROM groups WHERE jid=?", (jid,)).fetchone()
    db.close()
    return dict(row) if row else None

def list_groups():
    db = get_db()
    rows = db.execute("SELECT * FROM groups ORDER BY last_active DESC").fetchall()
    db.close()
    return [dict(r) for r in rows]

def find_group_by_name(name):
    db = get_db()
    rows = db.execute("SELECT * FROM groups WHERE name LIKE ?", (f"%{name}%",)).fetchall()
    db.close()
    return [dict(r) for r in rows]

# ─── ACCOUNTS ───────────────────────────────────────────────

def upsert_account(account_id, phone=None, device_name=None, config=None):
    db = get_db()
    now = datetime.now().isoformat()
    c = db.cursor()
    existing = c.execute("SELECT * FROM accounts WHERE account_id=?", (account_id,)).fetchone()
    if existing:
        c.execute("""
            UPDATE accounts SET last_linked=?, is_active=1,
            device_name=COALESCE(?,device_name), config=COALESCE(?,config)
            WHERE account_id=?
        """, (now, device_name, json.dumps(config) if config else None, account_id))
    else:
        c.execute("""
            INSERT INTO accounts (account_id, phone, device_name, linked_at, last_linked, config)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (account_id, phone, device_name, now, now, json.dumps(config) if config else None))
    db.commit()
    db.close()

def list_accounts():
    db = get_db()
    rows = db.execute("SELECT * FROM accounts").fetchall()
    db.close()
    return [dict(r) for r in rows]

# ─── INTERACTIONS ───────────────────────────────────────────

def log_interaction(direction, from_jid, to_jid, content_preview=None,
                    group_jid=None, msg_type='text', status='sent',
                    queue_id=None, response_time_ms=None, metadata=None):
    db = get_db()
    now = datetime.now().isoformat()
    db.execute("""
        INSERT INTO interactions 
        (timestamp, direction, from_jid, to_jid, group_jid, message_type,
         content_preview, status, queue_id, response_time_ms, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (now, direction, from_jid, to_jid, group_jid, msg_type,
          (content_preview or '')[:500], status, queue_id, response_time_ms,
          json.dumps(metadata) if metadata else None))
    db.commit()
    db.close()
    
    # Also update contact last_seen
    if direction == 'inbound' and from_jid:
        upsert_contact(from_jid)
    if direction == 'outbound' and to_jid:
        upsert_contact(to_jid)

def get_recent_interactions(limit=20, jid=None, group_jid=None):
    db = get_db()
    query = "SELECT * FROM interactions WHERE 1=1"
    params = []
    if jid:
        query += " AND (from_jid=? OR to_jid=?)"
        params.extend([jid, jid])
    if group_jid:
        query += " AND group_jid=?"
        params.append(group_jid)
    query += " ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)
    rows = db.execute(query, params).fetchall()
    db.close()
    return [dict(r) for r in rows]

# ─── QUEUE ──────────────────────────────────────────────────

def queue_add(query, from_jid, from_name=None, group_jid=None, channel='whatsapp', timestamp=None):
    db = get_db()
    now = datetime.now().isoformat()
    qid = f"q_{int(time.time()*1000)}"
    db.execute("""
        INSERT INTO queue (id, query, from_jid, from_name, group_jid, channel, timestamp, queued_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    """, (qid, query, from_jid, from_name, group_jid, channel, timestamp or now, now))
    db.commit()
    db.close()
    return qid

def queue_get_pending():
    db = get_db()
    rows = db.execute("SELECT * FROM queue WHERE status='pending' ORDER BY timestamp ASC").fetchall()
    db.close()
    return [dict(r) for r in rows]

def queue_complete(qid, response):
    db = get_db()
    now = datetime.now().isoformat()
    db.execute("""
        UPDATE queue SET status='completed', response=?, responded_at=? WHERE id=?
    """, (response, now, qid))
    db.commit()
    db.close()

def queue_fail(qid, error):
    db = get_db()
    db.execute("""
        UPDATE queue SET status='failed', last_error=?, retry_count=retry_count+1 WHERE id=?
    """, (error, qid))
    db.commit()
    db.close()

def queue_summary():
    db = get_db()
    pending = db.execute("SELECT COUNT(*) FROM queue WHERE status='pending'").fetchone()[0]
    completed = db.execute("SELECT COUNT(*) FROM queue WHERE status='completed'").fetchone()[0]
    failed = db.execute("SELECT COUNT(*) FROM queue WHERE status='failed'").fetchone()[0]
    db.close()
    return {"pending": pending, "completed": completed, "failed": failed}

# ─── SERVICE HEALTH ────────────────────────────────────────

def log_health(service, status, details=None, duration_s=None):
    db = get_db()
    now = datetime.now().isoformat()
    db.execute("""
        INSERT INTO service_health (timestamp, service, status, details, duration_s)
        VALUES (?, ?, ?, ?, ?)
    """, (now, service, status, details, duration_s))
    db.commit()
    db.close()

# ─── EXPORT / IMPORT ────────────────────────────────────────

def export_all():
    db = get_db()
    data = {
        "contacts": [dict(r) for r in db.execute("SELECT * FROM contacts").fetchall()],
        "groups": [dict(r) for r in db.execute("SELECT * FROM groups").fetchall()],
        "accounts": [dict(r) for r in db.execute("SELECT * FROM accounts").fetchall()],
        "queue": [dict(r) for r in db.execute("SELECT * FROM queue WHERE status='pending'").fetchall()],
        "exported_at": datetime.now().isoformat()
    }
    db.close()
    return data

def import_data(data):
    """Import data from export"""
    db = get_db()
    for g in data.get("groups", []):
        upsert_group(g["jid"], g.get("name"), g.get("description"), g.get("source"))
    for c in data.get("contacts", []):
        upsert_contact(c["jid"], c.get("phone"), c.get("name"), c.get("notes"))
    for a in data.get("accounts", []):
        upsert_account(a["account_id"], a.get("phone"), a.get("device_name"))
    db.close()

# ─── CLI ────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    
    init_db()
    
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python3 resilience_db.py init")
        print("  python3 resilience_db.py contacts")
        print("  python3 resilience_db.py groups")
        print("  python3 resilience_db.py accounts")
        print("  python3 resilience_db.py queue")
        print("  python3 resilience_db.py export")
        print("  python3 resilience_db.py seed")
        print("  python3 resilience_db.py summary")
        sys.exit(0)
    
    cmd = sys.argv[1]
    
    if cmd == "init":
        init_db()
        print("DB initialized")
    
    elif cmd == "contacts":
        for c in list_contacts():
            print(f"  {c['jid']}  {c.get('name','?')}  last:{c.get('last_seen','?')[:16]}  count:{c.get('interaction_count',0)}")
    
    elif cmd == "groups":
        for g in list_groups():
            print(f"  {g['jid']}  {g.get('name','?')}  active:{g.get('last_active','?')[:16]}  src:{g.get('source','?')}")
    
    elif cmd == "accounts":
        for a in list_accounts():
            print(f"  {a['account_id']}  {a.get('phone','?')}  linked:{a.get('last_linked','?')[:16]}")
    
    elif cmd == "queue":
        s = queue_summary()
        print(f"  Pending: {s['pending']}  Completed: {s['completed']}  Failed: {s['failed']}")
        for q in queue_get_pending():
            print(f"  [{q['timestamp'][:16]}] {q['from_jid']}: {q['query'][:60]}")
    
    elif cmd == "export":
        print(json.dumps(export_all(), indent=2))
    
    elif cmd == "summary":
        db = get_db()
        print("=== OMNICLAW RESILIENCE DB SUMMARY ===")
        print(f"  Contacts:  {db.execute('SELECT COUNT(*) FROM contacts').fetchone()[0]}")
        print(f"  Groups:    {db.execute('SELECT COUNT(*) FROM groups').fetchone()[0]}")
        print(f"  Accounts:  {db.execute('SELECT COUNT(*) FROM accounts').fetchone()[0]}")
        print(f"  Interactions: {db.execute('SELECT COUNT(*) FROM interactions').fetchone()[0]}")
        s = queue_summary()
        print(f"  Queue:     {s['pending']} pending, {s['completed']} done, {s['failed']} failed")
        db.close()
    
    elif cmd == "seed":
        # Seed with all known data
        print("Seeding known data...")
        
        # Accounts
        upsert_account("openclaw_default", "+919003349852", "OpenClaw Main")
        
        # Contacts
        upsert_contact("917977110915@s.whatsapp.net", "+917977110915", "Client Phone")
        upsert_contact("919003349852@s.whatsapp.net", "+919003349852", "OmniClaw Bot")
        upsert_contact("918340540974@s.whatsapp.net", "+918340540974")
        upsert_contact("919777110915@s.whatsapp.net", "+919777110915")
        upsert_contact("91919876543210@s.whatsapp.net", "+91919876543210")
        upsert_contact("919876543210@s.whatsapp.net", "+919876543210")
        
        # Groups - from Baileys session + sessions.json
        upsert_group("120363358972347979@g.us", None, "From sessions.json", "openclaw_session")
        upsert_group("120363141914506124@g.us", "AI and Embedded", "From Baileys session storage", "baileys_storage")
        upsert_group("120363404584160486@g.us", None, "From Baileys session storage", "baileys_storage")
        
        # Group members
        db = get_db()
        db.execute("INSERT OR IGNORE INTO group_members (group_jid, contact_jid, role, joined_at) VALUES (?,?,?,?)",
                   ("120363141914506124@g.us", "919003349852@s.whatsapp.net", "admin", datetime.now().isoformat()))
        db.execute("INSERT OR IGNORE INTO group_members (group_jid, contact_jid, role, joined_at) VALUES (?,?,?,?)",
                   ("120363141914506124@g.us", "917977110915@s.whatsapp.net", "member", datetime.now().isoformat()))
        db.execute("INSERT OR IGNORE INTO group_members (group_jid, contact_jid, role, joined_at) VALUES (?,?,?,?)",
                   ("120363358972347979@g.us", "919003349852@s.whatsapp.net", "member", datetime.now().isoformat()))
        db.execute("INSERT OR IGNORE INTO group_members (group_jid, contact_jid, role, joined_at) VALUES (?,?,?,?)",
                   ("120363358972347979@g.us", "917977110915@s.whatsapp.net", "member", datetime.now().isoformat()))
        db.commit()
        db.close()
        
        print("Seeded: 6 contacts, 3 groups, 1 account")
