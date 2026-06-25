import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { Duration } from 'aws-cdk-lib'
import type { Construct } from 'constructs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export class PalimpsestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const table = new dynamodb.TableV2(this, 'Events', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'sk', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    const secret = secretsmanager.Secret.fromSecretNameV2(this, 'PalimpsestSecret', 'palimpsest')

    const handlerFn = new lambda.Function(this, 'Handler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      code: lambda.Code.fromAsset(path.join(__dirname, '../dist')),
      handler: 'handler.handler',
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        TABLE_NAME: table.tableName,
        // Secret name only — handler fetches the value at runtime
        SECRET_NAME: 'palimpsest',
      },
    })

    table.grantReadWriteData(handlerFn)
    secret.grantRead(handlerFn)

    const api = new apigatewayv2.HttpApi(this, 'Api', {
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigatewayv2.CorsHttpMethod.POST, apigatewayv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ['Authorization', 'Content-Type'],
      },
    })

    const integration = new integrations.HttpLambdaIntegration('SyncIntegration', handlerFn)
    api.addRoutes({
      path: '/sync',
      methods: [apigatewayv2.HttpMethod.POST],
      integration,
    })

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.apiEndpoint,
      description: 'Palimpsest sync API endpoint',
    })
    new cdk.CfnOutput(this, 'TableName', {
      value: table.tableName,
    })
  }
}
