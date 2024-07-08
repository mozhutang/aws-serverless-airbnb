import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export class UserStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const usersTable = new dynamodb.Table(this, 'UsersTable', {
            partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        const createUserFunction = new lambda.Function(this, 'CreateUserFunction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'src/user/create.handler',
            code: lambda.Code.fromAsset('src/user'),
            environment: {
                USERS_TABLE_NAME: usersTable.tableName,
            },
        });

        usersTable.grantReadWriteData(createUserFunction);

        const api = new apigateway.RestApi(this, 'UserApi', {
            restApiName: 'User Service',
        });

        const users = api.root.addResource('users');
        const createUserIntegration = new apigateway.LambdaIntegration(createUserFunction);
        users.addMethod('POST', createUserIntegration);

        const userPool = new cognito.UserPool(this, 'UserPool', {
            selfSignUpEnabled: true,
            signInAliases: { email: true },
        });

        new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    }
}
