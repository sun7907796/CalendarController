import { google } from 'googleapis'
import path from 'path'
import fs from 'fs'
import type { OAuth2Client } from 'google-auth-library'

const SCOPES = ['https://www.googleapis.com/auth/calendar']

export class GoogleCalendarManager {
  private credentialsPath: string
  private tokenPath: string

  constructor(dataDir: string) {
    this.credentialsPath = path.join(dataDir, 'credentials.json')
    this.tokenPath = path.join(dataDir, 'token.json')
  }

  private loadCredentials() {
    if (!fs.existsSync(this.credentialsPath)) {
      return null
    }
    return JSON.parse(fs.readFileSync(this.credentialsPath, 'utf-8'))
  }

  private loadToken() {
    if (!fs.existsSync(this.tokenPath)) {
      return null
    }
    return JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8'))
  }

  private saveToken(token: any) {
    fs.writeFileSync(this.tokenPath, JSON.stringify(token, null, 2))
  }

  // redirectUri 必須與登入時啟動的本機回呼伺服器完全一致（含埠號），
  // 否則 Google 會把瀏覽器導回錯誤的位址，導致拿不到授權碼而卡住。
  private getAuth(redirectUri: string = 'http://127.0.0.1'): OAuth2Client {
    const credentials = this.loadCredentials()
    if (!credentials) {
      throw new Error('Credentials file not found')
    }

    const key = credentials.installed || credentials.web
    if (!key) {
      throw new Error('Invalid credentials file')
    }

    const auth = new google.auth.OAuth2(
      key.client_id,
      key.client_secret,
      redirectUri
    )

    const token = this.loadToken()
    if (token) {
      auth.setCredentials(token)
    }

    // 權杖被自動更新時存回檔案，並保留原有的 refresh_token
    auth.on('tokens', (tokens) => {
      const existing = this.loadToken() || {}
      const merged: any = { ...existing, ...tokens }
      if (!tokens.refresh_token && existing.refresh_token) {
        merged.refresh_token = existing.refresh_token
      }
      this.saveToken(merged)
    })

    return auth
  }

  async authorize(): Promise<OAuth2Client> {
    const auth = this.getAuth()
    const token = this.loadToken()
    if (!token) {
      throw new Error('Need to authenticate')
    }
    return auth
  }

  getAuthUrl(redirectUri: string): string {
    const auth = this.getAuth(redirectUri)
    return auth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // 強制取得 refresh_token（否則重開機後 access_token 過期需重新登入）
      scope: SCOPES
    })
  }

  async handleAuthCallback(code: string, redirectUri: string): Promise<void> {
    // 換取權杖時所用的 redirectUri 必須與 getAuthUrl 相同，否則 Google 會回 redirect_uri_mismatch。
    const auth = this.getAuth(redirectUri)
    const { tokens } = await auth.getToken(code)
    auth.setCredentials(tokens)
    this.saveToken(tokens)
  }

  async listCalendars(): Promise<any[]> {
    const auth = await this.authorize()
    const calendar = google.calendar({ version: 'v3', auth })
    const response = await calendar.calendarList.list()
    return response.data.items || []
  }

  async getColors(): Promise<any> {
    const auth = await this.authorize()
    const calendar = google.calendar({ version: 'v3', auth })
    const response = await calendar.colors.get()
    return response.data
  }

  async getEvents(calendarId: string, startDate: string, endDate: string): Promise<any[]> {
    const auth = await this.authorize()
    const calendar = google.calendar({ version: 'v3', auth })

    const response = await calendar.events.list({
      calendarId,
      timeMin: new Date(startDate).toISOString(),
      timeMax: new Date(endDate).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250
    } as any)

    const items = response.data.items || []
    if (items.length > 0) {
      console.log('[getEvents] 第一個事件的完整結構:', JSON.stringify(items[0], null, 2))
    }
    return items
  }

  async createEvent(calendarId: string, event: any): Promise<any> {
    const auth = await this.authorize()
    const calendar = google.calendar({ version: 'v3', auth })

    const response = await calendar.events.insert({
      calendarId,
      requestBody: event
    } as any)

    return response.data
  }

  async updateEvent(calendarId: string, eventId: string, event: any): Promise<any> {
    const auth = await this.authorize()
    const calendar = google.calendar({ version: 'v3', auth })

    const response = await calendar.events.update({
      calendarId,
      eventId,
      requestBody: event
    } as any)

    return response.data
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    const auth = await this.authorize()
    const calendar = google.calendar({ version: 'v3', auth })

    await calendar.events.delete({
      calendarId,
      eventId
    } as any)
  }

  // 將事件從一個日曆移動到另一個日曆
  async moveEvent(fromCalendarId: string, eventId: string, toCalendarId: string): Promise<any> {
    const auth = await this.authorize()
    const calendar = google.calendar({ version: 'v3', auth })

    const response = await calendar.events.move({
      calendarId: fromCalendarId,
      eventId,
      destination: toCalendarId
    } as any)

    return response.data
  }

  isAuthenticated(): boolean {
    return fs.existsSync(this.tokenPath)
  }

  clearAuth(): void {
    if (fs.existsSync(this.tokenPath)) {
      fs.unlinkSync(this.tokenPath)
    }
  }
}
