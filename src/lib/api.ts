import func2url from '../../backend/func2url.json';

const URLS = {
  auth: func2url.auth,
  chats: func2url.chats,
  messages: func2url.messages,
  upload: func2url.upload,
};

function getHeaders(userId?: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (userId) h['X-User-Id'] = userId;
  return h;
}

async function req<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
    if (typeof data === 'string') data = JSON.parse(data);
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = (data as Record<string, string>)?.error || 'Ошибка сервера';
    throw new Error(err);
  }
  return data as T;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (login: string, name: string, password: string) =>
    req<{ id: string; login: string; name: string; avatar: string | null; online: boolean }>(
      `${URLS.auth}/register`,
      { method: 'POST', headers: getHeaders(), body: JSON.stringify({ login, name, password }) }
    ),

  login: (login: string, password: string) =>
    req<{ id: string; login: string; name: string; avatar: string | null; online: boolean }>(
      `${URLS.auth}/login`,
      { method: 'POST', headers: getHeaders(), body: JSON.stringify({ login, password }) }
    ),

  logout: (userId: string, password: string) =>
    req<{ ok: boolean }>(
      `${URLS.auth}/logout`,
      { method: 'POST', headers: getHeaders(userId), body: JSON.stringify({ password }) }
    ),

  updateProfile: (userId: string, data: { name?: string; avatar?: string | null }) =>
    req<{ id: string; login: string; name: string; avatar: string | null }>(
      `${URLS.auth}/profile`,
      { method: 'PUT', headers: getHeaders(userId), body: JSON.stringify(data) }
    ),

  changePassword: (userId: string, oldPassword: string, newPassword: string) =>
    req<{ ok: boolean }>(
      `${URLS.auth}/password`,
      { method: 'PUT', headers: getHeaders(userId), body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }) }
    ),

  deleteAccount: (userId: string, password: string) =>
    req<{ ok: boolean }>(
      `${URLS.auth}/delete-account`,
      { method: 'POST', headers: getHeaders(userId), body: JSON.stringify({ password }) }
    ),

  getUsers: (userId: string, query?: string) =>
    req<Array<{ id: string; login: string; name: string; avatar: string | null; online: boolean; lastSeen: string | null; blocked: boolean }>>(
      `${URLS.auth}/users${query ? `?q=${encodeURIComponent(query)}` : ''}`,
      { method: 'GET', headers: getHeaders(userId) }
    ),

  getMe: (userId: string) =>
    req<{ id: string; login: string; name: string; avatar: string | null; online: boolean }>(
      `${URLS.auth}/me`,
      { method: 'GET', headers: getHeaders(userId) }
    ),
};

// ── Chats ─────────────────────────────────────────────────────────────────────
export interface ChatInfo {
  id: string;
  userId: string;
  otherUser: {
    id: string; name: string; login: string; avatar: string | null;
    online: boolean; lastSeen: string | null;
  };
  unread: number;
  lastMessage: MessageInfo | null;
  blocked: boolean;
}

export const chatsApi = {
  getChats: (userId: string) =>
    req<ChatInfo[]>(
      `${URLS.chats}/chats`,
      { method: 'GET', headers: getHeaders(userId) }
    ),

  createChat: (userId: string, otherUserId: string) =>
    req<{ id: string; exists: boolean }>(
      `${URLS.chats}/chats`,
      { method: 'POST', headers: getHeaders(userId), body: JSON.stringify({ userId: otherUserId }) }
    ),

  blockUser: (userId: string, targetId: string) =>
    req<{ ok: boolean }>(
      `${URLS.chats}/block`,
      { method: 'POST', headers: getHeaders(userId), body: JSON.stringify({ userId: targetId }) }
    ),

  unblockUser: (userId: string, targetId: string) =>
    req<{ ok: boolean }>(
      `${URLS.chats}/unblock`,
      { method: 'POST', headers: getHeaders(userId), body: JSON.stringify({ userId: targetId }) }
    ),
};

// ── Messages ──────────────────────────────────────────────────────────────────
export interface MessageInfo {
  id: string;
  fromId: string;
  type: 'text' | 'voice';
  text?: string;
  audioUrl?: string;
  audioDuration?: number;
  deleted: boolean;
  timestamp: string;
  read: boolean;
}

export const messagesApi = {
  getMessages: (userId: string, chatId: string) =>
    req<MessageInfo[]>(
      `${URLS.messages}/?chatId=${chatId}`,
      { method: 'GET', headers: getHeaders(userId) }
    ),

  sendMessage: (userId: string, chatId: string, data: { type: 'text' | 'voice'; text?: string; audioUrl?: string; audioDuration?: number }) =>
    req<{ id: string; ok: boolean }>(
      `${URLS.messages}/`,
      { method: 'POST', headers: getHeaders(userId), body: JSON.stringify({ chatId, ...data }) }
    ),

  removeMessage: (userId: string, messageId: string) =>
    req<{ ok: boolean }>(
      `${URLS.messages}/remove`,
      { method: 'POST', headers: getHeaders(userId), body: JSON.stringify({ messageId }) }
    ),
};

// ── Upload ────────────────────────────────────────────────────────────────────
export const uploadApi = {
  uploadAudio: async (userId: string, blob: Blob): Promise<string> => {
    const buffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const data = await req<{ url: string }>(
      `${URLS.upload}/`,
      { method: 'POST', headers: getHeaders(userId), body: JSON.stringify({ type: 'audio', data: base64, contentType: 'audio/webm' }) }
    );
    return data.url;
  },

  uploadAvatar: async (userId: string, dataUrl: string): Promise<string> => {
    const base64 = dataUrl.split(',')[1];
    const contentType = dataUrl.split(';')[0].split(':')[1];
    const data = await req<{ url: string }>(
      `${URLS.upload}/`,
      { method: 'POST', headers: getHeaders(userId), body: JSON.stringify({ type: 'avatar', data: base64, contentType }) }
    );
    return data.url;
  },
};
