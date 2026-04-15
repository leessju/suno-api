import { betterAuth } from 'better-auth'
import { getDb } from './music-gen/db'

// 기존 getDb() 재사용 — mkdirSync + migration 포함된 싱글톤
export const auth = betterAuth({
  database: {
    type: 'sqlite',
    db: getDb(),
  },
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7일
    updateAge: 60 * 60 * 24,      // 1일마다 갱신
  },
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
