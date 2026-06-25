#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { PalimpsestStack } from './palimpsest-stack.js'

const app = new cdk.App()
new PalimpsestStack(app, 'PalimpsestStack', {
  env: {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'] ?? 'eu-west-2',
  },
})
