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

  private getAuth(): OAuth2Client {
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
      'http://localhost'
    )

    const token = this.loadToken()
    if (token) {
      auth.setCredentials(token)
    }

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

  getAuthUrl(): string {
    const auth = this.getAuth()
    return auth.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES
    })
  }

  async handleAuthCallback(code: string): Promise<void> {
    const auth = this.getAuth()
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

  isAuthenticated(): boolean {
    return fs.existsSync(this.tokenPath)
  }

  clearAuth(): void {
    if (fs.existsSync(this.tokenPath)) {
      fs.unlinkSync(this.tokenPath)
    }
  }
}
