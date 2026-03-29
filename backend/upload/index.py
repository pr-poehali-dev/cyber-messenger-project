import json
import os
import base64
import random
import string
import boto3
import psycopg2


def gen_id():
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=16))


def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Auth-Token',
    }


def handler(event: dict, context) -> dict:
    """Загрузка файлов: аудио голосовых сообщений и аватаров в S3."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers(), 'body': ''}

    headers = event.get('headers', {}) or {}
    user_id = headers.get('X-User-Id', '')
    if not user_id:
        return {'statusCode': 401, 'headers': cors_headers(), 'body': json.dumps({'error': 'Unauthorized'})}

    body = {}
    if event.get('body'):
        body = json.loads(event['body'])

    file_type = body.get('type', 'audio')
    data_b64 = body.get('data', '')
    content_type = body.get('contentType', 'audio/webm')

    if not data_b64:
        return {'statusCode': 400, 'headers': cors_headers(), 'body': json.dumps({'error': 'No data'})}

    file_data = base64.b64decode(data_b64)
    ext = 'webm' if 'audio' in content_type else 'jpg'
    key_prefix = 'voice' if file_type == 'audio' else 'avatars'
    key = f'{key_prefix}/{user_id}/{gen_id()}.{ext}'

    s3 = boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY']
    )
    s3.put_object(Bucket='files', Key=key, Body=file_data, ContentType=content_type)

    cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"
    return {'statusCode': 200, 'headers': cors_headers(), 'body': json.dumps({'url': cdn_url})}
