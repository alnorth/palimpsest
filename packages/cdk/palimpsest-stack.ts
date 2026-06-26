import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment'
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
      code: lambda.Code.fromAsset(path.join(__dirname, '../backend/dist')),
      handler: 'handler.handler',
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        TABLE_NAME: table.tableName,
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

    // Web app hosting
    const bucket = new s3.Bucket(this, 'WebBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    const distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    })

    new s3deploy.BucketDeployment(this, 'WebDeploy', {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '../web/dist')),
        s3deploy.Source.jsonData('config.json', { apiUrl: api.apiEndpoint }),
      ],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
    })

    new cdk.CfnOutput(this, 'WebUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'Palimpsest web app URL',
    })
  }
}
