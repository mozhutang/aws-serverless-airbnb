import { APIGatewayProxyHandler } from 'aws-lambda';
import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const cognitoClient = new CognitoIdentityProviderClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const USERS_TABLE = process.env.USERS_TABLE_NAME || '';

interface UserInfo {
    profile: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    personalInformation?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export const handler: APIGatewayProxyHandler = async (event) => {
    const token = event.headers.Authorization || '';
    const { userId } = event.pathParameters || {};

    if (!userId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Missing userId' }),
        };
    }

    try {
        let userInfo: UserInfo = { profile: {}, personalInformation: {} };

        if (token) {
            // Verify token by calling Cognito
            const getUserCommand = new GetUserCommand({ AccessToken: token });
            const userResponse = await cognitoClient.send(getUserCommand);
            const tokenUserId = userResponse.UserAttributes?.find(attr => attr.Name === 'sub')?.Value;

            if (tokenUserId === userId) {
                // Fetch full user info if token is valid and userId matches
                const getParams = {
                    TableName: USERS_TABLE,
                    Key: { userId },
                    ProjectionExpression: 'profile, personalInformation',
                };
                const { Item } = await docClient.send(new GetCommand(getParams));
                userInfo = {
                    profile: Item?.profile || {},
                    personalInformation: Item?.personalInformation || {}
                };
            } else {
                // Fetch only profile if userId does not match
                const getParams = {
                    TableName: USERS_TABLE,
                    Key: { userId },
                    ProjectionExpression: 'profile',
                };
                const { Item } = await docClient.send(new GetCommand(getParams));
                userInfo.profile = Item?.profile || {};
                delete userInfo.personalInformation;
            }
        } else {
            // Fetch only profile if no token
            const getParams = {
                TableName: USERS_TABLE,
                Key: { userId },
                ProjectionExpression: 'profile',
            };
            const { Item } = await docClient.send(new GetCommand(getParams));
            userInfo.profile = Item?.profile || {};
            delete userInfo.personalInformation;
        }

        return {
            statusCode: 200,
            body: JSON.stringify(userInfo),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Could not fetch user information', error: error.message }),
        };
    }
};
