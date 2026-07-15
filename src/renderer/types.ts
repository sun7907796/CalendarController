export interface Event {
  id: string
  googleId?: string
  calendarId?: string
  colorId?: string
  title: string
  description: string
  location: string
  date: string
  startTime: string
  endTime: string
  allDay: boolean
  updatedAt: string
  _deleted?: boolean
  _moveFrom?: string
}

export interface Calendar {
  id: string
  summary: string
  primary: boolean
  accessRole: 'owner' | 'writer' | 'reader' | 'freeBusyReader'
  backgroundColor?: string
}

export interface SyncPayload {
  events: Event[]
  rangeStart: string
  rangeEnd: string
  calendarId?: string
}

export interface IpcResult<T = any> {
  ok: boolean
  data?: T
  reason?: string
  url?: string
}

export interface GoogleStatus {
  hasCredentials: boolean
  signedIn: boolean
}

export interface AppSettings {
  targetCalendarId?: string
  [key: string]: any
}

export interface AppInfo {
  version: string
  dataDir: string
}
