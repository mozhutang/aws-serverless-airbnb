import { APIGatewayProxyHandler } from 'aws-lambda';
import { CognitoIdentityProviderClient, InitiateAuthCommand, InitiateAuthCommandInput } from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({});

const CLIENT_ID = process.env.CLIENT_ID || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    const { email, password } = JSON.parse(event.body || '{}');

    try {
        const params: InitiateAuthCommandInput = {
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: CLIENT_ID,
            AuthParameters: {
                USERNAME: email,
                PASSWORD: password,
            },
        };

        const authCommand = new InitiateAuthCommand(params);
        const authResponse = await cognitoClient.send(authCommand);

        const idToken = authResponse.AuthenticationResult?.IdToken;
        if (!idToken) {
            throw new Error('Failed to authenticate user');
        }

        // Decode the idToken to extract userId
        const decodedToken = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());
        const userId = decodedToken.sub;

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Login successful',
                token: idToken,
                userId: userId,
            }),
        };
    } catch (error) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Login failed', error: error.message }),
        };
    }
};
