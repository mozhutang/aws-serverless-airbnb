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

        // Create App Client for the user pool
        const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
            userPool,
            generateSecret: false,
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
                'cognito-idp:AdminAddUserToGroup',
                'cognito-idp:AdminSetUserPassword'
            ],
            resources: [userPool.userPoolArn]
        }));

        usersTable.grantReadWriteData(createUserFunction);

        // Create Lambda function for user login
        const loginUserFunction = new lambda.Function(this, 'LoginUserFunction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'user/login.handler',
            code: lambda.Code.fromAsset('src/user'),
            environment: {
                CLIENT_ID: userPoolClient.userPoolClientId,
            },
        });

        loginUserFunction.addToRolePolicy(new PolicyStatement({
            actions: [
                'cognito-idp:InitiateAuth',
            ],
            resources: [userPool.userPoolArn],
        }));

        // Create Lambda function for updating user
        const updateUserFunction = new lambda.Function(this, 'UpdateUserFunction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'user/update.handler',
            code: lambda.Code.fromAsset('src/user'),
            environment: {
                USERS_TABLE_NAME: usersTable.tableName,
                USER_POOL_ID: userPool.userPoolId,
            },
        });

        updateUserFunction.addToRolePolicy(new PolicyStatement({
            actions: ['cognito-idp:GetUser'],
            resources: [userPool.userPoolArn],
        }));

        usersTable.grantReadWriteData(updateUserFunction);

        // Create Lambda function for getting user information
        const getUserFunction = new lambda.Function(this, 'GetUserFunction', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'user/get.handler',
            code: lambda.Code.fromAsset('src/user'),
            environment: {
                USERS_TABLE_NAME: usersTable.tableName,
                USER_POOL_ID: userPool.userPoolId,
            },
        });

        getUserFunction.addToRolePolicy(new PolicyStatement({
            actions: ['cognito-idp:GetUser'],
            resources: [userPool.userPoolArn],
        }));

        // Create API Gateway
        const api = new apigateway.RestApi(this, 'UserApi', {
            restApiName: 'User Service',
        });

        const users = api.root.addResource('users');
        const createUser = users.addResource('create');
        const createUserIntegration = new apigateway.LambdaIntegration(createUserFunction);
        createUser.addMethod('POST', createUserIntegration);

        const loginUser = users.addResource('login');
        const loginUserIntegration = new apigateway.LambdaIntegration(loginUserFunction);
        loginUser.addMethod('POST', loginUserIntegration);

        const updateUser = users.addResource('update').addResource('{userId}');
        const updateUserIntegration = new apigateway.LambdaIntegration(updateUserFunction);
        updateUser.addMethod('PUT', updateUserIntegration);

        const getUser = users.addResource('get').addResource('{userId}');
        const getUserIntegration = new apigateway.LambdaIntegration(getUserFunction);
        getUser.addMethod('GET', getUserIntegration);

        new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
        new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    }
}
