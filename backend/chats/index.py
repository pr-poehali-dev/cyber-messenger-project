import json
import os
import random
import string
import psycopg2


def gen_id():
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=12))


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Auth-Token',
    }


def handler(event: dict, context) -> dict:
    """Управление чатами: создание, получение списка, блокировка, удаление чата."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers(), 'body': ''}

    method = event.get('httpMethod', 'GET')
    path = event.get('path', '/')
    headers = event.get('headers', {}) or {}
    user_id = headers.get('X-User-Id', '')

    if not user_id:
        return {'statusCode': 401, 'headers': cors_headers(), 'body': json.dumps({'error': 'Unauthorized'})}

    body = {}
    if event.get('body'):
        body = json.loads(event['body'])

    conn = get_conn()
    cur = conn.cursor()

    # GET / — список чатов
    if method == 'GET' and (path.endswith('/chats') or path == '/'):
        cur.execute("""
            SELECT c.id, c.user_a, c.user_b, c.created_at,
                   ua.name, ua.login, ua.avatar, ua.online, ua.last_seen,
                   ub.name, ub.login, ub.avatar, ub.online, ub.last_seen
            FROM chats c
            JOIN users ua ON ua.id = c.user_a
            JOIN users ub ON ub.id = c.user_b
            WHERE c.user_a = %s OR c.user_b = %s
            ORDER BY c.created_at DESC
        """, (user_id, user_id))
        rows = cur.fetchall()

        # Get blocked
        cur.execute("SELECT blocked_id FROM blocked_users WHERE blocker_id = %s", (user_id,))
        blocked_ids = {r[0] for r in cur.fetchall()}

        chats = []
        for row in rows:
            chat_id = row[0]
            other_id = row[2] if row[1] == user_id else row[1]
            is_a = row[1] == user_id
            if is_a:
                other = {'id': other_id, 'name': row[9], 'login': row[10], 'avatar': row[11], 'online': row[12], 'lastSeen': row[13].isoformat() if row[13] else None}
            else:
                other = {'id': other_id, 'name': row[4], 'login': row[5], 'avatar': row[6], 'online': row[7], 'lastSeen': row[8].isoformat() if row[8] else None}

            # Last message
            cur.execute("""
                SELECT id, from_id, type, text, audio_url, audio_duration, is_removed, created_at
                FROM messages WHERE chat_id = %s AND is_removed = FALSE
                ORDER BY created_at DESC LIMIT 1
            """, (chat_id,))
            lm = cur.fetchone()

            # Unread count
            cur.execute("""
                SELECT COUNT(*) FROM messages m
                LEFT JOIN message_reads mr ON mr.message_id = m.id AND mr.user_id = %s
                WHERE m.chat_id = %s AND m.from_id != %s AND m.is_removed = FALSE AND mr.message_id IS NULL
            """, (user_id, chat_id, user_id))
            unread = cur.fetchone()[0]

            last_msg = None
            if lm:
                last_msg = {
                    'id': lm[0], 'fromId': lm[1], 'type': lm[2],
                    'text': lm[3], 'audioUrl': lm[4], 'audioDuration': lm[5],
                    'deleted': lm[6], 'timestamp': lm[7].isoformat()
                }

            chats.append({
                'id': chat_id,
                'userId': other_id,
                'otherUser': other,
                'unread': unread,
                'lastMessage': last_msg,
                'blocked': other_id in blocked_ids
            })

        conn.close()
        return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps(chats)}

    # POST / — создать чат
    if method == 'POST' and (path.endswith('/chats') or path == '/'):
        other_id = body.get('userId', '')
        if not other_id or other_id == user_id:
            conn.close()
            return {'statusCode': 400, 'headers': cors_headers(), 'body': json.dumps({'error': 'Invalid userId'})}
        # Check exists
        a, b = sorted([user_id, other_id])
        cur.execute("SELECT id FROM chats WHERE user_a = %s AND user_b = %s", (a, b))
        existing = cur.fetchone()
        if existing:
            conn.close()
            return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'id': existing[0], 'exists': True})}
        chat_id = gen_id()
        cur.execute("INSERT INTO chats (id, user_a, user_b) VALUES (%s, %s, %s)", (chat_id, a, b))
        conn.commit()
        conn.close()
        return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'id': chat_id, 'exists': False})}

    # POST /block
    if method == 'POST' and path.endswith('/block'):
        other_id = body.get('userId', '')
        cur.execute("INSERT INTO blocked_users (blocker_id, blocked_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (user_id, other_id))
        conn.commit()
        conn.close()
        return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'ok': True})}

    # POST /unblock
    if method == 'POST' and path.endswith('/unblock'):
        other_id = body.get('userId', '')
        cur.execute("UPDATE blocked_users SET blocker_id = blocker_id WHERE blocker_id = %s AND blocked_id = %s", (user_id, other_id))
        conn.commit()
        conn.close()
        return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'ok': True})}

    conn.close()
    return {'statusCode': 404, 'headers': cors_headers(), 'body': json.dumps({'error': 'Not found'})}
