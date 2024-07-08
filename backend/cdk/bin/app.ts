import * as cdk from 'aws-cdk-lib';
import { UserStack } from '../lib/user-stack';

const app = new cdk.App();
new UserStack(app, 'UserStack', {
    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
