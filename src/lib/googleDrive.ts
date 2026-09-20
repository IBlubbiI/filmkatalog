// Minimaler Google-Drive-Client für den versteckten App-Ordner (appDataFolder).
// Auth über Google Identity Services (GIS), nur Scope drive.appdata – die App sieht
// also ausschließlich ihre eigene Datei, nichts anderes in deinem Drive.

const FILE_NAME = 'filmkatalog-userdata.json';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global {
  interface Window {
    google?: any;
  }
}

let gisPromise: Promise<void> | null = null;
export function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google-Skript konnte nicht geladen werden'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tokenClient: any = null;

export async function requestToken(clientId: string, interactive: boolean): Promise<string> {
  await loadGis();
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: () => {}, // wird pro Anfrage überschrieben
      });
    }
    tokenClient.callback = (resp: { access_token?: string; error?: string }) => {
      if (resp.error || !resp.access_token) reject(new Error(resp.error || 'Kein Token erhalten'));
      else resolve(resp.access_token);
    };
    // interactive -> Consent-Fenster; sonst still (falls schon zugestimmt)
    tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

export function revokeToken(token: string): void {
  try {
    window.google?.accounts?.oauth2?.revoke(token, () => {});
  } catch {
    /* egal */
  }
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Datei im appDataFolder finden (oder null). */
export async function findFileId(token: string): Promise<string | null> {
  const url =
    'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name)&q=' +
    encodeURIComponent(`name='${FILE_NAME}'`);
  const r = await fetch(url, { headers: auth(token) });
  if (!r.ok) throw new Error(`Drive-Suche fehlgeschlagen (${r.status})`);
  const j = await r.json();
  return j.files?.[0]?.id ?? null;
}

export async function createFile(token: string, content: unknown): Promise<string> {
  const boundary = 'flmktlg' + Math.random().toString(36).slice(2);
  const meta = { name: FILE_NAME, parents: ['appDataFolder'] };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(content)}\r\n--${boundary}--`;
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!r.ok) throw new Error(`Drive-Anlegen fehlgeschlagen (${r.status})`);
  return (await r.json()).id;
}

export async function readFile(token: string, id: string): Promise<unknown> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, { headers: auth(token) });
  if (!r.ok) throw new Error(`Drive-Lesen fehlgeschlagen (${r.status})`);
  return r.json();
}

export async function writeFile(token: string, id: string, content: unknown): Promise<void> {
  const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
    method: 'PATCH',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(content),
  });
  if (!r.ok) throw new Error(`Drive-Schreiben fehlgeschlagen (${r.status})`);
}
