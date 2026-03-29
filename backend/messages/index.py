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
    """Сообщения: получить список, отправить, пометить прочитанными, удалить своё сообщение."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers(), 'body': ''}

    method = event.get('httpMethod', 'GET')
    path = event.get('path', '/')
    headers = event.get('headers', {}) or {}
    user_id = headers.get('X-User-Id', '')
    params = event.get('queryStringParameters') or {}

    if not user_id:
        return {'statusCode': 401, 'headers': cors_headers(), 'body': json.dumps({'error': 'Unauthorized'})}

    body = {}
    if event.get('body'):
        body = json.loads(event['body'])

    conn = get_conn()
    cur = conn.cursor()

    # GET /?chatId=... — получить сообщения
    if method == 'GET':
        chat_id = params.get('chatId', '')
        if not chat_id:
            conn.close()
            return {'statusCode': 400, 'headers': cors_headers(), 'body': json.dumps({'error': 'chatId required'})}

        cur.execute("""
            SELECT id, from_id, type, text, audio_url, audio_duration, is_removed, created_at
            FROM messages WHERE chat_id = %s
            ORDER BY created_at ASC
        """, (chat_id,))
        rows = cur.fetchall()

        # Get reads for current user
        cur.execute("""
            SELECT mr.message_id FROM message_reads mr
            JOIN messages m ON m.id = mr.message_id
            WHERE m.chat_id = %s AND mr.user_id = %s
        """, (chat_id, user_id))
        read_ids = {r[0] for r in cur.fetchall()}

        # Mark incoming messages as read
        unread_ids = [r[0] for r in rows if r[1] != user_id and r[0] not in read_ids and not r[6]]
        for mid in unread_ids:
            cur.execute("INSERT INTO message_reads (message_id, user_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (mid, user_id))
        if unread_ids:
            conn.commit()

        msgs = []
        for r in rows:
            is_read = r[0] in read_ids or r[1] == user_id
            msgs.append({
                'id': r[0], 'fromId': r[1], 'type': r[2],
                'text': r[3], 'audioUrl': r[4], 'audioDuration': r[5],
                'deleted': r[6], 'timestamp': r[7].isoformat(), 'read': is_read
            })

        conn.close()
        return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps(msgs)}

    # POST / — отправить сообщение
    if method == 'POST' and not path.endswith('/remove'):
        chat_id = body.get('chatId', '')
        msg_type = body.get('type', 'text')
        text = body.get('text')
        audio_url = body.get('audioUrl')
        audio_duration = body.get('audioDuration')
        if not chat_id:
            conn.close()
            return {'statusCode': 400, 'headers': cors_headers(), 'body': json.dumps({'error': 'chatId required'})}

        # Verify user is in chat
        cur.execute("SELECT user_a, user_b FROM chats WHERE id = %s", (chat_id,))
        chat = cur.fetchone()
        if not chat or user_id not in (chat[0], chat[1]):
            conn.close()
            return {'statusCode': 403, 'headers': cors_headers(), 'body': json.dumps({'error': 'Forbidden'})}

        msg_id = gen_id()
        cur.execute("""
            INSERT INTO messages (id, chat_id, from_id, type, text, audio_url, audio_duration)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (msg_id, chat_id, user_id, msg_type, text, audio_url, audio_duration))
        conn.commit()
        conn.close()
        return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'id': msg_id, 'ok': True})}

    # POST /remove — удалить сообщение у всех
    if method == 'POST' and path.endswith('/remove'):
        msg_id = body.get('messageId', '')
        if not msg_id:
            conn.close()
            return {'statusCode': 400, 'headers': cors_headers(), 'body': json.dumps({'error': 'messageId required'})}
        cur.execute("SELECT from_id FROM messages WHERE id = %s", (msg_id,))
        row = cur.fetchone()
        if not row or row[0] != user_id:
            conn.close()
            return {'statusCode': 403, 'headers': cors_headers(), 'body': json.dumps({'error': 'Forbidden'})}
        cur.execute("UPDATE messages SET is_removed = TRUE WHERE id = %s", (msg_id,))
        conn.commit()
        conn.close()
        return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'ok': True})}

    conn.close()
    return {'statusCode': 404, 'headers': cors_headers(), 'body': json.dumps({'error': 'Not found'})}
