// The sync file in Drive's hidden app folder (scope drive.appdata): find, download, check its
// version, create, update. Same calls as the Mac's GoogleDriveStore.
import { googleFetch, getJSON } from './api'

export const FILE_NAME = 'lifetracker-sync.json'

export interface DriveFile { id: string; version: number }

const toFile = (f: { id: string; version?: string }): DriveFile => ({ id: f.id, version: Number(f.version ?? 0) })

export async function findFile(): Promise<DriveFile | undefined> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder', q: `name = '${FILE_NAME}' and trashed = false`, fields: 'files(id,version)', orderBy: 'createdTime',
  })
  const data = await getJSON<{ files?: { id: string; version?: string }[] }>(`https://www.googleapis.com/drive/v3/files?${params}`)
  return data.files?.[0] ? toFile(data.files[0]) : undefined
}

export async function download(file: DriveFile): Promise<unknown> {
  return (await googleFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`)).json()
}

export async function currentVersion(file: DriveFile): Promise<number> {
  return toFile(await getJSON(`https://www.googleapis.com/drive/v3/files/${file.id}?fields=id,version`)).version
}

export async function createFile(body: string): Promise<DriveFile> {
  const boundary = `lifetracker-${crypto.randomUUID()}`
  const metadata = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' })
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--\r\n`
  const response = await googleFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,version', {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart,
  })
  return toFile(await response.json())
}

export async function updateFile(file: DriveFile, body: string): Promise<DriveFile> {
  const response = await googleFetch(`https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=media&fields=id,version`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body,
  })
  return toFile(await response.json())
}
