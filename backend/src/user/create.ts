import { APIGatewayProxyHandler } from 'aws-lambda';
import {
    CognitoIdentityProviderClient,
    AdminCreateUserCommand,
    AdminAddUserToGroupCommand,
    AdminSetUserPasswordCommand
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const cognitoClient = new CognitoIdentityProviderClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const USERS_TABLE = process.env.USERS_TABLE_NAME || '';
const USER_POOL_ID = process.env.USER_POOL_ID || '';
const GUEST_GROUP = process.env.GUEST_GROUP || 'guest';
const HOST_GROUP = process.env.HOST_GROUP || 'host';

export const handler: APIGatewayProxyHandler = async (event) => {
    const { email, userType, password } = JSON.parse(event.body || '{}');

    try {
        // Create user in Cognito
        const createUserParams = {
            UserPoolId: USER_POOL_ID,
            Username: email,
            UserAttributes: [
                {
                    Name: 'email',
                    Value: email,
                },
                {
                    Name: 'email_verified',
                    Value: 'true',
                },
            ],
        };
        const createUserResponse = await cognitoClient.send(new AdminCreateUserCommand(createUserParams));
        const userId = createUserResponse.User?.Username;

        const setPasswordParams = {
            UserPoolId: USER_POOL_ID,
            Username: email,
            Password: password,
            Permanent: true,
        };
        await cognitoClient.send(new AdminSetUserPasswordCommand(setPasswordParams));

        if (!userId) {
            throw new Error('Failed to create user in Cognito');
        }

        // Add user to Cognito groups
        const addUserToGroupParamsGuest = {
            UserPoolId: USER_POOL_ID,
            Username: userId,
            GroupName: GUEST_GROUP,
        };
        await cognitoClient.send(new AdminAddUserToGroupCommand(addUserToGroupParamsGuest));

        if (userType === 'host') {
            const addUserToGroupParamsHost = {
                UserPoolId: USER_POOL_ID,
                Username: userId,
                GroupName: HOST_GROUP,
            };
            await cognitoClient.send(new AdminAddUserToGroupCommand(addUserToGroupParamsHost));
        }

        // Save user information to DynamoDB
        const params = {
            TableName: USERS_TABLE,
            Item: {
                userId: userId,
                email: email,
            },
        };

        await docClient.send(new PutCommand(params));

        return {
            statusCode: 201,
            body: JSON.stringify({ message: 'User created successfully', userId }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Could not create user', error: error.message }),
        };
    }
};
