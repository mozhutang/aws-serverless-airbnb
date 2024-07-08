import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

export class UserStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Create DynamoDB table
        const usersTable = new dynamodb.Table(this, 'UsersTable', {
            partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Create Cognito user pool
        const userPool = new cognito.UserPool(this, 'UserPool', {
            selfSignUpEnabled: true,
            signInAliases: { email: true },
        });

        const guestGroup = new cognito.CfnUserPoolGroup(this, 'GuestGroup', {
            userPoolId: userPool.userPoolId,
            groupName: 'guest',
        });

        const hostGroup = new cognito.CfnUserPoolGroup(this, 'HostGroup', {
            userPoolId: userPool.userPoolId,
            groupName: 'host',
        });

        // Create Lambda function for creating user
        const createUserFunction = new lambda.Function(this, 'CreateUserFunction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'user/create.handler',
            code: lambda.Code.fromAsset('src/user'),
            environment: {
                USERS_TABLE_NAME: usersTable.tableName,
                USER_POOL_ID: userPool.userPoolId,
                GUEST_GROUP: guestGroup.groupName || 'guest',
                HOST_GROUP: hostGroup.groupName || 'host',
            },
        });

        // Grant necessary permissions to the Lambda function
        createUserFunction.addToRolePolicy(new PolicyStatement({
            actions: [
                'cognito-idp:AdminCreateUser',
                'cognito-idp:AdminAddUserToGroup'
            ],
            resources: [userPool.userPoolArn]
        }));

        usersTable.grantReadWriteData(createUserFunction);

        // Create API Gateway
        const api = new apigateway.RestApi(this, 'UserApi', {
            restApiName: 'User Service',
        });

        const users = api.root.addResource('users');
        const createUser = users.addResource('create');
        const createUserIntegration = new apigateway.LambdaIntegration(createUserFunction);
        createUser.addMethod('POST', createUserIntegration);

        new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    }
}
