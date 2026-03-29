import { useState, useRef, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import { authApi, chatsApi, messagesApi, uploadApi, type ChatInfo, type MessageInfo } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
type Screen = 'auth' | 'app';
type Tab = 'chats' | 'contacts' | 'settings' | 'profile';
type VoiceEffect = 'normal' | 'robot' | 'deep' | 'high' | 'echo';

interface User {
  id: string;
  login: string;
  name: string;
  avatar: string | null;
  online: boolean;
  lastSeen?: string | null;
  blocked?: boolean;
}

// ─── Utils ───────────────────────────────────────────────────────────────────
const formatTime = (d: Date) => d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
const formatDate = (d: Date) => {
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return formatTime(d);
  if (diff < 604800000) return d.toLocaleDateString('ru', { weekday: 'short' });
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' });
};

const linkify = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer"
          className="underline hover:text-white transition-colors" style={{ color: 'var(--neon-cyan)' }}>{part}</a>
      : part
  );
};

// ─── Notification Sound ──────────────────────────────────────────────────────
const playNotificationSound = () => {
  try {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtxClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
  } catch { /* no-op */ }
};

// ─── Avatar ───────────────────────────────────────────────────────────────────
const Avatar = ({ user, size = 40, onClick }: { user: User; size?: number; onClick?: () => void }) => {
  const initials = user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div onClick={onClick} style={{ width: size, height: size, minWidth: size, cursor: onClick ? 'pointer' : 'default', background: 'var(--surface-2)' }}
      className="relative overflow-hidden flex items-center justify-center" style2={{ border: '1px solid var(--line)' }}>
      <div className="absolute inset-0" style={{ border: '1px solid var(--line)' }} />
      {user.avatar ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
        : <span className="font-mono font-bold" style={{ fontSize: size * 0.35, color: 'var(--neon-cyan)' }}>{initials}</span>}
      {user.online && <div className="absolute bottom-0 right-0 w-2 h-2" style={{ background: 'var(--neon-green)', boxShadow: '0 0 4px var(--neon-green)' }} />}
    </div>
  );
};

// ─── Auth Screen ──────────────────────────────────────────────────────────────
const AuthScreen = ({ onLogin }: { onLogin: (user: User) => void }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [login, setLogin] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(''); setLoading(true);
    try {
      if (mode === 'register') {
        if (!login.trim() || !name.trim() || !password) { setError('Заполните все поля'); return; }
        if (password !== confirm) { setError('Пароли не совпадают'); return; }
        const user = await authApi.register(login.trim(), name.trim(), password);
        localStorage.setItem('nexus_uid', user.id);
        onLogin({ ...user, lastSeen: null, blocked: false });
      } else {
        const user = await authApi.login(login.trim(), password);
        localStorage.setItem('nexus_uid', user.id);
        onLogin({ ...user, lastSeen: null, blocked: false });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center scanline" style={{ background: 'var(--surface-0)' }}>
      <div className="w-full max-w-sm px-6 animate-slide-up">
        <div className="mb-10 text-center">
          <h1 className="font-mono text-4xl font-bold tracking-widest mb-1" style={{ color: 'var(--neon-cyan)', textShadow: '0 0 20px rgba(0,245,255,0.6)' }}>NEXUS</h1>
          <p className="text-xs font-mono tracking-widest uppercase" style={{ color: '#444' }}>SECURE MESSENGER // E2E ENCRYPTED</p>
          <div className="mt-4 flex items-center gap-2 justify-center">
            <div className="h-px flex-1" style={{ background: 'var(--line)' }} />
            <div className="w-1.5 h-1.5" style={{ background: 'var(--neon-cyan)', boxShadow: '0 0 6px var(--neon-cyan)' }} />
            <div className="h-px flex-1" style={{ background: 'var(--line)' }} />
          </div>
        </div>

        <div className="flex mb-6" style={{ border: '1px solid var(--line)' }}>
          {(['login', 'register'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }}
              className="flex-1 py-2.5 text-xs font-mono tracking-widest uppercase transition-all"
              style={mode === m ? { background: 'var(--neon-cyan)', color: '#000', fontWeight: 700 } : { color: '#555' }}>
              {m === 'login' ? 'Вход' : 'Регистрация'}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="text-xs font-mono tracking-wider uppercase block mb-1" style={{ color: '#444' }}>Имя</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Ваше имя" className="w-full px-3 py-2.5 text-sm" />
            </div>
          )}
          <div>
            <label className="text-xs font-mono tracking-wider uppercase block mb-1" style={{ color: '#444' }}>Логин</label>
            <input value={login} onChange={e => setLogin(e.target.value)} placeholder="username" className="w-full px-3 py-2.5 text-sm font-mono" />
          </div>
          <div>
            <label className="text-xs font-mono tracking-wider uppercase block mb-1" style={{ color: '#444' }}>Пароль</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder="••••••••" className="w-full px-3 py-2.5 text-sm" />
          </div>
          {mode === 'register' && (
            <div>
              <label className="text-xs font-mono tracking-wider uppercase block mb-1" style={{ color: '#444' }}>Подтверждение</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder="••••••••" className="w-full px-3 py-2.5 text-sm" />
            </div>
          )}
          {error && <p className="text-xs font-mono px-3 py-2 animate-fade-in" style={{ color: '#ff4444', border: '1px solid rgba(255,42,42,0.3)' }}>{error}</p>}
          <button onClick={handleSubmit} disabled={loading}
            className="w-full py-3 mt-2 font-mono text-sm font-bold tracking-widest uppercase transition-colors disabled:opacity-50"
            style={{ background: 'var(--neon-cyan)', color: '#000', boxShadow: '0 0 20px rgba(0,245,255,0.3)' }}>
            {loading ? '// ПОДОЖДИТЕ...' : mode === 'login' ? '// ВОЙТИ' : '// СОЗДАТЬ АККАУНТ'}
          </button>
        </div>
        <p className="mt-8 text-center text-xs font-mono" style={{ color: '#2a2a2a' }}>NEXUS v2.0 // E2E // REAL-TIME</p>
      </div>
    </div>
  );
};

// ─── Voice Message Player ─────────────────────────────────────────────────────
const VoiceMessage = ({ audioUrl, duration }: { audioUrl: string; duration?: number }) => {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.ontimeupdate = () => {
      if (audio.duration) { setProgress((audio.currentTime / audio.duration) * 100); setElapsed(audio.currentTime); }
    };
    audio.onended = () => { setPlaying(false); setProgress(0); setElapsed(0); };
    return () => { audio.pause(); };
  }, [audioUrl]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); } else { audioRef.current.play(); setPlaying(true); }
  };

  const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-2" style={{ minWidth: 160 }}>
      <button onClick={toggle} className="w-7 h-7 flex items-center justify-center transition-all"
        style={{ border: '1px solid var(--neon-cyan)', color: 'var(--neon-cyan)' }}>
        <Icon name={playing ? 'Pause' : 'Play'} size={12} />
      </button>
      <div className="flex-1 h-1 relative cursor-pointer" style={{ background: 'var(--line)' }}
        onClick={e => {
          if (!audioRef.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * (audioRef.current.duration || 0);
        }}>
        <div className="absolute inset-y-0 left-0 transition-all" style={{ width: `${progress}%`, background: 'var(--neon-cyan)' }} />
        <div className="absolute top-1/2 w-2 h-2" style={{ left: `${progress}%`, transform: 'translate(-50%,-50%)', background: 'var(--neon-cyan)' }} />
      </div>
      <span className="text-xs font-mono whitespace-nowrap" style={{ color: '#555' }}>
        {playing ? fmtSec(elapsed) : fmtSec(duration || 0)}
      </span>
    </div>
  );
};

// ─── Message Bubble ───────────────────────────────────────────────────────────
const MessageBubble = ({ msg, isOwn, onDelete }: { msg: MessageInfo; isOwn: boolean; onDelete?: () => void }) => {
  const [menu, setMenu] = useState(false);
  if (msg.deleted) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-2`}>
        <span className="text-xs font-mono italic px-3 py-1" style={{ color: '#444', border: '1px solid var(--line)' }}>[сообщение удалено]</span>
      </div>
    );
  }
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-2 group animate-fade-in`}>
      <div className="relative" style={{ maxWidth: '75%' }}>
        <div className="px-3 py-2" style={isOwn
          ? { background: 'var(--surface-3)', borderLeft: '2px solid var(--neon-cyan)' }
          : { background: 'var(--surface-1)', borderLeft: '2px solid var(--line)' }}>
          {msg.type === 'voice' && msg.audioUrl
            ? <VoiceMessage audioUrl={msg.audioUrl} duration={msg.audioDuration} />
            : <p className="text-sm leading-relaxed break-words">{linkify(msg.text || '')}</p>}
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] font-mono" style={{ color: '#444' }}>{formatTime(new Date(msg.timestamp))}</span>
            {isOwn && <Icon name={msg.read ? 'CheckCheck' : 'Check'} size={10} style={{ color: msg.read ? 'var(--neon-cyan)' : '#444' }} />}
          </div>
        </div>
        {isOwn && (
          <div className="absolute top-1 -left-7 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setMenu(!menu)} className="w-6 h-6 flex items-center justify-center" style={{ color: '#444' }}>
              <Icon name="MoreVertical" size={12} />
            </button>
            {menu && (
              <div className="absolute left-0 top-7 z-50 animate-scale-in" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', minWidth: 150 }}>
                <button onClick={() => { onDelete?.(); setMenu(false); }} className="w-full px-3 py-2 text-xs font-mono text-left flex items-center gap-2 hover:opacity-80" style={{ color: 'var(--neon-red)' }}>
                  <Icon name="Trash2" size={12} /> Удалить у всех
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Voice Recorder ───────────────────────────────────────────────────────────
const VoiceRecorder = ({ onSend, onCancel, userId }: { onSend: (url: string, dur: number) => void; onCancel: () => void; userId: string }) => {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        blobRef.current = blob;
        setAudioUrl(URL.createObjectURL(blob));
        setDuration(elapsedRef.current);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRef.current = mr;
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
      }, 1000);
    } catch { alert('Нет доступа к микрофону'); onCancel(); }
  };

  const stop = () => {
    mediaRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  };

  useEffect(() => { start(); return () => { if (timerRef.current) clearInterval(timerRef.current); }; }, []);

  const handleSend = async () => {
    if (!blobRef.current) return;
    setUploading(true);
    try {
      const url = await uploadApi.uploadAudio(userId, blobRef.current);
      onSend(url, duration);
    } catch { alert('Ошибка загрузки аудио'); } finally { setUploading(false); }
  };

  const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  if (audioUrl) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 border-t animate-fade-in" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)' }}>
        <Icon name="Mic" size={14} style={{ color: 'var(--neon-cyan)' }} />
        <div className="flex-1"><VoiceMessage audioUrl={audioUrl} duration={duration} /></div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="p-1.5 transition-colors" style={{ border: '1px solid var(--line)', color: '#555' }}><Icon name="Trash2" size={12} /></button>
          <button onClick={handleSend} disabled={uploading} className="px-3 py-1.5 text-xs font-mono font-bold flex items-center gap-1 transition-colors disabled:opacity-50" style={{ background: 'var(--neon-cyan)', color: '#000' }}>
            <Icon name="Send" size={12} /> {uploading ? '...' : 'Отправить'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-t" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)' }}>
      <div className="w-2.5 h-2.5 rounded-full recording-indicator" style={{ background: 'var(--neon-red)' }} />
      <span className="font-mono text-xs" style={{ color: 'var(--neon-red)' }}>{fmtSec(elapsed)}</span>
      <span className="text-xs flex-1" style={{ color: '#555' }}>Запись голосового...</span>
      <button onClick={stop} className="px-3 py-1 text-xs font-mono transition-all" style={{ border: '1px solid var(--neon-cyan)', color: 'var(--neon-cyan)' }}>Стоп</button>
      <button onClick={onCancel} style={{ color: '#555' }}><Icon name="X" size={14} /></button>
    </div>
  );
};

// ─── Chat View ────────────────────────────────────────────────────────────────
const ChatView = ({ chatId, currentUser, otherUser, onBack, onBlockUser, onDeleteChat }: {
  chatId: string; currentUser: User; otherUser: User;
  onBack: () => void; onBlockUser: (id: string) => void; onDeleteChat: (id: string) => void;
}) => {
  const [messages, setMessages] = useState<MessageInfo[]>([]);
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [menu, setMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadMessages = useCallback(async () => {
    try {
      const msgs = await messagesApi.getMessages(currentUser.id, chatId);
      setMessages(prev => {
        if (prev.length > 0 && msgs.length > prev.length) playNotificationSound();
        return msgs;
      });
    } catch { /* no-op */ }
    finally { setLoading(false); }
  }, [chatId, currentUser.id]);

  useEffect(() => {
    loadMessages();
    pollRef.current = setInterval(loadMessages, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadMessages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const sendText = async () => {
    if (!text.trim()) return;
    const t = text.trim(); setText('');
    try { await messagesApi.sendMessage(currentUser.id, chatId, { type: 'text', text: t }); loadMessages(); } catch { setText(t); }
  };

  const sendVoice = async (url: string, dur: number) => {
    setRecording(false);
    try { await messagesApi.sendMessage(currentUser.id, chatId, { type: 'voice', audioUrl: url, audioDuration: dur }); loadMessages(); } catch { /* no-op */ }
  };

  const deleteMsg = async (msgId: string) => {
    try { await messagesApi.removeMessage(currentUser.id, msgId); loadMessages(); } catch { /* no-op */ }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ background: 'var(--surface-1)', borderColor: 'var(--line)' }}>
        <button onClick={onBack} className="transition-colors md:hidden" style={{ color: '#555' }}><Icon name="ArrowLeft" size={16} /></button>
        <Avatar user={otherUser} size={36} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{otherUser.name}</p>
          <p className="text-xs font-mono" style={{ color: otherUser.online ? 'var(--neon-green)' : '#555' }}>
            {otherUser.online ? '// онлайн' : `был(а) ${otherUser.lastSeen ? formatDate(new Date(otherUser.lastSeen)) : 'давно'}`}
          </p>
        </div>
        <div className="relative">
          <button onClick={() => setMenu(!menu)} className="w-8 h-8 flex items-center justify-center" style={{ color: '#555' }}><Icon name="MoreVertical" size={16} /></button>
          {menu && (
            <div className="absolute right-0 top-10 z-50 animate-scale-in" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', minWidth: 180 }}>
              <button onClick={() => { onBlockUser(otherUser.id); setMenu(false); }} className="w-full px-4 py-2.5 text-xs font-mono text-left flex items-center gap-2 hover:opacity-80" style={{ color: 'var(--neon-red)' }}>
                <Icon name="ShieldOff" size={12} /> Заблокировать
              </button>
              <button onClick={() => { onDeleteChat(chatId); onBack(); setMenu(false); }} className="w-full px-4 py-2.5 text-xs font-mono text-left flex items-center gap-2 hover:opacity-80" style={{ color: 'var(--neon-red)' }}>
                <Icon name="Trash2" size={12} /> Удалить чат
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && <div className="flex justify-center py-8"><div className="w-1 h-1 blink" style={{ background: 'var(--neon-cyan)' }} /></div>}
        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="p-6" style={{ border: '1px solid var(--line)' }}>
              <Icon name="Lock" size={24} className="mx-auto mb-3" style={{ color: 'var(--neon-cyan)' }} />
              <p className="text-xs font-mono" style={{ color: '#555' }}>// Сквозное шифрование активно<br />Начните диалог</p>
            </div>
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} isOwn={msg.fromId === currentUser.id} onDelete={() => deleteMsg(msg.id)} />
        ))}
        <div ref={bottomRef} />
      </div>

      {recording
        ? <VoiceRecorder onSend={sendVoice} onCancel={() => setRecording(false)} userId={currentUser.id} />
        : (
          <div className="flex items-center gap-2 px-3 py-3 border-t" style={{ background: 'var(--surface-1)', borderColor: 'var(--line)' }}>
            <button onClick={() => setRecording(true)} className="w-8 h-8 flex items-center justify-center transition-all" style={{ border: '1px solid var(--line)', color: '#555' }}><Icon name="Mic" size={14} /></button>
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendText()} placeholder="// сообщение..." className="flex-1 px-3 py-2 text-sm" />
            <button onClick={sendText} disabled={!text.trim()} className="w-8 h-8 flex items-center justify-center transition-colors disabled:opacity-30" style={{ background: 'var(--neon-cyan)', color: '#000' }}><Icon name="Send" size={14} /></button>
          </div>
        )}
    </div>
  );
};

// ─── Chats List ───────────────────────────────────────────────────────────────
const ChatsList = ({ chats, currentUser, activeChat, onSelectChat, onNewChat, onBlockUser, onDeleteChat, onRefresh }: {
  chats: ChatInfo[]; currentUser: User; activeChat: string | null;
  onSelectChat: (id: string, otherUser: User) => void; onNewChat: () => void;
  onBlockUser: (id: string) => void; onDeleteChat: (id: string) => void;
  onRefresh: () => void;
}) => {
  const [menuChat, setMenuChat] = useState<string | null>(null);

  const sorted = [...chats].sort((a, b) => {
    const la = a.lastMessage; const lb = b.lastMessage;
    if (!la && !lb) return 0; if (!la) return 1; if (!lb) return -1;
    return new Date(lb.timestamp).getTime() - new Date(la.timestamp).getTime();
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
        <h2 className="font-mono text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--neon-cyan)' }}>// Чаты</h2>
        <button onClick={onNewChat} className="w-7 h-7 flex items-center justify-center transition-all" style={{ border: '1px solid var(--neon-cyan)', color: 'var(--neon-cyan)' }}><Icon name="Plus" size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Icon name="MessageSquare" size={28} className="mb-3" style={{ color: 'var(--line)' }} />
            <p className="text-xs font-mono" style={{ color: '#444' }}>Нажмите + чтобы начать чат</p>
          </div>
        )}
        {sorted.map(chat => {
          const other: User = { ...chat.otherUser, blocked: chat.blocked };
          const last = chat.lastMessage;
          return (
            <div key={chat.id} className="relative group">
              <div onClick={() => onSelectChat(chat.id, other)} className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-all border-b"
                style={{ borderColor: 'var(--line)', background: activeChat === chat.id ? 'var(--surface-2)' : 'transparent', borderLeft: activeChat === chat.id ? '2px solid var(--neon-cyan)' : '2px solid transparent' }}>
                <Avatar user={other} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{other.name}</span>
                    {last && <span className="text-[10px] font-mono ml-2 shrink-0" style={{ color: '#444' }}>{formatDate(new Date(last.timestamp))}</span>}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs truncate" style={{ color: '#555' }}>
                      {last?.deleted ? '[удалено]' : last?.type === 'voice' ? '🎤 Голосовое' : last?.text || ''}
                    </p>
                    {chat.unread > 0 && <span className="ml-2 shrink-0 w-5 h-5 flex items-center justify-center text-[10px] font-mono font-bold" style={{ background: 'var(--neon-cyan)', color: '#000' }}>{chat.unread > 9 ? '9+' : chat.unread}</span>}
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); setMenuChat(menuChat === chat.id ? null : chat.id); }} className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center" style={{ color: '#555' }}><Icon name="MoreVertical" size={12} /></button>
              </div>
              {menuChat === chat.id && (
                <div className="absolute right-2 top-12 z-50 animate-scale-in" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', minWidth: 180 }}>
                  <button onClick={() => { onBlockUser(other.id); setMenuChat(null); onRefresh(); }} className="w-full px-4 py-2.5 text-xs font-mono text-left flex items-center gap-2" style={{ color: 'var(--neon-red)' }}><Icon name="ShieldOff" size={12} /> Заблокировать</button>
                  <button onClick={() => { onDeleteChat(chat.id); setMenuChat(null); }} className="w-full px-4 py-2.5 text-xs font-mono text-left flex items-center gap-2" style={{ color: 'var(--neon-red)' }}><Icon name="Trash2" size={12} /> Удалить чат</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── New Chat Modal ────────────────────────────────────────────────────────────
const NewChatModal = ({ currentUser, existingChats, onSelect, onClose }: {
  currentUser: User; existingChats: ChatInfo[];
  onSelect: (userId: string) => void; onClose: () => void;
}) => {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try { setUsers(await authApi.getUsers(currentUser.id, query || undefined)); } catch { /* no-op */ }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query, currentUser.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
      <div className="w-full max-w-sm mx-4 animate-scale-in" style={{ background: 'var(--surface-1)', border: '1px solid var(--neon-cyan)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
          <h3 className="font-mono text-sm font-bold" style={{ color: 'var(--neon-cyan)' }}>// НОВЫЙ ЧАТ</h3>
          <button onClick={onClose} style={{ color: '#555' }}><Icon name="X" size={16} /></button>
        </div>
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по имени, логину, ID..." className="w-full px-3 py-2 text-sm" autoFocus />
        </div>
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          {loading && <p className="px-4 py-4 text-xs font-mono text-center" style={{ color: '#444' }}>// поиск...</p>}
          {!loading && users.length === 0 && <p className="px-4 py-6 text-xs font-mono text-center" style={{ color: '#444' }}>Пользователи не найдены</p>}
          {users.map(u => (
            <button key={u.id} onClick={() => onSelect(u.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left border-b transition-colors hover:opacity-80" style={{ borderColor: 'var(--line)' }}>
              <Avatar user={u} size={36} />
              <div>
                <p className="text-sm font-medium">{u.name}</p>
                <p className="text-xs font-mono" style={{ color: '#555' }}>@{u.login} · #{u.id.slice(0, 6)}</p>
              </div>
              {existingChats.find(c => c.userId === u.id) && (
                <span className="ml-auto text-[10px] font-mono px-1" style={{ color: 'var(--neon-cyan)', border: '1px solid var(--neon-cyan)' }}>уже</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Contacts Tab ─────────────────────────────────────────────────────────────
const ContactsTab = ({ currentUser, onStartChat }: { currentUser: User; onStartChat: (userId: string) => void }) => {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try { setUsers(await authApi.getUsers(currentUser.id, query || undefined)); } catch { /* no-op */ }
      finally { setLoading(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [query, currentUser.id]);

  const handleBlock = async (uid: string) => {
    try { await chatsApi.blockUser(currentUser.id, uid); setUsers(u => u.map(x => x.id === uid ? { ...x, blocked: true } : x)); } catch { /* no-op */ }
  };
  const handleUnblock = async (uid: string) => {
    try { await chatsApi.unblockUser(currentUser.id, uid); setUsers(u => u.map(x => x.id === uid ? { ...x, blocked: false } : x)); } catch { /* no-op */ }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
        <h2 className="font-mono text-xs font-bold tracking-widest uppercase mb-3" style={{ color: 'var(--neon-cyan)' }}>// Контакты</h2>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск пользователей..." className="w-full px-3 py-2 text-sm" />
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="flex justify-center py-6"><div className="w-1 h-1 blink" style={{ background: 'var(--neon-cyan)' }} /></div>}
        {!loading && users.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full">
            <Icon name="Users" size={28} className="mb-3" style={{ color: 'var(--line)' }} />
            <p className="text-xs font-mono" style={{ color: '#444' }}>Пользователи не найдены</p>
          </div>
        )}
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-3 px-4 py-3 border-b transition-colors" style={{ borderColor: 'var(--line)' }}>
            <Avatar user={u} size={38} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{u.name}</p>
              <p className="text-xs font-mono" style={{ color: '#555' }}>@{u.login}</p>
              {u.blocked && <span className="text-[10px] font-mono" style={{ color: 'var(--neon-red)' }}>// заблокирован</span>}
            </div>
            <div className="flex gap-1">
              {!u.blocked ? (
                <>
                  <button onClick={() => onStartChat(u.id)} className="w-7 h-7 flex items-center justify-center transition-all" style={{ border: '1px solid var(--line)', color: '#555' }}><Icon name="MessageSquare" size={12} /></button>
                  <button onClick={() => handleBlock(u.id)} className="w-7 h-7 flex items-center justify-center transition-all" style={{ border: '1px solid var(--line)', color: '#555' }}><Icon name="ShieldOff" size={12} /></button>
                </>
              ) : (
                <button onClick={() => handleUnblock(u.id)} className="px-2 py-1 text-[10px] font-mono transition-colors" style={{ border: '1px solid var(--line)', color: '#888' }}>Разблок</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Profile Tab ──────────────────────────────────────────────────────────────
const ProfileTab = ({ currentUser, onUpdateUser }: { currentUser: User; onUpdateUser: (u: User) => void }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(currentUser.name);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const dataUrl = ev.target?.result as string;
      setUploading(true);
      try {
        const url = await uploadApi.uploadAvatar(currentUser.id, dataUrl);
        const updated = await authApi.updateProfile(currentUser.id, { avatar: url });
        onUpdateUser({ ...currentUser, ...updated });
      } catch { /* no-op */ } finally { setUploading(false); }
    };
    reader.readAsDataURL(file);
  };

  const saveName = async () => {
    if (!name.trim()) return;
    try {
      const updated = await authApi.updateProfile(currentUser.id, { name: name.trim() });
      onUpdateUser({ ...currentUser, ...updated });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch { /* no-op */ }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
        <h2 className="font-mono text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--neon-cyan)' }}>// Профиль</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Avatar user={currentUser} size={80} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="absolute -bottom-2 -right-2 w-7 h-7 flex items-center justify-center transition-colors disabled:opacity-50" style={{ background: 'var(--neon-cyan)', color: '#000' }}>
              <Icon name={uploading ? 'Loader' : 'Camera'} size={12} />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
          </div>
          <div className="text-center">
            <p className="font-medium">{currentUser.name}</p>
            <p className="text-xs font-mono" style={{ color: 'var(--neon-cyan)' }}>@{currentUser.login}</p>
            <p className="text-[10px] font-mono mt-1" style={{ color: '#333' }}>ID: #{currentUser.id}</p>
          </div>
        </div>
        <div className="p-4 space-y-3" style={{ border: '1px solid var(--line)' }}>
          <p className="text-xs font-mono tracking-wider uppercase" style={{ color: '#555' }}>Отображаемое имя</p>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 text-sm" />
          <button onClick={saveName} className="w-full py-2.5 text-xs font-mono font-bold transition-colors" style={{ background: 'var(--neon-cyan)', color: '#000' }}>
            {saved ? '// СОХРАНЕНО ✓' : '// СОХРАНИТЬ'}
          </button>
        </div>
        <div className="p-4 space-y-2.5" style={{ border: '1px solid var(--line)' }}>
          <p className="text-xs font-mono tracking-wider uppercase mb-3" style={{ color: '#555' }}>Безопасность</p>
          {[{ icon: 'Lock', label: 'Сквозное шифрование активно' }, { icon: 'EyeOff', label: 'IP адрес скрыт' }, { icon: 'Shield', label: 'Активность скрыта от оператора' }].map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs font-mono">
              <Icon name={item.icon as 'Lock'} size={12} style={{ color: 'var(--neon-green)' }} />
              <span style={{ color: '#aaa' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Settings Tab ─────────────────────────────────────────────────────────────
const SettingsTab = ({ currentUser, voiceEffect, onVoiceEffectChange, onLogout, onDeleteAccount }: {
  currentUser: User; voiceEffect: VoiceEffect;
  onVoiceEffectChange: (e: VoiceEffect) => void;
  onLogout: () => void; onDeleteAccount: () => void;
}) => {
  const [changePwd, setChangePwd] = useState(false);
  const [oldPwd, setOldPwd] = useState(''); const [newPwd, setNewPwd] = useState(''); const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState(''); const [pwdSuccess, setPwdSuccess] = useState(false); const [pwdLoading, setPwdLoading] = useState(false);
  const [logoutModal, setLogoutModal] = useState(false); const [logoutPwd, setLogoutPwd] = useState(''); const [logoutErr, setLogoutErr] = useState(''); const [logoutLoading, setLogoutLoading] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false); const [deletePwd, setDeletePwd] = useState(''); const [deleteErr, setDeleteErr] = useState(''); const [deleteLoading, setDeleteLoading] = useState(false);

  const voiceEffects: { id: VoiceEffect; label: string }[] = [
    { id: 'normal', label: 'Обычный' }, { id: 'robot', label: 'Робот' },
    { id: 'deep', label: 'Глубокий' }, { id: 'high', label: 'Высокий' }, { id: 'echo', label: 'Эхо' },
  ];

  const handleChangePwd = async () => {
    setPwdError('');
    if (newPwd !== confirmPwd) { setPwdError('Пароли не совпадают'); return; }
    if (newPwd.length < 4) { setPwdError('Минимум 4 символа'); return; }
    setPwdLoading(true);
    try {
      await authApi.changePassword(currentUser.id, oldPwd, newPwd);
      setPwdSuccess(true); setOldPwd(''); setNewPwd(''); setConfirmPwd('');
      setTimeout(() => { setPwdSuccess(false); setChangePwd(false); }, 2000);
    } catch (e) { setPwdError((e as Error).message); }
    finally { setPwdLoading(false); }
  };

  const handleLogout = async () => {
    setLogoutLoading(true); setLogoutErr('');
    try { await authApi.logout(currentUser.id, logoutPwd); onLogout(); } catch (e) { setLogoutErr((e as Error).message); }
    finally { setLogoutLoading(false); }
  };

  const handleDelete = async () => {
    setDeleteLoading(true); setDeleteErr('');
    try { await authApi.deleteAccount(currentUser.id, deletePwd); onDeleteAccount(); } catch (e) { setDeleteErr((e as Error).message); }
    finally { setDeleteLoading(false); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
        <h2 className="font-mono text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--neon-cyan)' }}>// Настройки</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="p-4" style={{ border: '1px solid var(--line)' }}>
          <p className="text-xs font-mono tracking-wider uppercase mb-3" style={{ color: '#555' }}>Голос в сообщениях</p>
          <div className="grid grid-cols-2 gap-2">
            {voiceEffects.map(e => (
              <button key={e.id} onClick={() => onVoiceEffectChange(e.id)} className="py-2.5 text-xs font-mono transition-all"
                style={voiceEffect === e.id ? { border: '1px solid var(--neon-cyan)', color: 'var(--neon-cyan)', background: 'rgba(0,245,255,0.05)' } : { border: '1px solid var(--line)', color: '#555' }}>
                {e.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4" style={{ border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-mono tracking-wider uppercase" style={{ color: '#555' }}>Сменить пароль</p>
            <button onClick={() => setChangePwd(!changePwd)} className="text-xs font-mono" style={{ color: 'var(--neon-cyan)' }}>{changePwd ? '× Закрыть' : '→ Открыть'}</button>
          </div>
          {changePwd && (
            <div className="space-y-2 animate-fade-in">
              <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} placeholder="Текущий пароль" className="w-full px-3 py-2 text-sm" />
              <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Новый пароль" className="w-full px-3 py-2 text-sm" />
              <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder="Подтвердить" className="w-full px-3 py-2 text-sm" />
              {pwdError && <p className="text-xs font-mono" style={{ color: 'var(--neon-red)' }}>{pwdError}</p>}
              {pwdSuccess && <p className="text-xs font-mono" style={{ color: 'var(--neon-green)' }}>// Пароль изменён</p>}
              <button onClick={handleChangePwd} disabled={pwdLoading} className="w-full py-2.5 text-xs font-mono font-bold disabled:opacity-50" style={{ background: 'var(--neon-cyan)', color: '#000' }}>
                {pwdLoading ? '// СОХРАНЕНИЕ...' : '// СОХРАНИТЬ'}
              </button>
            </div>
          )}
        </div>

        <div className="p-4 space-y-2.5" style={{ border: '1px solid var(--line)' }}>
          <p className="text-xs font-mono tracking-wider uppercase mb-3" style={{ color: '#555' }}>Приватность</p>
          {['Скрыть мой IP адрес', 'Скрыть активность от оператора', 'Сквозное шифрование'].map((label, i) => (
            <div key={i} className="flex items-center justify-between py-1">
              <span className="text-xs font-mono" style={{ color: '#aaa' }}>{label}</span>
              <div className="w-9 h-5 flex items-center px-0.5" style={{ border: '1px solid var(--neon-cyan)', background: 'rgba(0,245,255,0.05)' }}>
                <div className="w-3.5 h-3.5" style={{ background: 'var(--neon-cyan)', marginLeft: 'auto' }} />
              </div>
            </div>
          ))}
        </div>

        <button onClick={() => setLogoutModal(true)} className="w-full py-3 text-xs font-mono flex items-center justify-center gap-2" style={{ border: '1px solid var(--line)', color: '#888' }}>
          <Icon name="LogOut" size={12} /> // ВЫЙТИ ИЗ АККАУНТА
        </button>
        <button onClick={() => setDeleteModal(true)} className="w-full py-3 text-xs font-mono flex items-center justify-center gap-2" style={{ border: '1px solid rgba(255,42,42,0.3)', color: 'var(--neon-red)' }}>
          <Icon name="Trash2" size={12} /> // УДАЛИТЬ АККАУНТ
        </button>
      </div>

      {logoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="w-full max-w-xs mx-4 animate-scale-in" style={{ background: 'var(--surface-1)', border: '1px solid var(--line)' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
              <h3 className="font-mono text-sm font-bold">// ПОДТВЕРЖДЕНИЕ ВЫХОДА</h3>
            </div>
            <div className="px-4 py-4 space-y-3">
              <input type="password" value={logoutPwd} onChange={e => setLogoutPwd(e.target.value)} placeholder="Пароль" className="w-full px-3 py-2 text-sm" autoFocus />
              {logoutErr && <p className="text-xs font-mono" style={{ color: 'var(--neon-red)' }}>{logoutErr}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setLogoutModal(false); setLogoutPwd(''); setLogoutErr(''); }} className="flex-1 py-2.5 text-xs font-mono" style={{ border: '1px solid var(--line)', color: '#888' }}>Отмена</button>
                <button onClick={handleLogout} disabled={logoutLoading} className="flex-1 py-2.5 text-xs font-mono font-bold disabled:opacity-50" style={{ background: 'var(--neon-cyan)', color: '#000' }}>
                  {logoutLoading ? '...' : 'Выйти'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="w-full max-w-xs mx-4 animate-scale-in" style={{ background: 'var(--surface-1)', border: '1px solid var(--neon-red)' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,42,42,0.3)' }}>
              <h3 className="font-mono text-sm font-bold" style={{ color: 'var(--neon-red)' }}>// УДАЛЕНИЕ АККАУНТА</h3>
            </div>
            <div className="px-4 py-4 space-y-3">
              <p className="text-xs font-mono" style={{ color: '#666' }}>Это действие необратимо.</p>
              <input type="password" value={deletePwd} onChange={e => setDeletePwd(e.target.value)} placeholder="Пароль" className="w-full px-3 py-2 text-sm" autoFocus />
              {deleteErr && <p className="text-xs font-mono" style={{ color: 'var(--neon-red)' }}>{deleteErr}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setDeleteModal(false); setDeletePwd(''); setDeleteErr(''); }} className="flex-1 py-2.5 text-xs font-mono" style={{ border: '1px solid var(--line)', color: '#888' }}>Отмена</button>
                <button onClick={handleDelete} disabled={deleteLoading} className="flex-1 py-2.5 text-xs font-mono font-bold disabled:opacity-50" style={{ background: 'var(--neon-red)', color: '#fff' }}>
                  {deleteLoading ? '...' : 'Удалить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Side Menu ────────────────────────────────────────────────────────────────
const SideMenu = ({ open, currentUser, tab, onTabChange, onClose, totalUnread }: {
  open: boolean; currentUser: User; tab: Tab; onTabChange: (t: Tab) => void; onClose: () => void; totalUnread: number;
}) => {
  const items = [
    { id: 'chats' as Tab, icon: 'MessageSquare', label: 'Чаты' },
    { id: 'contacts' as Tab, icon: 'Users', label: 'Контакты' },
    { id: 'profile' as Tab, icon: 'User', label: 'Профиль' },
    { id: 'settings' as Tab, icon: 'Settings', label: 'Настройки' },
  ];
  return (
    <>
      {open && <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose} />}
      <div className="fixed left-0 top-0 h-full z-50 flex flex-col transition-transform duration-300"
        style={{ width: 260, background: 'var(--surface-1)', borderRight: '1px solid var(--neon-cyan)', boxShadow: open ? '6px 0 40px rgba(0,245,255,0.08)' : 'none', transform: open ? 'translateX(0)' : 'translateX(-100%)' }}>
        <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--line)' }}>
          <h1 className="font-mono text-2xl font-bold tracking-widest" style={{ color: 'var(--neon-cyan)', textShadow: '0 0 15px rgba(0,245,255,0.5)' }}>NEXUS</h1>
          <p className="text-[10px] font-mono mt-0.5 tracking-widest" style={{ color: '#333' }}>SECURE MESSENGER</p>
        </div>
        <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: 'var(--line)' }}>
          <Avatar user={currentUser} size={36} />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{currentUser.name}</p>
            <p className="text-[10px] font-mono" style={{ color: 'var(--neon-cyan)' }}>@{currentUser.login}</p>
          </div>
        </div>
        <nav className="flex-1 py-2">
          {items.map(item => (
            <button key={item.id} onClick={() => { onTabChange(item.id); onClose(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-all"
              style={tab === item.id ? { color: 'var(--neon-cyan)', background: 'var(--surface-2)', borderRight: '2px solid var(--neon-cyan)' } : { color: '#666' }}>
              <Icon name={item.icon as 'MessageSquare'} size={15} />
              <span className="font-mono">{item.label}</span>
              {item.id === 'chats' && totalUnread > 0 && (
                <span className="ml-auto w-5 h-5 flex items-center justify-center text-[10px] font-mono font-bold" style={{ background: 'var(--neon-cyan)', color: '#000' }}>{totalUnread > 9 ? '9+' : totalUnread}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-center gap-2 text-[10px] font-mono" style={{ color: '#333' }}>
            <div className="w-1.5 h-1.5 animate-pulse-slow" style={{ background: 'var(--neon-green)', boxShadow: '0 0 4px var(--neon-green)' }} />
            E2E ШИФРОВАНИЕ АКТИВНО
          </div>
        </div>
      </div>
    </>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
const AppView = ({ currentUser: initUser, onLogout, onDeleteAccount }: {
  currentUser: User; onLogout: () => void; onDeleteAccount: () => void;
}) => {
  const [currentUser, setCurrentUser] = useState(initUser);
  const [chats, setChats] = useState<ChatInfo[]>([]);
  const [tab, setTab] = useState<Tab>('chats');
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [activeChatUser, setActiveChatUser] = useState<User | null>(null);
  const [sideMenu, setSideMenu] = useState(false);
  const [newChatModal, setNewChatModal] = useState(false);
  const [voiceEffect, setVoiceEffect] = useState<VoiceEffect>('normal');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadChats = useCallback(async () => {
    try {
      const data = await chatsApi.getChats(currentUser.id);
      setChats(prev => {
        const prevUnread = prev.reduce((s, c) => s + c.unread, 0);
        const newUnread = data.reduce((s, c) => s + c.unread, 0);
        if (newUnread > prevUnread) playNotificationSound();
        return data;
      });
    } catch { /* no-op */ }
  }, [currentUser.id]);

  useEffect(() => {
    loadChats();
    pollRef.current = setInterval(loadChats, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadChats]);

  const totalUnread = chats.reduce((s, c) => s + c.unread, 0);

  const handleSelectChat = (chatId: string, otherUser: User) => {
    setActiveChat(chatId);
    setActiveChatUser(otherUser);
    setTab('chats');
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, unread: 0 } : c));
  };

  const handleNewChat = async (userId: string) => {
    try {
      const { id } = await chatsApi.createChat(currentUser.id, userId);
      await loadChats();
      const chat = await chatsApi.getChats(currentUser.id);
      const found = chat.find(c => c.id === id);
      if (found) handleSelectChat(found.id, { ...found.otherUser, blocked: found.blocked });
      setNewChatModal(false);
    } catch { /* no-op */ }
  };

  const handleBlockUser = async (userId: string) => {
    try { await chatsApi.blockUser(currentUser.id, userId); await loadChats(); } catch { /* no-op */ }
  };

  const handleDeleteChat = (chatId: string) => {
    setChats(prev => prev.filter(c => c.id !== chatId));
    if (activeChat === chatId) { setActiveChat(null); setActiveChatUser(null); }
  };

  const icons: Record<Tab, string> = { chats: 'MessageSquare', contacts: 'Users', profile: 'User', settings: 'Settings' };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--surface-0)' }}>
      <SideMenu open={sideMenu} currentUser={currentUser} tab={tab} onTabChange={setTab} onClose={() => setSideMenu(false)} totalUnread={totalUnread} />

      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col border-r" style={{ width: 280, minWidth: 280, borderColor: 'var(--line)' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
          <button onClick={() => setSideMenu(true)} className="w-8 h-8 flex items-center justify-center" style={{ color: '#555' }}><Icon name="MoreHorizontal" size={16} /></button>
          <h1 className="font-mono text-base font-bold tracking-widest flex-1" style={{ color: 'var(--neon-cyan)' }}>NEXUS</h1>
          {totalUnread > 0 && <span className="w-5 h-5 flex items-center justify-center text-[10px] font-mono font-bold" style={{ background: 'var(--neon-cyan)', color: '#000' }}>{totalUnread}</span>}
        </div>
        <div className="flex border-b" style={{ borderColor: 'var(--line)' }}>
          {(['chats', 'contacts', 'profile', 'settings'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className="flex-1 py-2.5 flex items-center justify-center relative transition-all"
              style={{ color: tab === t ? 'var(--neon-cyan)' : '#555', borderBottom: tab === t ? '2px solid var(--neon-cyan)' : '2px solid transparent' }}>
              <Icon name={icons[t] as 'MessageSquare'} size={15} />
              {t === 'chats' && totalUnread > 0 && (
                <span className="absolute top-1 right-1 w-3 h-3 flex items-center justify-center text-[8px] font-mono" style={{ background: 'var(--neon-cyan)', color: '#000' }}>{totalUnread > 9 ? '9+' : totalUnread}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          {tab === 'chats' && <ChatsList chats={chats} currentUser={currentUser} activeChat={activeChat} onSelectChat={handleSelectChat} onNewChat={() => setNewChatModal(true)} onBlockUser={handleBlockUser} onDeleteChat={handleDeleteChat} onRefresh={loadChats} />}
          {tab === 'contacts' && <ContactsTab currentUser={currentUser} onStartChat={(uid) => { handleNewChat(uid); setTab('chats'); }} />}
          {tab === 'profile' && <ProfileTab currentUser={currentUser} onUpdateUser={setCurrentUser} />}
          {tab === 'settings' && <SettingsTab currentUser={currentUser} voiceEffect={voiceEffect} onVoiceEffectChange={setVoiceEffect} onLogout={onLogout} onDeleteAccount={onDeleteAccount} />}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex" style={{ background: 'var(--surface-1)', borderTop: '1px solid var(--line)' }}>
        {(['chats', 'contacts', 'profile', 'settings'] as Tab[]).map(t => (
          <button key={t} onClick={() => { setTab(t); if (t !== 'chats') { setActiveChat(null); setActiveChatUser(null); } }} className="flex-1 py-3 flex items-center justify-center relative"
            style={{ color: tab === t ? 'var(--neon-cyan)' : '#444' }}>
            <Icon name={icons[t] as 'MessageSquare'} size={18} />
            {t === 'chats' && totalUnread > 0 && (
              <span className="absolute top-2 right-[calc(50%-14px)] w-3.5 h-3.5 flex items-center justify-center text-[8px] font-mono" style={{ background: 'var(--neon-cyan)', color: '#000' }}>{totalUnread}</span>
            )}
          </button>
        ))}
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {activeChat && activeChatUser ? (
          <ChatView chatId={activeChat} currentUser={currentUser} otherUser={activeChatUser} onBack={() => { setActiveChat(null); setActiveChatUser(null); }} onBlockUser={handleBlockUser} onDeleteChat={handleDeleteChat} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center scanline">
            <div className="text-center animate-fade-in">
              <h1 className="font-mono font-bold tracking-widest mb-2" style={{ fontSize: 48, color: 'var(--neon-cyan)', textShadow: '0 0 30px rgba(0,245,255,0.4)' }}>NEXUS</h1>
              <p className="text-xs font-mono tracking-widest mb-8" style={{ color: '#333' }}>SECURE MESSENGER // E2E ENCRYPTED</p>
              <div className="space-y-2">
                {[{ icon: 'Lock', label: 'Сквозное шифрование' }, { icon: 'EyeOff', label: 'IP адреса скрыты' }, { icon: 'Shield', label: 'Активность скрыта от оператора' }].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs font-mono justify-center" style={{ color: '#444' }}>
                    <Icon name={item.icon as 'Lock'} size={11} style={{ color: 'var(--neon-green)' }} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex items-center gap-2 justify-center">
                <div className="h-px w-16" style={{ background: 'var(--line)' }} />
                <div className="w-1.5 h-1.5 blink" style={{ background: 'var(--neon-cyan)' }} />
                <div className="h-px w-16" style={{ background: 'var(--line)' }} />
              </div>
              <p className="mt-4 text-[10px] font-mono" style={{ color: '#2a2a2a' }}>Выберите чат или нажмите + для нового</p>
            </div>
          </div>
        )}
      </div>

      {newChatModal && <NewChatModal currentUser={currentUser} existingChats={chats} onSelect={handleNewChat} onClose={() => setNewChatModal(false)} />}
    </div>
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function Index() {
  const [screen, setScreen] = useState<Screen>('auth');
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const uid = localStorage.getItem('nexus_uid');
    if (uid) {
      authApi.getMe(uid).then(user => {
        setCurrentUser({ ...user, lastSeen: null, blocked: false });
        setScreen('app');
      }).catch(() => localStorage.removeItem('nexus_uid'));
    }
  }, []);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    setScreen('app');
  };

  const handleLogout = () => {
    localStorage.removeItem('nexus_uid');
    setCurrentUser(null);
    setScreen('auth');
  };

  if (screen === 'auth') return <AuthScreen onLogin={handleLogin} />;
  if (screen === 'app' && currentUser) {
    return <AppView currentUser={currentUser} onLogout={handleLogout} onDeleteAccount={handleLogout} />;
  }
  return null;
}
