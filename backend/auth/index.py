import json
import os
import hashlib
import random
import string
import psycopg2
from datetime import datetime


def gen_id():
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=12))


def hash_password(password: str) -> str:
    return hashlib.sha256((password + '_nexus_salt').encode()).hexdigest()


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Auth-Token',
    }


def handler(event: dict, context) -> dict:
    """Авторизация: регистрация, вход, получение профиля, обновление профиля, смена пароля, удаление аккаунта."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers(), 'body': ''}

    method = event.get('httpMethod', 'GET')
    path = event.get('path', '/')
    headers = event.get('headers', {}) or {}
    user_id = headers.get('X-User-Id', '')
    auth_token = headers.get('X-Auth-Token', '')

    body = {}
    if event.get('body'):
        body = json.loads(event['body'])

    conn = get_conn()
    cur = conn.cursor()

    # POST /register
    if method == 'POST' and path.endswith('/register'):
        login = body.get('login', '').strip().lower()
        name = body.get('name', '').strip()
        password = body.get('password', '')
        if not login or not name or not password:
            conn.close()
            return {'statusCode': 400, 'headers': cors_headers(), 'body': json.dumps({'error': 'Заполните все поля'})}
        if len(password) < 4:
            conn.close()
            return {'statusCode': 400, 'headers': cors_headers(), 'body': json.dumps({'error': 'Пароль минимум 4 символа'})}
        cur.execute("SELECT id FROM users WHERE login = %s", (login,))
        if cur.fetchone():
            conn.close()
            return {'statusCode': 409, 'headers': cors_headers(), 'body': json.dumps({'error': 'Логин занят'})}
        uid = gen_id()
        pwd_hash = hash_password(password)
        cur.execute(
            "INSERT INTO users (id, login, name, password_hash, online, last_seen) VALUES (%s, %s, %s, %s, TRUE, NOW())",
            (uid, login, name, pwd_hash)
        )
        conn.commit()
        conn.close()
        return {
            'statusCode': 200,
            'headers': cors_headers(),
            'body': json.dumps({'id': uid, 'login': login, 'name': name, 'avatar': None, 'online': True})
        }

    # POST /login
    if method == 'POST' and path.endswith('/login'):
        login = body.get('login', '').strip().lower()
        password = body.get('password', '')
        cur.execute("SELECT id, login, name, avatar, online FROM users WHERE login = %s AND password_hash = %s", (login, hash_password(password)))
        row = cur.fetchone()
        if not row:
            conn.close()
            return {'statusCode': 401, 'headers': cors_headers(), 'body': json.dumps({'error': 'Неверный логин или пароль'})}
        uid, ulogin, uname, avatar, _ = row
        cur.execute("UPDATE users SET online = TRUE, last_seen = NOW() WHERE id = %s", (uid,))
        conn.commit()
        conn.close()
        return {
            'statusCode': 200,
            'headers': cors_headers(),
            'body': json.dumps({'id': uid, 'login': ulogin, 'name': uname, 'avatar': avatar, 'online': True})
        }

    # POST /logout
    if method == 'POST' and path.endswith('/logout'):
        if user_id:
            password = body.get('password', '')
            cur.execute("SELECT password_hash FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
            if not row or row[0] != hash_password(password):
                conn.close()
                return {'statusCode': 401, 'headers': cors_headers(), 'body': json.dumps({'error': 'Неверный пароль'})}
            cur.execute("UPDATE users SET online = FALSE, last_seen = NOW() WHERE id = %s", (user_id,))
            conn.commit()
        conn.close()
        return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'ok': True})}

    # PUT /profile
    if method == 'PUT' and path.endswith('/profile'):
        if not user_id:
            conn.close()
            return {'statusCode': 401, 'headers': cors_headers(), 'body': json.dumps({'error': 'Unauthorized'})}
        name = body.get('name')
        avatar = body.get('avatar')
        if name:
            cur.execute("UPDATE users SET name = %s WHERE id = %s", (name.strip(), user_id))
        if avatar is not None:
            cur.execute("UPDATE users SET avatar = %s WHERE id = %s", (avatar, user_id))
        conn.commit()
        cur.execute("SELECT id, login, name, avatar, online FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        conn.close()
        return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'id': row[0], 'login': row[1], 'name': row[2], 'avatar': row[3], 'online': row[4]})}

    # PUT /password
    if method == 'PUT' and path.endswith('/password'):
        if not user_id:
            conn.close()
            return {'statusCode': 401, 'headers': cors_headers(), 'body': json.dumps({'error': 'Unauthorized'})}
        old_pwd = body.get('old_password', '')
        new_pwd = body.get('new_password', '')
        if len(new_pwd) < 4:
            conn.close()
            return {'statusCode': 400, 'headers': cors_headers(), 'body': json.dumps({'error': 'Пароль минимум 4 символа'})}
        cur.execute("SELECT password_hash FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        if not row or row[0] != hash_password(old_pwd):
            conn.close()
            return {'statusCode': 401, 'headers': cors_headers(), 'body': json.dumps({'error': 'Неверный текущий пароль'})}
        cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (hash_password(new_pwd), user_id))
        conn.commit()
        conn.close()
        return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'ok': True})}

    # POST /delete-account
    if method == 'POST' and path.endswith('/delete-account'):
        if not user_id:
            conn.close()
            return {'statusCode': 401, 'headers': cors_headers(), 'body': json.dumps({'error': 'Unauthorized'})}
        password = body.get('password', '')
        cur.execute("SELECT password_hash FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        if not row or row[0] != hash_password(password):
            conn.close()
            return {'statusCode': 401, 'headers': cors_headers(), 'body': json.dumps({'error': 'Неверный пароль'})}
        cur.execute("UPDATE users SET name = 'Удалённый пользователь', login = %s, avatar = NULL, online = FALSE WHERE id = %s", (f'deleted_{user_id}', user_id))
        conn.commit()
        conn.close()
        return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'ok': True})}

    # GET /users?q=... — поиск
    if method == 'GET' and path.endswith('/users'):
        if not user_id:
            conn.close()
            return {'statusCode': 401, 'headers': cors_headers(), 'body': json.dumps({'error': 'Unauthorized'})}
        q = (event.get('queryStringParameters') or {}).get('q', '').strip().lower()
        if q:
            cur.execute(
                "SELECT id, login, name, avatar, online, last_seen FROM users WHERE id != %s AND (LOWER(login) LIKE %s OR LOWER(name) LIKE %s OR id = %s) LIMIT 30",
                (user_id, f'%{q}%', f'%{q}%', q)
            )
        else:
            cur.execute("SELECT id, login, name, avatar, online, last_seen FROM users WHERE id != %s LIMIT 50", (user_id,))
        rows = cur.fetchall()
        # Check blocked
        cur.execute("SELECT blocked_id FROM blocked_users WHERE blocker_id = %s", (user_id,))
        blocked_ids = {r[0] for r in cur.fetchall()}
        users = [{'id': r[0], 'login': r[1], 'name': r[2], 'avatar': r[3], 'online': r[4], 'lastSeen': r[5].isoformat() if r[5] else None, 'blocked': r[0] in blocked_ids} for r in rows]
        conn.close()
        return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps(users)}

    # GET /me
    if method == 'GET' and path.endswith('/me'):
        if not user_id:
            conn.close()
            return {'statusCode': 401, 'headers': cors_headers(), 'body': json.dumps({'error': 'Unauthorized'})}
        cur.execute("SELECT id, login, name, avatar, online FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        conn.close()
        if not row:
            return {'statusCode': 404, 'headers': cors_headers(), 'body': json.dumps({'error': 'Not found'})}
        return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'id': row[0], 'login': row[1], 'name': row[2], 'avatar': row[3], 'online': row[4]})}

    conn.close()
    return {'statusCode': 404, 'headers': cors_headers(), 'body': json.dumps({'error': 'Not found'})}
