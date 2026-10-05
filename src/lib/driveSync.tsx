import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { GOOGLE_CLIENT_ID } from './config';
import { createFile, findFileId, readFile, requestToken, revokeToken, writeFile } from './googleDrive';
import { useUserData, type UserDataMap } from './userData';

type Status = 'disconnected' | 'connecting' | 'connected' | 'error';
const FLAG = 'filmkatalog.drive.connected';
const TOKEN_KEY = 'filmkatalog.drive.token';

interface Ctx {
  enabled: boolean; // Client-ID konfiguriert?
  status: Status;
  error: string;
  lastSync: number | null;
  syncing: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  syncNow: () => Promise<void>;
}

const C = createContext<Ctx | null>(null);

export function DriveSyncProvider({ children }: { children: ReactNode }) {
  const { snapshot, mergeRemote, data } = useUserData();
  const enabled = !!GOOGLE_CLIENT_ID;

  const [status, setStatus] = useState<Status>('disconnected');
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  const token = useRef<string | null>(null);
  const tokenExp = useRef<number>(0);
  const fileId = useRef<string | null>(null);
  const uploadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Gültiges Token im Speicher/localStorage (kein Google-Aufruf) – sonst null.
  const validToken = useCallback((): string | null => {
    if (token.current && tokenExp.current - 60_000 > Date.now()) return token.current;
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      if (raw) {
        const c = JSON.parse(raw) as { token: string; expiresAt: number };
        if (c.token && c.expiresAt - 60_000 > Date.now()) {
          token.current = c.token;
          tokenExp.current = c.expiresAt;
          return c.token;
        }
      }
    } catch {
      /* egal */
    }
    return null;
  }, []);

  // Token besorgen: zuerst gecachtes gültiges Token, sonst Google fragen (still/consent).
  const getToken = useCallback(
    async (interactive: boolean) => {
      if (!interactive) {
        const v = validToken();
        if (v) return v; // kein Google-Aufruf, kein Popup
      }
      const r = await requestToken(GOOGLE_CLIENT_ID, interactive);
      token.current = r.token;
      tokenExp.current = r.expiresAt;
      try {
        localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: r.token, expiresAt: r.expiresAt }));
      } catch {
        /* egal */
      }
      return r.token;
    },
    [validToken],
  );

  // Vollständiger Abgleich: Datei sicherstellen -> lesen -> mergen -> zurückschreiben
  const doSync = useCallback(async () => {
    if (!token.current) return;
    setSyncing(true);
    try {
      if (!fileId.current) {
        fileId.current = (await findFileId(token.current)) || (await createFile(token.current, snapshot()));
      }
      const remote = (await readFile(token.current, fileId.current)) as UserDataMap;
      const merged = mergeRemote(remote || {});
      await writeFile(token.current, fileId.current, merged);
      setLastSync(Date.now());
      setError('');
      setStatus('connected');
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    } finally {
      setSyncing(false);
    }
  }, [mergeRemote, snapshot]);

  const connect = useCallback(async () => {
    if (!enabled) return;
    setStatus('connecting');
    setError('');
    try {
      await getToken(true);
      try {
        localStorage.setItem(FLAG, '1');
      } catch {
        /* egal */
      }
      await doSync();
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    }
  }, [enabled, getToken, doSync]);

  const syncNow = useCallback(async () => {
    if (status !== 'connected' && status !== 'error') return;
    try {
      if (!token.current) await getToken(false);
      await doSync();
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    }
  }, [status, getToken, doSync]);

  const disconnect = useCallback(() => {
    if (token.current) revokeToken(token.current);
    token.current = null;
    tokenExp.current = 0;
    fileId.current = null;
    try {
      localStorage.removeItem(FLAG);
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* egal */
    }
    setStatus('disconnected');
    setLastSync(null);
  }, []);

  // Beim Start still wieder verbinden, wenn zuvor verbunden war
  useEffect(() => {
    if (!enabled) return;
    let ok = false;
    try {
      ok = localStorage.getItem(FLAG) === '1';
    } catch {
      /* egal */
    }
    if (!ok) return;
    (async () => {
      setStatus('connecting');
      try {
        await getToken(false);
        await doSync();
      } catch {
        setStatus('disconnected'); // still fehlgeschlagen -> Nutzer verbindet manuell neu
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Automatisch hochladen, wenn sich lokal etwas ändert (entprellt)
  useEffect(() => {
    if (status !== 'connected' || !fileId.current) return;
    if (uploadTimer.current) clearTimeout(uploadTimer.current);
    uploadTimer.current = setTimeout(() => {
      const t = validToken();
      if (!t) return; // kein gültiges Token → wird beim nächsten Sync nachgeholt
      writeFile(t, fileId.current!, snapshot()).then(
        () => setLastSync(Date.now()),
        (e) => {
          setError((e as Error).message);
          setStatus('error');
        },
      );
    }, 1500);
    return () => {
      if (uploadTimer.current) clearTimeout(uploadTimer.current);
    };
  }, [data, status, snapshot, validToken]);

  const value = useMemo<Ctx>(
    () => ({ enabled, status, error, lastSync, syncing, connect, disconnect, syncNow }),
    [enabled, status, error, lastSync, syncing, connect, disconnect, syncNow],
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useDriveSync(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error('useDriveSync muss innerhalb von <DriveSyncProvider> stehen');
  return v;
}
