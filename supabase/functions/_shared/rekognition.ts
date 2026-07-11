// Minimal AWS SigV4 caller for Rekognition (ap-south-1).
// Secrets required in Edge Function secrets: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.
const REGION = 'ap-south-1'
const SERVICE = 'rekognition'
const enc = new TextEncoder()

async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(msg))
}
async function sha256hex(msg: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(msg))
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
}
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')

export async function rekognition(action: string, payload: unknown): Promise<any> {
  const akid = Deno.env.get('AWS_ACCESS_KEY_ID')
  const secret = Deno.env.get('AWS_SECRET_ACCESS_KEY')
  if (!akid || !secret) throw new Error('AWS credentials not configured')

  const host = `${SERVICE}.${REGION}.amazonaws.com`
  const body = JSON.stringify(payload)
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')  // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8)
  const target = `RekognitionService.${action}`

  const canonicalHeaders =
    `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:${target}\n`
  const signedHeaders = 'content-type;host;x-amz-date;x-amz-target'
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, await sha256hex(body)].join('\n')

  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256hex(canonicalRequest)].join('\n')

  const kDate = await hmac(enc.encode('AWS4' + secret), dateStamp)
  const kRegion = await hmac(kDate, REGION)
  const kService = await hmac(kRegion, SERVICE)
  const kSigning = await hmac(kService, 'aws4_request')
  const signature = hex(await hmac(kSigning, stringToSign))

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${akid}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const res = await fetch(`https://${host}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': target,
      'X-Amz-Date': amzDate,
      'Authorization': authorization,
      'Host': host,
    },
    body,
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(out.message ?? out.__type ?? `Rekognition ${action} failed (${res.status})`)
  return out
}
