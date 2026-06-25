import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { handleSync } from './handleSync.js'
import type { PalimpsestEvent } from 'palimpsest'

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const secretsClient = new SecretsManagerClient({})
const TABLE_NAME = process.env['TABLE_NAME'] ?? ''
const SECRET_NAME = process.env['SECRET_NAME'] ?? 'palimpsest'

// Cached at cold start — avoids a Secrets Manager call on every request
let cachedAuthToken: string | undefined

async function getAuthToken(): Promise<string> {
  if (cachedAuthToken !== undefined) return cachedAuthToken
  const result = await secretsClient.send(new GetSecretValueCommand({ SecretId: SECRET_NAME }))
  const secret = JSON.parse(result.SecretString ?? '{}') as Record<string, unknown>
  cachedAuthToken = String(secret['auth-token'] ?? '')
  return cachedAuthToken
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Content-Type': 'application/json',
}

export const handler: APIGatewayProxyHandlerV2 = async event => {
  if (event.requestContext.http.method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }

  if (event.requestContext.http.method === 'POST' && event.requestContext.http.path === '/sync') {
    let body: { clientSeq?: unknown; events?: unknown }
    try {
      body = JSON.parse(event.body ?? '{}')
    } catch {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) }
    }

    const result = await handleSync({
      client: dynamoClient,
      tableName: TABLE_NAME,
      validToken: await getAuthToken(),
      authHeader: event.headers['authorization'] ?? event.headers['Authorization'],
      clientSeq: typeof body.clientSeq === 'number' ? body.clientSeq : 0,
      events: Array.isArray(body.events) ? (body.events as PalimpsestEvent[]) : [],
    })

    return { ...result, headers: { ...CORS_HEADERS, ...result.headers } }
  }

  return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not found' }) }
}
