import { redirect } from 'next/navigation'

export default function TelegramSettingsRedirect() {
  redirect('/settings/keys')
}
