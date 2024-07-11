import { APIGatewayProxyHandler } from 'aws-lambda';
import { CognitoIdentityProviderClient, GetUserCommand, AdminDisableUserCommand } from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({});

const USER_POOL_ID = process.env.USER_POOL_ID || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    const token = event.headers.Authorization || '';
    const { userId } = event.pathParameters || {};

    if (!token || !userId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Missing token or userId' }),
        };
    }

    try {
        // Verify token by calling Cognito
        const getUserCommand = new GetUserCommand({ AccessToken: token });
        const userResponse = await cognitoClient.send(getUserCommand);
        const tokenUserId = userResponse.UserAttributes?.find(attr => attr.Name === 'sub')?.Value;

        if (tokenUserId === userId) {
            // Deactivate user if token is valid and userId matches
            const disableUserCommand = new AdminDisableUserCommand({
                UserPoolId: USER_POOL_ID,
                Username: userId,
            });
            await cognitoClient.send(disableUserCommand);

            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'User deactivated successfully' }),
            };
        } else {
            return {
                statusCode: 403,
                body: JSON.stringify({ message: 'Forbidden: userId does not match token' }),
            };
        }
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Could not deactivate user', error: error.message }),
        };
    }
};
